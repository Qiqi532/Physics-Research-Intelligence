import type { AiProviderName } from "@pri/domain/config";
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

export type ConnectionProviderInput = {
  provider: AiProviderName;
  model: string;
  apiKey: string;
  baseUrl: string;
  requestTimeoutMs: number;
  maxOutputTokens: number;
  fetchImpl?: AiFetch;
};

export function createConnectionProvider(input: ConnectionProviderInput): AiProvider {
  const options = {
    apiKey: input.apiKey,
    baseUrl: input.baseUrl,
    model: input.model,
    timeoutMs: input.requestTimeoutMs,
    maxOutputTokens: input.maxOutputTokens,
    fetchImpl: input.fetchImpl,
  };

  switch (input.provider) {
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
