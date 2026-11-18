const transient = new Set(["rate_limited", "timeout", "upstream_5xx", "network_error"]);

export async function withModelRetry<T>(call: () => Promise<T>, options: {
  errorCode(result: T): string | undefined;
  assertLock?: () => void;
  sleep?: (milliseconds: number) => Promise<void>;
}): Promise<T> {
  const sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  for (let attempt = 0; ; attempt++) {
    options.assertLock?.();
    const result = await call();
    const code = options.errorCode(result);
    if (!code || !transient.has(code) || attempt >= 1) return result;
    // One bounded retry. Split the wait so a lost lock is noticed before another request.
    const delay = code === "rate_limited" ? 60_000 : 15_000;
    for (let elapsed = 0; elapsed < delay; elapsed += 15_000) {
      options.assertLock?.();
      await sleep(Math.min(15_000, delay - elapsed));
    }
  }
}
