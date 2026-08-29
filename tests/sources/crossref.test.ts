import { describe, expect, it, vi } from "vitest";
import { createCrossrefConnector } from "../../packages/sources/src/crossref";

describe("Crossref connector", () => {
  it("maps public metadata and follows the returned cursor", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      status: "ok",
      message: {
        items: [{
          DOI: "10.1103/PhysRevLett.1.2",
          title: ["A &amp; B in <i>quantum</i> physics"],
          abstract: "<jats:p>Public abstract.</jats:p>",
          author: [{ given: "Mei", family: "Lin" }],
          "container-title": ["Physical Review Letters"],
          published: { "date-parts": [[2026, 8, 28]] },
          URL: "https://doi.org/10.1103/PhysRevLett.1.2",
          license: [{ URL: "https://creativecommons.org/licenses/by/4.0/" }],
        }],
        "next-cursor": "next value",
      },
    }));
    const connector = createCrossrefConnector({
      issn: "0031-9007",
      fetchImpl,
      contactEmail: "contact@example.test",
      now: () => new Date("2026-08-29T00:00:00.000Z"),
    });

    const page = await connector.fetchPage({
      from: new Date("2026-08-28T00:00:00.000Z"),
      until: new Date("2026-08-29T00:00:00.000Z"),
      cursor: "*",
      pageSize: 100,
    });

    const url = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(url.searchParams.get("filter")).toBe(
      "from-created-date:2026-08-28,until-created-date:2026-08-29,issn:0031-9007",
    );
    expect(url.searchParams.get("cursor")).toBe("*");
    expect(url.searchParams.get("mailto")).toBe("contact@example.test");
    expect(page.nextCursor).toBe("next value");
    expect(page.records).toEqual([
      expect.objectContaining({
        doi: "10.1103/PhysRevLett.1.2",
        sourceName: "crossref",
        title: "A & B in quantum physics",
        abstract: "Public abstract.",
        firstAuthor: "Mei Lin",
        journal: "Physical Review Letters",
        accessStatus: "OPEN",
      }),
    ]);
  });

  it("skips unusable entries and ends pagination on an empty page", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      status: "ok",
      message: { items: [{ title: ["Missing DOI"] }], "next-cursor": "unused" },
    }));
    const connector = createCrossrefConnector({ issn: "0031-9007", fetchImpl });

    const page = await connector.fetchPage({
      from: new Date("2026-08-28T00:00:00.000Z"),
      until: new Date("2026-08-29T00:00:00.000Z"),
    });

    expect(page).toEqual({ records: [], nextCursor: null });
  });

  it("rejects an invalid ISSN before making a request", () => {
    expect(() => createCrossrefConnector({ issn: "physics" })).toThrow(
      "Crossref ISSN is invalid",
    );
  });
});
