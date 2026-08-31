import { describe, expect, it } from "vitest";

import type { ChatConversationSummary, ChatMessage } from "./chatRecords";
import type { PersonalRecordCollection, PersonalVideoRecord } from "./personalRecords";
import { deriveProfile } from "./profile";

function video(id: string, options: Partial<PersonalVideoRecord> = {}): PersonalVideoRecord {
  return {
    id,
    videoId: id,
    title: options.title ?? id,
    author: options.author ?? "作者甲",
    occurredAt: options.occurredAt ?? "2026-08-01T10:00:00Z",
    occurredAtSource: "platform_action",
    url: null,
    topics: options.topics ?? ["知识"],
    durationSeconds: options.durationSeconds ?? 60,
    watchProgress: options.watchProgress ?? { percent: 50 },
    ...options,
  };
}

function records(watch: PersonalVideoRecord[], liked: PersonalVideoRecord[] = [], favorite: PersonalVideoRecord[] = []): PersonalRecordCollection {
  return { watch_history: watch, liked_videos: liked, favorite_videos: favorite };
}

function chat(id: string, conversationId: string, day: string): ChatMessage {
  return {
    id,
    conversationId,
    conversationType: "friend",
    conversationName: conversationId,
    senderId: `${conversationId}-peer`,
    senderName: conversationId,
    sentAt: `${day}T10:00:00Z`,
    type: "text",
    text: "消息",
    mediaUrl: null,
    share: null,
    callDurationSeconds: null,
  };
}

