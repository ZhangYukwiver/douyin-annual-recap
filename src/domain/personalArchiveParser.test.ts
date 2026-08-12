import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import annualArchiveFixture from "../../test-fixtures/annual-archive.json";
import { parsePersonalArchiveBytes, PersonalArchiveError } from "./personalArchiveParser";

function asJson(value: unknown): Uint8Array {
  return strToU8(JSON.stringify(value));
}

describe("parsePersonalArchiveBytes", () => {
  it("parses the redacted annual browser fixture", () => {
    const result = parsePersonalArchiveBytes(asJson(annualArchiveFixture), "annual-archive.json");

    expect(result.records.watch_history).toHaveLength(20);
    expect(result.records.liked_videos).toHaveLength(8);
    expect(result.records.favorite_videos).toHaveLength(6);
    expect(result.records.watch_history[0]).toMatchObject({
      videoId: expect.stringMatching(/^demo-/u),
      occurredAtSource: "archive_action",
    });
  });

  it("reads, sorts, and deduplicates the three personal record sections", () => {
    const result = parsePersonalArchiveBytes(
      asJson({
        观看历史: [
          {
            视频标题: "较早观看",
            作者: { 昵称: "作者甲" },
            视频链接: "https://www.douyin.com/video/100",
            观看时间: 1_700_000_000,
          },
          {
            视频标题: "最近观看",
            作者昵称: "作者乙",
            作品链接: "https://www.douyin.com/video/200",
            观看时间: 1_800_000_000_000,
          },
          {
            视频标题: "最近观看的重复项",
            作品链接: "https://www.douyin.com/video/200",
          },
        ],
        点赞列表: [
          { aweme_id: "liked-1", desc: "点赞视频", share_url: "https://v.douyin.com/liked" },
        ],
        收藏列表: [
          { video_id: "saved-1", title: "收藏视频", url: "javascript:alert(1)" },
        ],
      }),
    );

    expect(result.format).toBe("json");
    expect(result.records.watch_history).toHaveLength(2);
    expect(result.records.watch_history[0]?.title).toBe("最近观看");
    expect(result.records.watch_history[1]?.author).toBe("作者甲");
    expect(result.records.liked_videos[0]?.title).toBe("点赞视频");
    expect(result.records.favorite_videos[0]?.url).toBeNull();
    expect(result.warnings).toEqual([]);
  });

  it("uses explicit record types when records share one root array", () => {
    const result = parsePersonalArchiveBytes(
      asJson({
        records: [
          { 记录类型: "观看历史", 标题: "看过的视频" },
          { 记录类型: "点赞记录", 标题: "赞过的视频" },
          { 记录类型: "收藏记录", 标题: "收藏的视频" },
        ],
      }),
    );

    expect(result.records.watch_history).toHaveLength(1);
    expect(result.records.liked_videos).toHaveLength(1);
    expect(result.records.favorite_videos).toHaveLength(1);
  });

  it("reads categorized JSON files from a ZIP and reports skipped entries", () => {
    const archive = zipSync({
      "个人信息/观看历史.json": asJson([{ title: "ZIP 观看记录" }]),
      "个人信息/点赞列表.json": asJson([{ title: "ZIP 点赞记录" }]),
      "个人信息/损坏.json": strToU8("{not-json"),
      "说明.txt": strToU8("read me"),
      "图片.png": Uint8Array.from([1, 2, 3]),
    });

    const result = parsePersonalArchiveBytes(archive, "douyin-export.zip");

    expect(result.format).toBe("zip");
    expect(result.parsedFileCount).toBe(2);
    expect(result.ignoredFileCount).toBe(3);
    expect(result.records.watch_history[0]?.title).toBe("ZIP 观看记录");
    expect(result.records.liked_videos[0]?.title).toBe("ZIP 点赞记录");
    expect(result.warnings).toContain("个人信息/损坏.json 无法解析，已跳过。");
  });

  it("does not mistake published-video metrics for the user's liked videos", () => {
    const result = parsePersonalArchiveBytes(
      asJson({
        作品数据: [{ title: "本人作品", like_count: 999, favorite_count: 50 }],
      }),
    );

    expect(result.records.watch_history).toEqual([]);
    expect(result.records.liked_videos).toEqual([]);
    expect(result.records.favorite_videos).toEqual([]);
    expect(result.warnings[0]).toContain("未找到可识别");
  });

  it("keeps publication time separate from an archive action time", () => {
    const result = parsePersonalArchiveBytes(asJson({
      liked_videos: [{
        aweme_id: "published-only",
        desc: "published only",
        create_time: 1_700_000_000,
      }],
    }));

    expect(result.records.liked_videos[0]).toMatchObject({
      videoId: "published-only",
      occurredAt: null,
      occurredAtSource: "unknown",
      publishedAt: "2023-11-14T22:13:20.000Z",
    });
  });

  it("imports schema v2 optional fields and sanitizes image URLs", () => {
    const result = parsePersonalArchiveBytes(asJson({
      schemaVersion: 2,
      records: {
        watch_history: [{
          id: "watch_history:rich",
          videoId: "rich",
          title: "#travel rich record",
          author: "Creator",
          authorId: "creator-1",
          authorAvatarUrl: "https://p3.douyinpic.com/avatar",
          occurredAt: "2025-01-02T03:04:05.000Z",
          occurredAtSource: "platform_action",
          publishedAt: "2024-12-01T00:00:00.000Z",
          url: "https://www.douyin.com/video/rich",
          coverUrl: "https://p3.douyinpic.com/cover",
          mediaType: "video",
          durationSeconds: 42,
          music: { id: "music-1", title: "Track", author: "Artist" },
          topics: ["travel", "city"],
          stats: { playCount: 100, diggCount: 10 },
          watchProgress: { watchedSeconds: 21, percent: 50 },
        }, {
          id: "watch_history:unsafe",
          videoId: "unsafe",
          title: "unsafe images",
          authorAvatarUrl: "https://evil.example/avatar",
          coverUrl: "https://evil.example/cover",
        }],
        liked_videos: [],
        favorite_videos: [],
      },
    }));

    expect(result.records.watch_history[0]).toMatchObject({
      videoId: "rich",
      authorId: "creator-1",
      authorAvatarUrl: "https://p3.douyinpic.com/avatar",
      occurredAtSource: "platform_action",
      publishedAt: "2024-12-01T00:00:00.000Z",
      coverUrl: "https://p3.douyinpic.com/cover",
      mediaType: "video",
      durationSeconds: 42,
      music: { id: "music-1", title: "Track", author: "Artist" },
      topics: ["travel", "city"],
      stats: { playCount: 100, diggCount: 10 },
      watchProgress: { watchedSeconds: 21, percent: 50 },
    });
    expect(result.records.watch_history[1]).not.toHaveProperty("authorAvatarUrl");
    expect(result.records.watch_history[1]).not.toHaveProperty("coverUrl");
  });

  it("recognizes legacy collector event times as platform actions", () => {
    const result = parsePersonalArchiveBytes(asJson({
      schemaVersion: 1,
      records: {
        watch_history: [{
          id: "watch_history:legacy",
          title: "legacy collector row",
          occurredAt: "2025-01-01T00:00:00.000Z",
          url: "https://www.douyin.com/video/legacy",
        }],
        liked_videos: [],
        favorite_videos: [],
      },
    }));

    expect(result.records.watch_history[0]).toMatchObject({
      videoId: "legacy",
      occurredAtSource: "platform_action",
    });
  });

  it("rejects invalid JSON and unsafe ZIP paths", () => {
    expect(() => parsePersonalArchiveBytes(strToU8("{broken"))).toThrow(PersonalArchiveError);

    const unsafeArchive = zipSync({
      "../观看历史.json": asJson([{ title: "不应读取" }]),
    });

    expect(() => parsePersonalArchiveBytes(unsafeArchive)).toThrow("不安全的文件路径");
  });
});
