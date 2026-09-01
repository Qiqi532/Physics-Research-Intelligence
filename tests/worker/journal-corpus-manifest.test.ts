import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  parseJournalCorpusManifest,
  selectJournalCorpusEntries,
  toJournalPaperSourceInput,
} from "../../apps/worker/src/journal-corpus/manifest";

describe("journal corpus manifest", () => {
  it("parses the tracked 45-entry manifest", async () => {
    const raw = JSON.parse(
      await readFile("data/journal-corpus/manifest.json", "utf8"),
    ) as unknown;

    const manifest = parseJournalCorpusManifest(raw);

    expect(manifest).toHaveLength(45);
    expect(new Set(manifest.map(({ arxiv_id }) => arxiv_id)).size).toBe(45);
  });

  it("rejects unknown fields, malformed ids and duplicate manifest records", () => {
    expect(() => parseJournalCorpusManifest([{ ...entry(), extra: true }])).toThrow();
    expect(() => parseJournalCorpusManifest([{ ...entry(), arxiv_id: "2504.21524" }]))
      .toThrow();
    expect(() => parseJournalCorpusManifest([entry(), entry()])).toThrow();
  });

  it("rejects empty, duplicate and unknown requested ids", () => {
    const manifest = parseJournalCorpusManifest([entry()]);

    expect(() => selectJournalCorpusEntries(manifest, [])).toThrow(/at least one/i);
    expect(() => selectJournalCorpusEntries(manifest, [
      "2504.21524v1",
      "2504.21524v1",
    ])).toThrow(/duplicate/i);
    expect(() => selectJournalCorpusEntries(manifest, [
      "2504.21524v1",
      "2410.10611v2",
      "2408.15441v2",
      "2508.08368v2",
    ])).toThrow(/at most three/i);
    expect(() => selectJournalCorpusEntries(manifest, ["2410.10611v2"]))
      .toThrow(/unknown/i);
  });

  it("preserves requested order", () => {
    const first = entry();
    const second = entry({
      arxiv_id: "2410.10611v2",
      title: "A phase microscope for quantum gases",
      doi: "10.1126/science.adt1712",
      pdf_file: "2410.10611v2.pdf",
      pdf_sha256: "b".repeat(64),
    });
    const manifest = parseJournalCorpusManifest([first, second]);

    const selected = selectJournalCorpusEntries(manifest, [
      second.arxiv_id,
      first.arxiv_id,
    ]);

    expect(selected.map(({ arxiv_id }) => arxiv_id)).toEqual([
      "2410.10611v2",
      "2504.21524v1",
    ]);
  });

  it("maps public facts without inferring a full-text license", () => {
    const selected = selectJournalCorpusEntries(
      parseJournalCorpusManifest([entry()]),
      ["2504.21524v1"],
    );

    const input = toJournalPaperSourceInput(
      selected[0]!,
      new Date("2026-09-01T00:00:00Z"),
    );

    expect(input).toEqual({
      doi: "10.1126/science.adx1707",
      sourceName: "arxiv",
      sourceRecordId: "2504.21524v1",
      sourceUrl: "https://arxiv.org/abs/2504.21524v1",
      licenseUrl: undefined,
      retrievedAt: new Date("2026-09-01T00:00:00Z"),
      title: "Levitated Sensor for Magnetometry in Ambient Environment",
      abstract: "A public abstract about a levitated magnetometer.",
      journal: "Science",
      firstAuthor: "Wei Ji",
      publishedAt: new Date("2025-04-30T11:18:46Z"),
      originalUrl: "https://arxiv.org/abs/2504.21524v1",
      accessStatus: "UNKNOWN",
    });
    expect(JSON.stringify(input)).not.toContain("2504.21524v1.pdf");
    expect(JSON.stringify(input)).not.toContain("license_note");
  });
});

function entry(overrides: Record<string, unknown> = {}) {
  return {
    arxiv_id: "2504.21524v1",
    journal: "Science",
    title: "Levitated Sensor for Magnetometry in Ambient Environment",
    journal_ref: null,
    doi: "10.1126/science.adx1707",
    published: "2025-04-30T11:18:46Z",
    authors: ["Wei Ji", "Changhao Xu"],
    primary_category: "physics.ins-det",
    categories: ["physics.ins-det"],
    abstract: "A public abstract about a levitated magnetometer.",
    pdf_file: "2504.21524v1.pdf",
    pdf_size: 409_709,
    pdf_sha256: "a".repeat(64),
    source: "arxiv",
    license_note: "Check the arXiv version-specific license.",
    ...overrides,
  };
}
