import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { chromium } from "playwright-core";

import {
  DIRECT_FAVORITE_ENDPOINT,
  DIRECT_HISTORY_ENDPOINT,
  DIRECT_LIKED_ENDPOINT,
  DirectHistoryError,
  captureDirectHistoryTemplate,
  countMissingDirectHistoryViewTimes,
  collectDirectRecordPages,
  fetchDirectHistoryPage,
  invalidateDirectHistoryTemplate,
  loadDirectHistoryTemplate,
} from "./directHistory.mjs";
import { CollectorAdapterError, RecordAccumulator, matchDouyinEndpoint, mergeRecords } from "./normalizer.mjs";
import {
  createEndpointProgress,
  isEndpointComplete,
  recordEndpointMatch,
  recordEndpointResult,
} from "./progress.mjs";
import { normalizeDirectSyncState } from "./store.mjs";

const HOME_URL = "https://www.douyin.com/";
const SELF_PROFILE_URL = "https://www.douyin.com/user/self";
const LOGIN_COOKIE_NAMES = new Set(["sessionid", "sessionid_ss", "sid_tt", "sid_guard"]);
const REQUIRED_TYPES = ["watch_history", "liked_videos", "favorite_videos"];
const REQUIRED_PATHS = {
  watch_history: "/aweme/v1/web/history/read/",
  liked_videos: "/aweme/v1/web/aweme/favorite/",
  favorite_videos: "/aweme/v1/web/aweme/listcollection/",
};
const TYPE_LABELS = {
  watch_history: "观看历史",
  liked_videos: "点赞列表",
  favorite_videos: "收藏列表",
};
const MAX_LOGIN_WAIT_MS = 10 * 60 * 1000;
const MAX_RESPONSE_BYTES = 24 * 1024 * 1024;
const ENDPOINT_ACTIVATION_WAIT_MS = 8_000;
const RESPONSE_DRAIN_WAIT_MS = 12_000;
const RESPONSE_PROGRESS_SILENCE_MS = 20_000;
const RESPONSE_REPLAY_TIMEOUT_MS = 8_000;
const MANUAL_OBSERVATION_WARNING = "手动监听模式：仅保存你在独立浏览器中实际浏览到的数据，完整性不会自动验证。";
const DIRECT_COMPLETE_WARNING_PREFIX = "无界面读取完成：";

export function directContextLaunchOptions({ executablePath, userAgent, platform = process.platform }) {
  return {
    executablePath,
    // Incremental reads must not create a visible or taskbar Chrome window.
    // Chrome's new headless mode still provides the page runtime needed by
    // Douyin to generate signed list requests.
    headless: true,
    locale: "zh-CN",
    userAgent,
    viewport: { width: 1280, height: 900 },
    acceptDownloads: false,
    serviceWorkers: "block",
    args: [
      "--headless=new",
      "--window-size=1280,900",
    ],
  };
}

class CollectorCancelledError extends Error {
  constructor() {
    super("collector_cancelled");
    this.name = "CollectorCancelledError";
  }
}

function recordCounts(records) {
  return {
    watch_history: records.watch_history.length,
    liked_videos: records.liked_videos.length,
    favorite_videos: records.favorite_videos.length,
  };
}

function safeMessage(error, fallback) {
  if (error instanceof Error && error.message === "login_timeout") return "登录等待已超时，请重新同步。";
  if (error instanceof DirectHistoryError) return error.message;
  if (error instanceof CollectorAdapterError) return error.message;
  if (error instanceof Error && error.name === "TimeoutError") return "抖音网页加载超时，请检查网络后重试。";
  return fallback;
}

function mergeRecordList(type, existingRecords, fetchedRecords) {
  if (type !== "watch_history") return structuredClone(fetchedRecords);
  const fetchedById = new Map(fetchedRecords.map((record) => [record.id, record]));
  const existingIds = new Set(existingRecords.map((record) => record.id));
  return [
    ...fetchedRecords.filter((record) => !existingIds.has(record.id)),
    ...existingRecords.map((record) => {
      const fresh = fetchedById.get(record.id);
      return fresh ? mergeRecords(record, fresh) : record;
    }),
  ].sort((left, right) => {
    const leftTime = left.occurredAt ? Date.parse(left.occurredAt) : 0;
    const rightTime = right.occurredAt ? Date.parse(right.occurredAt) : 0;
    return rightTime - leftTime;
  });
}

function finalizeDirectType(type, incremental, existingRecords, fetchedRecords, knownIds, rejectedIds) {
  if (type === "watch_history") {
    return mergeRecordList(type, existingRecords, fetchedRecords);
  }
  if (!incremental) return structuredClone(fetchedRecords);

  const fetchedById = new Map(fetchedRecords.map((record) => [record.id, record]));
  return [
    ...fetchedRecords.filter((record) => !knownIds.has(record.id)),
    ...existingRecords
      .filter((record) => !rejectedIds.has(record.id))
      .map((record) => {
        const fresh = fetchedById.get(record.id);
        return fresh ? mergeRecords(record, fresh) : record;
      }),
  ];
}

async function readJsonWithReplay(response, fallbackPage, replayUrls) {
  try {
    return await response.json();
  } catch (initialError) {
    const request = typeof response.request === "function" ? response.request() : null;
    if (!request || request.method?.() !== "GET") throw initialError;

    let page = fallbackPage;
    try {
      page = request.frame?.().page?.() ?? fallbackPage;
    } catch {
      // Service-worker requests do not expose a frame; use the active profile page.
    }
    if (!page || typeof page.evaluate !== "function") throw initialError;

    const requestUrl = response.url();
    const rawHeaders = typeof request.allHeaders === "function"
      ? await request.allHeaders().catch(() => ({}))
      : {};
    const headers = Object.fromEntries(Object.entries(rawHeaders).filter(([name]) => (
      !/^(?:accept-encoding|connection|content-length|cookie|host|origin|referer|sec-|user-agent)/iu.test(name)
    )));

    replayUrls.add(requestUrl);
    try {
      const replay = await page.evaluate(async ({ url, requestHeaders, timeoutMs, maxBytes }) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const replayedResponse = await fetch(url, {
            method: "GET",
            headers: requestHeaders,
            credentials: "include",
            signal: controller.signal,
          });
          const declaredLength = Number(replayedResponse.headers.get("content-length") ?? 0);
          if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
            return { body: null, ok: replayedResponse.ok, status: replayedResponse.status, tooLarge: true };
          }
          const body = await replayedResponse.text();
          return {
            body,
            ok: replayedResponse.ok,
            status: replayedResponse.status,
            tooLarge: new TextEncoder().encode(body).byteLength > maxBytes,
          };
        } finally {
          clearTimeout(timeout);
        }
      }, {
        url: requestUrl,
        requestHeaders: headers,
        timeoutMs: RESPONSE_REPLAY_TIMEOUT_MS,
        maxBytes: MAX_RESPONSE_BYTES,
      });
      if (!replay.ok) {
        throw new CollectorAdapterError("http_error", `抖音网页响应重试返回 HTTP ${replay.status}。`);
      }
      if (replay.tooLarge) {
        throw new CollectorAdapterError("response_too_large", "抖音网页响应重试结果过大，已停止读取该页。");
      }
      try {
        return JSON.parse(replay.body);
      } catch {
        throw new CollectorAdapterError("invalid_json", "抖音网页响应重试未返回有效 JSON。");
      }
    } catch (replayError) {
      if (replayError instanceof CollectorAdapterError) throw replayError;
      throw initialError;
    } finally {
      replayUrls.delete(requestUrl);
    }
  }
}

