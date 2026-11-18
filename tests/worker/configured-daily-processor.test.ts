import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ServerConfig } from "../../packages/domain/src/config";
const mocks = vi.hoisted(() => ({
  run: vi.fn(), disconnect: vi.fn(async () => undefined), client: {},
}));
vi.mock("../../packages/db/src/index", () => ({
  createPrismaClient: vi.fn(() => ({ ...mocks.client, $disconnect: mocks.disconnect })),
}));
vi.mock("../../apps/worker/src/configured-research-daily", () => ({
  runConfiguredResearchDaily: mocks.run,
}));
import { createConfiguredDailyProcessor, createTaskProviders, markDeliveredSelection, retentionCutoffAt }
  from "../../apps/worker/src/configured-daily-processor";

describe("configured daily processor lifecycle", () => {
  beforeEach(() => vi.clearAllMocks());
  it("exposes cleanup before fallible initialization and always delegates each execution", async () => {
    mocks.run.mockRejectedValueOnce(new Error("initialization failed")).mockResolvedValueOnce({ recommendations: 1 });
    const options = { now: () => new Date("2026-11-13T06:00:00Z") };
    const processor = createConfiguredDailyProcessor(config(), options);
    await expect(processor.process()).rejects.toThrow("initialization failed");
    await expect(processor.process()).resolves.toEqual({ recommendations: 1 });
    await processor.close();
    expect(mocks.disconnect).toHaveBeenCalledOnce();
    expect(mocks.run).toHaveBeenCalledTimes(2);
    expect(mocks.run.mock.calls[0]?.[2]).toBe(options);
  });
  it("builds primary and fallback providers from one resolved route", () => {
    const primary = { name: "main", provider: "deepseek" as const, model: "m1", apiKey: "fixture-only",
      baseUrl: "https://fixture.invalid/v1", requestTimeoutMs: 30000 };
    const createProvider = vi.fn((input) => ({ name: input.provider, model: input.model }));
    const providers = createTaskProviders({ primary, fallback: { ...primary, model: "m2" }, maxOutputTokens: 2048 }, createProvider as never);
    expect(providers.primary.model).toBe("m1");
    expect(providers.fallback?.model).toBe("m2");
    expect(createProvider).toHaveBeenCalledTimes(2);
    expect(createProvider.mock.calls[0]?.[0]).toMatchObject({ maxOutputTokens: 2048, requestTimeoutMs: 30000 });
  });
  it("stamps selected papers at the explicit delivery boundary", async () => {
    const markScreeningsDelivered = vi.fn().mockResolvedValue({ count: 1 });
    const at = new Date("2026-08-30T06:00:00.000Z");

    await markDeliveredSelection({
      repository: { markScreeningsDelivered },
      paperIds: ["paper-1"],
      at,
      deliveryRecencyDays: 30,
    });

    expect(markScreeningsDelivered).toHaveBeenCalledWith({
      paperIds: ["paper-1"],
      at,
    });
  });

  it("does not stamp delivery when recency dedupe is disabled", async () => {
    const markScreeningsDelivered = vi.fn();

    await markDeliveredSelection({
      repository: { markScreeningsDelivered },
      paperIds: ["paper-1"],
      at: new Date("2026-08-30T06:00:00.000Z"),
      deliveryRecencyDays: 0,
    });

    expect(markScreeningsDelivered).not.toHaveBeenCalled();
  });

  it("derives the retention cutoff from a stable number of days", () => {
    const until = new Date("2026-08-30T06:00:00.000Z");
    expect(retentionCutoffAt(until, 30)).toEqual(new Date("2026-07-31T06:00:00.000Z"));
    expect(retentionCutoffAt(until, 0)).toEqual(until);
  });
});

function config(deliveryRecencyDays = 30): ServerConfig {
  return {
    DATABASE_URL: "postgresql://fixture.invalid/pri",
    RUNTIME_MODE: "local",
    REDIS_URL: "redis://fixture.invalid/0",
    PAPER_RETENTION_DAYS: 30,
    DAILY_PAPER_TARGET_MIN: 10,
    DAILY_PAPER_TARGET_MAX: 15,
    DAILY_PIPELINE: {
      enabled: true,
      time: "06:00",
      timezone: "Asia/Shanghai",
      ingestWindowDays: 30,
      deliveryRecencyDays,
    },
  };
}
