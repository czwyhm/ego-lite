const SECRET_HEADER_NAMES = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
  'x-csrf-token',
]);

const SECRET_QUERY_NAMES = /^(?:token|access_token|refresh_token|api[-_]?key|key|secret|password|passwd|session|code)$/i;

export function redactHeaders(headers: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!headers) return undefined;
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [
      name,
      SECRET_HEADER_NAMES.has(name.toLowerCase()) ? '[REDACTED]' : value,
    ]),
  );
}

export function redactUrl(value: string | undefined): string | undefined {
  if (!value) return value;
  try {
    const url = new URL(value);
    for (const key of [...url.searchParams.keys()]) {
      if (SECRET_QUERY_NAMES.test(key)) url.searchParams.set(key, '[REDACTED]');
    }
    return url.toString();
  } catch {
    return value;
  }
}

/** Keep MCP output safe even when an adapter returns browser request metadata. */
export function redactTelemetry<T extends Record<string, unknown>>(event: T): T {
  const result = { ...event } as Record<string, unknown>;
  if (typeof result.url === 'string') result.url = redactUrl(result.url);
  if (result.requestHeaders && typeof result.requestHeaders === 'object') {
    result.requestHeaders = redactHeaders(result.requestHeaders as Record<string, string>);
  }
  if (result.responseHeaders && typeof result.responseHeaders === 'object') {
    result.responseHeaders = redactHeaders(result.responseHeaders as Record<string, string>);
  }
  return result as T;
}
