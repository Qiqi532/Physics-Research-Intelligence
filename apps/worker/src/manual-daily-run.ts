import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnvironment } from "dotenv";
import { createConfiguredDailyProcessor } from "./configured-daily-processor.js";
import { runDailyOnce } from "./daily-runner.js";
import { createStructuredLogger } from "./logging.js";

export async function main(): Promise<void> {
  const loaded = loadEnvironment({
    path: fileURLToPath(new URL("../../../.env", import.meta.url)),
    quiet: true,
    override: false,
  });
  if (loaded.error && (loaded.error as NodeJS.ErrnoException).code !== "ENOENT") {
    throw new Error("daily_environment_unavailable");
  }
  process.exitCode = await runDailyOnce({
    environment: process.env,
    createProcessor: createConfiguredDailyProcessor,
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    createStructuredLogger()({
      event: "daily.run",
      status: "failed",
      errorCode: "daily_startup_failed",
    });
    process.exitCode = 1;
  });
}
