import { mkdtemp, readFile, realpath, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { createEvidenceRepository, createPrismaClient } from "../../packages/db/src/index";
import { comparisonSourceSchema } from "../../packages/domain/src/evidence-comparison";
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

test("saves device conditions, exports selected comparison rows, and opens single and cross-paper citations", async ({ page, request }) => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "pri-workbench-web-")));
  const names = ["Fixture Device A.pdf", "Fixture Device B.pdf"];
  const files = names.map((name) => join(root, name));
  const db = createPrismaClient(e2eDatabaseUrl());
  const repo = createEvidenceRepository(db, e2eDatabaseUrl());
  const external: string[] = [];
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin === "http://127.0.0.1:3210") return route.continue();
    external.push(url.origin);
    return route.abort();
  });
  const quoteA = "The responsivity was 2 A/W at 532 nm with a gate voltage of -1 V.";
  const quoteB = "The responsivity reaches 3 A/W at 532 nm.";
  const different = "The responsivity was 7 A/W at 650 nm.";
  try {
    await writeFile(files[0], evidencePdf([["Title page"], [quoteA], [different]]));
    await writeFile(files[1], evidencePdf([[quoteB]]));
    expect(await scanEvidenceDirectory(root, repo)).toMatchObject({ files: 2, indexed: 2, failed: 0 });
    const indexed = await db.localEvidenceLocation.findMany({ where: { root }, orderBy: { name: "asc" } });
    expect(indexed).toHaveLength(2);
    const idA = indexed[0].documentId!;
    await repo.comparison.add(comparisonSourceSchema.parse({
      documentId: idA, page: 3, quote: different, fields: { wavelength: { value: "650", unit: "nm" } },
    }));
    const blocked = { headers: { Origin: "https://other.example" }, data: {} };
    expect((await request.post("/api/evidence/comparison", blocked)).status()).toBe(403);
    expect((await request.post("/api/evidence/answer", blocked)).status()).toBe(403);

    await page.goto("/evidence");
    await page.getByRole("textbox", { name: "课题问题或原文关键词" }).fill("响应度 532 nm");
    await page.getByRole("button", { name: "检索证据" }).click();
    const hit = page.locator(".evidence-hits li").filter({ hasText: quoteA });
    await hit.getByText("加入对照表").click();
    await expect(hit.getByLabel("原文摘录")).toHaveValue(quoteA);
    await hit.getByLabel("图表号").fill("Fig. 2b");
    const wavelength = hit.getByRole("group", { name: "波长" });
    await wavelength.getByLabel("数值").fill("532");
    await wavelength.getByLabel("单位").fill("nm");
    const responsivity = hit.getByRole("group", { name: "响应度" });
    await responsivity.getByLabel("数值").fill("2");
    await responsivity.getByLabel("单位").fill("A/W");
    await hit.getByRole("button", { name: "保存到对照表" }).click();
    await hit.getByRole("link", { name: "查看对照表" }).click();
    const row = page.getByRole("row").filter({ hasText: "Fig. 2b" });
    await expect(row).toContainText("532 nm");
    await expect(row).toContainText("2 A/W");
    await row.getByRole("checkbox").check();
    for (const format of ["Markdown", "CSV"]) {
      const download = page.waitForEvent("download");
      await page.getByRole("button", { name: "导出 " + format }).click();
      const file = await download;
      const body = await readFile(await file.path(), "utf8");
      expect(body).toContain(quoteA);
      expect(body).toContain("http://127.0.0.1:3210/evidence/" + idA + "/2");
      expect(body).not.toContain(different);
    }
    await row.getByRole("link", { name: "物理第 2 页" }).click();
    await page.getByRole("link", { name: "向这篇论文提问" }).click();
    await expect(page.getByRole("combobox", { name: "论文", exact: true })).toHaveValue(idA);
    await page.getByLabel("证据问题").fill("532 nm 下的响应度是多少？");
    await page.getByRole("button", { name: "回答并引用原文" }).click();
    await expect(page.getByText(quoteA, { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "[1] 物理第 2 页" })).toHaveAttribute("href", "/evidence/" + idA + "/2");

    await page.getByRole("combobox", { name: "检索范围" }).selectOption("cross");
    await page.getByRole("button", { name: "回答并引用原文" }).click();
    await expect(page.getByText(quoteA, { exact: true })).toBeVisible();
    await expect(page.getByText(quoteB, { exact: true })).toBeVisible();
    await page.getByLabel("证据问题").fill("99999 nm 下的响应度是多少？");
    await page.getByRole("button", { name: "回答并引用原文" }).click();
    await expect(page.getByText(/未找到至少两篇/)).toBeVisible();
    expect(external).toEqual([]);
  } finally {
    const locations = await db.localEvidenceLocation.findMany({ where: { root }, select: { documentId: true } });
    const ids = locations.flatMap(({ documentId }) => documentId ? [documentId] : []);
    await db.evidenceComparisonRow.deleteMany({ where: { documentId: { in: ids } } });
    await db.localEvidenceLocation.deleteMany({ where: { root } });
    await db.localEvidenceDocument.deleteMany({ where: { id: { in: ids } } });
    for (const file of files) await unlink(file).catch(() => {});
    await rmdir(root);
    await db.$disconnect();
  }
});
