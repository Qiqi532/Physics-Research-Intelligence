import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { DatabaseClient } from "../../packages/db/src/client";
import { createPrismaClient } from "../../packages/db/src/client";
import { createPaperRepository } from "../../packages/db/src/paper-repository";
import { PHYSICS_TAG_SLUGS } from "../../packages/domain/src/physics-tags";
import { importReviewCorpus } from "../../apps/worker/src/review-corpus/importer";
import type { ReviewCorpusManifest } from "../../apps/worker/src/review-corpus/manifest";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("PostgreSQL review corpus import", () => {
  let client: DatabaseClient;

  beforeAll(() => {
    client = createPrismaClient(databaseUrl!);
  });

  beforeEach(async () => {
    await client.paper.deleteMany();
  });

  afterAll(async () => {
    await client.paper.deleteMany();
    await client.$disconnect();
  });

  it("replays the same manifest without duplicate papers or sources", async () => {
    const repository = createPaperRepository(client);
    const manifest = corpusManifest();

    const first = await importReviewCorpus(manifest, repository);
    const replay = await importReviewCorpus(manifest, repository);

    expect(first.summary).toEqual({ total: 9, imported: 9, failed: 0 });
    expect(replay.summary).toEqual({ total: 9, imported: 9, failed: 0 });
    expect(await client.paper.count()).toBe(9);
    expect(await client.paperSource.count()).toBe(9);
  });
});

function corpusManifest(): ReviewCorpusManifest {
  return {
    schemaVersion: 1,
    generatedAt: "2026-08-31T00:00:00.000Z",
    papers: PHYSICS_TAG_SLUGS.map((reviewTargetTag, index) => {
      const arxivId = `2403.${String(index + 1).padStart(5, "0")}`;
      return {
        reviewTargetTag,
        arxivId,
        title: `PostgreSQL corpus paper ${index + 1}`,
        authors: [`Database Author ${index + 1}`],
        abstract: `Public database fixture abstract ${index + 1}.`,
        submittedAt: `2024-03-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
        doi: null,
        primaryCategory: "physics.gen-ph",
        abstractUrl: `https://arxiv.org/abs/${arxivId}`,
        pdfUrl: `https://arxiv.org/pdf/${arxivId}`,
        licenseUrl: null,
        retrievedAt: "2026-08-31T00:00:00.000Z",
        pdfFile: `${arxivId}.pdf`,
        sha256: String(index).padStart(64, "0"),
        bytes: 2048 + index,
      };
    }),
  };
}
