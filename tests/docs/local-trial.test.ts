import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { PHYSICS_TAG_SLUGS } from "../../packages/domain/src/physics-tags";
import { parseReviewCorpusManifest } from "../../apps/worker/src/review-corpus/manifest";

describe("local real-data trial boundary", () => {
  it("publishes a bilingual MVP and Kimi abstract-trial guide", async () => {
    const readme = await readFile("README.md", "utf8");

    expect(readme).toContain("# Physics Research Intelligence");
    expect(readme).toContain("## 中文");
    expect(readme).toContain("## English");
    expect(readme).toMatch(/45 篇|45 papers/);
    expect(readme).toContain("2504.21524v1");
    expect(readme).toContain("2410.10611v2");
    expect(readme).toContain("2408.15441v2");
    expect(readme).toMatch(/Kimi/);
    expect(readme).toMatch(/公开元数据与摘要|public metadata and abstracts/);
    expect(readme).toMatch(/不读取.*PDF|does not read.*PDF/is);
    expect(readme).toContain("http://127.0.0.1:3000/settings/models");
  });

  it("exposes explicit corpus download and import commands", async () => {
    const workerPackage = JSON.parse(await readFile("apps/worker/package.json", "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(workerPackage.scripts["corpus:download"]).toBe("tsx src/download-review-corpus.ts");
    expect(workerPackage.scripts["corpus:import"]).toBe("tsx src/import-review-corpus.ts");
    expect(workerPackage.scripts["corpus:journal:trial"])
      .toBe("tsx src/import-journal-corpus-trial.ts");
  });

  it("tracks one official arXiv record for each existing physics tag", async () => {
    const raw = JSON.parse(await readFile("data/review-corpus/manifest.json", "utf8")) as unknown;
    const manifest = parseReviewCorpusManifest(raw);

    expect(manifest.papers.map(({ reviewTargetTag }) => reviewTargetTag).sort()).toEqual(
      [...PHYSICS_TAG_SLUGS].sort(),
    );
    for (const paper of manifest.papers) {
      expect(paper.doi).toBeTruthy();
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
    expect(gitignore).toContain("backups/");
    expect(corpusReadme).toMatch(/do not commit PDFs/i);
    expect(corpusReadme).toMatch(/human review/i);
    expect(corpusReadme).toMatch(/title.*metadata.*abstract/is);
    expect(corpusReadme).toMatch(/license/i);
  });

  it("tracks a 45-paper journal manifest while excluding local PDFs", async () => {
    const [gitignore, rawManifest, corpusReadme] = await Promise.all([
      readFile(".gitignore", "utf8"),
      readFile("data/journal-corpus/manifest.json", "utf8"),
      readFile("data/journal-corpus/README.md", "utf8"),
    ]);
    const manifest = JSON.parse(rawManifest) as Array<{
      arxiv_id: string;
      pdf_file: string;
    }>;

    expect(gitignore).toContain("data/journal-corpus/pdfs/");
    expect(manifest).toHaveLength(45);
    expect(new Set(manifest.map(({ arxiv_id }) => arxiv_id)).size).toBe(45);
    expect(manifest.every(({ pdf_file }) => pdf_file.endsWith(".pdf"))).toBe(true);
    expect(corpusReadme).toMatch(/不得.*Git|must not.*Git/is);
    expect(corpusReadme).toMatch(/元数据.*摘要|metadata.*abstract/is);
  });

  it("binds Web to localhost unless trusted-LAN mode is explicit", async () => {
    const webPackage = JSON.parse(await readFile("apps/web/package.json", "utf8")) as {
      scripts: Record<string, string>;
    };
    const launcher = await readFile("apps/web/scripts/start-web.mjs", "utf8");

    expect(webPackage.scripts.dev).toBe("node scripts/start-web.mjs dev");
    expect(webPackage.scripts.start).toBe("node scripts/start-web.mjs start");
    expect(webPackage.scripts["dev:lan"]).toBe("node scripts/start-web.mjs dev --lan");
    expect(webPackage.scripts["start:lan"]).toBe("node scripts/start-web.mjs start --lan");
    expect(launcher).toContain('const hostname = lan ? "0.0.0.0" : "127.0.0.1"');
    expect(launcher).toContain('process.env.PRI_LAN_MODE = lan ? "true" : "false"');
    expect(launcher).toMatch(/no login/i);
    expect(launcher).not.toMatch(/DATABASE_URL|REDIS_URL|firewall/);
  });

  it("documents a safe zero-cost desktop and optional LAN workflow", async () => {
    const [readme, operations, exampleEnvironment] = await Promise.all([
      readFile("README.md", "utf8"),
      readFile("docs/operations.md", "utf8"),
      readFile(".env.example", "utf8"),
    ]);

    expect(readme).toContain("http://127.0.0.1:3000");
    expect(operations).toMatch(/local real-data trial/i);
    expect(operations).toMatch(/127\.0\.0\.1:3000/);
    expect(operations).toMatch(/trusted LAN/i);
    expect(operations).toMatch(/no login/i);
    expect(operations).toMatch(/private networks only/i);
    expect(operations).toMatch(/client isolation/i);
    expect(operations).toMatch(/stop|Ctrl\+C/i);
    expect(exampleEnvironment).toMatch(/AI provider keys are optional/i);
  });
});
