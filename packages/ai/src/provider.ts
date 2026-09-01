import type {
  ClassificationOutput,
  InterpretationOutput,
} from "./schemas";

export type { AiErrorCode } from "./errors";

export type PaperAiInput = {
  title: string;
  abstract?: string | null;
  journal?: string | null;
  publishedAt?: string | null;
};

export type AiUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type AiProviderResult<T> = {
  provider: string;
  model: string;
  output: T;
  usage?: AiUsage;
  durationMs: number;
};

export type AiHealthResult = {
  ok: boolean;
  durationMs: number;
};

export interface AiProvider {
  readonly name: string;
  readonly model: string;
  classify(input: PaperAiInput): Promise<AiProviderResult<ClassificationOutput>>;
  interpret(input: PaperAiInput): Promise<AiProviderResult<InterpretationOutput>>;
  healthCheck(): Promise<AiHealthResult>;
}
