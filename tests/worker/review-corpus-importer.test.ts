import { describe, expect, it, vi } from "vitest";
import type { PaperRepository } from "../../packages/db/src/paper-repository";
import { PHYSICS_TAG_SLUGS } from "../../packages/domain/src/physics-tags";
import {
  importReviewCorpus,
} from "../../apps/worker/src/review-corpus/importer";
import type {
  ReviewCorpusManifest,
} from "../../apps/worker/src/review-corpus/manifest";

describe("review corpus importer", () => {
  it("imports every public metadata record through the existing repository", async () => {
    const manifest = corpusManifest();
    const upsertFromSource = vi.fn<PaperRepository["upsertFromSource"]>()
      .mockImplementation(async (input) => ({
        paper: paperSummary(input.sourceRecordId, input.title),
        candidateDuplicates: [],
      }));

    const result = await importReviewCorpus(manifest, { upsertFromSource });

    expect(upsertFromSource).toHaveBeenCalledTimes(9);
    expect(upsertFromSource).toHaveBeenCalledWith(expect.objectContaining({
      sourceName: "arxiv",
      sourceRecordId: manifest.papers[0]!.arxivId,
      abstract: manifest.papers[0]!.abstract,
      accessStatus: "OPEN",
    }));
    expect(result.summary).toEqual({ total: 9, imported: 9, failed: 0 });
    expect(result.outcomes).toHaveLength(9);
    expect(JSON.stringify(result)).not.toContain(manifest.papers[0]!.abstract);
    expect(JSON.stringify(result)).not.toContain(manifest.papers[0]!.pdfFile);
  });

  it("isolates one repository failure and reports a stable safe code", async () => {
    const manifest = corpusManifest();
    const upsertFromSource = vi.fn<PaperRepository["upsertFromSource"]>()
      .mockImplementation(async (input) => {
        if (input.sourceRecordId === manifest.papers[3]!.arxivId) {
          throw new Error(`database rejected ${input.abstract}`);
        }
        return {
          paper: paperSummary(input.sourceRecordId, input.title),
          candidateDuplicates: [],
        };
      });

    const result = await importReviewCorpus(manifest, { upsertFromSource });

    expect(upsertFromSource).toHaveBeenCalledTimes(9);
    expect(result.summary).toEqual({ total: 9, imported: 8, failed: 1 });
    expect(result.outcomes[3]).toEqual({
      arxivId: manifest.papers[3]!.arxivId,
      status: "failed",
      errorCode: "repository_write_failed",
    });
    expect(JSON.stringify(result)).not.toContain("database rejected");
  });
});

function corpusManifest(): ReviewCorpusManifest {
  return {
    schemaVersion: 1,
    generatedAt: "2026-08-31T00:00:00.000Z",
    papers: PHYSICS_TAG_SLUGS.map((reviewTargetTag, index) => {
      const arxivId = `2402.${String(index + 1).padStart(5, "0")}`;
      return {
        reviewTargetTag,
        arxivId,
        title: `Review paper ${index + 1}`,
        authors: [`Author ${index + 1}`],
        abstract: `Sensitive-to-output public abstract ${index + 1}.`,
        submittedAt: `2024-02-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
        doi: null,
        primaryCategory: "physics.gen-ph",
        abstractUrl: `https://arxiv.org/abs/${arxivId}`,
        pdfUrl: `https://arxiv.org/pdf/${arxivId}`,
        licenseUrl: null,
        retrievedAt: "2026-08-31T00:00:00.000Z",
        pdfFile: `${arxivId}.pdf`,
        sha256: String(index).padStart(64, "0"),
        bytes: 1024 + index,
      };
    }),
  };
}

function paperSummary(id: string, title: string) {
  const now = new Date("2026-08-31T00:00:00.000Z");
  return {
    id,
    doi: null,
    title,
    normalizedTitle: title.toLowerCase(),
    abstract: null,
    journal: null,
    firstAuthor: null,
    publishedAt: null,
    originalUrl: null,
    accessStatus: "OPEN" as const,
    createdAt: now,
    updatedAt: now,
  };
}
