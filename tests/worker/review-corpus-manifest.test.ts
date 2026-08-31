import { describe, expect, it } from "vitest";
import { PHYSICS_TAG_SLUGS } from "../../packages/domain/src/physics-tags";
import {
  parseReviewCorpusManifest,
  toPaperSourceInput,
  type ReviewCorpusManifest,
} from "../../apps/worker/src/review-corpus/manifest";

describe("review corpus manifest", () => {
  it("accepts exactly one official arXiv record for every physics tag", () => {
    const parsed = parseReviewCorpusManifest(validManifest());

    expect(parsed.papers.map(({ reviewTargetTag }) => reviewTargetTag).sort()).toEqual(
      [...PHYSICS_TAG_SLUGS].sort(),
    );
  });

  it("rejects unknown fields", () => {
    const manifest = validManifest() as ReviewCorpusManifest & { unexpected: boolean };
    manifest.unexpected = true;

    expect(() => parseReviewCorpusManifest(manifest)).toThrow();
  });

  it("rejects duplicate arXiv identifiers and PDF filenames", () => {
    const duplicateId = validManifest();
    duplicateId.papers[1]!.arxivId = duplicateId.papers[0]!.arxivId;
    expect(() => parseReviewCorpusManifest(duplicateId)).toThrow(/duplicate arXiv id/i);

    const duplicateFile = validManifest();
    duplicateFile.papers[1]!.pdfFile = duplicateFile.papers[0]!.pdfFile;
    expect(() => parseReviewCorpusManifest(duplicateFile)).toThrow(/duplicate PDF filename/i);
  });

  it("rejects incomplete taxonomy coverage", () => {
    const manifest = validManifest();
    manifest.papers[8]!.reviewTargetTag = manifest.papers[0]!.reviewTargetTag;

    expect(() => parseReviewCorpusManifest(manifest)).toThrow(/tag coverage/i);
  });

  it.each([
    ["abstractUrl", "http://arxiv.org/abs/2401.00001"],
    ["abstractUrl", "https://example.test/abs/2401.00001"],
    ["pdfUrl", "https://example.test/pdf/2401.00001"],
    ["licenseUrl", "http://creativecommons.org/licenses/by/4.0/"],
  ] as const)("rejects an invalid %s", (field, value) => {
    const manifest = validManifest();
    manifest.papers[0] = { ...manifest.papers[0]!, [field]: value };

    expect(() => parseReviewCorpusManifest(manifest)).toThrow();
  });

  it("rejects invalid checksums and unsafe byte lengths", () => {
    const invalidChecksum = validManifest();
    invalidChecksum.papers[0]!.sha256 = "not-a-checksum";
    expect(() => parseReviewCorpusManifest(invalidChecksum)).toThrow();

    const empty = validManifest();
    empty.papers[0]!.bytes = 0;
    expect(() => parseReviewCorpusManifest(empty)).toThrow();

    const oversized = validManifest();
    oversized.papers[0]!.bytes = 50 * 1024 * 1024 + 1;
    expect(() => parseReviewCorpusManifest(oversized)).toThrow();
  });

  it("converts public metadata without exposing a local PDF path", () => {
    const entry = parseReviewCorpusManifest(validManifest()).papers[0]!;
    const input = toPaperSourceInput(entry);

    expect(input).toEqual(expect.objectContaining({
      sourceName: "arxiv",
      sourceRecordId: entry.arxivId,
      sourceUrl: entry.abstractUrl,
      abstract: entry.abstract,
      accessStatus: "OPEN",
    }));
    expect(input).not.toHaveProperty("pdfFile");
    expect(input).not.toHaveProperty("pdfPath");
  });
});

function validManifest(): ReviewCorpusManifest {
  return {
    schemaVersion: 1,
    generatedAt: "2026-08-31T00:00:00.000Z",
    papers: PHYSICS_TAG_SLUGS.map((reviewTargetTag, index) => {
      const serial = String(index + 1).padStart(5, "0");
      const arxivId = `2401.${serial}`;
      return {
        reviewTargetTag,
        arxivId,
        title: `Open physics paper ${index + 1}`,
        authors: [`Author ${index + 1}`, "Second Author"],
        abstract: `A public abstract for physics direction ${index + 1}.`,
        submittedAt: `2024-01-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
        doi: index === 0 ? "10.5555/open-paper-1" : null,
        primaryCategory: "physics.gen-ph",
        abstractUrl: `https://arxiv.org/abs/${arxivId}`,
        pdfUrl: `https://arxiv.org/pdf/${arxivId}`,
        licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
        retrievedAt: "2026-08-31T00:00:00.000Z",
        pdfFile: `${arxivId}.pdf`,
        sha256: String(index).padStart(64, "0"),
        bytes: 1024 + index,
      };
    }),
  };
}