async function firstVisible(locator, limit = 8) {
  const count = Math.min(await locator.count().catch(() => 0), limit);
  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index);
    if (await candidate.isVisible().catch(() => false)) return candidate;
  }
  return null;
}

async function clickFirstVisible(locator) {
  const count = Math.min(await locator.count().catch(() => 0), 8);
  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index);
    if (!await candidate.isVisible().catch(() => false)) continue;
    try {
      await candidate.click({ timeout: 5_000 });
      return true;
    } catch {
      // A covered or detached candidate should not prevent trying the next match.
    }
  }
  return false;
}

async function clickSemanticTarget(page, labels, {
  roles = ["tab", "link", "button", "menuitem"],
  allowText = false,
  timeoutMs = ENDPOINT_ACTIVATION_WAIT_MS,
} = {}) {
  const deadline = Date.now() + timeoutMs;
  do {
    for (const label of labels) {
      const locators = [
        ...roles.flatMap((role) => [
          page.getByRole(role, { name: label, exact: true }),
          page.getByRole(role, { name: label, exact: false }),
        ]),
        page.getByLabel(label, { exact: true }),
        page.getByTitle(label, { exact: true }),
      ];
      if (allowText) locators.push(page.getByText(label, { exact: true }));

      for (const locator of locators) {
        if (await clickFirstVisible(locator)) return true;
      }
    }
    if (Date.now() >= deadline) break;
    await delay(250);
  } while (true);
  return false;
}

async function clickProfileTabTarget(page, tab, labels, options = {}) {
  const targetedLocators = [
    page.locator(`[role="tab"][aria-controls="semiTabPanel${tab}"]`),
    page.locator(`[role="tab"][aria-controls$="${tab}"]`),
    page.locator(`a[href*="showTab=${tab}"]`),
  ];
  for (const locator of targetedLocators) {
    if (await clickFirstVisible(locator)) return true;
  }
  return clickSemanticTarget(page, labels, options);
}

async function isProfileTabSelected(page, tab) {
  const locators = [
    page.locator(`[role="tab"][aria-controls="semiTabPanel${tab}"]`),
    page.locator(`[role="tab"][aria-controls$="${tab}"]`),
  ];
  for (const locator of locators) {
    const count = Math.min(await locator.count().catch(() => 0), 4);
    for (let index = 0; index < count; index += 1) {
      const candidate = locator.nth(index);
      if (!await candidate.isVisible().catch(() => false)) continue;
      const selected = await candidate.evaluate((element) => {
        const ariaSelected = element.getAttribute("aria-selected");
        return ariaSelected === null
          ? /active|selected|current/u.test(String(element.className || ""))
          : ariaSelected === "true";
      }).catch(() => false);
      if (selected) return true;
    }
  }
  return false;
}

