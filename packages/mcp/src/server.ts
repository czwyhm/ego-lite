import { redactTelemetry, redactUrl } from './redaction.js';
import type {
  DataProvider,
  DastRequest,
  DastPolicy,
  JsonRpcRequest,
  JsonRpcResponse,
  McpServerOptions,
  ReportQuery,
} from './types.js';

const JSON_RPC_INVALID_REQUEST = -32600;
const JSON_RPC_METHOD_NOT_FOUND = -32601;
const JSON_RPC_INVALID_PARAMS = -32602;
const JSON_RPC_INTERNAL_ERROR = -32603;
const DAST_CONFIRMATION = 'I_CONFIRM_DAST';

type Tool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

function textResult(value: unknown, isError = false): { content: [{ type: 'text'; text: string }]; isError?: true } {
  return {
    content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
    ...(isError ? { isError: true as const } : {}),
  };
}

function stringParam(params: Record<string, unknown>, name: string): string {
  const value = params[name];
  if (typeof value !== 'string' || !value.trim()) throw new McpInputError(`${name} must be a non-empty string`);
  return value;
}

function objectParam(params: Record<string, unknown>, name: string): Record<string, unknown> {
  const value = params[name];
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new McpInputError(`${name} must be an object`);
  return value as Record<string, unknown>;
}

function numberParam(params: Record<string, unknown>, name: string, fallback: number): number {
  const value = params[name];
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new McpInputError(`${name} must be a finite number`);
  return value;
}

export class McpInputError extends Error {}

export class McpServer {
  readonly provider: DataProvider;
  readonly enableDast: boolean;
  readonly dastPolicy: Required<Pick<DastPolicy, 'requireConfirmation' | 'confirmationPhrase'>> & DastPolicy;
  readonly serverName: string;
  readonly serverVersion: string;

  constructor(options: McpServerOptions) {
    this.provider = options.provider;
    this.enableDast = options.enableDast === true;
    this.dastPolicy = {
      requireConfirmation: true,
      confirmationPhrase: DAST_CONFIRMATION,
      ...options.dastPolicy,
    };
    this.serverName = options.serverName ?? 'ego-lite-mcp';
    this.serverVersion = options.serverVersion ?? '0.1.0';
  }

