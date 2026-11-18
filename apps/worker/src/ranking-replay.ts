import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { z } from "zod";
import { createPrismaClient, createRankingRepository } from "@pri/db";
import { freezeRanking, rankingWindowDays, replayRanking } from "@pri/domain/ranking-review";
import { loadResearchProfile } from "@pri/domain/research-profile-node";
import { readRankingSeedCache } from "./ranking-seeds";

const journalWindowDays = 30;
const journalSchema = z.array(z.object({
  arxiv_id: z.string(), title: z.string(), doi: z.string().nullable(), abstract: z.string().nullable(), published: z.string(),
}));

async function replayJournalCorpus(before?: string) {
  const { profile } = loadResearchProfile();
  const cache = await readRankingSeedCache();
  const data = journalSchema.parse(JSON.parse(await readFile(
    new URL("../../../data/journal-corpus/candidates.json", import.meta.url), "utf8")));
  const papers = [...new Map(data.map((row) => [row.arxiv_id, {
    id: row.arxiv_id, title: row.title, doi: row.doi, abstract: row.abstract, publishedAt: row.published,
  }])).values()];
  const dates = [...new Set(papers.map((paper) => paper.publishedAt.slice(0, 10)))].filter((date) => !before || date < before)
    .sort().reverse().slice(0, rankingWindowDays);
  const days = dates.map((date) => {
    const start = new Date(Date.parse(date) - (journalWindowDays - 1) * 86_400_000).toISOString().slice(0, 10);
    const pool = papers.filter((paper) => {
      const day = paper.publishedAt.slice(0, 10);
      return start <= day && day <= date;
    });
    const snapshot = freezeRanking(profile, pool, cache.seeds, cache.status);
    const replay = replayRanking(snapshot, date, new Map());
    return { date, candidateCount: pool.length, unmatched: replay.unmatched,
      seeds: snapshot.availableSeeds.length, metrics: replay.metrics };
  });
  return { origin: "public_journal_corpus", dayWindow: journalWindowDays, replayModelAttempts: 0, days };
}

async function main(args: string[]) {
  const input = args.filter((arg) => arg !== "--");
  if (input.includes("--help")) {
    console.log("pnpm ranking:replay [--journal-corpus] [--before YYYY-MM-DD]");
    return;
  }
  const corpus = input[0] === "--journal-corpus";
  const rest = corpus ? input.slice(1) : input;
  const before = rest[1];
  if (rest.length && (rest.length !== 2 || rest[0] !== "--before" || !/^\d{4}-\d{2}-\d{2}$/u.test(before))) throw new Error("invalid_usage");
  if (corpus) {
    console.log(JSON.stringify(await replayJournalCorpus(before), null, 2));
    return;
  }
  loadEnv({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true, override: false });
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("database_missing");
  const db = createPrismaClient(url);
  try {
    const days = await createRankingRepository(db).window({ before });
    console.log(JSON.stringify({ origin: "daily_run", replayModelAttempts: 0, days: days.map(({ review, ...day }) => ({
      ...day, reviewCount: review.length,
    })) }, null, 2));
  } finally { await db.$disconnect(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(() => {
    console.error("排序回放失败。请检查日期、语料文件及数据库迁移。");
    process.exitCode = 1;
  });
}
