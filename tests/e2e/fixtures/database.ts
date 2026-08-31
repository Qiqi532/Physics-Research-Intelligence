import { spawnSync } from "node:child_process";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPrismaClient } from "../../../packages/db/src/client";
import { syncPhysicsTags } from "../../../packages/db/src/paper-repository";

const E2E_SCHEMA = "pri_stage5_e2e";

export function e2eMasterKeyPath(): string {
  return join(tmpdir(), "pri-stage8-e2e-model-settings.key");
}

export async function removeE2eMasterKey(): Promise<void> {
  await rm(e2eMasterKeyPath(), { force: true });
}

export function e2eDatabaseUrl(): string {
  const value = process.env.TEST_DATABASE_URL;
  if (!value) throw new Error("TEST_DATABASE_URL is required");
  const url = new URL(value);
  if (url.searchParams.get("schema") !== E2E_SCHEMA) {
    throw new Error(`E2E database schema must be ${E2E_SCHEMA}`);
  }
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
    throw new Error("E2E database host must be loopback");
  }
  return value;
}

export function deployE2eMigrations(): void {
  const command = process.platform === "win32"
    ? (process.env.ComSpec ?? "cmd.exe")
    : "pnpm";
  const args = process.platform === "win32"
    ? ["/d", "/s", "/c", "pnpm --filter @pri/db prisma:deploy"]
    : ["--filter", "@pri/db", "prisma:deploy"];
  const result = spawnSync(
    command,
    args,
    {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: e2eDatabaseUrl() },
      encoding: "utf8",
    },
  );
  if (result.status !== 0) {
    throw new Error(
      `E2E migration deployment failed: ${result.error?.message || result.stderr || result.stdout}`,
    );
  }
}

export async function clearE2eBusinessData(): Promise<void> {
  const client = createPrismaClient(e2eDatabaseUrl());
  try {
    const table = await client.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = ${E2E_SCHEMA} AND table_name = 'Paper'
      ) AS "exists"
    `;
    if (!table[0]?.exists) return;
    await client.aiRuntimeRouting.deleteMany();
    await client.aiConnectionProfile.deleteMany();
    await client.userInterest.deleteMany();
    await client.paper.deleteMany();
    await client.sourceSyncState.deleteMany();
  } finally {
    await client.$disconnect();
  }
}

export async function resetE2eData(): Promise<void> {
  const client = createPrismaClient(e2eDatabaseUrl());
  const now = new Date();
  try {
    await client.aiRuntimeRouting.deleteMany();
    await client.aiConnectionProfile.deleteMany();
    await client.userInterest.deleteMany();
    await client.paper.deleteMany();
    await client.sourceSyncState.deleteMany();
    await syncPhysicsTags(client);

    const astro = await createPaper(client, {
      doi: "10.5555/astro-fixture",
      title: "Astrophysics frontier fixture",
      abstract: "Public English abstract about a new transient observation.",
      publishedAt: recentShanghaiFixtureDate(now, 0),
      tagSlug: "astrophysics",
      relevance: 1,
    });
    const amo = await createPaper(client, {
      doi: "10.5555/amo-fixture",
      title: "AMO precision fixture",
      abstract: "Public English abstract about precision optical measurements.",
      publishedAt: recentShanghaiFixtureDate(now, 1),
      tagSlug: "amo-optics",
      relevance: 0.5,
    });
    await client.userPaperState.create({
      data: { userId: "default", paperId: amo.id, status: "SAVED" },
    });
    await client.paperInterpretation.create({
      data: {
        paperId: amo.id,
        content: interpretationFixture(),
        status: "COMPLETE",
        provider: "fixture-provider",
        model: "fixture-model",
        promptVersion: "interpret-v1",
      },
    });
    await createPaper(client, {
      doi: "10.5555/cross-fixture",
      title: "Cross-disciplinary discovery fixture",
      abstract: "Public abstract connecting materials and biophysics.",
      publishedAt: recentShanghaiFixtureDate(now, 2),
      tagSlug: "cross-disciplinary",
      relevance: 0.9,
    });
    const corrupt = await createPaper(client, {
      doi: "10.5555/corrupt-fixture",
      title: "Corrupt interpretation fixture",
      abstract: "Public facts remain available.",
      publishedAt: recentShanghaiFixtureDate(now, 3),
      tagSlug: "nuclear",
      relevance: 0.7,
    });
    await client.paperInterpretation.create({
      data: {
        paperId: corrupt.id,
        content: { unsafe: "invalid persisted shape" },
        status: "COMPLETE",
        provider: "fixture-provider",
        model: "corrupt-model",
        promptVersion: "interpret-v1",
      },
    });
    await client.paper.create({
      data: {
        doi: "10.5555/unclassified-fixture",
        title: "Unclassified fixture",
        normalizedTitle: "unclassified fixture",
        abstract: "Public abstract awaiting classification.",
        publishedAt: recentShanghaiFixtureDate(now, 4),
        originalUrl: "https://example.test/unclassified-fixture",
        accessStatus: "OPEN",
        sources: {
          create: sourceFixture("unclassified-fixture", now),
        },
      },
    });
    void astro;
  } finally {
    await client.$disconnect();
  }
}

export async function dropE2eSchemaForFailureTest(): Promise<void> {
  const client = createPrismaClient(e2eDatabaseUrl());
  try {
    await client.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${E2E_SCHEMA}" CASCADE`);
  } finally {
    await client.$disconnect();
  }
}

