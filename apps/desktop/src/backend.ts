export interface DesktopTarget {
  id: string;
  name: string;
  url: string;
  environment?: string;
  status?: 'connected' | 'idle' | 'offline' | string;
}

export interface DesktopTrafficEvent {
  id: string;
  timestamp: string;
  targetId: string;
  method: string;
  url: string;
  status?: number;
  durationMs?: number;
  type?: string;
}

export interface DesktopFinding {
  id: string;
  targetId: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info' | string;
  title: string;
  description: string;
  status?: string;
  createdAt: string;
}

export interface DesktopReport {
  id: string;
  targetId?: string;
  name: string;
  format: 'json' | 'markdown' | string;
  generatedAt: string;
  sizeBytes?: number;
}

export interface DesktopHostConnection {
  platform: string;
  protocol: string;
  localAddress?: string;
  localPort?: number;
  remoteAddress?: string;
  remotePort?: number;
  state?: string;
  pid?: number;
  processName?: string;
  source: string;
}

export interface DesktopBackend {
  listTargets(): Promise<readonly DesktopTarget[]> | readonly DesktopTarget[];
  listTraffic(): Promise<readonly DesktopTrafficEvent[]> | readonly DesktopTrafficEvent[];
  listFindings(): Promise<readonly DesktopFinding[]> | readonly DesktopFinding[];
  listReports(): Promise<readonly DesktopReport[]> | readonly DesktopReport[];
  listHostConnections(): Promise<readonly DesktopHostConnection[]> | readonly DesktopHostConnection[];
}

/**
 * The parent application can replace this adapter with a security-core/MCP
 * bridge. Keeping the Electron process on this narrow read-only interface
 * prevents renderer code from receiving Node or browser handles.
 */
export function createDesktopBackend(): DesktopBackend {
  const provider = new PlaywrightDataProvider({
    targets: configuredTargets(),
    storePath: process.env.EGO_SECURITY_DB_PATH || ':memory:',
  });
  return {
    listTargets: () => provider.listTargets().map((target) => ({
      id: target.id,
      name: target.name,
      url: target.url,
      environment: target.environment,
      status: 'idle',
    })),
    listTraffic: () => provider.listTargets().flatMap((target) => provider.getTelemetry({ targetId: target.id }).map((event) => ({
      id: event.id,
      timestamp: event.timestamp,
      targetId: event.targetId,
      method: event.method ?? 'GET',
      url: event.url ?? '',
      status: event.status,
      durationMs: event.durationMs,
      type: event.type,
    }))),
    listFindings: () => provider.listFindings({}),
    listReports: () => [],
    listHostConnections: () => provider.getHostConnections(),
  };
}

function configuredTargets(): DesktopTarget[] {
  const raw = process.env.EGO_SECURITY_TARGETS_JSON;
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is DesktopTarget => (
      item && typeof item === 'object' &&
      typeof item.id === 'string' &&
      typeof item.name === 'string' &&
      typeof item.url === 'string'
    ));
  } catch {
    return [];
  }
}
import { PlaywrightDataProvider } from '@ego-lite/mcp';
