import type { HeaderInput } from "./models.js";

export const REDACTED = "[REDACTED]";

const SENSITIVE_HEADER = /^(authorization|proxy-authorization|cookie|set-cookie)$/i;
const TOKEN_HEADER = /(api[-_]?key|token|secret|password|passwd|session|jwt|credential)/i;
const SENSITIVE_QUERY = /^(?:access[_-]?token|api[-_]?key|apikey|auth(?:entication)?|code|credential|jwt|key|pass(?:word)?|refresh[_-]?token|secret|session(?:id)?|sig(?:nature)?|state|token|ticket)$/i;
const TOKEN_VALUE = /\b(?:bearer|basic)\s+[a-z0-9._~+/=-]+/gi;
const JWT_VALUE = /\beyJ[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9._-]+\b/gi;

/** Convert browser/Fetch-style headers into a deterministic lower-case record. */
export function headersToRecord(headers?: HeaderInput): Record<string, string> {
  const result: Record<string, string> = {};
  if (!headers) return result;

  const add = (name: string, value: string) => {
    const key = name.trim().toLowerCase();
    if (!key) return;
    result[key] = result[key] ? `${result[key]}, ${value}` : value;
  };

  if (typeof (headers as Headers).forEach === "function") {
    (headers as Headers).forEach((value, name) => add(name, value));
  } else if (Array.isArray(headers)) {
    for (const pair of headers) {
      if (Array.isArray(pair) && pair.length >= 2) add(pair[0], pair[1]);
    }
  } else {
    for (const [name, value] of Object.entries(headers)) {
      if (value === undefined) continue;
      add(name, Array.isArray(value) ? value.join(", ") : String(value));
    }
  }
  return result;
}

function redactCookieValue(value: string, allPairs: boolean): string {
  return value
    .split(/(;\s*)/)
    .map((part, index) => {
      if (index % 2 === 1 || !part.includes("=") || (!allPairs && index > 0)) return part;
      const equals = part.indexOf("=");
      return `${part.slice(0, equals + 1)}${REDACTED}`;
    })
    .join("");
}

function redactSetCookie(value: string): string {
  // Header collections may join multiple Set-Cookie values with commas. Keep
  // Expires dates intact while redacting each cookie's first name=value pair.
  return value
    .split(/,\s*(?=[^;,=\s]+\s*=)/)
    .map((cookie) => redactCookieValue(cookie, false))
    .join(", ");
}

/** Redact credentials and token-like values from a header collection. */
export function redactHeaders(headers?: HeaderInput): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(headersToRecord(headers))) {
    if (SENSITIVE_HEADER.test(name) || TOKEN_HEADER.test(name)) {
      result[name] = SENSITIVE_HEADER.test(name) && /^cookie$/i.test(name)
        ? redactCookieValue(value, true)
        : /^set-cookie$/i.test(name)
          ? redactSetCookie(value)
        : REDACTED;
      continue;
    }
    result[name] = redactText(value);
  }
  return result;
}

/** Redact sensitive query values, URL credentials, and fragments. */
export function redactUrl(input: string | URL): string {
  const raw = String(input);
  try {
    const url = new URL(raw);
    if (url.username) url.username = REDACTED;
    if (url.password) url.password = REDACTED;
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_QUERY.test(key)) url.searchParams.set(key, REDACTED);
    }
    // Fragments are not sent to servers but frequently contain bearer state.
    if (url.hash) url.hash = REDACTED;
    return url.toString();
  } catch {
    // Keep malformed telemetry useful while still removing common key=value forms.
    return raw.replace(
      /([?&#](?:access[_-]?token|api[-_]?key|apikey|code|password|secret|session(?:id)?|token|sig(?:nature)?)=)[^&#]*/gi,
      `$1${encodeURIComponent(REDACTED)}`,
    );
  }
}

/** Redact token-bearing snippets in bounded diagnostic text. */
export function redactText(text: string): string {
  return text
    .replace(TOKEN_VALUE, REDACTED)
    .replace(JWT_VALUE, REDACTED)
    .replace(
      /((?:access[_-]?token|api[-_]?key|apikey|password|passwd|refresh[_-]?token|secret|session(?:id)?|token)\s*[=:]\s*)(["']?)[^\s&,;}"']+/gi,
      `$1$2${REDACTED}`,
    );
}

/** Recursively redact strings in a diagnostic object without mutating it. */
export function redactSecrets<T>(value: T): T {
  if (typeof value === "string") return redactText(value) as T;
  if (value instanceof URL) return redactUrl(value) as T;
  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item)) as T;
  }
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_HEADER.test(key) || TOKEN_HEADER.test(key) || SENSITIVE_QUERY.test(key)) {
        output[key] = REDACTED;
      } else {
        output[key] = redactSecrets(item);
      }
    }
    return output as T;
  }
  return value;
}

export const sensitiveQueryKeys = Object.freeze([
  "access_token",
  "api_key",
  "apikey",
  "code",
  "password",
  "refresh_token",
  "secret",
  "session",
  "signature",
  "state",
  "token",
]);
