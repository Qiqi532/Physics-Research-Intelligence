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
  });

  afterAll(async () => {
    await client.paper.deleteMany();
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
