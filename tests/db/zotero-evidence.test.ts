import { mkdtemp, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { createEvidenceRepository, createPrismaClient, withEvidenceScanLock } from "../../packages/db/src/index";
import { createZoteroLocal } from "../../packages/domain/src/zotero-local";
import { scanEvidenceDirectory } from "../../apps/worker/src/evidence-index";
import { syncZoteroEvidence } from "../../apps/worker/src/zotero-evidence";
import { originalBytes } from "../../apps/web/src/server/evidence";
import { evidencePdf } from "../e2e/fixtures/evidence-pdf";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("Zotero evidence snapshots", () => {
  it("deduplicates across directory and Zotero, preserves offline data and reindexes changed attachments", async () => {
    const db = createPrismaClient(url!);
    const repo = createEvidenceRepository(db, url!);
    const directory = await mkdtemp(join(tmpdir(), "pri-zotero-directory-"));
    const storage = await mkdtemp(join(tmpdir(), "pri-zotero-storage-"));
    const source = join(directory, "directory.pdf");
    const main = join(storage, "zotero.pdf");
    const supplement = join(storage, "zotero-SI.pdf");
    const key = "ZOTERO01";
    let offline = false, changeOnConfirm = false;
    const fetcher: typeof fetch = async (input, init) => {
      expect(init?.method).toBe("GET");
      if (offline) throw new Error("closed");
      const target = new URL(String(input));
      const path = target.pathname;
      if (path.endsWith("/collections/" + key)) {
        return Response.json({ key, version: 8, library: { type: "user", id: 99 }, data: { name: "Local fixture" } },
          { headers: { "Last-Modified-Version": "8" } });
      }
      if (path.endsWith("/items")) {
        const isConfirm = target.searchParams.get("limit") === "1";
        return Response.json([
          { key: "ITEM0001", data: { itemType: "journalArticle", title: "Private title marker", DOI: "10.1234/private-fixture" } },
          { key: "ATTACH01", data: { itemType: "attachment", parentItem: "ITEM0001", filename: "zotero.pdf", contentType: "application/pdf" } },
          { key: "ATTACH02", data: { itemType: "attachment", parentItem: "ITEM0001", filename: "zotero-SI.pdf", contentType: "application/pdf" } },
        ], { headers: { "Total-Results": "3", "Last-Modified-Version": isConfirm && changeOnConfirm ? "31" : "30" } });
      }
      if (path.endsWith("/file/view/url")) return new Response(pathToFileURL(path.includes("ATTACH01") ? main : supplement).href);
      return new Response(null, { status: 404 });
    };
    const sync = () => withEvidenceScanLock(url!, (assertLock) =>
      syncZoteroEvidence(key, createZoteroLocal({ fetcher }), repo, { assertLock }));
    const oldMain = evidencePdf([["Gate voltage changes photocurrent polarity."]]);
    const oldSi = evidencePdf([[], ["Mobility and threshold voltage in a supplement."]]);
    try {
      await Promise.all([writeFile(source, oldMain), writeFile(main, oldMain), writeFile(supplement, oldSi)]);
      expect(await scanEvidenceDirectory(directory, repo)).toMatchObject({ indexed: 1 });
      expect(await sync()).toEqual({ attachments: 2, indexed: 1, reused: 1, unavailable: 0 });
      expect(await sync()).toMatchObject({ indexed: 0, reused: 2 });
      expect(await repo.inventory()).toMatchObject({ indexed: 2, zotero: [{
        collectionKey: key, attachments: expect.arrayContaining([
          expect.objectContaining({ itemKey: "ITEM0001", attachmentKey: "ATTACH02", role: "补充材料" }),
        ]),
      }] });
      const [si] = await repo.search("迁移率 阈值电压");
      expect(si).toMatchObject({ title: "Private title marker", page: 2, role: "补充材料" });
      expect(await originalBytes(repo, si.id)).toEqual(oldSi);

      offline = true;
      await expect(sync()).rejects.toThrow("offline");
      expect(await repo.inventory()).toMatchObject({ zotero: [{ lastError: "offline" }] });
      expect(await originalBytes(repo, si.id)).toEqual(oldSi);
      offline = false;
      await writeFile(supplement, evidencePdf([["Responsivity as a function of wavelength."]]));
      changeOnConfirm = true;
      await expect(sync()).rejects.toThrow("collection_changed");
      expect(await repo.search("迁移率 阈值电压")).toHaveLength(1);
      changeOnConfirm = false;
      expect(await sync()).toMatchObject({ reused: 2 });
      expect(await repo.search("迁移率 阈值电压")).toEqual([]);
      expect(await originalBytes(repo, si.id)).toBeNull();
      expect(await repo.page(si.id, 2)).not.toBeNull();
      expect(await db.paper.count({ where: { title: "Private title marker" } })).toBe(0);
    } finally {
      await Promise.all([source, main, supplement].map((file) => unlink(file).catch(() => undefined)));
      await Promise.all([rmdir(directory), rmdir(storage)]);
      await db.zoteroCollectionSnapshot.deleteMany();
      await db.localEvidenceLocation.deleteMany();
      await db.localEvidenceDocument.deleteMany();
      await db.$disconnect();
    }
  });
});
