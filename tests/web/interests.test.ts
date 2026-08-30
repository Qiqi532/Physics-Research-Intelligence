import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  currentInterestDraft,
  defaultInterestDraft,
  interestPayloadForSave,
} from "../../apps/web/src/components/interest-settings-form";
import { InterestSettingsPageView } from "../../apps/web/src/components/interest-settings-page-view";

const tags = [
  tag({ weight: 1.75 }),
  tag({
    slug: "cross-disciplinary",
    labelZh: "交叉物理",
    labelEn: "Cross-disciplinary physics",
    isCrossDisciplinary: true,
    weight: 0,
  }),
];

describe("interest settings UI", () => {
  it("builds current, default and cancellation payloads explicitly", () => {
    expect(currentInterestDraft(tags)).toEqual({
      "amo-optics": 1.75,
      "cross-disciplinary": 0,
    });
    expect(defaultInterestDraft(tags)).toEqual({
      "amo-optics": 1,
      "cross-disciplinary": 1,
    });
    expect(interestPayloadForSave({
      "amo-optics": 2,
      "cross-disciplinary": 0,
    })).toEqual({
      interests: [
        { tagSlug: "amo-optics", weight: 2 },
        { tagSlug: "cross-disciplinary", weight: 0 },
      ],
    });
  });

  it("uses native range controls, accessible names and live status", async () => {
    const source = await readFile(
      "apps/web/src/components/interest-settings-form.tsx",
      "utf8",
    );

    expect(source).toContain('type="range"');
    expect(source).toContain("tags.map");
    expect(source).toContain("兴趣权重");
    expect(source).toContain("保存兴趣");
    expect(source).toContain("取消修改");
    expect(source).toContain("恢复默认值");
    expect(source).toContain('aria-live="polite"');
  });

  it("renders explicit loading, error and no-tag states", () => {
    expect(textContent(InterestSettingsPageView({ state: { kind: "loading" } })))
      .toContain("正在加载兴趣方向");
    expect(textContent(InterestSettingsPageView({ state: { kind: "error" } })))
      .toContain("兴趣设置暂时不可用");
    expect(textContent(InterestSettingsPageView({
      state: { kind: "ready", tags: [] },
    }))).toContain("还没有可设置的物理方向");
  });
});

function tag(overrides: Record<string, unknown> = {}) {
  return {
    slug: "amo-optics",
    labelEn: "AMO and optics",
    labelZh: "原子、分子与光学",
    group: "physics",
    isCrossDisciplinary: false,
    weight: 0,
    defaultWeight: 1,
    ...overrides,
  };
}

function textContent(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(textContent).filter(Boolean).join(" ");
  }
  if (typeof node === "object" && node !== null && "props" in node) {
    const element = node as {
      type?: unknown;
      props: { children?: unknown } & Record<string, unknown>;
    };
    if (typeof element.type === "function") {
      return textContent(element.type(element.props));
    }
    return textContent(element.props.children);
  }
  return "";
}
