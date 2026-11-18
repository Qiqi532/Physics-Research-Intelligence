import { describe, expect, it } from "vitest";
import { pageEvidence, parseEvidencePdf } from "../../apps/worker/src/evidence-pdf";
import { evidenceQuery, evidenceQuote } from "../../packages/domain/src/evidence";
import { evidencePdf } from "../e2e/fixtures/evidence-pdf";

describe("local PDF evidence", () => {
  it("uses physical page numbers and identifies a page without text", async () => {
    const parsed = await parseEvidencePdf(evidencePdf([[], ["Gate voltage and photocurrent polarity"]]));
    expect(parsed.pages).toEqual([
      { number: 1, status: "empty", text: "" },
      { number: 2, status: "text", text: "Gate voltage and photocurrent polarity" },
    ]);
  });

  it("keeps the lines of each column together", () => {
    const rows = Array.from({ length: 6 }, (_, index) => [40, 320].map((x) => ({
      str: `${x < 300 ? "Left" : "Right"} ${index + 1}`, transform: [10, 0, 0, 10, x, 700 - index * 14],
      width: 80, height: 10, hasEOL: true,
    }))).flat();
    const page = pageEvidence(rows, 600, 1);
    expect(page.status).toBe("columns");
    expect(page.text).toContain("Left 5\nLeft 6\n\nRight 1\nRight 2");
  });

  it("finds a literal quote with search aliases while preserving source characters", () => {
    const groups = evidenceQuery("栅压如何改变光电流极性？");
    const text = "A general remark about sensing.\n\nGate voltage changes the photocurrent polarity of MoS₂.";
    expect(groups).toEqual(expect.arrayContaining([expect.arrayContaining(["gate voltage"]), expect.arrayContaining(["photocurrent"])]));
    expect(evidenceQuote(text, groups)).toBe("Gate voltage changes the photocurrent polarity of MoS₂.");
  });
});
