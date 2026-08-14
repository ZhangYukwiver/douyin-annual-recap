#!/usr/bin/env node

import { access, chmod, mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright-core";

import { DouyinCollector } from "./douyinCollector.mjs";
import { CollectorStore } from "./store.mjs";

const DEFAULT_PORT = 4765;
const MAX_BODY_BYTES = 4 * 1024;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(moduleDirectory, "..");

function parseArguments(argv) {
  const options = { lan: false, port: DEFAULT_PORT, origins: [], help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--lan") options.lan = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument === "--port") options.port = Number(argv[++index]);
    else if (argument === "--origin") options.origins.push(argv[++index]);
    else throw new Error(`未知参数: ${argument}`);
  }

  if (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65_535) {
    throw new Error("--port 必须是 1024 到 65535 之间的整数。");
  }
  if (options.origins.some((origin) => typeof origin !== "string" || !/^https?:\/\//u.test(origin))) {
    throw new Error("--origin 必须是完整的 http(s) 来源地址。");
  }
  return options;
}

function printHelp() {
  console.log(`用法: npm run collector -- [选项]

选项:
  --port <端口>       本地 API 端口，默认 ${DEFAULT_PORT}
  --lan               允许同一局域网内的手机连接
  --origin <地址>     允许的 Web 来源；可重复指定
  -h, --help          显示帮助

默认只监听 127.0.0.1。手机连接时使用 --lan，并在防火墙中仅允许专用网络。`);
}

async function firstExistingPath(candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next standard browser location.
    }
  }
  return null;
}

async function findChromeExecutable() {
  const localAppData = process.env.LOCALAPPDATA;
  const programFiles = process.env.ProgramFiles;
  const programFilesX86 = process.env["ProgramFiles(x86)"];
  return firstExistingPath([
    process.env.DOUYIN_CHROME_PATH,
    localAppData && path.join(localAppData, "Google", "Chrome", "Application", "chrome.exe"),
    programFiles && path.join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
    programFilesX86 && path.join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    chromium.executablePath(),
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
  ]);
}

function localLanAddresses() {
  const addresses = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) addresses.push(entry.address);
    }
  }
  return [...new Set(addresses)];
}

function isLoopbackAddress(value) {
  return value === "127.0.0.1" || value === "::1" || value === "::ffff:127.0.0.1";
}

function constantTimeStringEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

class PairingManager {
  constructor() {
    this.sessions = new Map();
    this.code = this.createCode();
    this.attempts = new Map();
  }

  createCode() {
    return String(randomInt(10_000_000, 100_000_000));
  }

  displayCode() {
    return this.code;
  }

  allowAttempt(address) {
    const now = Date.now();
    const recent = (this.attempts.get(address) ?? []).filter((timestamp) => now - timestamp < 60_000);
    recent.push(now);
    this.attempts.set(address, recent);
    return recent.length <= 5;
  }

  pair(code) {
    if (!constantTimeStringEqual(code, this.code)) return null;
    const token = randomBytes(32).toString("base64url");
    this.sessions.set(token, Date.now() + SESSION_TTL_MS);
    this.code = this.createCode();
    return token;
  }

  authorize(header) {
    if (typeof header !== "string" || !header.startsWith("Bearer ")) return false;
    const token = header.slice(7);
    const expiry = this.sessions.get(token);
    if (!expiry || expiry <= Date.now()) {
      this.sessions.delete(token);
      return false;
    }
    return true;
  }
}

function isAllowedOrigin(origin, explicitOrigins) {
  if (!origin) return true;
  if (/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/iu.test(origin)) return true;
  return explicitOrigins.includes(origin);
}

