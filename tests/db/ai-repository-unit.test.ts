import { describe, expect, it, vi } from "vitest";
import type { DatabaseClient } from "../../packages/db/src/client";
import { createAiRepository } from "../../packages/db/src/ai-repository";

describe("AI repository budget queries", () => {
  it("counts only interpretation attempts toward the daily interpretation budget", async () => {
    const aggregate = vi.fn().mockResolvedValue({
      _sum: { estimatedCostUsd: 0.25 },
    });
    const repository = createAiRepository({
      aiRunAttempt: { aggregate },
    } as unknown as DatabaseClient);
    const from = new Date("2026-08-29T00:00:00.000Z");
    const until = new Date("2026-08-30T00:00:00.000Z");

    await expect(repository.sumDailyAttemptCost({ from, until })).resolves.toBe(0.25);
    expect(aggregate).toHaveBeenCalledWith({
      where: {
        aiRun: { runType: "INTERPRET" },
        completedAt: { gte: from, lt: until },
      },
      _sum: { estimatedCostUsd: true },
    });
  });
});
