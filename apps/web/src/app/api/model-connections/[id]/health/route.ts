import { withConfiguredModelSettingsApi } from "@/server/model-settings";
import { validateModelSettingsMutation } from "@/server/model-settings-request";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const guarded = validateModelSettingsMutation(request, {
    lanMode: process.env.PRI_LAN_MODE === "true",
    requireJson: false,
  });
  if (!guarded.ok) return Response.json({ errorCode: guarded.errorCode }, { status: guarded.status });
  const { id } = await context.params;
  const result = await withConfiguredModelSettingsApi((api) => api.health(id));
  return Response.json(result.body, { status: result.status });
}
