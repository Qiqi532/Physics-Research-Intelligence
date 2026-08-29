import { describe, expect, it, vi } from "vitest";
import type {
  PaperDetails,
  PaperRepository,
  PaperSummary,
} from "../../packages/db/src/paper-repository";
import { createPaperApi } from "../../apps/web/src/server/papers";

const paper: PaperSummary = {
  id: "11111111-1111-4111-8111-111111111111",
  doi: "10.1103/example",
  title: "A safe paper",
  normalizedTitle: "a safe paper",
  abstract: "Public abstract",
  journal: "Test Physics",
  firstAuthor: "A. Researcher",
  publishedAt: new Date("2026-08-20T00:00:00.000Z"),
  originalUrl: "https://example.test/paper",
  accessStatus: "OPEN",
  createdAt: new Date("2026-08-29T00:00:00.000Z"),
  updatedAt: new Date("2026-08-29T00:00:00.000Z"),
};

describe("paper API service", () => {
  it("uses a safe default page size and returns serializable facts", async () => {
    const repository = fakeRepository({
      list: vi.fn().mockResolvedValue({ items: [paper], nextCursor: null }),
    });

    const result = await createPaperApi(repository).list(new URLSearchParams());

    expect(repository.list).toHaveBeenCalledWith({ limit: 20 });
    expect(result).toEqual({
      status: 200,
      body: {
        items: [
          expect.objectContaining({
            doi: "10.1103/example",
            publishedAt: "2026-08-20T00:00:00.000Z",
          }),
        ],
        nextCursor: null,
      },
    });
    expect(JSON.stringify(result.body)).not.toContain("normalizedTitle");
  });

  it.each(["0", "101", "1.5", "many"])("rejects invalid limit %s", async (limit) => {
    const repository = fakeRepository();
    const result = await createPaperApi(repository).list(new URLSearchParams({ limit }));

    expect(result.status).toBe(400);
    expect(repository.list).not.toHaveBeenCalled();
  });

  it("rejects malformed cursors before querying the repository", async () => {
    const repository = fakeRepository();
    const result = await createPaperApi(repository).list(
      new URLSearchParams({ cursor: "not-a-uuid" }),
    );

    expect(result.status).toBe(400);
    expect(repository.list).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid DOI and 404 for a missing paper", async () => {
    const repository = fakeRepository({ findByDoi: vi.fn().mockResolvedValue(null) });
    const api = createPaperApi(repository);

    expect((await api.detail("not-a-doi")).status).toBe(400);
    expect((await api.detail("10.1103%2Fmissing")).status).toBe(404);
    expect(repository.findByDoi).toHaveBeenCalledTimes(1);
  });

  it("returns source provenance and tags for a paper detail", async () => {
    const detail: PaperDetails = {
      ...paper,
      sources: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          sourceName: "crossref",
          sourceRecordId: "crossref-1",
          sourceUrl: "https://example.test/source",
          retrievedAt: new Date("2026-08-29T00:00:00.000Z"),
          licenseUrl: null,
        },
      ],
      tags: [
        {
          slug: "amo-optics",
          labelEn: "AMO and Optics",
          labelZh: "原子、分子与光学",
          relevance: 0.9,
          reason: "Direct subject match",
        },
      ],
    };
    const repository = fakeRepository({ findByDoi: vi.fn().mockResolvedValue(detail) });

    const result = await createPaperApi(repository).detail("10.1103%2Fexample");

    expect(result.status).toBe(200);
    expect(result.body).toEqual(
      expect.objectContaining({
        sources: [expect.objectContaining({ sourceName: "crossref" })],
        tags: [expect.objectContaining({ slug: "amo-optics" })],
      }),
    );
  });

  it("maps repository failures to a generic 503 and reports a safe error", async () => {
    const logError = vi.fn();
    const repository = fakeRepository({
      list: vi.fn().mockRejectedValue(new Error("connection failed for private-url")),
    });

    const result = await createPaperApi(repository, { logError }).list(
      new URLSearchParams(),
    );

    expect(result).toEqual({
      status: 503,
      body: { error: "Paper data is temporarily unavailable" },
    });
    expect(logError).toHaveBeenCalledOnce();
    expect(JSON.stringify(result.body)).not.toContain("private-url");
  });
});

function fakeRepository(overrides: Partial<PaperRepository> = {}): PaperRepository {
  return {
    upsertFromSource: vi.fn(),
    list: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    findByDoi: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}
