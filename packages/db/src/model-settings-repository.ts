import type { ModelConnectionProvider, ModelRoutingUpdateInput } from "@pri/domain/model-settings";
import type { DatabaseClient } from "./client";

export type ModelSettingsRepositoryErrorCode =
  | "profile_in_use"
  | "profile_name_conflict"
  | "profile_not_found";

export class ModelSettingsRepositoryError extends Error {
  constructor(readonly code: ModelSettingsRepositoryErrorCode) {
    super(code);
    this.name = "ModelSettingsRepositoryError";
  }
}

export type StoredModelConnectionWrite = {
  name: string;
  provider: ModelConnectionProvider;
  model: string;
  baseUrl: string;
  apiKeyCiphertext: Buffer;
  apiKeyNonce: Buffer;
  apiKeyAuthTag: Buffer;
  encryptionVersion: number;
  requestTimeoutMs: number;
  inputCostPerMillionUsd: number;
  outputCostPerMillionUsd: number;
};

export type StoredModelConnection = StoredModelConnectionWrite & {
  id: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
};

export type StoredModelRoutingWrite = ModelRoutingUpdateInput;

export type StoredModelRouting = StoredModelRoutingWrite & {
  userId: string;
  updatedAt: Date;
};

export interface ModelSettingsRepository {
  count(userId: string): Promise<number>;
  list(userId: string): Promise<StoredModelConnection[]>;
  find(userId: string, id: string): Promise<StoredModelConnection | null>;
  create(
    userId: string,
    input: StoredModelConnectionWrite,
    id?: string,
  ): Promise<StoredModelConnection>;
  update(
    userId: string,
    id: string,
    input: StoredModelConnectionWrite,
  ): Promise<StoredModelConnection>;
  remove(userId: string, id: string): Promise<void>;
  getRouting(userId: string): Promise<StoredModelRouting | null>;
  replaceRouting(
    userId: string,
    input: StoredModelRoutingWrite,
  ): Promise<StoredModelRouting>;
}

export function createModelSettingsRepository(
  client: DatabaseClient,
): ModelSettingsRepository {
  return {
    count(userId) {
      return client.aiConnectionProfile.count({ where: { userId } });
    },

    async list(userId) {
      const rows = await client.aiConnectionProfile.findMany({
        where: { userId },
        orderBy: [{ name: "asc" }, { id: "asc" }],
      });
      return rows.map(mapConnection);
    },

    async find(userId, id) {
      const row = await client.aiConnectionProfile.findFirst({ where: { id, userId } });
      return row ? mapConnection(row) : null;
    },

    async create(userId, input, id) {
      try {
        return mapConnection(await client.aiConnectionProfile.create({
          data: { userId, ...toPrismaWrite(input), ...(id ? { id } : {}) },
        }));
      } catch (error) {
        rethrowWriteError(error);
      }
    },

    async update(userId, id, input) {
      try {
        return await client.$transaction(async (transaction) => {
          const updated = await transaction.aiConnectionProfile.updateMany({
            where: { id, userId },
            data: toPrismaWrite(input),
          });
          if (updated.count !== 1) {
            throw new ModelSettingsRepositoryError("profile_not_found");
          }
          const row = await transaction.aiConnectionProfile.findUnique({ where: { id } });
          if (!row) {
            throw new ModelSettingsRepositoryError("profile_not_found");
          }
          return mapConnection(row);
        });
      } catch (error) {
        rethrowWriteError(error);
      }
    },

    async remove(userId, id) {
      try {
        const deleted = await client.aiConnectionProfile.deleteMany({ where: { id, userId } });
        if (deleted.count !== 1) {
          throw new ModelSettingsRepositoryError("profile_not_found");
        }
      } catch (error) {
        if (hasPrismaCode(error, "P2003")) {
          throw new ModelSettingsRepositoryError("profile_in_use");
        }
        throw error;
      }
    },

    async getRouting(userId) {
      const row = await client.aiRuntimeRouting.findUnique({ where: { userId } });
      return row ? mapRouting(row) : null;
    },

    async replaceRouting(userId, input) {
      try {
        return await client.$transaction(async (transaction) => {
          const profileIds = uniqueProfileIds(input);
          if (profileIds.length > 0) {
            const ownedCount = await transaction.aiConnectionProfile.count({
              where: { userId, id: { in: profileIds } },
            });
            if (ownedCount !== profileIds.length) {
              throw new ModelSettingsRepositoryError("profile_not_found");
            }
          }
          const row = await transaction.aiRuntimeRouting.upsert({
            where: { userId },
            create: { userId, ...input },
            update: input,
          });
          return mapRouting(row);
        });
      } catch (error) {
        if (hasPrismaCode(error, "P2003")) {
          throw new ModelSettingsRepositoryError("profile_not_found");
        }
        throw error;
      }
    },
  };
}

