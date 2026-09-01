import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ModelSettingsPageView } from "../../apps/web/src/components/model-settings-page-view";

const testOnlyValue = ["test", "only", "value"].join("-");

describe("model settings page view", () => {
  it("renders only public connection metadata in the management console", () => {
    const html = renderToStaticMarkup(<ModelSettingsPageView state={{
      kind: "ready",
      connections: [publicConnection()],
      routing: emptyRouting(),
      managementEnabled: true,
    }} />);

    expect(html).toContain("Kimi 日常");
    expect(html).toContain("已安全保存");
    expect(html).toContain("任务路由");
    expect(html).not.toContain(testOnlyValue);
    expect(html).not.toContain("apiKeyCiphertext");
  });

  it.each([
    [{ kind: "loading" as const }, "正在加载模型连接"],
    [{ kind: "error" as const }, "模型设置暂时不可用"],
    [{ kind: "secret_error" as const }, "密钥存储暂时不可用"],
  ])("renders explicit state %s", (state, message) => {
    expect(renderToStaticMarkup(<ModelSettingsPageView state={state} />)).toContain(message);
  });

  it("renders an empty action state and a LAN read-only notice", () => {
    const empty = renderToStaticMarkup(<ModelSettingsPageView state={{
      kind: "ready",
      connections: [],
      routing: emptyRouting(),
      managementEnabled: true,
    }} />);
    const lan = renderToStaticMarkup(<ModelSettingsPageView state={{
      kind: "ready",
      connections: [publicConnection()],
      routing: emptyRouting(),
      managementEnabled: false,
    }} />);

    expect(empty).toContain("还没有模型连接");
    expect(lan).toContain("请回到运行服务的电脑操作");
  });
});

function publicConnection() {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Kimi 日常",
    provider: "kimi" as const,
    model: "kimi-k3",
    baseUrl: "https://api.moonshot.cn/v1",
    requestTimeoutMs: 30_000,
    hasApiKey: true as const,
    createdAt: "2026-08-31T00:00:00.000Z",
    updatedAt: "2026-08-31T00:00:00.000Z",
  };
}

function emptyRouting() {
  return {
    classifyPrimaryId: null,
    classifyFallbackId: null,
    interpretPrimaryId: null,
    interpretFallbackId: null,
    updatedAt: null,
  };
}
