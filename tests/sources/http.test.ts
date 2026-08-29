import { describe, expect, it, vi } from "vitest";
import {
  SourceConnectorError,
  createRetriableFetch,
} from "../../packages/sources/src/http";

describe("source HTTP boundary", () => {
  it("honors Retry-After before retrying a rate-limited request", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("busy", {
        status: 429,
        headers: { "Retry-After": "2" },
      }))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    const sleep = vi.fn(async () => undefined);
    const request = createRetriableFetch({ fetchImpl, sleep });

    const response = await request("https://example.test/items");

    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(2_000);
  });

  it("uses exponential backoff for temporary upstream failures", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("error", { status: 500 }))
      .mockResolvedValueOnce(new Response("error", { status: 503 }))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    const sleep = vi.fn(async () => undefined);
    const request = createRetriableFetch({ fetchImpl, sleep, baseDelayMs: 100 });

    await request("https://example.test/items");

    expect(sleep).toHaveBeenNthCalledWith(1, 100);
    expect(sleep).toHaveBeenNthCalledWith(2, 200);
  });

  it("does not retry a permanent client error", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("bad request", { status: 400 }),
    );
    const request = createRetriableFetch({ fetchImpl });

    await expect(request("https://example.test/items")).rejects.toMatchObject({
      code: "request_failed",
      status: 400,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("maps an exhausted abort to a visible timeout error", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(
      new DOMException("aborted", "AbortError"),
    );
    const request = createRetriableFetch({
      fetchImpl,
      maxAttempts: 1,
      timeoutMs: 1,
    });

    await expect(request("https://example.test/items")).rejects.toEqual(
      expect.objectContaining<Partial<SourceConnectorError>>({ code: "timeout" }),
    );
  });

  it("retries a temporary timeout before succeeding", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new DOMException("aborted", "AbortError"))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    const sleep = vi.fn(async () => undefined);
    const request = createRetriableFetch({ fetchImpl, sleep, baseDelayMs: 50 });

    await expect(request("https://example.test/items")).resolves.toHaveProperty(
      "status",
      200,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(50);
  });
});
