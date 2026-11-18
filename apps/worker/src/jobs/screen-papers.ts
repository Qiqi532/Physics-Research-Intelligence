import {
  CLASSIFY_PROMPT_VERSION,
  SCREEN_PROMPT_VERSION,
  routeScreenBatch,
  type AiErrorCode,
  type AiProvider,
} from "@pri/ai";
import type { AiRepository, SafePaperFacts } from "@pri/db";
import { isHighQualityJournal } from "@pri/domain/journal-whitelist";
import { matchResearch, publicResearchContext, type ResearchProfile } from "@pri/domain/research-profile";
import {
  createBatchIdempotencyKey,
  createBatchInputHash,
  toAttemptInputs,
  toScreenInput,
} from "./ai-job";

export type ScreenPapersRepository = Pick<
  AiRepository,
  | "listPapersForScreening"
  | "findSuccessfulRun"
  | "claimRun"
  | "appendAttempts"
  | "completeRun"
  | "failRun"
  | "saveScreeningResults"
  | "replaceClassifications"
> & {
  listUserInterests?: (userId: string) => Promise<Array<{ tagSlug: string; weight: number }>>;
};

type ScreenPapersInput = {
  from: Date;
  until: Date;
  /** Maximum papers to screen after journal filtering. */
  limit: number;
  /** Papers per LLM batch request. */
  batchSize: number;
  repository: ScreenPapersRepository;
  primary: AiProvider;
  fallback?: AiProvider;
  research?: { profile: ResearchProfile; hash: string };
  papers?: SafePaperFacts[];
  runScope?: string;
  /** Optional user interests: tagSlug -> weight. Boosts matching directions. */
  userInterests?: Record<string, number>;
  now?: () => Date;
  onBatchComplete?: (batch: {
    index: number;
    total: number;
    screened: number;
    selected: number;
  }) => void;
};

export type ScreenPapersOutcome = {
  status: "complete";
  /** Total papers that passed journal filtering and were sent to screening. */
  screened: number;
  /** Total papers marked selected by the LLM. */
  selected: number;
  /** Number of batches processed. */
  batches: number;
  /** Per-batch failure details (does not stop other batches). */
  failures: Array<{ batchIndex: number; errorCode: AiErrorCode }>;
  batchIds?: string[];
};

