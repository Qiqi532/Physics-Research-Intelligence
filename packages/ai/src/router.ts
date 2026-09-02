import { AiProviderError, type AiErrorCode } from "./errors";
import type {
  AiProvider,
  AiProviderResult,
  AiUsage,
  PaperAiInput,
  ScreenInput,
} from "./provider";
import type {
  ClassificationOutput,
  InterpretationOutput,
  ScreenBatchOutput,
} from "./schemas";

export type AiRouteAttempt = {
  provider: string;
  model: string;
  status: "complete" | "failed";
  usage?: AiUsage;
  durationMs: number;
  errorCode?: AiErrorCode;
};

export type AiRouteOutcome<T> =
  | {
      ok: true;
      result: AiProviderResult<T>;
      attempts: AiRouteAttempt[];
    }
  | {
      ok: false;
      errorCode: AiErrorCode;
      attempts: AiRouteAttempt[];
    };

type RouteInput = {
  primary: AiProvider;
  fallback?: AiProvider;
  input: PaperAiInput;
};

type BatchRouteInput = {
  primary: AiProvider;
  fallback?: AiProvider;
  inputs: ScreenInput[];
  userInterests?: Record<string, number>;
};

type ProviderCall<T> = (
  provider: AiProvider,
  input: PaperAiInput,
) => Promise<AiProviderResult<T>>;

type BatchProviderCall = (
  provider: AiProvider,
  inputs: ScreenInput[],
) => Promise<AiProviderResult<ScreenBatchOutput>>;

export function routeClassification(
  input: RouteInput,
): Promise<AiRouteOutcome<ClassificationOutput>> {
  return route(input, (provider, paper) => provider.classify(paper));
}

export function routeInterpretation(
  input: RouteInput,
): Promise<AiRouteOutcome<InterpretationOutput>> {
  return route(input, (provider, paper) => provider.interpret(paper));
}

export function routeScreenBatch(
  input: BatchRouteInput,
): Promise<AiRouteOutcome<ScreenBatchOutput>> {
  return routeBatch(input, (provider, papers) =>
    provider.screenBatch(papers, input.userInterests),
  );
}

async function route<T>(
  input: RouteInput,
  call: ProviderCall<T>,
): Promise<AiRouteOutcome<T>> {
  const attempts: AiRouteAttempt[] = [];
  const primaryResult = await attempt(input.primary, input.input, call);
  attempts.push(primaryResult.attempt);

  if (primaryResult.ok) {
    return { ok: true, result: primaryResult.result, attempts };
  }

  if (!primaryResult.error.retryableForFallback || !input.fallback) {
    return {
      ok: false,
      errorCode: primaryResult.error.code,
      attempts,
    };
  }

  const fallbackResult = await attempt(input.fallback, input.input, call);
  attempts.push(fallbackResult.attempt);

  return fallbackResult.ok
    ? { ok: true, result: fallbackResult.result, attempts }
    : {
        ok: false,
        errorCode: fallbackResult.error.code,
        attempts,
      };
}

async function routeBatch(
  input: BatchRouteInput,
  call: BatchProviderCall,
): Promise<AiRouteOutcome<ScreenBatchOutput>> {
  const attempts: AiRouteAttempt[] = [];
  const primaryResult = await attemptBatch(input.primary, input.inputs, call);
  attempts.push(primaryResult.attempt);

  if (primaryResult.ok) {
    return { ok: true, result: primaryResult.result, attempts };
  }

  if (!primaryResult.error.retryableForFallback || !input.fallback) {
    return {
      ok: false,
      errorCode: primaryResult.error.code,
      attempts,
    };
  }

  const fallbackResult = await attemptBatch(input.fallback, input.inputs, call);
  attempts.push(fallbackResult.attempt);

  return fallbackResult.ok
    ? { ok: true, result: fallbackResult.result, attempts }
    : {
        ok: false,
        errorCode: fallbackResult.error.code,
        attempts,
      };
}

async function attempt<T>(
  provider: AiProvider,
  input: PaperAiInput,
  call: ProviderCall<T>,
): Promise<
  | {
      ok: true;
      result: AiProviderResult<T>;
      attempt: AiRouteAttempt;
    }
  | {
      ok: false;
      error: AiProviderError;
      attempt: AiRouteAttempt;
    }
> {
  try {
    const result = await call(provider, input);
    return {
      ok: true,
      result,
      attempt: {
        provider: result.provider,
        model: result.model,
        status: "complete",
        ...(result.usage ? { usage: result.usage } : {}),
        durationMs: result.durationMs,
      },
    };
  } catch (error) {
    const normalized = error instanceof AiProviderError
      ? error
      : new AiProviderError("business_validation", {
          provider: provider.name,
          cause: error,
        });
    return {
      ok: false,
      error: normalized,
      attempt: {
        provider: provider.name,
        model: provider.model,
        status: "failed",
        durationMs: normalized.durationMs ?? 0,
        errorCode: normalized.code,
      },
    };
  }
}

async function attemptBatch(
  provider: AiProvider,
  inputs: ScreenInput[],
  call: BatchProviderCall,
): Promise<
  | {
      ok: true;
      result: AiProviderResult<ScreenBatchOutput>;
      attempt: AiRouteAttempt;
    }
  | {
      ok: false;
      error: AiProviderError;
      attempt: AiRouteAttempt;
    }
> {
  try {
    const result = await call(provider, inputs);
    return {
      ok: true,
      result,
      attempt: {
        provider: result.provider,
        model: result.model,
        status: "complete",
        ...(result.usage ? { usage: result.usage } : {}),
        durationMs: result.durationMs,
      },
    };
  } catch (error) {
    const normalized = error instanceof AiProviderError
      ? error
      : new AiProviderError("business_validation", {
          provider: provider.name,
          cause: error,
        });
    return {
      ok: false,
      error: normalized,
      attempt: {
        provider: provider.name,
        model: provider.model,
        status: "failed",
        durationMs: normalized.durationMs ?? 0,
        errorCode: normalized.code,
      },
    };
  }
}
