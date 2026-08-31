import { expect, test, type Page } from "@playwright/test";
import { resetE2eData } from "./fixtures/database";

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await resetE2eData();
  await page.route("**/*", async (route) => {
    const host = new URL(route.request().url()).hostname;
    if (host === "127.0.0.1" || host === "localhost") await route.continue();
    else await route.abort("blockedbyclient");
  });
});

test("manages named connections, tests a provider and switches routing", async ({ page }) => {
  await page.goto("/settings/models");
  await expect(page.getByText("还没有模型连接")).toBeVisible();

  await createConnection(page, "Kimi 分类", "kimi", "fixture-ok");
  await createConnection(page, "Kimi 解读", "kimi", "fixture-ok-2");
  await createConnection(page, "GLM 备用", "glm", "fixture-glm");

  await page.getByRole("button", { name: /Kimi 分类/ }).click();
  await page.getByRole("button", { name: "轻量连通测试" }).click();
  await expect(page.getByText("连接测试成功")).toBeVisible();
  await page.getByRole("button", { name: "轻量连通测试" }).click();
  await expect(page.getByText(/稍后再试/)).toBeVisible();

  await page.getByRole("button", { name: /Kimi 解读/ }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "合成论文示例" }).click();
  await expect(page.getByText("示例分类与解读完成")).toBeVisible();

  await selectNamedConnection(page, "分类主连接", "Kimi 分类");
  await selectNamedConnection(page, "分类备用连接", "GLM 备用");
  await selectNamedConnection(page, "解读主连接", "Kimi 解读");
  await page.getByRole("button", { name: "保存任务路由" }).click();
  await expect(page.getByText(/下一批任务生效/)).toBeVisible();

  await page.getByRole("button", { name: /Kimi 分类/ }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "删除" }).click();
  await expect(page.getByText(/正在任务路由中使用/)).toBeVisible();
});

test("retains a blank edit key, requires a copied key and reports authentication failure", async ({ page }) => {
  await page.goto("/settings/models");
  await createConnection(page, "可编辑连接", "kimi", "fixture-retain");

  await page.getByLabel("配置名称").fill("空 Key 保留");
  await expect(page.getByLabel("API Key")).toHaveValue("");
  await page.getByRole("button", { name: "保存配置" }).click();
  const editor = page.getByLabel("模型连接编辑器");
  await expect(editor.locator(".form-status")).toHaveText("已安全保存");
  await expect(editor.getByRole("button", { name: "轻量连通测试" })).toBeEnabled();
  await editor.getByRole("button", { name: "轻量连通测试" }).click();
  await expect(page.getByText("连接测试成功")).toBeVisible();

  await page.getByRole("button", { name: "复制当前配置" }).click();
  await expect(page.getByLabel("API Key")).toHaveValue("");
  await expect(page.getByLabel("API Key")).toHaveAttribute("required", "");
  await page.getByLabel("模型连接编辑器").getByRole("button", { name: "取消更改" }).click();

  await page.getByRole("button", { name: "新建" }).click();
  await fillConnection(page, "鉴权失败", "kimi", "auth-fail");
  await page.getByRole("button", { name: "保存配置" }).click();
  await page.getByRole("button", { name: "轻量连通测试" }).click();
  await expect(page.getByText(/API Key 无效/)).toBeVisible();
});

test("keeps keyboard focus visible and avoids horizontal overflow", async ({ page }) => {
  await page.goto("/settings/models");
  await expect(page.getByRole("heading", { name: "模型管理台" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.readyState)).toBe("complete");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "跳到主要内容" })).toBeFocused();
  await expect(page.getByRole("button", { name: "新建" })).toHaveAccessibleName("新建");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

async function createConnection(page: Page, name: string, provider: string, key: string) {
  if (!(await page.getByLabel("配置名称").isVisible())) await page.getByRole("button", { name: "新建" }).click();
  else if (await page.getByLabel("配置名称").inputValue()) await page.getByRole("button", { name: "新建" }).click();
  await fillConnection(page, name, provider, key);
  await page.getByRole("button", { name: "保存配置" }).click();
  await expect(page.getByRole("button", { name: new RegExp(name) })).toBeVisible();
}

async function fillConnection(page: Page, name: string, provider: string, key: string) {
  await page.getByLabel("配置名称").fill(name);
  await page.getByLabel("供应商").selectOption(provider);
  await page.getByLabel("API Key").fill(key);
  await page.getByLabel("接口地址").fill("http://127.0.0.1:3211/v1");
  await page.getByLabel("输入价（美元/百万 token）").fill("1");
  await page.getByLabel("输出价（美元/百万 token）").fill("3");
}

async function selectNamedConnection(page: Page, label: string, name: string) {
  const select = page.getByLabel(label);
  const value = await select.locator("option").filter({ hasText: name }).getAttribute("value");
  if (!value) throw new Error(`Missing connection option: ${name}`);
  await select.selectOption(value);
}
