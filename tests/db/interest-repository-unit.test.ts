import { describe, expect, it, vi } from "vitest";
import type { DatabaseClient } from "../../packages/db/src/client";
import { createInterestRepository } from "../../packages/db/src/interest-repository";

describe("interest repository", () => {
  it("lists every existing tag with saved and default weights", async () => {
    const findMany = vi.fn().mockResolvedValue([
      tagRow({ slug: "amo-optics", userInterests: [{ weight: 1.75 }] }),
      tagRow({
        slug: "cross-disciplinary",
        labelZh: "交叉物理",
        isCrossDisciplinary: true,
        userInterests: [],
      }),
    ]);
    const repository = createInterestRepository({
      physicsTag: { findMany },
    } as unknown as DatabaseClient);

    await expect(repository.list("default")).resolves.toEqual([
      expect.objectContaining({ slug: "amo-optics", weight: 1.75, defaultWeight: 1 }),
      expect.objectContaining({
        slug: "cross-disciplinary",
        weight: 0,
        defaultWeight: 1,
        isCrossDisciplinary: true,
      }),
    ]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({ userInterests: expect.any(Object) }),
    }));
  });

  it("transactionally replaces interests and omits zero weights", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 2 });
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    const transaction = vi.fn(async (callback: (tx: unknown) => unknown) => callback({
      userInterest: { deleteMany, createMany },
    }));
    const repository = createInterestRepository({
      $transaction: transaction,
    } as unknown as DatabaseClient);

    await repository.replace("default", [
      { tagSlug: "amo-optics", weight: 2 },
      { tagSlug: "astrophysics", weight: 0 },
    ]);

    expect(deleteMany).toHaveBeenCalledWith({ where: { userId: "default" } });
    expect(createMany).toHaveBeenCalledWith({
      data: [{ userId: "default", tagSlug: "amo-optics", weight: 2 }],
    });
  });
});

function tagRow(overrides: Record<string, unknown> = {}) {
  return {
    slug: "amo-optics",
    labelEn: "AMO and optics",
    labelZh: "原子、分子与光学",
    group: "physics",
    isCrossDisciplinary: false,
    userInterests: [],
    ...overrides,
  };
}
