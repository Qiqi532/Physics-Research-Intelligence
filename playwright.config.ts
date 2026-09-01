import { defineConfig, devices } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";

const testDatabaseUrl = requireDedicatedTestDatabase();
const baseEnvironment = {
  DATABASE_URL: testDatabaseUrl,
  REDIS_URL: "redis://127.0.0.1:6379/15",
  DAILY_PIPELINE_ENABLED: "false",
  AI_SETTINGS_MASTER_KEY_FILE: join(tmpdir(), "pri-stage8-e2e-model-settings.key"),
  PRI_LAN_MODE: "false",
};

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/fixtures/global-setup.ts",
  globalTeardown: "./tests/e2e/fixtures/global-teardown.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  outputDir: "test-results",
  use: {
    baseURL: "http://127.0.0.1:3210",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      command: "node --experimental-strip-types tests/e2e/fixtures/mock-ai-provider.ts",
      url: "http://127.0.0.1:3211/health",
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: "pnpm --filter @pri/web exec next dev --hostname 127.0.0.1 --port 3210",
      url: "http://127.0.0.1:3210/api/health/live",
      reuseExistingServer: false,
      timeout: 120_000,
      env: baseEnvironment,
    },
  ],
});

function requireDedicatedTestDatabase(): string {
  const value = process.env.TEST_DATABASE_URL;
  if (!value) {
    throw new Error("TEST_DATABASE_URL is required for Playwright E2E");
  }
  const url = new URL(value);
  if (url.searchParams.get("schema") !== "pri_stage5_e2e") {
    throw new Error("Playwright requires schema=pri_stage5_e2e");
  }
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
    throw new Error("Playwright E2E only permits a loopback PostgreSQL host");
  }
  return value;
}
