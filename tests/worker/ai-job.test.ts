import { describe, expect, it } from "vitest";
import type { ScreenInput } from "../../packages/ai/src";
import { createBatchInputHash } from "../../apps/worker/src/jobs/ai-job";

function screenInput(paperId: string): ScreenInput {
  return {
    paperId,
    title: `Paper ${paperId}`,
    abstract: null,
    journal: "Nature",
    publishedAt: null,
  };
}

describe("AI job batch identity", () => {
  it("changes when the paper set changes", () => {
    const first = createBatchInputHash([screenInput("paper-a")]);
    const second = createBatchInputHash([screenInput("paper-b")]);

    expect(first).not.toBe(second);
  });

  it("does not depend on input ordering", () => {
    const first = createBatchInputHash([
      screenInput("paper-a"),
      screenInput("paper-b"),
    ]);
    const second = createBatchInputHash([
      screenInput("paper-b"),
      screenInput("paper-a"),
    ]);

    expect(first).toBe(second);
  });
});