function recentShanghaiFixtureDate(now: Date, minutesAgo: number): Date {
  const shanghaiOffsetMs = 8 * 60 * 60_000;
  const shifted = new Date(now.getTime() + shanghaiOffsetMs);
  const dayStart = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  ) - shanghaiOffsetMs;
  return new Date(Math.max(dayStart, now.getTime() - minutesAgo * 60_000));
}

async function createPaper(
  client: ReturnType<typeof createPrismaClient>,
  input: {
    doi: string;
    title: string;
    abstract: string;
    publishedAt: Date;
    tagSlug: string;
    relevance: number;
  },
) {
  return client.paper.create({
    data: {
      doi: input.doi,
      title: input.title,
      normalizedTitle: input.title.toLowerCase(),
      abstract: input.abstract,
      journal: "Fixture Physics",
      firstAuthor: "F. Researcher",
      publishedAt: input.publishedAt,
      originalUrl: `https://example.test/${input.doi.split("/")[1]}`,
      accessStatus: "OPEN",
      sources: { create: sourceFixture(input.doi, new Date()) },
      classifications: {
        create: {
          tagSlug: input.tagSlug,
          relevance: input.relevance,
          reason: "Deterministic E2E fixture classification",
          model: "fixture-classifier",
          promptVersion: "classify-v1",
        },
      },
    },
  });
}

function sourceFixture(id: string, retrievedAt: Date) {
  return {
    sourceName: "arxiv",
    sourceRecordId: id,
    sourceUrl: `https://example.test/source/${encodeURIComponent(id)}`,
    retrievedAt,
    title: `Source ${id}`,
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  };
}

function interpretationFixture() {
  const reference = {
    source: "abstract",
    locator: "sentence 1",
    quote: "precision optical measurements",
  };
  return {
    basis: "abstract_only",
    sourceDisclosure: "基于摘要解读",
    overviewZh: claim("这是一项基于公开摘要的精密光学测量研究。", "direct", reference),
    researchQuestion: claim("如何提高测量精度？", "inferred", reference),
    innovations: [claim("提出新的测量方案。", "inferred", reference)],
    methodsAndEvidence: [claim("公开摘要报告了光学测量。", "direct", reference)],
    limitations: [claim("完整实验细节仍需核验。", "uncertain", reference)],
    readingAdvice: ["先核对摘要与原文方法部分。"],
  };
}

function claim(
  text: string,
  evidenceLevel: "direct" | "inferred" | "uncertain",
  reference: { source: string; locator: string; quote: string },
) {
  return { text, evidenceLevel, evidenceReferences: [reference] };
}
