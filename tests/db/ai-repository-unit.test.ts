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

  it("suppresses a whole paper when any selected screening was recently delivered", async () => {
    const from = new Date("2026-08-01T00:00:00.000Z");
    const until = new Date("2026-08-30T00:00:00.000Z");
    const findMany = vi.fn().mockResolvedValue([]);
    const repository = createAiRepository({
      userInterest: { findMany: vi.fn().mockResolvedValue([]) },
      paper: { findMany },
    } as unknown as DatabaseClient);

    await repository.listScreenedSelectionCandidates({
      from,
      until,
      limit: 500,
      excludeDeliveredWithinDays: 30,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          screenings: {
            some: { selected: true },
            none: {
              selected: true,
              deliveredAt: { gte: expect.any(Date) },
            },
          },
        }),
        select: expect.objectContaining({
          screenings: expect.objectContaining({
            where: {
              selected: true,
              OR: [
                { deliveredAt: null },
                { deliveredAt: { lt: expect.any(Date) } },
              ],
            },
          }),
        }),
      }),
    );
  });

  it("stamps deliveredAt on selected screenings for the delivered papers", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 2 });
    const repository = createAiRepository({
      paperScreening: { updateMany },
    } as unknown as DatabaseClient);

    const result = await repository.markScreeningsDelivered({
      paperIds: ["paper-1", "paper-2"],
      at: new Date("2026-08-30T04:00:00.000Z"),
    });

    expect(result).toEqual({ count: 2 });
    expect(updateMany).toHaveBeenCalledWith({
      where: { paperId: { in: ["paper-1", "paper-2"] }, selected: true },
      data: { deliveredAt: new Date("2026-08-30T04:00:00.000Z") },
    });
  });
});
