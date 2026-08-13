import { describe, expect, it, vi } from "vitest";

import { DouyinCollector, normalizeOwnProfileUrl, profileTabUrl } from "./douyinCollector.mjs";
import { createEmptyRecords } from "./normalizer.mjs";
import { createEndpointProgress } from "./progress.mjs";

function emptySnapshot() {
  return {
    schemaVersion: 2,
    updatedAt: "2026-08-09T00:00:00.000Z",
    records: createEmptyRecords(),
    warnings: [],
  };
}

function fakeResponse(pathname, payload) {
  return {
    url: () => `https://www.douyin.com${pathname}`,
    ok: () => true,
    status: () => 200,
    headers: () => ({}),
    json: () => typeof payload === "function" ? payload() : Promise.resolve(payload),
  };
}

function fakeContext(page) {
  const handlers = new Map();
  return {
    pages: () => [page],
    on: (event, handler) => {
      const listeners = handlers.get(event) ?? new Set();
      listeners.add(handler);
      handlers.set(event, listeners);
    },
    off: (event, handler) => handlers.get(event)?.delete(handler),
    emit: (event, value) => {
      for (const handler of handlers.get(event) ?? []) handler(value);
    },
  };
}

function collectorForResponses(initialSnapshot, responses) {
  const page = { url: () => "https://www.douyin.com/user/account-id?showTab=favorite_collection" };
  const context = fakeContext(page);
  const store = {
    save: vi.fn(async (records, warnings) => ({
      schemaVersion: 2,
      updatedAt: "2026-08-09T00:10:00.000Z",
      records,
      warnings,
    })),
  };
  const collector = new DouyinCollector({
    executablePath: "chrome",
    dataDirectory: ".local-data-test",
    store,
  });
  collector.snapshot = initialSnapshot;
  collector.context = context;
  collector.syncRunId = 1;
  collector.ensureBrowser = vi.fn().mockResolvedValue(context);
  collector.currentPage = vi.fn().mockResolvedValue(page);
  collector.visit = vi.fn().mockResolvedValue(undefined);
  collector.waitForLogin = vi.fn().mockResolvedValue(undefined);
  collector.collectPhase = vi.fn(async (_page, _versions, phase) => {
    if (responses[phase]) context.emit("response", responses[phase]);
  });
  return { collector, store };
}

const terminalEmptyVideos = { status_code: 0, aweme_list: [], has_more: 0 };

describe("Douyin profile routing", () => {
  it("normalizes only a concrete same-origin profile URL", () => {
    expect(normalizeOwnProfileUrl("/user/account-id?from=nav#top"))
      .toBe("https://www.douyin.com/user/account-id");
    expect(normalizeOwnProfileUrl("https://douyin.com/user/another-id/"))
      .toBe("https://www.douyin.com/user/another-id");
    expect(normalizeOwnProfileUrl("https://www.douyin.com/user/self")).toBeNull();
    expect(normalizeOwnProfileUrl("https://evil.example/user/account-id")).toBeNull();
    expect(normalizeOwnProfileUrl("http://www.douyin.com/user/account-id")).toBeNull();
  });

  it("builds only supported profile tab URLs", () => {
    expect(profileTabUrl("https://www.douyin.com/user/account-id", "record"))
      .toBe("https://www.douyin.com/user/account-id?showTab=record");
    expect(profileTabUrl("https://www.douyin.com/user/account-id", "like"))
      .toBe("https://www.douyin.com/user/account-id?showTab=like");
    expect(profileTabUrl("https://www.douyin.com/user/account-id", "favorite_collection"))
      .toBe("https://www.douyin.com/user/account-id?showTab=favorite_collection");
    expect(profileTabUrl("https://www.douyin.com/user/account-id", "unknown")).toBeNull();
  });
});

