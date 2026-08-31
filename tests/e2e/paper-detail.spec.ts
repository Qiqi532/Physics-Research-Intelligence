import { expect, test } from "@playwright/test";
import { resetE2eData } from "./fixtures/database";

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await resetE2eData();
  await page.route("**/*", (route) => {
    const host = new URL(route.request().url()).hostname;
    return host === "127.0.0.1" || host === "localhost"
      ? route.continue()
      : route.abort("blockedbyclient");
  });
});

test("paper detail discloses bilingual summary, evidence, confidence and abstract basis", async ({ page }) => {
  await page.goto("/papers/10.5555%2Famo-fixture");

  await expect(page.getByRole("heading", { name: "AMO precision fixture" })).toBeVisible();
  await expect(page.locator(".bilingual-overview").getByText("中文概述")).toBeVisible();
  await expect(
    page.locator(".bilingual-overview").getByText(
      "Public English abstract about precision optical measurements.",
    ),
  ).toBeVisible();
  await expect(
    page.locator(".public-abstract").getByText(
      "Public English abstract about precision optical measurements.",
    ),
  ).toBeVisible();
  await expect(page.getByText("基于摘要解读")).toBeVisible();
  await expect(page.getByRole("heading", { name: "证据等级：原文直接信息" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "证据等级：归纳推断" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "证据等级：不确定" })).toBeVisible();
  await expect(page.getByText("置信度：高").first()).toBeVisible();
  await expect(page.getByText("置信度：中").first()).toBeVisible();
  await expect(page.getByText("置信度：低").first()).toBeVisible();
  await expect(page.getByText(/解读来源：fixture-provider \/ fixture-model/)).toBeVisible();
  await expect(page.getByRole("link", { name: "打开原文" })).toHaveAttribute("href", /example\.test/);
});

test("missing and corrupt interpretations preserve public paper facts", async ({ page }) => {
  await page.goto("/papers/10.5555%2Fastro-fixture");
  await expect(page.getByRole("heading", { name: "Astrophysics frontier fixture" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "尚无 AI 解读" })).toBeVisible();

  await page.goto("/papers/10.5555%2Fcorrupt-fixture");
  await expect(page.getByRole("heading", { name: "Corrupt interpretation fixture" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "AI 解读暂时不可用" })).toBeVisible();

  await page.goto("/papers/10.5555%2Funclassified-fixture");
  await expect(page.getByText("尚待分类")).toBeVisible();
  await expect(page.getByRole("heading", { name: "尚无 AI 解读" })).toBeVisible();
});

test("reader can move through saved, reading, complete and not-interested states", async ({ page }) => {
  await page.goto("/papers/10.5555%2Famo-fixture");
  const status = page.locator(".state-message");
  const saved = page.getByRole("button", { name: "稍后读" });
  const reading = page.getByRole("button", { name: "正在阅读" });
  const complete = page.getByRole("button", { name: "已完成" });
  const skipped = page.getByRole("button", { name: "不感兴趣" });

  await expect(saved).toHaveAttribute("aria-pressed", "true");
  for (const button of [reading, complete, skipped, saved]) {
    await button.click();
    await expect(status).toContainText("阅读状态已更新");
    await expect(button).toHaveAttribute("aria-pressed", "true");
  }
});
