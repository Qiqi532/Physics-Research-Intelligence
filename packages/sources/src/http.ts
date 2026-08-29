import type { Sleep, SourceErrorCode, SourceFetch } from "./types";

type RetriableFetchOptions = {
  fetchImpl?: SourceFetch;
  sleep?: Sleep;
  timeoutMs?: number;
  maxAttempts?: number;
  baseDelayMs?: number;
};

export class SourceConnectorError extends Error {
  readonly code: SourceErrorCode;
  readonly status?: number;
  readonly retryAfterMs?: number;

  constructor(
    code: SourceErrorCode,
    message: string,
    options: { status?: number; retryAfterMs?: number; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "SourceConnectorError";
    this.code = code;
    this.status = options.status;
    this.retryAfterMs = options.retryAfterMs;
  }
}

export function createRetriableFetch(
  options: RetriableFetchOptions = {},
): SourceFetch {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 500;

  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error("maxAttempts must be a positive integer");
  }

  return async (input, init) => {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await fetchWithTimeout(fetchImpl, input, init, timeoutMs);

        if (response.ok) {
          return response;
        }

        const retryAfterMs = parseRetryAfter(response.headers.get("Retry-After"));
        const retryable = response.status === 429 || response.status >= 500;

        if (retryable && attempt < maxAttempts) {
          await response.body?.cancel();
          await sleep(retryAfterMs ?? baseDelayMs * 2 ** (attempt - 1));
          continue;
        }

        throw new SourceConnectorError(
          responseErrorCode(response.status),
          `Source request failed with HTTP ${response.status}`,
          { status: response.status, retryAfterMs },
        );
      } catch (error) {
        if (error instanceof SourceConnectorError) {
          throw error;
        }

        if (isAbortError(error)) {
          if (attempt < maxAttempts && !init?.signal?.aborted) {
            await sleep(baseDelayMs * 2 ** (attempt - 1));
            continue;
          }
          throw new SourceConnectorError("timeout", "Source request timed out", {
            cause: error,
          });
        }

        if (attempt < maxAttempts) {
          await sleep(baseDelayMs * 2 ** (attempt - 1));
          continue;
        }

        throw new SourceConnectorError("request_failed", "Source request failed", {
          cause: error,
        });
      }
    }

    throw new SourceConnectorError("request_failed", "Source request failed");
  };
}

function responseErrorCode(status: number): SourceErrorCode {
  if (status === 429) {
    return "rate_limited";
  }
  if (status >= 500) {
    return "upstream_5xx";
  }
  return "request_failed";
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1_000;
  }

  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

async function fetchWithTimeout(
  fetchImpl: SourceFetch,
  input: string | URL | Request,
  init: RequestInit | undefined,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const relayAbort = () => controller.abort(init?.signal?.reason);
  init?.signal?.addEventListener("abort", relayAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchImpl(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    init?.signal?.removeEventListener("abort", relayAbort);
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
