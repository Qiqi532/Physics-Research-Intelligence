import { expect, test } from "@playwright/test";
import { resetE2eData } from "./fixtures/database";

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await resetE2eData();
  await blockExternalNetwork(page);
});

test("interpreted papers stay first and saved interests add a personal reason", async ({ page }) => {
  await page.goto("/");
  const headings = page.locator(".recommendation-list article h3");
  const coldTitles = await headings.allTextContents();
  expect(coldTitles.indexOf("AMO precision fixture"))
    .toBeLessThan(coldTitles.indexOf("Astrophysics frontier fixture"));

  await page.getByRole("link", { name: "兴趣设置" }).click();
  const amoWeight = page.getByRole("slider", { name: "原子、分子与光学兴趣权重" });
  await amoWeight.fill("2");
  await page.getByRole("button", { name: "保存兴趣" }).click();
  await expect(page.locator(".form-status")).toContainText("兴趣已保存");

  await page.getByRole("link", { name: "返回 Today Physics" }).click();
  await expect(page.locator(".recommendation-list article h3").first())
    .toHaveText("AMO precision fixture");
  const amoCard = page.getByRole("article").filter({ hasText: "AMO precision fixture" });
  await expect(amoCard.getByText(/匹配你的「原子、分子与光学」兴趣/)).toBeVisible();
});

async function blockExternalNetwork(page: import("@playwright/test").Page) {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
      await route.continue();
    } else {
      await route.abort("blockedbyclient");
    }
  });
}

test("Today shows statistics, cross-field signal, reasons and reading queue", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Today Physics" })).toBeVisible();
  const stats = page.getByRole("region", { name: "今日统计" });
  const newPaperStat = stats.getByText("今日新论文").locator("..");
  await expect(newPaperStat.getByRole("definition")).toHaveText("5");
  const crossSignals = page.getByRole("region", { name: "跨方向信号" });
  await expect(crossSignals.getByRole("heading", { name: "跨方向信号" })).toBeVisible();
  await expect(crossSignals.getByText("交叉物理")).toBeVisible();
  await expect(page.getByRole("heading", { name: "个性推荐" })).toBeVisible();
  await expect(page.getByText("为什么推荐").first()).toBeVisible();
  const queue = page.getByRole("region", { name: "阅读队列" });
  await expect(queue.getByRole("heading", { name: "阅读队列" })).toBeVisible();
  await expect(queue.getByText("AMO precision fixture")).toBeVisible();
});

test.describe("personal collection", () => {
  test("library starts empty and links from the site navigation", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "我的收藏" }).click();
    await expect(page).toHaveURL(/\/library/);
    await expect(page.getByRole("heading", { name: "我的收藏" })).toBeVisible();
    await expect(page.getByText("还没有收藏的论文")).toBeVisible();
  });

  test("favoriting a paper adds it to the library and persists after refresh", async ({ page }) => {
    await page.goto("/papers/10.5555%2Famo-fixture");
    await page.getByRole("button", { name: "收藏", exact: true }).click();
    await expect(page.locator(".state-message")).toContainText("已加入收藏");

    await page.goto("/library");
    await expect(page.getByRole("heading", { name: "AMO precision fixture" })).toBeVisible();
    await expect(page.getByText(/收藏于/)).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name: "AMO precision fixture" })).toBeVisible();
  });

  test("reading status changes on the library page persist after refresh", async ({ page }) => {
    await page.goto("/papers/10.5555%2Famo-fixture");
    await page.getByRole("button", { name: "收藏", exact: true }).click();
    await expect(page.locator(".state-message")).toContainText("已加入收藏");

    await page.goto("/library");
    const reading = page.getByRole("button", { name: "正在阅读" });
    await reading.click();
    await expect(page.locator(".state-message").first()).toContainText("阅读状态已更新");
    await expect(reading).toHaveAttribute("aria-pressed", "true");

    await page.reload();
    await expect(page.getByRole("button", { name: "正在阅读" }))
      .toHaveAttribute("aria-pressed", "true");
  });

  test("removing a favorite leaves the collection but keeps the paper", async ({ page }) => {
    await page.goto("/papers/10.5555%2Famo-fixture");
    await page.getByRole("button", { name: "收藏", exact: true }).click();
    await expect(page.locator(".state-message")).toContainText("已加入收藏");

    await page.goto("/library");
    await page.getByRole("button", { name: "已收藏", exact: true }).click();
    await expect(page.getByText("还没有收藏的论文")).toBeVisible();

    await page.goto("/papers/10.5555%2Famo-fixture");
    await expect(page.getByRole("heading", { name: "AMO precision fixture" })).toBeVisible();
    await expect(page.getByRole("button", { name: "收藏", exact: true })).toBeVisible();
  });
});
