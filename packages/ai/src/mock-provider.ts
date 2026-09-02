import { AiProviderError, type AiErrorCode } from "./errors";
import type {
  AiHealthResult,
  AiProvider,
  AiProviderResult,
  PaperAiInput,
  ScreenInput,
} from "./provider";
import {
  classificationOutputSchema,
  interpretationOutputSchema,
  screenBatchOutputSchema,
  type ClassificationOutput,
  type InterpretationOutput,
  type ScreenBatchOutput,
} from "./schemas";

type SuccessScenario<T> = {
  output: T;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
};

type ErrorScenario = {
  errorCode: AiErrorCode;
};

type Scenario<T> = SuccessScenario<T> | ErrorScenario;

export type MockAiProviderOptions = {
  name?: string;
  model?: string;
  classify?: Scenario<ClassificationOutput>;
  interpret?: Scenario<InterpretationOutput>;
  screenBatch?: Scenario<ScreenBatchOutput>;
  health?: AiHealthResult;
};

export function createMockAiProvider(options: MockAiProviderOptions = {}): AiProvider {
  const name = options.name ?? "mock";
  const model = options.model ?? "mock-model";

  return {
    name,
    model,
    async classify(_input: PaperAiInput) {
      return runScenario(
        options.classify,
        classificationOutputSchema.parse,
        name,
        model,
      );
    },
    async interpret(_input: PaperAiInput) {
      return runScenario(
        options.interpret,
        interpretationOutputSchema.parse,
        name,
        model,
      );
    },
    async screenBatch(_inputs: ScreenInput[], _userInterests?: Record<string, number>) {
      return runScenario(
        options.screenBatch,
        screenBatchOutputSchema.parse,
        name,
        model,
      );
    },
    async healthCheck() {
      return options.health ?? { ok: true, durationMs: 0 };
    },
  };
}

function runScenario<T>(
  scenario: Scenario<T> | undefined,
  parse: (value: unknown) => T,
  provider: string,
  model: string,
): AiProviderResult<T> {
  if (!scenario) {
    throw new AiProviderError("configuration", { provider });
  }

  if ("errorCode" in scenario) {
    throw new AiProviderError(scenario.errorCode, { provider });
  }

  const output = parse(scenario.output);
  return {
    provider,
    model,
    output,
    usage: {
      inputTokens: scenario.inputTokens,
      outputTokens: scenario.outputTokens,
      totalTokens: scenario.inputTokens + scenario.outputTokens,
    },
    durationMs: scenario.durationMs,
  };
}