describe("DouyinCollector account switching", () => {
  it("cancels the active run, clears dedicated account data and local records, then starts manual observation", async () => {
    const clearedSnapshot = emptySnapshot();
    const store = { clear: vi.fn().mockResolvedValue(clearedSnapshot) };
    const collector = new DouyinCollector({
      executablePath: "chrome",
      dataDirectory: ".local-data-test",
      store,
    });
    collector.snapshot = {
      ...emptySnapshot(),
      records: {
        ...createEmptyRecords(),
        liked_videos: [{
          id: "liked_videos:old",
          title: "旧账号记录",
          author: null,
          occurredAt: null,
          url: "https://www.douyin.com/video/old",
        }],
      },
    };
    collector.context = {};
    collector.syncRunId = 4;
    collector.clearDedicatedAccountData = vi.fn().mockResolvedValue(undefined);
    collector.close = vi.fn().mockImplementation(async () => {
      collector.context = null;
    });
    collector.startObservation = vi.fn().mockReturnValue(true);

    await expect(collector.switchAccount()).resolves.toBe(true);

    expect(collector.syncRunId).toBe(5);
    expect(collector.clearDedicatedAccountData).toHaveBeenCalledTimes(1);
    expect(store.clear).toHaveBeenCalledTimes(1);
    expect(collector.snapshot.records.liked_videos).toEqual([]);
    expect(collector.startObservation).toHaveBeenCalledWith({ allowAccountSwitch: true });
  });

  it("rejects a normal sync while account data is being cleared", async () => {
    let releaseClear;
    const clearGate = new Promise((resolve) => {
      releaseClear = resolve;
    });
    const store = { clear: vi.fn().mockResolvedValue(emptySnapshot()) };
    const collector = new DouyinCollector({
      executablePath: "chrome",
      dataDirectory: ".local-data-test",
      store,
    });
    collector.snapshot = emptySnapshot();
    collector.context = {};
    collector.clearDedicatedAccountData = vi.fn().mockReturnValue(clearGate);
    collector.close = vi.fn().mockImplementation(async () => {
      collector.context = null;
    });
    collector.runSync = vi.fn().mockResolvedValue(undefined);
    collector.startObservation = vi.fn().mockReturnValue(true);

    const switching = collector.switchAccount();
    expect(collector.startSync()).toBe(false);
    releaseClear();

    await expect(switching).resolves.toBe(true);
    expect(collector.startObservation).toHaveBeenCalledTimes(1);
    expect(store.clear).toHaveBeenCalledTimes(1);
  });
});

describe("DouyinCollector sync startup", () => {
  it("replaces a stale terminal state before the async run yields", async () => {
    let finishRun;
    const runGate = new Promise((resolve) => {
      finishRun = resolve;
    });
    const collector = new DouyinCollector({ executablePath: "chrome", dataDirectory: ".test", store: {} });
    collector.status.state = "partial";
    collector.runSync = vi.fn().mockReturnValue(runGate);

    expect(collector.startSync()).toBe(true);
    expect(collector.getStatus().state).toBe("launching_browser");

    finishRun();
    await runGate;
  });
});

describe("DouyinCollector manual observation", () => {
  it("persists only responses produced while the user browses the dedicated browser", async () => {
    const page = { url: () => "https://www.douyin.com/" };
    const context = fakeContext(page);
    const store = {
      save: vi.fn(async (records, warnings) => ({
        schemaVersion: 2,
        updatedAt: "2026-08-09T00:20:00.000Z",
        records,
        warnings,
      })),
    };
    const collector = new DouyinCollector({ executablePath: "chrome", dataDirectory: ".test", store });
    collector.snapshot = emptySnapshot();
    collector.ensureBrowser = vi.fn().mockResolvedValue(context);
    collector.currentPage = vi.fn().mockResolvedValue(page);
    collector.waitForLogin = vi.fn().mockResolvedValue(undefined);

    expect(collector.startObservation()).toBe(true);
    await vi.waitFor(() => expect(collector.getStatus().state).toBe("observing"));

    context.emit("response", fakeResponse("/aweme/v1/web/history/read/", {
      status_code: 0,
      aweme_list: [{ aweme_id: "manual-history", desc: "手动浏览" }],
      has_more: 1,
      max_cursor: "next-page",
    }));
    await vi.waitFor(() => expect(store.save).toHaveBeenCalledTimes(1));

    expect(collector.getSnapshot().records.watch_history.map((record) => record.id))
      .toEqual(["watch_history:manual-history"]);
    expect(collector.getSnapshot().warnings).toContain(
      "手动监听模式：仅保存你在独立浏览器中实际浏览到的数据，完整性不会自动验证。",
    );
    expect(collector.startSync()).toBe(false);

    await expect(collector.stopObservation()).resolves.toBe(true);
    expect(collector.getStatus().state).toBe("idle");
  });
});

