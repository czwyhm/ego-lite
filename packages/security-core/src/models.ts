/** A value accepted by the header normalizers. */
export type HeaderValue = string | readonly string[] | undefined;
export type HeaderInput =
  | Headers
  | Readonly<Record<string, HeaderValue>>
  | ReadonlyArray<readonly [string, string]>;

export type HttpMethod =
  | "GET"
  | "HEAD"
  | "OPTIONS"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "TRACE"
  | "CONNECT"
  | (string & {});

export interface BrowserRequestTelemetryInput {
  url: string | URL;
  method?: string;
  requestHeaders?: HeaderInput;
  responseHeaders?: HeaderInput;
  status?: number;
  timestamp?: number | Date;
  durationMs?: number;
  resourceType?: string;
  initiator?: string;
  requestId?: string;
  frameId?: string;
  responseUrl?: string | URL;
  /** Optional content length metadata; no body is accepted or persisted. */
  requestBodyBytes?: number;
  responseBodyBytes?: number;
}

export interface NormalizedBrowserRequest {
  timestamp: number;
  url: string;
  method: string;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  status?: number;
  durationMs?: number;
  resourceType?: string;
  initiator?: string;
  requestId?: string;
  frameId?: string;
  responseUrl?: string;
  requestBodyBytes?: number;
  responseBodyBytes?: number;
}

export type SecuritySeverity = "info" | "low" | "medium" | "high";
export type SecurityCategory =
  | "headers"
  | "tls"
  | "redirect"
  | "cookie"
  | "mixed-content"
  | "cors"
  | "exposure";

export interface SecurityFinding {
  id: string;
  category: SecurityCategory;
  severity: SecuritySeverity;
  title: string;
  description: string;
  evidence?: string;
  remediation?: string;
}

export interface RedirectHop {
  url: string | URL;
  status?: number;
  location?: string | URL;
}

export interface TlsMetadata {
  version?: string;
  certificateValid?: boolean;
  certificateExpiresAt?: string | number | Date;
}

export interface PassiveAnalysisInput {
  url: string | URL;
  finalUrl?: string | URL;
  status?: number;
  headers?: HeaderInput;
  redirectChain?: readonly RedirectHop[];
  tls?: TlsMetadata;
  /** URLs observed in the page's resource list; bodies are not required. */
  mixedContentUrls?: readonly (string | URL)[];
  /** Origin sent by a browser when evaluating CORS. */
  requestOrigin?: string;
  /** Whether the request included credentials. */
  requestCredentials?: boolean;
  /** A bounded, caller-supplied sample, never fetched by this package. */
  bodySample?: string;
  now?: number | Date;
}

export interface PassiveAnalysisReport {
  url: string;
  analyzedAt: number;
  findings: SecurityFinding[];
  summary: {
    total: number;
    bySeverity: Record<SecuritySeverity, number>;
  };
}

export type TargetEnvironment =
  | "development"
  | "test"
  | "staging"
  | "production"
  | "unknown";

export interface TargetContext {
  environment?: TargetEnvironment;
  /** Must be true for a DAST run when the policy requires confirmation. */
  confirmedTestOrStaging?: boolean;
  /** Optional exact tags supplied by the deployment system. */
  tags?: readonly string[];
  /** Optional change/request identifier retained in an audit record. */
  approvalId?: string;
}

export type TargetAllowlistEntry =
  | string
  | {
      host: string;
      ports?: readonly number[];
      protocols?: readonly ("http" | "https")[];
      pathPrefixes?: readonly string[];
    };

export interface TargetPolicy {
  allowlist: readonly TargetAllowlistEntry[];
  /** Defaults to true for guarded active checks. */
  requireTestOrStaging?: boolean;
  /** Production targets remain denied unless this is explicitly true. */
  allowProduction?: boolean;
  /** Defaults to HTTPS-only. Set explicitly for a local HTTP fixture. */
  allowHttp?: boolean;
  /** Reject loopback/private/link-local IP literals by default. */
  allowPrivateNetwork?: boolean;
}

export interface TargetDecision {
  allowed: boolean;
  normalizedUrl: string;
  host?: string;
  environment: TargetEnvironment;
  reasons: string[];
}

export interface DastRequest {
  id: string;
  url: string;
  method: "GET" | "HEAD" | "OPTIONS";
  headers: Record<string, string>;
  check: "baseline" | "security-txt" | "robots" | "options";
}

export interface DastPlan {
  target: string;
  requests: readonly DastRequest[];
  policy: TargetPolicy;
  context: TargetContext;
  createdAt: number;
}

export interface DastPlanOptions {
  /** Include GET checks for robots.txt and security.txt (default true). */
  includeInformationalChecks?: boolean;
  /** Include an OPTIONS request to inspect CORS metadata (default true). */
  includeOptionsCheck?: boolean;
  now?: () => number;
}

export interface DastResponse {
  status?: number;
  headers?: HeaderInput;
  url?: string | URL;
  durationMs?: number;
}

export interface DastTransport {
  request(
    request: DastRequest,
    signal?: AbortSignal,
  ): Promise<DastResponse>;
}

export interface DastExecutionLimits {
  /** Maximum number of requests in this plan (default 10). */
  maxRequests?: number;
  /** Maximum started requests per second (default 2). */
  requestsPerSecond?: number;
  /** Maximum in-flight transport calls (default 2). */
  concurrency?: number;
  /** Overall wall-clock budget in milliseconds (default 30 seconds). */
  deadlineMs?: number;
  /** Per-request timeout, bounded by deadlineMs (default 10 seconds). */
  requestTimeoutMs?: number;
  /** Injectable clock for deterministic callers. */
  now?: () => number;
}

export type DastResultStatus =
  | "completed"
  | "timed-out"
  | "deadline-exceeded"
  | "rate-limited"
  | "rejected"
  | "transport-error";

export interface DastResult {
  request: DastRequest;
  status: DastResultStatus;
  response?: DastResponse;
  report?: PassiveAnalysisReport;
  error?: string;
  startedAt?: number;
  finishedAt: number;
}

export interface DastExecutionReport {
  target: string;
  startedAt: number;
  finishedAt: number;
  results: DastResult[];
  skipped: number;
}

export type HostPlatform = "windows" | "linux";

export interface HostConnectionMetadata {
  platform: HostPlatform;
  protocol: "tcp" | "udp" | string;
  localAddress?: string;
  localPort?: number;
  remoteAddress?: string;
  remotePort?: number;
  state?: string;
  pid?: number;
  processName?: string;
  source: "netstat" | "ss" | "powershell";
}

export interface HostCommandExecutor {
  (command: string, args: readonly string[]): Promise<string>;
}

export interface SecurityStore {
  saveTelemetry(event: NormalizedBrowserRequest): void;
  readTelemetry(limit?: number): NormalizedBrowserRequest[];
  saveReport(report: PassiveAnalysisReport | DastExecutionReport): void;
  readReports(limit?: number): Array<PassiveAnalysisReport | DastExecutionReport>;
  close(): void;
}
