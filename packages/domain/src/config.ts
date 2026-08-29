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

  return result.data;
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
