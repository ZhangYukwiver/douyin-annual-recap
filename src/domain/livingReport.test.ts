import { describe, expect, it } from "vitest";

import {
  buildLivingReport,
  type LivingChapter,
} from "./livingReport";
import {
  createEmptyPersonalRecords,
  type PersonalRecordCollection,
  type PersonalRecordType,
  type PersonalVideoRecord,
} from "./personalRecords";

const NOW = "2026-08-22T12:00:00.000+08:00";
const DAY_MS = 24 * 60 * 60 * 1_000;

function record(id: string, occurredAt: string | null, extra: Partial<PersonalVideoRecord> = {}): PersonalVideoRecord {
  return {
    id,
    title: `视频 ${id}`,
    author: null,
    occurredAt,
    url: null,
    occurredAtSource: occurredAt ? "platform_action" : "unknown",
    ...extra,
  };
}

function recordsOf(values: Partial<Record<PersonalRecordType, PersonalVideoRecord[]>>): PersonalRecordCollection {
  return { ...createEmptyPersonalRecords(), ...values };
}

function daysAgo(days: number): string {
  return new Date(Date.parse(NOW) - days * DAY_MS).toISOString();
}

function chapter(report: ReturnType<typeof buildLivingReport>, id: LivingChapter["id"]): LivingChapter {
  return report.chapters.find((item) => item.id === id)!;
}

