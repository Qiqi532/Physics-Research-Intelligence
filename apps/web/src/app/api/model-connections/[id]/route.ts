import { withConfiguredModelSettingsApi } from "@/server/model-settings";
import {
  readBoundedJson,
  validateModelSettingsMutation,
} from "@/server/model-settings-request";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  const guarded = validateModelSettingsMutation(request, { lanMode: isLanMode() });
  if (!guarded.ok) return Response.json({ errorCode: guarded.errorCode }, { status: guarded.status });
  const body = await readBoundedJson(request);
  if (body.status !== "ok") {
    return Response.json(
      { errorCode: body.status === "too_large" ? "settings_request_too_large" : "settings_invalid" },
      { status: body.status === "too_large" ? 413 : 400 },
    );
  }
  const { id } = await context.params;
  return respond(await withConfiguredModelSettingsApi((api) => api.update(id, body.value)));
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  const guarded = validateModelSettingsMutation(request, {
    lanMode: isLanMode(),
    requireJson: false,
  });
  if (!guarded.ok) return Response.json({ errorCode: guarded.errorCode }, { status: guarded.status });
  const { id } = await context.params;
  return respond(await withConfiguredModelSettingsApi((api) => api.remove(id)));
}

function isLanMode(): boolean {
  return process.env.PRI_LAN_MODE === "true";
}

function respond(result: { status: number; body: unknown }): Response {
  return result.status === 204
    ? new Response(null, { status: 204 })
    : Response.json(result.body, { status: result.status });
}
