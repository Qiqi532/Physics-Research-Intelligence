import { describe, expect, it, vi } from "vitest";
import type { DatabaseClient } from "../../packages/db/src/client";
import { createPaperRepository } from "../../packages/db/src/paper-repository";

describe("paper detail repository projection", () => {
  it("returns the latest complete interpretation and default user state", async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: "paper-1",
      doi: "10.1103/example",
      title: "A safe paper",
      normalizedTitle: "a safe paper",
      abstract: "Public abstract",
      journal: "Test Physics",
      firstAuthor: "A. Researcher",
      publishedAt: new Date("2026-08-20T00:00:00.000Z"),
      originalUrl: "https://example.test/paper",
      accessStatus: "RESTRICTED",
      createdAt: new Date("2026-08-29T00:00:00.000Z"),
      updatedAt: new Date("2026-08-29T00:00:00.000Z"),
      sources: [],
      classifications: [
        {
          tagSlug: "amo-optics",
          relevance: 0.9,
          reason: "latest classification",
          tag: {
            slug: "amo-optics",
            labelEn: "AMO and optics",
            labelZh: "原子、分子与光学",
          },
        },
        {
          tagSlug: "amo-optics",
          relevance: 0.7,
          reason: "older classification",
          tag: {
            slug: "amo-optics",
            labelEn: "AMO and optics",
            labelZh: "原子、分子与光学",
          },
        },
      ],
      interpretations: [
        {
          id: "interpretation-1",
          content: { basis: "abstract_only", sourceDisclosure: "基于摘要解读" },
          provider: "openai",
          model: "fixture-model",
          promptVersion: "interpret-v1",
          createdAt: new Date("2026-08-30T00:00:00.000Z"),
        },
      ],
      userStates: [
        {
          status: "READING",
          feedback: "LIKE",
          note: "Check the methods",
          updatedAt: new Date("2026-08-30T01:00:00.000Z"),
        },
      ],
    });
    const repository = createPaperRepository({
      paper: { findUnique },
    } as unknown as DatabaseClient);

    const detail = await repository.findByDoi("10.1103/example");

    expect(detail).toEqual(
      expect.objectContaining({
        interpretation: expect.objectContaining({
          id: "interpretation-1",
          provider: "openai",
          content: expect.objectContaining({ sourceDisclosure: "基于摘要解读" }),
        }),
        userState: expect.objectContaining({ status: "READING", feedback: "LIKE" }),
        tags: [expect.objectContaining({ slug: "amo-optics", relevance: 0.9 })],
      }),
    );
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          interpretations: expect.objectContaining({
            where: { status: "COMPLETE" },
            take: 1,
          }),
          userStates: expect.objectContaining({
            where: { userId: "default" },
            take: 1,
          }),
        }),
      }),
    );
  });
});
