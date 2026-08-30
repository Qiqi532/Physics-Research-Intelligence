import { MAX_INTEREST_REQUEST_BYTES } from "@pri/domain/interests";
import { withConfiguredInterestApi } from "@/server/interests";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const result = await withConfiguredInterestApi((api) => api.get());
  return Response.json(result.body, { status: result.status });
}

export async function PUT(request: Request): Promise<Response> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_INTEREST_REQUEST_BYTES) {
    return tooLargeResponse();
  }
  const body = await readBoundedJson(request);
  if (body.status === "too_large") {
    return tooLargeResponse();
  }
  const result = await withConfiguredInterestApi((api) =>
    api.update(body.status === "ok" ? body.value : null, body.bytes),
  );
  return Response.json(result.body, { status: result.status });
}

async function readBoundedJson(request: Request): Promise<
  | { status: "ok"; value: unknown; bytes: number }
  | { status: "invalid"; bytes: number }
  | { status: "too_large" }
> {
  if (!request.body) {
    return { status: "invalid", bytes: 0 };
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_INTEREST_REQUEST_BYTES) {
      await reader.cancel();
      return { status: "too_large" };
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { status: "ok", value: JSON.parse(new TextDecoder().decode(merged)), bytes };
  } catch {
    return { status: "invalid", bytes };
  }
}

function tooLargeResponse(): Response {
  return Response.json(
    { error: "Interest settings request is too large" },
    { status: 413 },
  );
}
