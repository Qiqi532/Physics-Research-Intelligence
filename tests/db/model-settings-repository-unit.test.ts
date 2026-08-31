import { describe, expect, it, vi } from "vitest";
import type { DatabaseClient } from "../../packages/db/src/client";
import {
  createModelSettingsRepository,
  ModelSettingsRepositoryError,
} from "../../packages/db/src/model-settings-repository";

describe("model settings repository", () => {
  it("maps stored rows without exposing Prisma decimals", async () => {
    const findMany = vi.fn().mockResolvedValue([storedRow()]);
    const repository = createModelSettingsRepository({
      aiConnectionProfile: { findMany },
    } as unknown as DatabaseClient);

    await expect(repository.list("default")).resolves.toEqual([
      expect.objectContaining({
        name: "Kimi 日常",
        inputCostPerMillionUsd: 0.2,
        outputCostPerMillionUsd: 0.8,
      }),
    ]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "default" },
    }));
  });

  it("maps duplicate names to a stable safe error", async () => {
    const repository = createModelSettingsRepository({
      aiConnectionProfile: {
        create: vi.fn().mockRejectedValue({ code: "P2002", meta: { target: ["userId", "name"] } }),
      },
    } as unknown as DatabaseClient);

    await expect(repository.create("default", writeInput())).rejects.toEqual(
      new ModelSettingsRepositoryError("profile_name_conflict"),
    );
  });

  it("rejects routing to a profile owned by another user before upsert", async () => {
    const upsert = vi.fn();
    const transaction = vi.fn(async (callback: (tx: unknown) => unknown) => callback({
      aiConnectionProfile: { count: vi.fn().mockResolvedValue(1) },
      aiRuntimeRouting: { upsert },
    }));
    const repository = createModelSettingsRepository({
      $transaction: transaction,
    } as unknown as DatabaseClient);

    await expect(repository.replaceRouting("default", {
      classifyPrimaryId: "11111111-1111-4111-8111-111111111111",
      classifyFallbackId: "22222222-2222-4222-8222-222222222222",
      interpretPrimaryId: null,
      interpretFallbackId: null,
    })).rejects.toEqual(new ModelSettingsRepositoryError("profile_not_found"));
    expect(upsert).not.toHaveBeenCalled();
  });

  it("maps a routed profile deletion to profile_in_use", async () => {
    const repository = createModelSettingsRepository({
      aiConnectionProfile: {
        deleteMany: vi.fn().mockRejectedValue({ code: "P2003" }),
      },
    } as unknown as DatabaseClient);

    await expect(repository.remove("default", "11111111-1111-4111-8111-111111111111"))
      .rejects.toEqual(new ModelSettingsRepositoryError("profile_in_use"));
  });
});

function writeInput() {
  return {
    name: "Kimi 日常",
    provider: "kimi",
    model: "moonshot-v1-8k",
    baseUrl: "https://api.moonshot.cn/v1",
    apiKeyCiphertext: Buffer.from("ciphertext"),
    apiKeyNonce: Buffer.alloc(12, 1),
    apiKeyAuthTag: Buffer.alloc(16, 2),
    encryptionVersion: 1,
    requestTimeoutMs: 30_000,
    inputCostPerMillionUsd: 0.2,
    outputCostPerMillionUsd: 0.8,
  };
}

function storedRow() {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    userId: "default",
    ...writeInput(),
    inputCostPerMillionUsd: { toNumber: () => 0.2 },
    outputCostPerMillionUsd: { toNumber: () => 0.8 },
    createdAt: new Date("2026-08-31T00:00:00.000Z"),
    updatedAt: new Date("2026-08-31T00:00:00.000Z"),
  };
}
