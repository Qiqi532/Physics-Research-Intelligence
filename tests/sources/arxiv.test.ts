import { describe, expect, it, vi } from "vitest";
import { createArxivConnector } from "../../packages/sources/src/arxiv";
import { SourceConnectorError } from "../../packages/sources/src/http";

const atomFixture = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/"
      xmlns:arxiv="http://arxiv.org/schemas/atom">
  <opensearch:totalResults>2</opensearch:totalResults>
  <entry>
    <id>https://arxiv.org/abs/2608.01234v2</id>
    <updated>2026-08-28T12:00:00Z</updated>
    <published>2026-08-27T12:00:00Z</published>
    <title>  Quantum   fields across scales </title>
    <summary> A public arXiv abstract. </summary>
    <author><name>Mei Lin</name></author>
    <author><name>Ada Researcher</name></author>
    <arxiv:doi>10.1000/arxiv-paper</arxiv:doi>
    <arxiv:journal_ref>Test Physics 42 (2026)</arxiv:journal_ref>
    <link href="https://arxiv.org/abs/2608.01234v2" rel="alternate" type="text/html" />
    <link href="https://creativecommons.org/licenses/by/4.0/" rel="license" />
    <category term="quant-ph" />
  </entry>
</feed>`;

describe("arXiv connector", () => {
  it("maps Atom metadata and advances an offset cursor", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(atomFixture, { headers: { "Content-Type": "application/atom+xml" } }),
    );
    const connector = createArxivConnector({
      fetchImpl,
      now: () => new Date("2026-08-29T00:00:00.000Z"),
    });

    const page = await connector.fetchPage({
      from: new Date("2026-08-27T00:00:00.000Z"),
      until: new Date("2026-08-29T00:00:00.000Z"),
      cursor: "0",
      pageSize: 100,
    });

    const url = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(url.searchParams.get("start")).toBe("0");
    expect(url.searchParams.get("max_results")).toBe("100");
    expect(url.searchParams.get("sortBy")).toBe("submittedDate");
    expect(url.searchParams.get("search_query")).toContain("cat:quant-ph");
    expect(page.nextCursor).toBe("1");
    expect(page.records[0]).toEqual(expect.objectContaining({
      doi: "10.1000/arxiv-paper",
      sourceName: "arxiv",
      sourceRecordId: "2608.01234",
      title: "Quantum fields across scales",
      abstract: "A public arXiv abstract.",
      firstAuthor: "Mei Lin",
      journal: "Test Physics 42 (2026)",
      accessStatus: "OPEN",
    }));
  });

  it("waits three seconds between consecutive calls", async () => {
    let time = 0;
    const sleep = vi.fn(async (milliseconds: number) => {
      time += milliseconds;
    });
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () =>
      new Response(atomFixture.replace("<opensearch:totalResults>2", "<opensearch:totalResults>1")),
    );
    const connector = createArxivConnector({ fetchImpl, sleep, nowMs: () => time });
    const request = {
      from: new Date("2026-08-27T00:00:00.000Z"),
      until: new Date("2026-08-29T00:00:00.000Z"),
    };

    await connector.fetchPage(request);
    await connector.fetchPage(request);

    expect(sleep).toHaveBeenCalledWith(3_000);
  });

  it("rejects a non-numeric offset and malformed XML visibly", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("not xml"));
    const connector = createArxivConnector({ fetchImpl });
    const request = {
      from: new Date("2026-08-27T00:00:00.000Z"),
      until: new Date("2026-08-29T00:00:00.000Z"),
    };

    await expect(connector.fetchPage({ ...request, cursor: "bad" })).rejects.toEqual(
      expect.objectContaining<Partial<SourceConnectorError>>({ code: "invalid_cursor" }),
    );
    await expect(connector.fetchPage(request)).rejects.toEqual(
      expect.objectContaining<Partial<SourceConnectorError>>({ code: "malformed_response" }),
    );
  });
});
