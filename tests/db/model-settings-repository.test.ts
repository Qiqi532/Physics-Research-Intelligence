import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { DatabaseClient } from "../../packages/db/src/client";
import { createPrismaClient } from "../../packages/db/src/client";
import {
  createModelSettingsRepository,
  type StoredModelConnectionWrite,
} from "../../packages/db/src/model-settings-repository";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("PostgreSQL model settings repository", () => {
  let client: DatabaseClient;
  let repository: ReturnType<typeof createModelSettingsRepository>;

  beforeAll(() => {
    client = createPrismaClient(databaseUrl!);
    repository = createModelSettingsRepository(client);
  });

  beforeEach(async () => {
    await client.aiRuntimeRouting.deleteMany();
    await client.aiConnectionProfile.deleteMany();
  });

  afterAll(async () => {
    await client.aiRuntimeRouting.deleteMany();
    await client.aiConnectionProfile.deleteMany();
    await client.$disconnect();
  });

  it("stores multiple named profiles for one provider and isolates users", async () => {
    await repository.create("default", encryptedProfile({ name: "Kimi 日常" }));
    await repository.create("default", encryptedProfile({ name: "Kimi 实验" }));
    await repository.create("another", encryptedProfile({ name: "Kimi 日常" }));

    expect(await repository.count("default")).toBe(2);
    expect((await repository.list("default")).map(({ name }) => name)).toEqual([
      "Kimi 实验",
      "Kimi 日常",
    ]);
    expect(await repository.list("another")).toHaveLength(1);
  });

  it("enforces unique names per user with a stable error", async () => {
    await repository.create("default", encryptedProfile());

    await expect(repository.create("default", encryptedProfile()))
      .rejects.toMatchObject({ code: "profile_name_conflict" });
  });

  it("stores a service-generated id used by encryption associated data", async () => {
    const profileId = "33333333-3333-4333-8333-333333333333";

    await expect(repository.create("default", encryptedProfile(), profileId))
      .resolves.toEqual(expect.objectContaining({ id: profileId }));
  });

  it("rotates encrypted key material while retaining other fields", async () => {
    const created = await repository.create("default", encryptedProfile());
    const rotated = await repository.update("default", created.id, {
      ...encryptedProfile(),
      apiKeyCiphertext: Buffer.from("rotated-ciphertext"),
      apiKeyNonce: Buffer.alloc(12, 3),
      apiKeyAuthTag: Buffer.alloc(16, 4),
    });

    expect(rotated).toEqual(expect.objectContaining({
      name: created.name,
      provider: created.provider,
      model: created.model,
      baseUrl: created.baseUrl,
    }));
    expect(rotated.apiKeyCiphertext.equals(created.apiKeyCiphertext)).toBe(false);
  });

  it("atomically replaces routing and refuses cross-user profiles", async () => {
    const first = await repository.create("default", encryptedProfile({ name: "Kimi 日常" }));
    const second = await repository.create("default", encryptedProfile({ name: "Kimi 实验" }));
    const foreign = await repository.create("another", encryptedProfile({ name: "外部配置" }));
    await repository.replaceRouting("default", {
      classifyPrimaryId: first.id,
      classifyFallbackId: null,
      interpretPrimaryId: second.id,
      interpretFallbackId: null,
    });

    await expect(repository.replaceRouting("default", {
      classifyPrimaryId: foreign.id,
      classifyFallbackId: null,
      interpretPrimaryId: second.id,
      interpretFallbackId: null,
    })).rejects.toMatchObject({ code: "profile_not_found" });
    await expect(repository.getRouting("default")).resolves.toEqual(expect.objectContaining({
      classifyPrimaryId: first.id,
      interpretPrimaryId: second.id,
    }));
  });

  it("does not delete a routed profile and reports missing profiles", async () => {
    const first = await repository.create("default", encryptedProfile());
    await repository.replaceRouting("default", {
      classifyPrimaryId: first.id,
      classifyFallbackId: null,
      interpretPrimaryId: null,
      interpretFallbackId: null,
    });

    await expect(repository.remove("default", first.id))
      .rejects.toMatchObject({ code: "profile_in_use" });
    await expect(repository.remove("default", "22222222-2222-4222-8222-222222222222"))
      .rejects.toMatchObject({ code: "profile_not_found" });
  });
});

function encryptedProfile(
  overrides: Partial<StoredModelConnectionWrite> = {},
): StoredModelConnectionWrite {
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
    ...overrides,
  };
}
