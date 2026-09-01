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

  it("accepts optional public-source configuration without requiring credentials", () => {
    expect(parseConfig(validEnvironment)).not.toHaveProperty("OPENALEX_API_KEY");
    expect(parseConfig(validEnvironment)).not.toHaveProperty("SOURCE_CONTACT_EMAIL");
    expect(parseConfig(validEnvironment)).not.toHaveProperty("CROSSREF_ISSN");
    expect(parseConfig({
      ...validEnvironment,
      SOURCE_CONTACT_EMAIL: "contact@example.test",
      CROSSREF_ISSN: "0031-9007",
      OPENALEX_API_KEY: "test-openalex-key",
    })).toEqual(expect.objectContaining({
      SOURCE_CONTACT_EMAIL: "contact@example.test",
      CROSSREF_ISSN: "0031-9007",
      OPENALEX_API_KEY: "test-openalex-key",
    }));
  });

  it("parses an optional model settings key file path without reading it", () => {
    expect(parseConfig({
      ...validEnvironment,
      AI_SETTINGS_MASTER_KEY_FILE: "",
    })).not.toHaveProperty("AI_SETTINGS_MASTER_KEY_FILE");
    expect(parseConfig({
      ...validEnvironment,
      AI_SETTINGS_MASTER_KEY_FILE: "test-only-model-settings.key",
    })).toEqual(expect.objectContaining({
      AI_SETTINGS_MASTER_KEY_FILE: "test-only-model-settings.key",
    }));
  });

  it("rejects an invalid Crossref ISSN", () => {
    expect(() => parseConfig({ ...validEnvironment, CROSSREF_ISSN: "physics" })).toThrow(
      "CROSSREF_ISSN must be a valid ISSN",
    );
  });

  it("never serializes key fields or secret values", () => {
    const secret = "not-a-real-secret-for-test";
    const safe = toLogSafeData({
      AI_PROVIDER_OPENAI_API_KEY: secret,
      OPENALEX_API_KEY: secret,
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

  it("defaults retention to 30 days and the daily target to 10–15 papers", () => {
    const config = parseConfig(validEnvironment);

    expect(config.PAPER_RETENTION_DAYS).toBe(30);
    expect(config.DAILY_PAPER_TARGET_MIN).toBe(10);
    expect(config.DAILY_PAPER_TARGET_MAX).toBe(15);
  });

  it("accepts explicit bounded retention and daily-target values", () => {
    const config = parseConfig({
      ...validEnvironment,
      PAPER_RETENTION_DAYS: "60",
      DAILY_PAPER_TARGET_MIN: "12",
      DAILY_PAPER_TARGET_MAX: "20",
    });

    expect(config.PAPER_RETENTION_DAYS).toBe(60);
    expect(config.DAILY_PAPER_TARGET_MIN).toBe(12);
    expect(config.DAILY_PAPER_TARGET_MAX).toBe(20);
  });

  it("accepts an equal daily-target min and max", () => {
    const config = parseConfig({
      ...validEnvironment,
      DAILY_PAPER_TARGET_MIN: "12",
      DAILY_PAPER_TARGET_MAX: "12",
    });

    expect(config.DAILY_PAPER_TARGET_MIN).toBe(12);
    expect(config.DAILY_PAPER_TARGET_MAX).toBe(12);
  });

  it.each([
    "0",
    "-1",
    "1.5",
    "abc",
  ])("rejects malformed retention days %j", (value) => {
    expect(() => parseConfig({ ...validEnvironment, PAPER_RETENTION_DAYS: value })).toThrow(
      "PAPER_RETENTION_DAYS must be a positive integer",
    );
  });

  it.each([
    ["0", "10"],
    ["10", "0"],
    ["10.5", "15"],
    ["abc", "15"],
  ])("rejects malformed daily-target values min=%j max=%j", (min, max) => {
    expect(() =>
      parseConfig({
        ...validEnvironment,
        DAILY_PAPER_TARGET_MIN: min,
        DAILY_PAPER_TARGET_MAX: max,
      }),
    ).toThrow(/DAILY_PAPER_TARGET_(MIN|MAX) must be a positive integer/u);
  });

  it("treats blank retention and target variables as defaults", () => {
    const config = parseConfig({
      ...validEnvironment,
      PAPER_RETENTION_DAYS: "",
      DAILY_PAPER_TARGET_MIN: "  ",
      DAILY_PAPER_TARGET_MAX: "",
    });

    expect(config.PAPER_RETENTION_DAYS).toBe(30);
    expect(config.DAILY_PAPER_TARGET_MIN).toBe(10);
    expect(config.DAILY_PAPER_TARGET_MAX).toBe(15);
  });

  it("rejects a daily target where min exceeds max", () => {
    expect(() =>
      parseConfig({
        ...validEnvironment,
        DAILY_PAPER_TARGET_MIN: "16",
        DAILY_PAPER_TARGET_MAX: "15",
      }),
    ).toThrow("DAILY_PAPER_TARGET_MIN must not exceed DAILY_PAPER_TARGET_MAX");
  });

  it.each([
    ["PAPER_RETENTION_DAYS", "3651", "3650"],
    ["DAILY_PAPER_TARGET_MIN", "501", "500"],
    ["DAILY_PAPER_TARGET_MAX", "501", "500"],
  ])("rejects %s above its supported maximum", (name, value, maximum) => {
    expect(() => parseConfig({ ...validEnvironment, [name]: value })).toThrow(
      `${name} must be at most ${maximum}`,
    );
  });
});
