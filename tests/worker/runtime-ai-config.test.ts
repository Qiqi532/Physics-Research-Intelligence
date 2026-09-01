import { describe, expect, it, vi } from "vitest";
import type { AiServerConfig } from "../../packages/domain/src/config";
import type { ModelSettingsRepository, StoredModelConnection } from "../../packages/db/src/model-settings-repository";
import type { ModelSettingsCipher } from "../../packages/db/src/model-settings-crypto";
import {
  createRuntimeAiConfigResolver,
  RuntimeAiConfigError,
} from "../../apps/worker/src/runtime-ai-config";

const kimiA = "11111111-1111-4111-8111-111111111111";
const kimiB = "22222222-2222-4222-8222-222222222222";
const glmId = "33333333-3333-4333-8333-333333333333";
const environmentTestValue = ["environment", "test"].join("-");

describe("runtime AI config resolver", () => {
  it("resolves task-scoped persisted profiles and permits different Kimi connections", async () => {
    const { repository, cipher } = fakes({
      routing: {
        classifyPrimaryId: kimiA,
        classifyFallbackId: glmId,
        interpretPrimaryId: kimiB,
        interpretFallbackId: null,
      },
    });
    const resolver = createRuntimeAiConfigResolver({ repository, cipher });

    const snapshot = await resolver.resolve();

    expect(snapshot.source).toBe("persisted");
    expect(snapshot.classify.primary).toMatchObject({
      profileId: kimiA,
      provider: "kimi",
      model: "kimi-classifier",
      apiKey: `decrypted-${kimiA}`,
    });
    expect(snapshot.classify.fallback).toMatchObject({ provider: "glm" });
    expect(snapshot.interpret.primary).toMatchObject({
      profileId: kimiB,
      provider: "kimi",
      model: "kimi-interpreter",
    });
  });

  it("adapts environment routes only when persisted routing is absent", async () => {
    const { repository, cipher } = fakes({ routing: null });
    const resolver = createRuntimeAiConfigResolver({
      repository,
      cipher,
      environmentConfig: environmentConfig(),
    });

    const snapshot = await resolver.resolve();

    expect(snapshot).toEqual(expect.objectContaining({
      source: "environment",
      classify: expect.objectContaining({
        primary: expect.objectContaining({ provider: "kimi", model: "env-classifier" }),
      }),
      interpret: expect.objectContaining({
        primary: expect.objectContaining({ provider: "kimi", model: "env-interpreter" }),
      }),
    }));
    expect(cipher.decrypt).not.toHaveBeenCalled();
  });

  it("fails closed for incomplete persisted routing without using environment fallback", async () => {
    const { repository, cipher } = fakes({
      routing: {
        classifyPrimaryId: null,
        classifyFallbackId: null,
        interpretPrimaryId: kimiB,
        interpretFallbackId: null,
      },
    });
    const resolver = createRuntimeAiConfigResolver({
      repository,
      cipher,
      environmentConfig: environmentConfig(),
    });

    await expect(resolver.resolve()).rejects.toEqual(
      new RuntimeAiConfigError("worker_ai_routing_invalid"),
    );
    expect(cipher.decrypt).not.toHaveBeenCalled();
  });

  it("fails closed when a persisted secret cannot be decrypted", async () => {
    const { repository, cipher } = fakes({
      routing: {
        classifyPrimaryId: kimiA,
        classifyFallbackId: null,
        interpretPrimaryId: kimiB,
        interpretFallbackId: null,
      },
    });
    cipher.decrypt = vi.fn().mockRejectedValue(new Error("damaged fixture ciphertext"));
    const resolver = createRuntimeAiConfigResolver({
      repository,
      cipher,
      environmentConfig: environmentConfig(),
    });

    await expect(resolver.resolve()).rejects.toEqual(
      new RuntimeAiConfigError("worker_ai_secret_unavailable"),
    );
  });

  it("reports missing AI configuration only when both sources are absent", async () => {
    const { repository, cipher } = fakes({ routing: null });

    await expect(createRuntimeAiConfigResolver({ repository, cipher }).resolve())
      .rejects.toEqual(new RuntimeAiConfigError("worker_ai_configuration_missing"));
  });
});

function fakes(options: {
  routing: {
    classifyPrimaryId: string | null;
    classifyFallbackId: string | null;
    interpretPrimaryId: string | null;
    interpretFallbackId: string | null;
  } | null;
}) {
  const profiles = new Map([
    [kimiA, stored(kimiA, "Kimi 分类", "kimi", "kimi-classifier")],
    [kimiB, stored(kimiB, "Kimi 解读", "kimi", "kimi-interpreter")],
    [glmId, stored(glmId, "GLM 备用", "glm", "glm-fallback")],
  ]);
  const repository = {
    getRouting: vi.fn().mockResolvedValue(options.routing
      ? { userId: "default", ...options.routing, updatedAt: new Date(0) }
      : null),
    find: vi.fn(async (_userId: string, id: string) => profiles.get(id) ?? null),
  } as unknown as ModelSettingsRepository;
  const cipher = {
    encrypt: vi.fn(),
    decrypt: vi.fn(async ({ profileId }: { profileId: string }) => `decrypted-${profileId}`),
  } as unknown as ModelSettingsCipher;
  return { repository, cipher };
}

function stored(
  id: string,
  name: string,
  provider: "kimi" | "glm",
  model: string,
): StoredModelConnection {
  return {
    id,
    userId: "default",
    name,
    provider,
    model,
    baseUrl: `https://${provider}.example.test/v1`,
    apiKeyCiphertext: Buffer.from("ciphertext"),
    apiKeyNonce: Buffer.alloc(12, 1),
    apiKeyAuthTag: Buffer.alloc(16, 2),
    encryptionVersion: 1,
    requestTimeoutMs: 30_000,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

function environmentConfig(): AiServerConfig {
  return {
    requestTimeoutMs: 45_000,
    classify: {
      primary: { provider: "kimi", model: "env-classifier" },
      fallback: { provider: "glm", model: "env-fallback" },
      maxOutputTokens: 1_000,
    },
    interpret: {
      primary: { provider: "kimi", model: "env-interpreter" },
      maxOutputTokens: 4_000,
    },
    providers: {
      kimi: {
        apiKey: `${environmentTestValue}-kimi`,
        baseUrl: "https://kimi.example.test/v1",
      },
      glm: {
        apiKey: `${environmentTestValue}-glm`,
        baseUrl: "https://glm.example.test/v1",
      },
    },
  };
}
