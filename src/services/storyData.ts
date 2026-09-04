import type { ReportModel } from "../components/workspace/ReportWorkspace";
import type { ChatConversationSummary, ChatMessage } from "../domain/chatRecords";
import type { PersonalRecordCollection, PersonalVideoRecord } from "../domain/personalRecords";

// One JSON snapshot handed to the static story page (public/story) through same-origin localStorage.
export const STORY_STORAGE_KEY = "content-insights.story";

export interface StoryRanked { name: string; count: number; share: number }
export interface StoryCard { title: string; author: string | null; coverUrl: string | null; url: string | null; kind: "liked" | "favorite" | "watch" }
export interface StoryConversation { name: string; kind: ChatConversationSummary["kind"]; avatarUrl: string | null; messageCount: number; ownMessageCount: number }
export interface StoryHeatRef { title: string; count: number; url: string | null }
/** Popularity of the content itself (like counts as recorded), never a claim about the person. */
export interface StoryHeat { sampled: number; median: number; hottest: StoryHeatRef; quietest: StoryHeatRef }
/** How old a piece of content already was when the person acted on it. */
export interface StoryAge { sampled: number; medianDays: number; bands: Array<{ label: string; share: number }> }
export interface StoryLength { seconds: number; medianDuration: number | null; longest: { title: string; seconds: number } | null }
export interface StoryChat {
  friendMessages: number;
  callSeconds: number;
  conversations: number;
  /** text / image / share / sticker / call·voice, in the order the page draws them. */
  forms: Array<{ code: string; label: string; count: number; share: number }>;
  top: StoryConversation[];
  share: { title: string | null; author: string | null; coverUrl: string | null; url: string | null } | null;
}

export interface StoryData {
  version: 1;
  generatedAt: string;
  year: number;
  status: ReportModel["status"];
  source: { kind: "collector" | "archive"; updatedAt: string | null; parsedFileCount: number | null; ignoredFileCount: number | null };
  counts: { watch: number; liked: number; favorite: number; chat: number | null; events: number };
  unique: number;
  activeDays: number;
  range: [string, string] | null;
  months: number[];
  hours: number[];
  peakHour: number | null;
  peakDay: string | null;
  timeSources: { platform_action: number; archive_action: number; unknown: number };
  intersection: ReportModel["intersection"];
  /** Shares of watched records finishing ≥90% / 30–90% / <30%; null without progress data. */
  progress: { done: number; mid: number; shallow: number } | null;
  recent: StoryCard[];
  topTopic: StoryRanked | null;
  topics: StoryRanked[];
  topCreator: { name: string; unique: number; avatarUrl: string | null } | null;
  topicsCount: number;
  creators: StoryRanked[];
  creatorsCount: number;
  musics: Array<{ title: string; author: string | null; count: number }>;
  musicsCount: number;
  heat: StoryHeat | null;
  age: StoryAge | null;
  length: StoryLength;
  /** 视频 / 图文 / 直播 shares among records with a known mediaType. */
  media: Array<{ label: string; share: number }> | null;
  /** <1 min / 1–10 min / 10+ min shares among records with a duration. */
  durations: Array<{ label: string; share: number }> | null;
  music: { title: string; author: string | null; count: number } | null;
  chat: StoryChat | null;
  reliableRatio: number;
  caveats: { noTime: number; noVideoId: number; warnings: number };
  profile: { title: string; english: string; reason: string };
}

export interface StoryInput {
  records: PersonalRecordCollection;
  chatMessages: ChatMessage[];
  chatConversations: ChatConversationSummary[];
  source: "collector" | "archive";
  updatedAt: string | null;
  warnings: string[];
  archive?: { parsedFileCount: number; ignoredFileCount: number } | null;
}

type Row = { record: PersonalVideoRecord; type: keyof PersonalRecordCollection };

