import { z } from "zod";

export type ServerConfig = {
  DATABASE_URL: string;
  REDIS_URL: string;
  DAILY_AI_BUDGET_USD: number;
  SOURCE_CONTACT_EMAIL?: string;
  CROSSREF_ISSN?: string;
  OPENALEX_API_KEY?: string;
  AI_PROVIDER_DEEPSEEK_API_KEY?: string;
  AI_PROVIDER_OPENAI_API_KEY?: string;
  AI_PROVIDER_GEMINI_API_KEY?: string;
  AI_PROVIDER_QWEN_API_KEY?: string;
  AI?: AiServerConfig;
};

export const aiProviderNames = ["deepseek", "openai", "gemini", "qwen"] as const;
export type AiProviderName = (typeof aiProviderNames)[number];

export type AiProviderServerConfig = {
  apiKey: string;
  baseUrl: string;
  inputCostPerMillionUsd: number;
  outputCostPerMillionUsd: number;
};

export type AiTaskServerConfig = {
  primary: { provider: AiProviderName; model: string };
  fallback?: { provider: AiProviderName; model: string };
  maxOutputTokens: number;
};

export type AiServerConfig = {
  classify: AiTaskServerConfig;
  interpret: AiTaskServerConfig;
  requestTimeoutMs: number;
  providers: Partial<Record<AiProviderName, AiProviderServerConfig>>;
};

const requiredString = (name: string) =>
  z.preprocess(
    (value) => (typeof value === "string" ? value : ""),
    z.string().trim().min(1, `Missing required environment variable: ${name}`),
  );

const optionalSecret = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().min(1).optional(),
);

const configSchema = z.object({
  DATABASE_URL: requiredString("DATABASE_URL"),
  REDIS_URL: requiredString("REDIS_URL"),
  DAILY_AI_BUDGET_USD: z.coerce
    .number({ error: "DAILY_AI_BUDGET_USD must be a positive number" })
    .positive("DAILY_AI_BUDGET_USD must be a positive number"),
  SOURCE_CONTACT_EMAIL: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().email().optional(),
  ),
  CROSSREF_ISSN: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().regex(/^\d{4}-?\d{3}[\dXx]$/, "CROSSREF_ISSN must be a valid ISSN").optional(),
  ),
  OPENALEX_API_KEY: optionalSecret,
  AI_PROVIDER_DEEPSEEK_API_KEY: optionalSecret,
  AI_PROVIDER_OPENAI_API_KEY: optionalSecret,
  AI_PROVIDER_GEMINI_API_KEY: optionalSecret,
  AI_PROVIDER_QWEN_API_KEY: optionalSecret,
});

const sensitiveFieldPattern = /(?:_KEY|PASSWORD|TOKEN|SECRET|DATABASE_URL|REDIS_URL)$/i;
const redacted = "[REDACTED]";

export function parseConfig(environment: NodeJS.ProcessEnv): ServerConfig {
  const result = configSchema.safeParse(environment);

  if (!result.success) {
    const messages = result.error.issues.map((issue) => issue.message);
    throw new Error([...new Set(messages)].join("; "));
  }

  const ai = parseAiConfig(environment);
  return ai ? { ...result.data, AI: ai } : result.data;
}

function parseAiConfig(environment: NodeJS.ProcessEnv): AiServerConfig | undefined {
  const routeVariables = [
    "AI_CLASSIFY_PRIMARY_PROVIDER",
    "AI_CLASSIFY_PRIMARY_MODEL",
    "AI_CLASSIFY_FALLBACK_PROVIDER",
    "AI_CLASSIFY_FALLBACK_MODEL",
    "AI_INTERPRET_PRIMARY_PROVIDER",
    "AI_INTERPRET_PRIMARY_MODEL",
    "AI_INTERPRET_FALLBACK_PROVIDER",
    "AI_INTERPRET_FALLBACK_MODEL",
  ] as const;
  if (!routeVariables.some((name) => optionalEnvironmentValue(environment, name))) {
    return undefined;
  }

  const classify = parseAiTaskConfig(environment, "CLASSIFY");
  const interpret = parseAiTaskConfig(environment, "INTERPRET");
  const providers = new Set<AiProviderName>([
    classify.primary.provider,
    interpret.primary.provider,
    ...(classify.fallback ? [classify.fallback.provider] : []),
    ...(interpret.fallback ? [interpret.fallback.provider] : []),
  ]);

  return {
    classify,
    interpret,
    requestTimeoutMs: parsePositiveInteger(environment, "AI_REQUEST_TIMEOUT_MS"),
    providers: Object.fromEntries(
      [...providers].map((provider) => [
        provider,
        parseAiProviderConfig(environment, provider),
      ]),
    ),
  };
}

