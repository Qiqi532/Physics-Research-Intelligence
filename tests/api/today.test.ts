import { describe, expect, it, vi } from "vitest";
import type { TodayRepository } from "../../packages/db/src/today-repository";
import { createTodayApi } from "../../apps/web/src/server/today";

const now = new Date("2026-08-30T04:00:00.000Z");

describe("Today API service", () => {
  it("returns serializable recommendations, score breakdown, reasons and queue", async () => {
    const repository = fakeRepository({
      getToday: vi.fn().mockResolvedValue({
        generatedAt: now,
        stats: {
          newPapers: 1,
          openPapers: 1,
          interpretedPapers: 0,
          crossDisciplinaryPapers: 0,
        },
        crossSignals: [],
        recommendations: [recommendation()],
        readingQueue: [recommendation({ readingStatus: "SAVED" })],
      }),
    });

    const result = await createTodayApi(repository, { now: () => now }).get();

    expect(repository.getToday).toHaveBeenCalledWith({
      userId: "default",
      now,
      candidateLimit: 500,
    });
    expect(result).toEqual({
      status: 200,
      body: expect.objectContaining({
        generatedAt: "2026-08-30T04:00:00.000Z",
        recommendations: [
          expect.objectContaining({
            publishedAt: "2026-08-30T01:00:00.000Z",
            scoreBreakdown: expect.objectContaining({ interest: 28 }),
            reasons: ["匹配你的「原子、分子与光学」兴趣（相关度 70%）"],
          }),
        ],
      }),
    });
    expect(JSON.stringify(result.body)).not.toContain("stateUpdatedAt");
  });

  it("returns an empty Today payload without treating it as an error", async () => {
    const repository = fakeRepository();

    const result = await createTodayApi(repository, { now: () => now }).get();

    expect(result.status).toBe(200);
    expect(result.body).toEqual(
      expect.objectContaining({ recommendations: [], readingQueue: [], crossSignals: [] }),
    );
  });

  it("maps repository failures to a generic 503 without leaking details", async () => {
    const logError = vi.fn();
    const repository = fakeRepository({
      getToday: vi.fn().mockRejectedValue(new Error("private database URL")),
    });

    const result = await createTodayApi(repository, { logError, now: () => now }).get();

    expect(result).toEqual({
      status: 503,
      body: { error: "Today data is temporarily unavailable" },
    });
    expect(logError).toHaveBeenCalledOnce();
    expect(JSON.stringify(result.body)).not.toContain("private database URL");
  });

  it("validates and updates a paper state by normalized DOI", async () => {
    const setPaperStateByDoi = vi.fn().mockResolvedValue({
      status: "updated",
      state: {
        status: "READING",
        feedback: "LIKE",
        note: "Read methods",
        isFavorite: false,
        favoritedAt: null,
        updatedAt: now,
      },
    });
    const repository = fakeRepository({ setPaperStateByDoi });

    const result = await createTodayApi(repository).updateState(
      "10.1103%2FEXAMPLE",
      { status: "READING", feedback: "LIKE", note: "Read methods" },
    );

    expect(setPaperStateByDoi).toHaveBeenCalledWith({
      userId: "default",
      doi: "10.1103/example",
      status: "READING",
      feedback: "LIKE",
      note: "Read methods",
    });
    expect(result).toEqual({
      status: 200,
      body: {
        state: {
          status: "READING",
          feedback: "LIKE",
          note: "Read methods",
          isFavorite: false,
          favoritedAt: null,
          updatedAt: "2026-08-30T04:00:00.000Z",
        },
      },
    });
  });

  it("accepts an explicit favorite boolean and serializes favoritedAt", async () => {
    const setPaperStateByDoi = vi.fn().mockResolvedValue({
      status: "updated",
      state: {
        status: "SAVED",
        feedback: "NONE",
        note: null,
        isFavorite: true,
        favoritedAt: now,
        updatedAt: now,
      },
    });
    const repository = fakeRepository({ setPaperStateByDoi });

    const result = await createTodayApi(repository).updateState("10.1103%2Ffavorite", {
      status: "SAVED",
      isFavorite: true,
    });

    expect(setPaperStateByDoi).toHaveBeenCalledWith({
      userId: "default",
      doi: "10.1103/favorite",
      status: "SAVED",
      feedback: "NONE",
      note: null,
      isFavorite: true,
    });
    expect(result).toEqual({
      status: 200,
      body: {
        state: {
          status: "SAVED",
          feedback: "NONE",
          note: null,
          isFavorite: true,
          favoritedAt: "2026-08-30T04:00:00.000Z",
          updatedAt: "2026-08-30T04:00:00.000Z",
        },
      },
    });
  });

  it.each([
    ["10.1103%2Fexample", { status: "SAVED", isFavorite: "yes" }],
    ["10.1103%2Fexample", { status: "SAVED", isFavorite: 1 }],
    ["10.1103%2Fexample", { status: "SAVED", isFavorite: null }],
    ["10.1103%2Fexample", { status: "SAVED", favoritedAt: now }],
  ])("rejects unknown or non-boolean favorite fields", async (doi, body) => {
    const repository = fakeRepository();

    const result = await createTodayApi(repository).updateState(doi, body);

    expect(result.status).toBe(400);
    expect(repository.setPaperStateByDoi).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid DOI", { status: "SAVED" }],
    ["10.1103%2Fexample", null],
    ["10.1103%2Fexample", { status: "UNKNOWN" }],
    ["10.1103%2Fexample", { status: "SAVED", feedback: "MAYBE" }],
    ["10.1103%2Fexample", { status: "SAVED", extra: true }],
    ["10.1103%2Fexample", { status: "SAVED", note: "x".repeat(4001) }],
  ])("rejects invalid state input", async (doi, body) => {
    const repository = fakeRepository();

    const result = await createTodayApi(repository).updateState(doi, body);

    expect(result.status).toBe(400);
    expect(repository.setPaperStateByDoi).not.toHaveBeenCalled();
  });

  it("returns 404 when the DOI is valid but the paper is missing", async () => {
    const repository = fakeRepository({
      setPaperStateByDoi: vi.fn().mockResolvedValue({ status: "not_found" }),
    });

    const result = await createTodayApi(repository).updateState(
      "10.1103%2Fmissing",
      { status: "SAVED" },
    );

    expect(result).toEqual({ status: 404, body: { error: "Paper not found" } });
  });
});

