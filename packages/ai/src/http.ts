import { AiProviderError, type AiErrorCode } from "./errors";

export type AiFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type ProviderHttpOptions = {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs?: number;
  maxOutputTokens?: number;
  fetchImpl?: AiFetch;
  now?: () => number;
};

type JsonRequest = {
  provider: string;
  url: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: unknown;
  timeoutMs: number;
  fetchImpl: AiFetch;
  now: () => number;
};

export type JsonResponse = {
  data: unknown;
  durationMs: number;
};

export function validateProviderOptions(
  provider: string,
  options: ProviderHttpOptions,
): Required<Pick<ProviderHttpOptions, "apiKey" | "baseUrl" | "model">> & {
  timeoutMs: number;
  maxOutputTokens: number;
  fetchImpl: AiFetch;
  now: () => number;
} {
  if (!options.apiKey.trim() || !options.baseUrl.trim() || !options.model.trim()) {
    throw new AiProviderError("configuration", { provider });
  }
  return {
    apiKey: options.apiKey,
    baseUrl: options.baseUrl.replace(/\/+$/u, ""),
    model: options.model,
    timeoutMs: options.timeoutMs ?? 30_000,
    maxOutputTokens: options.maxOutputTokens ?? 2_048,
    fetchImpl: options.fetchImpl ?? fetch,
    now: options.now ?? Date.now,
  };
}

export async function requestJson(input: JsonRequest): Promise<JsonResponse> {
  const controller = new AbortController();
  const startedAt = input.now();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);

  try {
    const response = await input.fetchImpl(input.url, {
      method: input.method,
      headers: input.headers,
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
      signal: controller.signal,
    });
    const durationMs = Math.max(0, input.now() - startedAt);

    if (!response.ok) {
      await response.body?.cancel();
      throw new AiProviderError(httpErrorCode(response.status), {
        provider: input.provider,
        status: response.status,
        durationMs,
      });
    }

    try {
      return { data: await response.json(), durationMs };
    } catch {
      throw new AiProviderError("invalid_json", {
        provider: input.provider,
        durationMs,
      });
    }
  } catch (error) {
    if (error instanceof AiProviderError) {
      throw error;
    }
    const code = isAbortError(error) ? "timeout" : "network_error";
    throw new AiProviderError(code, {
      provider: input.provider,
      durationMs: Math.max(0, input.now() - startedAt),
    });
  } finally {
    clearTimeout(timer);
  }
}

function httpErrorCode(status: number): AiErrorCode {
  if (status === 429) {
    return "rate_limited";
  }
  if (status >= 500) {
    return "upstream_5xx";
  }
  if (status === 401 || status === 403) {
    return "authentication";
  }
  return "permanent_4xx";
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}