export async function screenPapers(
  input: ScreenPapersInput,
): Promise<ScreenPapersOutcome> {
  if (!Number.isInteger(input.batchSize) || input.batchSize <= 0) {
    throw new Error("screen_batch_size_invalid");
  }

  const now = input.now ?? (() => new Date());
  const allPapers = input.papers ?? await input.repository.listPapersForScreening({
    from: input.from,
    until: input.until,
    limit: input.limit,
    ...(input.research ? { includeScreened: true } : {}),
  });

  // Load user interests if available (optional, for test mock compatibility).
  let userInterests = input.userInterests;
  if (!userInterests && input.repository.listUserInterests) {
    const rows = await input.repository.listUserInterests("default");
    userInterests = Object.fromEntries(
      rows.map(({ tagSlug, weight }) => [tagSlug, weight]),
    );
  }

  // Stage 1: deterministic journal quality filter (no LLM call).
  const journalFiltered = input.research
    ? allPapers.filter((paper) => matchResearch(input.research!.profile, paper).kind !== "none")
    : allPapers.filter((paper) => isHighQualityJournal(paper.journal));
  const context = input.research ? publicResearchContext(input.research.profile, input.research.hash) : undefined;
  const batchIds: string[] = [];

  if (journalFiltered.length === 0) {
    return {
      status: "complete",
      screened: 0,
      selected: 0,
      batches: 0,
      failures: [],
    };
  }

  // Stage 2: batch LLM screening.
  const batches = chunk(journalFiltered, input.batchSize);
  let totalSelected = 0;
  const failures: Array<{ batchIndex: number; errorCode: AiErrorCode }> = [];

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex]!;
    const screenInputs = batch.map(toScreenInput);
    const inputHash = createBatchInputHash(screenInputs, { context, userInterests: userInterests ?? null });
    const batchKey = `${input.primary.name}|${input.from.toISOString()}|${input.until.toISOString()}|${inputHash}`;
    const idempotencyKey = `${input.runScope ? `daily:${input.runScope}:` : ""}${createBatchIdempotencyKey({
      batchKey,
      model: input.primary.model,
      promptVersion: SCREEN_PROMPT_VERSION,
    })}`;
    batchIds.push(idempotencyKey);

    const successful = await input.repository.findSuccessfulRun(idempotencyKey);
    if (successful) {
      // Already screened this batch; skip.
      input.onBatchComplete?.({
        index: batchIndex,
        total: batches.length,
        screened: batch.length,
        selected: 0,
      });
      continue;
    }

    const claim = await input.repository.claimRun({
      paperId: batch[0]!.id,
      runType: "SCREEN",
      idempotencyKey,
      provider: input.primary.name,
      model: input.primary.model,
      promptVersion: SCREEN_PROMPT_VERSION,
      inputHash,
    });

    if (claim.status === "complete" || claim.status === "in_progress") {
      if (claim.status === "in_progress") failures.push({ batchIndex, errorCode: "business_validation" });
      input.onBatchComplete?.({
        index: batchIndex,
        total: batches.length,
        screened: batch.length,
        selected: 0,
      });
      continue;
    }

    const completedAt = now();
    const outcome = await routeScreenBatch({
      primary: input.primary,
      fallback: input.fallback,
      inputs: screenInputs,
      userInterests: Object.keys(userInterests ?? {}).length > 0 ? userInterests : undefined,
      researchContext: context,
    });

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
      failures.push({ batchIndex, errorCode: outcome.errorCode });
      continue;
    }

    try {
      const inputIds = new Set(batch.map((paper) => paper.id));
      const outputIds = outcome.result.output.papers.map((paper) => paper.paperId);
      const uniqueOutputIds = new Set(outputIds);
      const coversInputExactly =
        outputIds.length === inputIds.size &&
        uniqueOutputIds.size === inputIds.size &&
        outputIds.every((paperId) => inputIds.has(paperId));
      if (!coversInputExactly) {
        throw new Error("screen_output_paper_ids_invalid");
      }

      const results = outcome.result.output.papers
        .map((paper) => {
          const original = batch.find((p) => p.id === paper.paperId);
          if (!original) return null;
          let evidenceSource = paper.evidenceSource;
          let evidenceQuote = paper.evidenceQuote;
          if (context) {
            const evidenceText = paper.evidenceSource === "abstract"
              ? original.abstract?.trim().slice(0, context.abstractMaxChars) : original.title;
            if (!paper.evidenceSource || !paper.evidenceQuote || !evidenceText?.includes(paper.evidenceQuote)) {
              if (paper.selected) throw new Error("screen_evidence_invalid");
              // Rejected papers do not enter the report. Preserve a verifiable metadata anchor.
              evidenceSource = "title";
              evidenceQuote = original.title.slice(0, 500);
            }
          }
          return {
            paperId: original.id,
            score: paper.score,
            directionSlug: paper.directionSlug,
            reason: paper.reason,
            selected: paper.selected,
            ...(evidenceSource ? { evidenceSource, evidenceQuote } : {}),
          };
        })
        .filter((result): result is NonNullable<typeof result> => result !== null);

      const selectedInBatch = results.filter((r) => r.selected).length;
      totalSelected += selectedInBatch;

      await input.repository.saveScreeningResults({
        batchId: idempotencyKey,
        provider: outcome.result.provider,
        model: outcome.result.model,
        promptVersion: SCREEN_PROMPT_VERSION,
        results,
      });

      // Also write classification records so the Today recommendation
      // engine (which reads PaperClassification) can surface these papers.
      for (const result of results) {
        await input.repository.replaceClassifications({
          paperId: result.paperId,
          model: outcome.result.model,
          promptVersion: CLASSIFY_PROMPT_VERSION,
          classifications: [
            {
              tagSlug: result.directionSlug,
              relevance: result.score,
              reason: result.reason,
            },
          ],
        });
      }

      await input.repository.completeRun({
        runId: claim.run.id,
        provider: outcome.result.provider,
        model: outcome.result.model,
        completedAt,
      });

      input.onBatchComplete?.({
        index: batchIndex,
        total: batches.length,
        screened: batch.length,
        selected: selectedInBatch,
      });
    } catch (error) {
      await input.repository.failRun({
        runId: claim.run.id,
        errorCode: error instanceof Error && ["screen_output_paper_ids_invalid", "screen_evidence_invalid"].includes(error.message)
          ? error.message : "screen_persistence_failed",
        completedAt,
      });
      failures.push({ batchIndex, errorCode: "business_validation" });
    }
  }

  return {
    status: "complete",
    screened: journalFiltered.length,
    selected: totalSelected,
    batches: batches.length,
    failures,
    batchIds,
  };
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}