export function buildStoryData(model: ReportModel, input: StoryInput): StoryData {
  const { records } = input;
  const rows: Row[] = (["watch_history", "liked_videos", "favorite_videos"] as const).flatMap((type) => records[type].map((record) => ({ record, type })));
  const timeSources = { platform_action: 0, archive_action: 0, unknown: 0 };
  const reliable: Array<{ row: Row; time: number }> = [];
  for (const row of rows) {
    const time = validTime(row.record.occurredAt);
    if (time === null || row.record.occurredAtSource === "unknown") timeSources.unknown += 1;
    else if (row.record.occurredAtSource === "archive_action") { timeSources.archive_action += 1; reliable.push({ row, time }); }
    else { timeSources.platform_action += 1; reliable.push({ row, time }); }
  }
  const times = reliable.map((item) => item.time);
  const range: StoryData["range"] = times.length ? [isoDay(Math.min(...times)), isoDay(Math.max(...times))] : null;
  const perDay = new Map<string, number>();
  for (const { time } of reliable) perDay.set(isoDay(time), (perDay.get(isoDay(time)) ?? 0) + 1);
  const peakDay = [...perDay].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;

  const progress = model.progressPercents;
  const bands = progress.length
    ? {
        done: progress.filter((value) => value >= 90).length / progress.length,
        mid: progress.filter((value) => value >= 30 && value < 90).length / progress.length,
        shallow: progress.filter((value) => value < 30).length / progress.length,
      }
    : null;

  const topCreatorName = model.creators[0]?.name ?? null;
  const creatorRows = topCreatorName ? rows.filter(({ record }) => record.author?.trim() === topCreatorName) : [];
  const topCreator = topCreatorName
    ? { name: topCreatorName, unique: new Set(creatorRows.map(({ record }) => recordKey(record))).size, avatarUrl: creatorRows.find(({ record }) => record.authorAvatarUrl)?.record.authorAvatarUrl ?? null }
    : null;

  const known = rows.filter(({ record }) => record.mediaType === "video" || record.mediaType === "image" || record.mediaType === "live");
  const media = shares(known.map(({ record }) => record.mediaType), [["视频", (value) => value === "video"], ["图文", (value) => value === "image"], ["直播", (value) => value === "live"]]);
  const lengths = rows.map(({ record }) => record.durationSeconds).filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0);
  const durations = shares(lengths, [["< 1 分钟", (value) => value < 60], ["1–10 分钟", (value) => value >= 60 && value < 600], ["10 分钟以上", (value) => value >= 600]]);

  const musicCounts = new Map<string, { title: string; author: string | null; count: number }>();
  for (const { record } of rows) {
    const title = record.music?.title?.trim();
    if (!title) continue;
    const key = record.music?.id?.trim() || title;
    const entry = musicCounts.get(key) ?? { title, author: record.music?.author?.trim() || null, count: 0 };
    entry.count += 1;
    musicCounts.set(key, entry);
  }
  const musics = [...musicCounts.values()].sort((a, b) => b.count - a.count || a.title.localeCompare(b.title, "zh-CN"));
  const topMusic = musics[0] ?? null;

  // one entry per content; like counts are a property of the content, so they are reported as a snapshot only
  const heatById = new Map<string, StoryHeatRef>();
  for (const { record } of rows) {
    const count = record.stats?.diggCount;
    if (typeof count !== "number" || !Number.isFinite(count) || count < 0 || heatById.has(recordKey(record))) continue;
    heatById.set(recordKey(record), { title: record.title?.trim() || "未命名内容", count, url: record.url ?? null });
  }
  const heats = [...heatById.values()].sort((a, b) => a.count - b.count);
  const hottest = heats[heats.length - 1], quietest = heats[0];
  const heat: StoryHeat | null = hottest && quietest ? { sampled: heats.length, median: median(heats.map((item) => item.count)), hottest, quietest } : null;

  const ages = reliable.map(({ row, time }) => { const published = validTime(row.record.publishedAt); return published === null ? null : (time - published) / 86_400_000; }).filter((value): value is number => value !== null && value >= 0);
  const age: StoryAge | null = ages.length ? { sampled: ages.length, medianDays: Math.round(median(ages)), bands: shares(ages, [["一周内", (value) => value <= 7], ["三个月内", (value) => value > 7 && value <= 90], ["更早", (value) => value > 90]])! } : null;

  const longestRow = rows.filter(({ record }) => typeof record.durationSeconds === "number" && Number.isFinite(record.durationSeconds)).sort((a, b) => b.record.durationSeconds! - a.record.durationSeconds!)[0];
  const length: StoryLength = { seconds: model.attentionSeconds, medianDuration: lengths.length ? median(lengths) : null, longest: longestRow ? { title: longestRow.record.title?.trim() || "未命名内容", seconds: longestRow.record.durationSeconds! } : null };

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    // The volume is dated by its latest reliable record, not by the report window.
    year: range ? Number(range[1].slice(0, 4)) : model.year,
    status: model.status,
    source: { kind: input.source, updatedAt: input.updatedAt, parsedFileCount: input.archive?.parsedFileCount ?? null, ignoredFileCount: input.archive?.ignoredFileCount ?? null },
    counts: { watch: model.watch, liked: model.liked, favorite: model.favorite, chat: input.source === "collector" ? model.chat : null, events: rows.length },
    unique: model.unique,
    activeDays: model.activeDays,
    range,
    months: model.months,
    hours: model.hours,
    peakHour: model.peakHour,
    peakDay,
    timeSources,
    intersection: model.intersection,
    progress: bands,
    recent: recentCards(records),
    topTopic: model.topics[0] ?? null,
    topics: model.topics.slice(0, 8),
    topCreator,
    media,
    durations,
    music: topMusic && topMusic.count >= 2 ? topMusic : null,
    topicsCount: new Set(rows.flatMap(({ record }) => record.topics ?? [])).size,
    creators: model.creators.slice(0, 5),
    creatorsCount: model.creatorsCount,
    musics: musics.filter((item) => item.count >= 2).slice(0, 3),
    musicsCount: musicCounts.size,
    heat,
    age,
    length,
    chat: input.source === "collector" ? chatSummary(input.chatMessages, input.chatConversations) : null,
    reliableRatio: model.reliableRatio,
    caveats: { noTime: timeSources.unknown, noVideoId: rows.filter(({ record }) => !record.videoId).length, warnings: input.warnings.length },
    profile: { title: model.profile, english: model.profileEnglish, reason: model.profileReason },
  };
}

