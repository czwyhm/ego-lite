import type {
  DastExecutionLimits,
  DastExecutionReport,
  DastPlan,
  DastPlanOptions,
  DastRequest,
  DastResult,
  DastResponse,
  DastTransport,
  TargetContext,
  TargetPolicy,
} from "./models.js";
import { analyzeWebResponse } from "./analysis.js";
import { redactText, redactUrl } from "./redaction.js";
import { assertTargetAllowed, evaluateTarget } from "./policy.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function finitePositive(value: number | undefined, fallback: number): number {
  return value === undefined ? fallback : Number.isFinite(value) && value > 0 ? value : NaN;
}

function safeRequest(id: string, url: string, method: "GET" | "HEAD" | "OPTIONS", check: DastRequest["check"]): DastRequest {
  return {
    id,
    url,
    method,
    check,
    // Deliberately no cookies, authorization, body, or user-controlled headers.
    headers: {
      accept: "text/html,application/json;q=0.9,*/*;q=0.1",
      "cache-control": "no-cache",
    },
  };
}

/** Build a plan containing only metadata-oriented GET/HEAD/OPTIONS checks. */
export function createDastPlan(
  target: string | URL,
  policy: TargetPolicy,
  context: TargetContext = {},
  options: DastPlanOptions = {},
): DastPlan {
  const decision = assertTargetAllowed(target, policy, context);
  const parsed = new URL(decision.normalizedUrl);
  const requests: DastRequest[] = [safeRequest("baseline", decision.normalizedUrl, "GET", "baseline")];

  const addIfAllowed = (request: DastRequest) => {
    if (evaluateTarget(request.url, policy, context).allowed) requests.push(request);
  };
  if (options.includeInformationalChecks !== false) {
    addIfAllowed(safeRequest("security-txt", `${parsed.origin}/.well-known/security.txt`, "GET", "security-txt"));
    addIfAllowed(safeRequest("robots", `${parsed.origin}/robots.txt`, "GET", "robots"));
  }
  if (options.includeOptionsCheck !== false) {
    addIfAllowed(safeRequest("options", decision.normalizedUrl, "OPTIONS", "options"));
  }
  return {
    target: decision.normalizedUrl,
    requests,
    policy,
    context,
    createdAt: options.now ? options.now() : Date.now(),
  };
}

export class DastSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DastSafetyError";
  }
}

function validateLimits(limits: DastExecutionLimits): Required<Omit<DastExecutionLimits, "now">> & { now: () => number } {
  const maxRequests = finitePositive(limits.maxRequests, 10);
  const requestsPerSecond = finitePositive(limits.requestsPerSecond, 2);
  const concurrency = finitePositive(limits.concurrency, 2);
  const deadlineMs = finitePositive(limits.deadlineMs, 30_000);
  const requestTimeoutMs = finitePositive(limits.requestTimeoutMs, 10_000);
  if (![maxRequests, requestsPerSecond, concurrency, deadlineMs, requestTimeoutMs].every(Number.isFinite)) {
    throw new RangeError("DAST limits must be finite positive numbers.");
  }
  return {
    maxRequests: Math.max(1, Math.floor(maxRequests)),
    requestsPerSecond,
    concurrency: Math.max(1, Math.floor(concurrency)),
    deadlineMs,
    requestTimeoutMs,
    now: limits.now || Date.now,
  };
}

function errorText(error: unknown): string {
  return redactText(error instanceof Error ? error.message : String(error)).slice(0, 500);
}

function deadlineResult(request: DastRequest, now: number, status: "deadline-exceeded" | "rate-limited"): DastResult {
  return { request, status, error: "DAST deadline prevented this request from starting.", finishedAt: now };
}

async function waitUntil(target: number, clock: () => number): Promise<void> {
  const wait = target - clock();
  if (wait > 0) await new Promise<void>((resolve) => setTimeout(resolve, wait));
}

