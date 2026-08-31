import type { ProviderHttpOptions } from "../http";
import { createOpenAiCompatibleProvider } from "./openai-compatible";

export function createGlmProvider(options: ProviderHttpOptions) {
  return createOpenAiCompatibleProvider("glm", options);
}