  tools(): Tool[] {
    const tools: Tool[] = [
      {
        name: 'ego_targets_list',
        description: 'List browser targets known to the connected Ego Lite provider.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      },
      {
        name: 'ego_browser_observation',
        description: 'Retrieve the latest or selected read-only browser observation for a target.',
        inputSchema: {
          type: 'object', required: ['targetId'], properties: {
            targetId: { type: 'string' }, observationId: { type: 'string' },
          }, additionalProperties: false,
        },
      },
      {
        name: 'ego_telemetry_get',
        description: 'Retrieve redacted browser request, response, navigation, and console metadata.',
        inputSchema: {
          type: 'object', required: ['targetId'], properties: {
            targetId: { type: 'string' }, since: { type: 'string' }, limit: { type: 'number', maximum: 1000 },
          }, additionalProperties: false,
        },
      },
      {
        name: 'ego_page_analyze',
        description: 'Return the provider page analysis for a target or observation.',
        inputSchema: {
          type: 'object', required: ['targetId'], properties: {
            targetId: { type: 'string' }, observationId: { type: 'string' },
          }, additionalProperties: false,
        },
      },
      {
        name: 'ego_findings_list',
        description: 'List read-only security findings, optionally filtered by target or severity.',
        inputSchema: {
          type: 'object', properties: {
            targetId: { type: 'string' }, severity: { type: 'string' }, limit: { type: 'number', maximum: 1000 },
          }, additionalProperties: false,
        },
      },
      {
        name: 'ego_report_export',
        description: 'Export a read-only findings report as JSON or Markdown.',
        inputSchema: {
          type: 'object', properties: {
            targetId: { type: 'string' }, format: { enum: ['json', 'markdown'] }, includeEvidence: { type: 'boolean' },
          }, additionalProperties: false,
        },
      },
      {
        name: 'ego_host_connections',
        description: 'Read best-effort local Windows/Linux connection metadata without packet payloads.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      },
    ];
    if (this.enableDast) {
      tools.push({
        name: 'ego_dast_run',
        description: 'Run an active DAST check only for an allowlisted test/staging target after explicit confirmation.',
        inputSchema: {
          type: 'object', required: ['targetId', 'policyAcknowledged', 'confirmation', 'policy'], properties: {
            targetId: { type: 'string' }, policyAcknowledged: { const: true }, confirmation: { const: this.dastPolicy.confirmationPhrase },
            policy: {
              type: 'object', required: ['allowlisted', 'environment', 'maxRequests'], properties: {
                allowlisted: { const: true }, environment: { type: 'string' }, maxRequests: { type: 'number', minimum: 1 }, rateLimitPerSecond: { type: 'number', minimum: 1 },
              }, additionalProperties: false,
            }, checks: { type: 'array', items: { type: 'string' } },
          }, additionalProperties: false,
        },
      });
    }
    return tools;
  }

  async handle(request: JsonRpcRequest): Promise<JsonRpcResponse | null> {
    const id = request.id ?? null;
    if (request.jsonrpc !== '2.0' || typeof request.method !== 'string') {
      return this.error(id, JSON_RPC_INVALID_REQUEST, 'Invalid JSON-RPC request');
    }
    // MCP notifications intentionally do not receive a response.
    const isNotification = request.id === undefined;
    try {
      let result: unknown;
      switch (request.method) {
        case 'initialize':
          result = {
            protocolVersion: '2025-03-26',
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: this.serverName, version: this.serverVersion },
          };
          break;
        case 'notifications/initialized':
        case 'ping':
          result = {};
          break;
        case 'tools/list':
          result = { tools: this.tools() };
          break;
        case 'tools/call':
          result = await this.callTool(request.params ?? {});
          break;
        default:
          if (isNotification) return null;
          return this.error(id, JSON_RPC_METHOD_NOT_FOUND, `Method not found: ${request.method}`);
      }
      return isNotification ? null : { jsonrpc: '2.0', id, result };
    } catch (error) {
      if (isNotification) return null;
      if (error instanceof McpInputError) return this.error(id, JSON_RPC_INVALID_PARAMS, error.message);
      return this.error(id, JSON_RPC_INTERNAL_ERROR, error instanceof Error ? error.message : 'Internal error');
    }
  }

  private async callTool(params: Record<string, unknown>): Promise<unknown> {
    const name = stringParam(params, 'name');
    const argumentsValue = params.arguments;
    const args = argumentsValue === undefined ? {} : objectParam({ arguments: argumentsValue }, 'arguments');
    try {
      switch (name) {
        case 'ego_targets_list':
          return textResult(await this.provider.listTargets());
        case 'ego_browser_observation': {
          const result = await this.provider.getObservation({ targetId: stringParam(args, 'targetId'), observationId: args.observationId as string | undefined });
          if (!result) return textResult({ error: 'Observation not found' }, true);
          return textResult({ ...result, url: redactUrl(result.url) });
        }
        case 'ego_telemetry_get': {
          const events = await this.provider.getTelemetry({ targetId: stringParam(args, 'targetId'), since: args.since as string | undefined, limit: numberParam(args, 'limit', 100) });
          return textResult(events.map((event) => redactTelemetry(event as unknown as Record<string, unknown>)));
        }
        case 'ego_page_analyze': {
          const result = await this.provider.analyzePage({ targetId: stringParam(args, 'targetId'), observationId: args.observationId as string | undefined });
          if (!result) return textResult({ error: 'Page analysis not found' }, true);
          return textResult({ ...result, url: redactUrl(result.url) });
        }
        case 'ego_findings_list':
          return textResult(await this.provider.listFindings({ targetId: args.targetId as string | undefined, severity: args.severity as string | undefined, limit: numberParam(args, 'limit', 100) }));
        case 'ego_report_export': {
          const query: ReportQuery = { targetId: args.targetId as string | undefined, format: (args.format as 'json' | 'markdown' | undefined) ?? 'json', includeEvidence: args.includeEvidence === true };
          return textResult(await this.provider.exportReport(query));
        }
        case 'ego_host_connections':
          return textResult(this.provider.getHostConnections ? await this.provider.getHostConnections() : []);
        case 'ego_dast_run':
          return textResult(await this.runDast(args));
        default:
          return textResult({ error: `Unknown tool: ${name}` }, true);
      }
    } catch (error) {
      return textResult({ error: error instanceof Error ? error.message : 'Tool failed' }, true);
    }
  }

  private async runDast(args: Record<string, unknown>): Promise<unknown> {
    if (!this.enableDast) throw new McpInputError('Active DAST is disabled. Start the service with an explicit enable flag.');
    if (!this.provider.runDast) throw new McpInputError('The connected provider does not implement active DAST.');
    if (args.policyAcknowledged !== true) throw new McpInputError('policyAcknowledged must be true for active DAST.');
    const confirmation = args.confirmation;
    if (this.dastPolicy.requireConfirmation && confirmation !== this.dastPolicy.confirmationPhrase) {
      throw new McpInputError(`confirmation must equal ${this.dastPolicy.confirmationPhrase}.`);
    }
    const targetId = stringParam(args, 'targetId');
    if (this.dastPolicy.allowedTargetIds && !this.dastPolicy.allowedTargetIds.includes(targetId)) {
      throw new McpInputError('Target is not in the DAST allowlist.');
    }
    const rawPolicy = objectParam(args, 'policy');
    if (rawPolicy.allowlisted !== true) throw new McpInputError('The request policy must explicitly mark the target allowlisted.');
    const environment = stringParam(rawPolicy, 'environment');
    const allowedEnvironments = this.dastPolicy.allowedEnvironments ?? ['test', 'staging'];
    if (!allowedEnvironments.includes(environment)) throw new McpInputError('DAST is restricted to an allowed test/staging environment.');
    const maxRequests = numberParam(rawPolicy, 'maxRequests', 0);
    if (maxRequests < 1 || (this.dastPolicy.maxRequests !== undefined && maxRequests > this.dastPolicy.maxRequests)) {
      throw new McpInputError('maxRequests exceeds the configured DAST policy.');
    }
    const request: DastRequest = {
      targetId,
      policyAcknowledged: true,
      confirmation: confirmation as string,
      policy: {
        allowlisted: true,
        environment,
        maxRequests,
        rateLimitPerSecond: rawPolicy.rateLimitPerSecond as number | undefined,
      },
      checks: Array.isArray(args.checks) ? args.checks.filter((item): item is string => typeof item === 'string') : undefined,
    };
    return this.provider.runDast(request);
  }

  private error(id: string | number | null, code: number, message: string): JsonRpcResponse {
    return { jsonrpc: '2.0', id, error: { code, message } };
  }
}
