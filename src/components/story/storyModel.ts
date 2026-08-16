import {
  ANNUAL_TIME_ZONE,
  buildAnnualIndex,
  type AnnualIndexedRecord,
} from "../../domain/annualReport";
import type {
  PersonalRecordCollection,
  PersonalRecordType,
  PersonalVideoRecord,
} from "../../domain/personalRecords";

const LIST_ORDER: readonly PersonalRecordType[] = [
  "watch_history",
  "liked_videos",
  "favorite_videos",
];
const RELIABLE_TIME_SOURCES = new Set(["platform_action", "archive_action"]);
const OPENING_TAG_MIN = 8;
const OPENING_TAG_MAX = 12;
const TOPIC_RECORD_LIMIT = 3;
const TOPIC_CREATOR_LIMIT = 5;
const OVERLAP_RECORD_LIMIT = 3;

export type StoryOpeningTagSource = "topic" | "author";
export type StoryOverlapKey = "watchLiked" | "watchFavorite" | "likedFavorite" | "allThree";

export interface StoryContentItem {
  key: string;
  record: PersonalVideoRecord;
  lists: PersonalRecordType[];
  topics: string[];
  videoId: string | null;
  comparableVideoId: boolean;
  occurredAt: string | null;
  reliableTime: boolean;
  zonedDate: string | null;
  zonedHour: number | null;
}

export interface StoryOpeningTag {
  key: string;
  name: string;
  count: number;
  source: StoryOpeningTagSource;
}

export interface StoryStream {
  type: PersonalRecordType;
  recordCount: number;
  uniqueCount: number;
  representative: StoryContentItem | null;
  records: StoryContentItem[];
}

export interface StoryHour {
  hour: number;
  count: number;
  uniqueCount: number;
  topTopic: string | null;
  topTopicCount: number;
  representative: StoryContentItem | null;
}

export interface StoryTopicCreator {
  key: string;
  name: string;
  authorId: string | null;
  count: number;
  representative: StoryContentItem;
}

export interface StoryTopic {
  name: string;
  count: number;
  records: StoryContentItem[];
  creatorCount: number;
  creators: StoryTopicCreator[];
}

export interface StoryOverlap {
  key: StoryOverlapKey;
  count: number;
  records: StoryContentItem[];
}

export interface StoryModel {
  timezone: typeof ANNUAL_TIME_ZONE;
  openingTags: StoryOpeningTag[];
  streams: Record<PersonalRecordType, StoryStream>;
  hours: StoryHour[];
  topics: StoryTopic[];
  overlaps: Record<StoryOverlapKey, StoryOverlap>;
}

interface StoryBuildContext {
  entriesByKey: Map<string, AnnualIndexedRecord[]>;
}

interface RankedName {
  name: string;
  count: number;
}

export function buildStoryModel(records: PersonalRecordCollection): StoryModel {
  const index = buildAnnualIndex(records);
  const context = createBuildContext(index.entries);

  return {
    timezone: ANNUAL_TIME_ZONE,
    openingTags: buildOpeningTags(context),
    streams: buildStreams(index.byType, index.uniqueByType, context),
    hours: buildHours(index.byType.watch_history, context),
    topics: buildTopics(context),
    overlaps: buildOverlaps(index.snapshotSets, context),
  };
}

function createBuildContext(entries: readonly AnnualIndexedRecord[]): StoryBuildContext {
  const entriesByKey = new Map<string, AnnualIndexedRecord[]>();
  for (const entry of entries) {
    const key = stableContentKey(entry);
    const grouped = entriesByKey.get(key) ?? [];
    grouped.push(entry);
    entriesByKey.set(key, grouped);
  }
  return { entriesByKey };
}

function stableContentKey(entry: AnnualIndexedRecord): string {
  if (entry.videoId) return `video:${entry.videoId}`;
  if (entry.comparisonKey.startsWith("url:")) return entry.comparisonKey;
  return `record:${entry.type}:${entry.record.id}`;
}

function isReliableTime(entry: AnnualIndexedRecord): boolean {
  return entry.timestamp !== null
    && entry.zoned !== null
    && RELIABLE_TIME_SOURCES.has(entry.occurredAtSource);
}

function contentItem(entry: AnnualIndexedRecord, context: StoryBuildContext): StoryContentItem {
  const key = stableContentKey(entry);
  const grouped = context.entriesByKey.get(key) ?? [entry];
  const lists = LIST_ORDER.filter((type) => grouped.some((candidate) => candidate.type === type));
  const topics = uniqueSorted(grouped.flatMap((candidate) => explicitTopics(candidate.record)));
  const comparable = grouped.find((candidate) => candidate.hasComparableVideoId && candidate.videoId);

  return {
    key,
    record: entry.record,
    lists,
    topics,
    videoId: entry.videoId,
    comparableVideoId: Boolean(comparable),
    occurredAt: entry.occurredAt,
    reliableTime: isReliableTime(entry),
    zonedDate: entry.zoned?.date ?? null,
    zonedHour: entry.zoned?.hour ?? null,
  };
}

