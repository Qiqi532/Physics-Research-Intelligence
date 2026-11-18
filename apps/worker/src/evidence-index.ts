import { readdir, realpath } from "node:fs/promises";
import { basename, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { createEvidenceRepository, createPrismaClient, withEvidenceScanLock, type EvidenceRepository } from "@pri/db";
import { fileRole } from "@pri/domain/evidence";
import { insideRoot, readEvidenceFile } from "@pri/domain/evidence-files";
import { evidenceParserVersion, parseEvidencePdf } from "./evidence-pdf.js";

async function listPdfs(root: string, directory = root): Promise<string[]> {
  const result: string[] = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    if (item.isSymbolicLink() || item.name.startsWith(".")) continue;
    const path = join(directory, item.name);
    if (item.isDirectory()) {
      const canonical = await realpath(path);
      if (insideRoot(root, canonical) && !relative(path, canonical)) result.push(...await listPdfs(root, path));
    }
    else if (item.isFile() && extname(item.name).toLowerCase() === ".pdf") result.push(relative(root, path));
  }
  return result.sort();
}

export async function scanEvidenceDirectory(directory: string, store: EvidenceRepository,
  { parse = parseEvidencePdf, assertLock = () => {} } = {}) {
  const root = await realpath(resolve(directory));
  // Finish enumeration before reconciling, so an offline or unreadable subtree cannot erase inventory.
  const seen = await listPdfs(root);
  const summary = { files: seen.length, indexed: 0, reused: 0, failed: 0, missing: 0 };
  for (const relativePath of seen) {
    const name = basename(relativePath);
    const location = { root, relativePath, name, role: fileRole(name) };
    let file;
    try { file = await readEvidenceFile(root, relativePath); }
    catch (error) {
      const code = error instanceof Error && ["changed", "too_large", "invalid_pdf"].includes(error.message) ? error.message : "unavailable";
      assertLock();
      await store.fileError(location, code);
      summary.failed++;
      continue;
    }
    if (await store.indexed(file.id, evidenceParserVersion)) {
      assertLock();
      await store.record(location, file.id, evidenceParserVersion);
      summary.reused++;
      continue;
    }
    let parsed;
    try { parsed = await parse(file.data); }
    catch (error) {
      const code = error instanceof Error && ["locked", "too_many_pages", "invalid_pdf"].includes(error.message) ? error.message : "invalid_pdf";
      assertLock();
      await store.fileError(location, code);
      summary.failed++;
      continue;
    }
    assertLock();
    await store.record(location, file.id, evidenceParserVersion, parsed);
    summary.indexed++;
  }
  assertLock();
  summary.missing = await store.finish(root, seen);
  return summary;
}

export async function main(args: string[]) {
  const options = args.filter((arg) => arg !== "--");
  if (options.includes("--help")) { console.log('用法：pnpm evidence:index --root "文献目录"'); return; }
  if (options.length !== 2 || options[0] !== "--root" || !options[1]?.trim()) throw new Error("usage");
  loadEnv({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true, override: false });
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("database_missing");
  const client = createPrismaClient(url);
  try {
    const summary = await withEvidenceScanLock(url, (assertLock) => scanEvidenceDirectory(options[1],
      createEvidenceRepository(client, url), { assertLock }));
    console.log(JSON.stringify(summary));
    if (summary.failed) process.exitCode = 2;
  } finally { await client.$disconnect(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    const code = error instanceof Error && ["usage", "database_missing", "scan_running", "scan_lock_lost"].includes(error.message)
      ? error.message : "index_unavailable";
    console.error(`本地目录索引未完成（${code}）。请检查目录、数据库连接与迁移。`);
    process.exitCode = 1;
  });
}
