import {
  INTERPRET_PROMPT_VERSION,
  routeInterpretation,
  type AiErrorCode,
  type AiProvider,
} from "@pri/ai";
import type { AiRepository } from "@pri/db";
import {
  createIdempotencyKey,
  createInputHash,
  toAttemptInputs,
  toPaperAiInput,
} from "./ai-job";

export type InterpretPaperRepository = Pick<
  AiRepository,
  | "findPaperForAi"
  | "findSuccessfulRun"
  | "claimRun"
  | "appendAttempts"
  | "completeRun"
  | "failRun"
  | "saveInterpretation"
>;

type InterpretPaperInput = {
  paperId: string;
  repository: InterpretPaperRepository;
  primary: AiProvider;
  fallback?: AiProvider;
  now?: () => Date;
};

export type InterpretPaperOutcome =
  | { status: "complete"; runId: string }
  | { status: "duplicate"; runId: string }
  | { status: "in_progress"; runId: string }
  | { status: "failed"; runId?: string; errorCode: AiErrorCode };

export async function interpretPaper(
  input: InterpretPaperInput,
): Promise<InterpretPaperOutcome> {
  const paper = await input.repository.findPaperForAi(input.paperId);
  if (!paper) {
    return { status: "failed", errorCode: "business_validation" };
  }
  const paperInput = toPaperAiInput(paper);
  const idempotencyKey = createIdempotencyKey({
    paperId: paper.id,
    runType: "INTERPRET",
    model: input.primary.model,
    promptVersion: INTERPRET_PROMPT_VERSION,
  });
  const successful = await input.repository.findSuccessfulRun(idempotencyKey);
  if (successful) {
    return { status: "duplicate", runId: successful.id };
  }

  const now = input.now ?? (() => new Date());
  const claim = await input.repository.claimRun({
    paperId: paper.id,
    runType: "INTERPRET",
    idempotencyKey,
    provider: input.primary.name,
    model: input.primary.model,
    promptVersion: INTERPRET_PROMPT_VERSION,
    inputHash: createInputHash(paperInput),
  });
  if (claim.status === "complete") {
    return { status: "duplicate", runId: claim.run.id };
  }
  if (claim.status === "in_progress") {
    return { status: "in_progress", runId: claim.run.id };
  }
  const outcome = await routeInterpretation({
    primary: input.primary,
    fallback: input.fallback,
    input: paperInput,
  });
  const completedAt = now();
  await input.repository.appendAttempts(
    claim.run.id,
    toAttemptInputs(outcome.attempts, completedAt),
  );
  if (!outcome.ok) {
    await input.repository.failRun({
      runId: claim.run.id,
      errorCode: outcome.errorCode,
      completedAt,
    });
    return {
      status: "failed",
      runId: claim.run.id,
      errorCode: outcome.errorCode,
    };
  }

  try {
    await input.repository.saveInterpretation({
      paperId: paper.id,
      provider: outcome.result.provider,
      model: outcome.result.model,
      promptVersion: INTERPRET_PROMPT_VERSION,
      content: JSON.parse(JSON.stringify(outcome.result.output)) as Record<string, unknown>,
    });
    await input.repository.completeRun({
      runId: claim.run.id,
      provider: outcome.result.provider,
      model: outcome.result.model,
      completedAt,
    });
  } catch {
    await input.repository.failRun({
      runId: claim.run.id,
      errorCode: "business_validation",
      completedAt,
    });
    return {
      status: "failed",
      runId: claim.run.id,
      errorCode: "business_validation",
    };
  }
  return { status: "complete", runId: claim.run.id };
}
