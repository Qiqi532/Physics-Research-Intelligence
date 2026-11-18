import { allowEvidence, evidenceHeaders, withEvidence } from "@/server/evidence";
import { readBoundedJson } from "@/server/model-settings-request";

export async function POST(request: Request) {
  const json = (data: unknown, status: number) => Response.json(data, { status, headers: evidenceHeaders });
  if (!allowEvidence(request.headers)) return json({ error: "local_only" }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "json_required" }, 415);
  const body = await readBoundedJson(request, 4096);
  if (body.status !== "ok") return json({ error: "invalid_query" }, body.status === "too_large" ? 413 : 400);
  const value = body.value as { query?: unknown } | null;
  if (typeof value?.query !== "string" || !value.query.trim() || value.query.length > 300) return json({ error: "invalid_query" }, 400);
  const query = value.query;
  try { return json({ results: await withEvidence((repo) => repo.search(query)) }, 200); }
  catch { return json({ error: "database_unavailable" }, 503); }
}
