import type { ProviderHttpOptions } from "../http";
import { createOpenAiCompatibleProvider } from "./openai-compatible";

export function createDeepSeekProvider(options: ProviderHttpOptions) {
  return createOpenAiCompatibleProvider("deepseek", options);
}
