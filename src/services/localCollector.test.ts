import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getCollectorRecords,
  LocalCollectorError,
  getCollectorStatus,
  normalizeCollectorBaseUrl,
  parseLaunchPairingCode,
  pairCollector,
  startCollectorObservation,
  stopCollectorObservation,
} from "./localCollector";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("normalizeCollectorBaseUrl", () => {
  it("allows loopback and private LAN HTTP addresses", () => {
    expect(normalizeCollectorBaseUrl("http://127.0.0.1:4765/")).toBe("http://127.0.0.1:4765");
    expect(normalizeCollectorBaseUrl("http://192.168.10.5:4765")).toBe("http://192.168.10.5:4765");
  });

  it("rejects public HTTP addresses and URLs containing credentials", () => {
    expect(() => normalizeCollectorBaseUrl("http://example.com:4765")).toThrowError(LocalCollectorError);
    expect(() => normalizeCollectorBaseUrl("https://example.com:4765")).toThrowError(LocalCollectorError);
    expect(() => normalizeCollectorBaseUrl("https://user:pass@example.com")).toThrowError(LocalCollectorError);
  });
});

describe("parseLaunchPairingCode", () => {
  it("only accepts one exact 8-digit launch code", () => {
    expect(parseLaunchPairingCode("#pair=12345678")).toBe("12345678");
    expect(parseLaunchPairingCode("#pair=1234567")).toBeNull();
    expect(parseLaunchPairingCode("#pair=12345678&token=secret")).toBeNull();
  });
});

describe("local collector client", () => {
  it("validates pairing codes before sending a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(pairCollector("http://127.0.0.1:4765", "123"))
      .rejects.toMatchObject({ code: "invalid_code" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the session token only in the Authorization header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      state: "complete",
      phase: null,
      message: "完成",
      counts: { watch_history: 1, liked_videos: 2, favorite_videos: 3 },
      updatedAt: "2026-08-08T00:00:00.000Z",
      browserOpen: true,
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const status = await getCollectorStatus("http://127.0.0.1:4765", "session-secret");
    expect(status.counts.favorite_videos).toBe(3);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:4765/v1/status",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer session-secret" }) }),
    );
    expect(fetchMock.mock.calls[0]?.[0]).not.toContain("session-secret");
  });

  it("starts and stops manual observation through local authenticated endpoints", async () => {
    const statusPayload = {
      state: "observing",
      phase: null,
      message: "监听中",
      counts: { watch_history: 0, liked_videos: 0, favorite_videos: 0 },
      updatedAt: null,
      browserOpen: true,
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ started: true, status: statusPayload }), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ stopped: true, status: { ...statusPayload, state: "idle" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(startCollectorObservation("http://127.0.0.1:4765", "session-secret"))
      .resolves.toMatchObject({ state: "observing" });
    await expect(stopCollectorObservation("http://127.0.0.1:4765", "session-secret"))
      .resolves.toMatchObject({ state: "idle" });

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "http://127.0.0.1:4765/v1/observe",
      "http://127.0.0.1:4765/v1/observe/stop",
    ]);
  });

  it("rejects unreasonable count values from the service", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      state: "complete",
      phase: null,
      message: "完成",
      counts: { watch_history: 9_999_999, liked_videos: 0, favorite_videos: 0 },
      updatedAt: null,
      browserOpen: false,
    }), { status: 200 })));

    await expect(getCollectorStatus("http://127.0.0.1:4765", "session-secret"))
      .rejects.toMatchObject({ code: "invalid_response" });
  });

  it("keeps HTTPS video links from legitimate Douyin subdomains", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      schemaVersion: 1,
      updatedAt: "2026-08-09T00:00:00.000Z",
      records: {
        watch_history: [{
          id: "watch_history:1",
          title: "测试视频",
          author: null,
          occurredAt: "2025-01-01T00:00:00.000Z",
          url: "https://v.douyin.com/example/",
        }],
        liked_videos: [],
        favorite_videos: [],
      },
      warnings: [],
    }), { status: 200 })));

    const snapshot = await getCollectorRecords("http://127.0.0.1:4765", "session-secret");
    expect(snapshot.schemaVersion).toBe(2);
    expect(snapshot.records.watch_history[0]?.url).toBe("https://v.douyin.com/example/");
    expect(snapshot.records.watch_history[0]?.videoId).toBe("1");
    expect(snapshot.records.watch_history[0]?.occurredAtSource).toBe("platform_action");
  });

  it("accepts and sanitizes schema v2 optional metadata", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      schemaVersion: 2,
      updatedAt: "2026-08-09T00:00:00.000Z",
      records: {
        watch_history: [{
          id: "watch_history:rich",
          title: "rich record",
          author: "Creator",
          occurredAt: "2025-01-02T03:04:05.000Z",
          url: "https://www.douyin.com/video/rich",
          videoId: "rich",
          authorId: "creator-1",
          authorAvatarUrl: "https://p3.douyinpic.com/avatar",
          occurredAtSource: "platform_action",
          publishedAt: "2024-12-01T00:00:00.000Z",
          coverUrl: "https://p3.douyinpic.com/cover",
          mediaType: "video",
          durationSeconds: 42,
          music: { id: "music-1", title: "Track", author: "Artist" },
          topics: ["travel", "#city", "travel"],
          stats: { playCount: 100, diggCount: 10, ignored: "raw" },
          watchProgress: { watchedSeconds: 21, percent: 50 },
        }, {
          id: "watch_history:unsafe",
          title: "unsafe images",
          authorAvatarUrl: "https://evil.example/avatar",
          coverUrl: "https://evil.example/cover",
        }],
        liked_videos: [],
        favorite_videos: [],
      },
      warnings: [],
    }), { status: 200 })));

    const snapshot = await getCollectorRecords("http://127.0.0.1:4765", "session-secret");
    expect(snapshot.records.watch_history[0]).toMatchObject({
      videoId: "rich",
      authorId: "creator-1",
      authorAvatarUrl: "https://p3.douyinpic.com/avatar",
      occurredAtSource: "platform_action",
      publishedAt: "2024-12-01T00:00:00.000Z",
      coverUrl: "https://p3.douyinpic.com/cover",
      mediaType: "video",
      durationSeconds: 42,
      topics: ["travel", "city"],
      stats: { playCount: 100, diggCount: 10 },
      watchProgress: { watchedSeconds: 21, percent: 50 },
    });
    expect(snapshot.records.watch_history[1]).not.toHaveProperty("authorAvatarUrl");
    expect(snapshot.records.watch_history[1]).not.toHaveProperty("coverUrl");
  });

  it("drops lookalike and non-HTTPS video links", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      schemaVersion: 1,
      updatedAt: null,
      records: {
        watch_history: [
          { id: "watch_history:1", title: "仿冒域名", url: "https://evildouyin.com/video/1" },
          { id: "watch_history:2", title: "非 HTTPS", url: "http://www.douyin.com/video/2" },
        ],
        liked_videos: [],
        favorite_videos: [],
      },
      warnings: [],
    }), { status: 200 })));

    const snapshot = await getCollectorRecords("http://127.0.0.1:4765", "session-secret");
    expect(snapshot.records.watch_history.map((record) => record.url)).toEqual([null, null]);
  });
});