describe("DouyinCollector response completion", () => {
  it("uses a non-terminal first page as the current sample", async () => {
    const initial = emptySnapshot();
    initial.records.liked_videos = [{
      id: "liked_videos:old",
      title: "旧记录",
      author: null,
      occurredAt: null,
      url: "https://www.douyin.com/video/old",
    }];
    const { collector, store } = collectorForResponses(initial, {
      watch_history: fakeResponse("/aweme/v1/web/history/read/", terminalEmptyVideos),
      liked_videos: fakeResponse("/aweme/v1/web/aweme/favorite/", {
        status_code: 0,
        aweme_list: [{ aweme_id: "new", desc: "本次读取记录" }],
        has_more: 1,
        max_cursor: "next-page",
      }),
      favorite_videos: fakeResponse("/aweme/v1/web/aweme/listcollection/", terminalEmptyVideos),
    });

    await collector.runSync(1);

    const savedRecords = store.save.mock.calls[0][0];
    expect(savedRecords.liked_videos.map((record) => record.id)).toEqual(["liked_videos:new"]);
    expect(collector.snapshot.warnings).toEqual([]);
    expect(collector.status.state).toBe("complete");
  });

  it("preserves the previous sample when a primary page emits no response", async () => {
    const initial = emptySnapshot();
    initial.records.liked_videos = [{
      id: "liked_videos:old",
      title: "旧记录",
      author: null,
      occurredAt: null,
      url: "https://www.douyin.com/video/old",
      videoId: "old",
    }];
    const { collector } = collectorForResponses(initial, {
      watch_history: fakeResponse("/aweme/v1/web/history/read/", terminalEmptyVideos),
      favorite_videos: fakeResponse("/aweme/v1/web/aweme/listcollection/", terminalEmptyVideos),
    });

    await collector.runSync(1);

    expect(collector.snapshot.records.liked_videos.map((record) => record.videoId)).toEqual(["old"]);
    expect(collector.snapshot.warnings).toContain("点赞列表未捕获到网页响应。");
    expect(collector.snapshot.warnings).toContain("点赞列表读取不完整，已保留上次样本。");
    expect(collector.status.state).toBe("partial");
  });

  it("waits for delayed response parsing before calculating capture warnings", async () => {
    const delayedHistory = () => new Promise((resolve) => {
      setTimeout(() => resolve(terminalEmptyVideos), 25);
    });
    const { collector } = collectorForResponses(emptySnapshot(), {
      watch_history: fakeResponse("/aweme/v1/web/history/read/", delayedHistory),
      liked_videos: fakeResponse("/aweme/v1/web/aweme/favorite/", terminalEmptyVideos),
      favorite_videos: fakeResponse("/aweme/v1/web/aweme/listcollection/", terminalEmptyVideos),
    });

    await collector.runSync(1);

    expect(collector.snapshot.warnings).toEqual([]);
    expect(collector.status.state).toBe("complete");
  });

  it("applies pagination results in response order when JSON parsing finishes out of order", async () => {
    const delayedFirstPage = fakeResponse("/aweme/v1/web/history/read/", () => new Promise((resolve) => {
      setTimeout(() => resolve({
        status_code: 0,
        aweme_list: [{ aweme_id: "history-page-1", desc: "第一页" }],
        has_more: 1,
        max_cursor: "next-page",
      }), 25);
    }));
    const terminalHistoryPage = fakeResponse("/aweme/v1/web/history/read/", terminalEmptyVideos);
    const { collector } = collectorForResponses(emptySnapshot(), {
      liked_videos: fakeResponse("/aweme/v1/web/aweme/favorite/", terminalEmptyVideos),
      favorite_videos: fakeResponse("/aweme/v1/web/aweme/listcollection/", terminalEmptyVideos),
    });
    const context = collector.context;
    collector.collectPhase = vi.fn(async (_page, _versions, phase) => {
      if (phase === "watch_history") {
        context.emit("response", delayedFirstPage);
        context.emit("response", terminalHistoryPage);
      } else {
        const response = {
          liked_videos: fakeResponse("/aweme/v1/web/aweme/favorite/", terminalEmptyVideos),
          favorite_videos: fakeResponse("/aweme/v1/web/aweme/listcollection/", terminalEmptyVideos),
        }[phase];
        if (response) context.emit("response", response);
      }
    });

    await collector.runSync(1);

    expect(collector.snapshot.records.watch_history.map((record) => record.id))
      .toEqual(["watch_history:history-page-1"]);
    expect(collector.snapshot.warnings).toEqual([]);
    expect(collector.status.state).toBe("complete");
  });

  it("keeps at most 50 records from each primary page", async () => {
    const page = (prefix) => ({
      status_code: 0,
      aweme_list: Array.from({ length: 55 }, (_, index) => ({
        aweme_id: `${prefix}-${index}`,
        desc: `${prefix} ${index}`,
        event_time: 1_700_000_000 + index,
      })),
      has_more: 1,
      max_cursor: "next-page",
    });
    const { collector } = collectorForResponses(emptySnapshot(), {
      watch_history: fakeResponse("/aweme/v1/web/history/read/", page("watch")),
      liked_videos: fakeResponse("/aweme/v1/web/aweme/favorite/", page("liked")),
      favorite_videos: fakeResponse("/aweme/v1/web/aweme/listcollection/", page("favorite")),
    });

    await collector.runSync(1);

    expect(collector.snapshot.records.watch_history).toHaveLength(50);
    expect(collector.snapshot.records.liked_videos).toHaveLength(50);
    expect(collector.snapshot.records.favorite_videos).toHaveLength(50);
    expect(collector.snapshot.records.watch_history.map((record) => record.videoId))
      .toEqual(Array.from({ length: 50 }, (_, index) => `watch-${index}`));
    expect(collector.snapshot.records.liked_videos.map((record) => record.videoId))
      .toEqual(Array.from({ length: 50 }, (_, index) => `liked-${index}`));
    expect(collector.snapshot.records.favorite_videos.map((record) => record.videoId))
      .toEqual(Array.from({ length: 50 }, (_, index) => `favorite-${index}`));
    expect(collector.snapshot.warnings).toEqual([]);
    expect(collector.status.state).toBe("complete");
  });

  it("keeps the previous sample when a later response cannot be normalized", async () => {
    const initial = emptySnapshot();
    initial.records.liked_videos = [{
      id: "liked_videos:old",
      title: "旧记录",
      author: null,
      occurredAt: null,
      url: "https://www.douyin.com/video/old",
      videoId: "old",
    }];
    const { collector } = collectorForResponses(initial, {
      watch_history: fakeResponse("/aweme/v1/web/history/read/", terminalEmptyVideos),
      favorite_videos: fakeResponse("/aweme/v1/web/aweme/listcollection/", terminalEmptyVideos),
    });
    const context = collector.context;
    collector.collectPhase = vi.fn(async (_page, _versions, phase) => {
      if (phase === "liked_videos") {
        context.emit("response", fakeResponse("/aweme/v1/web/aweme/favorite/", {
          status_code: 0,
          aweme_list: [{ aweme_id: "new", desc: "本次读取记录" }],
          has_more: 1,
          max_cursor: "next-page",
        }));
        context.emit("response", fakeResponse("/aweme/v1/web/aweme/favorite/", {
          status_code: 0,
          aweme_list: [{ new_schema_id: "unrecognized" }],
          has_more: 1,
          max_cursor: "next-page-2",
        }));
        return;
      }
      const response = {
        watch_history: fakeResponse("/aweme/v1/web/history/read/", terminalEmptyVideos),
        favorite_videos: fakeResponse("/aweme/v1/web/aweme/listcollection/", terminalEmptyVideos),
      }[phase];
      if (response) context.emit("response", response);
    });

    await collector.runSync(1);

    expect(collector.snapshot.records.liked_videos.map((record) => record.videoId)).toEqual(["old"]);
    expect(collector.snapshot.warnings).toContain("点赞列表读取不完整，已保留上次样本。");
    expect(collector.snapshot.warnings).toContain("视频列表包含无法识别的数据。请更新采集器适配器。");
    expect(collector.status.state).toBe("partial");
  });

  it("keeps a full current sample when a later response cannot be normalized", async () => {
    const initial = emptySnapshot();
    initial.records.liked_videos = [{
      id: "liked_videos:old",
      title: "旧记录",
      author: null,
      occurredAt: null,
      url: "https://www.douyin.com/video/old",
      videoId: "old",
    }];
    const { collector } = collectorForResponses(initial, {
      watch_history: fakeResponse("/aweme/v1/web/history/read/", terminalEmptyVideos),
      favorite_videos: fakeResponse("/aweme/v1/web/aweme/listcollection/", terminalEmptyVideos),
    });
    const context = collector.context;
    collector.collectPhase = vi.fn(async (_page, _versions, phase) => {
      if (phase === "liked_videos") {
        context.emit("response", fakeResponse("/aweme/v1/web/aweme/favorite/", {
          status_code: 0,
          aweme_list: Array.from({ length: 55 }, (_, index) => ({
            aweme_id: `current-${index}`,
            desc: `本次记录 ${index}`,
          })),
          has_more: 1,
          max_cursor: "next-page",
        }));
        context.emit("response", fakeResponse("/aweme/v1/web/aweme/favorite/", {
          status_code: 0,
          aweme_list: [{ new_schema_id: "unrecognized" }],
          has_more: 1,
          max_cursor: "next-page-2",
        }));
        return;
      }
      const response = {
        watch_history: fakeResponse("/aweme/v1/web/history/read/", terminalEmptyVideos),
        favorite_videos: fakeResponse("/aweme/v1/web/aweme/listcollection/", terminalEmptyVideos),
      }[phase];
      if (response) context.emit("response", response);
    });

    await collector.runSync(1);

    expect(collector.snapshot.records.liked_videos).toHaveLength(50);
    expect(collector.snapshot.records.liked_videos[0].videoId).toBe("current-0");
    expect(collector.snapshot.warnings).not.toContain("点赞列表读取不完整，已保留上次样本。");
    expect(collector.status.state).toBe("partial");
  });
});