function buildOpeningTags(context: StoryBuildContext): StoryOpeningTag[] {
  const topicCounts = new Map<string, number>();
  const authorCounts = new Map<string, number>();

  for (const [, grouped] of sortedEntryGroups(context)) {
    const watchEntries = grouped.filter((entry) => entry.type === "watch_history");
    if (watchEntries.length === 0) continue;
    for (const topic of uniqueSorted(watchEntries.flatMap((entry) => explicitTopics(entry.record)))) {
      topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
    }
    const author = firstAuthor(watchEntries);
    if (author) authorCounts.set(author, (authorCounts.get(author) ?? 0) + 1);
  }

  const result = rankCounts(topicCounts).slice(0, OPENING_TAG_MAX).map<StoryOpeningTag>((item) => ({
    key: `topic:${item.name}`,
    name: item.name,
    count: item.count,
    source: "topic",
  }));

  if (result.length < OPENING_TAG_MIN) {
    const existingNames = new Set(result.map((item) => item.name));
    for (const item of rankCounts(authorCounts)) {
      if (existingNames.has(item.name)) continue;
      result.push({ key: `author:${item.name}`, name: item.name, count: item.count, source: "author" });
      existingNames.add(item.name);
      if (result.length >= OPENING_TAG_MIN) break;
    }
  }

  return result.slice(0, OPENING_TAG_MAX);
}

function buildStreams(
  byType: Record<PersonalRecordType, AnnualIndexedRecord[]>,
  uniqueByType: Record<PersonalRecordType, AnnualIndexedRecord[]>,
  context: StoryBuildContext,
): Record<PersonalRecordType, StoryStream> {
  const makeStream = (type: PersonalRecordType): StoryStream => {
    const records = stableEntryOrder(byType[type]).map((entry) => contentItem(entry, context));
    const representative = records[0] ?? null;
    return {
      type,
      recordCount: byType[type].length,
      uniqueCount: uniqueByType[type].length,
      representative,
      records,
    };
  };

  return {
    watch_history: makeStream("watch_history"),
    liked_videos: makeStream("liked_videos"),
    favorite_videos: makeStream("favorite_videos"),
  };
}

function buildHours(entries: readonly AnnualIndexedRecord[], context: StoryBuildContext): StoryHour[] {
  const byHour = Array.from({ length: 24 }, () => [] as AnnualIndexedRecord[]);
  for (const entry of entries) {
    if (!isReliableTime(entry)) continue;
    byHour[entry.zoned!.hour]!.push(entry);
  }

  return byHour.map((hourEntries, hour) => {
    const orderedEntries = stableEntryOrder(hourEntries);
    const topicCounts = new Map<string, number>();
    for (const entry of orderedEntries) {
      for (const topic of explicitTopics(entry.record)) {
        topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
      }
    }
    const topTopic = rankCounts(topicCounts)[0] ?? null;
    const representativeEntry = topTopic
      ? orderedEntries.find((entry) => explicitTopics(entry.record).includes(topTopic.name)) ?? orderedEntries[0]
      : orderedEntries[0];

    return {
      hour,
      count: orderedEntries.length,
      uniqueCount: new Set(orderedEntries.map(stableContentKey)).size,
      topTopic: topTopic?.name ?? null,
      topTopicCount: topTopic?.count ?? 0,
      representative: representativeEntry ? contentItem(representativeEntry, context) : null,
    };
  });
}

function buildTopics(context: StoryBuildContext): StoryTopic[] {
  const recordsByTopic = new Map<string, StoryContentItem[]>();
  for (const [, grouped] of sortedEntryGroups(context)) {
    const entry = stableEntryOrder(grouped)[0]!;
    const item = contentItem(entry, context);
    for (const topic of item.topics) {
      const items = recordsByTopic.get(topic) ?? [];
      items.push(item);
      recordsByTopic.set(topic, items);
    }
  }

  return [...recordsByTopic.entries()].map(([name, items]) => {
    const orderedItems = stableContentOrder(items);
    const creators = creatorsForTopic(orderedItems);
    return {
      name,
      count: orderedItems.length,
      records: orderedItems.slice(0, TOPIC_RECORD_LIMIT),
      creatorCount: creators.length,
      creators: creators.slice(0, TOPIC_CREATOR_LIMIT),
    };
  }).sort((left, right) => right.count - left.count || compareText(left.name, right.name));
}

function creatorsForTopic(items: readonly StoryContentItem[]): StoryTopicCreator[] {
  const groups = new Map<string, { name: string; authorId: string | null; records: StoryContentItem[] }>();
  for (const item of items) {
    const name = cleanText(item.record.author);
    if (!name) continue;
    const authorId = cleanText(item.record.authorId) ?? null;
    const key = authorId ? `author-id:${authorId}` : `author-name:${name.toLocaleLowerCase("zh-Hans")}`;
    const group = groups.get(key) ?? { name, authorId, records: [] };
    group.records.push(item);
    groups.set(key, group);
  }

  return [...groups.entries()].map(([key, group]) => ({
    key,
    name: group.name,
    authorId: group.authorId,
    count: group.records.length,
    representative: stableContentOrder(group.records)[0]!,
  })).sort((left, right) => right.count - left.count || compareText(left.name, right.name) || compareText(left.key, right.key));
}

