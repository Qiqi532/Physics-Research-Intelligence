import { describe, expect, it, vi } from "vitest";
import type { PaperRepository } from "../../packages/db/src/paper-repository";
import {
  importJournalCorpus,
} from "../../apps/worker/src/journal-corpus/importer";
import type {
  JournalCorpusEntry,
} from "../../apps/worker/src/journal-corpus/manifest";

describe("journal corpus importer", () => {
  it("imports selected public facts in order through the existing repository", async () => {
    const entries = [entry(), entry({
      arxiv_id: "2410.10611v2",
      title: "A phase microscope for quantum gases",
      doi: "10.1126/science.adt1712",
      pdf_file: "2410.10611v2.pdf",
      pdf_sha256: "b".repeat(64),
    })];
    const upsertFromSource = vi.fn<PaperRepository["upsertFromSource"]>()
      .mockImplementation(async (input) => ({
        paper: paperSummary(input.sourceRecordId, input.title),
        candidateDuplicates: [],
      }));

    const first = await importJournalCorpus(
      entries,
      { upsertFromSource },
      new Date("2026-09-01T00:00:00Z"),
    );
    const second = await importJournalCorpus(
      entries,
      { upsertFromSource },
      new Date("2026-09-01T00:00:00Z"),
    );

    expect(upsertFromSource).toHaveBeenCalledTimes(4);
    expect(upsertFromSource.mock.calls.map(([input]) => input.sourceRecordId)).toEqual([
      "2504.21524v1",
      "2410.10611v2",
      "2504.21524v1",
      "2410.10611v2",
    ]);
    expect(first).toEqual({
      outcomes: [
        { arxivId: "2504.21524v1", status: "imported", paperId: "2504.21524v1" },
        { arxivId: "2410.10611v2", status: "imported", paperId: "2410.10611v2" },
      ],
      summary: { total: 2, imported: 2, failed: 0 },
    });
    expect(second).toEqual(first);
    expect(JSON.stringify(first)).not.toContain(entries[0]!.abstract);
    expect(JSON.stringify(first)).not.toContain(entries[0]!.pdf_file);
  });

  it("isolates one repository failure behind a stable safe code", async () => {
    const entries = [entry(), entry({
      arxiv_id: "2410.10611v2",
      title: "A phase microscope for quantum gases",
      doi: "10.1126/science.adt1712",
      pdf_file: "2410.10611v2.pdf",
      pdf_sha256: "b".repeat(64),
    })];
    const upsertFromSource = vi.fn<PaperRepository["upsertFromSource"]>()
      .mockImplementation(async (input) => {
        if (input.sourceRecordId === "2504.21524v1") {
          throw new Error(`database rejected ${input.abstract}`);
        }
        return {
          paper: paperSummary(input.sourceRecordId, input.title),
          candidateDuplicates: [],
        };
      });

    const result = await importJournalCorpus(
      entries,
      { upsertFromSource },
      new Date("2026-09-01T00:00:00Z"),
    );

    expect(upsertFromSource).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      outcomes: [
        {
          arxivId: "2504.21524v1",
          status: "failed",
          errorCode: "repository_write_failed",
        },
        { arxivId: "2410.10611v2", status: "imported", paperId: "2410.10611v2" },
      ],
      summary: { total: 2, imported: 1, failed: 1 },
    });
    expect(JSON.stringify(result)).not.toContain("database rejected");
    expect(JSON.stringify(result)).not.toContain(entries[0]!.abstract);
  });
});

function entry(overrides: Partial<JournalCorpusEntry> = {}): JournalCorpusEntry {
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

function paperSummary(id: string, title: string) {
  const now = new Date("2026-09-01T00:00:00Z");
  return {
    id,
    doi: null,
    title,
    normalizedTitle: title.toLowerCase(),
    abstract: null,
    journal: null,
    firstAuthor: null,
    publishedAt: null,
    originalUrl: null,
    accessStatus: "UNKNOWN" as const,
    createdAt: now,
    updatedAt: now,
  };
}
