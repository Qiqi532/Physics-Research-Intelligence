import { withConfiguredHealthApi } from "@/server/configured-health";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const result = await withConfiguredHealthApi((api) => api.ready());
  return Response.json(result.body, { status: result.status });
}
