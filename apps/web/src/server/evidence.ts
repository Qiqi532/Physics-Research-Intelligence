import { createEvidenceRepository, createPrismaClient, type EvidenceRepository } from "@pri/db";
import { readEvidenceFile } from "@pri/domain/evidence-files";
import { readBoundedJson, validateModelSettingsMutation } from "./model-settings-request";

export function allowEvidence(headers: Pick<Headers, "get">) {
  if (process.env.PRI_LAN_MODE === "true" || headers.get("sec-fetch-site") === "cross-site") return false;
  const host = headers.get("host")?.toLowerCase();
  if (!host || !/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)) return false;
  const origin = headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host.toLowerCase() === host; } catch { return false; }
}

export async function withEvidence<T>(operation: (repo: EvidenceRepository) => Promise<T>) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("database_unavailable");
  const client = createPrismaClient(url);
  try { return await operation(createEvidenceRepository(client, url)); }
  finally { await client.$disconnect(); }
}

export const evidenceHeaders = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
export const validDocumentId = (value: string) => /^[a-f0-9]{64}$/.test(value);
export const evidenceJson = (data: unknown, status = 200) => Response.json(data, { status, headers: evidenceHeaders });

export async function readEvidenceJson(request: Request, maxBytes: number) {
  if (!allowEvidence(request.headers)) return evidenceJson({ error: "local_only" }, 403);
  const guard = validateModelSettingsMutation(request, { lanMode: false });
  if (!guard.ok) return evidenceJson({ error: guard.errorCode }, guard.status);
  const body = await readBoundedJson(request, maxBytes);
  if (body.status !== "ok") return evidenceJson({ error: "invalid_body" }, body.status === "too_large" ? 413 : 400);
  return { value: body.value };
}

export async function originalBytes(repo: EvidenceRepository, id: string) {
  for (const location of await repo.locations(id)) {
    try {
      const result = await readEvidenceFile(location.root, location.relativePath);
      if (result.id === id) return result.data;
    } catch { /* Another registered copy may still provide the exact version. */ }
  }
  return null;
}
