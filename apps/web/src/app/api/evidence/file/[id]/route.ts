import { allowEvidence, evidenceHeaders, originalBytes, validDocumentId, withEvidence } from "@/server/evidence";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!allowEvidence(request.headers)) return new Response(null, { status: 403, headers: evidenceHeaders });
  const { id } = await context.params;
  if (!validDocumentId(id)) return new Response(null, { status: 404, headers: evidenceHeaders });
  try {
    const bytes = await withEvidence((repo) => originalBytes(repo, id));
    if (!bytes) return new Response("原文件不可用或版本已改变。", { status: 410, headers: evidenceHeaders });
    return new Response(new Uint8Array(bytes), { headers: { ...evidenceHeaders, "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="paper.pdf"', "Content-Security-Policy": "sandbox; frame-ancestors 'self'" } });
  } catch { return new Response(null, { status: 503, headers: evidenceHeaders }); }
}
