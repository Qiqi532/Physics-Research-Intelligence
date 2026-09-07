import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("public README contract", () => {
  it("is Chinese-first, operationally accurate, and explicit about current limits", async () => {
    const readme = await readFile("README.md", "utf8");

    expect(readme).toContain("面向实验 AMO 物理研究者的本地优先论文情报工作台");
    expect(readme).toContain("## 项目状态");
    expect(readme).toContain("## 快速开始");
    expect(readme).toContain("pnpm install --frozen-lockfile");
    expect(readme).toContain("http://127.0.0.1:3000/settings/models");
    expect(readme).toContain("自动调度默认关闭");
    expect(readme).toContain("持久化 run ledger");
    expect(readme).toContain("30 篇人工评审尚未完成");
    expect(readme).toContain("仓库尚未提供开源许可证");
    expect(readme).toContain("## English overview");
    expect(readme).not.toContain("## 中文");
  });
});
