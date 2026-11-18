import { realpath } from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { createEvidenceRepository, createPrismaClient, withEvidenceScanLock,
  type EvidenceRepository, type ZoteroEvidenceLocation } from "@pri/db";
import { fileRole } from "@pri/domain/evidence";
import { readEvidenceFile } from "@pri/domain/evidence-files";
import { createZoteroLocal, ZoteroLocalError, type ZoteroAttachment } from "@pri/domain/zotero-local";
import { evidenceParserVersion, parseEvidencePdf } from "./evidence-pdf.js";

const errors = new Set(["invalid_pdf", "locked", "too_large", "too_many_pages", "changed"]);

export async function syncZoteroEvidence(
  key: string, zotero: ReturnType<typeof createZoteroLocal>, store: EvidenceRepository,
  { assertLock = () => {}, now = () => new Date() } = {},
) {
  try {
    const snapshot = await zotero.snapshot(key);
    const locations: ZoteroEvidenceLocation[] = [];
    let indexed = 0, reused = 0;
    for (const attachment of snapshot.attachments) {
      const path = await zotero.filePath(attachment.attachmentKey);
      const result = await indexAttachment(attachment, path, store, assertLock);
      indexed += Number(result.indexed);
      reused += Number(result.location.status === "ready" && !result.indexed);
      locations.push(result.location);
    }
    await snapshot.confirm();
    assertLock();
    await store.publishZotero(snapshot.collection, locations, now());
    return { attachments: locations.length, indexed, reused, unavailable: locations.length - indexed - reused };
  } catch (error) {
    assertLock();
    if (error instanceof ZoteroLocalError) await store.zoteroError(zotero.sourceScope, key, error.code);
    throw error;
  }
}

async function indexAttachment(attachment: ZoteroAttachment, path: string | null, store: EvidenceRepository, assertLock: () => void) {
  const role = fileRole(attachment.name);
  const failed = (status: string) => ({ location: { ...attachment, role, status }, indexed: false });
  if (!path) return failed("unavailable");
  let file: Awaited<ReturnType<typeof readEvidenceFile>>;
  let root: string;
  let relativePath: string;
  try {
    const canonical = await realpath(path);
    if (relative(path, canonical)) return failed("unavailable");
    root = dirname(canonical);
    relativePath = basename(canonical);
    file = await readEvidenceFile(root, relativePath);
  } catch (error) {
    return failed(error instanceof Error && errors.has(error.message) ? error.message : "unavailable");
  }
  const cached = await store.indexed(file.id, evidenceParserVersion);
  if (!cached) {
    let parsed;
    try { parsed = await parseEvidencePdf(file.data); }
    catch (error) { return failed(error instanceof Error && errors.has(error.message) ? error.message : "invalid_pdf"); }
    assertLock();
    await store.recordDocument(file.id, evidenceParserVersion, parsed);
  }
  return { location: { ...attachment, role, status: "ready", documentId: file.id, root, relativePath }, indexed: !cached };
}

async function main(args: string[]) {
  const options = args.filter((arg) => arg !== "--");
  if (options.includes("--help")) {
    console.log("pnpm evidence:zotero --list [--group ID]\npnpm evidence:zotero --collection KEY [--group ID]");
    return;
  }
  const groupIndex = options.indexOf("--group");
  let groupId;
  if (groupIndex >= 0) {
    groupId = Number(options[groupIndex + 1]);
    options.splice(groupIndex, 2);
  }
  const zotero = createZoteroLocal({ groupId });
  if (options.length === 1 && options[0] === "--list") {
    console.log(JSON.stringify(await zotero.collections(), null, 2));
    return;
  }
  const [flag, key] = options;
  if (options.length !== 2 || flag !== "--collection" || !/^[A-Z0-9]{8}$/u.test(key)) throw new Error("expected_collection");
  loadEnv({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true, override: false });
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("database_missing");
  const db = createPrismaClient(url);
  try {
    console.log(JSON.stringify(await withEvidenceScanLock(url, (assertLock) =>
      syncZoteroEvidence(key, zotero, createEvidenceRepository(db, url), { assertLock }))));
  } finally { await db.$disconnect(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    const code = error instanceof ZoteroLocalError ? error.code :
      error instanceof Error && ["expected_collection", "invalid_group_id", "database_missing", "scan_running", "scan_lock_lost"].includes(error.message)
        ? error.message : "sync_failed";
    console.error(`Zotero 收藏夹同步未完成（${code}）。`);
    process.exitCode = 1;
  });
}
