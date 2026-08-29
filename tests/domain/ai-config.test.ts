import { describe, expect, it } from "vitest";
import { parseConfig, toLogSafeData } from "../../packages/domain/src/config";

const serviceEnvironment = {
  DATABASE_URL: "postgresql://pri:pri@localhost:5432/pri",
  REDIS_URL: "redis://localhost:6379",
  DAILY_AI_BUDGET_USD: "2.50",
};

const aiEnvironment = {
  AI_CLASSIFY_PRIMARY_PROVIDER: "openai",
  AI_CLASSIFY_PRIMARY_MODEL: "fixture-openai-classifier",
  AI_CLASSIFY_FALLBACK_PROVIDER: "deepseek",
  AI_CLASSIFY_FALLBACK_MODEL: "fixture-deepseek-classifier",
  AI_INTERPRET_PRIMARY_PROVIDER: "gemini",
  AI_INTERPRET_PRIMARY_MODEL: "fixture-gemini-interpreter",
  AI_INTERPRET_FALLBACK_PROVIDER: "qwen",
  AI_INTERPRET_FALLBACK_MODEL: "fixture-qwen-interpreter",
  AI_REQUEST_TIMEOUT_MS: "45000",
  AI_CLASSIFY_MAX_OUTPUT_TOKENS: "1000",
  AI_INTERPRET_MAX_OUTPUT_TOKENS: "4000",
  AI_PROVIDER_OPENAI_API_KEY: "fixture-openai-key",
  AI_PROVIDER_OPENAI_BASE_URL: "https://openai.example.test/v1",
  AI_PROVIDER_OPENAI_INPUT_COST_PER_MILLION_USD: "1.25",
  AI_PROVIDER_OPENAI_OUTPUT_COST_PER_MILLION_USD: "5",
  AI_PROVIDER_DEEPSEEK_API_KEY: "fixture-deepseek-key",
  AI_PROVIDER_DEEPSEEK_BASE_URL: "https://deepseek.example.test",
  AI_PROVIDER_DEEPSEEK_INPUT_COST_PER_MILLION_USD: "0.25",
  AI_PROVIDER_DEEPSEEK_OUTPUT_COST_PER_MILLION_USD: "1",
  AI_PROVIDER_GEMINI_API_KEY: "fixture-gemini-key",
  AI_PROVIDER_GEMINI_BASE_URL: "https://gemini.example.test/v1beta",
  AI_PROVIDER_GEMINI_INPUT_COST_PER_MILLION_USD: "0.5",
  AI_PROVIDER_GEMINI_OUTPUT_COST_PER_MILLION_USD: "2",
  AI_PROVIDER_QWEN_API_KEY: "fixture-qwen-key",
  AI_PROVIDER_QWEN_BASE_URL: "https://qwen.example.test/compatible-mode/v1",
  AI_PROVIDER_QWEN_INPUT_COST_PER_MILLION_USD: "0.4",
  AI_PROVIDER_QWEN_OUTPUT_COST_PER_MILLION_USD: "1.6",
};

describe("AI server configuration", () => {
  it("keeps AI configuration optional for ingestion-only workers", () => {
    expect(parseConfig(serviceEnvironment).AI).toBeUndefined();
  });

  it("parses task routing and enabled provider settings", () => {
    const config = parseConfig({ ...serviceEnvironment, ...aiEnvironment });

    expect(config.AI).toEqual(expect.objectContaining({
      requestTimeoutMs: 45_000,
      classify: {
        primary: { provider: "openai", model: "fixture-openai-classifier" },
        fallback: { provider: "deepseek", model: "fixture-deepseek-classifier" },
        maxOutputTokens: 1_000,
      },
      interpret: {
        primary: { provider: "gemini", model: "fixture-gemini-interpreter" },
        fallback: { provider: "qwen", model: "fixture-qwen-interpreter" },
        maxOutputTokens: 4_000,
      },
    }));
    expect(config.AI?.providers.qwen.baseUrl).toContain("qwen.example.test");
    expect(config.AI?.providers.openai.inputCostPerMillionUsd).toBe(1.25);
  });

  it("rejects the same primary and fallback provider", () => {
    expect(() => parseConfig({
      ...serviceEnvironment,
      ...aiEnvironment,
      AI_CLASSIFY_FALLBACK_PROVIDER: "openai",
    })).toThrow("AI_CLASSIFY_FALLBACK_PROVIDER must differ from the primary provider");
  });

  it.each([
    ["AI_PROVIDER_QWEN_BASE_URL", ""],
    ["AI_PROVIDER_GEMINI_API_KEY", ""],
    ["AI_INTERPRET_PRIMARY_MODEL", ""],
  ] as const)("requires enabled setting %s", (name, value) => {
    expect(() => parseConfig({
      ...serviceEnvironment,
      ...aiEnvironment,
      [name]: value,
    })).toThrow(name);
  });

  it.each([
    ["AI_REQUEST_TIMEOUT_MS", "0"],
    ["AI_CLASSIFY_MAX_OUTPUT_TOKENS", "1.5"],
    ["AI_PROVIDER_OPENAI_INPUT_COST_PER_MILLION_USD", "-1"],
  ] as const)("rejects invalid numeric setting %s", (name, value) => {
    expect(() => parseConfig({
      ...serviceEnvironment,
      ...aiEnvironment,
      [name]: value,
    })).toThrow(name);
  });

  it("does not leak provider keys in configuration errors", () => {
    const secret = "fixture-secret-never-log";

    try {
      parseConfig({
        ...serviceEnvironment,
        ...aiEnvironment,
        AI_PROVIDER_OPENAI_API_KEY: secret,
        AI_REQUEST_TIMEOUT_MS: "invalid",
      });
      throw new Error("Expected config failure");
    } catch (error) {
      expect(JSON.stringify(toLogSafeData({
        error,
        AI_PROVIDER_OPENAI_API_KEY: secret,
      }))).not.toContain(secret);
    }
  });
});