function applyHeaders(response, origin) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Access-Control-Allow-Private-Network", "true");
  if (origin) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }
}

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  response.end(body);
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("body_too_large");
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const executablePath = await findChromeExecutable();
  if (!executablePath) {
    throw new Error("未找到 Google Chrome。可通过 DOUYIN_CHROME_PATH 指定浏览器路径。");
  }

  const dataDirectory = path.join(projectDirectory, ".local-data");
  await mkdir(dataDirectory, { recursive: true, mode: 0o700 });
  await chmod(dataDirectory, 0o700);
  const store = new CollectorStore(dataDirectory);
  const collector = new DouyinCollector({ executablePath, dataDirectory, store });
  await collector.initialize();
  const pairing = new PairingManager();
  const bindAddress = options.lan ? "0.0.0.0" : "127.0.0.1";

  const server = createServer(async (request, response) => {
    const origin = typeof request.headers.origin === "string" ? request.headers.origin : "";
    if (!isAllowedOrigin(origin, options.origins)) {
      applyHeaders(response, "");
      sendJson(response, 403, { error: "origin_not_allowed" });
      return;
    }
    applyHeaders(response, origin);

    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        "Access-Control-Max-Age": "600",
      });
      response.end();
      return;
    }

    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    if (request.method === "GET" && url.pathname === "/v1/health") {
      sendJson(response, 200, { ok: true, version: 1 });
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/pair") {
      const remoteAddress = request.socket.remoteAddress ?? "unknown";
      if (!pairing.allowAttempt(remoteAddress)) {
        sendJson(response, 429, { error: "too_many_attempts" });
        return;
      }
      try {
        const body = await readJsonBody(request);
        const token = pairing.pair(body.code);
        if (!token) {
          sendJson(response, 401, { error: "invalid_pairing_code" });
          return;
        }
        sendJson(response, 200, { token, expiresInSeconds: SESSION_TTL_MS / 1000 });
        console.log(`新的配对码: ${pairing.displayCode()}`);
      } catch {
        sendJson(response, 400, { error: "invalid_request" });
      }
      return;
    }

    if (!pairing.authorize(request.headers.authorization)) {
      sendJson(response, 401, { error: "not_paired" });
      return;
    }

    if (request.method === "GET" && url.pathname === "/v1/status") {
      sendJson(response, 200, collector.getStatus());
    } else if (request.method === "GET" && url.pathname === "/v1/records") {
      sendJson(response, 200, collector.getSnapshot());
    } else if (request.method === "POST" && url.pathname === "/v1/sync") {
      const started = collector.startSync();
      sendJson(response, started ? 202 : 200, { started, status: collector.getStatus() });
    } else if (request.method === "POST" && url.pathname === "/v1/experimental/records-direct") {
      if (!isLoopbackAddress(request.socket.remoteAddress)) {
        sendJson(response, 403, { error: "loopback_only" });
        return;
      }
      const started = collector.startDirectRecords();
      sendJson(response, started ? 202 : 200, { started, status: collector.getStatus() });
    } else if (request.method === "POST" && url.pathname === "/v1/observe") {
      const started = collector.startObservation();
      sendJson(response, started ? 202 : 200, { started, status: collector.getStatus() });
    } else if (request.method === "POST" && url.pathname === "/v1/observe/stop") {
      const stopped = await collector.stopObservation();
      sendJson(response, 200, { stopped, status: collector.getStatus() });
    } else if (request.method === "POST" && url.pathname === "/v1/account/switch") {
      try {
        const started = await collector.switchAccount();
        sendJson(response, started ? 202 : 200, { started, status: collector.getStatus() });
      } catch {
        sendJson(response, 500, { error: "account_switch_failed" });
      }
    } else if (request.method === "DELETE" && url.pathname === "/v1/records") {
      sendJson(response, 200, await collector.clearRecords());
    } else if (request.method === "POST" && url.pathname === "/v1/browser/close") {
      await collector.close();
      sendJson(response, 200, { ok: true });
    } else {
      sendJson(response, 404, { error: "not_found" });
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, bindAddress, resolve);
  });

  console.log(`本地采集服务: http://127.0.0.1:${options.port}`);
  if (options.lan) {
    for (const address of localLanAddresses()) console.log(`局域网地址: http://${address}:${options.port}`);
  }
  console.log(`配对码: ${pairing.displayCode()}`);
  console.log(`浏览器数据仅保存在: ${dataDirectory}`);

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    await collector.close();
    await new Promise((resolve) => server.close(resolve));
  };
  process.once("SIGINT", () => void shutdown().then(() => process.exit(0)));
  process.once("SIGTERM", () => void shutdown().then(() => process.exit(0)));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "采集服务启动失败。");
  process.exitCode = 1;
});
