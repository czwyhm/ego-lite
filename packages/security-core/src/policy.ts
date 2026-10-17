import type {
  TargetAllowlistEntry,
  TargetContext,
  TargetDecision,
  TargetEnvironment,
  TargetPolicy,
} from "./models.js";
import { redactUrl } from "./redaction.js";

const PRIVATE_HOST = /^(?:localhost|.*\.localhost|.*\.local|127(?:\.\d{1,3}){3}|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|169\.254(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}|::1|0:0:0:0:0:0:0:1|f[cd][0-9a-f:]+|fe80:[0-9a-f:]+)$/i;

function contextEnvironment(context: TargetContext): TargetEnvironment {
  return context.environment || "unknown";
}

/** True only when the caller supplied an explicit test/staging signal. */
export function isTestOrStagingContext(context: TargetContext = {}): boolean {
  if (context.environment === "test" || context.environment === "staging") return true;
  if (context.confirmedTestOrStaging === true) return true;
  return (context.tags || []).some((tag) => /^(test|testing|staging)$/i.test(tag.trim()));
}

function parseEntry(entry: TargetAllowlistEntry): {
  host: string;
  wildcard: boolean;
  ports?: readonly number[];
  protocols?: readonly ("http" | "https")[];
  pathPrefixes?: readonly string[];
} {
  if (typeof entry === "object") {
    const host = entry.host.trim().toLowerCase();
    return {
      host: host.replace(/^(?:\*\.)?\./, "").replace(/^\*\./, ""),
      wildcard: host.startsWith("*.") || host.startsWith("."),
      ports: entry.ports,
      protocols: entry.protocols,
      pathPrefixes: entry.pathPrefixes,
    };
  }
  const value = entry.trim();
  try {
    const parsed = new URL(value.includes("://") ? value : `https://${value}`);
    return {
      host: parsed.hostname.toLowerCase().replace(/^\*\./, ""),
      wildcard: parsed.hostname.startsWith("*.") || parsed.hostname.startsWith("."),
      ports: parsed.port ? [Number(parsed.port)] : undefined,
      protocols: value.includes("://") ? [parsed.protocol.slice(0, -1) as "http" | "https"] : undefined,
      pathPrefixes: parsed.pathname && parsed.pathname !== "/" ? [parsed.pathname] : undefined,
    };
  } catch {
    return {
      host: value.toLowerCase().replace(/^\*\./, "").replace(/^\./, ""),
      wildcard: value.startsWith("*.") || value.startsWith("."),
    };
  }
}

function hostMatches(host: string, entry: ReturnType<typeof parseEntry>): boolean {
  return entry.wildcard
    ? host.endsWith(`.${entry.host}`)
    : host === entry.host;
}

function portMatches(url: URL, ports?: readonly number[]): boolean {
  if (!ports || ports.length === 0) return true;
  const effective = url.port
    ? Number(url.port)
    : url.protocol === "https:"
      ? 443
      : 80;
  return ports.includes(effective);
}

function pathMatches(url: URL, prefixes?: readonly string[]): boolean {
  return !prefixes || prefixes.length === 0 || prefixes.some((prefix) => url.pathname.startsWith(prefix));
}

function allowedByEntry(url: URL, entryValue: TargetAllowlistEntry): boolean {
  const entry = parseEntry(entryValue);
  if (!hostMatches(url.hostname.toLowerCase(), entry)) return false;
  if (!portMatches(url, entry.ports)) return false;
  if (entry.protocols && !entry.protocols.includes(url.protocol.slice(0, -1) as "http" | "https")) return false;
  return pathMatches(url, entry.pathPrefixes);
}

/** Evaluate target policy without performing DNS, HTTP, or other I/O. */
export function evaluateTarget(
  input: string | URL,
  policy: TargetPolicy,
  context: TargetContext = {},
): TargetDecision {
  const reasons: string[] = [];
  let url: URL;
  try {
    url = new URL(String(input));
  } catch {
    return {
      allowed: false,
      normalizedUrl: redactUrl(String(input)),
      environment: contextEnvironment(context),
      reasons: ["Target URL is invalid."],
    };
  }

  if (!/^https?:$/.test(url.protocol)) reasons.push("Only HTTP and HTTPS targets are supported.");
  if (url.username || url.password) reasons.push("Target URL credentials are not allowed.");
  if (url.protocol === "http:" && policy.allowHttp !== true) reasons.push("HTTP targets require allowHttp: true.");
  if (policy.allowPrivateNetwork !== true && PRIVATE_HOST.test(url.hostname)) {
    reasons.push("Private, loopback, and link-local targets require allowPrivateNetwork: true.");
  }
  if (!policy.allowlist.some((entry) => allowedByEntry(url, entry))) {
    reasons.push("Target is not present in the explicit host allowlist.");
  }

  const environment = contextEnvironment(context);
  const requiresTestOrStaging = policy.requireTestOrStaging !== false;
  if (requiresTestOrStaging && !isTestOrStagingContext(context)) {
    reasons.push("An explicit test/staging context is required.");
  }
  if (environment === "production" && policy.allowProduction !== true) {
    reasons.push("Production targets are disabled by policy.");
  }
  if (environment === "development" && requiresTestOrStaging && !context.confirmedTestOrStaging) {
    reasons.push("Development targets require confirmedTestOrStaging: true.");
  }

  return {
    allowed: reasons.length === 0,
    normalizedUrl: redactUrl(url),
    host: url.hostname.toLowerCase(),
    environment,
    reasons,
  };
}

export class TargetPolicyError extends Error {
  readonly decision: TargetDecision;

  constructor(decision: TargetDecision) {
    super(`Target policy rejected ${decision.normalizedUrl}: ${decision.reasons.join(" ")}`);
    this.name = "TargetPolicyError";
    this.decision = decision;
  }
}

/** Throw a typed error when a target is outside the explicit security policy. */
export function assertTargetAllowed(
  input: string | URL,
  policy: TargetPolicy,
  context: TargetContext = {},
): TargetDecision {
  const decision = evaluateTarget(input, policy, context);
  if (!decision.allowed) throw new TargetPolicyError(decision);
  return decision;
}

/** Convenience predicate for UI and planning code. */
export function isTargetAllowed(
  input: string | URL,
  policy: TargetPolicy,
  context: TargetContext = {},
): boolean {
  return evaluateTarget(input, policy, context).allowed;
}
