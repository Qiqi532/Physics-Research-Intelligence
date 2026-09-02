import { describe, expect, it, vi } from "vitest";
import type { DatabaseClient } from "../../packages/db/src/client";
import { createAiRepository } from "../../packages/db/src/ai-repository";

describe("AI repository queries", () => {
  it("lists only public paper ids inside the daily window in stable order", async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: "paper-1" }, { id: "paper-2" }]);
    const repository = createAiRepository({
      paper: { findMany },
    } as unknown as DatabaseClient);
    const from = new Date("2026-08-29T00:00:00.000Z");
    const until = new Date("2026-08-30T00:00:00.000Z");

    await expect(repository.listPaperIdsForClassification({
      from,
      until,
      limit: 500,
    })).resolves.toEqual(["paper-1", "paper-2"]);
    expect(findMany).toHaveBeenCalledWith({
      where: { publishedAt: { gte: from, lte: until } },
      orderBy: [{ publishedAt: "asc" }, { id: "asc" }],
      take: 500,
      select: { id: true },
    });
  });

  it("lists classified papers in the daily window for interpretation", async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: "paper-1" }, { id: "paper-2" }]);
    const repository = createAiRepository({
      paper: { findMany },
    } as unknown as DatabaseClient);
    const from = new Date("2026-08-29T00:00:00.000Z");
    const until = new Date("2026-08-30T00:00:00.000Z");

    await expect(repository.listPaperIdsForInterpretation({
      from,
      until,
      limit: 500,
    })).resolves.toEqual(["paper-1", "paper-2"]);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        publishedAt: { gte: from, lte: until },
        classifications: { some: {} },
      },
      orderBy: [{ publishedAt: "asc" }, { id: "asc" }],
      take: 500,
      select: { id: true },
    });
  });

  it("lists unscreened paper facts inside the daily window", async () => {
    const from = new Date("2026-08-29T00:00:00.000Z");
    const until = new Date("2026-08-30T00:00:00.000Z");
    const rows = [{
      id: "paper-1",
      title: "Paper one",
      abstract: "Public abstract",
      journal: "Nature",
      publishedAt: from,
      accessStatus: "OPEN",
    }];
    const findMany = vi.fn().mockResolvedValue(rows);
    const repository = createAiRepository({
      paper: { findMany },
    } as unknown as DatabaseClient);

    await expect(repository.listPapersForScreening({
      from,
      until,
      limit: 1000,
    })).resolves.toEqual(rows);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        publishedAt: { gte: from, lte: until },
        screenings: { none: {} },
      },
      orderBy: [{ publishedAt: "asc" }, { id: "asc" }],
      take: 1000,
      select: {
        id: true,
        title: true,
        abstract: true,
        journal: true,
        publishedAt: true,
        accessStatus: true,
      },
    });
  });

  it("lists only selected screening candidates with interests", async () => {
    const from = new Date("2026-08-29T00:00:00.000Z");
    const until = new Date("2026-08-30T00:00:00.000Z");
    const findMany = vi.fn().mockResolvedValue([{
      id: "paper-1",
      publishedAt: from,
      screenings: [{
        score: 0.9,
        directionSlug: "amo-optics",
        selected: true,
      }],
    }]);
    const repository = createAiRepository({
      userInterest: {
        findMany: vi.fn().mockResolvedValue([
          { tagSlug: "amo-optics", weight: 2 },
        ]),
      },
      paper: { findMany },
    } as unknown as DatabaseClient);

    await expect(repository.listScreenedSelectionCandidates({
      from,
      until,
      limit: 500,
    })).resolves.toEqual({
      interests: { "amo-optics": 2 },
      candidates: [{
        id: "paper-1",
        publishedAt: from,
        score: 0.9,
        directionSlug: "amo-optics",
        selected: true,
      }],
    });
    expect(findMany).toHaveBeenCalledWith({
      where: {
        publishedAt: { gte: from, lte: until },
        screenings: { some: { selected: true } },
      },
      orderBy: [{ publishedAt: "asc" }, { id: "asc" }],
      take: 500,
      select: {
        id: true,
        publishedAt: true,
        screenings: {
          where: { selected: true },
          orderBy: [{ score: "desc" }, { createdAt: "desc" }],
          take: 1,
          select: {
            score: true,
            directionSlug: true,
            selected: true,
          },
        },
      },
    });
  });
});
