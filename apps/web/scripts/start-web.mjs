import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

const mode = process.argv[2];
const lan = process.argv.includes("--lan");
const hostname = lan ? "0.0.0.0" : "127.0.0.1";

if (!new Set(["dev", "start"]).has(mode)) {
  console.error("Usage: node scripts/start-web.mjs <dev|start> [--lan]");
  process.exit(1);
}

if (lan) {
  console.warn(
    "WARNING: trusted-LAN mode has no login. Use only on a trusted private network; " +
    "do not expose this Web port to the public internet.",
  );
}

process.env.HOSTNAME = hostname;

if (mode === "dev") {
  const require = createRequire(import.meta.url);
  const nextRoot = dirname(require.resolve("next/package.json"));
  const child = spawn(process.execPath, [resolve(nextRoot, "dist/bin/next"), "dev", "-H", hostname], {
    env: process.env,
    stdio: "inherit",
  });
  child.once("error", (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  child.once("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exitCode = code ?? 1;
  });
} else {
  await import("../.next/standalone/apps/web/server.js");
}
