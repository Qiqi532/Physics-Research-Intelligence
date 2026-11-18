import { readFile } from "node:fs/promises";
import { normalizeDoi } from "@pri/domain/paper";
import { seedAbstractSchema, seedCacheSchema, type PublicSeedAbstract, type RankingSnapshot } from "@pri/domain/ranking-review";
import type { ResearchProfile } from "@pri/domain/research-profile";
import type { DatabaseClient } from "@pri/db";

export async function readRankingSeedCache() {
  let status: RankingSnapshot["seedCache"] = "ready";
  let seeds: PublicSeedAbstract[] = [];
  try {
    const raw = await readFile(new URL("../../../data/research-seed-abstracts.local.json", import.meta.url), "utf8");
    seeds = seedCacheSchema.parse(JSON.parse(raw)).map((seed) => ({ ...seed, doi: normalizeDoi(seed.doi) }));
  } catch (error) {
    status = (error as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : "invalid";
  }
  return { status, seeds };
}

export async function rankingSeeds(client: DatabaseClient, profile: ResearchProfile) {
  const cache = await readRankingSeedCache();
  const seeds = new Map(cache.seeds.map((seed) => [seed.doi, seed]));
  const missing = profile.seeds.map((seed) => normalizeDoi(seed.doi)).filter((doi) => !seeds.has(doi));
  if (missing.length) {
    const sources = await client.paperSource.findMany({
      where: { paper: { doi: { in: missing } }, abstract: { not: null }, sourceName: { in: ["arxiv", "openalex", "crossref"] } },
      select: { abstract: true, sourceUrl: true, paper: { select: { doi: true } } },
      orderBy: [{ retrievedAt: "desc" }, { id: "asc" }],
    });
    for (const source of sources) {
      const record = seedAbstractSchema.safeParse({ doi: source.paper.doi, abstract: source.abstract?.trim(), sourceUrl: source.sourceUrl });
      if (record.success && !seeds.has(record.data.doi)) seeds.set(record.data.doi, record.data);
    }
  }
  return { status: cache.status, seeds: [...seeds.values()] };
}
