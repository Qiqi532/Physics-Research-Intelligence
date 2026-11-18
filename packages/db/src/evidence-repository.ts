import { Client } from "pg";
import { Prisma } from "./generated/prisma/client";
import type { DatabaseClient } from "./client";
import { evidenceQuery, evidenceQuote, normalizeEvidence, type EvidenceDocument, type EvidenceHit } from "@pri/domain/evidence";

function schemaName(url: string) {
  const schema = new URL(url).searchParams.get("schema") ?? "public";
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) throw new Error("invalid_database_schema");
  return schema;
}

export async function withEvidenceScanLock<T>(databaseUrl: string, scan: (assertLock: () => void) => Promise<T>): Promise<T> {
  const url = new URL(databaseUrl);
  const key = `pri:evidence:${schemaName(databaseUrl)}`;
  url.searchParams.delete("schema");
  const lock = new Client({ connectionString: url.toString(), connectionTimeoutMillis: 10_000, keepAlive: true });
  let lost = false;
  lock.on("error", () => { lost = true; });
  await lock.connect();
  try {
    const result = await lock.query<{ acquired: boolean }>("SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS acquired", [key]);
    if (!result.rows[0]?.acquired) throw new Error("scan_running");
    return await scan(() => { if (lost) throw new Error("scan_lock_lost"); });
  } finally {
    await lock.end().catch(() => undefined);
  }
}

export type EvidenceLocation = { root: string; relativePath: string; name: string; role: string };

export function createEvidenceRepository(db: DatabaseClient, databaseUrl: string) {
  // Prisma qualifies ORM queries with the adapter schema. Raw SQL must use it explicitly.
  const table = (name: string) => Prisma.raw(`"${schemaName(databaseUrl)}"."${name}"`);
  return {
    async indexed(id: string, parserVersion: string) {
      return (await db.localEvidenceDocument.count({ where: { id, parserVersion } })) > 0;
    },
    async record(location: EvidenceLocation, id: string, parserVersion: string, parsed?: EvidenceDocument) {
      await db.$transaction(async (tx) => {
        if (parsed) {
          const fields = { parserVersion, title: parsed.title, pageCount: parsed.pages.length };
          await tx.localEvidenceDocument.upsert({ where: { id }, create: { id, ...fields }, update: fields });
          await tx.localEvidencePage.deleteMany({ where: { documentId: id } });
          for (let start = 0; start < parsed.pages.length; start += 64) {
            await tx.localEvidencePage.createMany({ data: parsed.pages.slice(start, start + 64).map((page) => ({
              ...page, documentId: id, normalized: normalizeEvidence(page.text),
            })) });
          }
        }
        const fields = { name: location.name, role: location.role, documentId: id, status: "ready" };
        const identity = { root: location.root, relativePath: location.relativePath };
        await tx.localEvidenceLocation.upsert({ where: { root_relativePath: identity }, create: { ...identity, ...fields }, update: fields });
      }, { timeout: 60_000 });
    },
    async fileError(location: EvidenceLocation, status: string) {
      const invalidate = ["invalid_pdf", "locked", "too_large", "too_many_pages"].includes(status);
      await db.localEvidenceLocation.upsert({ where: { root_relativePath: { root: location.root, relativePath: location.relativePath } },
        create: { ...location, status }, update: { status, ...(invalidate ? { documentId: null } : {}) } });
    },
    async finish(root: string, seen: string[]) {
      return (await db.localEvidenceLocation.updateMany({
        where: { root, ...(seen.length ? { relativePath: { notIn: seen } } : {}), status: { not: "missing" } },
        data: { status: "missing" },
      })).count;
    },
    async inventory() {
      const [files, indexed, issues] = await Promise.all([
        db.localEvidenceLocation.findMany({ orderBy: [{ name: "asc" }, { id: "asc" }], take: 200,
          select: { name: true, role: true, status: true, documentId: true, document: { select: { pageCount: true } } } }),
        db.localEvidenceDocument.count({ where: { locations: { some: { status: "ready" } } } }),
        db.localEvidencePage.groupBy({ by: ["status"], where: { status: { not: "text" }, document: { locations: { some: { status: "ready" } } } }, _count: true }),
      ]);
      return { files, indexed, issues };
    },
    async search(query: string, limit = 5): Promise<EvidenceHit[]> {
      const groups = evidenceQuery(query);
      if (!groups.length) return [];
      const queries = groups.map((group) => "(" + group.map((phrase) => "(" + phrase.split(" ").filter(Boolean)
        .map((term) => `'${term}'${term.length >= 5 && /^[a-z]+$/.test(term) ? ":*" : ""}`).join(" <-> ") + ")").join(" | ") + ")");
      const vector = Prisma.sql`to_tsvector('simple'::regconfig, p."normalized")`;
      const combined = queries.join(" | ");
      const rows = await db.$queryRaw<Array<Omit<EvidenceHit, "quote"> & { text: string }>>(Prisma.sql`
        SELECT d.id, COALESCE(d.title,f.name) AS title, f.role, p.number AS page, d."pageCount",
          p.text, p.status, d."parserVersion"
        FROM ${table("LocalEvidencePage")} p JOIN ${table("LocalEvidenceDocument")} d ON d.id=p."documentId"
        JOIN LATERAL (SELECT name,role FROM ${table("LocalEvidenceLocation")} l
          WHERE l."documentId"=d.id AND l.status IN ('ready','unavailable','changed') ORDER BY name,id LIMIT 1) f ON true
        CROSS JOIN LATERAL (SELECT count(*)::int AS n FROM jsonb_array_elements_text(${JSON.stringify(queries)}::jsonb) g(q)
          WHERE ${vector} @@ to_tsquery('simple',g.q)) matches
        WHERE ${vector} @@ to_tsquery('simple',${combined})
          AND matches.n >= ${Math.min(2, groups.length)}
        ORDER BY matches.n DESC, ts_rank_cd(${vector},to_tsquery('simple',${combined}), 1) DESC, d.id, p.number
        LIMIT ${Math.min(20, Math.max(1, limit))}`);
      return rows.map(({ text, ...row }) => ({ ...row, quote: evidenceQuote(text, groups) }));
    },
    page(id: string, number: number) {
      return db.localEvidencePage.findUnique({ where: { documentId_number: { documentId: id, number } },
        select: { text: true, status: true, document: { select: { title: true, pageCount: true,
          locations: { orderBy: { name: "asc" }, take: 1, select: { name: true } } } } } });
    },
    locations(id: string) {
      return db.localEvidenceLocation.findMany({ where: { documentId: id, status: { not: "missing" } },
        select: { root: true, relativePath: true } });
    },
  };
}

export type EvidenceRepository = ReturnType<typeof createEvidenceRepository>;
