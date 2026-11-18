import { describe, expect, it, vi } from "vitest";
import { withModelRetry } from "../../apps/worker/src/jobs/model-retry";

describe("bounded model retry", () => {
  it("waits a minute for rate limiting and retries exactly once", async () => {
    const call = vi.fn().mockResolvedValueOnce({ code: "rate_limited" }).mockResolvedValueOnce({ code: undefined });
    const sleep = vi.fn(async () => undefined);
    await withModelRetry(call, { errorCode: (result) => result.code, sleep });
    expect(call).toHaveBeenCalledTimes(2);
    expect(sleep.mock.calls.reduce((sum, [delay]) => sum + delay, 0)).toBe(60000);
  });
  it("does not loop indefinitely when the provider keeps failing", async () => {
    const call = vi.fn(async () => ({ code: "timeout" }));
    expect(await withModelRetry(call, { errorCode: (result) => result.code, sleep: async () => undefined })).toEqual({ code: "timeout" });
    expect(call).toHaveBeenCalledTimes(2);
  });
  it("never retries authentication errors or business validation", async () => {
    for (const code of ["authentication", "permanent_4xx", "business_validation"]) {
      const call = vi.fn(async () => ({ code }));
      const sleep = vi.fn();
      await withModelRetry(call, { errorCode: (result) => result.code, sleep });
      expect(call).toHaveBeenCalledOnce();
      expect(sleep).not.toHaveBeenCalled();
    }
  });
  it("stops before retrying if its database lock is lost", async () => {
    const call = vi.fn(async () => ({ code: "rate_limited" }));
    const assertLock = vi.fn().mockImplementationOnce(() => undefined).mockImplementationOnce(() => { throw new Error("daily_lock_lost"); });
    await expect(withModelRetry(call, { errorCode: (result) => result.code, assertLock, sleep: async () => undefined })).rejects.toThrow("daily_lock_lost");
    expect(call).toHaveBeenCalledOnce();
  });
});
