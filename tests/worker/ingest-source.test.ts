import { describe, expect, it, vi } from "vitest";
import type { PaperSourceInput } from "../../packages/domain/src/paper";
import { SourceConnectorError } from "../../packages/sources/src/http";
import type { SourceConnector, SourcePage } from "../../packages/sources/src/types";
import {
  ingestSource,
  ingestSources,
} from "../../apps/worker/src/jobs/ingest-source";

const window = {
  from: new Date("2026-08-28T00:00:00.000Z"),
  until: new Date("2026-08-29T00:00:00.000Z"),
};

describe("source ingestion job", () => {
  it("writes every page and persists resumable progress", async () => {
    const connector = connectorWithPages("crossref", [
      { records: [record("crossref", "one")], nextCursor: "page-2" },
      { records: [record("crossref", "two")], nextCursor: null },
    ]);
    const paperRepository = paperWriter();
    const stateRepository = stateWriter();

    const summary = await ingestSource({
      connector,
      paperRepository,
      stateRepository,
      ...window,
    });

    expect(summary).toEqual({
      source: "crossref",
      pages: 2,
      records: 2,
      candidateDuplicates: 0,
    });
    expect(paperRepository.upsertFromSource).toHaveBeenCalledTimes(2);
    expect(stateRepository.markProgress).toHaveBeenNthCalledWith(1, {
      sourceName: "crossref",
      windowFrom: window.from,
      windowUntil: window.until,
      cursor: "page-2",
    });
    expect(stateRepository.markSuccess).toHaveBeenCalledWith(
      "crossref",
      expect.any(Date),
    );
  });

  it("records a visible failure and rejects a repeated cursor", async () => {
    const connector = connectorWithPages("openalex", [
      { records: [], nextCursor: "same" },
      { records: [], nextCursor: "same" },
    ]);
    const stateRepository = stateWriter();

    await expect(ingestSource({
      connector,
      paperRepository: paperWriter(),
      stateRepository,
      cursor: "start",
      ...window,
    })).rejects.toEqual(
      expect.objectContaining<Partial<SourceConnectorError>>({ code: "invalid_cursor" }),
    );
    expect(stateRepository.markFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceName: "openalex",
        errorCode: "invalid_cursor",
      }),
    );
  });

  it("resumes a saved cursor only for the same date window", async () => {
    const connector = connectorWithPages("openalex", [
      { records: [], nextCursor: null },
    ]);
    const stateRepository = stateWriter();
    stateRepository.find.mockResolvedValue({
      sourceName: "openalex",
      windowFrom: window.from,
      windowUntil: window.until,
      cursor: "saved-cursor",
      lastSuccessAt: null,
      lastFailureAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
    });

    await ingestSource({
      connector,
      paperRepository: paperWriter(),
      stateRepository,
      ...window,
    });

    expect(connector.fetchPage).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: "saved-cursor" }),
    );
  });

  it("skips an already successful identical window without another source call", async () => {
    const connector = connectorWithPages("arxiv", [
      { records: [record("arxiv", "duplicate-call")], nextCursor: null },
    ]);
    const stateRepository = stateWriter();
    stateRepository.find.mockResolvedValue({
      sourceName: "arxiv",
      windowFrom: window.from,
      windowUntil: window.until,
      cursor: null,
      lastSuccessAt: new Date("2026-08-29T00:01:00.000Z"),
      lastFailureAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
    });

    await expect(ingestSource({
      connector,
      paperRepository: paperWriter(),
      stateRepository,
      ...window,
    })).resolves.toEqual({
      source: "arxiv",
      pages: 0,
      records: 0,
      candidateDuplicates: 0,
    });
    expect(connector.fetchPage).not.toHaveBeenCalled();
    expect(stateRepository.markProgress).not.toHaveBeenCalled();
  });

  it("keeps other sources successful when one connector fails", async () => {
    const failed: SourceConnector = {
      name: "crossref",
      fetchPage: vi.fn(async () => {
        throw new SourceConnectorError("upstream_5xx", "Crossref unavailable");
      }),
    };
    const successful = connectorWithPages("arxiv", [
      { records: [record("arxiv", "ok")], nextCursor: null },
    ]);

    const outcomes = await ingestSources({
      connectors: [failed, successful],
      paperRepository: paperWriter(),
      stateRepository: stateWriter(),
      ...window,
    });

    expect(outcomes).toEqual([
      { source: "crossref", ok: false, errorCode: "upstream_5xx" },
      {
        source: "arxiv",
        ok: true,
        summary: expect.objectContaining({ records: 1 }),
      },
    ]);
  });
});

function connectorWithPages(
  name: SourceConnector["name"],
  pages: SourcePage[],
): SourceConnector {
  let index = 0;
  return {
    name,
    fetchPage: vi.fn(async () => pages[index++] ?? { records: [], nextCursor: null }),
  };
}

function paperWriter() {
  return {
    upsertFromSource: vi.fn(async (input: PaperSourceInput) => ({
      paper: { id: input.sourceRecordId },
      candidateDuplicates: [],
    })),
  };
}

function stateWriter() {
  return {
    find: vi.fn(async () => null),
    markProgress: vi.fn(async () => undefined),
    markSuccess: vi.fn(async () => undefined),
    markFailure: vi.fn(async () => undefined),
  };
}

function record(sourceName: "crossref" | "openalex" | "arxiv", id: string): PaperSourceInput {
  return {
    sourceName,
    sourceRecordId: id,
    sourceUrl: `https://example.test/${sourceName}/${id}`,
    retrievedAt: new Date("2026-08-29T00:00:00.000Z"),
    title: `Paper ${id}`,
    accessStatus: "UNKNOWN",
  };
}
