import { describe, expect, it, vi } from "vitest";
import type { DatabaseClient } from "../../packages/db/src/client";
import { createTodayRepository } from "../../packages/db/src/today-repository";

const now = new Date("2026-08-30T04:00:00.000Z");

describe("Today repository aggregation", () => {
  it("builds a cold-start Today result with missing classification and interpretation states", async () => {
    const findPapers = vi.fn().mockResolvedValue([
      paperRow({
        id: "paper-cross",
        title: "Cross signal",
        classifications: [
          classificationRow({
            tagSlug: "cross-disciplinary",
            tag: {
              slug: "cross-disciplinary",
              labelZh: "交叉物理",
              isCrossDisciplinary: true,
            },
          }),
        ],
      }),
      paperRow({
        id: "paper-unclassified",
        doi: null,
        title: "Awaiting classification",
        classifications: [],
        interpretations: [],
      }),
    ]);
    const repository = createTodayRepository({
      userInterest: { findMany: vi.fn().mockResolvedValue([]) },
      paper: { findMany: findPapers },
    } as unknown as DatabaseClient);

    const result = await repository.getToday({
      userId: "default",
      now,
      candidateLimit: 20,
    });

    expect(result.stats).toEqual({
      newPapers: 2,
      openPapers: 2,
      interpretedPapers: 0,
      crossDisciplinaryPapers: 1,
    });
    expect(result.recommendations.map(({ id }) => id)).toEqual([
      "paper-cross",
      "paper-unclassified",
    ]);
    expect(result.recommendations[1]).toEqual(
      expect.objectContaining({
        hasInterpretation: false,
        reasons: expect.arrayContaining(["新近收录，尚待完成物理分类"]),
      }),
    );
    expect(result.crossSignals).toEqual([
      {
        tagSlug: "cross-disciplinary",
        labelZh: "交叉物理",
        paperCount: 1,
      },
    ]);
    expect(result.readingQueue).toEqual([]);
    expect(findPapers).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 20,
        where: expect.objectContaining({ OR: expect.any(Array) }),
      }),
    );
  });

  it("uses interests and reading state while deduplicating repeated classification tags", async () => {
    const interested = paperRow({
      id: "paper-interested",
      classifications: [
        classificationRow({ relevance: 0.95 }),
        classificationRow({ relevance: 0.4 }),
      ],
      userStates: [stateRow({ status: "SAVED" })],
      interpretations: [{ id: "interpretation-1" }],
    });
    const repository = createTodayRepository({
      userInterest: {
        findMany: vi.fn().mockResolvedValue([{ tagSlug: "amo-optics", weight: 2 }]),
      },
      paper: { findMany: vi.fn().mockResolvedValue([interested]) },
    } as unknown as DatabaseClient);

    const result = await repository.getToday({
      userId: "default",
      now,
      candidateLimit: 20,
    });

    expect(result.recommendations[0]).toEqual(
      expect.objectContaining({
        id: "paper-interested",
        hasInterpretation: true,
        tags: [expect.objectContaining({ slug: "amo-optics", relevance: 0.95 })],
        scoreBreakdown: expect.objectContaining({ interest: 38 }),
      }),
    );
    expect(result.readingQueue).toEqual([
      expect.objectContaining({ id: "paper-interested", readingStatus: "SAVED" }),
    ]);
  });

  it("counts only the previous Shanghai calendar day by creation time", async () => {
    const repository = createTodayRepository({
      userInterest: { findMany: vi.fn().mockResolvedValue([]) },
      paper: {
        findMany: vi.fn().mockResolvedValue([
          paperRow({
            id: "paper-yesterday",
            createdAt: new Date("2026-08-28T16:00:00.000Z"),
          }),
          paperRow({
            id: "paper-before-yesterday",
            createdAt: new Date("2026-08-28T15:59:59.999Z"),
          }),
          paperRow({
            id: "paper-today",
            createdAt: new Date("2026-08-29T16:00:00.000Z"),
          }),
        ]),
      },
    } as unknown as DatabaseClient);

    const result = await repository.getToday({
      userId: "default",
      now,
      candidateLimit: 20,
    });

    expect(result.stats).toEqual({
      newPapers: 1,
      openPapers: 1,
      interpretedPapers: 0,
      crossDisciplinaryPapers: 0,
    });
  });

  it("places interpreted papers before non-interpreted papers", async () => {
    const repository = createTodayRepository({
      userInterest: { findMany: vi.fn().mockResolvedValue([]) },
      paper: {
        findMany: vi.fn().mockResolvedValue([
          paperRow({ id: "paper-without-interpretation" }),
          paperRow({
            id: "paper-with-interpretation",
            interpretations: [{ id: "interpretation-1" }],
          }),
        ]),
      },
    } as unknown as DatabaseClient);

    const result = await repository.getToday({
      userId: "default",
      now,
      candidateLimit: 20,
    });

    expect(result.recommendations.map(({ id }) => id)).toEqual([
      "paper-with-interpretation",
      "paper-without-interpretation",
    ]);
  });

  it("upserts a safe state by normalized DOI and reports missing papers", async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce({ id: "paper-1" })
      .mockResolvedValueOnce(null);
    const upsert = vi.fn().mockResolvedValue(
      stateRow({ status: "READING", feedback: "LIKE", note: "Read methods" }),
    );
    const findExistingState = vi.fn().mockResolvedValue(null);
    const repository = createTodayRepository({
      paper: { findUnique },
      userPaperState: { findUnique: findExistingState, upsert },
    } as unknown as DatabaseClient);

    await expect(
      repository.setPaperStateByDoi({
        userId: "default",
        doi: "DOI: 10.1103/EXAMPLE",
        status: "READING",
        feedback: "LIKE",
        note: "Read methods",
      }),
    ).resolves.toEqual({
      status: "updated",
      state: expect.objectContaining({ status: "READING", feedback: "LIKE" }),
    });
    expect(findUnique).toHaveBeenNthCalledWith(1, {
      where: { doi: "10.1103/example" },
      select: { id: true },
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_paperId: { userId: "default", paperId: "paper-1" } },
      }),
    );
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ isFavorite: false, favoritedAt: null }),
        update: expect.not.objectContaining({
          isFavorite: expect.anything(),
          favoritedAt: expect.anything(),
        }),
      }),
    );
    expect(findExistingState).not.toHaveBeenCalled();

    await expect(
      repository.setPaperStateByDoi({
        userId: "default",
        doi: "10.1103/missing",
        status: "SAVED",
        feedback: "NONE",
        note: null,
      }),
    ).resolves.toEqual({ status: "not_found" });
  });
});

function paperRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "paper-1",
    doi: "10.1103/example",
    title: "A physics paper",
    journal: "Test Physics",
    publishedAt: new Date("2026-08-30T01:00:00.000Z"),
    createdAt: new Date("2026-08-29T00:00:00.000Z"),
    originalUrl: "https://example.test/paper",
    accessStatus: "OPEN",
    sources: [{ sourceName: "arxiv" }],
    classifications: [classificationRow()],
    interpretations: [],
    userStates: [],
    ...overrides,
  };
}

function classificationRow(overrides: Record<string, unknown> = {}) {
  return {
    tagSlug: "amo-optics",
    relevance: 0.7,
    createdAt: new Date("2026-08-30T02:00:00.000Z"),
    tag: {
      slug: "amo-optics",
      labelZh: "原子、分子与光学",
      isCrossDisciplinary: false,
    },
    ...overrides,
  };
}

function stateRow(overrides: Record<string, unknown> = {}) {
  return {
    status: "UNREAD",
    feedback: "NONE",
    note: null,
    updatedAt: new Date("2026-08-30T03:00:00.000Z"),
    ...overrides,
  };
}
