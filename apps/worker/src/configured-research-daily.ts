import { createConnectionProvider, SCREEN_PROMPT_VERSION, INTERPRET_PROMPT_VERSION } from "@pri/ai";
import { createAiRepository, createDailyRepository, createModelSettingsCipher, createModelSettingsRepository,
  createPaperRepository, createSourceSyncRepository, withDailyLock, type DatabaseClient, type SafePaperFacts } from "@pri/db";
import type { ServerConfig } from "@pri/domain/config";
import type { SourceCoverage } from "@pri/domain/daily-report";
import { loadResearchProfile } from "@pri/domain/research-profile-node";
import { researchQueryTerms } from "@pri/domain/research-profile";
import { freezeRanking } from "@pri/domain/ranking-review";
import { createArxivConnector, createOpenAlexConnector, SourceConnectorError, type SourceConnector } from "@pri/sources";
import { createTaskProviders, retentionCutoffAt } from "./configured-daily-processor";
import { dailyWindowAt } from "./scheduler";
import { runResearchDaily, dailyExecutionKey, type DailyCandidate } from "./research-daily";
import { createRuntimeAiConfigResolver, type RuntimeAiConfigResolver, type RuntimeAiSnapshot } from "./runtime-ai-config";
import { ingestSource } from "./jobs/ingest-source";
import { screenPapers } from "./jobs/screen-papers";
import { interpretPaper } from "./jobs/interpret-paper";
import { createInputHash, toPaperAiInput } from "./jobs/ai-job";
import { withModelRetry } from "./jobs/model-retry";
import { rankingSeeds } from "./ranking-seeds";

export type ResearchDailyOptions = {
  resolver?: RuntimeAiConfigResolver; createProvider?: typeof createConnectionProvider;
  connectors?: SourceConnector[]; research?: ReturnType<typeof loadResearchProfile>; now?: () => Date;
};

