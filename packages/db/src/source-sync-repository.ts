import type { DatabaseClient } from "./client";

export type SourceSyncState = {
  sourceName: string;
  windowFrom: Date | null;
  windowUntil: Date | null;
  cursor: string | null;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
};

export interface SourceSyncRepository {
  find(sourceName: string): Promise<SourceSyncState | null>;
  markProgress(input: {
    sourceName: string;
    windowFrom: Date;
    windowUntil: Date;
    cursor: string | null;
  }): Promise<void>;
  markSuccess(sourceName: string, completedAt: Date): Promise<void>;
  markFailure(input: {
    sourceName: string;
    failedAt: Date;
    errorCode: string;
    errorMessage: string;
  }): Promise<void>;
}

export function createSourceSyncRepository(client: DatabaseClient): SourceSyncRepository {
  return {
    async find(sourceName) {
      return client.sourceSyncState.findUnique({ where: { sourceName } });
    },

    async markProgress(input) {
      await client.sourceSyncState.upsert({
        where: { sourceName: input.sourceName },
        create: input,
        update: {
          windowFrom: input.windowFrom,
          windowUntil: input.windowUntil,
          cursor: input.cursor,
        },
      });
    },

    async markSuccess(sourceName, completedAt) {
      await client.sourceSyncState.upsert({
        where: { sourceName },
        create: { sourceName, lastSuccessAt: completedAt },
        update: {
          cursor: null,
          lastSuccessAt: completedAt,
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      });
    },

    async markFailure(input) {
      await client.sourceSyncState.upsert({
        where: { sourceName: input.sourceName },
        create: {
          sourceName: input.sourceName,
          lastFailureAt: input.failedAt,
          lastErrorCode: input.errorCode,
          lastErrorMessage: input.errorMessage.slice(0, 500),
        },
        update: {
          lastFailureAt: input.failedAt,
          lastErrorCode: input.errorCode,
          lastErrorMessage: input.errorMessage.slice(0, 500),
        },
      });
    },
  };
}
