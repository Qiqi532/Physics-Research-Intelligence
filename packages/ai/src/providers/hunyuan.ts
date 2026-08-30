import type { ProviderHttpOptions } from "../http";
import { createOpenAiCompatibleProvider } from "./openai-compatible";

export function createHunyuanProvider(options: ProviderHttpOptions) {
  return createOpenAiCompatibleProvider("hunyuan", options);
}
