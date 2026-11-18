import { comparisonIdSchema, comparisonPageSize, serializeComparison } from "@pri/domain/evidence-comparison";
import { allowEvidence, evidenceHeaders, evidenceJson, withEvidence } from "@/server/evidence";

export async function GET(request: Request) {
  if (!allowEvidence(request.headers)) return evidenceJson({ error: "local_only" }, 403);
  const url = new URL(request.url);
  const format = url.searchParams.get("format");
  const ids = url.searchParams.getAll("row");
  if ((format !== "md" && format !== "csv") || !ids.length || ids.length > comparisonPageSize ||
    ids.some((id) => !comparisonIdSchema.safeParse(id).success)) return evidenceJson({ error: "invalid_selection" }, 400);
  const selected = [...new Set(ids)];
  try {
    const rows = await withEvidence((repo) => repo.comparison.selected(selected));
    if (rows.length !== selected.length) return evidenceJson({ error: "row_missing" }, 404);
    const origin = new URL(url.protocol + "//" + request.headers.get("host")).origin;
    return new Response(serializeComparison(rows, format, origin), { headers: {
      ...evidenceHeaders,
      "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "text/markdown; charset=utf-8",
      "Content-Disposition": 'attachment; filename="evidence-comparison.' + format + '"',
    } });
  } catch { return evidenceJson({ error: "database_unavailable" }, 503); }
}
