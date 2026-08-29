import { withConfiguredPaperApi } from "@/server/papers";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const searchParams = new URL(request.url).searchParams;
  const result = await withConfiguredPaperApi((api) => api.list(searchParams));

  return Response.json(result.body, { status: result.status });
}
