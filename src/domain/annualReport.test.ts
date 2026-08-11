import { describe, expect, it } from "vitest";

import {
  ANNUAL_CARD_IDS,
  buildAnnualIndex,
  buildAnnualReport,
  type AnnualCreatorsData,
  type AnnualInterestsData,
  type AnnualKeptData,
  type AnnualOverviewData,
  type AnnualRhythmData,
  type AnnualSummaryData,
} from "./annualReport";
import {
  createEmptyPersonalRecords,
  type PersonalRecordCollection,
  type PersonalRecordType,
  type PersonalVideoRecord,
} from "./personalRecords";

function record(
  id: string,
  occurredAt: string | null,
  extra: Partial<PersonalVideoRecord> = {},
): PersonalVideoRecord {
  return {
    id,
    title: `video ${id}`,
    author: null,
    occurredAt,
    url: null,
    ...extra,
  };
}

function recordsOf(
  values: Partial<Record<PersonalRecordType, PersonalVideoRecord[]>>,
): PersonalRecordCollection {
  return { ...createEmptyPersonalRecords(), ...values };
}

function cardData<T>(report: ReturnType<typeof buildAnnualReport>, id: string): T {
  return report.cards.find((card) => card.id === id)!.data as T;
}

describe("annual report domain", () => {
  it("buckets strict action times at the Asia/Shanghai year boundary", () => {
    const records = recordsOf({
      watch_history: [
        record("before", "2024-12-31T15:59:59.000Z", {
          videoId: "before",
          occurredAtSource: "platform_action",
        }),
        record("after", "2024-12-31T16:00:00.000Z", {
          videoId: "after",
          occurredAtSource: "archive_action",
        }),
        record("unknown", "2025-06-01T00:00:00.000Z", {
          videoId: "unknown",
          occurredAtSource: "unknown",
        }),
        record("published-only", null, {
          videoId: "published-only",
          publishedAt: "2025-02-01T00:00:00.000Z",
          occurredAtSource: "platform_action",
        }),
      ],
    });

    const index = buildAnnualIndex(records, { now: "2026-08-11T00:00:00+08:00" });
    expect(index.availableYears).toEqual([2024, 2025]);
    expect(index.defaultYear).toBe(2025);

    const report2025 = buildAnnualReport(index, 2025);
    const overview = cardData<AnnualOverviewData>(report2025, "overview");
    expect(overview.counts.watch).toBe(1);
    expect(overview.dateRange?.start).toBe("2025-01-01");
    expect(report2025.coverage.unknownSourceRecordCount).toBe(1);
    expect(report2025.snapshotCoverage.undatedRecordCount).toBe(1);
    expect(report2025.cards.map((card) => card.id)).toEqual(ANNUAL_CARD_IDS);
  });

  it("parses timestamps without an offset as Shanghai wall time", () => {
    const index = buildAnnualIndex(recordsOf({
      watch_history: [record("local", "2025-01-01 00:30:00", {
        videoId: "local",
        occurredAtSource: "archive_action",
      })],
    }), { now: "2026-01-01T00:00:00+08:00" });

    const entry = index.entries[0]!;
    expect(entry.occurredAt).toBe("2024-12-31T16:30:00.000Z");
    expect(entry.zoned?.date).toBe("2025-01-01");
  });

  it("uses all collected videoId sets for overlaps, not the selected annual rows", () => {
    const records = recordsOf({
      watch_history: [
        record("w-shared", "2025-01-10T00:00:00Z", {
          videoId: "shared",
          occurredAtSource: "platform_action",
        }),
        record("w-triple", "2024-01-10T00:00:00Z", {
          videoId: "triple",
          occurredAtSource: "platform_action",
        }),
        record("legacy-only", "2025-01-10T00:00:00Z", {
          occurredAtSource: "platform_action",
        }),
      ],
      liked_videos: [
        record("l-shared", null, { videoId: "shared" }),
        record("l-triple", null, { videoId: "triple" }),
      ],
      favorite_videos: [record("f-triple", null, { videoId: "triple" })],
    });
    const report = buildAnnualReport(buildAnnualIndex(records), 2025);
    const kept = cardData<AnnualKeptData>(report, "kept");

    expect(kept.scope).toBe("all_snapshot");
    expect(kept.pairwise).toEqual({ watchLiked: 2, watchFavorite: 1, likedFavorite: 1 });
    expect(kept.allThree).toBe(1);
    expect(kept.comparableVideoCount).toBe(2);
    expect(kept.unknownIdRecordCount).toBe(1);
  });

  it("degrades overlap when only legacy category ids are available", () => {
    const report = buildAnnualReport(buildAnnualIndex(recordsOf({
      watch_history: [record("watch_history-same", "2025-01-01T00:00:00Z", { occurredAtSource: "platform_action" })],
      liked_videos: [record("liked_videos-same", null)],
    })), 2025);

    const keptCard = report.cards.find((card) => card.id === "kept")!;
    expect(keptCard.status).toBe("insufficient");
    expect((keptCard.data as AnnualKeptData).comparableVideoCount).toBe(0);
  });

  it("creates a full leap-year calendar and withholds a rhythm persona below thresholds", () => {
    const report = buildAnnualReport(buildAnnualIndex(recordsOf({
      watch_history: [record("one", "2024-02-29T01:00:00Z", {
        videoId: "one",
        occurredAtSource: "platform_action",
      })],
    }), { now: "2025-01-01T00:00:00+08:00" }), 2024);

    const overview = cardData<AnnualOverviewData>(report, "overview");
    const rhythmCard = report.cards.find((card) => card.id === "rhythm")!;
    const rhythm = rhythmCard.data as AnnualRhythmData;
    expect(overview.calendar).toHaveLength(366);
    expect(overview.calendar.find((day) => day.date === "2024-02-29")?.count).toBe(1);
    expect(rhythmCard.status).toBe("insufficient");
    expect(rhythm.personality).toBeNull();
    expect(rhythm.heatmap).toHaveLength(168);
  });

  it("uses deterministic tie-breaking and reuses card results in Bento", () => {
    const watch: PersonalVideoRecord[] = [];
    for (let day = 1; day <= 14; day += 1) {
      const padded = String(day).padStart(2, "0");
      watch.push(record(`a-${day}`, `2025-01-${padded}T04:00:00Z`, {
        videoId: `a-${day}`,
        author: day % 2 ? "阿青" : "北川",
        authorId: day % 2 ? "author-a" : "author-b",
        occurredAtSource: "platform_action",
        topics: day === 1 ? ["旅行"] : [],
        durationSeconds: 30,
      }));
    }
    for (let index = 14; index < 20; index += 1) {
      watch.push(record(`extra-${index}`, "2025-01-14T04:00:00Z", {
        videoId: `extra-${index}`,
        author: index % 2 ? "阿青" : "北川",
        authorId: index % 2 ? "author-a" : "author-b",
        occurredAtSource: "platform_action",
        title: index === 14 ? "#旅行 的一天" : `video ${index}`,
      }));
    }

    const report = buildAnnualReport(buildAnnualIndex(recordsOf({ watch_history: watch }), {
      now: "2026-01-01T00:00:00+08:00",
    }), 2025);
    const rhythm = cardData<AnnualRhythmData>(report, "rhythm");
    const creators = cardData<AnnualCreatorsData>(report, "creators");
    const interests = cardData<AnnualInterestsData>(report, "interests");
    const overview = cardData<AnnualOverviewData>(report, "overview");
    const summary = cardData<AnnualSummaryData>(report, "summary");

    expect(report.cards.find((card) => card.id === "rhythm")?.status).toBe("ok");
    expect(rhythm.personality).not.toBeNull();
    expect(creators.top.map((creator) => creator.name)).toEqual(["阿青", "北川"]);
    expect(interests.topics[0]).toEqual({ name: "旅行", count: 2 });
    expect(summary.metrics.activeDays).toBe(overview.activeDays);
    expect(summary.metrics.topCreator).toEqual(creators.top[0]);
    expect(summary.metrics.topTopic).toEqual(interests.topics[0]);
  });

  it("returns explicit empty and current-year states", () => {
    const emptyIndex = buildAnnualIndex(createEmptyPersonalRecords(), {
      now: "2026-08-11T12:00:00+08:00",
      collectionState: "partial",
      warnings: ["watch history pagination incomplete"],
    });
    const report = buildAnnualReport(emptyIndex, 2026);

    expect(emptyIndex.defaultYear).toBeNull();
    expect(report.status).toBe("empty");
    expect(report.isCurrentPartialYear).toBe(true);
    expect(report.periodLabel).toContain("截至当前");
    expect(report.coverage.partial).toBe(true);
    expect(report.cards.every((card) => card.status === "insufficient")).toBe(true);
  });

  it("can explicitly classify legacy dates by snapshot source", () => {
    const archiveIndex = buildAnnualIndex(recordsOf({
      watch_history: [record("legacy", "2025-02-01T00:00:00Z")],
    }), { source: "archive", now: "2026-01-01T00:00:00+08:00" });
    expect(archiveIndex.availableYears).toEqual([2025]);

    const strictIndex = buildAnnualIndex(recordsOf({
      watch_history: [record("legacy", "2025-02-01T00:00:00Z")],
    }));
    expect(strictIndex.availableYears).toEqual([]);
  });

  it("merges duplicate metadata without discarding an existing valid action time", () => {
    const index = buildAnnualIndex(recordsOf({
      watch_history: [
        record("old", "2025-03-01T00:00:00Z", {
          title: "older title",
          videoId: "same-video",
          occurredAtSource: "platform_action",
          topics: ["topic-a"],
          stats: { diggCount: 1 },
        }),
        record("new", null, {
          title: "richer title",
          videoId: "same-video",
          occurredAtSource: "unknown",
          coverUrl: "https://p3.douyinpic.com/example.jpg",
          topics: ["topic-b"],
          stats: { diggCount: 3, commentCount: 2 },
        }),
      ],
    }));

    const merged = index.uniqueByType.watch_history[0]!;
    expect(merged.timestamp).not.toBeNull();
    expect(merged.occurredAtSource).toBe("platform_action");
    expect(merged.record.title).toBe("richer title");
    expect(merged.record.topics).toEqual(["topic-a", "topic-b"]);
    expect(merged.record.stats).toMatchObject({ diggCount: 3, commentCount: 2 });
  });
});
