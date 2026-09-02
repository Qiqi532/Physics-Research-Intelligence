import type { Prisma } from "./generated/prisma/client";
import type { DatabaseClient } from "./client";

export type SafePaperFacts = {
  id: string;
  title: string;
  abstract: string | null;
  journal: string | null;
  publishedAt: Date | null;
  accessStatus: "UNKNOWN" | "OPEN" | "RESTRICTED";
};

export type ClaimAiRunInput = {
  paperId: string;
  runType: "CLASSIFY" | "INTERPRET" | "SCREEN";
  idempotencyKey: string;
  provider: string;
  model: string;
  promptVersion: string;
  inputHash: string;
};

export type AiAttemptInput = {
  provider: string;
  model: string;
  status: "COMPLETE" | "FAILED";
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  durationMs: number;
  errorCode: string | null;
  completedAt: Date;
};

export type ScreeningResultInput = {
  paperId: string;
  score: number;
  directionSlug: string;
  reason: string;
  selected: boolean;
};

export interface AiRepository {
  listPaperIdsForClassification(input: {
    from: Date;
    until: Date;
    limit: number;
  }): Promise<string[]>;
  listPaperIdsForInterpretation(input: {
    from: Date;
    until: Date;
    limit: number;
  }): Promise<string[]>;
  /**
   * List papers in the daily window that have no screening record yet.
   * Returns full public facts so the caller can apply the journal whitelist
   * before batching them to the LLM.
   */
  listPapersForScreening(input: {
    from: Date;
    until: Date;
    limit: number;
  }): Promise<SafePaperFacts[]>;
  listDailySelectionCandidates(input: {
    from: Date;
    until: Date;
    limit: number;
  }): Promise<{
    interests: Record<string, number>;
    candidates: Array<{
      id: string;
      publishedAt: Date | null;
      classifications: Array<{
        tagSlug: string;
        relevance: number;
        isCrossDisciplinary: boolean;
      }>;
    }>;
  }>;
  /**
   * List papers that passed screening (selected=true) for final daily
   * selection. Includes score and direction for diversity-aware picking.
   */
  listScreenedSelectionCandidates(input: {
    from: Date;
    until: Date;
    limit: number;
  }): Promise<{
    interests: Record<string, number>;
    candidates: Array<{
      id: string;
      publishedAt: Date | null;
      score: number;
      directionSlug: string;
      selected: boolean;
    }>;
  }>;
  findPaperForAi(paperId: string): Promise<SafePaperFacts | null>;
  findSuccessfulRun(idempotencyKey: string): Promise<{ id: string } | null>;
  claimRun(input: ClaimAiRunInput): Promise<
    | { status: "claimed"; run: { id: string } }
    | { status: "complete"; run: { id: string } }
    | { status: "in_progress"; run: { id: string } }
  >;
  appendAttempts(aiRunId: string, attempts: AiAttemptInput[]): Promise<void>;
  completeRun(input: {
    runId: string;
    provider: string;
    model: string;
    completedAt: Date;
  }): Promise<void>;
  failRun(input: {
    runId: string;
    errorCode: string;
    completedAt: Date;
  }): Promise<void>;
  replaceClassifications(input: {
    paperId: string;
    model: string;
    promptVersion: string;
    classifications: Array<{
      tagSlug: string;
      relevance: number;
      reason: string;
    }>;
  }): Promise<void>;
  saveInterpretation(input: {
    paperId: string;
    provider: string;
    model: string;
    promptVersion: string;
    content: Record<string, unknown>;
  }): Promise<void>;
  /**
   * Upsert a batch of screening results. Each paper gets one row per
   * (paperId, model, promptVersion); re-running with the same version
   * updates score/direction/reason/selected in place.
   */
  saveScreeningResults(input: {
    batchId: string;
    provider: string;
    model: string;
    promptVersion: string;
    results: ScreeningResultInput[];
  }): Promise<void>;
}

