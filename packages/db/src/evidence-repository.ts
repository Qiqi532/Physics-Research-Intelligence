import { Client } from "pg";
import { Prisma } from "./generated/prisma/client";
import type { DatabaseClient } from "./client";
import { evidenceQuery, evidenceQuote, normalizeEvidence, type EvidenceDocument, type EvidenceHit } from "@pri/domain/evidence";
import type { ZoteroAttachment, ZoteroCollection } from "@pri/domain/zotero-local";

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
export type ZoteroEvidenceLocation = ZoteroAttachment & {
  role: string; status: string; root?: string; relativePath?: string; documentId?: string;
};

async function saveDocument(tx: Prisma.TransactionClient, id: string, parserVersion: string, parsed: EvidenceDocument) {
  const fields = { parserVersion, title: parsed.title, pageCount: parsed.pages.length };
  await tx.localEvidenceDocument.upsert({ where: { id }, create: { id, ...fields }, update: fields });
  await tx.localEvidencePage.deleteMany({ where: { documentId: id } });
  for (let start = 0; start < parsed.pages.length; start += 64) {
    await tx.localEvidencePage.createMany({ data: parsed.pages.slice(start, start + 64).map((page) => ({
      ...page, documentId: id, normalized: normalizeEvidence(page.text),
    })) });
  }
}

export function createEvidenceRepository(db: DatabaseClient, databaseUrl: string) {
  // Prisma qualifies ORM queries with the adapter schema. Raw SQL must use it explicitly.
  const table = (name: string) => Prisma.raw(`"${schemaName(databaseUrl)}"."${name}"`);
  const hasReadySource = { OR: [
    { locations: { some: { status: "ready" } } }, { zoteroLocations: { some: { status: "ready" } } },
  ] };
  return {
    async indexed(id: string, parserVersion: string) {
      return (await db.localEvidenceDocument.count({ where: { id, parserVersion } })) > 0;
    },
    async recordDocument(id: string, parserVersion: string, parsed: EvidenceDocument) {
      await db.$transaction((tx) => saveDocument(tx, id, parserVersion, parsed), { timeout: 60_000 });
    },
    async record(location: EvidenceLocation, id: string, parserVersion: string, parsed?: EvidenceDocument) {
      await db.$transaction(async (tx) => {
        if (parsed) await saveDocument(tx, id, parserVersion, parsed);
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
    async publishZotero(collection: ZoteroCollection, attachments: ZoteroEvidenceLocation[], syncedAt: Date) {
      return db.$transaction(async (tx) => {
        const snapshot = await tx.zoteroCollectionSnapshot.upsert({
          where: { libraryKey_collectionKey: { libraryKey: collection.libraryKey, collectionKey: collection.collectionKey } },
          create: { ...collection, syncedAt },
          update: { title: collection.title, sourceScope: collection.sourceScope, syncedAt, lastError: null },
        });
        await tx.zoteroAttachmentLocation.deleteMany({ where: { collectionId: snapshot.id } });
        for (let start = 0; start < attachments.length; start += 200) {
          await tx.zoteroAttachmentLocation.createMany({ data: attachments.slice(start, start + 200).map((attachment) => ({
            ...attachment, collectionId: snapshot.id,
          })) });
        }
      }, { timeout: 60_000 });
    },
    async zoteroError(sourceScope: string, collectionKey: string, lastError: string) {
      await db.zoteroCollectionSnapshot.updateMany({ where: { sourceScope, collectionKey }, data: { lastError } });
    },
    async inventory() {
      const [files, indexed, issues, zotero] = await Promise.all([
        db.localEvidenceLocation.findMany({ orderBy: [{ name: "asc" }, { id: "asc" }], take: 200,
          select: { name: true, role: true, status: true, documentId: true, document: { select: { pageCount: true } } } }),
        db.localEvidenceDocument.count({ where: hasReadySource }),
        db.localEvidencePage.groupBy({ by: ["status"], where: { status: { not: "text" }, document: hasReadySource }, _count: true }),
        db.zoteroCollectionSnapshot.findMany({
          orderBy: [{ syncedAt: "desc" }, { id: "asc" }],
          select: { id: true, collectionKey: true, sourceScope: true, title: true, syncedAt: true, lastError: true,
            _count: { select: { attachments: true } },
            attachments: { orderBy: [{ title: "asc" }, { attachmentKey: "asc" }], take: 200,
              select: { title: true, name: true, role: true, status: true, documentId: true, attachmentKey: true, itemKey: true,
                creators: true, date: true, doi: true, document: { select: { pageCount: true } } } },
          },
        }),
      ]);
      return { files, indexed, issues, zotero };
    },
    async search(query: string, limit = 5): Promise<EvidenceHit[]> {
      const groups = evidenceQuery(query);
      if (!groups.length) return [];
      const queries = groups.map((group) => "(" + group.map((phrase) => "(" + phrase.split(" ").filter(Boolean)
        .map((term) => `'${term}'${term.length >= 5 && /^[a-z]+$/.test(term) ? ":*" : ""}`).join(" <-> ") + ")").join(" | ") + ")");
      const vector = Prisma.sql`to_tsvector('simple'::regconfig, p."normalized")`;
      const combined = queries.join(" | ");
      const rows = await db.$queryRaw<Array<Omit<EvidenceHit, "quote"> & { text: string }>>(Prisma.sql`
        SELECT d.id, COALESCE(f.title,d.title,f.name) AS title, f.role, p.number AS page, d."pageCount",
          p.text, p.status, d."parserVersion"
        FROM ${table("LocalEvidencePage")} p JOIN ${table("LocalEvidenceDocument")} d ON d.id=p."documentId"
        JOIN LATERAL (
          SELECT title,name,role FROM (
            SELECT NULL AS title,name,role,1 AS priority FROM ${table("LocalEvidenceLocation")}
              WHERE "documentId"=d.id AND status IN ('ready','unavailable','changed')
            UNION ALL
            SELECT title,name,role,0 AS priority FROM ${table("ZoteroAttachmentLocation")}
              WHERE "documentId"=d.id AND status='ready'
          ) sources ORDER BY priority,name,title,role LIMIT 1
        ) f ON true
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
          locations: { orderBy: { name: "asc" }, take: 1, select: { name: true } },
          zoteroLocations: { orderBy: [{ title: "asc" }, { attachmentKey: "asc" }], take: 1, select: { title: true } },
        } } } });
    },
    async locations(id: string) {
      const [files, attachments] = await Promise.all([
        db.localEvidenceLocation.findMany({ where: { documentId: id, status: { not: "missing" } },
          select: { root: true, relativePath: true } }),
        db.zoteroAttachmentLocation.findMany({ where: { documentId: id, status: "ready" },
          select: { root: true, relativePath: true } }),
      ]);
      return files.concat(attachments.flatMap(({ root, relativePath }) => root && relativePath ? [{ root, relativePath }] : []));
    },
  };
}

export type EvidenceRepository = ReturnType<typeof createEvidenceRepository>;
