import { describe, expect, it } from "vitest";

import {
  createEmptyPersonalRecords,
  type PersonalRecordCollection,
  type PersonalRecordType,
  type PersonalVideoRecord,
} from "../../domain/personalRecords";
import { buildStoryModel } from "./storyModel";

function record(id: string, extra: Partial<PersonalVideoRecord> = {}): PersonalVideoRecord {
  return {
    id,
    title: `video ${id}`,
    author: null,
    occurredAt: null,
    url: null,
    ...extra,
  };
}

function recordsOf(values: Partial<Record<PersonalRecordType, PersonalVideoRecord[]>>): PersonalRecordCollection {
  return { ...createEmptyPersonalRecords(), ...values };
}

describe("story model", () => {
  it("builds stable opening tags from watch topics and fills short lists with authors", () => {
    const watch = [
      record("a", { videoId: "a", title: "#摄影 清晨", topics: ["城市散步"], author: "作者甲" }),
      record("b", { videoId: "b", title: "#摄影 夜晚", author: "作者乙" }),
      record("c", { videoId: "c", topics: ["家常菜"], author: "作者丙" }),
      record("d", { videoId: "d", author: "作者丁" }),
      record("e", { videoId: "e", author: "作者戊" }),
      record("f", { videoId: "f", author: "作者己" }),
      record("g", { videoId: "g", author: "作者庚" }),
      record("h", { videoId: "h", author: "作者辛" }),
    ];

    const forward = buildStoryModel(recordsOf({ watch_history: watch })).openingTags;
    const reversed = buildStoryModel(recordsOf({ watch_history: [...watch].reverse() })).openingTags;

    expect(forward).toEqual(reversed);
    expect(forward).toHaveLength(8);
    expect(forward.slice(0, 3).map((item) => [item.name, item.source])).toEqual([
      ["摄影", "topic"],
      ["城市散步", "topic"],
      ["家常菜", "topic"],
    ]);
    expect(forward.slice(3).every((item) => item.source === "author")).toBe(true);
  });

  it("uses only reliable action times and buckets them in Asia/Shanghai", () => {
    const model = buildStoryModel(recordsOf({
      watch_history: [
        record("known", {
          videoId: "known",
          title: "夜间记录 #童年",
          occurredAt: "2025-01-01T13:10:00.000Z",
          occurredAtSource: "platform_action",
        }),
        record("unknown-source", {
          videoId: "unknown-source",
          topics: ["不应出现"],
          occurredAt: "2025-01-01T13:20:00.000Z",
          occurredAtSource: "unknown",
        }),
        record("undated", {
          videoId: "undated",
          topics: ["不应出现"],
          occurredAtSource: "archive_action",
        }),
      ],
    }));

    expect(model.timezone).toBe("Asia/Shanghai");
    expect(model.hours).toHaveLength(24);
    expect(model.hours.reduce((sum, hour) => sum + hour.count, 0)).toBe(1);
    expect(model.hours[21]).toMatchObject({ count: 1, uniqueCount: 1, topTopic: "童年", topTopicCount: 1 });
    expect(model.hours[21]?.representative?.record.id).toBe("known");
  });

  it("excludes records without a comparable videoId from intersections", () => {
    const model = buildStoryModel(recordsOf({
      watch_history: [
        record("watch_history-legacy", { occurredAtSource: "platform_action" }),
        record("watch-shared", { videoId: "shared", topics: ["摄影"] }),
      ],
      liked_videos: [
        record("liked_videos-legacy", {}),
        record("liked-shared", { videoId: "shared", author: "摄影作者" }),
      ],
      favorite_videos: [record("favorite-unrelated", { videoId: "favorite-only" })],
    }));

    expect(model.overlaps.watchLiked.count).toBe(1);
    expect(model.overlaps.watchLiked.records).toHaveLength(1);
    expect(model.overlaps.watchLiked.records[0]).toMatchObject({
      key: "video:shared",
      lists: ["watch_history", "liked_videos"],
      topics: ["摄影"],
    });
    expect(model.overlaps.watchFavorite.count).toBe(0);
    expect(model.overlaps.likedFavorite.count).toBe(0);
    expect(model.overlaps.allThree.count).toBe(0);
  });

  it("links each explicit topic to stable representative records and creators", () => {
    const model = buildStoryModel(recordsOf({
      watch_history: [
        record("photo-a", {
          videoId: "photo-a",
          title: "#摄影 阴天街景",
          author: "光影笔记",
          authorId: "creator-a",
          occurredAt: "2025-03-02T12:00:00.000Z",
          occurredAtSource: "platform_action",
        }),
        record("photo-b", {
          videoId: "photo-b",
          topics: ["摄影", "街景"],
          author: "城市相册",
          authorId: "creator-b",
          occurredAt: "2025-03-03T12:00:00.000Z",
          occurredAtSource: "archive_action",
        }),
      ],
      liked_videos: [record("liked-photo-a", {
        videoId: "photo-a",
        topics: ["摄影"],
        author: "光影笔记",
        authorId: "creator-a",
      })],
    }));

    const photography = model.topics.find((topic) => topic.name === "摄影");
    expect(photography).toMatchObject({ count: 2, creatorCount: 2 });
    expect(photography?.records.map((item) => item.key)).toEqual(["video:photo-a", "video:photo-b"]);
    expect(photography?.records[0]).toMatchObject({
      lists: ["watch_history", "liked_videos"],
      topics: ["摄影"],
    });
    expect(photography?.creators.map((creator) => creator.name)).toEqual(["城市相册", "光影笔记"]);
    expect(model.streams.watch_history.representative?.record.id).toBe("photo-a");
  });
});
