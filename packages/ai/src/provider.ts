import type {
  ClassificationOutput,
  InterpretationOutput,
  ScreenBatchOutput,
} from "./schemas";

export type { AiErrorCode } from "./errors";

export type PaperAiInput = {
  title: string;
  abstract?: string | null;
  journal?: string | null;
  publishedAt?: string | null;
};

/** Input for batch screening: a paper's public facts plus its stable id. */
export type ScreenInput = PaperAiInput & { paperId: string };

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
  /**
   * Batch-screen a list of papers. The provider receives all papers in one
   * request and must return a score, direction, reason, and selection flag
   * for each. Inputs contain only title, journal, and a short abstract
   * snippet — never full text or PDFs.
   *
   * @param inputs - Papers to screen.
   * @param userInterests - Optional map of tagSlug -> weight. When provided,
   *   the model slightly boosts scores for papers in directions the user follows.
   */
  screenBatch(
    inputs: ScreenInput[],
    userInterests?: Record<string, number>,
  ): Promise<AiProviderResult<ScreenBatchOutput>>;
  healthCheck(): Promise<AiHealthResult>;
}
