import {
  INTERPRET_PROMPT_VERSION,
  routeInterpretation,
  type AiErrorCode,
  type AiProvider,
  type InterpretationOutput,
} from "@pri/ai";
import type { AiRepository, SafePaperFacts } from "@pri/db";
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
  paper?: SafePaperFacts;
  runScope?: string;
  validateEvidence?: boolean;
};

export type InterpretPaperOutcome =
  | { status: "complete"; runId: string }
  | { status: "duplicate"; runId: string }
  | { status: "in_progress"; runId: string }
  | { status: "failed"; runId?: string; errorCode: AiErrorCode };

export async function interpretPaper(
  input: InterpretPaperInput,
): Promise<InterpretPaperOutcome> {
  const paper = input.paper ?? await input.repository.findPaperForAi(input.paperId);
  if (!paper) {
    return { status: "failed", errorCode: "business_validation" };
  }
  const paperInput = toPaperAiInput(paper);
  const idempotencyKey = `${input.runScope ? `daily:${input.runScope}:` : ""}${createIdempotencyKey({
    paperId: paper.id,
    provider: input.primary.name,
    inputHash: createInputHash(paperInput),
    runType: "INTERPRET",
    model: input.primary.model,
    promptVersion: INTERPRET_PROMPT_VERSION,
  })}`;
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
    if (input.validateEvidence) validateInterpretationEvidence(outcome.result.output, paperInput);
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
  } catch (error) {
    await input.repository.failRun({
      runId: claim.run.id,
      errorCode: error instanceof Error && ["interpretation_basis_invalid", "interpretation_evidence_invalid"].includes(error.message)
        ? error.message : "business_validation",
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

export function validateInterpretationEvidence(output: InterpretationOutput, paper: { title: string; abstract?: string | null; journal?: string | null; publishedAt?: string | null }) {
  if (output.basis !== "abstract_only") throw new Error("interpretation_basis_invalid");
  const claims = [output.overviewZh, output.researchQuestion, ...output.innovations,
    ...output.methodsAndEvidence, ...output.limitations];
  for (const claim of claims) {
    for (const reference of claim.evidenceReferences) {
      const sources = reference.source === "abstract" ? [paper.abstract] : reference.source === "metadata"
        ? [paper.title, paper.journal, paper.publishedAt] : [];
      if (!reference.quote || !sources.some((text) => text?.includes(reference.quote!))) {
        throw new Error("interpretation_evidence_invalid");
      }
    }
  }
}
