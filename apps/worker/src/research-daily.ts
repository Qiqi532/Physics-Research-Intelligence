import { createHash } from "node:crypto";
import { isHighQualityJournal } from "@pri/domain/journal-whitelist";
import { matchResearch, type ResearchProfile } from "@pri/domain/research-profile";
import { dailyReportSchema, type DailyReportSnapshot, type DailyReportItem, type SourceCoverage } from "@pri/domain/daily-report";
import type { DailyRepository } from "@pri/db";
import type { DailyWindow } from "./scheduler";
import type { DailyPipelineResult } from "./daily-pipeline";
import type { ScreenPapersOutcome } from "./jobs/screen-papers";

export type DailyCandidate = {
  id: string; doi: string | null; title: string; abstract: string | null; journal: string | null;
  publishedAt: string | null; createdAt: string; originalUrl: string | null;
  accessStatus: "UNKNOWN" | "OPEN" | "RESTRICTED"; sourceName: string | null;
};
export type DailyScreening = {
  paperId: string; score: number; selected: boolean; reason: string;
  evidenceSource: string | null; evidenceQuote: string | null;
  provider: string; model: string; promptVersion: string; inputHash: string;
};
type Interpretation = NonNullable<DailyReportItem["interpretation"]>;
type Progress = {
  version?: 1; coverage?: SourceCoverage[]; candidates?: DailyCandidate[];
  screening?: ScreenPapersOutcome; results?: DailyScreening[];
  selected?: string[]; interpretations?: Record<string, Interpretation>;
};

export type ResearchDailyDependencies = {
  window: DailyWindow; research: { profile: ResearchProfile; hash: string }; executionVersion: string;
  store: Pick<DailyRepository, "open" | "checkpoint" | "fail" | "publish">;
  ingest(): Promise<SourceCoverage[]>;
  candidates(): Promise<DailyCandidate[]>;
  screen(papers: DailyCandidate[], scope: string): Promise<ScreenPapersOutcome>;
  screeningResults(batchIds: string[]): Promise<DailyScreening[]>;
  interpret(paper: DailyCandidate, scope: string): Promise<Interpretation | null>;
  prune(): Promise<DailyPipelineResult["cleanup"]>;
  assertLock?: () => void; now?: () => Date;
};

export function dailyExecutionKey(dateKey: string, profileHash: string, executionVersion: string): string {
  return createHash("sha256").update(JSON.stringify([dateKey, profileHash, executionVersion])).digest("hex");
}

export function selectResearchPapers(input: {
  profile: ResearchProfile; candidates: DailyCandidate[]; results: DailyScreening[]; maxCount: number;
}): string[] {
  const byId = new Map(input.candidates.map((paper) => [paper.id, paper]));
  const ranked = input.results.flatMap((result) => {
    const paper = byId.get(result.paperId);
    if (!paper || !result.selected || result.score < 0.55) return [];
    const match = matchResearch(input.profile, paper);
    if (match.kind === "none") return [];
    return [{ id: paper.id, kind: match.kind,
      score: result.score * 0.65 + match.score * 0.35 + (isHighQualityJournal(paper.journal) ? 0.02 : 0) }];
  }).sort((a, b) => Number(b.kind === "core") - Number(a.kind === "core") || b.score - a.score || a.id.localeCompare(b.id));
  let adjacent = 0;
  return ranked.filter((paper) => paper.kind === "core" || adjacent++ < input.profile.screening.adjacentMax)
    .slice(0, input.maxCount).map((paper) => paper.id);
}

export async function runResearchDaily(deps: ResearchDailyDependencies, maxCount: number): Promise<DailyPipelineResult> {
  const executionKey = dailyExecutionKey(deps.window.key, deps.research.hash, deps.executionVersion);
  const run = await deps.store.open({ executionKey, dateKey: deps.window.key,
    profileHash: deps.research.hash, profileLabel: deps.research.profile.label });
  const now = deps.now ?? (() => new Date());
  let stage = "ingest";
  const state = run.checkpoint as Progress;
  const save = async () => {
    deps.assertLock?.();
    state.version = 1;
    await deps.store.checkpoint(run.id, stage, state);
  };
  if (run.report) {
    const snapshot = dailyReportSchema.parse(run.report.snapshot);
    return resultFor(snapshot, state, { status: "ok", deleted: 0 }, true);
  }
  try {
    if (state.version && state.version !== 1) throw new Error("daily_checkpoint_version_invalid");
    await save();
    if (!state.coverage) {
      const coverage = await deps.ingest();
      if (coverage.every((source) => source.status === "failed")) throw new Error("all_sources_failed");
      state.coverage = coverage;
      await save();
    }
    stage = "screen";
    await save();
    if (!state.candidates) {
      state.candidates = (await deps.candidates()).filter((paper) => matchResearch(deps.research.profile, paper).kind !== "none")
        .sort((a, b) => {
          const left = matchResearch(deps.research.profile, a), right = matchResearch(deps.research.profile, b);
          return Number(right.kind === "core") - Number(left.kind === "core") || right.score - left.score ||
            (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "") || a.id.localeCompare(b.id);
        }).slice(0, deps.research.profile.screening.candidateLimit);
      await save();
    }
    if (!state.screening) {
      state.screening = await deps.screen(state.candidates, executionKey);
      await save();
    }
    if (!state.results) {
      const results = await deps.screeningResults(state.screening.batchIds ?? []);
      const ids = new Set(results.map((result) => result.paperId));
      const inputIds = new Set(state.candidates.map((paper) => paper.id));
      if (results.length === 0 && state.candidates.length > 0 && state.screening.failures.length > 0) {
        delete state.screening;
        await save();
        throw new Error("screening_incomplete");
      }
      if (ids.size !== results.length || results.some((result) => !inputIds.has(result.paperId)) ||
          (state.screening.failures.length === 0 && ids.size !== inputIds.size)) throw new Error("screening_results_missing");
      state.results = results;
      await save();
    }
    if (!state.selected) {
      state.selected = selectResearchPapers({ profile: deps.research.profile, candidates: state.candidates,
        results: state.results, maxCount });
      await save();
    }
    stage = "interpret";
    await save();
    state.interpretations ??= {};
    let failed = false;
    for (const id of state.selected) {
      if (state.interpretations[id]) continue;
      deps.assertLock?.();
      const paper = state.candidates.find((candidate) => candidate.id === id)!;
      if (!paper.abstract?.trim()) continue;
      const interpretation = await deps.interpret(paper, executionKey);
      if (interpretation) { state.interpretations[id] = interpretation; await save(); }
      else failed = true;
    }
    const usable = state.selected.filter((id) => state.interpretations![id] ||
      !state.candidates!.find((paper) => paper.id === id)!.abstract?.trim());
    if (failed && usable.length === 0) throw new Error("interpretation_incomplete");
    stage = "publish";
    const snapshot = makeSnapshot(deps, state);
    deps.assertLock?.();
    await deps.store.publish(run.id, snapshot, now());
    let cleanup: DailyPipelineResult["cleanup"];
    try { cleanup = await deps.prune(); } catch { cleanup = { status: "failed", errorCode: "retention_cleanup_failed" }; }
    return resultFor(snapshot, state, cleanup, false);
  } catch (error) {
    const code = error instanceof Error && ["all_sources_failed", "screening_incomplete", "screening_results_missing",
      "interpretation_incomplete", "daily_lock_lost", "daily_checkpoint_version_invalid"].includes(error.message)
      ? error.message : `daily_${stage}_failed`;
    deps.assertLock?.();
    await deps.store.fail(run.id, stage, code, !!state.coverage);
    throw new Error(code);
  }
}

