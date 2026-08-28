#!/usr/bin/env node

import { execFile, spawn } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

// These limits are intentionally conservative for a local Expo/Electron tree:
// a short render spike is allowed, while a sustained runaway stops the command.
export const DEFAULT_LIMITS = Object.freeze({
  intervalMs: 1_000,
  maxCpuPercent: 500,
  maxRssMb: 2_048,
  breachSamples: 3,
  killGraceMs: 1_500,
});

const WATCHDOG_EXIT_CODE = 70;

function usage() {
  return [
    "用法：node scripts/process-watchdog.mjs [监控选项] -- <命令> [参数...]",
    "",
    "监控选项：",
    "  --interval-ms <n>       采样间隔，默认 1000",
    "  --max-cpu-percent <n>   进程树累计 CPU 上限，默认 500",
    "  --max-rss-mb <n>       进程树累计 RSS 上限，默认 2048",
    "  --breach-samples <n>   连续超限采样次数，默认 3",
    "  --kill-grace-ms <n>    优雅停止等待时间，默认 1500",
    "",
    "示例：npm run watch:process -- npm run web",
  ].join("\n");
}

function positiveNumber(value, option) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${option} 必须是正数。`);
  }
  return number;
}

/** Parse watchdog flags while leaving the command's own flags untouched. */
export function parseArguments(argv, defaults = DEFAULT_LIMITS) {
  const separator = argv.indexOf("--");
  const controlArgs = separator >= 0 ? argv.slice(0, separator) : [];
  const commandArgs = separator >= 0 ? argv.slice(separator + 1) : argv;
  const limits = { ...defaults };

  if (separator < 0 && (argv[0] === "--help" || argv[0] === "-h")) {
    return { help: true, limits, command: [] };
  }

  for (let index = 0; index < controlArgs.length; index += 1) {
    const option = controlArgs[index];
    const value = controlArgs[index + 1];
    if (!option) continue;
    if (option === "--help" || option === "-h") return { help: true, limits, command: [] };
    if (!value) throw new Error(`${option} 缺少参数。`);
    if (option === "--interval-ms") limits.intervalMs = positiveNumber(value, option);
    else if (option === "--max-cpu-percent") limits.maxCpuPercent = positiveNumber(value, option);
    else if (option === "--max-rss-mb") limits.maxRssMb = positiveNumber(value, option);
    else if (option === "--breach-samples") limits.breachSamples = Math.max(1, Math.floor(positiveNumber(value, option)));
    else if (option === "--kill-grace-ms") limits.killGraceMs = positiveNumber(value, option);
    else throw new Error(`未知监控选项：${option}`);
    index += 1;
  }

  if (commandArgs.length === 0) throw new Error(`缺少要监控的命令。\n\n${usage()}`);
  return { help: false, limits, command: commandArgs };
}

/** Convert `ps` output into a small, testable process snapshot. */
export function parseProcessSnapshot(output) {
  const snapshot = new Map();
  for (const line of output.split(/\r?\n/u)) {
    const match = /^\s*(\d+)\s+(\d+)\s+([\d.]+)\s+(\d+(?:\.\d+)?)\s*$/u.exec(line);
    if (!match) continue;
    const pid = Number(match[1]);
    const ppid = Number(match[2]);
    const cpuPercent = Number(match[3]);
    const rssKb = Number(match[4]);
    if (![pid, ppid, cpuPercent, rssKb].every(Number.isFinite) || pid <= 1) continue;
    snapshot.set(pid, { pid, ppid, cpuPercent, rssKb });
  }
  return snapshot;
}

/** Return the root process and all currently observed descendants. */
export function processTree(snapshot, rootPid) {
  const tree = new Set([rootPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const record of snapshot.values()) {
      if (tree.has(record.ppid) && !tree.has(record.pid)) {
        tree.add(record.pid);
        changed = true;
      }
    }
  }
  return [...tree].filter((pid) => snapshot.has(pid));
}

export function summarizeUsage(snapshot, pids) {
  return pids.reduce((usage, pid) => {
    const record = snapshot.get(pid);
    if (!record) return usage;
    return {
      cpuPercent: usage.cpuPercent + record.cpuPercent,
      rssKb: usage.rssKb + record.rssKb,
    };
  }, { cpuPercent: 0, rssKb: 0 });
}

function formatUsage(usage) {
  return `CPU ${usage.cpuPercent.toFixed(1)}% · RSS ${(usage.rssKb / 1024).toFixed(0)} MB`;
}

async function readProcessSnapshot() {
  if (process.platform === "win32") {
    // ponytail: keep one auditable sampler; add a PowerShell sampler if Windows development monitoring is needed.
    throw new Error("process-watchdog 目前只支持 macOS/Linux（需要 ps）。");
  }
  const { stdout } = await execFileAsync("ps", ["-axo", "pid=,ppid=,pcpu=,rss="], {
    env: { ...process.env, LC_ALL: "C" },
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
  });
  return parseProcessSnapshot(stdout);
}

function commandForPlatform(command) {
  if (process.platform === "win32" && command === "npm") return "npm.cmd";
  return command;
}

function signalGroup(child, signal, snapshot = null) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform !== "win32") {
    try {
      // detached=true makes the child the process-group leader.
      process.kill(-child.pid, signal);
    } catch {
      // Fall back to the processes visible in the latest snapshot.
    }
  }
  // Signal observed descendants too; some tools create a separate process group.
  const pids = snapshot
    ? processTree(snapshot, child.pid).reverse()
    : process.platform === "win32" ? [child.pid] : [];
  for (const pid of pids) {
    if (pid <= 1 || pid === process.pid) continue;
    try { process.kill(pid, signal); } catch { /* It may have exited between ps and kill. */ }
  }
}

async function stopChild(child, graceMs, snapshot = null) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  signalGroup(child, "SIGTERM", snapshot);
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, graceMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
  if (child.exitCode === null && child.signalCode === null) signalGroup(child, "SIGKILL", snapshot);
}

async function monitor(child, limits, onStop) {
  let consecutiveBreaches = 0;
  let latestSnapshot = null;
  let lastLogAt = 0;
  while (child.exitCode === null && child.signalCode === null) {
    await new Promise((resolve) => setTimeout(resolve, limits.intervalMs));
    if (child.exitCode !== null || child.signalCode !== null) break;
    try {
      latestSnapshot = await readProcessSnapshot();
      const pids = processTree(latestSnapshot, child.pid);
      if (pids.length === 0) continue;
      const usage = summarizeUsage(latestSnapshot, pids);
      const overLimit = usage.cpuPercent > limits.maxCpuPercent
        || usage.rssKb > limits.maxRssMb * 1024;
      consecutiveBreaches = overLimit ? consecutiveBreaches + 1 : 0;
      const now = Date.now();
      if (overLimit && (consecutiveBreaches === 1 || now - lastLogAt >= 5_000)) {
        console.error(`[watchdog] 超限采样 ${consecutiveBreaches}/${limits.breachSamples}：${formatUsage(usage)}`);
        lastLogAt = now;
      }
      if (consecutiveBreaches >= limits.breachSamples) {
        await onStop({ pids, usage, snapshot: latestSnapshot });
        return;
      }
    } catch (error) {
      await onStop({ error, snapshot: latestSnapshot });
      return;
    }
  }
}

async function main() {
  const parsed = parseArguments(process.argv.slice(2));
  if (parsed.help) {
    console.log(usage());
    return 0;
  }
  if (process.platform === "win32") {
    throw new Error("process-watchdog 目前只支持 macOS/Linux（需要 ps）。");
  }
  const [command, ...args] = parsed.command;
  const child = spawn(commandForPlatform(command), args, {
    cwd: process.cwd(),
    detached: process.platform !== "win32",
    env: process.env,
    stdio: "inherit",
  });

  let stopping = false;
  let forwardedSignal = null;
  const handleSignal = async (signal) => {
    if (stopping) return;
    stopping = true;
    forwardedSignal = signal;
    await stopChild(child, parsed.limits.killGraceMs);
  };
  const onSigint = () => void handleSignal("SIGINT");
  const onSigterm = () => void handleSignal("SIGTERM");
  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);
  const monitorPromise = monitor(child, parsed.limits, async ({ usage, error, snapshot }) => {
    if (stopping) return;
    stopping = true;
    if (error) console.error(`[watchdog] 无法读取进程占用，已停止命令：${error.message}`);
    else console.error(`[watchdog] 进程树持续超限（${formatUsage(usage)}），已停止命令。`);
    await stopChild(child, parsed.limits.killGraceMs, snapshot);
  });
  const exit = await new Promise((resolve) => {
    child.once("error", (error) => resolve({ error }));
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  process.off("SIGINT", onSigint);
  process.off("SIGTERM", onSigterm);
  await monitorPromise;
  if (exit.error) throw exit.error;
  if (forwardedSignal) return forwardedSignal === "SIGINT" ? 130 : 143;
  if (stopping) return WATCHDOG_EXIT_CODE;
  if (exit.signal) return exit.signal === "SIGINT" ? 130 : exit.signal === "SIGTERM" ? 143 : 1;
  return exit.code ?? 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => { process.exitCode = code; }).catch((error) => {
    console.error(`[watchdog] ${error instanceof Error ? error.message : "启动失败。"}`);
    process.exitCode = 1;
  });
}
