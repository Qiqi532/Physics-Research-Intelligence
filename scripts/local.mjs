import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const appUrl = "http://127.0.0.1:3000";

export class LauncherError extends Error {}

export function validateDatabase(value) {
  let url;
  try { url = new URL(value); } catch {
    throw new LauncherError("请先配置根目录 .env 中的 DATABASE_URL。");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
      (url.port && url.port !== "5432")) {
    throw new LauncherError("此便捷入口使用本机 5432 端口的 PostgreSQL；自定义数据库请按运维说明启动。");
  }
}

function runCommand(program, args, options = {}) {
  const result = spawnSync(program, args, {
    cwd: root,
    windowsHide: true,
    encoding: "utf8",
    stdio: options.inherit ? "inherit" : "pipe",
    timeout: options.inherit ? undefined : (options.timeout ?? 5000),
    ...(options.environment ? { env: options.environment } : {}),
  });
  return { status: result.status ?? 1, stdout: result.stdout ?? "" };
}

export function prepareEnvironment() {
  if (Number(process.versions.node.split(".")[0]) < 22) {
    throw new LauncherError("需要 Node.js 22 或更高版本。");
  }
  let dotenv, nextCli, tsxCli;
  try {
    const web = createRequire(join(root, "apps/web/package.json"));
    const worker = createRequire(join(root, "apps/worker/package.json"));
    dotenv = worker("dotenv");
    nextCli = join(dirname(web.resolve("next/package.json")), "dist/bin/next");
    tsxCli = worker.resolve("tsx/cli");
  } catch {
    throw new LauncherError("依赖不完整：请在项目目录运行 pnpm install --frozen-lockfile。");
  }
  const environment = { ...process.env };
  const loaded = dotenv.config({
    path: join(root, ".env"), processEnv: environment, quiet: true, override: false,
  });
  if (loaded.error) {
    throw new LauncherError("无法读取根目录 .env。首次使用请复制 .env.example 并配置本地数据库。");
  }
  validateDatabase(environment.DATABASE_URL);
  if (!existsSync(join(root, "packages/db/src/generated/prisma/client.ts"))) {
    throw new LauncherError("数据库客户端未生成：请运行 pnpm --filter @pri/db prisma:generate。");
  }
  return {
    nextCli, tsxCli,
    productionServer: existsSync(join(root, "apps/web/.next/standalone/apps/web/server.js"))
      ? join(root, "apps/web/.next/standalone/apps/web/server.js") : undefined,
    environment: {
      ...environment,
      RUNTIME_MODE: "local",
      DAILY_PIPELINE_ENABLED: "false",
      NEXT_TELEMETRY_DISABLED: "1",
      PRI_LAN_MODE: "false",
      HOSTNAME: "127.0.0.1",
      PORT: "3000",
      PRI_PROJECT_ROOT: root,
    },
  };
}

async function isAppRunning() {
  try {
    const response = await fetch(`${appUrl}/api/health/live`, { signal: AbortSignal.timeout(1500) });
    return response.ok && (await response.json()).status === "alive";
  } catch { return false; }
}

function openBrowser() {
  if (process.platform !== "win32") return;
  const child = spawn("powershell.exe", [
    "-NoProfile", "-NonInteractive", "-Command", `Start-Process -FilePath '${appUrl}'`,
  ], { windowsHide: true, stdio: "ignore" });
  child.on("error", () => console.log(`请手动打开 ${appUrl}`));
  child.unref();
}

async function startDockerDesktop() {
  if (process.platform !== "win32") return false;
  const locations = runCommand("where.exe", ["docker"]).stdout.trim().split(/\r?\n/u);
  const candidates = [
    ...(process.env.LOCALAPPDATA ? [join(process.env.LOCALAPPDATA, "Programs/DockerDesktop/Docker Desktop.exe")] : []),
    ...(process.env.ProgramFiles ? [join(process.env.ProgramFiles, "Docker/Docker/Docker Desktop.exe")] : []),
    ...locations.filter(Boolean).map((location) => join(resolve(dirname(location), "../.."), "Docker Desktop.exe")),
  ];
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    const child = spawn(candidate, [], { windowsHide: true, detached: true, stdio: "ignore" });
    await new Promise((accept, reject) => {
      child.once("spawn", accept);
      child.once("error", reject);
    });
    child.unref();
    return true;
  }
  return false;
}

export async function waitForApplication(probe, signal, wait = sleep) {
  for (let attempt = 0; attempt < 90 && !signal.aborted; attempt++) {
    if (await probe()) return true;
    try { await wait(1000, undefined, { signal }); } catch {
      if (signal.aborted) return false;
      throw new LauncherError("等待网页启动失败。");
    }
  }
  return false;
}

export function webArguments(config) {
  return config.productionServer ? [config.productionServer]
    : [config.nextCli, "dev", "-H", "127.0.0.1", "-p", "3000"];
}