describe("DouyinCollector deterministic tab fallback", () => {
  function interactiveLocator() {
    const locator = {
      count: vi.fn().mockResolvedValue(1),
      nth: vi.fn(),
      isVisible: vi.fn().mockResolvedValue(true),
      click: vi.fn().mockResolvedValue(undefined),
      focus: vi.fn().mockResolvedValue(undefined),
      press: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn().mockResolvedValue(true),
    };
    locator.nth.mockReturnValue(locator);
    return locator;
  }

  it("visits the target Likes URL when a successful click emits no endpoint response", async () => {
    const locator = interactiveLocator();
    const page = {
      locator: vi.fn().mockReturnValue(locator),
      evaluate: vi.fn().mockResolvedValue(null),
      getByRole: vi.fn().mockReturnValue(locator),
      getByLabel: vi.fn().mockReturnValue(locator),
      getByTitle: vi.fn().mockReturnValue(locator),
      getByText: vi.fn().mockReturnValue(locator),
      reload: vi.fn().mockResolvedValue(undefined),
    };
    const collector = new DouyinCollector({ executablePath: "chrome", dataDirectory: ".test", store: {} });
    collector.syncRunId = 1;
    collector.resolveOwnProfileUrl = vi.fn().mockResolvedValue("https://www.douyin.com/user/account-id");
    collector.visit = vi.fn().mockResolvedValue(undefined);
    collector.waitForVersionAdvance = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    collector.scrollUntilIdle = vi.fn().mockResolvedValue(undefined);

    await collector.collectPhase(page, new Map(), "liked_videos", 1, []);

    expect(collector.visit).toHaveBeenNthCalledWith(
      1,
      page,
      "https://www.douyin.com/user/account-id?showTab=record",
      1,
    );
    expect(collector.visit).toHaveBeenNthCalledWith(
      2,
      page,
      "https://www.douyin.com/user/account-id?showTab=like",
      1,
    );
    expect(collector.scrollUntilIdle).toHaveBeenCalledWith(
      page,
      expect.any(Map),
      ["liked_videos"],
      1,
      [],
      70,
      "like",
    );
    expect(page.reload).not.toHaveBeenCalled();
  });

  it("opens a neutral profile tab before clicking History", async () => {
    const locator = interactiveLocator();
    locator.evaluate
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true);
    const page = {
      locator: vi.fn().mockReturnValue(locator),
      evaluate: vi.fn().mockResolvedValue(null),
      getByRole: vi.fn().mockReturnValue(locator),
      getByLabel: vi.fn().mockReturnValue(locator),
      getByTitle: vi.fn().mockReturnValue(locator),
      getByText: vi.fn().mockReturnValue(locator),
      reload: vi.fn().mockResolvedValue(undefined),
    };
    const responseVersions = new Map([["watch_history", 0]]);
    const collector = new DouyinCollector({ executablePath: "chrome", dataDirectory: ".test", store: {} });
    collector.syncRunId = 1;
    collector.resolveOwnProfileUrl = vi.fn().mockResolvedValue("https://www.douyin.com/user/account-id");
    collector.visit = vi.fn().mockResolvedValue(undefined);
    collector.waitForVersionAdvance = vi.fn().mockResolvedValue(true);
    collector.scrollUntilIdle = vi.fn().mockResolvedValue(undefined);

    await collector.collectPhase(page, responseVersions, "watch_history", 1, []);

    expect(locator.click).toHaveBeenCalled();
    expect(collector.visit).toHaveBeenCalledTimes(1);
    expect(collector.visit).toHaveBeenCalledWith(
      page,
      "https://www.douyin.com/user/account-id?showTab=like",
      1,
    );
    expect(collector.scrollUntilIdle).toHaveBeenCalledWith(
      page,
      responseVersions,
      ["watch_history"],
      1,
      [],
      260,
      "record",
    );
  });

  it("does not scroll when the target panel cannot be resolved", async () => {
    const progress = createEndpointProgress();
    progress.matchedCount = 1;
    progress.processedCount = 1;
    const page = {
      evaluate: vi.fn().mockResolvedValue(null),
      mouse: {
        move: vi.fn(),
        wheel: vi.fn(),
      },
    };
    const collector = new DouyinCollector({ executablePath: "chrome", dataDirectory: ".test", store: {} });
    collector.syncRunId = 1;

    await collector.scrollUntilIdle(
      page,
      new Map([["liked_videos", 1]]),
      ["liked_videos"],
      1,
      [progress],
      1,
      "like",
    );

    expect(progress.visualSurfaceMissing).toBe(true);
    expect(page.mouse.move).not.toHaveBeenCalled();
    expect(page.mouse.wheel).not.toHaveBeenCalled();
  });

  it("falls back to a scrollable ancestor when the active panel has no box", async () => {
    const attributes = new Map();
    const root = {
      tagName: "HTML",
      parentElement: null,
      hidden: false,
      inert: false,
      scrollHeight: 1_800,
      clientHeight: 900,
      scrollTop: 0,
      getAttribute: (name) => attributes.get(name) ?? null,
      setAttribute: (name, value) => attributes.set(name, value),
      removeAttribute: (name) => attributes.delete(name),
      getBoundingClientRect: () => ({ left: 0, right: 1_280, top: 0, bottom: 900, width: 1_280, height: 900 }),
    };
    const panel = {
      tagName: "DIV",
      parentElement: root,
      hidden: false,
      inert: false,
      scrollHeight: 700,
      clientHeight: 700,
      scrollTop: 0,
      getAttribute: () => null,
      contains: (element) => element === panel || element === content,
      getBoundingClientRect: () => ({ left: 817, right: 817, top: 226, bottom: 226, width: 0, height: 0 }),
    };
    const content = {
      tagName: "DIV",
      parentElement: panel,
      hidden: false,
      inert: false,
      scrollHeight: 600,
      clientHeight: 600,
      scrollTop: 0,
      getAttribute: () => null,
    };
    const fakeDocument = {
      scrollingElement: root,
      querySelectorAll: () => attributes.has("data-douyin-collector-surface") ? [root] : [],
      querySelector: () => attributes.has("data-douyin-collector-surface") ? root : null,
      getElementById: (id) => id === "semiTabPanellike" ? panel : null,
      elementsFromPoint: () => [content],
    };
    const fakeWindow = {
      innerWidth: 1_280,
      innerHeight: 900,
      getComputedStyle: (element) => ({ overflowY: element === root ? "auto" : "visible", display: "block", visibility: "visible", opacity: "1" }),
      __douyinCollectorVisualBaseline: new Set(),
    };
    vi.stubGlobal("document", fakeDocument);
    vi.stubGlobal("window", fakeWindow);

    const progress = createEndpointProgress();
    progress.matchedCount = 1;
    progress.processedCount = 1;
    progress.uniqueAddedCount = 20;
    const page = {
      evaluate: vi.fn(async (callback, argument) => callback(argument)),
    };
    const collector = new DouyinCollector({ executablePath: "chrome", dataDirectory: ".test", store: {} });
    collector.syncRunId = 1;

    try {
      await collector.scrollUntilIdle(
        page,
        new Map([["liked_videos", 1]]),
        ["liked_videos"],
        1,
        [progress],
        1,
        "like",
      );
    } finally {
      vi.unstubAllGlobals();
    }

    expect(progress.visualSurfaceMissing).toBe(false);
    expect(root.scrollTop).toBeGreaterThan(0);
  });

  it("does not scroll after collecting 50 unique records", async () => {
    const progress = createEndpointProgress();
    progress.matchedCount = 1;
    progress.processedCount = 1;
    progress.uniqueAddedCount = 50;
    const page = {
      evaluate: vi.fn(),
      mouse: { move: vi.fn(), wheel: vi.fn() },
    };
    const collector = new DouyinCollector({ executablePath: "chrome", dataDirectory: ".test", store: {} });
    collector.syncRunId = 1;

    await collector.scrollUntilIdle(
      page,
      new Map([["liked_videos", 1]]),
      ["liked_videos"],
      1,
      [progress],
      1,
      "like",
    );

    expect(page.evaluate).not.toHaveBeenCalled();
    expect(page.mouse.wheel).not.toHaveBeenCalled();
  });
});
