import { describe, expect, it, vi } from "vitest";
import type { InterestRepository } from "../../packages/db/src/interest-repository";
import { createInterestApi } from "../../apps/web/src/server/interests";

describe("interest API service", () => {
  it("reads all existing physics directions", async () => {
    const repository = fakeRepository();

    const result = await createInterestApi(repository).get();

    expect(repository.list).toHaveBeenCalledWith("default");
    expect(result).toEqual({ status: 200, body: { tags: [tag()] } });
  });

  it("replaces known interests and returns refreshed settings", async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce([tag(), tag({ slug: "astrophysics" })])
      .mockResolvedValueOnce([tag({ weight: 2 }), tag({ slug: "astrophysics" })]);
    const replace = vi.fn().mockResolvedValue(undefined);
    const repository = fakeRepository({ list, replace });

    const result = await createInterestApi(repository).update({
      interests: [
        { tagSlug: "amo-optics", weight: 2 },
        { tagSlug: "astrophysics", weight: 0 },
      ],
    });

    expect(replace).toHaveBeenCalledWith("default", [
      { tagSlug: "amo-optics", weight: 2 },
      { tagSlug: "astrophysics", weight: 0 },
    ]);
    expect(result).toEqual({
      status: 200,
      body: { tags: [tag({ weight: 2 }), tag({ slug: "astrophysics" })] },
    });
  });

  it.each([
    [{ interests: [{ tagSlug: "unknown", weight: 1 }] }, 400],
    [{ interests: [{ tagSlug: "amo-optics", weight: 1 }, { tagSlug: "amo-optics", weight: 2 }] }, 400],
    [{ interests: [{ tagSlug: "amo-optics", weight: -1 }] }, 400],
    [{ interests: [{ tagSlug: "amo-optics", weight: 1, extra: true }] }, 400],
    [{ interests: [], extra: true }, 400],
  ])("rejects unsafe settings without writing", async (body, status) => {
    const repository = fakeRepository();

    const result = await createInterestApi(repository).update(body);

    expect(result.status).toBe(status);
    expect(repository.replace).not.toHaveBeenCalled();
  });

  it("rejects an oversized request before parsing", async () => {
    const repository = fakeRepository();

    const result = await createInterestApi(repository).update(
      { interests: [] },
      16_385,
    );

    expect(result).toEqual({ status: 413, body: { error: "Interest settings request is too large" } });
  });

  it("returns a generic recoverable error without leaking repository details", async () => {
    const repository = fakeRepository({
      list: vi.fn().mockRejectedValue(new Error("postgres://private")),
    });

    const result = await createInterestApi(repository).get();

    expect(result).toEqual({
      status: 503,
      body: { error: "Interest settings are temporarily unavailable" },
    });
    expect(JSON.stringify(result.body)).not.toContain("postgres://private");
  });
});

function fakeRepository(overrides: Partial<InterestRepository> = {}): InterestRepository {
  return {
    list: vi.fn().mockResolvedValue([tag()]),
    replace: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function tag(overrides: Record<string, unknown> = {}) {
  return {
    slug: "amo-optics",
    labelEn: "AMO and optics",
    labelZh: "原子、分子与光学",
    group: "physics",
    isCrossDisciplinary: false,
    weight: 0,
    defaultWeight: 1,
    ...overrides,
  };
}
