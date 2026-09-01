import { z } from "zod";

export type ServerConfig = {
  DATABASE_URL: string;
  REDIS_URL: string;
  DAILY_AI_BUDGET_USD: number;
  PAPER_RETENTION_DAYS: number;
  DAILY_PAPER_TARGET_MIN: number;
  DAILY_PAPER_TARGET_MAX: number;
  DAILY_PIPELINE: DailyPipelineConfig;
  SOURCE_CONTACT_EMAIL?: string;
  CROSSREF_ISSN?: string;
  OPENALEX_API_KEY?: string;
  AI_SETTINGS_MASTER_KEY_FILE?: string;
  AI_PROVIDER_DEEPSEEK_API_KEY?: string;
  AI_PROVIDER_OPENAI_API_KEY?: string;
  AI_PROVIDER_GEMINI_API_KEY?: string;
  AI_PROVIDER_QWEN_API_KEY?: string;
  AI_PROVIDER_GLM_API_KEY?: string;
  AI_PROVIDER_KIMI_API_KEY?: string;
  AI_PROVIDER_HUNYUAN_API_KEY?: string;
  AI_PROVIDER_COMPATIBLE_API_KEY?: string;
  AI?: AiServerConfig;
};

export type DailyPipelineConfig = {
  enabled: boolean;
  time: string;
  timezone: string;
};

export const aiProviderNames = [
  "deepseek",
  "openai",
  "gemini",
  "qwen",
  "glm",
  "kimi",
  "hunyuan",
  "compatible",
] as const;
export type AiProviderName = (typeof aiProviderNames)[number];

type AiProviderPreset = {
  baseUrl: string;
  model: string;
};

export const aiProviderPresets: Partial<Record<AiProviderName, AiProviderPreset>> = {
  deepseek: { baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-5-mini" },
  gemini: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    model: "gemini-2.5-flash",
  },
  qwen: {
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-plus",
  },
  glm: {
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-5.2",
  },
  kimi: { baseUrl: "https://api.moonshot.cn/v1", model: "kimi-k3" },
  hunyuan: { baseUrl: "https://tokenhub.tencentmaas.com/v1", model: "hy3" },
};

const defaultRequestTimeoutMs = 45_000;
const defaultClassifyMaxOutputTokens = 1_000;
const defaultInterpretMaxOutputTokens = 4_000;
const conservativeInputCostPerMillionUsd = 10;
const conservativeOutputCostPerMillionUsd = 50;

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
  DAILY_PIPELINE_ENABLED: z.string().trim().optional(),
  DAILY_PIPELINE_TIME: z.string().trim().optional(),
  DAILY_PIPELINE_TIMEZONE: z.string().trim().optional(),
  SOURCE_CONTACT_EMAIL: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().email().optional(),
  ),
  CROSSREF_ISSN: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().regex(/^\d{4}-?\d{3}[\dXx]$/, "CROSSREF_ISSN must be a valid ISSN").optional(),
  ),
  OPENALEX_API_KEY: optionalSecret,
  AI_SETTINGS_MASTER_KEY_FILE: optionalSecret,
  AI_PROVIDER_DEEPSEEK_API_KEY: optionalSecret,
  AI_PROVIDER_OPENAI_API_KEY: optionalSecret,
  AI_PROVIDER_GEMINI_API_KEY: optionalSecret,
  AI_PROVIDER_QWEN_API_KEY: optionalSecret,
  AI_PROVIDER_GLM_API_KEY: optionalSecret,
  AI_PROVIDER_KIMI_API_KEY: optionalSecret,
  AI_PROVIDER_HUNYUAN_API_KEY: optionalSecret,
  AI_PROVIDER_COMPATIBLE_API_KEY: optionalSecret,
});

const sensitiveFieldPattern = /(?:_KEY|PASSWORD|TOKEN|SECRET|DATABASE_URL|REDIS_URL)$/i;
const redacted = "[REDACTED]";

export function parseConfig(environment: NodeJS.ProcessEnv): ServerConfig {
  const result = configSchema.safeParse(environment);

  if (!result.success) {
    const messages = result.error.issues.map((issue) => issue.message);
    throw new Error([...new Set(messages)].join("; "));
  }

  const {
    DAILY_PIPELINE_ENABLED: _enabled,
    DAILY_PIPELINE_TIME: _time,
    DAILY_PIPELINE_TIMEZONE: _timezone,
    AI_SETTINGS_MASTER_KEY_FILE: masterKeyFile,
    ...serviceConfig
  } = result.data;
  const ai = parseAiConfig(environment);
  const dailyPipeline = parseDailyPipelineConfig(environment);
  const configuredServices = masterKeyFile
    ? { ...serviceConfig, AI_SETTINGS_MASTER_KEY_FILE: masterKeyFile }
    : serviceConfig;
  const retention = {
    PAPER_RETENTION_DAYS: parseOptionalPositiveInteger(environment, "PAPER_RETENTION_DAYS", 30),
    DAILY_PAPER_TARGET_MIN: parseOptionalPositiveInteger(environment, "DAILY_PAPER_TARGET_MIN", 10),
    DAILY_PAPER_TARGET_MAX: parseOptionalPositiveInteger(environment, "DAILY_PAPER_TARGET_MAX", 15),
  };
  if (retention.DAILY_PAPER_TARGET_MIN > retention.DAILY_PAPER_TARGET_MAX) {
    throw new Error("DAILY_PAPER_TARGET_MIN must not exceed DAILY_PAPER_TARGET_MAX");
  }
  return ai
    ? { ...configuredServices, ...retention, DAILY_PIPELINE: dailyPipeline, AI: ai }
    : { ...configuredServices, ...retention, DAILY_PIPELINE: dailyPipeline };
}

