import { mkdtemp, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { createEvidenceRepository, createPrismaClient } from "../../packages/db/src/index";
import { scanEvidenceDirectory } from "../../apps/worker/src/evidence-index";
import { e2eDatabaseUrl } from "./fixtures/database";
import { evidencePdf } from "./fixtures/evidence-pdf";

test("search finds the right physical PDF page and blocks cross-site access", async ({ page, request }) => {
  const root = await mkdtemp(join(tmpdir(), "pri-evidence-web-"));
  const file = join(root, "fixture-supplement.pdf");
  const databaseUrl = e2eDatabaseUrl();
  const db = createPrismaClient(databaseUrl);
  const external: string[] = [];
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1" && url.port === "3210") return route.continue();
    external.push(url.origin);
    return route.abort();
  });
  try {
    await writeFile(file, evidencePdf([["Front matter"], ["Gate voltage reverses photocurrent polarity."]]));
    await scanEvidenceDirectory(root, createEvidenceRepository(db, databaseUrl));
    expect((await request.post("/api/evidence/search", { data: { query: "光电流" }, headers: { Origin: "https://other.example" } })).status()).toBe(403);
    await page.goto("/evidence");
    await page.getByRole("textbox", { name: "课题问题或原文关键词" }).fill("栅压 光电流");
    await page.getByRole("button", { name: "检索证据" }).click();
    await expect(page.getByText(/补充材料 · 物理第 2 \/ 2 页/)).toBeVisible();
    await page.getByRole("link", { name: "打开证据页" }).click();
    const reader = page.frameLocator("iframe[title='PDF 原文第 2 页']");
    await expect(reader.locator("canvas[data-rendered-page='2']")).toBeVisible({ timeout: 30_000 });
    await page.getByText("查看本页提取文字").click();
    await expect(page.getByText("Gate voltage reverses photocurrent polarity.")).toBeVisible();
    await page.getByRole("link", { name: "上一页" }).click();
    await expect(page.frameLocator("iframe[title='PDF 原文第 1 页']").locator("canvas[data-rendered-page='1']")).toBeVisible();
    expect(external).toEqual([]);
  } finally {
    await unlink(file);
    await rmdir(root);
    await db.localEvidenceLocation.deleteMany();
    await db.localEvidenceDocument.deleteMany();
    await db.$disconnect();
  }
});
