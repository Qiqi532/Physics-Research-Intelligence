import { estimateCost, type AiPrices, type CostEstimate } from "./cost";
import { AiProviderError, type AiErrorCode } from "./errors";
import type {
  AiProvider,
  AiProviderResult,
  AiUsage,
  PaperAiInput,
} from "./provider";
import type { ClassificationOutput, InterpretationOutput } from "./schemas";

const connectionSamplePaper: PaperAiInput = {
  title: "Synthetic tabletop interferometry for a fictional calibration standard",
  abstract: "We report a fictional tabletop measurement used only to verify a model connection. The synthetic abstract does not describe a real paper or experimental claim.",
  journal: "Fictional Physics Connection Test",
  publishedAt: "2026-08-31T00:00:00.000Z",
};

export type ConnectionHealthResult =
  | {
      status: "complete";
      provider: string;
      model: string;
      durationMs: number;
    }
  | ConnectionTestFailure;

export type ConnectionTestFailure = {
  status: "failed";
  provider: string;
  model: string;
  durationMs: number;
  errorCode: AiErrorCode;
};

export type ConnectionSampleSuccess<T> = {
  status: "complete";
  provider: string;
  model: string;
  durationMs: number;
  usage: AiUsage;
  cost: CostEstimate;
  output: T;
};

export type ConnectionSampleResult = {
  classification: ConnectionSampleSuccess<ClassificationOutput> | ConnectionTestFailure;
  interpretation: ConnectionSampleSuccess<InterpretationOutput> | ConnectionTestFailure;
};

export async function runConnectionHealth(
  provider: AiProvider,
): Promise<ConnectionHealthResult> {
  try {
    const result = await provider.healthCheck();
    if (!result.ok) {
      return failure(provider, new AiProviderError("business_validation", {
        provider: provider.name,
        durationMs: result.durationMs,
      }));
    }
    return {
      status: "complete",
      provider: provider.name,
      model: provider.model,
      durationMs: result.durationMs,
    };
  } catch (error) {
    return failure(provider, error);
  }
}

export async function runConnectionSample(input: {
  classificationProvider: AiProvider;
  interpretationProvider: AiProvider;
  prices: AiPrices;
}): Promise<ConnectionSampleResult> {
  const [classification] = await Promise.allSettled([
    input.classificationProvider.classify(connectionSamplePaper),
  ]);
  const [interpretation] = await Promise.allSettled([
    input.interpretationProvider.interpret(connectionSamplePaper),
  ]);

  return {
    classification: settledSample(
      classification,
      input.classificationProvider,
      input.prices,
    ),
    interpretation: settledSample(
      interpretation,
      input.interpretationProvider,
      input.prices,
    ),
  };
}

function settledSample<T>(
  result: PromiseSettledResult<AiProviderResult<T>>,
  provider: AiProvider,
  prices: AiPrices,
): ConnectionSampleSuccess<T> | ConnectionTestFailure {
  if (result.status === "rejected") {
    return failure(provider, result.reason);
  }
  return {
    status: "complete",
    provider: result.value.provider,
    model: result.value.model,
    durationMs: result.value.durationMs,
    usage: result.value.usage,
    cost: estimateCost({ usage: result.value.usage, prices }),
    output: result.value.output,
  };
}

function failure(provider: AiProvider, error: unknown): ConnectionTestFailure {
  const normalized = error instanceof AiProviderError
    ? error
    : new AiProviderError("business_validation", { provider: provider.name, cause: error });
  return {
    status: "failed",
    provider: provider.name,
    model: provider.model,
    durationMs: normalized.durationMs ?? 0,
    errorCode: normalized.code,
  };
}
