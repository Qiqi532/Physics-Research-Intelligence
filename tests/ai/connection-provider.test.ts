import { describe, expect, it, vi } from "vitest";
import type { AiProviderName } from "../../packages/domain/src/config";
import { createConnectionProvider } from "../../packages/ai/src/connection-provider";

describe("named connection provider factory", () => {
  it.each([
    "deepseek",
    "openai",
    "gemini",
    "qwen",
    "glm",
    "kimi",
    "hunyuan",
    "compatible",
  ] as const)("builds one %s connection without exposing its key", (provider) => {
    const testOnlyValue = ["test", "only", "value", provider].join("-");
    const model = `fixture-${provider}-model`;
    const instance = createConnectionProvider({
      provider,
      model,
      apiKey: testOnlyValue,
      baseUrl: `https://${provider}.example.test/v1`,
      requestTimeoutMs: 5_000,
      maxOutputTokens: 800,
      fetchImpl: vi.fn<typeof fetch>(),
    });

    expect(instance).toEqual(expect.objectContaining({ name: provider, model }));
    expect(JSON.stringify(instance)).not.toContain(testOnlyValue);
  });

  it("accepts the closed provider-name union", () => {
    const providers: AiProviderName[] = [
      "deepseek",
      "openai",
      "gemini",
      "qwen",
      "glm",
      "kimi",
      "hunyuan",
      "compatible",
    ];

    expect(providers).toHaveLength(8);
  });
});
