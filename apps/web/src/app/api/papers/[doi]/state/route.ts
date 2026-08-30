import { withConfiguredTodayApi } from "@/server/today";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ doi: string }>;
};

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  const { doi } = await context.params;
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    // The service maps missing or malformed JSON to the same safe 400 response.
  }
  const result = await withConfiguredTodayApi((api) => api.updateState(doi, body));
  return Response.json(result.body, { status: result.status });
}