export async function runConfiguredResearchDaily(client: DatabaseClient, config: ServerConfig, options: ResearchDailyOptions) {
  return withDailyLock(config.DATABASE_URL, async (assertLock) => {
    const now = options.now ?? (() => new Date());
    const research = options.research ?? loadResearchProfile();
    const window = dailyWindowAt(now(), config.DAILY_PIPELINE.timezone, config.DAILY_PIPELINE.time, config.DAILY_PIPELINE.ingestWindowDays);
    const store = createDailyRepository(client);
    const ai = createAiRepository(client);
    const papers = createPaperRepository(client);
    const sourceState = createSourceSyncRepository(client);
    const resolver = options.resolver ?? createRuntimeAiConfigResolver({ repository: createModelSettingsRepository(client),
      cipher: createModelSettingsCipher({ keyFilePath: config.AI_SETTINGS_MASTER_KEY_FILE }), environmentConfig: config.AI,
      classifyMaxOutputTokens: config.AI?.classify.maxOutputTokens, interpretMaxOutputTokens: config.AI?.interpret.maxOutputTokens });
    let snapshot: RuntimeAiSnapshot;
    try { snapshot = await resolver.resolve(); }
    catch {
      const run = await store.open({ executionKey: dailyExecutionKey(window.key, research.hash, "configuration"),
        dateKey: window.key, profileHash: research.hash, profileLabel: research.profile.label });
      await store.fail(run.id, "configuration", "model_configuration_unavailable", false);
      throw new Error("model_configuration_unavailable");
    }
    const createProvider = options.createProvider ?? createConnectionProvider;
    const screening = createTaskProviders({ ...snapshot.classify,
      maxOutputTokens: Math.max(snapshot.classify.maxOutputTokens, 2048) }, createProvider);
    const interpretation = createTaskProviders(snapshot.interpret, createProvider);
    const terms = researchQueryTerms(research.profile);
    const connectors = options.connectors ?? research.profile.sources.enabled.map((name) => name === "arxiv"
      ? createArxivConnector({ categories: research.profile.sources.arxivCategories, searchTerms: terms, newestFirst: true })
      : createOpenAlexConnector({ apiKey: config.OPENALEX_API_KEY, searchTerms: terms, newestFirst: true }));
    const routeVersion = (route: RuntimeAiSnapshot["classify"]) => ({
      primary: { provider: route.primary.provider, model: route.primary.model, baseUrl: route.primary.baseUrl },
      fallback: route.fallback ? { provider: route.fallback.provider, model: route.fallback.model, baseUrl: route.fallback.baseUrl } : null,
      maxOutputTokens: route.maxOutputTokens,
    });
    const executionVersion = JSON.stringify({ version: 1, screen: SCREEN_PROMPT_VERSION, interpret: INTERPRET_PROMPT_VERSION,
      classify: routeVersion(snapshot.classify), interpretation: routeVersion(snapshot.interpret),
      maxCount: config.DAILY_PAPER_TARGET_MAX, recencyDays: config.DAILY_PIPELINE.deliveryRecencyDays,
      windowDays: config.DAILY_PIPELINE.ingestWindowDays, timezone: config.DAILY_PIPELINE.timezone, time: config.DAILY_PIPELINE.time });
    await store.recoverInterruptedRuns();
    return runResearchDaily({ window, research, store, executionVersion, now, assertLock,
      async ingest() {
        return Promise.all(connectors.map(async (connector): Promise<SourceCoverage> => {
          const stateKey = `${connector.name}:${research.hash}`;
          const prior = await sourceState.find(stateKey);
          const canPage = connector.name !== "openalex" || !!config.OPENALEX_API_KEY?.trim();
          const unfinished = canPage && prior?.cursor && prior.windowFrom && prior.windowUntil;
          const from = unfinished ? prior.windowFrom! : new Date(Math.max(window.from.getTime(),
            prior?.completedUntil ? prior.completedUntil.getTime() - 2 * 86400_000 : window.from.getTime()));
          const until = unfinished ? prior.windowUntil! : window.until;
          try {
            const summary = await ingestSource({ connector, stateKey, paperRepository: papers, stateRepository: sourceState,
              from, until, pageSize: research.profile.sources.pageSize, maxPages: research.profile.sources.maxPages, bounded: true, now });
            return { name: connector.name, status: summary.limited ? "limited" : "complete", records: summary.records,
              ...(summary.limitedReason ? { errorCode: summary.limitedReason } : {}) };
          } catch (error) {
            return { name: connector.name, status: "failed", records: 0,
              errorCode: error instanceof SourceConnectorError ? error.code : "request_failed" };
          }
        }));
      },
      async candidates() {
        const delivered = config.DAILY_PIPELINE.deliveryRecencyDays > 0
          ? await store.deliveredIds(new Date(window.until.getTime() - config.DAILY_PIPELINE.deliveryRecencyDays * 86400_000)) : new Set<string>();
        const rows = await client.paper.findMany({ where: { publishedAt: { gte: window.from, lte: window.until } },
          orderBy: [{ publishedAt: "desc" }, { id: "asc" }], take: 3000,
          select: { id: true, doi: true, title: true, abstract: true, journal: true, publishedAt: true,
            createdAt: true, originalUrl: true, accessStatus: true,
            sources: { orderBy: { retrievedAt: "desc" }, take: 1, select: { sourceName: true } },
            screenings: { where: { deliveredAt: { gte: new Date(window.until.getTime() - config.DAILY_PIPELINE.deliveryRecencyDays * 86400_000) } },
              take: 1, select: { id: true } } } });
        return rows.filter((paper) => !delivered.has(paper.id) &&
          (config.DAILY_PIPELINE.deliveryRecencyDays === 0 || paper.screenings.length === 0)).map((paper) => ({
            id: paper.id, doi: paper.doi, title: paper.title, abstract: paper.abstract, journal: paper.journal,
            publishedAt: paper.publishedAt?.toISOString() ?? null, createdAt: paper.createdAt.toISOString(),
            originalUrl: paper.originalUrl, accessStatus: paper.accessStatus, sourceName: paper.sources[0]?.sourceName ?? null,
          }));
      },
      async freezeCandidates(runId, checkpoint, pool) {
        const cache = await rankingSeeds(client, research.profile);
        const sample = freezeRanking(research.profile, pool, cache.seeds, cache.status);
        assertLock();
        await store.freezeCandidates(runId, checkpoint, sample);
      },
      screen(candidates, scope) {
        return withModelRetry(() => screenPapers({ from: window.from, until: window.until, limit: research.profile.screening.candidateLimit,
          batchSize: research.profile.screening.batchSize, papers: candidates.map(safeFacts), research, runScope: scope,
          repository: ai, primary: screening.primary, fallback: screening.fallback, now }), {
            assertLock, errorCode: (result) => result.failures.find((failure) => failure.errorCode !== "business_validation")?.errorCode,
          });
      },
      async screeningResults(batchIds) {
        const [results, runs] = await Promise.all([
          client.paperScreening.findMany({ where: { batchId: { in: batchIds } } }),
          client.aiRun.findMany({ where: { idempotencyKey: { in: batchIds }, status: "COMPLETE" }, select: { idempotencyKey: true, inputHash: true } }),
        ]);
        const hashes = new Map(runs.map((run) => [run.idempotencyKey, run.inputHash]));
        return results.filter((row) => hashes.has(row.batchId)).map((row) => ({ paperId: row.paperId, score: row.score,
          selected: row.selected, reason: row.reason, evidenceSource: row.evidenceSource, evidenceQuote: row.evidenceQuote,
          provider: row.provider, model: row.model, promptVersion: row.promptVersion, inputHash: hashes.get(row.batchId)! }));
      },
      async interpret(paper, scope) {
        const facts = safeFacts(paper);
        const outcome = await withModelRetry(() => interpretPaper({ paperId: paper.id, paper: facts, repository: ai, runScope: scope,
          validateEvidence: true, primary: interpretation.primary, fallback: interpretation.fallback, now }), {
            assertLock, errorCode: (result) => result.status === "failed" ? result.errorCode : undefined,
          });
        if (outcome.status !== "complete" && outcome.status !== "duplicate") return null;
        const run = await client.aiRun.findUniqueOrThrow({ where: { id: outcome.runId } });
        const content = await client.paperInterpretation.findUnique({ where: { paperId_model_promptVersion: {
          paperId: paper.id, model: run.model, promptVersion: INTERPRET_PROMPT_VERSION } } });
        if (!content || content.provider !== run.provider) return null;
        return { provider: run.provider, model: run.model, promptVersion: INTERPRET_PROMPT_VERSION,
          inputHash: createInputHash(toPaperAiInput(facts)), content: content.content as Record<string, unknown> };
      },
      async prune() {
        const outcome = await papers.pruneExpiredPapers({ cutoff: retentionCutoffAt(window.until, config.PAPER_RETENTION_DAYS) });
        return { status: "ok", deleted: outcome.deleted };
      },
    }, config.DAILY_PAPER_TARGET_MAX);
  });
}

function safeFacts(paper: DailyCandidate): SafePaperFacts {
  return { id: paper.id, title: paper.title, abstract: paper.abstract, journal: paper.journal,
    publishedAt: paper.publishedAt ? new Date(paper.publishedAt) : null, accessStatus: paper.accessStatus };
}
