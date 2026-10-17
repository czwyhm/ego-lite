/**
 * The parent application supplies an implementation of this interface. Keeping
 * the MCP transport independent of the browser/security packages lets the
 * parent wire its existing security-core stores without making this package
 * import a private path.
 */
export interface DataProvider {
  listTargets(): Promise<readonly Target[]> | readonly Target[];
  getObservation(input: ObservationQuery): Promise<BrowserObservation | null> | BrowserObservation | null;
  getTelemetry(input: TelemetryQuery): Promise<readonly TelemetryEvent[]> | readonly TelemetryEvent[];
  analyzePage(input: PageAnalysisQuery): Promise<PageAnalysis | null> | PageAnalysis | null;
  listFindings(input: FindingsQuery): Promise<readonly Finding[]> | readonly Finding[];
  exportReport(input: ReportQuery): Promise<ReportExport> | ReportExport;
  getHostConnections?(): Promise<readonly HostConnection[]> | readonly HostConnection[];
  runDast?(input: DastRequest): Promise<DastResult> | DastResult;
}

export interface Target {
  id: string;
  name: string;
  url: string;
  environment?: 'development' | 'test' | 'staging' | 'production' | string;
  tags?: readonly string[];
  authorized?: boolean;
  lastSeenAt?: string;
}

export interface ObservationQuery {
  targetId: string;
  observationId?: string;
}

export interface BrowserObservation {
  id: string;
  targetId: string;
  capturedAt: string;
  url: string;
  title?: string;
  snapshot?: string;
  screenshotDataUrl?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface TelemetryQuery {
  targetId: string;
  since?: string;
  limit?: number;
}

export interface TelemetryEvent {
  id: string;
  targetId: string;
  timestamp: string;
  type: 'request' | 'response' | 'navigation' | 'console' | string;
  method?: string;
  url?: string;
  status?: number;
  durationMs?: number;
  host?: string;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface HostConnection {
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

export interface PageAnalysisQuery {
  targetId: string;
  observationId?: string;
}

export interface PageAnalysis {
  targetId: string;
  analyzedAt: string;
  url: string;
  title?: string;
  summary: string;
  technologies?: readonly string[];
  links?: readonly string[];
  forms?: readonly PageForm[];
  findings?: readonly Finding[];
}

export interface PageForm {
  method?: string;
  action?: string;
  fields: readonly string[];
}

export interface FindingsQuery {
  targetId?: string;
  severity?: 'critical' | 'high' | 'medium' | 'low' | 'info' | string;
  limit?: number;
}

export interface Finding {
  id: string;
  targetId: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info' | string;
  title: string;
  description: string;
  evidence?: string;
  location?: string;
  createdAt: string;
  status?: 'open' | 'confirmed' | 'accepted' | 'resolved' | string;
}

export interface ReportQuery {
  targetId?: string;
  format?: 'json' | 'markdown';
  includeEvidence?: boolean;
}

export interface ReportExport {
  filename: string;
  format: 'json' | 'markdown' | string;
  generatedAt: string;
  content: string;
}

export interface DastRequest {
  targetId: string;
  /** Must be true for every active scan request. */
  policyAcknowledged: boolean;
  /** Human confirmation phrase, deliberately not inferred from another field. */
  confirmation: string;
  policy: {
    allowlisted: boolean;
    environment: string;
    maxRequests: number;
    rateLimitPerSecond?: number;
  };
  checks?: readonly string[];
}

export interface DastResult {
  targetId: string;
  startedAt: string;
  completedAt: string;
  requestCount: number;
  findings: readonly Finding[];
  auditId: string;
}

export interface McpServerOptions {
  provider: DataProvider;
  /** An explicit true is required; undefined and false keep DAST unavailable. */
  enableDast?: boolean;
  dastPolicy?: DastPolicy;
  serverName?: string;
  serverVersion?: string;
}

export interface DastPolicy {
  allowedTargetIds?: readonly string[];
  allowedEnvironments?: readonly string[];
  maxRequests?: number;
  requireConfirmation?: boolean;
  confirmationPhrase?: string;
}

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}
