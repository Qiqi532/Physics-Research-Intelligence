import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { DatabaseClient } from "../../packages/db/src/client";
import { createPrismaClient } from "../../packages/db/src/client";
import {
  createPaperRepository,
  syncPhysicsTags,
} from "../../packages/db/src/paper-repository";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("PostgreSQL paper repository", () => {
  let client: DatabaseClient;
  let repository: ReturnType<typeof createPaperRepository>;

  beforeAll(() => {
    client = createPrismaClient(databaseUrl!);
    repository = createPaperRepository(client);
  });

  beforeEach(async () => {
    await client.paper.deleteMany();
    await client.aiRun.deleteMany();
  });

  afterAll(async () => {
    await client.paper.deleteMany();
    await client.aiRun.deleteMany();
    await client.$disconnect();
  });

  it("synchronizes the fixed physics taxonomy idempotently", async () => {
    await syncPhysicsTags(client);
    await syncPhysicsTags(client);

    expect(await client.physicsTag.count()).toBe(9);
  });

  it("merges equivalent DOI forms while retaining both source snapshots", async () => {
    const first = await repository.upsertFromSource(
      sourceInput({
        doi: "https://doi.org/10.1103/PhysRevLett.123.456",
        sourceName: "crossref",
        sourceRecordId: "crossref-1",
      }),
    );
    const second = await repository.upsertFromSource(
      sourceInput({
        doi: "DOI: 10.1103/physrevlett.123.456",
        sourceName: "openalex",
        sourceRecordId: "openalex-1",
      }),
    );

    expect(second.paper.id).toBe(first.paper.id);
    expect(await client.paper.count()).toBe(1);
    expect(await client.paperSource.count()).toBe(2);

    const detail = await repository.findByDoi("10.1103/PHYSREVLETT.123.456");
    expect(detail?.sources.map(({ sourceName }) => sourceName).sort()).toEqual([
      "crossref",
      "openalex",
    ]);
  });

  it("does not erase canonical facts when a later source omits them", async () => {
    await repository.upsertFromSource(
      sourceInput({
        doi: "10.1103/complementary",
        sourceName: "crossref",
        sourceRecordId: "complete-source",
        abstract: "A complete public abstract.",
        journal: "Test Physics",
      }),
    );
    await repository.upsertFromSource(
      sourceInput({
        doi: "10.1103/complementary",
        sourceName: "openalex",
        sourceRecordId: "partial-source",
        abstract: null,
        journal: null,
      }),
    );

    const detail = await repository.findByDoi("10.1103/complementary");
    expect(detail?.abstract).toBe("A complete public abstract.");
    expect(detail?.journal).toBe("Test Physics");
  });

  it("replays the same source record idempotently", async () => {
    const input = sourceInput({ doi: undefined, sourceRecordId: "arxiv-replay" });

    const first = await repository.upsertFromSource(input);
    const second = await repository.upsertFromSource(input);

    expect(second.paper.id).toBe(first.paper.id);
    expect(await client.paper.count()).toBe(1);
    expect(await client.paperSource.count()).toBe(1);
  });

  it("keeps no-DOI records separate and returns a conservative candidate", async () => {
    const first = await repository.upsertFromSource(
      sourceInput({
        doi: undefined,
        sourceName: "arxiv",
        sourceRecordId: "2508.00001",
        title: "Quantum transport in two dimensional materials",
        firstAuthor: "Mei Lin",
        publishedAt: new Date("2026-08-20T00:00:00.000Z"),
      }),
    );
    const second = await repository.upsertFromSource(
      sourceInput({
        doi: undefined,
        sourceName: "openalex",
        sourceRecordId: "W123",
        title: "Quantum transport in two-dimensional materials",
        firstAuthor: "Mei Lin",
        publishedAt: new Date("2026-08-24T00:00:00.000Z"),
      }),
    );

    expect(second.paper.id).not.toBe(first.paper.id);
    expect(await client.paper.count()).toBe(2);
    expect(second.candidateDuplicates).toEqual([
      expect.objectContaining({ id: first.paper.id }),
    ]);
  });

  it("returns stable cursor pages without repeated papers", async () => {
    for (const sourceRecordId of ["page-1", "page-2", "page-3"]) {
      await repository.upsertFromSource(
        sourceInput({ doi: undefined, sourceRecordId, title: `Paper ${sourceRecordId}` }),
      );
    }

    const firstPage = await repository.list({ limit: 2 });
    const secondPage = await repository.list({ limit: 2, cursor: firstPage.nextCursor! });

    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextCursor).toBeTruthy();
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.items.map(({ id }) => id)).not.toContain(firstPage.items[0]?.id);
    expect(secondPage.nextCursor).toBeNull();
  });

  it("exposes favorite state on paper details", async () => {
    const created = await repository.upsertFromSource(
      sourceInput({ doi: "10.1103/favorite-detail" }),
    );
    await client.userPaperState.create({
      data: {
        userId: "default",
        paperId: created.paper.id,
        status: "READING",
        isFavorite: true,
        favoritedAt: new Date("2026-08-29T00:00:00.000Z"),
      },
    });

    const detail = await repository.findByDoi("10.1103/favorite-detail");
    expect(detail?.userState?.isFavorite).toBe(true);
    expect(detail?.userState?.favoritedAt?.toISOString()).toBe(
      "2026-08-29T00:00:00.000Z",
    );
  });
  it("prunes only papers older than the cutoff at the exact boundary", async () => {
    const cutoff = new Date("2026-08-30T00:00:00.000Z");
    const old = await client.paper.create({
      data: {
        title: "Expired paper",
        normalizedTitle: "expired paper",
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
      },
    });
    const atBoundary = await client.paper.create({
      data: {
        title: "At boundary paper",
        normalizedTitle: "at boundary paper",
        createdAt: cutoff,
      },
    });
    const fresh = await client.paper.create({
      data: {
        title: "Fresh paper",
        normalizedTitle: "fresh paper",
        createdAt: new Date("2026-09-01T00:00:00.000Z"),
      },
    });

    const outcome = await repository.pruneExpiredPapers({ cutoff });

    expect(outcome).toEqual({ deleted: 1 });
    expect(await client.paper.findUnique({ where: { id: old.id } })).toBeNull();
    expect(await client.paper.findUnique({ where: { id: atBoundary.id } })).not.toBeNull();
    expect(await client.paper.findUnique({ where: { id: fresh.id } })).not.toBeNull();
  });

  it("preserves favorited papers and prunes non-favorites past the cutoff", async () => {
    const cutoff = new Date("2026-08-30T00:00:00.000Z");
    const favorite = await client.paper.create({
      data: {
        title: "Favorite paper",
        normalizedTitle: "favorite paper",
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
        userStates: {
          create: {
            userId: "default",
            status: "SAVED",
            isFavorite: true,
            favoritedAt: new Date("2026-08-01T00:00:00.000Z"),
          },
        },
      },
    });
    const plain = await client.paper.create({
      data: {
        title: "Plain expired paper",
        normalizedTitle: "plain expired paper",
        createdAt: new Date("2026-07-02T00:00:00.000Z"),
      },
    });

    const outcome = await repository.pruneExpiredPapers({ cutoff });

    expect(outcome).toEqual({ deleted: 1 });
    expect(await client.paper.findUnique({ where: { id: favorite.id } })).not.toBeNull();
    expect(await client.paper.findUnique({ where: { id: plain.id } })).toBeNull();
  });

  it("cascades cleanup through dependent records and nulls AiRun paper ids", async () => {
    await syncPhysicsTags(client);
    const cutoff = new Date("2026-08-30T00:00:00.000Z");
    const paper = await client.paper.create({
      data: {
        title: "Cascading paper",
        normalizedTitle: "cascading paper",
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
        sources: {
          create: {
            sourceName: "arxiv",
            sourceRecordId: "cascade-source",
            sourceUrl: "https://example.test/cascade",
            retrievedAt: new Date("2026-07-01T00:00:00.000Z"),
            title: "Cascading paper",
          },
        },
        classifications: {
          create: {
            tagSlug: "amo-optics",
            relevance: 0.8,
            reason: "Cascade.",
            model: "fixture-model",
            promptVersion: "classify-v1",
          },
        },
        interpretations: {
          create: {
            content: { basis: "abstract_only" },
            status: "COMPLETE",
            provider: "fixture-provider",
            model: "fixture-model",
            promptVersion: "interpret-v1",
          },
        },
        userStates: {
          create: {
            userId: "default",
            status: "READING",
            feedback: "LIKE",
          },
        },
      },
    });
    const aiRun = await client.aiRun.create({
      data: {
        paperId: paper.id,
        runType: "CLASSIFY",
        idempotencyKey: "cascade-run",
        provider: "fixture-provider",
        model: "fixture-model",
        promptVersion: "classify-v1",
        inputHash: "cascade-hash",
        status: "COMPLETE",
        attempts: {
          create: {
            ordinal: 1,
            provider: "fixture-provider",
            model: "fixture-model",
            inputTokens: 10,
            outputTokens: 10,
            totalTokens: 20,
            durationMs: 5,
            status: "COMPLETE",
            estimatedCostUsd: 0,
            completedAt: new Date("2026-07-01T00:00:00.000Z"),
          },
        },
      },
    });

    const outcome = await repository.pruneExpiredPapers({ cutoff });

    expect(outcome).toEqual({ deleted: 1 });
    expect(await client.paper.count()).toBe(0);
    expect(await client.paperSource.count()).toBe(0);
    expect(await client.paperClassification.count()).toBe(0);
    expect(await client.paperInterpretation.count()).toBe(0);
    expect(await client.userPaperState.count()).toBe(0);
    const storedRun = await client.aiRun.findUnique({ where: { id: aiRun.id } });
    expect(storedRun?.paperId).toBeNull();
    expect(await client.aiRunAttempt.count()).toBe(1);
  });

  it("prunes a paper once its favorite is removed", async () => {
    const cutoff = new Date("2026-08-30T00:00:00.000Z");
    const paper = await client.paper.create({
      data: {
        title: "Was favorite paper",
        normalizedTitle: "was favorite paper",
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
      },
    });
    await client.userPaperState.create({
      data: { userId: "default", paperId: paper.id, isFavorite: true },
    });

    await repository.pruneExpiredPapers({ cutoff });
    expect(await client.paper.findUnique({ where: { id: paper.id } })).not.toBeNull();

    await client.userPaperState.update({
      where: { userId_paperId: { userId: "default", paperId: paper.id } },
      data: { isFavorite: false, favoritedAt: null },
    });
    const outcome = await repository.pruneExpiredPapers({ cutoff });

    expect(outcome).toEqual({ deleted: 1 });
    expect(await client.paper.findUnique({ where: { id: paper.id } })).toBeNull();
  });

  it("converges across two cleanup executions in the same window", async () => {
    const cutoff = new Date("2026-08-30T00:00:00.000Z");
    for (const record of ["converge-1", "converge-2"]) {
      await client.paper.create({
        data: {
          title: `Converge ${record}`,
          normalizedTitle: `converge ${record}`,
          createdAt: new Date("2026-07-01T00:00:00.000Z"),
        },
      });
    }
    const favorite = await client.paper.create({
      data: {
        title: "Converge favorite",
        normalizedTitle: "converge favorite",
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
        userStates: {
          create: { userId: "default", isFavorite: true },
        },
      },
    });

    const first = await repository.pruneExpiredPapers({ cutoff });
    const second = await repository.pruneExpiredPapers({ cutoff });

    expect(first).toEqual({ deleted: 2 });
    expect(second).toEqual({ deleted: 0 });
    expect(await client.paper.count()).toBe(1);
    expect(await client.paper.findUnique({ where: { id: favorite.id } })).not.toBeNull();
  });

  it("lists favorite papers ordered by most recently favorited first", async () => {
    await syncPhysicsTags(client);
    const older = await repository.upsertFromSource(
      sourceInput({ doi: "10.1103/fav-older", sourceRecordId: "fav-older" }),
    );
    const newer = await repository.upsertFromSource(
      sourceInput({ doi: "10.1103/fav-newer", sourceRecordId: "fav-newer" }),
    );
    const plain = await repository.upsertFromSource(
      sourceInput({ doi: "10.1103/fav-plain", sourceRecordId: "fav-plain" }),
    );
    await client.userPaperState.create({
      data: {
        userId: "default",
        paperId: older.paper.id,
        status: "READING",
        feedback: "LIKE",
        isFavorite: true,
        favoritedAt: new Date("2026-08-28T00:00:00.000Z"),
      },
    });
    await client.userPaperState.create({
      data: {
        userId: "default",
        paperId: newer.paper.id,
        status: "COMPLETE",
        feedback: "NONE",
        isFavorite: true,
        favoritedAt: new Date("2026-08-30T00:00:00.000Z"),
      },
    });
    await client.paperClassification.create({
      data: {
        paperId: newer.paper.id,
        tagSlug: "amo-optics",
        relevance: 0.9,
        reason: "Favorite list test",
        model: "fixture-model",
        promptVersion: "classify-v1",
      },
    });

    const favorites = await repository.listFavorites("default");

    expect(favorites.map(({ id }) => id)).toEqual([newer.paper.id, older.paper.id]);
    expect(favorites.map(({ id }) => id)).not.toContain(plain.paper.id);
    expect(favorites[0]).toEqual(expect.objectContaining({
      readingStatus: "COMPLETE",
      feedback: "NONE",
    }));
    expect(favorites[0]?.favoritedAt.toISOString()).toBe("2026-08-30T00:00:00.000Z");
    expect(favorites[0]?.tags.map(({ slug }) => slug)).toEqual(["amo-optics"]);
  });

  it("returns an empty favorite list when nothing is favorited", async () => {
    await repository.upsertFromSource(sourceInput({ doi: "10.1103/no-favorites" }));

    expect(await repository.listFavorites("default")).toEqual([]);
  });

});

function sourceInput(
  overrides: Partial<{
    doi: string | undefined;
    sourceName: string;
    sourceRecordId: string;
    title: string;
    firstAuthor: string;
    publishedAt: Date;
    abstract: string | null;
    journal: string | null;
  }> = {},
) {
  return {
    doi: "10.5555/default-doi",
    sourceName: "arxiv",
    sourceRecordId: "default-record",
    sourceUrl: "https://example.test/source/default-record",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    retrievedAt: new Date("2026-08-29T00:00:00.000Z"),
    title: "A default physics paper",
    abstract: "A public abstract used for a repository test.",
    journal: "Test Physics",
    firstAuthor: "A. Researcher",
    publishedAt: new Date("2026-08-20T00:00:00.000Z"),
    originalUrl: "https://example.test/paper/default-record",
    accessStatus: "OPEN" as const,
    ...overrides,
  };
}
