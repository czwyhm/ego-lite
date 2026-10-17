import {
  analyzePassiveWebSecurity,
  createDastPlan,
  createSecurityStore,
  executeDastPlan,
  collectHostConnections,
  normalizeBrowserRequest,
  redactUrl,
  type DastExecutionReport,
  type NormalizedBrowserRequest,
  type PassiveAnalysisReport,
  type TargetPolicy,
} from "@ego-lite/security-core";
import type {
  BrowserObservation,
  DataProvider,
  DastRequest,
  DastResult,
  Finding,
  FindingsQuery,
  HostConnection,
  PageAnalysis,
  PageAnalysisQuery,
  ReportExport,
  ReportQuery,
  Target,
  TelemetryEvent,
  TelemetryQuery,
} from "./types.js";
import { MemoryDataProvider } from "./provider.js";

type CoreTarget = Target & {
  policy?: TargetPolicy;
};

type CoreProviderOptions = {
  storePath?: string;
  targets?: readonly CoreTarget[];
};

function nowIso(): string {
  return new Date().toISOString();
}

function findingFromCore(targetId: string, finding: {
  id: string;
  severity: string;
  title: string;
  description: string;
  evidence?: string;
}): Finding {
  return {
    id: `${targetId}:${finding.id}`,
    targetId,
    severity: finding.severity,
    title: finding.title,
    description: finding.description,
    evidence: finding.evidence,
    createdAt: nowIso(),
    status: "open",
  };
}

function mcpEventFromNormalized(targetId: string, event: NormalizedBrowserRequest): TelemetryEvent {
  return {
    id: event.requestId ?? `${targetId}:${event.timestamp}:${event.url}`,
    targetId,
    timestamp: new Date(event.timestamp).toISOString(),
    type: "response",
    method: event.method,
    url: event.url,
    status: event.status,
    durationMs: event.durationMs,
    requestHeaders: event.requestHeaders,
    responseHeaders: event.responseHeaders,
    metadata: {
      resourceType: event.resourceType ?? null,
      initiator: event.initiator ?? null,
      requestBodyBytes: event.requestBodyBytes ?? null,
      responseBodyBytes: event.responseBodyBytes ?? null,
    },
  };
}

/**
 * In-process provider that joins the browser adapter, security-core and MCP.
 * Hosts can register targets and feed redacted browser events without exposing
 * browser handles to the MCP transport.
 */
export class SecurityCoreDataProvider extends MemoryDataProvider implements DataProvider {
  private readonly targetMap = new Map<string, CoreTarget>();
  private readonly observationMap = new Map<string, BrowserObservation>();
  private readonly telemetryMap = new Map<string, TelemetryEvent[]>();
  private readonly analysisMap = new Map<string, PageAnalysis>();
  private readonly findingMap = new Map<string, Finding[]>();
  private readonly store;

  constructor(options: CoreProviderOptions = {}) {
    super();
    this.store = createSecurityStore(options.storePath ?? ":memory:");
    for (const target of options.targets ?? []) this.registerTarget(target);
  }

  registerTarget(target: CoreTarget): void {
    this.targetMap.set(target.id, { ...target, url: redactUrl(target.url) ?? target.url });
  }

  addObservation(observation: BrowserObservation): void {
    this.observationMap.set(observation.id, observation);
  }

  addBrowserRequest(targetId: string, input: Parameters<typeof normalizeBrowserRequest>[0]): TelemetryEvent {
    const normalized = normalizeBrowserRequest(input);
    const event = mcpEventFromNormalized(targetId, normalized);
    this.store.saveTelemetry(normalized);
    const events = this.telemetryMap.get(targetId) ?? [];
    events.push(event);
    this.telemetryMap.set(targetId, events.slice(-10_000));
    return event;
  }

  addPageAnalysis(targetId: string, report: PassiveAnalysisReport, metadata: { title?: string } = {}): PageAnalysis {
    const findings = report.findings.map((finding) => findingFromCore(targetId, finding));
    const page: PageAnalysis = {
      targetId,
      analyzedAt: new Date(report.analyzedAt).toISOString(),
      url: report.url,
      title: metadata.title,
      summary: `${report.summary.total} security findings detected`,
      findings,
    };
    this.analysisMap.set(targetId, page);
    this.findingMap.set(targetId, findings);
    this.store.saveReport(report);
    return page;
  }

  override listTargets(): readonly Target[] {
    return [...this.targetMap.values()];
  }

