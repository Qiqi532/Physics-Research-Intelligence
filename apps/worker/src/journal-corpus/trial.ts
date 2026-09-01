import type {
  ClassifyPaperOutcome,
} from "../jobs/classify-paper";
import type {
  InterpretPaperOutcome,
} from "../jobs/interpret-paper";

type TrialTaskOutcome = {
  status: string;
  runId?: string;
  errorCode?: string;
};

export type JournalCorpusTrialResult = {
  outcomes: Array<{
    arxivId: string;
    paperId: string;
    classification: TrialTaskOutcome;
    interpretation: TrialTaskOutcome;
  }>;
  summary: {
    total: number;
    classificationComplete: number;
    interpretationComplete: number;
    failed: number;
  };
};

export async function runJournalCorpusTrial(input: {
  papers: readonly { arxivId: string; paperId: string }[];
  classify(paperId: string): Promise<ClassifyPaperOutcome>;
  interpret(paperId: string): Promise<InterpretPaperOutcome>;
}): Promise<JournalCorpusTrialResult> {
  const outcomes: JournalCorpusTrialResult["outcomes"] = [];

  for (const paper of input.papers) {
    const classification = await runTask(() => input.classify(paper.paperId));
    const interpretation = await runTask(() => input.interpret(paper.paperId));
    outcomes.push({ ...paper, classification, interpretation });
  }

  return {
    outcomes,
    summary: {
      total: outcomes.length,
      classificationComplete: outcomes.filter(({ classification }) =>
        isComplete(classification)
      ).length,
      interpretationComplete: outcomes.filter(({ interpretation }) =>
        isComplete(interpretation)
      ).length,
      failed: outcomes.filter(({ classification, interpretation }) =>
        isFailure(classification) || isFailure(interpretation)
      ).length,
    },
  };
}

async function runTask(
  task: () => Promise<ClassifyPaperOutcome | InterpretPaperOutcome>,
): Promise<TrialTaskOutcome> {
  try {
    return safeTaskOutcome(await task());
  } catch {
    return { status: "failed", errorCode: "trial_runtime_error" };
  }
}

function safeTaskOutcome(
  outcome: ClassifyPaperOutcome | InterpretPaperOutcome,
): TrialTaskOutcome {
  return {
    status: outcome.status,
    ...("runId" in outcome ? { runId: outcome.runId } : {}),
    ...("errorCode" in outcome ? { errorCode: outcome.errorCode } : {}),
  };
}

function isComplete(outcome: TrialTaskOutcome): boolean {
  return outcome.status === "complete" || outcome.status === "duplicate";
}

function isFailure(outcome: TrialTaskOutcome): boolean {
  return outcome.status === "failed" || outcome.status === "skipped";
}
