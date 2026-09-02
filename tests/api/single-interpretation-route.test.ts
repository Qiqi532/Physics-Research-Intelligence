import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  interpretSinglePaper: vi.fn(),
}));

vi.mock("@/server/single-interpretation", () => ({
  interpretSinglePaper: mocks.interpretSinglePaper,
}));

import { POST } from "../../apps/web/src/app/api/papers/[doi]/interpret/route";

describe("single-paper interpretation route", () => {
  beforeEach(() => {
    mocks.interpretSinglePaper.mockReset();
  });

  it("returns a generic unavailable response without internal error text", async () => {
    mocks.interpretSinglePaper.mockResolvedValue({
      status: "unavailable",
      error: "connection failed for private database URL",
    });

    const response = await POST(new Request("http://localhost"), {
      params: Promise.resolve({ doi: "10.1103%2Fexample" }),
    });
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      status: "unavailable",
      errorCode: "service_unavailable",
    });
    expect(JSON.stringify(body)).not.toContain("private database URL");
  });

  it.each([
    [{ status: "complete", runId: "run-1" }, 200],
    [{ status: "duplicate", runId: "run-1" }, 200],
    [{ status: "in_progress", runId: "run-1" }, 202],
    [{ status: "not_found" }, 404],
  ])("maps %o to HTTP %s", async (result, status) => {
    mocks.interpretSinglePaper.mockResolvedValue(result);

    const response = await POST(new Request("http://localhost"), {
      params: Promise.resolve({ doi: "10.1103%2Fexample" }),
    });

    expect(response.status).toBe(status);
  });
});
