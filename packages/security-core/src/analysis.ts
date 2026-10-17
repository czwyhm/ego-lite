import type {
  HeaderInput,
  PassiveAnalysisInput,
  PassiveAnalysisReport,
  SecurityFinding,
  SecuritySeverity,
} from "./models.js";
import { headersToRecord, redactText, redactUrl } from "./redaction.js";

function time(value: number | Date | undefined): number {
  const result = value instanceof Date ? value.getTime() : value;
  return typeof result === "number" && Number.isFinite(result) ? result : Date.now();
}

function originOf(value: string | URL): string | undefined {
  try {
    return new URL(String(value)).origin;
  } catch {
    return undefined;
  }
}

function addFinding(
  findings: SecurityFinding[],
  finding: Omit<SecurityFinding, "evidence"> & { evidence?: string },
) {
  const normalized: SecurityFinding = {
    ...finding,
    evidence: finding.evidence ? redactText(finding.evidence).slice(0, 400) : undefined,
  };
  if (!normalized.evidence) delete normalized.evidence;
  findings.push(normalized);
}

function cookieParts(value: string): string[] {
  // A Set-Cookie Expires date contains a comma; only split at a likely next cookie.
  return value.split(/,\s*(?=[^;,=\s]+\s*=)/);
}

function analyzeCookies(value: string, findings: SecurityFinding[]) {
  for (const cookie of cookieParts(value)) {
    const first = cookie.split(";", 1)[0] || "cookie";
    const name = first.slice(0, first.indexOf("=") >= 0 ? first.indexOf("=") : first.length).trim() || "cookie";
    const lower = cookie.toLowerCase();
    if (!lower.includes("secure")) {
      addFinding(findings, {
        id: "cookie-secure-missing",
        category: "cookie",
        severity: "medium",
        title: "Cookie is missing the Secure attribute",
        description: `The ${name} cookie can be sent over a clear-text connection.`,
        evidence: name,
        remediation: "Set Secure on cookies that carry session or authentication state.",
      });
    }
    if (!lower.includes("httponly")) {
      addFinding(findings, {
        id: "cookie-httponly-missing",
        category: "cookie",
        severity: "low",
        title: "Cookie is missing the HttpOnly attribute",
        description: `The ${name} cookie is readable by client-side scripts.`,
        evidence: name,
        remediation: "Set HttpOnly on cookies that do not need client-side access.",
      });
    }
    if (!/samesite\s*=/.test(lower)) {
      addFinding(findings, {
        id: "cookie-samesite-missing",
        category: "cookie",
        severity: "low",
        title: "Cookie is missing SameSite",
        description: `The ${name} cookie has no explicit cross-site delivery policy.`,
        evidence: name,
        remediation: "Set SameSite=Lax or Strict unless cross-site use is intentional.",
      });
    } else if (/samesite\s*=\s*none/.test(lower) && !lower.includes("secure")) {
      addFinding(findings, {
        id: "cookie-samesite-none-without-secure",
        category: "cookie",
        severity: "high",
        title: "SameSite=None cookie is missing Secure",
        description: `${name} uses SameSite=None without the required Secure attribute.`,
        evidence: name,
        remediation: "Add Secure or use a stricter SameSite mode.",
      });
    }
  }
}