export function createAiRepository(client: DatabaseClient): AiRepository {
  return {
    async listPaperIdsForClassification(input) {
      const papers = await client.paper.findMany({
        where: { publishedAt: { gte: input.from, lte: input.until } },
        orderBy: [{ publishedAt: "asc" }, { id: "asc" }],
        take: input.limit,
        select: { id: true },
      });
      return papers.map(({ id }) => id);
    },

    async listPaperIdsForInterpretation(input) {
      const papers = await client.paper.findMany({
        where: {
          publishedAt: { gte: input.from, lte: input.until },
          classifications: { some: {} },
        },
        orderBy: [{ publishedAt: "asc" }, { id: "asc" }],
        take: input.limit,
        select: { id: true },
      });
      return papers.map(({ id }) => id);
    },

    async listPapersForScreening(input) {
      const papers = await client.paper.findMany({
        where: {
          publishedAt: { gte: input.from, lte: input.until },
          screenings: { none: {} },
        },
        orderBy: [{ publishedAt: "asc" }, { id: "asc" }],
        take: input.limit,
        select: {
          id: true,
          title: true,
          abstract: true,
          journal: true,
          publishedAt: true,
          accessStatus: true,
        },
      });
      return papers;
    },

    async listDailySelectionCandidates(input) {
      const [interestRows, paperRows] = await Promise.all([
        client.userInterest.findMany({
          where: { userId: "default" },
          select: { tagSlug: true, weight: true },
        }),
        client.paper.findMany({
          where: {
            publishedAt: { gte: input.from, lte: input.until },
            classifications: { some: {} },
          },
          orderBy: [{ publishedAt: "asc" }, { id: "asc" }],
          take: input.limit,
          select: {
            id: true,
            publishedAt: true,
            classifications: {
              orderBy: [{ relevance: "desc" }, { tagSlug: "asc" }],
              select: {
                tagSlug: true,
                relevance: true,
                tag: { select: { isCrossDisciplinary: true } },
              },
            },
          },
        }),
      ]);
      const interests = Object.fromEntries(
        interestRows.map(({ tagSlug, weight }) => [tagSlug, weight]),
      );
      return {
        interests,
        candidates: paperRows.map((paper) => ({
          id: paper.id,
          publishedAt: paper.publishedAt,
          classifications: paper.classifications.map(
            ({ tagSlug, relevance, tag }) => ({
              tagSlug,
              relevance,
              isCrossDisciplinary: tag.isCrossDisciplinary,
            }),
          ),
        })),
      };
    },

    async listScreenedSelectionCandidates(input) {
      const [interestRows, paperRows] = await Promise.all([
        client.userInterest.findMany({
          where: { userId: "default" },
          select: { tagSlug: true, weight: true },
        }),
        client.paper.findMany({
          where: {
            publishedAt: { gte: input.from, lte: input.until },
            screenings: { some: { selected: true } },
          },
          orderBy: [{ publishedAt: "asc" }, { id: "asc" }],
          take: input.limit,
          select: {
            id: true,
            publishedAt: true,
            screenings: {
              where: { selected: true },
              orderBy: [{ score: "desc" }, { createdAt: "desc" }],
              take: 1,
              select: {
                score: true,
                directionSlug: true,
                selected: true,
              },
            },
          },
        }),
      ]);
      const interests = Object.fromEntries(
        interestRows.map(({ tagSlug, weight }) => [tagSlug, weight]),
      );
      return {
        interests,
        candidates: paperRows
          .filter((paper) => paper.screenings.length > 0)
          .map((paper) => ({
            id: paper.id,
            publishedAt: paper.publishedAt,
            score: paper.screenings[0]!.score,
            directionSlug: paper.screenings[0]!.directionSlug,
            selected: paper.screenings[0]!.selected,
          })),
      };
    },

    async findPaperForAi(paperId) {
      return client.paper.findUnique({
        where: { id: paperId },
        select: {
          id: true,
          title: true,
          abstract: true,
          journal: true,
          publishedAt: true,
          accessStatus: true,
        },
      });
    },

    async findSuccessfulRun(idempotencyKey) {
      return client.aiRun.findFirst({
        where: { idempotencyKey, status: "COMPLETE" },
        select: { id: true },
      });
    },

    async claimRun(input) {
      try {
        const run = await client.aiRun.create({
          data: {
            ...input,
            status: "RUNNING",
          },
          select: { id: true },
        });
        return { status: "claimed" as const, run };
      } catch (error) {
        const existing = await client.aiRun.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
          select: { id: true, status: true },
        });
        if (!existing) {
          throw error;
        }
        if (existing.status === "COMPLETE") {
          return { status: "complete" as const, run: { id: existing.id } };
        }
        if (existing.status === "RUNNING") {
          return { status: "in_progress" as const, run: { id: existing.id } };
        }

        const claimed = await client.aiRun.updateMany({
          where: {
            id: existing.id,
            status: { in: ["PENDING", "FAILED"] },
          },
          data: {
            status: "RUNNING",
            provider: input.provider,
            model: input.model,
            promptVersion: input.promptVersion,
            inputHash: input.inputHash,
            errorCode: null,
            completedAt: null,
          },
        });
        return claimed.count === 1
          ? { status: "claimed" as const, run: { id: existing.id } }
          : { status: "in_progress" as const, run: { id: existing.id } };
      }
    },

    async appendAttempts(aiRunId, attempts) {
      await client.$transaction(async (transaction) => {
        const latest = await transaction.aiRunAttempt.findFirst({
          where: { aiRunId },
          orderBy: { ordinal: "desc" },
          select: { ordinal: true },
        });
        const firstOrdinal = (latest?.ordinal ?? 0) + 1;
        await transaction.aiRunAttempt.createMany({
          data: attempts.map((attempt, index) => ({
            aiRunId,
            ordinal: firstOrdinal + index,
            ...attempt,
          })),
        });
      });
    },

    async completeRun(input) {
      const aggregate = await aggregateAttempts(client, input.runId);
      await client.aiRun.update({
        where: { id: input.runId },
        data: {
          provider: input.provider,
          model: input.model,
          status: "COMPLETE",
          inputTokens: aggregate.inputTokens,
          outputTokens: aggregate.outputTokens,
          totalTokens: aggregate.totalTokens,
          durationMs: aggregate.durationMs,
          errorCode: null,
          completedAt: input.completedAt,
        },
      });
    },

    async failRun(input) {
      const aggregate = await aggregateAttempts(client, input.runId);
      await client.aiRun.update({
        where: { id: input.runId },
        data: {
          status: "FAILED",
          inputTokens: aggregate.inputTokens,
          outputTokens: aggregate.outputTokens,
          totalTokens: aggregate.totalTokens,
          durationMs: aggregate.durationMs,
          errorCode: input.errorCode,
          completedAt: input.completedAt,
        },
      });
    },

    async replaceClassifications(input) {
      await client.$transaction(async (transaction) => {
        await transaction.paperClassification.deleteMany({
          where: {
            paperId: input.paperId,
            model: input.model,
            promptVersion: input.promptVersion,
          },
        });
        await transaction.paperClassification.createMany({
          data: input.classifications.map((classification) => ({
            paperId: input.paperId,
            model: input.model,
            promptVersion: input.promptVersion,
            ...classification,
          })),
        });
      });
    },

    async saveInterpretation(input) {
      const content = input.content as Prisma.InputJsonValue;
      await client.paperInterpretation.upsert({
        where: {
          paperId_model_promptVersion: {
            paperId: input.paperId,
            model: input.model,
            promptVersion: input.promptVersion,
          },
        },
        create: {
          ...input,
          content,
          status: "COMPLETE",
        },
        update: {
          provider: input.provider,
          content,
          status: "COMPLETE",
        },
      });
    },

    async saveScreeningResults(input) {
      await client.$transaction(async (transaction) => {
        for (const result of input.results) {
          await transaction.paperScreening.upsert({
            where: {
              paperId_model_promptVersion: {
                paperId: result.paperId,
                model: input.model,
                promptVersion: input.promptVersion,
              },
            },
            create: {
              paperId: result.paperId,
              score: result.score,
              directionSlug: result.directionSlug,
              reason: result.reason,
              selected: result.selected,
              batchId: input.batchId,
              provider: input.provider,
              model: input.model,
              promptVersion: input.promptVersion,
            },
            update: {
              score: result.score,
              directionSlug: result.directionSlug,
              reason: result.reason,
              selected: result.selected,
              batchId: input.batchId,
              provider: input.provider,
            },
          });
        }
      });
    },

  };
}

async function aggregateAttempts(client: DatabaseClient, aiRunId: string) {
  const aggregate = await client.aiRunAttempt.aggregate({
    where: { aiRunId },
    _sum: {
      inputTokens: true,
      outputTokens: true,
      totalTokens: true,
      durationMs: true,
    },
  });
  return {
    inputTokens: aggregate._sum.inputTokens,
    outputTokens: aggregate._sum.outputTokens,
    totalTokens: aggregate._sum.totalTokens,
    durationMs: aggregate._sum.durationMs,
  };
}
