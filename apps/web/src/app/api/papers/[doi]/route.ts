import { withConfiguredPaperApi } from "@/server/papers";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ doi: string }>;
};

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const { doi } = await context.params;
  const result = await withConfiguredPaperApi((api) => api.detail(doi));

  return Response.json(result.body, { status: result.status });
}
