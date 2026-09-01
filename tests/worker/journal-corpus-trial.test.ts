import { describe, expect, it, vi } from "vitest";
import {
  runJournalCorpusTrial,
} from "../../apps/worker/src/journal-corpus/trial";

const papers = [
  { arxivId: "2504.21524v1", paperId: "paper-1" },
  { arxivId: "2410.10611v2", paperId: "paper-2" },
  { arxivId: "2408.15441v2", paperId: "paper-3" },
];

describe("journal corpus AI trial", () => {
  it("processes every paper in order and isolates logical failures", async () => {
    const classify = vi.fn()
      .mockResolvedValueOnce({ status: "complete", runId: "classify-1" })
      .mockResolvedValueOnce({
        status: "failed",
        runId: "classify-2",
        errorCode: "schema_invalid",
      })
      .mockResolvedValueOnce({ status: "duplicate", runId: "classify-3" });
    const interpret = vi.fn()
      .mockResolvedValueOnce({ status: "complete", runId: "interpret-1" })
      .mockResolvedValueOnce({ status: "complete", runId: "interpret-2" })
      .mockResolvedValueOnce({
        status: "failed",
        runId: "interpret-3",
        errorCode: "timeout",
      });

    const result = await runJournalCorpusTrial({ papers, classify, interpret });

    expect(classify.mock.calls.map(([paperId]) => paperId)).toEqual([
      "paper-1",
      "paper-2",
      "paper-3",
    ]);
    expect(interpret.mock.calls.map(([paperId]) => paperId)).toEqual([
      "paper-1",
      "paper-2",
      "paper-3",
    ]);
    expect(result).toEqual({
      outcomes: [
        {
          arxivId: "2504.21524v1",
          paperId: "paper-1",
          classification: { status: "complete", runId: "classify-1" },
          interpretation: { status: "complete", runId: "interpret-1" },
        },
        {
          arxivId: "2410.10611v2",
          paperId: "paper-2",
          classification: {
            status: "failed",
            runId: "classify-2",
            errorCode: "schema_invalid",
          },
          interpretation: { status: "complete", runId: "interpret-2" },
        },
        {
          arxivId: "2408.15441v2",
          paperId: "paper-3",
          classification: { status: "duplicate", runId: "classify-3" },
          interpretation: {
            status: "failed",
            runId: "interpret-3",
            errorCode: "timeout",
          },
        },
      ],
      summary: {
        total: 3,
        classificationComplete: 2,
        interpretationComplete: 2,
        failed: 2,
      },
    });
  });

  it("converts unexpected task errors and continues the batch", async () => {
    const classify = vi.fn()
      .mockRejectedValueOnce(new Error("sensitive provider failure"))
      .mockResolvedValue({ status: "complete", runId: "classify-ok" });
    const interpret = vi.fn()
      .mockResolvedValue({ status: "complete", runId: "interpret-ok" });

    const result = await runJournalCorpusTrial({ papers, classify, interpret });

    expect(classify).toHaveBeenCalledTimes(3);
    expect(interpret).toHaveBeenCalledTimes(3);
    expect(result.outcomes[0]?.classification).toEqual({
      status: "failed",
      errorCode: "trial_runtime_error",
    });
    expect(JSON.stringify(result)).not.toContain("sensitive provider failure");
    expect(result.summary).toEqual({
      total: 3,
      classificationComplete: 2,
      interpretationComplete: 3,
      failed: 1,
    });
  });
});
