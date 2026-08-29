import { describe, expect, it } from "vitest";
import { parseConfig, toLogSafeData } from "../../packages/domain/src/config";

const validEnvironment = {
  DATABASE_URL: "postgresql://pri:pri@localhost:5432/pri",
  REDIS_URL: "redis://localhost:6379",
  DAILY_AI_BUDGET_USD: "2.50",
};

describe("server configuration", () => {
  it("returns a clear error when DATABASE_URL is missing", () => {
    expect(() => parseConfig({ ...validEnvironment, DATABASE_URL: "" })).toThrow(
      "Missing required environment variable: DATABASE_URL",
    );
  });

  it("names DATABASE_URL when it is undefined", () => {
    const { DATABASE_URL: _databaseUrl, ...environmentWithoutDatabase } = validEnvironment;

    expect(() => parseConfig(environmentWithoutDatabase)).toThrow(
      "Missing required environment variable: DATABASE_URL",
    );
  });

  it("parses a valid positive daily budget", () => {
    expect(parseConfig(validEnvironment).DAILY_AI_BUDGET_USD).toBe(2.5);
  });

  it("never serializes key fields or secret values", () => {
    const secret = "not-a-real-secret-for-test";
    const safe = toLogSafeData({
      AI_PROVIDER_OPENAI_API_KEY: secret,
      nested: { message: `provider rejected ${secret}` },
    });
    const serialized = JSON.stringify(safe);

    expect(serialized).not.toContain(secret);
    expect(serialized).toContain("[REDACTED]");
  });

  it("does not include provided secrets in configuration errors", () => {
    const secret = "another-test-secret";

    try {
      parseConfig({
        ...validEnvironment,
        DAILY_AI_BUDGET_USD: "invalid",
        AI_PROVIDER_OPENAI_API_KEY: secret,
      });
      throw new Error("Expected parseConfig to fail");
    } catch (error) {
      expect(JSON.stringify(toLogSafeData(error))).not.toContain(secret);
    }
  });
});