async function serveWeb(config, { browser, log }) {
  log(config.productionServer ? "正在启动已有生产构建……" : "未发现生产构建，使用开发预览启动……");
  const child = spawn(process.execPath, webArguments(config), {
    cwd: join(root, "apps/web"), env: config.environment, stdio: "inherit",
  });
  const controller = new AbortController();
  let interrupted = false;
  const stop = () => {
    interrupted = true;
    if (!child.pid || child.exitCode !== null) return;
    if (process.platform === "win32") {
      runCommand("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"]);
    } else child.kill("SIGINT");
  };
  const exited = new Promise((accept) => {
    child.once("error", () => accept(1));
    child.once("exit", (code) => accept(code ?? (interrupted ? 0 : 1)));
  });
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    const ready = await Promise.race([
      waitForApplication(isAppRunning, controller.signal), exited.then(() => false),
    ]);
    if (!ready) {
      const wasInterrupted = interrupted;
      stop();
      await exited;
      if (wasInterrupted) return 0;
      throw new LauncherError("网页未能启动。请查看上方错误；端口 3000 可能被占用。");
    }
    if (browser) openBrowser();
    log(`已启动：${appUrl}。按 Ctrl+C 停止网页，数据库会保留。`);
    return await exited;
  } finally {
    controller.abort();
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}

export async function runLocal(action = "start", options = {}, dependencies = {}) {
  if (!["start", "check", "daily"].includes(action)) {
    throw new LauncherError("用法：Start-PRI.cmd [start|check|daily] [--no-browser]");
  }
  const {
    prepare = prepareEnvironment, run = runCommand, probe = isAppRunning,
    serve = serveWeb, open = openBrowser, desktop = startDockerDesktop,
    wait = sleep, log = console.log,
  } = dependencies;
  const config = prepare();
  if (action === "start" && await probe()) {
    log(`检测到已有平台实例：${appUrl}；沿用该实例，不重复启动。`);
    if (!options.noBrowser) open();
    return 0;
  }
  if (run("docker", ["compose", "version"]).status !== 0) {
    throw new LauncherError("未检测到 Docker Compose，请安装或修复 Docker Desktop。");
  }
  const engineReady = () => run("docker", ["info", "--format", "{{.ServerVersion}}"]).status === 0;
  if (!engineReady()) {
    if (action === "check") throw new LauncherError("Docker 命令可用，但引擎尚未运行；请打开 Docker Desktop。");
    if (!await desktop()) throw new LauncherError("请先手动打开 Docker Desktop，等待引擎就绪后重试。");
    log("正在等待 Docker Desktop 引擎启动……");
    let ready = false;
    const deadline = Date.now() + 180_000;
    for (let attempt = 0; attempt < 90 && Date.now() < deadline; attempt++) {
      if (engineReady()) { ready = true; break; }
      await wait(2000);
    }
    if (!ready) throw new LauncherError("Docker 引擎未在等待时间内就绪，请在 Docker Desktop 查看状态后重试。");
  }
  if (action === "check") {
    log("检查通过：依赖、根目录配置、数据库客户端和 Docker 引擎可用。未启动服务或调用模型。");
    return 0;
  }
  log("正在启动本地 PostgreSQL……");
  if (run("docker", ["compose", "-f", join(root, "infra/docker-compose.yml"),
    "up", "-d", "--wait", "--wait-timeout", "60", "postgres"], { timeout: 70_000 }).status !== 0) {
    throw new LauncherError("PostgreSQL 启动失败。请检查 Docker、端口 5432 和本地 postgres 镜像。");
  }
  if (action === "daily") {
    log("手动生成推荐：将访问论文来源、调用已配置的模型并更新数据库；不会上传本地 PDF。");
    return run(process.execPath, [config.tsxCli, join(root, "apps/worker/src/manual-daily-run.ts")], {
      inherit: true, environment: config.environment,
    }).status;
  }
  return serve(config, { browser: !options.noBrowser, log });
}

export function parseArguments(args) {
  if (args.some((arg) => arg.startsWith("--") && !["--help", "--no-browser"].includes(arg)) ||
      args.filter((arg) => !arg.startsWith("--")).length > 1) {
    throw new LauncherError("用法：Start-PRI.cmd [start|check|daily] [--no-browser]");
  }
  return {
    action: args.find((arg) => !arg.startsWith("--")) ?? "start",
    noBrowser: args.includes("--no-browser"),
    help: args.includes("--help"),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  Promise.resolve().then(() => {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      console.log("用法：Start-PRI.cmd [start|check|daily] [--no-browser]\nstart：打开平台；check：只读检查；daily：真实生成推荐。");
      return 0;
    }
    return runLocal(options.action, options);
  }).then((code) => { process.exitCode = code; }).catch((error) => {
    console.error(error instanceof LauncherError ? error.message : "启动失败，请运行 Start-PRI.cmd check 检查环境。");
    process.exitCode = 1;
  });
}
