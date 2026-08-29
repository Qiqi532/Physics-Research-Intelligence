import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { DatabaseClient } from "../../packages/db/src/client";
import { createPrismaClient } from "../../packages/db/src/client";
import { createSourceSyncRepository } from "../../packages/db/src/source-sync-repository";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("PostgreSQL source sync repository", () => {
  let client: DatabaseClient;
  let repository: ReturnType<typeof createSourceSyncRepository>;

  beforeAll(() => {
    client = createPrismaClient(databaseUrl!);
    repository = createSourceSyncRepository(client);
  });

  beforeEach(async () => {
    await client.sourceSyncState.deleteMany();
  });

  afterAll(async () => {
    await client.$disconnect();
  });

  it("stores progress, success, and a later visible failure", async () => {
    const from = new Date("2026-08-28T00:00:00.000Z");
    const until = new Date("2026-08-29T00:00:00.000Z");
    const succeededAt = new Date("2026-08-29T01:00:00.000Z");
    const failedAt = new Date("2026-08-29T02:00:00.000Z");

    await repository.markProgress({
      sourceName: "crossref",
      windowFrom: from,
      windowUntil: until,
      cursor: "next",
    });
    await repository.markSuccess("crossref", succeededAt);
    await repository.markFailure({
      sourceName: "crossref",
      failedAt,
      errorCode: "rate_limited",
      errorMessage: "crossref ingestion failed (rate_limited)",
    });

    expect(await repository.find("crossref")).toEqual(expect.objectContaining({
      sourceName: "crossref",
      windowFrom: from,
      windowUntil: until,
      cursor: null,
      lastSuccessAt: succeededAt,
      lastFailureAt: failedAt,
      lastErrorCode: "rate_limited",
    }));
  });
});
