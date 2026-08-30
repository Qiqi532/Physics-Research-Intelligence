import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { DatabaseClient } from "../../packages/db/src/client";
import { createPrismaClient } from "../../packages/db/src/client";
import { syncPhysicsTags } from "../../packages/db/src/paper-repository";
import { createTodayRepository } from "../../packages/db/src/today-repository";

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("PostgreSQL Today repository", () => {
  let client: DatabaseClient;
  let repository: ReturnType<typeof createTodayRepository>;
  const now = new Date("2026-08-30T04:00:00.000Z");

  beforeAll(async () => {
    client = createPrismaClient(databaseUrl!);
    repository = createTodayRepository(client);
    await syncPhysicsTags(client);
  });

  beforeEach(async () => {
    await client.userInterest.deleteMany();
    await client.paper.deleteMany();
  });

  afterAll(async () => {
    await client.$disconnect();
  });

  it("ranks an interest match and builds a saved reading queue", async () => {
    const interested = await createPaper("10.1103/interested", "Interested paper");
    const other = await createPaper("10.1103/other", "Other paper");
    await client.userInterest.create({
      data: { userId: "default", tagSlug: "amo-optics", weight: 2 },
    });
    await client.paperClassification.createMany({
      data: [
        classification(interested.id, "amo-optics", 0.95),
        classification(other.id, "astrophysics", 0.9),
      ],
    });
    await client.userPaperState.create({
      data: { userId: "default", paperId: interested.id, status: "SAVED" },
    });

    const result = await repository.getToday({
      userId: "default",
      now,
      candidateLimit: 20,
    });

    expect(result.recommendations[0]?.id).toBe(interested.id);
    expect(result.recommendations[0]?.reasons[0]).toContain("原子、分子与光学");
    expect(result.readingQueue.map(({ id }) => id)).toEqual([interested.id]);
  });

  it("upserts state by DOI without creating another paper", async () => {
    const paper = await createPaper("10.1103/state", "State paper");

    await expect(
      repository.setPaperStateByDoi({
        userId: "default",
        doi: "https://doi.org/10.1103/STATE",
        status: "READING",
        feedback: "LIKE",
        note: null,
      }),
    ).resolves.toEqual({
      status: "updated",
      state: expect.objectContaining({ status: "READING", feedback: "LIKE" }),
    });
    expect(await client.paper.count()).toBe(1);
    expect(
      await client.userPaperState.findUnique({
        where: { userId_paperId: { userId: "default", paperId: paper.id } },
      }),
    ).toEqual(expect.objectContaining({ status: "READING", feedback: "LIKE" }));
  });

  async function createPaper(doi: string, title: string) {
    return client.paper.create({
      data: {
        doi,
        title,
        normalizedTitle: title.toLowerCase(),
        publishedAt: new Date("2026-08-30T01:00:00.000Z"),
        originalUrl: `https://example.test/${encodeURIComponent(doi)}`,
        accessStatus: "OPEN",
        sources: {
          create: {
            sourceName: "fixture",
            sourceRecordId: doi,
            sourceUrl: `https://example.test/source/${encodeURIComponent(doi)}`,
            retrievedAt: now,
            title,
          },
        },
      },
    });
  }
});

function classification(paperId: string, tagSlug: string, relevance: number) {
  return {
    paperId,
    tagSlug,
    relevance,
    reason: "Fixture classification",
    model: "fixture-model",
    promptVersion: "fixture-v1",
  };
}