  override async getObservation(input: { targetId: string; observationId?: string }): Promise<BrowserObservation | null> {
    if (input.observationId) return this.observationMap.get(input.observationId) ?? null;
    return [...this.observationMap.values()].reverse().find((item) => item.targetId === input.targetId) ?? null;
  }

  override getTelemetry(input: TelemetryQuery): readonly TelemetryEvent[] {
    return (this.telemetryMap.get(input.targetId) ?? []).filter((event) => !input.since || event.timestamp >= input.since).slice(-(input.limit ?? 100));
  }

  override analyzePage(input: PageAnalysisQuery): PageAnalysis | null {
    return this.analysisMap.get(input.targetId) ?? null;
  }

  override listFindings(input: FindingsQuery): readonly Finding[] {
    const all = input.targetId
      ? this.findingMap.get(input.targetId) ?? []
      : [...this.findingMap.values()].flat();
    return all.filter((finding) => !input.severity || finding.severity === input.severity).slice(0, input.limit ?? 100);
  }

  override getHostConnections(): Promise<readonly HostConnection[]> {
    return collectHostConnections();
  }

  override exportReport(input: ReportQuery): ReportExport {
    const findings = this.listFindings({ targetId: input.targetId });
    const generatedAt = nowIso();
    if (input.format === "markdown") {
      return {
        filename: `ego-report-${generatedAt.replace(/[:.]/g, "-")}.md`,
        format: "markdown",
        generatedAt,
        content: [
          "# Ego Lite security report",
          "",
          `Generated: ${generatedAt}`,
          ...findings.flatMap((finding) => [
            `## ${finding.severity.toUpperCase()}: ${finding.title}`,
            finding.description,
            input.includeEvidence && finding.evidence ? `Evidence: ${finding.evidence}` : "",
            "",
          ]),
        ].join("\n"),
      };
    }
    return {
      filename: `ego-report-${generatedAt.replace(/[:.]/g, "-")}.json`,
      format: "json",
      generatedAt,
      content: JSON.stringify({ generatedAt, targetId: input.targetId ?? null, findings }, null, 2),
    };
  }

  override async runDast(input: DastRequest): Promise<DastResult> {
    const target = this.targetMap.get(input.targetId);
    if (!target) throw new Error("Target is not registered");
    if (target.authorized !== true) throw new Error("Target is not marked authorized");
    if (target.environment !== "test" && target.environment !== "staging") {
      throw new Error("DAST is restricted to test and staging targets");
    }
    const policy = target.policy ?? {
      allowlist: [target.url],
      requireTestOrStaging: true,
      allowProduction: false,
      allowHttp: target.url.startsWith("http://"),
      allowPrivateNetwork: target.tags?.includes("local") === true,
    } satisfies TargetPolicy;
    const plan = createDastPlan(target.url, policy, {
      environment: target.environment,
      confirmedTestOrStaging: input.policyAcknowledged,
      tags: target.tags,
    });
    const report = await executeDastPlan(
      plan,
      {
        async request(request, signal) {
          const response = await fetch(request.url, {
            method: request.method,
            headers: request.headers,
            redirect: "manual",
            signal,
          });
          return {
            status: response.status,
            url: response.url || request.url,
            headers: response.headers,
          };
        },
      },
      {
        maxRequests: Math.min(input.policy.maxRequests, 50),
        requestsPerSecond: Math.min(input.policy.rateLimitPerSecond ?? 1, 2),
        concurrency: 1,
      },
    );
    this.store.saveReport(report);
    return this.dastResult(input.targetId, report);
  }

  close(): void {
    this.store.close();
  }

  private dastResult(targetId: string, report: DastExecutionReport): DastResult {
    const findings = report.results.flatMap((result) =>
      result.report?.findings.map((finding) => findingFromCore(targetId, finding)) ?? [],
    );
    const current = this.findingMap.get(targetId) ?? [];
    this.findingMap.set(targetId, [...current, ...findings]);
    return {
      targetId,
      startedAt: new Date(report.startedAt).toISOString(),
      completedAt: new Date(report.finishedAt).toISOString(),
      requestCount: report.results.length,
      findings,
      auditId: `dast-${report.startedAt}-${targetId}`,
    };
  }
}

export function pageAnalysisFromObservation(
  targetId: string,
  url: string,
  headers: HeadersInit,
  finalUrl = url,
): PageAnalysis {
  const report = analyzePassiveWebSecurity({ url, finalUrl, headers });
  const provider = new SecurityCoreDataProvider();
  return provider.addPageAnalysis(targetId, report);
}
