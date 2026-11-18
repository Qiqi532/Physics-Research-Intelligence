import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareEnvironment } from "./local.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const escapeXml = (value) => String(value).replace(/[&<>"']/gu, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
})[character]);

export function scheduleConfiguration(environment) {
  const time = environment.DAILY_PIPELINE_TIME ?? "12:15";
  const timezone = environment.DAILY_PIPELINE_TIMEZONE ?? "Asia/Shanghai";
  const maxMinutes = Number(environment.DAILY_RUN_MAX_MINUTES ?? 60);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/u.test(time) || timezone !== "Asia/Shanghai" ||
      !Number.isInteger(maxMinutes) || maxMinutes < 5 || maxMinutes > 180) throw new Error("schedule_configuration_invalid");
  return { time, timezone, maxMinutes };
}

export function taskDefinition({ projectRoot, node, powershell, userId, date, time, maxMinutes }) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/u.test(time) ||
      !/^S-1-[\d-]+$/u.test(userId) || !Number.isInteger(maxMinutes) || maxMinutes < 5 || maxMinutes > 180) {
    throw new Error("task_definition_invalid");
  }
  const script = join(projectRoot, "scripts/scheduled-daily.mjs");
  const shellCode = `& '${node.replace(/'/gu, "''")}' '${script.replace(/'/gu, "''")}'; exit $LASTEXITCODE`;
  const command = escapeXml(powershell ?? node);
  const args = escapeXml(powershell
    ? `-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -Command "${shellCode}"`
    : `"${script}"`);
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>PRI local research digest. Public metadata only. Asia/Shanghai ${time}.</Description></RegistrationInfo>
  <Triggers>
    <CalendarTrigger><StartBoundary>${date}T${time}:00+08:00</StartBoundary><Enabled>true</Enabled><ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay></CalendarTrigger>
    <LogonTrigger><Enabled>true</Enabled><UserId>${escapeXml(userId)}</UserId><Delay>PT2M</Delay></LogonTrigger>
  </Triggers>
  <Principals><Principal id="Author"><UserId>${escapeXml(userId)}</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
  <Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><StartWhenAvailable>true</StartWhenAvailable><RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable><AllowHardTerminate>true</AllowHardTerminate><Enabled>true</Enabled><Hidden>true</Hidden><WakeToRun>false</WakeToRun><ExecutionTimeLimit>PT${maxMinutes + 5}M</ExecutionTimeLimit></Settings>
  <Actions Context="Author"><Exec><Command>${command}</Command><Arguments>${args}</Arguments><WorkingDirectory>${escapeXml(projectRoot)}</WorkingDirectory></Exec></Actions>
</Task>`;
}

export async function runScheduled({ environment, maxMinutes, logDirectory = join(root, "logs/daily"),
  spawnChild = spawn, killTree = terminateTree } = {}) {
  mkdirSync(logDirectory, { recursive: true });
  const file = join(logDirectory, `${new Date().toISOString().replace(/[:.]/gu, "-")}-${process.pid}.log`);
  const log = createWriteStream(file, { flags: "wx" });
  return new Promise((accept) => {
    let finished = false;
    let timedOut = false;
    const child = spawnChild(process.execPath, [join(root, "scripts/local.mjs"), "daily"], {
      cwd: root, env: environment, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.pipe(log, { end: false });
    child.stderr?.pipe(log, { end: false });
    const finish = (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      child.stdout?.unpipe(log);
      child.stderr?.unpipe(log);
      log.end(JSON.stringify({ event: "scheduled.end", status: code === 0 ? "complete" : "failed",
        errorCode: timedOut ? "daily_deadline_exceeded" : code === 0 ? null : "daily_run_incomplete" }) + "\n", () => accept(code));
    };
    const timer = setTimeout(() => {
      timedOut = true;
      if (child.pid) killTree(child.pid);
      finish(1);
    }, maxMinutes * 60_000);
    child.once("error", () => finish(1));
    child.once("close", (code) => finish(timedOut ? 1 : code ?? 1));
  });
}

function terminateTree(pid) {
  if (process.platform === "win32") {
    spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
  } else process.kill(pid, "SIGTERM");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  Promise.resolve().then(async () => {
    const { environment } = prepareEnvironment();
    const config = scheduleConfiguration(environment);
    if (process.argv.includes("--config")) { console.log(JSON.stringify(config)); return 0; }
    if (process.argv.includes("--task-xml")) {
      const userIndex = process.argv.indexOf("--user");
      const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
      const field = (name) => parts.find((part) => part.type === name).value;
      let date = `${field("year")}-${field("month")}-${field("day")}`;
      if (`${field("hour")}:${field("minute")}` >= config.time) date = new Date(new Date(`${date}T00:00:00Z`).getTime() + 86400_000).toISOString().slice(0, 10);
      const powershell = join(process.env.SystemRoot, "System32/WindowsPowerShell/v1.0/powershell.exe");
      console.log(taskDefinition({ projectRoot: root, node: process.execPath, powershell, userId: process.argv[userIndex + 1], date, ...config }));
      return 0;
    }
    return runScheduled({ environment, maxMinutes: config.maxMinutes });
  }).then((code) => { process.exitCode = code; }).catch(() => {
    console.error("scheduled_configuration_or_start_failed"); process.exitCode = 1;
  });
}
