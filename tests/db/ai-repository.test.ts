import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { DatabaseClient } from "../../packages/db/src/client";
import { createPrismaClient } from "../../packages/db/src/client";
import {
  createAiRepository,
  type ClaimAiRunInput,
} from "../../packages/db/src/ai-repository";
import { syncPhysicsTags } from "../../packages/db/src/paper-repository";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("PostgreSQL AI repository", () => {
  let client: DatabaseClient;
  let repository: ReturnType<typeof createAiRepository>;
  let paperId: string;

  beforeAll(() => {
    client = createPrismaClient(databaseUrl!);
    repository = createAiRepository(client);
  });

  beforeEach(async () => {
    await client.aiRun.deleteMany();
    await client.paper.deleteMany();
    await syncPhysicsTags(client);
    const paper = await client.paper.create({
      data: {
        title: "A fictional physics paper",
        normalizedTitle: "a fictional physics paper",
        abstract: "A public fictional abstract.",
        journal: "Fictional Physics",
        publishedAt: new Date("2026-08-29T00:00:00.000Z"),
        accessStatus: "RESTRICTED",
      },
    });
    paperId = paper.id;
  });

  afterAll(async () => {
    await client.aiRun.deleteMany();
    await client.paper.deleteMany();
    await client.$disconnect();
  });

  it("returns only safe paper facts for AI input", async () => {
    await expect(repository.findPaperForAi(paperId)).resolves.toEqual({
      id: paperId,
      title: "A fictional physics paper",
      abstract: "A public fictional abstract.",
      journal: "Fictional Physics",
      publishedAt: new Date("2026-08-29T00:00:00.000Z"),
      accessStatus: "RESTRICTED",
    });
  });

  it("allows exactly one concurrent claim for a logical idempotency key", async () => {
    const input = claimInput(paperId);
    const [first, second] = await Promise.all([
      repository.claimRun(input),
      repository.claimRun(input),
    ]);

    expect([first.status, second.status].sort()).toEqual(["claimed", "in_progress"]);
    expect(await client.aiRun.count()).toBe(1);
  });

  it("audits primary and fallback attempts separately and completes aggregates", async () => {
    const claim = await repository.claimRun(claimInput(paperId));
    if (claim.status !== "claimed") {
      throw new Error("Expected a claimed run");
    }
    const completedAt = new Date("2026-08-29T01:00:00.000Z");

    await repository.appendAttempts(claim.run.id, [
      {
        provider: "openai",
        model: "fixture-primary",
        status: "FAILED",
        inputTokens: null,
        outputTokens: null,
        totalTokens: null,
        durationMs: 20,
        errorCode: "rate_limited",
        estimatedCostUsd: 0,
        completedAt,
      },
      {
        provider: "deepseek",
        model: "fixture-fallback",
        status: "COMPLETE",
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        durationMs: 30,
        errorCode: null,
        estimatedCostUsd: 0.0004,
        completedAt,
      },
    ]);
    await repository.completeRun({
      runId: claim.run.id,
      provider: "deepseek",
      model: "fixture-fallback",
      completedAt,
    });

    const stored = await client.aiRun.findUniqueOrThrow({
      where: { id: claim.run.id },
      include: { attempts: { orderBy: { ordinal: "asc" } } },
    });
    expect(stored.status).toBe("COMPLETE");
    expect(stored.totalTokens).toBe(150);
    expect(stored.durationMs).toBe(50);
    expect(stored.estimatedCostUsd?.toString()).toBe("0.0004");
    expect(stored.attempts).toHaveLength(2);
    expect(stored.attempts.map(({ provider, status }) => ({ provider, status }))).toEqual([
      { provider: "openai", status: "FAILED" },
      { provider: "deepseek", status: "COMPLETE" },
    ]);
    await expect(repository.findSuccessfulRun(claimInput(paperId).idempotencyKey))
      .resolves.toEqual(expect.objectContaining({ id: claim.run.id }));
  });

  it("replaces classifications and upserts one interpretation idempotently", async () => {
    await repository.replaceClassifications({
      paperId,
      model: "fixture-model",
      promptVersion: "classify-v1",
      classifications: [{
        tagSlug: "amo-optics",
        relevance: 0.9,
        reason: "Optics.",
      }],
    });
    await repository.replaceClassifications({
      paperId,
      model: "fixture-model",
      promptVersion: "classify-v1",
      classifications: [{
        tagSlug: "plasma",
        relevance: 0.8,
        reason: "Plasma.",
      }],
    });
    const content = {
      basis: "abstract_only",
      sourceDisclosure: "基于摘要解读",
    };
    await repository.saveInterpretation({
      paperId,
      provider: "openai",
      model: "fixture-model",
      promptVersion: "interpret-v1",
      content,
    });
    await repository.saveInterpretation({
      paperId,
      provider: "deepseek",
      model: "fixture-model",
      promptVersion: "interpret-v1",
      content,
    });

    expect(await client.paperClassification.count()).toBe(1);
    expect(await client.paperClassification.findFirst()).toEqual(
      expect.objectContaining({ tagSlug: "plasma" }),
    );
    expect(await client.paperInterpretation.count()).toBe(1);
    expect(await client.paperInterpretation.findFirst()).toEqual(
      expect.objectContaining({ provider: "deepseek", status: "COMPLETE" }),
    );
  });

  it("sums physical attempt cost in a half-open UTC day", async () => {
    const claim = await repository.claimRun({
      ...claimInput(paperId),
      runType: "INTERPRET",
      idempotencyKey: `${paperId}:INTERPRET:fixture-model:interpret-v1`,
      promptVersion: "interpret-v1",
    });
    if (claim.status !== "claimed") {
      throw new Error("Expected a claimed run");
    }
    await repository.appendAttempts(claim.run.id, [
      {
        provider: "openai",
        model: "fixture-model",
        status: "COMPLETE",
        inputTokens: 10,
        outputTokens: 10,
        totalTokens: 20,
        durationMs: 5,
        errorCode: null,
        estimatedCostUsd: 0.25,
        completedAt: new Date("2026-08-29T23:59:59.999Z"),
      },
    ]);

    await expect(repository.sumDailyAttemptCost({
      from: new Date("2026-08-29T00:00:00.000Z"),
      until: new Date("2026-08-30T00:00:00.000Z"),
    })).resolves.toBe(0.25);
    await expect(repository.sumDailyAttemptCost({
      from: new Date("2026-08-30T00:00:00.000Z"),
      until: new Date("2026-08-31T00:00:00.000Z"),
    })).resolves.toBe(0);
  });

  it("serializes concurrent interpretation reservations within one UTC day", async () => {
    const input = {
      claim: {
        ...claimInput(paperId),
        runType: "INTERPRET" as const,
        idempotencyKey: `${paperId}:INTERPRET:fixture-model:interpret-v1`,
        promptVersion: "interpret-v1",
        reservedCostUsd: 0.75,
      },
      from: new Date("2026-08-29T00:00:00.000Z"),
      until: new Date("2026-08-30T00:00:00.000Z"),
      now: new Date("2026-08-29T12:00:00.000Z"),
      budgetMicroUsd: 1_000_000,
      reservationMicroUsd: 750_000,
    };
    const otherPaper = await client.paper.create({
      data: {
        title: "Another fictional paper",
        normalizedTitle: "another fictional paper",
      },
    });
    const otherInput = {
      ...input,
      claim: {
        ...input.claim,
        paperId: otherPaper.id,
        idempotencyKey: `${otherPaper.id}:INTERPRET:fixture-model:interpret-v1`,
      },
    };

    const outcomes = await Promise.all([
      repository.reserveInterpretationRun(input),
      repository.reserveInterpretationRun(otherInput),
    ]);

    expect(outcomes.map(({ status }) => status).sort()).toEqual([
      "budget_exceeded",
      "claimed",
    ]);
    expect(await client.aiRunAttempt.count()).toBe(0);
    expect(await client.aiRun.count({ where: { status: "SKIPPED_BUDGET" } })).toBe(1);
  });
});

function claimInput(paperId: string): ClaimAiRunInput {
  return {
    paperId,
    runType: "CLASSIFY",
    idempotencyKey: `${paperId}:CLASSIFY:fixture-model:classify-v1`,
    provider: "openai",
    model: "fixture-model",
    promptVersion: "classify-v1",
    inputHash: "fixture-input-hash",
    reservedCostUsd: 0,
  };
}
