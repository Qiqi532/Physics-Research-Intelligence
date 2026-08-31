import { withConfiguredTodayApi } from "@/server/today";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const result = await withConfiguredTodayApi((api) => api.get());
  return Response.json(result.body, { status: result.status });
}
