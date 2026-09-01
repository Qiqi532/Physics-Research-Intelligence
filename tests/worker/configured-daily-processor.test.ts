import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ServerConfig } from "../../packages/domain/src/config";
import type { RuntimeAiSnapshot } from "../../apps/worker/src/runtime-ai-config";

const mocks = vi.hoisted(() => ({
  classifyPaper: vi.fn().mockResolvedValue({ status: "complete" }),
  interpretPaper: vi.fn().mockResolvedValue({ status: "complete" }),
  disconnect: vi.fn().mockResolvedValue(undefined),
  runDailyPipeline: vi.fn(async (input: {
    classify(id: string): Promise<unknown>;
    interpret(id: string): Promise<unknown>;
  }) => {
    await input.classify("paper-1");
    await input.classify("paper-2");
    await input.interpret("paper-1");
    return { status: "complete" };
  }),
}));

vi.mock("@pri/db", () => ({
  createPrismaClient: vi.fn(() => ({ $disconnect: mocks.disconnect })),
  createPaperRepository: vi.fn(() => ({})),
  createSourceSyncRepository: vi.fn(() => ({})),
  createAiRepository: vi.fn(() => ({})),
  createTodayRepository: vi.fn(() => ({})),
}));
vi.mock("@pri/sources", () => ({
  createOpenAlexConnector: vi.fn(() => ({})),
  createArxivConnector: vi.fn(() => ({})),
  createCrossrefConnector: vi.fn(() => ({})),
}));
vi.mock("../../apps/worker/src/daily-pipeline", () => ({
  runDailyPipeline: mocks.runDailyPipeline,
}));
vi.mock("../../apps/worker/src/jobs/classify-paper", () => ({
  classifyPaper: mocks.classifyPaper,
}));
vi.mock("../../apps/worker/src/jobs/interpret-paper", () => ({
  interpretPaper: mocks.interpretPaper,
}));

import {
  createConfiguredDailyProcessor,
  retentionCutoffAt,
} from "../../apps/worker/src/configured-daily-processor";

describe("configured daily processor runtime routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves a fresh snapshot per batch and reuses providers within each batch", async () => {
    const resolver = {
      resolve: vi.fn()
        .mockResolvedValueOnce(snapshot("model-a"))
        .mockResolvedValueOnce(snapshot("model-b")),
    };
    const createProvider = vi.fn((input: { provider: string; model: string }) => ({
      name: input.provider,
      model: input.model,
      classify: vi.fn(),
      interpret: vi.fn(),
      healthCheck: vi.fn(),
    }));
    const processor = createConfiguredDailyProcessor(config(), {
      resolver,
      createProvider,
    });

    await processor.process();
    await processor.process();
    await processor.close();

    expect(resolver.resolve).toHaveBeenCalledTimes(2);
    expect(createProvider.mock.calls.map(([value]) => value.model)).toEqual([
      "model-a-classify",
      "model-a-interpret",
      "model-b-classify",
      "model-b-interpret",
    ]);
    const firstBatchFirstProvider = mocks.classifyPaper.mock.calls[0]![0].primary;
    const firstBatchSecondProvider = mocks.classifyPaper.mock.calls[1]![0].primary;
    expect(firstBatchFirstProvider).toBe(firstBatchSecondProvider);
    expect(firstBatchFirstProvider.model).toBe("model-a-classify");
    expect(mocks.classifyPaper.mock.calls[2]![0].primary.model).toBe("model-b-classify");
    expect(mocks.classifyPaper.mock.calls[0]![0].prices.kimi.inputCostPerMillionUsd).toBe(1);
    expect(mocks.interpretPaper.mock.calls[0]![0].prices.kimi.inputCostPerMillionUsd).toBe(7);
  });

  it("wires a retention-based pruneExpired step into the daily pipeline", async () => {
    const processor = createConfiguredDailyProcessor(config(), {
      resolver: {
        resolve: vi.fn().mockResolvedValue(snapshot("model-a")),
      },
      createProvider: vi.fn(() => ({
        name: "kimi",
        model: "model-a",
        classify: vi.fn(),
        interpret: vi.fn(),
        healthCheck: vi.fn(),
      })),
    });

    const result = await processor.process();
    await processor.close();

    const deps = mocks.runDailyPipeline.mock.calls[0]![0];
    expect(typeof deps.pruneExpired).toBe("function");
    expect(typeof deps.prepareToday).toBe("function");
    expect(typeof deps.listInterpretationPaperIds).toBe("function");
    expect(result).toEqual(expect.objectContaining({ status: "complete" }));
  });

  it("derives the retention cutoff from a stable number of days", () => {
    const until = new Date("2026-08-30T06:00:00.000Z");
    expect(retentionCutoffAt(until, 30)).toEqual(new Date("2026-07-31T06:00:00.000Z"));
    expect(retentionCutoffAt(until, 0)).toEqual(until);
  });
});

function snapshot(model: string): RuntimeAiSnapshot {
  return {
    source: "persisted",
    classify: {
      primary: connection(`${model}-classify`),
      maxOutputTokens: 1_000,
    },
    interpret: {
      primary: connection(`${model}-interpret`),
      maxOutputTokens: 4_000,
    },
  };
}

function connection(model: string) {
  const inputCostPerMillionUsd = model.endsWith("interpret") ? 7 : 1;
  return {
    profileId: "11111111-1111-4111-8111-111111111111",
    name: model,
    provider: "kimi" as const,
    model,
    apiKey: ["batch", "test", "value"].join("-"),
    baseUrl: "https://kimi.example.test/v1",
    requestTimeoutMs: 30_000,
    inputCostPerMillionUsd,
    outputCostPerMillionUsd: 3,
  };
}

function config(): ServerConfig {
  return {
    DATABASE_URL: "postgresql://fixture.invalid/pri",
    REDIS_URL: "redis://fixture.invalid/0",
    DAILY_AI_BUDGET_USD: 2.5,
    DAILY_PIPELINE: { enabled: true, time: "06:00", timezone: "Asia/Shanghai" },
  };
}
