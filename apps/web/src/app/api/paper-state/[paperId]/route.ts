import { createPrismaClient, patchPaperState } from "@pri/db";
import { paperStatePatchSchema } from "@pri/domain/ranking-review";
import { readBoundedJson, validateModelSettingsMutation } from "@/server/model-settings-request";

function respond(status: number, data: unknown) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request, context: { params: Promise<{ paperId: string }> }) {
  const guard = validateModelSettingsMutation(request, { lanMode: false });
  if (!guard.ok) return respond(guard.status, { error: "invalid_request" });
  const { paperId } = await context.params;
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(paperId)) return respond(400, { error: "invalid_paper_id" });
  const body = await readBoundedJson(request, 20_000);
  if (body.status !== "ok") return respond(body.status === "too_large" ? 413 : 400, { error: "invalid_state" });
  const patch = paperStatePatchSchema.safeParse(body.value);
  if (!patch.success) return respond(400, { error: "invalid_state" });
  const url = process.env.DATABASE_URL;
  if (!url) return respond(503, { error: "database_unavailable" });
  let client: ReturnType<typeof createPrismaClient> | undefined;
  try {
    client = createPrismaClient(url);
    const result = await patchPaperState(client, paperId, "default", patch.data);
    return result.status === "updated" ? respond(200, { state: result.state }) : respond(404, { error: "paper_not_found" });
  } catch {
    return respond(503, { error: "database_unavailable" });
  } finally {
    await client?.$disconnect();
  }
}
