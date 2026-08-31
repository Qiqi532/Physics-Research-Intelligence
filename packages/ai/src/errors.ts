export type AiErrorCode =
  | "invalid_json"
  | "schema_invalid"
  | "network_error"
  | "timeout"
  | "rate_limited"
  | "upstream_5xx"
  | "authentication"
  | "permanent_4xx"
  | "configuration"
  | "insufficient_input"
  | "budget_exceeded"
  | "business_validation";

const fallbackCodes = new Set<AiErrorCode>([
  "network_error",
  "timeout",
  "rate_limited",
  "upstream_5xx",
]);

export class AiProviderError extends Error {
  readonly code: AiErrorCode;
  readonly provider?: string;
  readonly status?: number;
  readonly durationMs?: number;

  constructor(
    code: AiErrorCode,
    options: {
      provider?: string;
      status?: number;
      durationMs?: number;
      cause?: unknown;
    } = {},
  ) {
    super(`AI provider failed (${code})`, { cause: options.cause });
    this.name = "AiProviderError";
    this.code = code;
    this.provider = options.provider;
    this.status = options.status;
    this.durationMs = options.durationMs;
  }

  get retryableForFallback(): boolean {
    return fallbackCodes.has(this.code);
  }
}
