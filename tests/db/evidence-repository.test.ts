import { mkdtemp, rename, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createPrismaClient } from "../../packages/db/src/client";
import { createEvidenceRepository, withEvidenceScanLock } from "../../packages/db/src/evidence-repository";
import { createPaperRepository } from "../../packages/db/src/paper-repository";
import { scanEvidenceDirectory } from "../../apps/worker/src/evidence-index";
import { parseEvidencePdf } from "../../apps/worker/src/evidence-pdf";
import { originalBytes } from "../../apps/web/src/server/evidence";
import { evidencePdf } from "../e2e/fixtures/evidence-pdf";

const database = process.env.TEST_DATABASE_URL;

describe.skipIf(!database)("PostgreSQL evidence index", () => {
  it("prevents concurrent scans and releases the lock when the operation finishes", async () => {
    const url = database!;
    await withEvidenceScanLock(url, async () => {
      await expect(withEvidenceScanLock(url, async () => undefined)).rejects.toThrow("scan_running");
    });
    await expect(withEvidenceScanLock(url, async () => "released")).resolves.toBe("released");
  });

  it("deduplicates bytes, preserves historical pages and handles offline directories and replacement", async () => {
    const databaseUrl = database!;
    const db = createPrismaClient(databaseUrl);
    const repo = createEvidenceRepository(db, databaseUrl);
    const root = await mkdtemp(join(tmpdir(), "pri-evidence-db-"));
    const offline = root + "-offline";
    const main = "unpublished.pdf", duplicate = "supporting information.pdf";
    const before = evidencePdf([[], ["Gate voltage changes photocurrent polarity on the second page."]]);
    const after = evidencePdf([["Threshold voltage and mobility appear in a revised copy."]]);
    const parser = vi.fn(parseEvidencePdf);
    const papersBefore = await db.paper.count();
    try {
      await writeFile(join(root, main), before);
      await writeFile(join(root, duplicate), before);
      expect(await scanEvidenceDirectory(root, repo, { parse: parser })).toEqual({ files: 2, indexed: 1, reused: 1, failed: 0, missing: 0 });
      expect(await scanEvidenceDirectory(root, repo, { parse: parser })).toMatchObject({ indexed: 0, reused: 2 });
      expect(parser).toHaveBeenCalledTimes(1);
      const [hit] = await repo.search("栅压 光电流");
      expect(hit).toMatchObject({ title: duplicate, role: "补充材料", page: 2, quote: expect.stringContaining("photocurrent polarity") });
      expect(await originalBytes(repo, hit.id)).toEqual(before);

      await rename(root, offline);
      try {
        await expect(scanEvidenceDirectory(root, repo, { parse: parser })).rejects.toThrow();
        expect(await repo.search("栅压 光电流")).toHaveLength(1);
        expect(await originalBytes(repo, hit.id)).toBeNull();
      } finally { await rename(offline, root); }

      await writeFile(join(root, main), after);
      await unlink(join(root, duplicate));
      expect(await originalBytes(repo, hit.id)).toBeNull();
      expect(await scanEvidenceDirectory(root, repo, { parse: parser })).toMatchObject({ indexed: 1, missing: 1 });
      expect(await repo.search("栅压 光电流")).toEqual([]);
      expect(await repo.page(hit.id, 2)).toMatchObject({ text: expect.stringContaining("photocurrent polarity") });
      expect(await repo.search("阈值电压 迁移率")).toHaveLength(1);
      expect(await db.paper.count()).toBe(papersBefore);
    } finally {
      await unlink(join(root, main)).catch(() => {});
      await unlink(join(root, duplicate)).catch(() => {});
      await rmdir(root);
      await db.localEvidenceLocation.deleteMany();
      await db.localEvidenceDocument.deleteMany();
      await db.$disconnect();
    }
  });

  it("keeps an old paper linked to local evidence during public feed cleanup", async () => {
    const url = database!;
    const db = createPrismaClient(url);
    const createdAt = new Date("2020-01-01");
    const paper = await db.paper.create({ data: { title: "Local evidence link fixture", normalizedTitle: "local evidence link fixture", createdAt } });
    const disposable = await db.paper.create({ data: { title: "Old feed fixture", normalizedTitle: "old feed fixture", createdAt } });
    const id = "f".repeat(64);
    try {
      await db.localEvidenceDocument.create({ data: { id, parserVersion: "fixture", pageCount: 1, paperId: paper.id } });
      await createPaperRepository(db).pruneExpiredPapers({ cutoff: new Date("2021-01-01") });
      expect(await db.paper.findUnique({ where: { id: paper.id } })).not.toBeNull();
      expect(await db.paper.findUnique({ where: { id: disposable.id } })).toBeNull();
    } finally {
      await db.localEvidenceDocument.deleteMany({ where: { id } });
      await db.paper.deleteMany({ where: { id: { in: [paper.id, disposable.id] } } });
      await db.$disconnect();
    }
  });
});
