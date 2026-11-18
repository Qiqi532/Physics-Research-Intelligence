import { describe, expect, it } from "vitest";
import { answerFromEvidence, prepareEvidenceQuestion, type EvidenceAnswerCandidate } from "../../packages/domain/src/evidence-answer";
import { comparisonSourceSchema, serializeComparison } from "../../packages/domain/src/evidence-comparison";

const source = { documentId: "a".repeat(64), page: 2 };

describe("comparison records", () => {
  it("accepts an exact excerpt or a figure reference, keeping values and original units together", () => {
    const fields = { gate: { value: "−1.5", unit: "V" }, conditions: "under continuous illumination" };
    expect(comparisonSourceSchema.parse({ ...source, figure: "Fig. 2c", fields })).toMatchObject({ fields: {
      gate: fields.gate, responsivity: null, conditions: fields.conditions,
    } });
    for (const input of [
      { ...source, fields },
      { ...source, figure: "Fig. 2", fields: { gate: { value: "2", unit: "" } } },
      { ...source, figure: "Fig. 2", fields: { illumination: { value: "10", unit: "W cm⁻²" } } },
      { ...source, figure: "Fig. 2", page: 0, fields: {} },
    ]) expect(comparisonSourceSchema.safeParse(input).success).toBe(false);
  });

  it("exports blank fields, raw units, and linked physical pages safely", () => {
    const input = comparisonSourceSchema.parse({ ...source, quote: "A | B\n<signal>", fields: {
      material: "=2+2", structure: 'p–n, "bilayer"', gate: { value: "-1.5", unit: "V" },
      illumination: { value: "2.5", unit: "µW cm⁻²" }, illuminationKind: "density",
    } });
    const rows = [{ ...input, id: "row", sourceTitle: "Device | note", updatedAt: new Date(0) }];
    const origin = "http://127.0.0.1:3228";
    const md = serializeComparison(rows, "md", origin);
    expect(md).toContain("Device \\| note");
    expect(md).toContain("A \\| B &lt;signal&gt;");
    expect(md).toContain("[第 2 页](" + origin + "/evidence/" + source.documentId + "/2)");
    const csv = serializeComparison(rows, "csv", origin);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"\'' + '=2+2","p–n, ""bilayer"""');
    expect(csv).toContain('"-1.5","V","","","","","2.5","µW cm⁻²"');
    expect(csv).toContain(origin + "/evidence/" + source.documentId + "/2");
  });
});

const candidate = (title: string, text: string, overrides?: Partial<EvidenceAnswerCandidate>): EvidenceAnswerCandidate => ({
  id: title, title, text, page: 2, paperId: null, role: "主文", status: "text", ...overrides,
});

describe("extractive evidence answers", () => {
  it("requires the requested condition and measurement in the same passage", () => {
    const question = prepareEvidenceQuestion("在532 nm下的响应度是多少？")!;
    const matching = "The responsivity reaches 2 mA W−1 at 532 nm.";
    const answer = answerFromEvidence(question, [
      candidate("different condition", "The responsivity reaches 2 mA/W at 1532 nm."),
      candidate("separate sentences", "The responsivity was 48 A/W at 635 nm. The optical source also operates at 532 nm."),
      candidate("separate conditions", "The responsivity was 48 A/W at 635 nm, while excitation was at 532 nm for a different test."),
      candidate("no value reported", "The responsivity was not measured at 532 nm and a 2 A/W calibration was used."),
      candidate("right condition", "Background information.\n\n" + matching),
      candidate("bibliography", "References\n" + matching),
    ], "single");
    expect(answer).toEqual({ status: "answered", references: [{
      id: "right condition", title: "right condition", page: 2, status: "text", quote: matching,
    }] });
  });

  it("keeps bias sign, optical density and look-alike unsupported topics separate", () => {
    const voltage = prepareEvidenceQuestion("−2 V 下响应度是多少？")!;
    expect(answerFromEvidence(voltage, [candidate("A", "The responsivity was 5 A/W at +2 V.")], "single").status).toBe("insufficient");
    expect(answerFromEvidence(voltage, [candidate("A", "The responsivity was 5 A/W at − 2 V.")], "single").status).toBe("answered");
    const density = prepareEvidenceQuestion("光功率密度是多少？")!;
    expect(answerFromEvidence(density, [candidate("A", "An irradiance of 1.3 μW cm⁻² was used.")], "single").status).toBe("answered");
    const unrelated = prepareEvidenceQuestion("引力波器件的响应度是多少？")!;
    expect(answerFromEvidence(unrelated, [candidate("A", "The responsivity was 5 A/W at 532 nm.")], "single").status).toBe("insufficient");
    expect(prepareEvidenceQuestion("哪篇论文的响应度最高？")).toBeNull();
  });

  it("cites the shortest supporting lines on a reconstructed two-column page", () => {
    const question = prepareEvidenceQuestion("响应度是多少？")!;
    const measurement = "the responsivity reached 6 A/W";
    const quote = "Results under steady illumination\n" + measurement + "\nmeasured with the configured instrument.";
    expect(answerFromEvidence(question, [candidate("A", quote, { status: "columns" })], "single").references[0]?.quote).toBe(measurement);
  });

  it("needs two different primary papers for cross-paper answers", () => {
    const question = prepareEvidenceQuestion("各篇论文的响应时间是多少？")!;
    const a = candidate("Study A", "The response time was 10 µs.", { paperId: "paper-a" });
    const sameTitle = candidate("Study A", "The response time reaches 15 µs.", { id: "second-version" });
    const samePaper = candidate("Revised Study A", "The response time was 20 µs.", { paperId: "paper-a" });
    const supplement = candidate("Study B supplement", "The response time is 1 ms.", { role: "补充材料" });
    expect(answerFromEvidence(question, [a, sameTitle, samePaper, supplement], "cross")).toEqual({ status: "insufficient", references: [] });
    const b = candidate("Study B", "The response time remained below 8 ms.");
    expect(answerFromEvidence(question, [a, sameTitle, b], "cross").references.map(({ id }) => id)).toEqual([a.id, b.id]);
  });
});
