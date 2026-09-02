import { interpretSinglePaper } from "@/server/single-interpretation";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ doi: string }> },
): Promise<Response> {
  const { doi } = await params;
  const result = await interpretSinglePaper(doi, {
    logError: (error) => console.error("single_interpretation_failed", error),
  });

  switch (result.status) {
    case "complete":
      return Response.json({ status: "complete", runId: result.runId }, { status: 200 });
    case "duplicate":
      return Response.json({ status: "duplicate", runId: result.runId }, { status: 200 });
    case "in_progress":
      return Response.json({ status: "in_progress", runId: result.runId }, { status: 202 });
    case "failed":
      return Response.json(
        { status: "failed", runId: result.runId, errorCode: result.errorCode },
        { status: 502 },
      );
    case "not_found":
      return Response.json({ status: "not_found" }, { status: 404 });
    case "unavailable":
      return Response.json(
        { status: "unavailable", errorCode: "service_unavailable" },
        { status: 503 },
      );
    default:
      return Response.json({ status: "error" }, { status: 500 });
  }
}
