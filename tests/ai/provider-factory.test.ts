import { describe, expect, it, vi } from "vitest";
import type { AiServerConfig } from "../../packages/domain/src/config";
import { createConfiguredTaskProviders } from "../../packages/ai/src/factory";

const config: AiServerConfig = {
  requestTimeoutMs: 12_000,
  classify: {
    primary: { provider: "openai", model: "fixture-openai-classifier" },
    fallback: { provider: "deepseek", model: "fixture-deepseek-classifier" },
    maxOutputTokens: 800,
  },
  interpret: {
    primary: { provider: "gemini", model: "fixture-gemini-interpreter" },
    fallback: { provider: "qwen", model: "fixture-qwen-interpreter" },
    maxOutputTokens: 2_000,
  },
  providers: {
    openai: providerConfig("openai"),
    deepseek: providerConfig("deepseek"),
    gemini: providerConfig("gemini"),
    qwen: providerConfig("qwen"),
  },
};

describe("configured AI provider factory", () => {
  it.each([
    ["classify", "openai", "fixture-openai-classifier", "deepseek", "fixture-deepseek-classifier"],
    ["interpret", "gemini", "fixture-gemini-interpreter", "qwen", "fixture-qwen-interpreter"],
  ] as const)("builds %s primary and fallback providers", (
    task,
    primaryName,
    primaryModel,
    fallbackName,
    fallbackModel,
  ) => {
    const providers = createConfiguredTaskProviders({
      config,
      task,
      fetchImpl: vi.fn<typeof fetch>(),
    });

    expect(providers.primary).toEqual(expect.objectContaining({
      name: primaryName,
      model: primaryModel,
    }));
    expect(providers.fallback).toEqual(expect.objectContaining({
      name: fallbackName,
      model: fallbackModel,
    }));
    expect(JSON.stringify(providers)).not.toContain("fixture-key");
  });
});

function providerConfig(name: string) {
  return {
    apiKey: `fixture-key-${name}`,
    baseUrl: `https://${name}.example.test`,
    inputCostPerMillionUsd: 1,
    outputCostPerMillionUsd: 2,
  };
}