/** Perform bounded, passive checks over caller-supplied response metadata. */
export function analyzeWebResponse(input: PassiveAnalysisInput): PassiveAnalysisReport {
  const headers = headersToRecord(input.headers);
  const findings: SecurityFinding[] = [];
  const sourceUrl = String(input.url);
  const pageUrl = input.finalUrl ? String(input.finalUrl) : sourceUrl;
  let page: URL | undefined;
  try {
    page = new URL(pageUrl);
  } catch {
    addFinding(findings, {
      id: "invalid-url",
      category: "exposure",
      severity: "medium",
      title: "Invalid response URL",
      description: "The observed response URL could not be parsed.",
    });
  }

  const isHttps = page?.protocol === "https:";
  if (isHttps && !headers["strict-transport-security"]) {
    addFinding(findings, {
      id: "header-hsts-missing",
      category: "headers",
      severity: "low",
      title: "Strict-Transport-Security is missing",
      description: "HTTPS responses do not instruct browsers to prefer HTTPS on later visits.",
      remediation: "Set a suitable Strict-Transport-Security policy after verifying HTTPS coverage.",
    });
  }
  if (!headers["content-security-policy"]) {
    addFinding(findings, {
      id: "header-csp-missing",
      category: "headers",
      severity: "low",
      title: "Content-Security-Policy is missing",
      description: "The response does not advertise a browser content policy.",
      remediation: "Deploy a restrictive Content-Security-Policy appropriate for the application.",
    });
  }
  if (!/\bnosniff\b/i.test(headers["x-content-type-options"] || "")) {
    addFinding(findings, {
      id: "header-nosniff-missing",
      category: "headers",
      severity: "low",
      title: "X-Content-Type-Options is missing",
      description: "Browsers may MIME-sniff content served by this response.",
      remediation: "Set X-Content-Type-Options: nosniff.",
    });
  }
  if (!headers["referrer-policy"]) {
    addFinding(findings, {
      id: "header-referrer-policy-missing",
      category: "headers",
      severity: "low",
      title: "Referrer-Policy is missing",
      description: "The response leaves referrer disclosure behavior implicit.",
      remediation: "Set an explicit Referrer-Policy such as strict-origin-when-cross-origin.",
    });
  }
  if (!headers["permissions-policy"]) {
    addFinding(findings, {
      id: "header-permissions-policy-missing",
      category: "headers",
      severity: "info",
      title: "Permissions-Policy is missing",
      description: "Browser feature permissions are not explicitly constrained.",
      remediation: "Set Permissions-Policy for features the application does not need.",
    });
  }
  if (!headers["x-frame-options"] && !/frame-ancestors\s+/i.test(headers["content-security-policy"] || "")) {
    addFinding(findings, {
      id: "header-clickjacking-protection-missing",
      category: "headers",
      severity: "low",
      title: "Clickjacking protection is missing",
      description: "Neither X-Frame-Options nor CSP frame-ancestors was observed.",
      remediation: "Set X-Frame-Options or a CSP frame-ancestors directive.",
    });
  }

  if (page?.protocol === "http:") {
    addFinding(findings, {
      id: "tls-cleartext",
      category: "tls",
      severity: "high",
      title: "Response is served over HTTP",
      description: "The observed target is not protected by TLS.",
      remediation: "Serve the application over HTTPS and redirect HTTP safely.",
    });
  }
  if (input.tls?.version && /^(?:SSL|TLS)\s*(?:v?1\.[01]|1\.0|1\.1)/i.test(input.tls.version)) {
    addFinding(findings, {
      id: "tls-outdated",
      category: "tls",
      severity: "high",
      title: "Outdated TLS version observed",
      description: `The connection reported ${input.tls.version}.`,
      evidence: input.tls.version,
      remediation: "Require TLS 1.2 or newer, preferably TLS 1.3 where supported.",
    });
  }
  if (input.tls?.certificateValid === false) {
    addFinding(findings, {
      id: "tls-certificate-invalid",
      category: "tls",
      severity: "high",
      title: "TLS certificate was reported invalid",
      description: "The caller reported that certificate validation failed.",
      remediation: "Fix certificate trust, hostname, and chain validation before deployment.",
    });
  }
  if (input.tls?.certificateExpiresAt !== undefined) {
    const expires = input.tls.certificateExpiresAt instanceof Date
      ? input.tls.certificateExpiresAt.getTime()
      : typeof input.tls.certificateExpiresAt === "number"
        ? input.tls.certificateExpiresAt
        : Date.parse(input.tls.certificateExpiresAt);
    if (Number.isFinite(expires) && expires > time(input.now) && expires - time(input.now) < 30 * 86400000) {
      addFinding(findings, {
        id: "tls-certificate-expiring",
        category: "tls",
        severity: "medium",
        title: "TLS certificate expires soon",
        description: "The certificate has less than 30 days of reported validity remaining.",
        remediation: "Renew the certificate before its validity window closes.",
      });
    }
  }

  const chain = input.redirectChain || [];
  if (chain.length > 5) {
    addFinding(findings, {
      id: "redirect-chain-long",
      category: "redirect",
      severity: "low",
      title: "Redirect chain is unusually long",
      description: `The response metadata contains ${chain.length} redirect hops.`,
      remediation: "Reduce redirect hops to limit latency and confusing navigation paths.",
    });
  }
  const sourceOrigin = originOf(input.url);
  const finalOrigin = originOf(pageUrl);
  const redirectDowngrade = sourceOrigin?.startsWith("https://") && finalOrigin?.startsWith("http://") ||
    chain.some((hop) => {
      try {
        return new URL(String(hop.url)).protocol === "https:" && hop.location !== undefined && new URL(String(hop.location), String(hop.url)).protocol === "http:";
      } catch {
        return false;
      }
    });
  if (redirectDowngrade) {
    addFinding(findings, {
      id: "redirect-downgrade",
      category: "redirect",
      severity: "high",
      title: "Redirect downgrades from HTTPS to HTTP",
      description: "The observed redirect path ends on clear-text HTTP.",
      remediation: "Keep redirects on HTTPS and remove downgrade paths.",
    });
  }
  if (sourceOrigin && finalOrigin && sourceOrigin !== finalOrigin && chain.length > 0) {
    addFinding(findings, {
      id: "redirect-cross-origin",
      category: "redirect",
      severity: "info",
      title: "Redirect crosses origins",
      description: "The observed redirect path changes origin.",
      remediation: "Review cross-origin redirects and avoid forwarding sensitive query state.",
    });
  }

  if (headers["set-cookie"]) analyzeCookies(headers["set-cookie"], findings);

  if (isHttps) {
    for (const resource of input.mixedContentUrls || []) {
      try {
        if (new URL(String(resource), pageUrl).protocol === "http:") {
          addFinding(findings, {
            id: "mixed-content",
            category: "mixed-content",
            severity: "high",
            title: "HTTPS page references clear-text content",
            description: "At least one observed resource uses HTTP on an HTTPS page.",
            evidence: redactUrl(resource),
            remediation: "Use HTTPS URLs for all page resources and upgrade insecure requests.",
          });
          break;
        }
      } catch {
        // An unparseable resource is not enough evidence for a finding.
      }
    }
  }

  const allowOrigin = headers["access-control-allow-origin"];
  if (allowOrigin === "*" && (input.requestCredentials || /true/i.test(headers["access-control-allow-credentials"] || ""))) {
    addFinding(findings, {
      id: "cors-wildcard-credentials",
      category: "cors",
      severity: "high",
      title: "CORS wildcard is used with credentials",
      description: "A wildcard CORS origin is paired with credentialed access metadata.",
      remediation: "Allow only trusted origins when credentials are involved.",
    });
  } else if (allowOrigin === "*") {
    addFinding(findings, {
      id: "cors-wildcard-origin",
      category: "cors",
      severity: "low",
      title: "CORS allows every origin",
      description: "The response permits cross-origin reads from any origin.",
      remediation: "Use an explicit origin allowlist for sensitive resources.",
    });
  } else if (allowOrigin && input.requestOrigin && allowOrigin === input.requestOrigin && !headers.vary?.toLowerCase().includes("origin")) {
    addFinding(findings, {
      id: "cors-reflection-without-vary",
      category: "cors",
      severity: "medium",
      title: "CORS origin appears reflected without Vary: Origin",
      description: "The response matches the request origin but does not vary caches by origin.",
      remediation: "Set Vary: Origin when dynamically reflecting an approved origin.",
    });
  }

  for (const header of ["server", "x-powered-by", "x-aspnet-version"]) {
    if (headers[header]) {
      addFinding(findings, {
        id: `exposure-${header}`,
        category: "exposure",
        severity: "info",
        title: `Technology detail exposed by ${header}`,
        description: "A response header discloses implementation or version metadata.",
        evidence: `${header}: ${headers[header]}`,
        remediation: "Remove unnecessary product and version disclosure at the edge.",
      });
    }
  }
  if (input.bodySample && /(?:stack trace|exception|debug\s*(?:true|mode)|directory listing|syntaxerror|traceback)/i.test(input.bodySample)) {
    addFinding(findings, {
      id: "exposure-debug-content",
      category: "exposure",
      severity: "medium",
      title: "Response sample resembles debug or directory-listing content",
      description: "The bounded caller-provided sample contains a common exposure marker.",
      evidence: redactText(input.bodySample).slice(0, 240),
      remediation: "Disable debug output and directory listings in deployed environments.",
    });
  }

  const bySeverity: Record<SecuritySeverity, number> = { info: 0, low: 0, medium: 0, high: 0 };
  for (const finding of findings) bySeverity[finding.severity] += 1;
  return {
    url: redactUrl(input.url),
    analyzedAt: time(input.now),
    findings,
    summary: { total: findings.length, bySeverity },
  };
}

export const analyzePassiveWebSecurity = analyzeWebResponse;