async function callWithTimeout(
  transport: DastTransport,
  request: DastRequest,
  timeoutMs: number,
): Promise<{ status: "completed" | "timed-out" | "transport-error"; response?: DastResponse; error?: string }> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const transportPromise = Promise.resolve().then(() => transport.request(request, controller.signal));
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new DastSafetyError("request timeout"));
    }, timeoutMs);
  });
  try {
    return { status: "completed", response: await Promise.race([transportPromise, timeoutPromise]) };
  } catch (error) {
    return {
      status: error instanceof DastSafetyError ? "timed-out" : "transport-error",
      error: errorText(error),
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Execute a plan through an injected transport with rate, concurrency, and deadline guards. */
export async function executeDastPlan(
  plan: DastPlan,
  transport: DastTransport,
  limits: DastExecutionLimits = {},
): Promise<DastExecutionReport> {
  const checked = validateLimits(limits);
  const startedAt = checked.now();
  const deadlineAt = startedAt + checked.deadlineMs;
  const requests = plan.requests.slice(0, checked.maxRequests);
  let nextIndex = 0;
  let nextSlotAt = startedAt;
  const intervalMs = 1000 / checked.requestsPerSecond;
  const results: DastResult[] = [];
  const resultAt = (index: number, result: DastResult) => {
    results[index] = result;
  };

  const worker = async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= requests.length) return;
      const request = requests[index];
      const now = checked.now();
      if (now >= deadlineAt) {
        resultAt(index, deadlineResult(request, now, "deadline-exceeded"));
        continue;
      }
      const headerNames = Object.keys(request.headers || {}).map((name) => name.toLowerCase());
      if (!SAFE_METHODS.has(request.method) || headerNames.includes("authorization") || headerNames.includes("proxy-authorization") || headerNames.includes("cookie") || "body" in request) {
        resultAt(index, {
          request,
          status: "rejected",
          error: "Only bodyless GET, HEAD, and OPTIONS probes without credentials are allowed.",
          finishedAt: checked.now(),
        });
        continue;
      }
      const decision = evaluateTarget(request.url, plan.policy, plan.context);
      if (!decision.allowed) {
        resultAt(index, {
          request: { ...request, url: redactUrl(request.url) },
          status: "rejected",
          error: decision.reasons.join(" "),
          finishedAt: checked.now(),
        });
        continue;
      }

      const slot = Math.max(nextSlotAt, checked.now());
      nextSlotAt = slot + intervalMs;
      if (slot >= deadlineAt) {
        resultAt(index, deadlineResult(request, checked.now(), "rate-limited"));
        continue;
      }
      await waitUntil(slot, checked.now);
      const requestStarted = checked.now();
      if (requestStarted >= deadlineAt) {
        resultAt(index, deadlineResult(request, requestStarted, "deadline-exceeded"));
        continue;
      }
      const timeoutMs = Math.max(1, Math.min(checked.requestTimeoutMs, deadlineAt - requestStarted));
      const called = await callWithTimeout(transport, request, timeoutMs);
      const finishedAt = checked.now();
      const result: DastResult = {
        request,
        status: called.status,
        response: called.response,
        error: called.error,
        startedAt: requestStarted,
        finishedAt,
      };
      if (called.response) {
        result.report = analyzeWebResponse({
          url: request.url,
          finalUrl: called.response.url,
          status: called.response.status,
          headers: called.response.headers,
        });
      }
      resultAt(index, result);
    }
  };

  const workers = Array.from({ length: Math.min(checked.concurrency, requests.length || 1) }, () => worker());
  await Promise.all(workers);
  const finishedAt = checked.now();
  return {
    target: redactUrl(plan.target),
    startedAt,
    finishedAt,
    results: results.filter((result): result is DastResult => Boolean(result)),
    skipped: Math.max(0, plan.requests.length - requests.length),
  };
}

export const planDastChecks = createDastPlan;
