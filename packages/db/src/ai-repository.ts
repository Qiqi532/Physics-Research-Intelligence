import type { Prisma } from "./generated/prisma/client";
import type { DatabaseClient } from "./client";
import { canReserveBudget } from "@pri/ai/budget";

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
  runType: "CLASSIFY" | "INTERPRET";
  idempotencyKey: string;
  provider: string;
  model: string;
  promptVersion: string;
  inputHash: string;
  reservedCostUsd: number;
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
  estimatedCostUsd: number;
  completedAt: Date;
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
  findPaperForAi(paperId: string): Promise<SafePaperFacts | null>;
  findSuccessfulRun(idempotencyKey: string): Promise<{ id: string } | null>;
  claimRun(input: ClaimAiRunInput): Promise<
    | { status: "claimed"; run: { id: string } }
    | { status: "complete"; run: { id: string } }
    | { status: "in_progress"; run: { id: string } }
  >;
  reserveInterpretationRun(input: {
    claim: ClaimAiRunInput;
    from: Date;
    until: Date;
    now: Date;
    budgetMicroUsd: number;
    reservationMicroUsd: number;
  }): Promise<
    | { status: "claimed"; run: { id: string } }
    | { status: "complete"; run: { id: string } }
    | { status: "in_progress"; run: { id: string } }
    | { status: "budget_exceeded"; run: { id: string } }
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
  sumDailyAttemptCost(input: { from: Date; until: Date }): Promise<number>;
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
            status: { in: ["PENDING", "FAILED", "SKIPPED_BUDGET"] },
          },
          data: {
            status: "RUNNING",
            provider: input.provider,
            model: input.model,
            promptVersion: input.promptVersion,
            inputHash: input.inputHash,
            reservedCostUsd: input.reservedCostUsd,
            errorCode: null,
            completedAt: null,
          },
        });
        return claimed.count === 1
          ? { status: "claimed" as const, run: { id: existing.id } }
          : { status: "in_progress" as const, run: { id: existing.id } };
      }
    },

    async reserveInterpretationRun(input) {
      return client.$transaction(async (transaction) => {
        const lockKey = `pri-ai-budget:${input.from.toISOString().slice(0, 10)}`;
        await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

        const existing = await transaction.aiRun.findUnique({
          where: { idempotencyKey: input.claim.idempotencyKey },
          select: { id: true, status: true },
        });
        if (existing?.status === "COMPLETE") {
          return { status: "complete" as const, run: { id: existing.id } };
        }
        if (existing?.status === "RUNNING") {
          return { status: "in_progress" as const, run: { id: existing.id } };
        }

        const [spent, reserved] = await Promise.all([
          transaction.aiRunAttempt.aggregate({
            where: {
              aiRun: { runType: "INTERPRET" },
              completedAt: { gte: input.from, lt: input.until },
            },
            _sum: { estimatedCostUsd: true },
          }),
          transaction.aiRun.aggregate({
            where: {
              status: "RUNNING",
              reservedAt: { gte: input.from, lt: input.until },
              ...(existing ? { id: { not: existing.id } } : {}),
            },
            _sum: { reservedCostUsd: true },
          }),
        ]);
        const budgetAvailable = canReserveBudget({
          spentMicroUsd: usdToMicroUsd(spent._sum.estimatedCostUsd),
          reservedMicroUsd: usdToMicroUsd(reserved._sum.reservedCostUsd),
          requestMicroUsd: input.reservationMicroUsd,
          budgetMicroUsd: input.budgetMicroUsd,
        });
        const reservationUsd = input.reservationMicroUsd / 1_000_000;

        if (!budgetAvailable) {
          const run = await transaction.aiRun.upsert({
            where: { idempotencyKey: input.claim.idempotencyKey },
            create: {
              ...input.claim,
              reservedCostUsd: null,
              reservedAt: null,
              status: "SKIPPED_BUDGET",
              errorCode: "budget_exceeded",
              completedAt: input.now,
            },
            update: {
              status: "SKIPPED_BUDGET",
              reservedCostUsd: null,
              reservedAt: null,
              errorCode: "budget_exceeded",
              completedAt: input.now,
            },
            select: { id: true },
          });
          return { status: "budget_exceeded" as const, run };
        }

        const run = await transaction.aiRun.upsert({
          where: { idempotencyKey: input.claim.idempotencyKey },
          create: {
            ...input.claim,
            reservedCostUsd: reservationUsd,
            reservedAt: input.now,
            status: "RUNNING",
          },
          update: {
            provider: input.claim.provider,
            model: input.claim.model,
            promptVersion: input.claim.promptVersion,
            inputHash: input.claim.inputHash,
            status: "RUNNING",
            reservedCostUsd: reservationUsd,
            reservedAt: input.now,
            errorCode: null,
            completedAt: null,
          },
          select: { id: true },
        });
        return { status: "claimed" as const, run };
      });
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
          estimatedCostUsd: aggregate.estimatedCostUsd,
          reservedCostUsd: null,
          reservedAt: null,
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
          estimatedCostUsd: aggregate.estimatedCostUsd,
          reservedCostUsd: null,
          reservedAt: null,
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

    async sumDailyAttemptCost(input) {
      const aggregate = await client.aiRunAttempt.aggregate({
        where: {
          aiRun: { runType: "INTERPRET" },
          completedAt: { gte: input.from, lt: input.until },
        },
        _sum: { estimatedCostUsd: true },
      });
      return Number(aggregate._sum.estimatedCostUsd ?? 0);
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
      estimatedCostUsd: true,
    },
  });
  return {
    inputTokens: aggregate._sum.inputTokens,
    outputTokens: aggregate._sum.outputTokens,
    totalTokens: aggregate._sum.totalTokens,
    durationMs: aggregate._sum.durationMs,
    estimatedCostUsd: aggregate._sum.estimatedCostUsd,
  };
}

function usdToMicroUsd(value: Prisma.Decimal | null): number {
  return Math.round(Number(value ?? 0) * 1_000_000);
}
