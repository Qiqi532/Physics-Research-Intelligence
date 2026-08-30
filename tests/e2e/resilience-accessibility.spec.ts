import { expect, test } from "@playwright/test";
import {
  clearE2eBusinessData,
  deployE2eMigrations,
  dropE2eSchemaForFailureTest,
  resetE2eData,
} from "./fixtures/database";

test.describe.configure({ mode: "serial" });

test.beforeEach(async () => {
  await resetE2eData();
});

test("empty data and dependency failure remain recoverable", async ({ page }) => {
  await clearE2eBusinessData();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "今天的论文池还是空的" })).toBeVisible();

  await dropE2eSchemaForFailureTest();
  try {
    await page.goto("/?database-failure=1");
    await expect(page.getByRole("heading", { name: "Today Physics 暂时不可用" })).toBeVisible();
    await expect(page.getByText(/稍后重试/)).toBeVisible();
  } finally {
    deployE2eMigrations();
    await resetE2eData();
  }

  await page.goto("/?recovered=1");
  await expect(page.getByRole("heading", { name: "个性推荐" })).toBeVisible();
});

test("liveness and readiness expose safe dependency status", async ({ request }) => {
  const live = await request.get("/api/health/live");
  expect(live.status()).toBe(200);
  expect(await live.json()).toEqual(expect.objectContaining({ status: "alive" }));

  const ready = await request.get("/api/health/ready");
  expect(ready.status()).toBe(200);
  expect(await ready.json()).toEqual(expect.objectContaining({
    status: "ready",
    components: expect.objectContaining({
      postgres: { status: "ready" },
      redis: { status: "ready" },
      queue: { status: "disabled" },
      worker: { status: "disabled" },
    }),
  }));
});

test("key layouts fit the viewport and primary controls have names and visible focus", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "个性推荐" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "跳到主要内容" });
  await expect(skipLink).toBeFocused();
  expect(await skipLink.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");

  await page.getByRole("link", { name: "兴趣设置" }).click();
  const slider = page.getByRole("slider", { name: "原子、分子与光学兴趣权重" });
  await slider.focus();
  await expect(slider).toBeFocused();
  await expect(page.getByRole("button", { name: "保存兴趣" })).toBeVisible();
  await expect(page.getByRole("button", { name: "取消修改" })).toBeVisible();
  await expect(page.getByRole("button", { name: "恢复默认值" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
});
