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
    await client.userInterest.deleteMany();
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
    await client.userInterest.deleteMany();
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
    expect(stored.attempts).toHaveLength(2);
    expect(stored.attempts.map(({ provider, status }) => ({ provider, status }))).toEqual([
      { provider: "openai", status: "FAILED" },
      { provider: "deepseek", status: "COMPLETE" },
    ]);
    await expect(repository.findSuccessfulRun(claimInput(paperId).idempotencyKey))
      .resolves.toEqual(expect.objectContaining({ id: claim.run.id }));
  });

  it("keeps aggregate token usage null when every provider attempt omits it", async () => {
    const claim = await repository.claimRun(claimInput(paperId));
    if (claim.status !== "claimed") {
      throw new Error("Expected a claimed run");
    }
    const completedAt = new Date("2026-08-29T01:00:00.000Z");

    await repository.appendAttempts(claim.run.id, [{
      provider: "compatible",
      model: "usage-optional-fixture",
      status: "COMPLETE",
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      durationMs: 25,
      errorCode: null,
      completedAt,
    }]);
    await repository.completeRun({
      runId: claim.run.id,
      provider: "compatible",
      model: "usage-optional-fixture",
      completedAt,
    });

    const stored = await client.aiRun.findUniqueOrThrow({ where: { id: claim.run.id } });
    expect(stored.inputTokens).toBeNull();
    expect(stored.outputTokens).toBeNull();
    expect(stored.totalTokens).toBeNull();
    expect(stored.durationMs).toBe(25);
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

  it("lists daily selection candidates with tags and interests", async () => {
    await repository.replaceClassifications({
      paperId,
      model: "fixture-model",
      promptVersion: "classify-v1",
      classifications: [{ tagSlug: "amo-optics", relevance: 0.9, reason: "Optics." }],
    });
    await client.userInterest.create({
      data: { userId: "default", tagSlug: "amo-optics", weight: 2 },
    });
    await client.paper.create({
      data: {
        title: "Unclassified fictional paper",
        normalizedTitle: "unclassified fictional paper",
        publishedAt: new Date("2026-08-28T00:00:00.000Z"),
      },
    });

    const result = await repository.listDailySelectionCandidates({
      from: new Date("2026-08-01T00:00:00.000Z"),
      until: new Date("2026-09-01T00:00:00.000Z"),
      limit: 50,
    });

    expect(result.interests).toEqual({ "amo-optics": 2 });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toEqual({
      id: paperId,
      publishedAt: new Date("2026-08-29T00:00:00.000Z"),
      classifications: [
        { tagSlug: "amo-optics", relevance: 0.9, isCrossDisciplinary: false },
      ],
    });
  });

  it("excludes unclassified papers and papers outside the window", async () => {
    await repository.replaceClassifications({
      paperId,
      model: "fixture-model",
      promptVersion: "classify-v1",
      classifications: [{ tagSlug: "plasma", relevance: 0.8, reason: "Plasma." }],
    });
    const outside = await client.paper.create({
      data: {
        title: "Outside window paper",
        normalizedTitle: "outside window paper",
        publishedAt: new Date("2026-06-01T00:00:00.000Z"),
      },
    });
    await repository.replaceClassifications({
      paperId: outside.id,
      model: "fixture-model",
      promptVersion: "classify-v1",
      classifications: [{ tagSlug: "plasma", relevance: 0.5, reason: "Plasma." }],
    });

    const result = await repository.listDailySelectionCandidates({
      from: new Date("2026-08-01T00:00:00.000Z"),
      until: new Date("2026-09-01T00:00:00.000Z"),
      limit: 50,
    });

    expect(result.candidates.map((candidate) => candidate.id)).toEqual([paperId]);
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
  };
}
