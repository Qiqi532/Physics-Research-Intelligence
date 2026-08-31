import { withConfiguredModelSettingsApi } from "@/server/model-settings";
import {
  readBoundedJson,
  validateModelSettingsMutation,
} from "@/server/model-settings-request";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return respond(await withConfiguredModelSettingsApi((api) => api.list()));
}

export async function POST(request: Request): Promise<Response> {
  const guarded = validateModelSettingsMutation(request, { lanMode: isLanMode() });
  if (!guarded.ok) return Response.json({ errorCode: guarded.errorCode }, { status: guarded.status });
  const body = await readBoundedJson(request);
  if (body.status !== "ok") {
    return Response.json(
      { errorCode: body.status === "too_large" ? "settings_request_too_large" : "settings_invalid" },
      { status: body.status === "too_large" ? 413 : 400 },
    );
  }
  return respond(await withConfiguredModelSettingsApi((api) => api.create(body.value)));
}

function isLanMode(): boolean {
  return process.env.PRI_LAN_MODE === "true";
}

function respond(result: { status: number; body: unknown }): Response {
  return result.status === 204
    ? new Response(null, { status: 204 })
    : Response.json(result.body, { status: result.status });
}
