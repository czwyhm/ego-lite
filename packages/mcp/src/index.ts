import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PlaywrightDataProvider } from './playwright-provider.js';
import { McpServer } from './server.js';
import type { JsonRpcRequest, Target } from './types.js';

export { EmptyDataProvider, MemoryDataProvider } from './provider.js';
export { SecurityCoreDataProvider } from './core-provider.js';
export { PlaywrightDataProvider } from './playwright-provider.js';
export { McpInputError, McpServer } from './server.js';
export type * from './types.js';

function configuredTargets(): readonly Target[] {
  const raw = process.env.EGO_SECURITY_TARGETS_JSON;
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is Target => (
      item && typeof item === 'object' &&
      typeof item.id === 'string' &&
      typeof item.name === 'string' &&
      typeof item.url === 'string'
    ));
  } catch {
    return [];
  }
}

export function createMcpServer(): McpServer {
  const provider = new PlaywrightDataProvider({
    storePath: process.env.EGO_SECURITY_DB_PATH || ':memory:',
    targets: configuredTargets(),
  });
  return new McpServer({
    provider,
    enableDast: process.env.EGO_MCP_ENABLE_DAST === 'true',
    dastPolicy: {
      allowedTargetIds: process.env.EGO_MCP_DAST_TARGETS?.split(',').map((item) => item.trim()).filter(Boolean),
      allowedEnvironments: process.env.EGO_MCP_DAST_ENVIRONMENTS?.split(',').map((item) => item.trim()).filter(Boolean),
      maxRequests: process.env.EGO_MCP_DAST_MAX_REQUESTS ? Number(process.env.EGO_MCP_DAST_MAX_REQUESTS) : undefined,
    },
  });
}

/** Run MCP's newline-delimited JSON-RPC transport over stdin/stdout. */
export function runStdio(server = createMcpServer()): void {
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  input.on('line', (line) => {
    if (!line.trim()) return;
    void (async () => {
      let response;
      try {
        response = await server.handle(JSON.parse(line) as JsonRpcRequest);
      } catch {
        response = { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } };
      }
      if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
    })();
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) runStdio();
