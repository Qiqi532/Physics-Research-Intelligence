import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { PHYSICS_TAG_SLUGS } from "../../packages/domain/src/physics-tags";
import { parseReviewCorpusManifest } from "../../apps/worker/src/review-corpus/manifest";

describe("local real-data trial boundary", () => {
  it("exposes explicit corpus download and import commands", async () => {
    const workerPackage = JSON.parse(await readFile("apps/worker/package.json", "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(workerPackage.scripts["corpus:download"]).toBe("tsx src/download-review-corpus.ts");
    expect(workerPackage.scripts["corpus:import"]).toBe("tsx src/import-review-corpus.ts");
  });

  it("tracks one official arXiv record for each existing physics tag", async () => {
    const raw = JSON.parse(await readFile("data/review-corpus/manifest.json", "utf8")) as unknown;
    const manifest = parseReviewCorpusManifest(raw);

    expect(manifest.papers.map(({ reviewTargetTag }) => reviewTargetTag).sort()).toEqual(
      [...PHYSICS_TAG_SLUGS].sort(),
    );
    for (const paper of manifest.papers) {
      expect(new URL(paper.abstractUrl).hostname).toBe("arxiv.org");
      expect(["arxiv.org", "export.arxiv.org"]).toContain(new URL(paper.pdfUrl).hostname);
      expect(new URL(paper.abstractUrl).protocol).toBe("https:");
      expect(new URL(paper.pdfUrl).protocol).toBe("https:");
    }
  });

  it("keeps PDFs out of Git and documents the human/model boundary", async () => {
    const [gitignore, corpusReadme] = await Promise.all([
      readFile(".gitignore", "utf8"),
      readFile("data/review-corpus/README.md", "utf8"),
    ]);

    expect(gitignore).toContain("data/review-corpus/pdfs/");
    expect(corpusReadme).toMatch(/do not commit PDFs/i);
    expect(corpusReadme).toMatch(/human review/i);
    expect(corpusReadme).toMatch(/title.*metadata.*abstract/is);
    expect(corpusReadme).toMatch(/license/i);
  });
});
