import { evidenceJson, readEvidenceJson, validDocumentId, withEvidence } from "@/server/evidence";

export async function POST(request: Request) {
  const body = await readEvidenceJson(request, 4096);
  if (body instanceof Response) return body;
  const { query, scope, documentId } = (body.value ?? {}) as { query?: unknown; scope?: unknown; documentId?: unknown };
  if (typeof query !== "string" || !query.trim() || query.length > 300 ||
    (scope !== "single" && scope !== "cross") ||
    (scope === "single" && (typeof documentId !== "string" || !validDocumentId(documentId))) ||
    (scope === "cross" && documentId !== undefined)) return evidenceJson({ error: "invalid_question" }, 400);
  try {
    return evidenceJson(await withEvidence((repo) => repo.answer(query.trim(), scope, typeof documentId === "string" ? documentId : undefined)));
  } catch { return evidenceJson({ error: "database_unavailable" }, 503); }
}