describe("living report domain", () => {
  it("compares rolling windows and emits evidence-backed signals", () => {
    const current = Array.from({ length: 22 }, (_, index) => record(`current-${index}`, daysAgo(index % 8), {
      videoId: `current-${index}`,
      author: index % 2 ? "探索作者" : "旅行作者",
      authorId: index % 2 ? "creator-explore" : "creator-travel",
      topics: [index % 3 ? "旅行" : "摄影"],
      durationSeconds: 60,
      watchProgress: { percent: index % 2 ? 72 : 48 },
      publishedAt: daysAgo((index % 8) + 3),
    }));
    const comparison = Array.from({ length: 12 }, (_, index) => record(`previous-${index}`, daysAgo(35 + (index % 8)), {
      videoId: `previous-${index}`,
      author: "摄影作者",
      authorId: "creator-photo",
      topics: [index % 3 ? "摄影" : "旅行"],
    }));
    const report = buildLivingReport(recordsOf({
      watch_history: [...current, ...comparison],
      liked_videos: [record("shared-liked", daysAgo(2), { videoId: "current-0", topics: ["旅行"] })],
      favorite_videos: [record("shared-favorite", daysAgo(1), { videoId: "current-0", topics: ["旅行"] })],
    }), {
      now: NOW,
      source: "collector",
      sourceUpdatedAt: NOW,
      collectionState: "complete",
    });

    expect(report.status).toBe("ok");
    expect(report.usedFallbackWindow).toBe(false);
    expect(report.currentWindow.days).toBe(30);
    expect(report.freshness).toBe("fresh");
    expect(chapter(report, "current").status).toBe("ok");
    expect(chapter(report, "current").signals[0]?.evidence.length).toBeGreaterThan(0);
    expect(chapter(report, "shift").signals.some((signal) => signal.label === "#旅行" && signal.direction === "up")).toBe(true);
    expect(chapter(report, "kept").signals[0]?.label).toBe("三类列表都有");
    expect(report.profile.axes.find((axis) => axis.id === "depth")?.value).not.toBeNull();
    expect(report.profile.axes.find((axis) => axis.id === "newness")?.value).not.toBeNull();
  });

  it("widens the current window when recent data is sparse", () => {
    const report = buildLivingReport(recordsOf({
      watch_history: Array.from({ length: 12 }, (_, index) => record(`older-${index}`, daysAgo(60 + (index % 4)), {
        videoId: `older-${index}`,
        topics: ["旧内容"],
      })),
    }), { now: NOW, source: "collector", sourceUpdatedAt: daysAgo(3) });

    expect(report.usedFallbackWindow).toBe(true);
    expect(report.freshness).toBe("stale");
    expect(report.currentWindow.days).toBe(90);
    expect(chapter(report, "continuation").notice).toContain("扩大到最近 90 天");
    expect(chapter(report, "shift").status).toBe("insufficient");
  });

  it("keeps partial and undated data explicit", () => {
    const report = buildLivingReport(recordsOf({
      watch_history: [record("dated", daysAgo(2), { videoId: "dated" })],
      liked_videos: [record("undated", null, { videoId: "undated", topics: ["无日期"] })],
    }), {
      now: NOW,
      source: "collector",
      sourceUpdatedAt: NOW,
      collectionState: "partial",
      warnings: ["本次读取只完成观看历史"],
    });

    expect(report.status).toBe("partial");
    expect(report.freshness).toBe("partial");
    expect(report.coverage.undatedRecordCount).toBe(1);
    expect(chapter(report, "continuation").narrative).toContain("没有完整结束");
    expect(chapter(report, "current").status).toBe("insufficient");
    expect(chapter(report, "rhythm").status).toBe("insufficient");
  });

  it("returns an empty report without inventing a profile", () => {
    const report = buildLivingReport(createEmptyPersonalRecords(), { now: NOW });

    expect(report.status).toBe("empty");
    expect(report.freshness).toBe("unknown");
    expect(report.profile.axes.every((axis) => axis.value === null)).toBe(true);
    expect(chapter(report, "current").status).toBe("insufficient");
  });

  it("keeps Shanghai window boundaries and unreliable times out of narratives", () => {
    const reliable = Array.from({ length: 12 }, (_, index) => record(`reliable-${index}`, index < 6
      ? "2026-07-23T15:59:59.000Z"
      : "2026-07-23T16:00:00.000Z", {
      videoId: `reliable-${index}`,
      occurredAtSource: "platform_action",
    }));
    const report = buildLivingReport(recordsOf({
      watch_history: [...reliable, record("window-boundary", new Date(Date.parse(NOW) - 30 * DAY_MS).toISOString(), {
        videoId: "window-boundary",
        occurredAtSource: "platform_action",
      })],
      liked_videos: [record("unknown-source", "2026-08-01T00:00:00Z", { videoId: "unknown-source", occurredAtSource: "unknown" })],
      favorite_videos: [record("missing-time", null, { videoId: "missing-time", occurredAtSource: "unknown" })],
    }), { now: NOW, source: "collector", sourceUpdatedAt: NOW });

    expect(report.currentWindow.recordCount).toBe(13);
    expect(report.comparisonWindow.recordCount).toBe(0);
    expect(report.currentWindow.activeDays).toBe(2);
    expect(report.coverage.recordCount).toBe(15);
    expect(report.coverage.reliableRecordCount).toBe(13);
    expect(report.coverage.unknownSourceRecordCount).toBe(1);
    expect(report.coverage.undatedRecordCount).toBe(1);
    expect(chapter(report, "shift").status).toBe("insufficient");
  });

  it("shows only profile axes with enough source fields", () => {
    const report = buildLivingReport(recordsOf({
      watch_history: Array.from({ length: 20 }, (_, index) => record(`author-${index}`, daysAgo(index % 10), {
        videoId: `author-${index}`,
        author: index % 2 ? "探索作者" : "熟悉作者",
        occurredAtSource: "platform_action",
      })),
    }), { now: NOW, source: "collector", sourceUpdatedAt: NOW });

    expect(report.profile.axes.find((axis) => axis.id === "exploration")?.value).not.toBeNull();
    expect(report.profile.axes.find((axis) => axis.id === "breadth")?.value).not.toBeNull();
    expect(report.profile.axes.find((axis) => axis.id === "depth")?.value).toBeNull();
    expect(report.profile.axes.find((axis) => axis.id === "newness")?.value).toBeNull();
    expect(chapter(report, "profile").narrative).toContain("熟悉");
  });

  it("does not turn a flat topic ratio into a trend conclusion", () => {
    const report = buildLivingReport(recordsOf({
      watch_history: [
        ...Array.from({ length: 10 }, (_, index) => record(`flat-current-${index}`, daysAgo(index), {
          videoId: `flat-current-${index}`,
          topics: ["稳定"],
        })),
        ...Array.from({ length: 10 }, (_, index) => record(`flat-before-${index}`, daysAgo(35 + index), {
          videoId: `flat-before-${index}`,
          topics: ["稳定"],
        })),
      ],
    }), { now: NOW, source: "collector", sourceUpdatedAt: NOW });

    expect(chapter(report, "shift").status).toBe("insufficient");
    expect(chapter(report, "shift").signals).toHaveLength(0);
  });

  it("keeps a disappearing topic as a downward signal", () => {
    const report = buildLivingReport(recordsOf({
      watch_history: [
        ...Array.from({ length: 10 }, (_, index) => record(`new-topic-${index}`, daysAgo(index), {
          videoId: `new-topic-${index}`,
          topics: ["新线索"],
        })),
        ...Array.from({ length: 10 }, (_, index) => record(`old-topic-${index}`, daysAgo(35 + index), {
          videoId: `old-topic-${index}`,
          topics: ["旧线索"],
        })),
      ],
    }), { now: NOW, source: "collector", sourceUpdatedAt: NOW });

    expect(chapter(report, "shift").signals).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "#旧线索", direction: "down", count: 0 }),
    ]));
  });
});
