import { comparisonContentSchema, comparisonIdSchema, comparisonSourceSchema } from "@pri/domain/evidence-comparison";
import { evidenceJson, readEvidenceJson, withEvidence } from "@/server/evidence";

const resultResponse = (result: { status: string; id?: string }, created = false) =>
  result.status === "saved" ? evidenceJson({ id: result.id }, created ? 201 : 200)
    : evidenceJson({ error: result.status }, result.status === "quote_mismatch" ? 422 : 404);

export async function POST(request: Request) {
  const body = await readEvidenceJson(request, 24_576);
  if (body instanceof Response) return body;
  const input = comparisonSourceSchema.safeParse(body.value);
  if (!input.success) return evidenceJson({ error: "invalid_row" }, 400);
  try { return resultResponse(await withEvidence((repo) => repo.comparison.add(input.data)), true); }
  catch { return evidenceJson({ error: "database_unavailable" }, 503); }
}

export async function PATCH(request: Request) {
  const body = await readEvidenceJson(request, 24_576);
  if (body instanceof Response) return body;
  if (typeof body.value !== "object" || !body.value) return evidenceJson({ error: "invalid_row" }, 400);
  const { id, ...content } = body.value as Record<string, unknown>;
  const key = comparisonIdSchema.safeParse(id);
  const input = comparisonContentSchema.safeParse(content);
  if (!key.success || !input.success) return evidenceJson({ error: "invalid_row" }, 400);
  try { return resultResponse(await withEvidence((repo) => repo.comparison.update(key.data, input.data))); }
  catch { return evidenceJson({ error: "database_unavailable" }, 503); }
}

export async function DELETE(request: Request) {
  const body = await readEvidenceJson(request, 1024);
  if (body instanceof Response) return body;
  const key = comparisonIdSchema.safeParse((body.value as { id?: unknown } | null)?.id);
  if (!key.success) return evidenceJson({ error: "invalid_row" }, 400);
  try {
    return await withEvidence((repo) => repo.comparison.remove(key.data))
      ? evidenceJson({ removed: true }) : evidenceJson({ error: "row_missing" }, 404);
  } catch { return evidenceJson({ error: "database_unavailable" }, 503); }
}