function fakeRepository(overrides: Partial<TodayRepository> = {}): TodayRepository {
  return {
    getToday: vi.fn().mockResolvedValue({
      generatedAt: now,
      stats: {
        newPapers: 0,
        openPapers: 0,
        interpretedPapers: 0,
        crossDisciplinaryPapers: 0,
      },
      crossSignals: [],
      recommendations: [],
      readingQueue: [],
    }),
    setPaperStateByDoi: vi.fn(),
    ...overrides,
  };
}

function recommendation(overrides: Record<string, unknown> = {}) {
  return {
    id: "paper-1",
    doi: "10.1103/example",
    title: "A recommended paper",
    journal: "Test Physics",
    publishedAt: new Date("2026-08-30T01:00:00.000Z"),
    originalUrl: "https://example.test/paper",
    accessStatus: "OPEN",
    sourceName: "arxiv",
    tags: [
      {
        slug: "amo-optics",
        labelZh: "原子、分子与光学",
        relevance: 0.7,
        isCrossDisciplinary: false,
      },
    ],
    readingStatus: "UNREAD",
    feedback: "NONE",
    isFavorite: false,
    hasInterpretation: false,
    score: 62,
    scoreBreakdown: {
      interest: 28,
      classification: 21,
      recency: 13,
      discovery: 0,
      readingState: 0,
    },
    reasons: ["匹配你的「原子、分子与光学」兴趣（相关度 70%）"],
    stateUpdatedAt: null,
    ...overrides,
  };
}
