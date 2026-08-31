import type { AiProviderName, AiServerConfig } from "@pri/domain/config";
import { createConnectionProvider } from "./connection-provider";
import { AiProviderError } from "./errors";
import type { AiFetch } from "./http";
import type { AiProvider } from "./provider";

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
    primary: createConfiguredProvider(input, task.primary.provider, task.primary.model),
    ...(task.fallback
      ? {
          fallback: createConfiguredProvider(
            input,
            task.fallback.provider,
            task.fallback.model,
          ),
        }
      : {}),
  };
}

function createConfiguredProvider(
  input: FactoryInput,
  provider: AiProviderName,
  model: string,
): AiProvider {
  const providerConfig = input.config.providers[provider];
  if (!providerConfig) {
    throw new AiProviderError("configuration", {
      provider,
    });
  }
  return createConnectionProvider({
    provider,
    model,
    apiKey: providerConfig.apiKey,
    baseUrl: providerConfig.baseUrl,
    requestTimeoutMs: input.config.requestTimeoutMs,
    maxOutputTokens: input.config[input.task].maxOutputTokens,
    fetchImpl: input.fetchImpl,
  });
}