describe("deriveProfile", () => {
  it("deduplicates watched content for rates while averaging every progress sample", () => {
    const watch = [
      video("a", { author: "甲", topics: ["旅行", "摄影"], watchProgress: { percent: 80 } }),
      video("a-repeat", { videoId: "a", author: "甲", topics: ["旅行"], watchProgress: { percent: 100 } }),
      video("b", { author: "甲", topics: ["旅行"], watchProgress: { percent: 60 } }),
      video("c", { author: "乙", topics: ["知识"], watchProgress: { percent: 40 } }),
      video("d", { author: "丙", topics: ["美食"], watchProgress: { percent: 20 } }),
      video("e", { author: "丁", topics: ["音乐"], watchProgress: { percent: 80 } }),
    ];
    const result = deriveProfile(
      records(watch, [video("a", { author: "甲" }), video("c", { author: "乙" })], [video("b", { author: "甲" })]),
      [chat("m1", "p1", "2026-08-01"), chat("m2", "p2", "2026-08-02")],
    );

    expect(result.metrics.uniqueWatched).toBe(5);
    expect(result.metrics.likeRate).toBe(40);
    expect(result.metrics.favoriteRate).toBe(20);
    expect(result.metrics.completion).toBeCloseTo(63.3333, 3);
    expect(result.metrics.chatPeople).toBe(2);
    expect(result.metrics.chatFrequency).toBe(1);
  });

  it("selects a title from broad topic and creator coverage", () => {
    const watch = Array.from({ length: 20 }, (_, index) => video(`w-${index}`, {
      author: `作者-${index}`,
      topics: [`词条-${index % 8}`],
      watchProgress: { percent: 60 },
    }));
    const chats = Array.from({ length: 10 }, (_, index) => chat(`m-${index}`, `p-${index % 3}`, `2026-08-${String(index % 2 + 1).padStart(2, "0")}`));
    const result = deriveProfile(records(watch), chats);
    expect(result.title).toBe("万象漫游者");
  });

  it("selects depth, curation and social titles for their distinct signals", () => {
    const deepWatch = Array.from({ length: 20 }, (_, index) => video(`deep-${index}`, {
      author: `熟悉作者-${index % 2}`,
      topics: [`主题-${index % 2}`],
      watchProgress: { percent: 85 },
    }));
    const deep = deriveProfile(records(deepWatch, [], deepWatch.slice(0, 3)));
    expect(deep.title).toBe("深度沉浸者");

    const curatedWatch = Array.from({ length: 20 }, (_, index) => video(`keep-${index}`, {
      author: `作者-${index % 3}`,
      topics: [`主题-${index % 3}`],
      watchProgress: { percent: 50 },
    }));
    const curated = deriveProfile(records(curatedWatch, curatedWatch.slice(0, 8), curatedWatch.slice(0, 3)));
    expect(curated.title).toBe("珍藏策展人");

    const socialWatch = Array.from({ length: 20 }, (_, index) => video(`social-${index}`, {
      author: `作者-${index % 6}`,
      topics: [`主题-${index % 5}`],
      watchProgress: { percent: 60 },
    }));
    const socialChats = Array.from({ length: 30 }, (_, index) => chat(`social-m-${index}`, `p-${index % 6}`, `2026-08-${String(index % 3 + 1).padStart(2, "0")}`));
    const social = deriveProfile(records(socialWatch), socialChats);
    expect(social.title).toBe("社交回响者");
  });

  it("uses the balanced and low-signal fallbacks", () => {
    const balancedWatch = Array.from({ length: 24 }, (_, index) => video(`balanced-${index}`, {
      author: `作者-${index % 12}`,
      topics: [`主题-${index % 8}`],
      watchProgress: { percent: 82 },
    }));
    const balanced = deriveProfile(
      records(balancedWatch, balancedWatch.slice(0, 8), balancedWatch.slice(0, 5)),
      Array.from({ length: 30 }, (_, index) => chat(`balanced-m-${index}`, `p-${index % 8}`, `2026-08-${String(index % 5 + 1).padStart(2, "0")}`)),
    );
    expect(balanced.title).toBe("多维共鸣者");

    const quiet = deriveProfile(records(Array.from({ length: 6 }, (_, index) => video(`quiet-${index}`, { watchProgress: { percent: 15 } }))));
    expect(quiet.title).toBe("静默观测者");

    const pending = deriveProfile(records([video("one")], [], []), [] as ChatMessage[], [] as ChatConversationSummary[]);
    expect(pending.title).toBe("等待更多足迹");
  });

  it("uses the latest watch as the seven-day boundary and applies it to likes/favorites", () => {
    const watch = [
      video("old", { occurredAt: "2026-08-01T00:00:00Z" }),
      video("recent-a", { occurredAt: "2026-08-05T00:00:00Z" }),
      video("recent-b", { occurredAt: "2026-08-10T00:00:00Z" }),
    ];
    const result = deriveProfile(records(
      watch,
      [
        video("old", { occurredAt: "2026-08-01T01:00:00Z" }),
        video("recent-a", { occurredAt: "2026-08-05T01:00:00Z" }),
      ],
      [
        video("old", { occurredAt: "2026-08-01T02:00:00Z" }),
        video("recent-b", { occurredAt: "2026-08-09T02:00:00Z" }),
      ],
    ));

    expect(result.metrics.windowed).toBe(true);
    expect(result.metrics.windowLimited).toBe(false);
    expect(result.metrics.windowStartAt).toBe("2026-08-03T00:00:00.000Z");
    expect(result.metrics.windowEndAt).toBe("2026-08-10T00:00:00.000Z");
    expect(result.metrics.windowObservedDays).toBe(7);
    expect(result.metrics.windowWatchRecords).toBe(2);
    expect(result.metrics.windowLikeRecords).toBe(1);
    expect(result.metrics.windowFavoriteRecords).toBe(1);
    expect(result.metrics.uniqueWatched).toBe(2);
    expect(result.metrics.likeRate).toBe(50);
    expect(result.metrics.favoriteRate).toBe(50);
  });

  it("shrinks the keep window to a short watch-history span", () => {
    const watch = [
      video("first", { occurredAt: "2026-08-08T00:00:00Z" }),
      video("second", { occurredAt: "2026-08-10T00:00:00Z" }),
    ];
    const result = deriveProfile(records(
      watch,
      [
        video("first", { occurredAt: "2026-08-07T23:00:00Z" }),
        video("second", { occurredAt: "2026-08-09T00:00:00Z" }),
      ],
      [
        video("first", { occurredAt: "2026-08-07T23:00:00Z" }),
        video("second", { occurredAt: "2026-08-09T00:00:00Z" }),
      ],
    ));

    expect(result.metrics.windowLimited).toBe(true);
    expect(result.metrics.windowStartAt).toBe("2026-08-08T00:00:00.000Z");
    expect(result.metrics.windowEndAt).toBe("2026-08-10T00:00:00.000Z");
    expect(result.metrics.windowObservedDays).toBe(2);
    expect(result.metrics.windowLikeRecords).toBe(1);
    expect(result.metrics.windowFavoriteRecords).toBe(1);
    expect(result.metrics.likeRate).toBe(50);
    expect(result.metrics.favoriteRate).toBe(50);
  });

  it("supports an explicit all-period derivation for report-level axes", () => {
    const watch = [
      video("old", { occurredAt: "2026-08-01T00:00:00Z" }),
      video("new", { occurredAt: "2026-08-10T00:00:00Z" }),
    ];
    const result = deriveProfile(
      records(watch, [video("old", { occurredAt: "2026-08-01T01:00:00Z" })]),
      [],
      [],
      { windowDays: null },
    );

    expect(result.metrics.windowed).toBe(false);
    expect(result.metrics.windowRequestedDays).toBeNull();
    expect(result.metrics.windowStartAt).toBeNull();
    expect(result.metrics.uniqueWatched).toBe(2);
    expect(result.metrics.likeRate).toBe(50);
  });

  it("does not claim a recent window when all watch timestamps are unavailable", () => {
    const undated = video("undated", { occurredAt: null, occurredAtSource: "unknown" });
    const result = deriveProfile(records([undated], [undated]));
    expect(result.metrics.windowed).toBe(false);
    expect(result.metrics.windowUnavailable).toBe(true);
    expect(result.metrics.windowWatchRecords).toBe(1);
    expect(result.metrics.likeRate).toBe(100);
    expect(result.reason).toContain("未建立时间窗口");
  });
});
