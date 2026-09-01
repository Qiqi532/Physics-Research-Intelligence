import {
  CLASSIFY_PROMPT_VERSION,
  routeClassification,
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

export type ClassifyPaperRepository = Pick<
  AiRepository,
  | "findPaperForAi"
  | "findSuccessfulRun"
  | "claimRun"
  | "appendAttempts"
  | "completeRun"
  | "failRun"
  | "replaceClassifications"
>;

type ClassifyPaperInput = {
  paperId: string;
  repository: ClassifyPaperRepository;
  primary: AiProvider;
  fallback?: AiProvider;
  now?: () => Date;
};

export type ClassifyPaperOutcome =
  | { status: "complete"; runId: string }
  | { status: "duplicate"; runId: string }
  | { status: "in_progress"; runId: string }
  | { status: "failed"; runId?: string; errorCode: AiErrorCode };

export async function classifyPaper(
  input: ClassifyPaperInput,
): Promise<ClassifyPaperOutcome> {
  const paper = await input.repository.findPaperForAi(input.paperId);
  if (!paper) {
    return { status: "failed", errorCode: "business_validation" };
  }
  const paperInput = toPaperAiInput(paper);
  const idempotencyKey = createIdempotencyKey({
    paperId: paper.id,
    runType: "CLASSIFY",
    model: input.primary.model,
    promptVersion: CLASSIFY_PROMPT_VERSION,
  });
  const successful = await input.repository.findSuccessfulRun(idempotencyKey);
  if (successful) {
    return { status: "duplicate", runId: successful.id };
  }
  const claim = await input.repository.claimRun({
    paperId: paper.id,
    runType: "CLASSIFY",
    idempotencyKey,
    provider: input.primary.name,
    model: input.primary.model,
    promptVersion: CLASSIFY_PROMPT_VERSION,
    inputHash: createInputHash(paperInput),
  });
  if (claim.status === "complete") {
    return { status: "duplicate", runId: claim.run.id };
  }
  if (claim.status === "in_progress") {
    return { status: "in_progress", runId: claim.run.id };
  }

  const now = input.now ?? (() => new Date());
  const outcome = await routeClassification({
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
    await input.repository.replaceClassifications({
      paperId: paper.id,
      model: outcome.result.model,
      promptVersion: CLASSIFY_PROMPT_VERSION,
      classifications: outcome.result.output.tags.map((tag) => ({
        tagSlug: tag.slug,
        relevance: tag.relevance,
        reason: tag.reason,
      })),
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