function parseAiTaskConfig(
  environment: NodeJS.ProcessEnv,
  task: "CLASSIFY" | "INTERPRET",
): AiTaskServerConfig {
  const primaryProviderName = `AI_${task}_PRIMARY_PROVIDER`;
  const primaryModelName = `AI_${task}_PRIMARY_MODEL`;
  const fallbackProviderName = `AI_${task}_FALLBACK_PROVIDER`;
  const fallbackModelName = `AI_${task}_FALLBACK_MODEL`;
  const primaryProvider = parseAiProviderName(
    requiredEnvironmentValue(environment, primaryProviderName),
    primaryProviderName,
  );
  const fallbackProviderValue = optionalEnvironmentValue(
    environment,
    fallbackProviderName,
  );
  const fallbackModelValue = optionalEnvironmentValue(environment, fallbackModelName);

  if (Boolean(fallbackProviderValue) !== Boolean(fallbackModelValue)) {
    throw new Error(`${fallbackProviderName} and ${fallbackModelName} must be set together`);
  }

  const fallbackProvider = fallbackProviderValue
    ? parseAiProviderName(fallbackProviderValue, fallbackProviderName)
    : undefined;
  if (fallbackProvider === primaryProvider) {
    throw new Error(`${fallbackProviderName} must differ from the primary provider`);
  }

  return {
    primary: {
      provider: primaryProvider,
      model: requiredEnvironmentValue(environment, primaryModelName),
    },
    ...(fallbackProvider && fallbackModelValue
      ? { fallback: { provider: fallbackProvider, model: fallbackModelValue } }
      : {}),
    maxOutputTokens: parsePositiveInteger(
      environment,
      `AI_${task}_MAX_OUTPUT_TOKENS`,
    ),
  };
}

function parseAiProviderConfig(
  environment: NodeJS.ProcessEnv,
  provider: AiProviderName,
): AiProviderServerConfig {
  const prefix = `AI_PROVIDER_${provider.toUpperCase()}`;
  return {
    apiKey: requiredEnvironmentValue(environment, `${prefix}_API_KEY`),
    baseUrl: parseUrl(
      requiredEnvironmentValue(environment, `${prefix}_BASE_URL`),
      `${prefix}_BASE_URL`,
    ),
    inputCostPerMillionUsd: parseNonNegativeNumber(
      environment,
      `${prefix}_INPUT_COST_PER_MILLION_USD`,
    ),
    outputCostPerMillionUsd: parseNonNegativeNumber(
      environment,
      `${prefix}_OUTPUT_COST_PER_MILLION_USD`,
    ),
  };
}

function parseAiProviderName(value: string, name: string): AiProviderName {
  if (!aiProviderNames.includes(value as AiProviderName)) {
    throw new Error(`${name} must be one of: ${aiProviderNames.join(", ")}`);
  }
  return value as AiProviderName;
}

function parsePositiveInteger(environment: NodeJS.ProcessEnv, name: string): number {
  const value = Number(requiredEnvironmentValue(environment, name));
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function parseNonNegativeNumber(
  environment: NodeJS.ProcessEnv,
  name: string,
): number {
  const value = Number(requiredEnvironmentValue(environment, name));
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a nonnegative number`);
  }
  return value;
}

function requiredEnvironmentValue(
  environment: NodeJS.ProcessEnv,
  name: string,
): string {
  const value = optionalEnvironmentValue(environment, name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnvironmentValue(
  environment: NodeJS.ProcessEnv,
  name: string,
): string | undefined {
  const value = environment[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseUrl(value: string, name: string): string {
  try {
    return new URL(value).toString().replace(/\/$/u, "");
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
}

export function toLogSafeData(value: unknown): unknown {
  const secrets = collectSecrets(value);
  return sanitizeValue(value, secrets, new WeakSet<object>());
}

function collectSecrets(value: unknown, seen = new WeakSet<object>()): string[] {
  if (typeof value !== "object" || value === null || seen.has(value)) {
    return [];
  }

  seen.add(value);
  const secrets: string[] = [];

  for (const [key, child] of Object.entries(value)) {
    if (sensitiveFieldPattern.test(key) && typeof child === "string" && child.length > 0) {
      secrets.push(child);
    }
    secrets.push(...collectSecrets(child, seen));
  }

  return secrets;
}

function sanitizeString(value: string, secrets: readonly string[]): string {
  return secrets.reduce(
    (safeValue, secret) => safeValue.split(secret).join(redacted),
    value,
  );
}

function sanitizeValue(
  value: unknown,
  secrets: readonly string[],
  seen: WeakSet<object>,
): unknown {
  if (typeof value === "string") {
    return sanitizeString(value, secrets);
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  if (seen.has(value)) {
    return "[Circular]";
  }
  seen.add(value);

  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeString(value.message, secrets),
      stack: value.stack ? sanitizeString(value.stack, secrets) : undefined,
    };
  }

  if (Array.isArray(value)) {
    return value.map((child) => sanitizeValue(child, secrets, seen));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      sensitiveFieldPattern.test(key) ? redacted : sanitizeValue(child, secrets, seen),
    ]),
  );
}
