import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { createEvidenceRepository, createPrismaClient } from "../packages/db/src/index";

type Question = { category: string; id: string; page: number; query: string };

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url || !process.argv[2]) throw new Error("Provide DATABASE_URL and a private frozen question file.");
  const questions = JSON.parse(await readFile(process.argv[2], "utf8")) as Question[];
  if (!questions.length) throw new Error("No questions in the benchmark.");
  const db = createPrismaClient(url);
  try {
    const repo = createEvidenceRepository(db, url);
    const hits: Record<string, number> = {}, times: number[] = [];
    let located = 0, excerpts = 0, topOne = 0;
    for (const question of questions) {
      const start = performance.now();
      const found = await repo.search(question.query);
      times.push(performance.now() - start);
      const expected = (hit: { id: string; page: number }) => hit.id === question.id && hit.page === question.page;
      hits[question.category] = (hits[question.category] ?? 0) + Number(found.some(expected));
      topOne += Number(found[0] && expected(found[0]) || false);
      for (const entry of found) {
        const original = await repo.page(entry.id, entry.page);
        excerpts++;
        if (entry.quote.trim() && original?.text.includes(entry.quote)) located++;
      }
    }
    const unrelated = await Promise.all(["快速射电暴的红移", "medieval cartography parchment", "mesozoic dinosaur footprints"].map((query) => repo.search(query)));
    times.sort((a, b) => a - b);
    console.log(JSON.stringify({ questions: questions.length, hits, topOne, excerpts, located,
      unrelatedEmpty: unrelated.filter((rows) => !rows.length).length,
      medianMs: Math.round((times[Math.floor((times.length - 1) / 2)] + times[Math.floor(times.length / 2)]) / 2) }));
  } finally { await db.$disconnect(); }
}

main().catch(() => {
  console.error("Local evidence evaluation failed. Check the benchmark file and database.");
  process.exitCode = 1;
});
