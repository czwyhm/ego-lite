import type {
  BrowserRequestTelemetryInput,
  NormalizedBrowserRequest,
} from "./models.js";
import { redactHeaders, redactText, redactUrl } from "./redaction.js";

function timestamp(value: number | Date | undefined): number {
  const number = value instanceof Date ? value.getTime() : value;
  return typeof number === "number" && Number.isFinite(number)
    ? number
    : Date.now();
}

function nonNegativeNumber(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

/** Normalize one browser request without retaining request or response bodies. */
export function normalizeBrowserRequest(
  input: BrowserRequestTelemetryInput,
): NormalizedBrowserRequest {
  const result: NormalizedBrowserRequest = {
    timestamp: timestamp(input.timestamp),
    url: redactUrl(input.url),
    method: String(input.method || "GET").trim().toUpperCase() || "GET",
    requestHeaders: redactHeaders(input.requestHeaders),
    responseHeaders: redactHeaders(input.responseHeaders),
  };

  if (typeof input.status === "number" && Number.isFinite(input.status)) {
    result.status = Math.trunc(input.status);
  }
  const durationMs = nonNegativeNumber(input.durationMs);
  if (durationMs !== undefined) result.durationMs = durationMs;
  if (input.resourceType?.trim()) result.resourceType = redactText(input.resourceType.trim());
  if (input.initiator?.trim()) result.initiator = redactText(input.initiator.trim());
  if (input.requestId?.trim()) result.requestId = redactText(input.requestId.trim());
  if (input.frameId?.trim()) result.frameId = redactText(input.frameId.trim());
  if (input.responseUrl !== undefined) result.responseUrl = redactUrl(input.responseUrl);

  const requestBodyBytes = nonNegativeNumber(input.requestBodyBytes);
  const responseBodyBytes = nonNegativeNumber(input.responseBodyBytes);
  if (requestBodyBytes !== undefined) result.requestBodyBytes = requestBodyBytes;
  if (responseBodyBytes !== undefined) result.responseBodyBytes = responseBodyBytes;
  return result;
}

/** Explicitly named alias for callers that keep telemetry as a separate layer. */
export const normalizeBrowserRequestTelemetry = normalizeBrowserRequest;