function makeSnapshot(deps: ResearchDailyDependencies, state: Progress): DailyReportSnapshot {
  const usable = state.selected!.filter((id) => state.interpretations![id] ||
    !state.candidates!.find((paper) => paper.id === id)!.abstract?.trim());
  const titleOnly = usable.filter((id) => !state.interpretations![id]).length;
  return dailyReportSchema.parse({ schemaVersion: 1, dateKey: deps.window.key,
    profileHash: deps.research.hash, profileLabel: deps.research.profile.label,
    sourceCoverage: state.coverage, validation: { mode: "single_model", semanticSupport: "unverified",
      unavailableInterpretations: state.selected!.length - usable.length, titleOnly,
      unscreenedCandidates: state.candidates!.length - state.results!.length },
    // Only outputs belonging to completed screening runs can enter the immutable selection.
    items: usable.map((id) => {
      const paper = state.candidates!.find((entry) => entry.id === id)!;
      const result = state.results!.find((entry) => entry.paperId === id)!;
      const match = matchResearch(deps.research.profile, paper);
      const topic = deps.research.profile.topics.find((entry) => entry.id === match.topicId)!;
      if (!result.evidenceQuote || !["abstract", "title"].includes(result.evidenceSource ?? "") ||
          !(result.evidenceSource === "abstract" ? paper.abstract?.trim().slice(0, deps.research.profile.screening.abstractMaxChars) : paper.title)?.includes(result.evidenceQuote)) {
        throw new Error("daily_evidence_invalid");
      }
      return { paperId: paper.id, doi: paper.doi, title: paper.title, journal: paper.journal,
        publishedAt: paper.publishedAt, createdAt: paper.createdAt, originalUrl: paper.originalUrl,
        accessStatus: paper.accessStatus, sourceName: paper.sourceName, score: result.score,
        topicId: topic.id, topicLabel: topic.label, topicKind: topic.kind,
        reasons: [...match.reasons, result.reason, ...(match.seed ? [`方向种子：${match.seed.title}（${match.seed.doi}）`] : []),
          ...(!paper.abstract?.trim() ? ["缺少公开摘要，仅列题录，未生成解读"] : []),
          ...((paper.abstract?.length ?? 0) > deps.research.profile.screening.abstractMaxChars ? ["筛选摘要已截断"] : [])],
        evidence: { source: result.evidenceSource, quote: result.evidenceQuote, verification: "exact_substring" },
        screening: { provider: result.provider, model: result.model, promptVersion: result.promptVersion, inputHash: result.inputHash },
        interpretation: state.interpretations![id] ?? null,
      };
    }),
  });
}

function resultFor(snapshot: DailyReportSnapshot, state: Progress, cleanup: DailyPipelineResult["cleanup"], reused: boolean): DailyPipelineResult {
  const interpreted = snapshot.items.filter((item) => item.interpretation).length;
  return { windowKey: snapshot.dateKey, ingestedRecords: snapshot.sourceCoverage.reduce((sum, source) => sum + source.records, 0),
    screening: { screened: state.screening?.screened ?? 0, selected: state.results?.filter((result) => result.selected).length ?? 0,
      batches: state.screening?.batches ?? 0, failedBatches: state.screening?.failures.length ?? 0 },
    interpretation: { complete: reused ? 0 : interpreted, duplicate: reused ? interpreted : 0,
      failed: snapshot.validation.unavailableInterpretations ?? 0, inProgress: 0 },
    recommendations: snapshot.items.length, cleanup,
    report: { status: snapshot.sourceCoverage.some((source) => source.status !== "complete") ||
      (snapshot.validation.unavailableInterpretations ?? 0) > 0 || (snapshot.validation.unscreenedCandidates ?? 0) > 0 ? "partial" : "complete", reused },
  };
}