export function normalizeOwnProfileUrl(value) {
  try {
    const url = new URL(value, HOME_URL);
    if (url.protocol !== "https:" || !["douyin.com", "www.douyin.com"].includes(url.hostname)) return null;
    const match = url.pathname.match(/^\/user\/([^/?#]+)\/?$/u);
    if (!match || match[1] === "self") return null;
    url.hostname = "www.douyin.com";
    url.pathname = `/user/${match[1]}`;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function profileTabUrl(profileUrl, tab) {
  const normalized = normalizeOwnProfileUrl(profileUrl);
  if (!normalized || !["record", "like", "favorite_collection", "favorite_folder"].includes(tab)) return null;
  const url = new URL(normalized);
  url.searchParams.set("showTab", tab);
  return url.toString();
}

async function findOwnProfileLink(page) {
  for (const label of ["我的", "我的主页", "个人主页", "进入个人主页"]) {
    const candidates = [
      page.getByRole("link", { name: label, exact: true }),
      page.getByRole("link", { name: label, exact: false }),
      page.locator('a[href*="/user/"]').filter({ hasText: label }),
    ];
    for (const locator of candidates) {
      const candidate = await firstVisible(locator);
      if (!candidate) continue;
      const href = await candidate.getAttribute("href").catch(() => null);
      const normalized = normalizeOwnProfileUrl(href);
      if (normalized) return normalized;
    }
  }
  return null;
}

async function hasVisibleLoginControl(page) {
  if (!page || page.isClosed()) return false;
  for (const role of ["button", "link"]) {
    const candidate = await firstVisible(page.getByRole(role, { name: "登录", exact: true }), 4);
    if (candidate) return true;
  }
  return false;
}

async function clearNonCredentialWebCaches(context, page) {
  if (typeof context?.newCDPSession !== "function") return;
  const session = await context.newCDPSession(page).catch(() => null);
  if (!session) return;
  try {
    await session.send("Network.clearBrowserCache").catch(() => undefined);
    for (const origin of ["https://www.douyin.com", "https://douyin.com"]) {
      await session.send("Storage.clearDataForOrigin", {
        origin,
        storageTypes: "cache_storage,indexeddb,service_workers",
      }).catch(() => undefined);
    }
  } finally {
    await session.detach().catch(() => undefined);
  }
}

async function captureVisualSurfaceBaseline(page, targetTab) {
  return page.evaluate((expectedTab) => {
    const panel = document.getElementById(`semiTabPanel${expectedTab}`);
    const reset = () => {
      window.__douyinCollectorVisualBaseline = new Set();
      return 0;
    };
    if (!panel) return reset();
    const rect = panel.getBoundingClientRect();
    const style = window.getComputedStyle(panel);
    if (
      panel.hidden
      || panel.getAttribute("aria-hidden") === "true"
      || style.display === "none"
      || style.visibility === "hidden"
      || Number(style.opacity) === 0
      || rect.width < 80
      || rect.height < 80
    ) return reset();

    const left = Math.max(8, rect.left);
    const right = Math.min(window.innerWidth - 8, rect.right);
    const top = Math.max(8, rect.top);
    const bottom = Math.min(window.innerHeight - 8, rect.bottom);
    if (right - left < 80 || bottom - top < 80) return reset();

    const hits = new Set();
    for (const xRatio of [0.15, 0.4, 0.65, 0.88]) {
      for (const yRatio of [0.18, 0.42, 0.68, 0.88]) {
        const x = left + (right - left) * xRatio;
        const y = top + (bottom - top) * yRatio;
        const topHit = document.elementsFromPoint(x, y)
          .find((element) => element === panel || panel.contains(element));
        if (topHit) hits.add(topHit);
      }
    }
    window.__douyinCollectorVisualBaseline = hits;
    return hits.size;
  }, targetTab).catch(() => 0);
}

async function resolveActiveVisualSurface(page, targetTab) {
  const result = await page.evaluate((expectedTab) => {
    document.querySelectorAll('[data-douyin-collector-surface="active"]')
      .forEach((element) => element.removeAttribute("data-douyin-collector-surface"));

    const panel = document.getElementById(`semiTabPanel${expectedTab}`);
    if (!panel) return { resolved: false, candidateCount: 0 };
    const isWritableScrollSurface = (element, requireOverflow = true) => {
      const style = window.getComputedStyle(element);
      const maximum = element.scrollHeight - element.clientHeight;
      if (maximum <= 80 || (requireOverflow && !/auto|scroll|overlay/u.test(style.overflowY))) return false;
      const before = element.scrollTop;
      const probe = before < maximum - 1 ? before + 1 : Math.max(0, before - 1);
      element.scrollTop = probe;
      const writable = Math.abs(element.scrollTop - before) > 0.5;
      element.scrollTop = before;
      return writable;
    };
    const findFallbackScrollSurface = () => {
      for (let current = panel.parentElement; current; current = current.parentElement) {
        if (isWritableScrollSurface(current)) return current;
      }
      const documentSurface = document.scrollingElement;
      return documentSurface && isWritableScrollSurface(documentSurface, false) ? documentSurface : null;
    };
    const panelRect = panel.getBoundingClientRect();
    const panelStyle = window.getComputedStyle(panel);
    if (
      panel.hidden
      || panel.getAttribute("aria-hidden") === "true"
      || panelStyle.display === "none"
      || panelStyle.visibility === "hidden"
      || Number(panelStyle.opacity) === 0
    ) return { resolved: false, candidateCount: 0 };

    const panelHasBox = panelRect.width >= 80 && panelRect.height >= 80;
    const forcedFallback = panelHasBox ? null : findFallbackScrollSurface();
    if (!panelHasBox && !forcedFallback) return { resolved: false, candidateCount: 0 };
    const samplingRect = forcedFallback?.getBoundingClientRect() ?? panelRect;
    const left = Math.max(8, samplingRect.left);
    const right = Math.min(window.innerWidth - 8, samplingRect.right);
    const top = Math.max(8, samplingRect.top);
    const bottom = Math.min(window.innerHeight - 8, samplingRect.bottom);
    if (right - left < 80 || bottom - top < 80) return { resolved: false, candidateCount: 0 };

    const baseline = window.__douyinCollectorVisualBaseline instanceof Set
      ? window.__douyinCollectorVisualBaseline
      : new Set();
    const visibleThroughAncestors = (element) => {
      for (let current = element; current; current = current.parentElement) {
        const style = window.getComputedStyle(current);
        if (current.hidden || current.inert || current.getAttribute("aria-hidden") === "true"
          || style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
      }
      return typeof element.checkVisibility === "function"
        ? element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
        : true;
    };
    const candidates = new Map();
    for (const xRatio of [0.12, 0.34, 0.58, 0.82, 0.94]) {
      for (const yRatio of [0.16, 0.38, 0.62, 0.84, 0.94]) {
        const point = {
          x: left + (right - left) * xRatio,
          y: top + (bottom - top) * yRatio,
        };
        const topHit = document.elementsFromPoint(point.x, point.y)
          .find((element) => !["HTML", "BODY"].includes(element.tagName));
        if (!topHit || !panel.contains(topHit) || !visibleThroughAncestors(topHit)) continue;

        let surface = null;
        for (let current = topHit; current && panel.contains(current); current = current.parentElement) {
          if (isWritableScrollSurface(current)) {
            surface = current;
            break;
          }
        }
        if (!surface) continue;
        const evidence = candidates.get(surface) ?? { hits: 0, newHits: 0 };
        evidence.hits += 1;
        if (!baseline.has(topHit)) evidence.newHits += 1;
        candidates.set(surface, evidence);
      }
    }

    const ranked = [...candidates.entries()].sort((leftEntry, rightEntry) =>
      rightEntry[1].newHits - leftEntry[1].newHits || rightEntry[1].hits - leftEntry[1].hits);
    let winner = forcedFallback ? [forcedFallback, {
      hits: 1,
      newHits: 1,
    }] : ranked[0];
    if (!forcedFallback && (!winner || winner[1].hits < 2 || (baseline.size > 0 && winner[1].newHits < 1))) {
      const fallback = findFallbackScrollSurface();
      if (!fallback) return { resolved: false, candidateCount: ranked.length };
      winner = [fallback, {
        hits: 1,
        newHits: 1,
      }];
    }
    const [surface, evidence] = winner;
    const rect = surface.getBoundingClientRect();
    surface.setAttribute("data-douyin-collector-surface", "active");
    return {
      resolved: true,
      candidateCount: ranked.length,
      hits: evidence.hits,
      newHits: evidence.newHits,
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      remaining: Math.max(0, surface.scrollHeight - surface.clientHeight - surface.scrollTop),
    };
  }, targetTab).catch(() => null);
  return result && typeof result === "object"
    ? result
    : { resolved: false, candidateCount: 0 };
}

async function scrollResolvedVisualSurface(page) {
  const result = await page.evaluate(() => {
    const surface = document.querySelector('[data-douyin-collector-surface="active"]');
    if (!surface) return { resolved: false, moved: false, atBottom: true };
    const before = surface.scrollTop;
    surface.scrollTop = surface.scrollHeight;
    const maximum = surface.scrollHeight - surface.clientHeight;
    return {
      resolved: true,
      moved: Math.abs(surface.scrollTop - before) > 1,
      atBottom: maximum - surface.scrollTop <= 2,
    };
  }).catch(() => null);
  return result ?? { resolved: false, moved: false, atBottom: true };
}

async function clickLoadMoreInResolvedVisualSurface(page) {
  return page.evaluate(() => {
    const surface = document.querySelector('[data-douyin-collector-surface="active"]');
    if (!surface) return false;
    const labels = new Set(["加载更多", "查看更多", "继续加载"]);
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0
        && rect.height > 0
        && rect.bottom > 0
        && rect.top < window.innerHeight
        && style.display !== "none"
        && style.visibility !== "hidden"
        && style.pointerEvents !== "none";
    };
    const control = [surface, ...surface.querySelectorAll('button, a, [role="button"]')]
      .find((element) => {
        if (!(element instanceof HTMLElement) || element.hasAttribute("disabled") || !visible(element)) return false;
        const names = [element.textContent, element.getAttribute("aria-label"), element.getAttribute("title")]
          .map((value) => value?.trim())
          .filter(Boolean);
        return names.some((name) => labels.has(name));
      });
    if (!control) return false;
    control.click();
    return true;
  }).catch(() => false);
}

export class DouyinCollector {
  constructor({ executablePath, dataDirectory, signerDirectory, store }) {
    this.executablePath = executablePath;
    this.dataDirectory = dataDirectory;
    this.signerDirectory = signerDirectory;
    this.profileDirectory = path.join(dataDirectory, "browser-profile");
    this.store = store;
    this.context = null;
    this.syncPromise = null;
    this.syncStopRequested = false;
    this.observation = null;
    this.observationPromise = null;
    this.accountSwitchPromise = null;
    this.syncRunId = 0;
    this.snapshot = null;
    this.status = {
      state: "idle",
      phase: null,
      message: "等待同步",
      counts: recordCounts({ watch_history: [], liked_videos: [], favorite_videos: [] }),
      updatedAt: null,
      browserOpen: false,
    };
  }

  async initialize() {
    this.snapshot = await this.store.load();
    this.updateStatus({
      counts: recordCounts(this.snapshot.records),
      updatedAt: this.snapshot.updatedAt,
    });
  }

  updateStatus(patch) {
    this.status = { ...this.status, ...patch };
  }

  getStatus() {
    return structuredClone(this.status);
  }

  getSnapshot() {
    return structuredClone(this.snapshot);
  }

  async clearRecords() {
    await this.stopObservation({ silent: true });
    this.snapshot = await this.store.clear();
    this.updateStatus({
      state: "idle",
      phase: null,
      message: "本地记录已清除",
      counts: recordCounts(this.snapshot.records),
      updatedAt: this.snapshot.updatedAt,
    });
    return this.getSnapshot();
  }

  startSync({ allowAccountSwitch = false, mode = "page" } = {}) {
    if (this.syncPromise || this.observationPromise || (this.accountSwitchPromise && !allowAccountSwitch)) return false;
    this.syncStopRequested = false;
    const runId = this.syncRunId + 1;
    this.syncRunId = runId;
    this.updateStatus({
      state: mode === "direct_records" ? "collecting" : "launching_browser",
      phase: mode === "direct_records" ? "watch_history" : null,
      message: mode === "direct_records" ? "正在直接读取观看、点赞和收藏记录" : "正在准备同步",
    });
    const promise = (mode === "direct_records" ? this.runDirectRecords(runId) : this.runSync(runId))
      .catch((error) => {
        if (error instanceof CollectorCancelledError || runId !== this.syncRunId) return;
        this.updateStatus({
          state: "error",
          phase: null,
          message: safeMessage(error, mode === "direct_records"
            ? "记录直接读取失败。"
            : "采集失败，请关闭浏览器后重试。"),
        });
      })
      .finally(() => {
        if (this.syncPromise === promise) this.syncPromise = null;
      });
    this.syncPromise = promise;
    return true;
  }

  stopSync({ silent = false } = {}) {
    const promise = this.syncPromise;
    if (!promise || this.syncStopRequested) return false;

    this.syncStopRequested = true;
    const cancellationRunId = this.syncRunId + 1;
    this.syncRunId = cancellationRunId;
    if (!silent) {
      this.updateStatus({
        state: "collecting",
        phase: null,
        message: "正在停止读取",
      });
    }

    void promise.finally(() => {
      this.syncStopRequested = false;
      if (silent || this.syncRunId !== cancellationRunId) return;
      this.updateStatus({
        state: "idle",
        phase: null,
        message: "已停止读取，已保留上次保存的记录",
        counts: recordCounts(this.snapshot.records),
        updatedAt: this.snapshot.updatedAt,
        browserOpen: Boolean(this.context),
      });
    });
    return true;
  }

  startDirectRecords() {
    return this.startSync({ mode: "direct_records" });
  }

  startObservation({ allowAccountSwitch = false } = {}) {
    if (this.syncPromise || this.observationPromise || (this.accountSwitchPromise && !allowAccountSwitch)) return false;
    const runId = this.syncRunId + 1;
    this.syncRunId = runId;
    let releaseStop;
    const observation = {
      active: true,
      runId,
      stop: () => releaseStop?.(),
      stopPromise: new Promise((resolve) => {
        releaseStop = resolve;
      }),
    };
    this.observation = observation;
    this.updateStatus({
      state: "launching_browser",
      phase: null,
      message: "正在打开独立抖音浏览器以监听手动浏览",
    });
    const promise = this.runObservation(runId, observation)
      .catch((error) => {
        if (error instanceof CollectorCancelledError || !observation.active || runId !== this.syncRunId) return;
        this.updateStatus({
          state: "error",
          phase: null,
          message: safeMessage(error, "手动监听启动失败，请关闭浏览器后重试。"),
        });
      })
      .finally(() => {
        if (this.observation === observation) this.observation = null;
        if (this.observationPromise === promise) this.observationPromise = null;
      });
    this.observationPromise = promise;
    return true;
  }

  async stopObservation({ silent = false } = {}) {
    const observation = this.observation;
    const promise = this.observationPromise;
    if (!observation || !promise) return false;
    observation.active = false;
    this.syncRunId += 1;
    observation.stop();
    await promise.catch(() => undefined);
    if (!silent) {
      this.updateStatus({
        state: "idle",
        phase: null,
        message: "已停止手动监听，已保存已捕获的记录",
        counts: recordCounts(this.snapshot.records),
        updatedAt: this.snapshot.updatedAt,
        browserOpen: Boolean(this.context),
      });
    }
    return true;
  }

  async runObservation(runId, observation) {
    const context = await this.ensureBrowser();
    this.assertSyncActive(runId);
    let page = await this.currentPage(context);
    if (!normalizeOwnProfileUrl(page.url()) && !new URL(page.url()).hostname.endsWith("douyin.com")) {
      await this.visit(page, HOME_URL, runId);
    }
    await this.waitForLogin(context, page, runId);
    this.assertSyncActive(runId);

    const accumulator = new RecordAccumulator(this.snapshot.records);
    const pendingResponses = new Set();
    const processingChains = new Map();
    const replayUrls = new Set();
    let persistChain = Promise.resolve();
    let capturedResponses = 0;
    let acceptingResponses = true;

    const persistSnapshot = () => {
      persistChain = persistChain.then(async () => {
        if (!observation.active || runId !== this.syncRunId) return;
        const warnings = [...new Set([
          ...this.snapshot.warnings.filter((warning) => warning !== MANUAL_OBSERVATION_WARNING),
          MANUAL_OBSERVATION_WARNING,
        ])];
        this.snapshot = await this.store.save(accumulator.snapshot().records, warnings, {
          directSync: normalizeDirectSyncState(this.snapshot.directSync),
        });
        if (!observation.active || runId !== this.syncRunId) return;
        this.updateStatus({
          counts: recordCounts(this.snapshot.records),
          updatedAt: this.snapshot.updatedAt,
          message: `正在监听手动浏览，已捕获 ${capturedResponses} 个网页响应`,
        });
      });
      return persistChain;
    };

    const handleResponse = (response) => {
      if (!acceptingResponses || !observation.active || runId !== this.syncRunId) return;
      const endpoint = matchDouyinEndpoint(response.url());
      if (!endpoint) return;
      if (replayUrls.has(response.url())) return;
      const previous = processingChains.get(endpoint.pathname) ?? Promise.resolve();
      let task;
      task = previous.catch(() => undefined).then(async () => {
        if (!observation.active || runId !== this.syncRunId) return;
        if (!response.ok()) throw new CollectorAdapterError("http_error", `抖音网页请求返回 HTTP ${response.status()}。`);
        const declaredLength = Number(response.headers()["content-length"] ?? 0);
        if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
          throw new CollectorAdapterError("response_too_large", "抖音网页响应过大，已停止读取该页。");
        }
        const payload = await readJsonWithReplay(response, page, replayUrls);
        if (!observation.active || runId !== this.syncRunId) return;
        accumulator.addResponse(endpoint, payload);
        capturedResponses += 1;
        await persistSnapshot();
      }).catch(() => undefined).finally(() => {
        pendingResponses.delete(task);
        if (processingChains.get(endpoint.pathname) === task) processingChains.delete(endpoint.pathname);
      });
      processingChains.set(endpoint.pathname, task);
      pendingResponses.add(task);
    };

    context.on("response", handleResponse);
    this.updateStatus({
      state: "observing",
      phase: null,
      message: "正在监听手动浏览，请在独立浏览器中自行打开观看历史、喜欢和收藏",
      browserOpen: true,
    });
    await observation.stopPromise;
    acceptingResponses = false;
    context.off("response", handleResponse);
    await Promise.allSettled([...pendingResponses]);
    await persistChain;
  }

  assertSyncActive(runId) {
    if (runId !== this.syncRunId) throw new CollectorCancelledError();
  }

  async ensureBrowser() {
    if (this.context) return this.context;

    this.updateStatus({ state: "launching_browser", message: "正在打开独立抖音浏览器", browserOpen: false });
    this.context = await chromium.launchPersistentContext(this.profileDirectory, {
      executablePath: this.executablePath,
      headless: false,
      locale: "zh-CN",
      viewport: { width: 1280, height: 900 },
      acceptDownloads: false,
    });
    this.context.on("close", () => {
      this.context = null;
      if (this.observation?.active) {
        this.observation.active = false;
        this.observation.stop();
      }
      this.updateStatus({
        state: this.status.state === "observing" ? "idle" : this.status.state,
        phase: this.status.state === "observing" ? null : this.status.phase,
        message: this.status.state === "observing" ? "独立浏览器已关闭，手动监听已停止" : this.status.message,
        browserOpen: false,
      });
    });
    this.updateStatus({ browserOpen: true });
    return this.context;
  }

  async currentPage(context) {
    const existing = context.pages().find((page) => !page.isClosed());
    return existing ?? context.newPage();
  }

  async hasLoginSession(context, page) {
    const cookies = await context.cookies(HOME_URL);
    const hasCookie = cookies.some((cookie) => LOGIN_COOKIE_NAMES.has(cookie.name) && cookie.value.length > 0);
    return hasCookie && !await hasVisibleLoginControl(page);
  }

  async waitForLogin(context, page, runId) {
    this.assertSyncActive(runId);
    if (await this.hasLoginSession(context, page)) return;

    this.updateStatus({
      state: "awaiting_login",
      phase: null,
      message: "请在独立浏览器中登录抖音，登录后会自动继续",
    });
    const deadline = Date.now() + MAX_LOGIN_WAIT_MS;
    while (Date.now() < deadline) {
      this.assertSyncActive(runId);
      if (page.isClosed()) page = await this.currentPage(context);
      if (await this.hasLoginSession(context, page)) return;
      await delay(1_500);
    }
    this.assertSyncActive(runId);
    if (page.isClosed()) page = await this.currentPage(context);
    if (await this.hasLoginSession(context, page)) return;
    throw new Error("login_timeout");
  }

  async visit(page, url, runId) {
    this.assertSyncActive(runId);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await delay(1_500);
    this.assertSyncActive(runId);
  }

  async resolveOwnProfileUrl(page, runId) {
    const current = normalizeOwnProfileUrl(page.url());
    if (current) return current;

    await this.visit(page, HOME_URL, runId);
    let profileUrl = await findOwnProfileLink(page);
    if (profileUrl) return profileUrl;

    await clickSemanticTarget(page, ["我的", "我的主页", "个人主页"], {
      roles: ["link", "button", "menuitem"],
      allowText: true,
      timeoutMs: 4_000,
    });
    await delay(750);
    this.assertSyncActive(runId);
    for (const candidatePage of [...page.context().pages()].reverse()) {
      profileUrl = normalizeOwnProfileUrl(candidatePage.url()) ?? await findOwnProfileLink(candidatePage);
      if (profileUrl) return profileUrl;
    }

    await this.visit(page, SELF_PROFILE_URL, runId);
    return normalizeOwnProfileUrl(page.url()) ?? await findOwnProfileLink(page);
  }

  async waitForVersionAdvance(responseVersions, kind, before, runId, timeoutMs = ENDPOINT_ACTIVATION_WAIT_MS) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      this.assertSyncActive(runId);
      if ((responseVersions.get(kind) ?? 0) > before) return true;
      await delay(200);
    }
    return (responseVersions.get(kind) ?? 0) > before;
  }

  async scrollUntilIdle(
    page,
    responseVersions,
    kinds,
    runId,
    terminalProgresses = [],
    maxSteps = Number.POSITIVE_INFINITY,
    targetTab = null,
    timing = {},
  ) {
    const now = timing.now ?? Date.now;
    const wait = timing.wait ?? delay;
    const responseSilenceTimeoutMs = timing.responseSilenceTimeoutMs ?? RESPONSE_PROGRESS_SILENCE_MS;
    let lastVersion = kinds.reduce((sum, kind) => sum + (responseVersions.get(kind) ?? 0), 0);
    let lastResponseProgressAt = now();
    let idleSteps = 0;
    let lastLoadMoreVersion = null;

    const recordVersionProgress = () => {
      const version = kinds.reduce((sum, kind) => sum + (responseVersions.get(kind) ?? 0), 0);
      const advanced = version !== lastVersion;
      if (advanced) {
        lastVersion = version;
        lastResponseProgressAt = now();
        idleSteps = 0;
      }
      return advanced;
    };
    const stopAfterResponseSilence = () => {
      if (now() - lastResponseProgressAt < responseSilenceTimeoutMs) return false;
      for (const progress of terminalProgresses) progress.responseProgressStalled = true;
      return true;
    };

    if (!targetTab) {
      for (const progress of terminalProgresses) progress.visualSurfaceMissing = true;
      return;
    }

    for (let step = 0; step < maxSteps && idleSteps < 8; step += 1) {
      this.assertSyncActive(runId);
      recordVersionProgress();
      if (stopAfterResponseSilence()) break;
      const activeProgresses = terminalProgresses.filter((progress) => progress.matchedCount > 0);
      if (activeProgresses.length > 0 && activeProgresses.every((progress) => isEndpointComplete(progress))) break;
      if (activeProgresses.some((progress) => (
        progress.cursorStalled || progress.paginationMissing || progress.repeatedPageFingerprint
      ))) break;
      if (activeProgresses.some((progress) => progress.processedCount < progress.matchedCount)) {
        await wait(250);
        continue;
      }

      let visualResult = await scrollResolvedVisualSurface(page)
        .catch(() => ({ resolved: false, moved: false, atBottom: true }));
      if (!visualResult.resolved) {
        const visualSurface = await resolveActiveVisualSurface(page, targetTab);
        if (!visualSurface.resolved) {
          for (const progress of terminalProgresses) progress.visualSurfaceMissing = true;
          break;
        }
        visualResult = await scrollResolvedVisualSurface(page)
          .catch(() => ({ resolved: false, moved: false, atBottom: true }));
        if (!visualResult.resolved) {
          for (const progress of terminalProgresses) progress.visualSurfaceMissing = true;
          break;
        }
      }

      const loadedMore = visualResult.atBottom
        && !visualResult.moved
        && lastLoadMoreVersion !== lastVersion
        ? await clickLoadMoreInResolvedVisualSurface(page)
        : false;
      if (loadedMore) lastLoadMoreVersion = lastVersion;
      await wait(900);
      this.assertSyncActive(runId);
      const advanced = recordVersionProgress();
      if (!advanced) {
        idleSteps = visualResult.moved || loadedMore ? 0 : idleSteps + 1;
      }
      if (stopAfterResponseSilence()) break;
    }
  }

  async collectPhase(page, responseVersions, phase, runId, terminalProgresses) {
    const before = responseVersions.get(phase) ?? 0;
    let fallbackLabels = [];
    let targetUrl = null;
    let targetTab = null;

    if (phase === "watch_history") {
      fallbackLabels = ["观看历史", "历史记录", "浏览记录"];
      targetTab = "record";
      const profileUrl = await this.resolveOwnProfileUrl(page, runId);
      targetUrl = profileTabUrl(profileUrl, targetTab) ?? `${SELF_PROFILE_URL}?showTab=${targetTab}`;
      const neutralUrl = profileTabUrl(profileUrl, "like") ?? `${SELF_PROFILE_URL}?showTab=like`;
      await this.visit(page, neutralUrl, runId);
      if (!await isProfileTabSelected(page, "like")) {
        await clickProfileTabTarget(page, "like", ["喜欢", "点赞"], {
          roles: ["tab", "link", "button", "menuitem"],
          allowText: true,
          timeoutMs: 4_000,
        });
        await delay(1_000);
        this.assertSyncActive(runId);
      }
      await captureVisualSurfaceBaseline(page, "like");
      await clickProfileTabTarget(page, targetTab, fallbackLabels, {
        allowText: true,
        timeoutMs: 5_000,
      });
    } else {
      targetTab = phase === "liked_videos" ? "like" : "favorite_collection";
      fallbackLabels = phase === "liked_videos"
        ? ["喜欢", "点赞"]
        : ["收藏", "收藏作品", "收藏视频", "收藏夹"];
      const profileUrl = await this.resolveOwnProfileUrl(page, runId);
      const neutralTab = "record";
      const neutralUrl = profileTabUrl(profileUrl, neutralTab) ?? `${SELF_PROFILE_URL}?showTab=${neutralTab}`;
      targetUrl = profileTabUrl(profileUrl, targetTab) ?? `${SELF_PROFILE_URL}?showTab=${targetTab}`;
      await this.visit(page, neutralUrl, runId);
      if (!await isProfileTabSelected(page, neutralTab)) {
        const neutralLabels = neutralTab === "record"
          ? ["观看历史", "历史记录", "浏览记录"]
          : ["收藏", "收藏作品", "收藏视频"];
        await clickProfileTabTarget(page, neutralTab, neutralLabels, {
          roles: ["tab", "link", "button", "menuitem"],
          allowText: true,
          timeoutMs: 4_000,
        });
        await delay(1_000);
        this.assertSyncActive(runId);
      }
      await captureVisualSurfaceBaseline(page, neutralTab);
      if (!await isProfileTabSelected(page, targetTab) || (responseVersions.get(phase) ?? 0) === before) {
        await clickProfileTabTarget(page, targetTab, fallbackLabels, {
          roles: ["tab", "link", "button", "menuitem"],
          allowText: true,
        });
      }
    }

    let advanced = await this.waitForVersionAdvance(responseVersions, phase, before, runId);
    let selected = targetTab ? await isProfileTabSelected(page, targetTab) : false;
    if (!advanced || !selected) {
      await clickProfileTabTarget(page, targetTab, fallbackLabels, {
        roles: ["tab", "link", "button", "menuitem"],
        allowText: true,
        timeoutMs: 4_000,
      });
      advanced = advanced || await this.waitForVersionAdvance(responseVersions, phase, before, runId, 3_000);
      selected = await isProfileTabSelected(page, targetTab);
    }
    if ((!advanced || !selected) && targetUrl) {
      await this.visit(page, targetUrl, runId);
      if (!await isProfileTabSelected(page, targetTab)) {
        await clickProfileTabTarget(page, targetTab, fallbackLabels, {
          roles: ["tab", "link", "button", "menuitem"],
          allowText: true,
          timeoutMs: 4_000,
        });
      }
      advanced = await this.waitForVersionAdvance(responseVersions, phase, before, runId, 5_000);
      selected = await isProfileTabSelected(page, targetTab);
    }
    if ((!advanced || !selected) && targetUrl && typeof page.reload === "function") {
      await page.reload({ waitUntil: "domcontentloaded", timeout: 45_000 });
      await delay(1_500);
      this.assertSyncActive(runId);
      if (!await isProfileTabSelected(page, targetTab)) {
        await clickProfileTabTarget(page, targetTab, fallbackLabels, {
          roles: ["tab", "link", "button", "menuitem"],
          allowText: true,
          timeoutMs: 4_000,
        });
      }
      await this.waitForVersionAdvance(responseVersions, phase, before, runId, 4_000);
    }
    const kinds = [phase];
    await resolveActiveVisualSurface(page, targetTab);
    await this.scrollUntilIdle(
      page,
      responseVersions,
      kinds,
      runId,
      terminalProgresses,
      Number.POSITIVE_INFINITY,
      targetTab,
    );
  }

  async runSync(runId) {
    this.assertSyncActive(runId);
    const context = await this.ensureBrowser();
    this.assertSyncActive(runId);
    let page = await this.currentPage(context);
    await clearNonCredentialWebCaches(context, page);
    await this.visit(page, HOME_URL, runId);
    await this.waitForLogin(context, page, runId);
    this.assertSyncActive(runId);
    page = await this.currentPage(context);
    const browserUserAgent = typeof page.evaluate === "function"
      ? await page.evaluate(() => navigator.userAgent)
      : null;

    const accumulator = new RecordAccumulator();
    const responseVersions = new Map();
    const primaryProgress = new Map(REQUIRED_TYPES.map((type) => [type, createEndpointProgress()]));
    const sampleIds = new Map(REQUIRED_TYPES.map((type) => [type, []]));
    const sampledIdSets = new Map(REQUIRED_TYPES.map((type) => [type, new Set()]));
    const activeProgressByPath = new Map();
    const responseErrors = [];
    const pendingResponses = new Set();
    const processingChains = new Map();
    const replayUrls = new Set();
    let lastResponseAt = 0;
    let acceptingResponses = true;

    const drainPendingResponses = async () => {
      const deadline = Date.now() + RESPONSE_DRAIN_WAIT_MS;
      while (Date.now() < deadline) {
        this.assertSyncActive(runId);
        const batch = [...pendingResponses];
        if (batch.length > 0) {
          const remaining = Math.max(1, deadline - Date.now());
          await Promise.race([
            Promise.allSettled(batch),
            delay(Math.min(1_000, remaining)),
          ]);
        }
        const quietFor = lastResponseAt === 0 ? Number.POSITIVE_INFINITY : Date.now() - lastResponseAt;
        if (pendingResponses.size === 0 && quietFor >= 600) return true;
        await delay(Math.min(250, Math.max(50, 600 - quietFor)));
      }
      return pendingResponses.size === 0;
    };

    const handleResponse = (response) => {
      if (!acceptingResponses || runId !== this.syncRunId) return;
      const endpoint = matchDouyinEndpoint(response.url());
      if (!endpoint) return;
      if (replayUrls.has(response.url())) return;
      const progress = activeProgressByPath.get(endpoint.pathname);
      if (!progress) return;
      lastResponseAt = Date.now();
      responseVersions.set(endpoint.kind, (responseVersions.get(endpoint.kind) ?? 0) + 1);
      recordEndpointMatch(progress);
      const previous = processingChains.get(endpoint.pathname) ?? Promise.resolve();
      let task;
      task = previous.catch(() => undefined).then(async () => {
        if (!response.ok()) throw new CollectorAdapterError("http_error", `抖音网页请求返回 HTTP ${response.status()}。`);
        const declaredLength = Number(response.headers()["content-length"] ?? 0);
        if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
          throw new CollectorAdapterError("response_too_large", "抖音网页响应过大，已停止读取该页。");
        }
        const payload = await readJsonWithReplay(response, page, replayUrls);
        this.assertSyncActive(runId);
        if (!acceptingResponses) return;
        const normalized = accumulator.addResponse(endpoint, payload);
        if (endpoint.kind === "watch_history") {
          const request = typeof response.request === "function" ? response.request() : null;
          await captureDirectHistoryTemplate(this.dataDirectory, request, browserUserAgent).catch(() => false);
        }
        const ids = sampleIds.get(endpoint.kind);
        const seen = sampledIdSets.get(endpoint.kind);
        for (const id of normalized.recordIds ?? []) {
          if (!seen.has(id)) {
            seen.add(id);
            ids.push(id);
          }
        }
        recordEndpointResult(progress, normalized.pagination, normalized);
        this.updateStatus({ counts: recordCounts(accumulator.snapshot().records) });
      }).catch((error) => {
        if (error instanceof CollectorCancelledError || runId !== this.syncRunId) return;
        responseErrors.push(safeMessage(error, "抖音响应读取失败。"));
      }).finally(() => {
        pendingResponses.delete(task);
        if (processingChains.get(endpoint.pathname) === task) processingChains.delete(endpoint.pathname);
      });
      processingChains.set(endpoint.pathname, task);
      pendingResponses.add(task);
    };

    context.on("response", handleResponse);
    const phaseWarnings = [];

    try {
      for (const phase of REQUIRED_TYPES) {
        this.assertSyncActive(runId);
        page = await this.currentPage(context);
        this.updateStatus({
          state: "collecting",
          phase,
          message: phase === "watch_history"
            ? "正在读取观看历史"
            : phase === "liked_videos"
              ? "正在读取点赞列表"
              : "正在读取收藏列表",
        });
        const progress = primaryProgress.get(phase);
        activeProgressByPath.set(REQUIRED_PATHS[phase], progress);
        await this.collectPhase(page, responseVersions, phase, runId, [progress]).catch((error) => {
          if (error instanceof CollectorCancelledError) throw error;
          phaseWarnings.push(safeMessage(error, "页面操作失败。"));
        });
        await drainPendingResponses();
        activeProgressByPath.delete(REQUIRED_PATHS[phase]);
      }

      const drained = await drainPendingResponses();
      acceptingResponses = false;
      if (!drained) phaseWarnings.push("部分抖音响应读取超时，本次结果按不完整数据处理。");

      const completeTypes = new Set();
      for (const type of REQUIRED_TYPES) {
        const progress = primaryProgress.get(type);
        if (isEndpointComplete(progress)) completeTypes.add(type);
      }

      const addProgressWarnings = (label, progress, { required = true } = {}) => {
        if (progress.matchedCount === 0) {
          if (required && !progress.verifiedEmpty) phaseWarnings.push(`${label}未捕获到网页响应。`);
          if (progress.responseProgressStalled) phaseWarnings.push(`${label}长时间没有新的网页响应，已停止继续滚动。`);
          return;
        }
        if (progress.processedCount < progress.matchedCount) {
          phaseWarnings.push(`${label}部分网页响应未能读取。`);
        }
        if (progress.visualSurfaceMissing) {
          phaseWarnings.push(`${label}未继续滚动，已使用当前读取到的 ${progress.uniqueAddedCount} 条。`);
        }
        if (progress.responseProgressStalled) {
          phaseWarnings.push(`${label}长时间没有新的网页响应，已停止继续滚动并使用当前结果。`);
        }
      };

      for (const type of REQUIRED_TYPES) {
        addProgressWarnings(TYPE_LABELS[type], primaryProgress.get(type));
      }

      const normalized = accumulator.snapshot().records;
      for (const type of REQUIRED_TYPES) {
        const currentById = new Map(normalized[type].map((record) => [record.id, record]));
        const currentSample = sampleIds.get(type).flatMap((id) => currentById.has(id) ? [currentById.get(id)] : []);
        if (completeTypes.has(type)) {
          normalized[type] = type === "watch_history"
            ? mergeRecordList(type, this.snapshot.records[type], currentSample)
            : currentSample;
        } else if (this.snapshot.records[type].length > 0) {
          normalized[type] = structuredClone(this.snapshot.records[type]);
          phaseWarnings.push(`${TYPE_LABELS[type]}读取不完整，已保留上次样本。`);
        } else {
          normalized[type] = currentSample;
          phaseWarnings.push(currentSample.length > 0
            ? `${TYPE_LABELS[type]}读取不完整，已使用本次读取到的 ${currentSample.length} 条。`
            : `${TYPE_LABELS[type]}未读取到可用记录，也未确认列表为空。`);
        }
      }

      const warnings = [...new Set([...phaseWarnings, ...responseErrors])];
      this.assertSyncActive(runId);
      this.snapshot = await this.store.save(normalized, warnings, {
        directSync: normalizeDirectSyncState(this.snapshot.directSync),
      });
      const complete = completeTypes.size === REQUIRED_TYPES.length && responseErrors.length === 0;
      this.updateStatus({
        state: complete ? "complete" : "partial",
        phase: null,
        message: complete ? "全部可见记录已读取" : "部分列表未完整读取，已保留现有数据",
        counts: recordCounts(this.snapshot.records),
        updatedAt: this.snapshot.updatedAt,
      });
    } finally {
      acceptingResponses = false;
      context.off("response", handleResponse);
    }
  }

  async openDirectContext() {
    const template = await loadDirectHistoryTemplate(this.dataDirectory);
    return chromium.launchPersistentContext(this.profileDirectory, directContextLaunchOptions({
      executablePath: this.executablePath,
      userAgent: template.headers["user-agent"],
    }));
  }

  async readDirectHistory(context, cursor = "0") {
    const page = context.pages()[0] ?? await context.newPage();
    const currentUserAgent = await page.evaluate(() => navigator.userAgent);
    return fetchDirectHistoryPage({
      context,
      currentUserAgent,
      dataDirectory: this.dataDirectory,
      directory: this.signerDirectory,
      cursor,
    });
  }

  async collectDirectList(context, type, onPage) {
    return collectDirectRecordPages(context, type, onPage);
  }

  async runDirectRecords(runId) {
    this.assertSyncActive(runId);
    const visibleContext = this.context;
    if (visibleContext) {
      this.context = null;
      await visibleContext.close();
      this.updateStatus({ browserOpen: false });
    }
    const context = await this.openDirectContext();
    try {
      this.assertSyncActive(runId);
      const page = context.pages()[0] ?? await context.newPage();
      const currentUserAgent = await page.evaluate(() => navigator.userAgent);
      const accumulator = new RecordAccumulator();
      const existingRecords = structuredClone(this.snapshot.records);
      const stagedRecords = structuredClone(existingRecords);
      const directSync = normalizeDirectSyncState(this.snapshot.directSync, this.snapshot.warnings);
      const incrementalByType = new Map(REQUIRED_TYPES.map((type) => [type, directSync[type]]));
      const allIncremental = REQUIRED_TYPES.every((type) => incrementalByType.get(type));
      const knownIds = new Map(REQUIRED_TYPES.map((type) => [
        type,
        new Set(incrementalByType.get(type) ? existingRecords[type].map((record) => record.id) : []),
      ]));
      const newIds = new Map(REQUIRED_TYPES.map((type) => [type, new Set()]));
      const rejectedIds = new Map(REQUIRED_TYPES.map((type) => [type, new Set()]));
      const returnedCounts = new Map(REQUIRED_TYPES.map((type) => [type, 0]));
      const filteredCounts = new Map(REQUIRED_TYPES.map((type) => [type, 0]));
      const pageCounts = {};
      let missingViewTimes = 0;
      const phases = [
        ["watch_history", DIRECT_HISTORY_ENDPOINT],
        ["liked_videos", DIRECT_LIKED_ENDPOINT],
        ["favorite_videos", DIRECT_FAVORITE_ENDPOINT],
      ];

      const trackResult = (type, result) => {
        returnedCounts.set(type, returnedCounts.get(type) + result.pageSize);
        filteredCounts.set(type, filteredCounts.get(type) + result.rejectedRecordIds.length);
        for (const id of result.acceptedRecordIds) {
          if (!knownIds.get(type).has(id)) newIds.get(type).add(id);
        }
        for (const id of result.rejectedRecordIds) rejectedIds.get(type).add(id);
      };
      const previewRecords = (type) => {
        const preview = structuredClone(stagedRecords);
        preview[type] = finalizeDirectType(
          type,
          incrementalByType.get(type),
          existingRecords[type],
          accumulator.snapshot().records[type],
          knownIds.get(type),
          rejectedIds.get(type),
        );
        return preview;
      };
      const progressMessage = (type, pageCount) => {
        const returned = returnedCounts.get(type);
        const filtered = filteredCounts.get(type);
        return incrementalByType.get(type)
          ? `正在读取${TYPE_LABELS[type]}新增记录（第 ${pageCount} 页，接口 ${returned} 条，新增 ${newIds.get(type).size} 条，过滤 ${filtered} 条）`
          : `正在读取${TYPE_LABELS[type]}全部记录（第 ${pageCount} 页，接口 ${returned} 条，保留 ${accumulator.snapshot().records[type].length} 条，过滤 ${filtered} 条）`;
      };
      const persistCompletedType = async (type, finalPhase) => {
        this.assertSyncActive(runId);
        stagedRecords[type] = previewRecords(type)[type];
        directSync[type] = true;
        const newCounts = Object.fromEntries(REQUIRED_TYPES.map((kind) => [kind, newIds.get(kind).size]));
        const warnings = [...new Set([
          finalPhase
            ? `${DIRECT_COMPLETE_WARNING_PREFIX}新增观看 ${newCounts.watch_history}、点赞 ${newCounts.liked_videos}、收藏 ${newCounts.favorite_videos}；读取观看历史 ${pageCounts.watch_history} 页、点赞 ${pageCounts.liked_videos} 页、收藏 ${pageCounts.favorite_videos} 页。`
            : `无界面读取阶段完成：${TYPE_LABELS[type]}已保存，其他分类继续读取。`,
          ...(missingViewTimes > 0
            ? [`其中 ${missingViewTimes} 条缺少观看日期，已保持为空，未使用发布时间或采集时间替代。`]
            : []),
        ])];
        this.snapshot = await this.store.save(stagedRecords, warnings, { directSync });
        this.updateStatus({
          counts: recordCounts(this.snapshot.records),
          updatedAt: this.snapshot.updatedAt,
        });
      };

      for (const [phaseIndex, [type, endpointUrl]] of phases.entries()) {
        const endpoint = matchDouyinEndpoint(endpointUrl);
        if (type !== "watch_history") {
          pageCounts[type] = await this.collectDirectList(context, type, async (payload, pageCount) => {
            this.assertSyncActive(runId);
            const result = accumulator.addResponse(endpoint, payload);
            trackResult(type, result);
            this.updateStatus({
              phase: type,
              message: progressMessage(type, pageCount),
              counts: recordCounts(previewRecords(type)),
            });
            return !result.recordIds.some((id) => knownIds.get(type).has(id));
          });
          await persistCompletedType(type, phaseIndex === phases.length - 1);
          continue;
        }
        const cursors = new Set();
        const pageFingerprints = new Set();
        let cursor = "0";
        pageCounts[type] = 0;
        while (true) {
          this.assertSyncActive(runId);
          if (cursors.has(cursor)) {
            throw new DirectHistoryError("pagination_stalled", `${TYPE_LABELS[type]}分页游标重复，已停止且未保存本次结果。`);
          }
          cursors.add(cursor);
          const payload = await this.readDirectHistory(context, cursor);
          this.assertSyncActive(runId);
          const result = accumulator.addResponse(endpoint, payload);
          trackResult(type, result);
          pageCounts[type] += 1;
          if (type === "watch_history") missingViewTimes += countMissingDirectHistoryViewTimes(payload);
          if (result.pageFingerprint && pageFingerprints.has(result.pageFingerprint)) {
            throw new DirectHistoryError("pagination_stalled", `${TYPE_LABELS[type]}分页内容重复，已停止且未保存本次结果。`);
          }
          if (result.pageFingerprint) pageFingerprints.add(result.pageFingerprint);
          if (accumulator.isTruncated(type)) {
            throw new DirectHistoryError("record_limit", `${TYPE_LABELS[type]}响应超过本地安全容量，已停止且未保存本次结果。`);
          }
          this.updateStatus({
            phase: type,
            message: progressMessage(type, pageCounts[type]),
            counts: recordCounts(previewRecords(type)),
          });
          if (result.recordIds.some((id) => knownIds.get(type).has(id))) break;
          if (result.pagination.hasMore === false) break;
          if (result.pagination.hasMore !== true || !result.pagination.cursor) {
            throw new DirectHistoryError("pagination_missing", `${TYPE_LABELS[type]}响应缺少下一页游标，已停止且未保存本次结果。`);
          }
          cursor = result.pagination.cursor;
          await delay(900);
        }
        await persistCompletedType(type, phaseIndex === phases.length - 1);
      }
      const newCounts = Object.fromEntries(REQUIRED_TYPES.map((type) => [type, newIds.get(type).size]));
      this.updateStatus({
        state: "complete",
        phase: null,
        message: allIncremental
          ? `已读取新增记录（观看 ${newCounts.watch_history}、点赞 ${newCounts.liked_videos}、收藏 ${newCounts.favorite_videos}）`
          : `已读取并合并全部可见记录（观看 ${stagedRecords.watch_history.length}、点赞 ${stagedRecords.liked_videos.length}、收藏 ${stagedRecords.favorite_videos.length}）`,
        counts: recordCounts(this.snapshot.records),
        updatedAt: this.snapshot.updatedAt,
      });
    } finally {
      await context.close().catch(() => undefined);
    }
  }

  async switchAccount() {
    if (this.accountSwitchPromise) return false;
    const promise = (async () => {
      this.syncRunId += 1;
      const runningSync = this.syncPromise;
      const runningObservation = this.observationPromise;
      if (runningObservation) await this.stopObservation({ silent: true });
      if (runningSync) await runningSync;
      const context = this.context ?? await this.ensureBrowser();
      await this.clearDedicatedAccountData(context);
      await invalidateDirectHistoryTemplate(this.dataDirectory);
      await this.close();

      this.snapshot = await this.store.clear();
      this.updateStatus({
        state: "idle",
        phase: null,
        message: "旧账号会话已清除",
        counts: recordCounts(this.snapshot.records),
        updatedAt: this.snapshot.updatedAt,
        browserOpen: false,
      });
      if (!this.startObservation({ allowAccountSwitch: true })) throw new Error("account_switch_observation_not_started");
    })();
    this.accountSwitchPromise = promise;
    try {
      await promise;
      return true;
    } finally {
      if (this.accountSwitchPromise === promise) this.accountSwitchPromise = null;
    }
  }

  async clearDedicatedAccountData(context) {
    const page = await this.currentPage(context);
    const session = await context.newCDPSession(page);
    try {
      await session.send("Network.clearBrowserCache");
      for (const origin of [
        "https://www.douyin.com",
        "https://douyin.com",
        "https://passport.douyin.com",
      ]) {
        await session.send("Storage.clearDataForOrigin", { origin, storageTypes: "all" });
      }
      await context.clearCookies();
    } finally {
      await session.detach().catch(() => undefined);
    }
  }

  async close() {
    this.stopSync({ silent: true });
    await this.stopObservation({ silent: true });
    if (!this.context) return;
    const context = this.context;
    this.context = null;
    await context.close().catch(() => undefined);
  }
}
