import { describe, expect, it } from "vitest";

import { deriveSurpriseInsights } from "./surpriseInsights";
import { createEmptyPersonalRecords, type PersonalRecordCollection, type PersonalVideoRecord } from "./personalRecords";
import type { ChatMessage } from "./chatRecords";

const NOW = "2026-08-22T12:00:00.000+08:00";

function record(id: string, extra: Partial<PersonalVideoRecord> = {}): PersonalVideoRecord {
  return {
    id,
    title: id,
    author: null,
    occurredAt: NOW,
    occurredAtSource: "platform_action",
    url: null,
    ...extra,
  };
}

function recordsOf(watch_history: PersonalVideoRecord[], liked_videos: PersonalVideoRecord[] = [], favorite_videos: PersonalVideoRecord[] = []): PersonalRecordCollection {
  return { ...createEmptyPersonalRecords(), watch_history, liked_videos, favorite_videos };
}

function chat(id: string, sentAt = NOW): ChatMessage {
  return { id, conversationId: null, conversationName: null, senderId: null, senderName: null, sentAt, type: "text", text: null, mediaUrl: null, share: null, callDurationSeconds: null };
}

describe("surprise insights", () => {
  it("returns pending cards without data", () => {
    const insights = deriveSurpriseInsights(createEmptyPersonalRecords());
    expect(insights).toHaveLength(3);
    expect(insights.every((insight) => insight.status === "pending" && insight.title === "待观测" && insight.text.includes("待观测"))).toBe(true);
  });

  it("describes a high-volume, shallow watch sample", () => {
    const watch = Array.from({ length: 12 }, (_, index) => record(`watch-${index}`, { watchProgress: { percent: 20 + index % 3 } }));
    const [depth] = deriveSurpriseInsights(recordsOf(watch));
    expect(depth).toMatchObject({ id: "depth-contrast", title: "看得多 ≠ 留得久", status: "observed" });
    expect(depth.evidence).toMatchObject({ watchCount: 12, progressSamples: 12, completion: 21 });
  });

  it("links repeated watches and sparse keeps without inventing a causal claim", () => {
    const watch = ["a", "a", "b", "b", "c", "c", "d", "e"].map((id) => record(id, { videoId: id, watchProgress: { percent: 70 } }));
    const [_, returnInsight] = deriveSurpriseInsights(recordsOf(watch, [record("keep-a", { videoId: "a" })]), [chat("chat-1")]);
    expect(returnInsight).toMatchObject({ id: "return-depth", title: "收藏少但回访深", status: "observed" });
    expect(returnInsight.evidence).toMatchObject({ repeatedVideos: 3, keptVideos: 1, chatCount: 1 });
    expect(returnInsight.text).toContain("同期还记录到 1 条聊天互动");
  });

  it("compares night and day exploration in Shanghai time", () => {
    const night = [
      record("n1", { videoId: "n1", occurredAt: "2026-08-21T12:00:00.000Z", topics: ["夜景1"], author: "作者1" }),
      record("n2", { videoId: "n2", occurredAt: "2026-08-21T13:00:00.000Z", topics: ["夜景2"], author: "作者2" }),
      record("n3", { videoId: "n3", occurredAt: "2026-08-21T14:00:00.000Z", topics: ["夜景3"], author: "作者3" }),
    ];
    const day = [
      record("d1", { videoId: "d1", occurredAt: "2026-08-21T02:00:00.000Z", topics: ["白天"], author: "作者" }),
      record("d2", { videoId: "d2", occurredAt: "2026-08-21T03:00:00.000Z", topics: ["白天"], author: "作者" }),
      record("d3", { videoId: "d3", occurredAt: "2026-08-21T04:00:00.000Z", topics: ["白天"], author: "作者" }),
    ];
    const [__, ___, nightInsight] = deriveSurpriseInsights(recordsOf([...night, ...day]), [chat("night", "2026-08-21T13:30:00.000Z"), chat("day", "2026-08-21T03:30:00.000Z")]);
    expect(nightInsight).toMatchObject({ id: "night-exploration", title: "夜间更容易探索", status: "observed" });
    expect(nightInsight.evidence).toMatchObject({ nightRecords: 3, dayRecords: 3, nightTopics: 3, dayTopics: 1, nightChat: 1, dayChat: 1 });
  });

  it("keeps the night comparison pending when dates or metadata are insufficient", () => {
    const watch = [
      record("dated", { occurredAt: "not-a-date", topics: ["未知"] }),
      record("undated", { occurredAt: null, topics: ["未知"] }),
      record("unknown-source", { occurredAt: NOW, occurredAtSource: "unknown", topics: ["未知"] }),
    ];
    const insight = deriveSurpriseInsights(recordsOf(watch))[2];
    expect(insight).toMatchObject({ id: "night-exploration", title: "待观测", status: "pending" });
  });
});
