import { expect, test } from "@playwright/test";
import { createDailyRepository, createPrismaClient } from "../../packages/db/src/index";
import { freezeRanking } from "../../packages/domain/src/ranking-review";
import { loadResearchProfile } from "../../packages/domain/src/research-profile-node";
import { e2eDatabaseUrl, resetE2eData } from "./fixtures/database";

test("reviews frozen prefilter candidates and updates the comparison counts", async ({ page }) => {
  await resetE2eData();
  const db = createPrismaClient(e2eDatabaseUrl());
  try {
    const daily = createDailyRepository(db);
    const { profile } = loadResearchProfile({});
    const abstract = "Optical arrays extract moving shapes from temporal sequences.";
    const paper = await db.paper.create({ data: { title: "Optical motion fixture", normalizedTitle: "optical motion fixture" } });
    const run = await db.dailyRun.create({ data: {
      executionKey: crypto.randomUUID(), dateKey: "2026-11-18", profileHash: "review-e2e", profileLabel: "Stage 3 fixture",
    } });
    await daily.freezeCandidates(run.id, { candidates: [] }, freezeRanking(profile,
      [{ id: paper.id, title: paper.title, doi: null, abstract, publishedAt: "2026-11-18" }],
      [{ ...profile.seeds[0], abstract }], "ready"));
  } finally { await db.$disconnect(); }
  await page.goto("/ranking-review");
  await expect(page.getByText("1 / 7", { exact: false })).toBeVisible();
  await expect(page.getByText("1 篇未命中关键词", { exact: false })).toBeVisible();
  const card = page.locator("li").filter({ has: page.getByRole("heading", { name: "Optical motion fixture" }) });
  const vote = card.getByRole("button", { name: "值得精读" });
  await vote.click();
  await expect(vote).toHaveAttribute("aria-pressed", "true");
  const keywordCells = page.getByRole("row", { name: /现有关键词/ }).getByRole("cell");
  const seedsCells = page.getByRole("row", { name: /种子摘要相似度/ }).getByRole("cell");
  await expect(keywordCells.nth(4)).toHaveText("1");
  await expect(seedsCells.nth(2)).toHaveText("1");
  await page.reload();
  await expect(vote).toHaveAttribute("aria-pressed", "true");
  await vote.click();
  await expect(seedsCells.nth(2)).toHaveText("0");
});
