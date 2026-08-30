import type {
  AiProviderName,
  AiServerConfig,
  AiTaskServerConfig,
} from "@pri/domain/config";
import { AiProviderError } from "./errors";
import type { AiFetch } from "./http";
import type { AiProvider } from "./provider";
import { createDeepSeekProvider } from "./providers/deepseek";
import { createGeminiProvider } from "./providers/gemini";
import { createGlmProvider } from "./providers/glm";
import { createHunyuanProvider } from "./providers/hunyuan";
import { createKimiProvider } from "./providers/kimi";
import { createOpenAiProvider } from "./providers/openai";
import { createOpenAiCompatibleProvider } from "./providers/openai-compatible";
import { createQwenProvider } from "./providers/qwen";

type FactoryInput = {
  config: AiServerConfig;
  task: "classify" | "interpret";
  fetchImpl?: AiFetch;
};

export function createConfiguredTaskProviders(input: FactoryInput): {
  primary: AiProvider;
  fallback?: AiProvider;
} {
  const task = input.config[input.task];
  return {
    primary: createProvider(input.config, task, task.primary, input.fetchImpl),
    ...(task.fallback
      ? {
          fallback: createProvider(
            input.config,
            task,
            task.fallback,
            input.fetchImpl,
          ),
        }
      : {}),
  };
}

function createProvider(
  config: AiServerConfig,
  task: AiTaskServerConfig,
  selection: { provider: AiProviderName; model: string },
  fetchImpl?: AiFetch,
): AiProvider {
  const providerConfig = config.providers[selection.provider];
  if (!providerConfig) {
    throw new AiProviderError("configuration", {
      provider: selection.provider,
    });
  }
  const options = {
    apiKey: providerConfig.apiKey,
    baseUrl: providerConfig.baseUrl,
    model: selection.model,
    timeoutMs: config.requestTimeoutMs,
    maxOutputTokens: task.maxOutputTokens,
    fetchImpl,
  };

  switch (selection.provider) {
    case "deepseek":
      return createDeepSeekProvider(options);
    case "openai":
      return createOpenAiProvider(options);
    case "gemini":
      return createGeminiProvider(options);
    case "qwen":
      return createQwenProvider(options);
    case "glm":
      return createGlmProvider(options);
    case "kimi":
      return createKimiProvider(options);
    case "hunyuan":
      return createHunyuanProvider(options);
    case "compatible":
      return createOpenAiCompatibleProvider("compatible", options);
  }
}
