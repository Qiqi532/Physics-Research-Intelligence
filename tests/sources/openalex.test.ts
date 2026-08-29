import { describe, expect, it, vi } from "vitest";
import { createOpenAlexConnector } from "../../packages/sources/src/openalex";

describe("OpenAlex connector", () => {
  it("filters Physics and Astronomy works and rebuilds abstracts", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      meta: { next_cursor: "next-openalex" },
      results: [{
        id: "https://openalex.org/W123",
        doi: "https://doi.org/10.1000/openalex",
        title: "An OpenAlex physics paper",
        publication_date: "2026-08-28",
        abstract_inverted_index: { Quantum: [0], matter: [1], works: [2] },
        authorships: [{ author: { display_name: "Ada Researcher" } }],
        primary_location: {
          landing_page_url: "https://example.test/paper",
          source: { display_name: "Physics Journal" },
          license: "cc-by",
        },
        open_access: { is_oa: true },
      }],
    }));
    const connector = createOpenAlexConnector({
      fetchImpl,
      apiKey: "test-key",
      now: () => new Date("2026-08-29T00:00:00.000Z"),
    });

    const page = await connector.fetchPage({
      from: new Date("2026-08-28T00:00:00.000Z"),
      until: new Date("2026-08-29T00:00:00.000Z"),
      cursor: "cursor value",
      pageSize: 100,
    });

    const [input, init] = fetchImpl.mock.calls[0] ?? [];
    const url = new URL(String(input));
    expect(url.searchParams.get("filter")).toBe(
      "topics.field.id:31,from_publication_date:2026-08-28,to_publication_date:2026-08-29",
    );
    expect(url.searchParams.get("cursor")).toBe("cursor value");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer test-key");
    expect(url.searchParams.has("api_key")).toBe(false);
    expect(page.nextCursor).toBe("next-openalex");
    expect(page.records[0]).toEqual(expect.objectContaining({
      doi: "https://doi.org/10.1000/openalex",
      sourceName: "openalex",
      sourceRecordId: "W123",
      abstract: "Quantum matter works",
      firstAuthor: "Ada Researcher",
      journal: "Physics Journal",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      accessStatus: "OPEN",
    }));
  });

  it("allows keyless requests and skips records without a title", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      meta: { next_cursor: null },
      results: [{ id: "https://openalex.org/W404", title: null }],
    }));
    const connector = createOpenAlexConnector({ fetchImpl });

    const page = await connector.fetchPage({
      from: new Date("2026-08-28T00:00:00.000Z"),
      until: new Date("2026-08-29T00:00:00.000Z"),
    });

    expect(new Headers(fetchImpl.mock.calls[0]?.[1]?.headers).has("Authorization")).toBe(false);
    expect(page).toEqual({ records: [], nextCursor: null });
  });
});