function parseDailyPipelineConfig(environment: NodeJS.ProcessEnv): DailyPipelineConfig {
  const enabledValue = optionalEnvironmentValue(environment, "DAILY_PIPELINE_ENABLED") ?? "false";
  if (enabledValue !== "true" && enabledValue !== "false") {
    throw new Error("DAILY_PIPELINE_ENABLED must be true or false");
  }
  const time = optionalEnvironmentValue(environment, "DAILY_PIPELINE_TIME") ?? "00:00";
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(time)) {
    throw new Error("DAILY_PIPELINE_TIME must use 24-hour HH:mm format");
  }
  const timezone = optionalEnvironmentValue(environment, "DAILY_PIPELINE_TIMEZONE") ?? "Asia/Shanghai";
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format(new Date(0));
  } catch {
    throw new Error("DAILY_PIPELINE_TIMEZONE must be a valid IANA timezone");
  }
  return { enabled: enabledValue === "true", time, timezone };
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
  const hasExplicitRoutes = routeVariables.some((name) =>
    optionalEnvironmentValue(environment, name)
  );
  if (!hasExplicitRoutes) {
    return parsePresetAiConfig(environment);
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

function parsePresetAiConfig(
  environment: NodeJS.ProcessEnv,
): AiServerConfig | undefined {
  const configuredProviders = aiProviderNames.filter((provider) =>
    optionalEnvironmentValue(environment, providerVariable(provider, "API_KEY"))
  );
  if (configuredProviders.length === 0) {
    return undefined;
  }

  const selectedValue = optionalEnvironmentValue(environment, "AI_DEFAULT_PROVIDER");
  if (!selectedValue && configuredProviders.length > 1) {
    throw new Error(
      "AI_DEFAULT_PROVIDER is required when more than one provider API key is configured",
    );
  }
  const provider = selectedValue
    ? parseAiProviderName(selectedValue, "AI_DEFAULT_PROVIDER")
    : configuredProviders[0]!;
  if (!configuredProviders.includes(provider)) {
    throw new Error(`Missing required environment variable: ${providerVariable(provider, "API_KEY")}`);
  }

  const providers = Object.fromEntries(
    configuredProviders.map((configuredProvider) => [
      configuredProvider,
      parseAiProviderConfig(environment, configuredProvider),
    ]),
  );
  const model = providerModel(environment, provider);
  return {
    classify: {
      primary: { provider, model },
      maxOutputTokens: parseOptionalPositiveInteger(
        environment,
        "AI_CLASSIFY_MAX_OUTPUT_TOKENS",
        defaultClassifyMaxOutputTokens,
      ),
    },
    interpret: {
      primary: { provider, model },
      maxOutputTokens: parseOptionalPositiveInteger(
        environment,
        "AI_INTERPRET_MAX_OUTPUT_TOKENS",
        defaultInterpretMaxOutputTokens,
      ),
    },
    requestTimeoutMs: parseOptionalPositiveInteger(
      environment,
      "AI_REQUEST_TIMEOUT_MS",
      defaultRequestTimeoutMs,
    ),
    providers,
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
  const preset = aiProviderPresets[provider];
  return {
    apiKey: requiredEnvironmentValue(environment, `${prefix}_API_KEY`),
    baseUrl: parseUrl(
      optionalEnvironmentValue(environment, `${prefix}_BASE_URL`) ??
        requiredPresetValue(preset?.baseUrl, `${prefix}_BASE_URL`),
      `${prefix}_BASE_URL`,
    ),
    inputCostPerMillionUsd: parseOptionalNonNegativeNumber(
      environment,
      `${prefix}_INPUT_COST_PER_MILLION_USD`,
      conservativeInputCostPerMillionUsd,
    ),
    outputCostPerMillionUsd: parseOptionalNonNegativeNumber(
      environment,
      `${prefix}_OUTPUT_COST_PER_MILLION_USD`,
      conservativeOutputCostPerMillionUsd,
    ),
  };
}

function providerModel(
  environment: NodeJS.ProcessEnv,
  provider: AiProviderName,
): string {
  const name = providerVariable(provider, "MODEL");
  return optionalEnvironmentValue(environment, name) ??
    requiredPresetValue(aiProviderPresets[provider]?.model, name);
}

function providerVariable(
  provider: AiProviderName,
  suffix: "API_KEY" | "MODEL",
): string {
  return `AI_PROVIDER_${provider.toUpperCase()}_${suffix}`;
}

function requiredPresetValue(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
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

function parseOptionalPositiveInteger(
  environment: NodeJS.ProcessEnv,
  name: string,
  defaultValue: number,
): number {
  return optionalEnvironmentValue(environment, name)
    ? parsePositiveInteger(environment, name)
    : defaultValue;
}

function parseOptionalNonNegativeNumber(
  environment: NodeJS.ProcessEnv,
  name: string,
  defaultValue: number,
): number {
  return optionalEnvironmentValue(environment, name)
    ? parseNonNegativeNumber(environment, name)
    : defaultValue;
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
