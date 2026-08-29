import type { ProviderHttpOptions } from "../http";
import { createOpenAiCompatibleProvider } from "./openai-compatible";

export function createQwenProvider(options: ProviderHttpOptions) {
  return createOpenAiCompatibleProvider("qwen", options);
}
