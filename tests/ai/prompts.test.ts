import { describe, expect, it } from "vitest";
import {
  CLASSIFY_PROMPT_VERSION,
  buildClassificationPrompt,
} from "../../packages/ai/src/prompts/classify";
import {
  INTERPRET_PROMPT_VERSION,
  buildInterpretationPrompt,
} from "../../packages/ai/src/prompts/interpret";
import {
  SCREEN_PROMPT_VERSION,
  buildScreenPrompt,
} from "../../packages/ai/src/prompts/screen";

const paper = {
  title: "A fictional optical measurement",
  abstract: "We demonstrate a fictional test result using public abstract data.",
  journal: "Journal of Fictional Physics",
  publishedAt: "2026-08-29T00:00:00.000Z",
};

describe("AI prompts", () => {
  it("builds a deterministic classification prompt with the fixed taxonomy", () => {
    const first = buildClassificationPrompt(paper);
    const second = buildClassificationPrompt(paper);

    expect(CLASSIFY_PROMPT_VERSION).toMatch(/^classify-v\d+$/u);
    expect(first).toEqual(second);
    expect(first.system).toContain("JSON");
    expect(first.system).toContain("cross-disciplinary");
    expect(first.system).toContain("amo-optics");
    expect(first.system).toContain("condensed-matter-materials");
    expect(first.user).toContain(paper.abstract);
  });

  it("uses only explicit safe paper fields in classification input", () => {
    const prompt = buildClassificationPrompt(paper);

    expect(JSON.parse(prompt.user)).toEqual(paper);
    expect(prompt.user).not.toContain("apiKey");
    expect(prompt.user).not.toContain("Authorization");
    expect(prompt.user).not.toContain("fullText");
  });

  it("requires abstract-only disclosure, evidence levels, and traceable references", () => {
    const prompt = buildInterpretationPrompt(paper);

    expect(INTERPRET_PROMPT_VERSION).toMatch(/^interpret-v\d+$/u);
    expect(prompt.system).toContain("基于摘要解读");
    expect(prompt.system).toContain("direct");
    expect(prompt.system).toContain("inferred");
    expect(prompt.system).toContain("uncertain");
    expect(prompt.system).toContain("evidenceReferences");
    expect(prompt.system).toContain("不得声称阅读了受限全文");
    expect(JSON.parse(prompt.user)).toEqual({
      basis: "abstract_only",
      ...paper,
    });
  });

  it("builds a compact screening prompt with bounded public abstract text", () => {
    const longAbstract = "x".repeat(250);
    const prompt = buildScreenPrompt([{
      paperId: "paper-1",
      title: paper.title,
      journal: paper.journal,
      abstractSnippet: longAbstract,
    }], {
      "amo-optics": 2,
      astrophysics: 0,
    });
    const payload = JSON.parse(prompt.user) as {
      papers: Array<Record<string, unknown>>;
    };

    expect(SCREEN_PROMPT_VERSION).toMatch(/^screen-v\d+$/u);
    expect(payload.papers).toEqual([{
      index: 0,
      paperId: "paper-1",
      title: paper.title,
      journal: paper.journal,
      abstractSnippet: `${"x".repeat(200)}…`,
    }]);
    expect(prompt.system).toContain("amo-optics(2.00)");
    expect(prompt.system).not.toContain("astrophysics(0.00)");
    expect(prompt.user).not.toContain("apiKey");
    expect(prompt.user).not.toContain("fullText");
  });
});