export function writeStoryData(data: StoryData, storage = globalThis.localStorage): void {
  try { storage?.setItem(STORY_STORAGE_KEY, JSON.stringify(data)); } catch { /* private mode: the page falls back to its demo numbers */ }
}

export function clearStoryData(storage = globalThis.localStorage): void {
  try { storage?.removeItem(STORY_STORAGE_KEY); } catch { /* nothing stored */ }
}

// Latest kept items first (liked + favorite), topped up with recent watches; one card per content.
function recentCards(records: PersonalRecordCollection): StoryCard[] {
  const tagged: Array<{ record: PersonalVideoRecord; kind: StoryCard["kind"] }> = [
    ...records.liked_videos.map((record) => ({ record, kind: "liked" as const })),
    ...records.favorite_videos.map((record) => ({ record, kind: "favorite" as const })),
  ];
  const watched = records.watch_history.map((record) => ({ record, kind: "watch" as const }));
  const byTime = (list: typeof tagged) => list.slice().sort((a, b) => (validTime(b.record.occurredAt) ?? 0) - (validTime(a.record.occurredAt) ?? 0));
  const seen = new Set<string>();
  const cards: StoryCard[] = [];
  for (const { record, kind } of [...byTime(tagged), ...byTime(watched)]) {
    if (cards.length >= 4) break;
    const key = recordKey(record);
    if (seen.has(key)) continue;
    seen.add(key);
    cards.push({ title: record.title?.trim() || "未命名内容", author: record.author?.trim() || null, coverUrl: record.coverUrl ?? null, url: record.url ?? null, kind });
  }
  return cards;
}

function chatSummary(messages: ChatMessage[], conversations: ChatConversationSummary[]): StoryChat {
  const groupIds = new Set(conversations.filter((conversation) => conversation.kind === "group").map((conversation) => conversation.id));
  const friend = messages.filter((message) => message.conversationType !== "group" && (!message.conversationId || !groupIds.has(message.conversationId)));
  const forms: Array<[string, string, (message: ChatMessage) => boolean]> = [
    ["text", "文字", (message) => message.type === "text"],
    ["image", "图片", (message) => message.type === "image"],
    ["share", "分享", (message) => message.type === "share"],
    ["sticker", "表情", (message) => message.type === "sticker"],
    ["call · voice", "通话 / 语音", (message) => message.type === "call" || message.type === "voice"],
  ];
  const share = friend.find((message) => message.share && (message.share.title || message.share.coverUrl))?.share ?? null;
  return {
    friendMessages: friend.length,
    callSeconds: friend.reduce((total, message) => total + (typeof message.callDurationSeconds === "number" && Number.isFinite(message.callDurationSeconds) && message.callDurationSeconds > 0 ? message.callDurationSeconds : 0), 0),
    conversations: conversations.length,
    forms: forms.map(([code, label, test]) => { const count = friend.filter(test).length; return { code, label, count, share: friend.length ? count / friend.length : 0 }; }),
    top: conversations.slice().sort((a, b) => b.messageCount - a.messageCount).slice(0, 3).map((conversation) => ({
      name: conversation.name?.trim() || (conversation.kind === "group" ? "未命名群聊" : "未命名会话"),
      kind: conversation.kind,
      avatarUrl: conversation.avatarUrl ?? null,
      messageCount: conversation.messageCount,
      ownMessageCount: conversation.ownMessageCount,
    })),
    share: share ? { title: share.title, author: share.author, coverUrl: share.coverUrl, url: share.url } : null,
  };
}

function shares<T>(items: T[], buckets: Array<[string, (value: T) => boolean]>): Array<{ label: string; share: number }> | null {
  if (!items.length) return null;
  return buckets.map(([label, test]) => ({ label, share: items.filter(test).length / items.length }));
}

function median(values: number[]): number { const sorted = values.slice().sort((a, b) => a - b); return sorted[Math.floor((sorted.length - 1) / 2)] ?? 0; } // ponytail: lower middle, no averaging
function recordKey(record: PersonalVideoRecord): string { return record.videoId ?? record.url ?? record.id; }
function validTime(value: string | null | undefined): number | null { if (!value) return null; const time = new Date(value).getTime(); return Number.isFinite(time) ? time : null; }
function isoDay(time: number): string { const date = new Date(time); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
