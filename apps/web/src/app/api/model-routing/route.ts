import { withConfiguredModelSettingsApi } from "@/server/model-settings";
import {
  readBoundedJson,
  validateModelSettingsMutation,
} from "@/server/model-settings-request";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const result = await withConfiguredModelSettingsApi((api) => api.getRouting());
  return Response.json(result.body, { status: result.status });
}

export async function PUT(request: Request): Promise<Response> {
  const guarded = validateModelSettingsMutation(request, {
    lanMode: process.env.PRI_LAN_MODE === "true",
  });
  if (!guarded.ok) return Response.json({ errorCode: guarded.errorCode }, { status: guarded.status });
  const body = await readBoundedJson(request);
  if (body.status !== "ok") {
    return Response.json(
      { errorCode: body.status === "too_large" ? "settings_request_too_large" : "settings_invalid" },
      { status: body.status === "too_large" ? 413 : 400 },
    );
  }
  const result = await withConfiguredModelSettingsApi((api) => api.updateRouting(body.value));
  return Response.json(result.body, { status: result.status });
}