type ConnectionRow = {
  id: string;
  userId: string;
  name: string;
  provider: string;
  model: string;
  baseUrl: string;
  apiKeyCiphertext: Uint8Array;
  apiKeyNonce: Uint8Array;
  apiKeyAuthTag: Uint8Array;
  encryptionVersion: number;
  requestTimeoutMs: number;
  inputCostPerMillionUsd: { toNumber(): number };
  outputCostPerMillionUsd: { toNumber(): number };
  createdAt: Date;
  updatedAt: Date;
};

type RoutingRow = StoredModelRoutingWrite & {
  userId: string;
  updatedAt: Date;
};

type PrismaModelConnectionWrite = Omit<
  StoredModelConnectionWrite,
  "apiKeyCiphertext" | "apiKeyNonce" | "apiKeyAuthTag"
> & {
  apiKeyCiphertext: Uint8Array<ArrayBuffer>;
  apiKeyNonce: Uint8Array<ArrayBuffer>;
  apiKeyAuthTag: Uint8Array<ArrayBuffer>;
};

function mapConnection(row: ConnectionRow): StoredModelConnection {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    provider: row.provider as ModelConnectionProvider,
    model: row.model,
    baseUrl: row.baseUrl,
    apiKeyCiphertext: Buffer.from(row.apiKeyCiphertext),
    apiKeyNonce: Buffer.from(row.apiKeyNonce),
    apiKeyAuthTag: Buffer.from(row.apiKeyAuthTag),
    encryptionVersion: row.encryptionVersion,
    requestTimeoutMs: row.requestTimeoutMs,
    inputCostPerMillionUsd: row.inputCostPerMillionUsd.toNumber(),
    outputCostPerMillionUsd: row.outputCostPerMillionUsd.toNumber(),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapRouting(row: RoutingRow): StoredModelRouting {
  return {
    userId: row.userId,
    classifyPrimaryId: row.classifyPrimaryId,
    classifyFallbackId: row.classifyFallbackId,
    interpretPrimaryId: row.interpretPrimaryId,
    interpretFallbackId: row.interpretFallbackId,
    updatedAt: row.updatedAt,
  };
}

function uniqueProfileIds(input: StoredModelRoutingWrite): string[] {
  return [...new Set([
    input.classifyPrimaryId,
    input.classifyFallbackId,
    input.interpretPrimaryId,
    input.interpretFallbackId,
  ].filter((id): id is string => id !== null))];
}

function toPrismaWrite(input: StoredModelConnectionWrite): PrismaModelConnectionWrite {
  return {
    ...input,
    apiKeyCiphertext: Uint8Array.from(input.apiKeyCiphertext),
    apiKeyNonce: Uint8Array.from(input.apiKeyNonce),
    apiKeyAuthTag: Uint8Array.from(input.apiKeyAuthTag),
  };
}

function rethrowWriteError(error: unknown): never {
  if (error instanceof ModelSettingsRepositoryError) throw error;
  if (hasPrismaCode(error, "P2002")) {
    throw new ModelSettingsRepositoryError("profile_name_conflict");
  }
  if (hasPrismaCode(error, "P2025")) {
    throw new ModelSettingsRepositoryError("profile_not_found");
  }
  throw error;
}

function hasPrismaCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error
    && (error as { code?: unknown }).code === code;
}
