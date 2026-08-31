import { describe, expect, it } from "vitest";
import { presentPaperDetail } from "../../apps/web/src/presentation/paper";
import { presentToday } from "../../apps/web/src/presentation/today";

describe("Today presentation states", () => {
  it("distinguishes ready, empty and error states", () => {
    expect(presentToday({ kind: "ready", data: todayDto() }).kind).toBe("ready");
    expect(
      presentToday({
        kind: "ready",
        data: todayDto({ recommendations: [], readingQueue: [], crossSignals: [] }),
      }).kind,
    ).toBe("empty");
    expect(presentToday({ kind: "error" })).toEqual({
      kind: "error",
      title: "Today Physics 暂时不可用",
      message: "论文数据暂时无法读取，请稍后重试。",
    });
  });

  it("keeps statistics visible for an empty new-user dashboard", () => {
    const result = presentToday({
      kind: "ready",
      data: todayDto({
        stats: {
          newPapers: 0,
          openPapers: 0,
          interpretedPapers: 0,
          crossDisciplinaryPapers: 0,
        },
        recommendations: [],
        readingQueue: [],
        crossSignals: [],
      }),
    });

    expect(result).toEqual(
      expect.objectContaining({
        kind: "empty",
        data: expect.objectContaining({ stats: expect.objectContaining({ newPapers: 0 }) }),
        emptyMessage: "今天还没有可展示的论文，采集完成后会出现在这里。",
      }),
    );
  });
});

describe("paper detail presentation states", () => {
  it("presents English facts and a Chinese abstract-only interpretation separately", () => {
    const result = presentPaperDetail({ kind: "ready", data: paperDto() });

    expect(result).toEqual(
      expect.objectContaining({
        kind: "ready",
        overviewEn: "Public English abstract.",
        overviewZh: "中文概述。",
        interpretationState: "complete",
        sourceDisclosure: "基于摘要解读",
        accessLabel: "可能需要校园网/VPN",
      }),
    );
    if (result.kind === "ready") {
      expect(result.evidenceGroups.direct[0]).toEqual(
        expect.objectContaining({ confidenceLabel: "高", text: "中文概述。" }),
      );
      expect(result.evidenceGroups.inferred[0]).toEqual(
        expect.objectContaining({ confidenceLabel: "中" }),
      );
      expect(result.evidenceGroups.uncertain[0]).toEqual(
        expect.objectContaining({ confidenceLabel: "低" }),
      );
    }
  });

  it("shows a missing AI state without implying that interpretation exists", () => {
    const result = presentPaperDetail({
      kind: "ready",
      data: paperDto({ interpretation: null }),
    });

    expect(result).toEqual(
      expect.objectContaining({
        kind: "ready",
        interpretationState: "missing",
        sourceDisclosure: null,
        overviewZh: null,
      }),
    );
  });

  it("shows unavailable AI content while preserving public facts", () => {
    const result = presentPaperDetail({
      kind: "ready",
      data: paperDto({ interpretation: { status: "unavailable" } }),
    });

    expect(result).toEqual(
      expect.objectContaining({
        kind: "ready",
        title: "A safe paper",
        interpretationState: "unavailable",
        overviewEn: "Public English abstract.",
      }),
    );
  });

  it("maps not-found and service errors to distinct safe states", () => {
    expect(presentPaperDetail({ kind: "not_found" })).toEqual({ kind: "not_found" });
    expect(presentPaperDetail({ kind: "error" })).toEqual({
      kind: "error",
      title: "论文详情暂时不可用",
      message: "公开事实和解读暂时无法读取，请稍后重试。",
    });
  });
});

function todayDto(overrides: Record<string, unknown> = {}) {
  return {
    generatedAt: "2026-08-30T04:00:00.000Z",
    stats: {
      newPapers: 1,
      openPapers: 1,
      interpretedPapers: 1,
      crossDisciplinaryPapers: 0,
    },
    crossSignals: [],
    recommendations: [{ id: "paper-1" }],
    readingQueue: [],
    ...overrides,
  };
}

function paperDto(overrides: Record<string, unknown> = {}) {
  const directClaim = claim("中文概述。", "direct");
  return {
    id: "paper-1",
    doi: "10.1103/example",
    title: "A safe paper",
    abstract: "Public English abstract.",
    journal: "Test Physics",
    firstAuthor: "A. Researcher",
    publishedAt: "2026-08-20T00:00:00.000Z",
    originalUrl: "https://example.test/paper",
    accessStatus: "RESTRICTED",
    createdAt: "2026-08-29T00:00:00.000Z",
    updatedAt: "2026-08-29T00:00:00.000Z",
    sources: [],
    tags: [],
    interpretation: {
      status: "complete",
      basis: "abstract_only",
      sourceDisclosure: "基于摘要解读",
      overviewZh: directClaim,
      researchQuestion: claim("研究问题。", "inferred"),
      innovations: [claim("创新点。", "inferred")],
      methodsAndEvidence: [claim("方法与证据。", "direct")],
      limitations: [claim("仍需全文核验。", "uncertain")],
      readingAdvice: ["先阅读摘要。"],
      provider: "openai",
      model: "fixture-model",
      promptVersion: "interpret-v1",
      createdAt: "2026-08-30T00:00:00.000Z",
    },
    userState: null,
    ...overrides,
  };
}

function claim(text: string, evidenceLevel: "direct" | "inferred" | "uncertain") {
  return {
    text,
    evidenceLevel,
    evidenceReferences: [{ source: "abstract", locator: "sentence 1" }],
  };
}
