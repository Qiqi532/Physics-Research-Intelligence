import { createHealthApi } from "@/server/health";

export const dynamic = "force-dynamic";

export function GET(): Response {
  const result = createHealthApi({
    postgres: async () => undefined,
    redis: async () => undefined,
    queue: async () => ({ waiting: 0, failed: 0, workerCount: 0 }),
  }).live();
  return Response.json(result.body, { status: result.status });
}