function buildOverlaps(
  snapshotSets: ReturnType<typeof buildAnnualIndex>["snapshotSets"],
  context: StoryBuildContext,
): Record<StoryOverlapKey, StoryOverlap> {
  const watch = new Set(snapshotSets.watch_history.videoIds);
  const liked = new Set(snapshotSets.liked_videos.videoIds);
  const favorite = new Set(snapshotSets.favorite_videos.videoIds);
  const intersection = (...sets: Set<string>[]) => [...sets[0]!].filter((id) => sets.slice(1).every((set) => set.has(id))).sort(compareText);
  const comparableEntryByVideoId = new Map<string, AnnualIndexedRecord>();

  for (const [, grouped] of sortedEntryGroups(context)) {
    const entry = stableEntryOrder(grouped).find((candidate) => candidate.hasComparableVideoId && candidate.videoId);
    if (entry?.videoId && !comparableEntryByVideoId.has(entry.videoId)) comparableEntryByVideoId.set(entry.videoId, entry);
  }

  const makeOverlap = (key: StoryOverlapKey, ids: string[]): StoryOverlap => ({
    key,
    count: ids.length,
    records: ids
      .map((id) => comparableEntryByVideoId.get(id))
      .filter((entry): entry is AnnualIndexedRecord => Boolean(entry))
      .slice(0, OVERLAP_RECORD_LIMIT)
      .map((entry) => contentItem(entry, context)),
  });

  return {
    watchLiked: makeOverlap("watchLiked", intersection(watch, liked)),
    watchFavorite: makeOverlap("watchFavorite", intersection(watch, favorite)),
    likedFavorite: makeOverlap("likedFavorite", intersection(liked, favorite)),
    allThree: makeOverlap("allThree", intersection(watch, liked, favorite)),
  };
}

function explicitTopics(record: PersonalVideoRecord): string[] {
  const source = record as unknown as Record<string, unknown>;
  const rawTopics = source.topics ?? source.hashtags ?? source.hashTags;
  const values = Array.isArray(rawTopics) ? rawTopics : rawTopics === undefined ? [] : [rawTopics];
  const topics: string[] = [];

  for (const value of values) {
    const topic = cleanText(value, 100)?.replace(/^#/u, "").trim();
    if (topic && !topics.includes(topic)) topics.push(topic);
    if (topics.length >= 100) break;
  }

  const title = cleanText(source.title);
  if (title) {
    for (const match of title.matchAll(/#([^#\s,，。.!！?？:：;；]{1,50})/gu)) {
      const topic = cleanText(match[1], 100)?.replace(/^#/u, "");
      if (topic && !topics.includes(topic)) topics.push(topic);
      if (topics.length >= 100) break;
    }
  }

  return topics;
}

function cleanText(value: unknown, maxLength = 500): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const result = String(value).trim();
  return result && result.length <= maxLength ? result : null;
}

function firstAuthor(entries: readonly AnnualIndexedRecord[]): string | null {
  for (const entry of stableEntryOrder(entries)) {
    const author = cleanText(entry.record.author);
    if (author) return author;
  }
  return null;
}

function sortedEntryGroups(context: StoryBuildContext): Array<[string, AnnualIndexedRecord[]]> {
  return [...context.entriesByKey.entries()].sort(([left], [right]) => compareText(left, right));
}

function stableEntryOrder(entries: readonly AnnualIndexedRecord[]): AnnualIndexedRecord[] {
  return [...entries].sort((left, right) => {
    const leftTime = left.timestamp ?? Number.POSITIVE_INFINITY;
    const rightTime = right.timestamp ?? Number.POSITIVE_INFINITY;
    return leftTime - rightTime
      || compareText(stableContentKey(left), stableContentKey(right))
      || compareText(left.record.id, right.record.id);
  });
}

function stableContentOrder(items: readonly StoryContentItem[]): StoryContentItem[] {
  return [...items].sort((left, right) => {
    const leftTime = left.occurredAt ? Date.parse(left.occurredAt) : Number.POSITIVE_INFINITY;
    const rightTime = right.occurredAt ? Date.parse(right.occurredAt) : Number.POSITIVE_INFINITY;
    const timeOrder = (Number.isFinite(leftTime) ? leftTime : Number.POSITIVE_INFINITY)
      - (Number.isFinite(rightTime) ? rightTime : Number.POSITIVE_INFINITY);
    return timeOrder || compareText(left.key, right.key);
  });
}

function rankCounts(counts: ReadonlyMap<string, number>): RankedName[] {
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count || compareText(left.name, right.name));
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareText);
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, "zh-Hans", { sensitivity: "base", numeric: true });
}
