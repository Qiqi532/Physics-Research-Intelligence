import type { ProviderHttpOptions } from "../http";
import { createOpenAiCompatibleProvider } from "./openai-compatible";

export function createKimiProvider(options: ProviderHttpOptions) {
  return createOpenAiCompatibleProvider("kimi", options);
}
