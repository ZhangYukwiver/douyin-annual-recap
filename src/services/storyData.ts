import type { ReportModel } from "../components/workspace/ReportWorkspace";
import { hasChatShareEvidence } from "../domain/chatRecords";
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

/** One topic term (an explicit hashtag) or one chat word, counted once per record. */
export interface StoryTerm { name: string; count: number; share: number }
export interface StoryTermField {
  total: number;
  /** Records that carry at least one usable term. */
  sampled: number;
  distinct: number;
  top: StoryTerm[];
  /** Share of sampled records mentioning any of the top terms. */
  coverage: number;
  /** How many terms it takes to reach half the sampled records — smaller means more concentrated. */
  halfAt: number | null;
  /** Records dropped before counting (chat boilerplate); always 0 for hashtag sources. */
  excluded: number;
}
export interface StoryLexicon {
  watch: StoryTermField;
  liked: StoryTermField;
  favorite: StoryTermField;
  /** Chat words; null for archive imports and where the browser has no segmenter. */
  chat: StoryTermField | null;
  /** Hashtags on the video cards friends shared; null for archive imports. */
  shared: StoryTermField | null;
  contrast: { both: string[]; sharedOnly: string[]; likedOnly: string[] } | null;
}
export interface StoryFieldCoverage { label: string; count: number; base: number; share: number }

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
  lexicon: StoryLexicon;
  /** How many records actually carry each field the story leans on. */
  fields: StoryFieldCoverage[];
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

  const friend = friendMessages(input.chatMessages, input.chatConversations);
  const watchTerms = records.watch_history.map(termsOf);
  const likedTerms = records.liked_videos.map(termsOf);
  const shareCards = input.source === "collector" ? friend.filter((message) => hasChatShareEvidence(message.share)) : [];
  const sharedTerms = shareCards.map((message) => hashtags(message.share?.title));
  const shared = input.source === "collector" ? termField(sharedTerms, shareCards.length) : null;
  const likedField = termField(likedTerms, records.liked_videos.length);
  const lexicon: StoryLexicon = {
    watch: termField(watchTerms, records.watch_history.length),
    liked: likedField,
    favorite: termField(records.favorite_videos.map(termsOf), records.favorite_videos.length),
    chat: input.source === "collector" ? chatField(friend) : null,
    shared,
    // a comparison needs both sides to have enough records to be worth reading
    contrast: shared && shared.sampled >= 10 && likedField.sampled >= 10 ? contrastOf(rankTerms(likedTerms), rankTerms(sharedTerms)) : null,
  };

  const progressRows = records.watch_history.filter((record) => typeof record.watchProgress?.percent === "number" || typeof record.watchProgress?.watchedSeconds === "number");
  const fields: StoryFieldCoverage[] = ([
    ["行为时间", reliable.length, rows.length],
    ["作品 ID", rows.filter(({ record }) => Boolean(record.videoId)).length, rows.length],
    ["话题标签", rows.filter(({ record }) => termsOf(record).length > 0).length, rows.length],
    ["时长", lengths.length, rows.length],
    ["发布时间", rows.filter(({ record }) => validTime(record.publishedAt) !== null).length, rows.length],
    ["点赞数", rows.filter(({ record }) => typeof record.stats?.diggCount === "number" && Number.isFinite(record.stats.diggCount)).length, rows.length],
    ["已看进度", progressRows.length, records.watch_history.length],
  ] as Array<[string, number, number]>).map(([label, count, base]) => ({ label, count, base, share: base ? count / base : 0 }));

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
    lexicon,
    fields,
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

// ---- lexicon: explicit hashtags for video records, browser word segmentation for chat ----

const TOPIC_PATTERN = /#([^#\s,，。.!！?？:：;；]{1,50})/gu;
const HAN = /^\p{Script=Han}+$/u;
// enough of the spoken filler to keep the chat list readable; a word list dependency would be heavier than the feature
const CHAT_STOPWORDS = new Set(
  ("的 了 是 我 你 他 她 它 我们 你们 他们 这 那 这个 那个 这些 那些 在 有 和 与 及 或 就 都 也 还 又 很 太 更 最 不 没 没有 要 会 能 可以 可能 应该 把 被 让 给 对 从 到 向 于 为 以 用 跟 比 " +
   "吧 吗 呢 啊 哦 呀 嗯 哈 哈哈 哈哈哈 嘿 哎 唉 呃 哇 噢 嗯嗯 好 好的 好了 行 可 而 但 但是 因为 所以 如果 然后 还是 或者 什么 怎么 怎样 为什么 哪 哪里 谁 多少 几 " +
   "一个 一下 一些 一点 一起 一样 已经 现在 今天 明天 昨天 时候 一直 只是 就是 不是 而且 这样 那样 这么 那么 自己 大家 我的 你的 他的 视频 抖音 分享 看看 来看 一定 " +
   "真的 感觉 觉得 知道 看到 看了 有点 不要 不能 不会 直接 出来 起来 过来 回来 下来 上来 出去 进去 才 再 只 每 各 另 某 其 之 者 所 着 过 得 地 啦 嘛 咯 哟 呗 喔 嘞 " +
   "还有 非常 我要 你要 我看 我有 都没 不了 不知道 也是 都是 我是 给我 其实 结果 本来 时间").split(" "),
);

type TermRank = { key: string; name: string; count: number };

function hashtags(text: string | null | undefined): string[] {
  const found: string[] = [];
  for (const match of (text ?? "").matchAll(TOPIC_PATTERN)) { const term = match[1]?.trim(); if (term) found.push(term); }
  return found;
}

/** Explicit topic tags only: segmenting a title would cut game and product names in half. */
function termsOf(record: PersonalVideoRecord): string[] {
  const terms: string[] = [];
  for (const raw of [...(record.topics ?? []), ...hashtags(record.title)]) {
    const term = String(raw).replace(/^#/u, "").trim();
    if (term && !terms.some((item) => item.toLowerCase() === term.toLowerCase())) terms.push(term);
  }
  return terms;
}

// A term counts once per record, so a count reads as "how many records mention it".
function rankTerms(docs: string[][]): TermRank[] {
  const counts = new Map<string, TermRank>();
  for (const terms of docs) {
    const seen = new Set<string>();
    for (const term of terms) {
      const key = term.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const entry = counts.get(key) ?? { key, name: term, count: 0 };
      entry.count += 1;
      counts.set(key, entry);
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-CN"));
}

function termField(docs: string[][], total: number, excluded = 0): StoryTermField {
  const sampled = docs.filter((terms) => terms.length > 0).map((terms) => new Set(terms.map((term) => term.toLowerCase())));
  const ranked = rankTerms(docs);
  const topKeys = new Set(ranked.slice(0, 12).map((item) => item.key));
  const share = (count: number) => (sampled.length ? count / sampled.length : 0);
  const hit = sampled.map(() => false);
  let covered = 0;
  let halfAt: number | null = null;
  for (let index = 0; index < ranked.length && sampled.length; index += 1) {
    const key = ranked[index]!.key;
    sampled.forEach((terms, position) => { if (!hit[position] && terms.has(key)) { hit[position] = true; covered += 1; } });
    if (covered * 2 >= sampled.length) { halfAt = index + 1; break; }
  }
  return {
    total,
    sampled: sampled.length,
    distinct: ranked.length,
    top: ranked.slice(0, 12).map((item) => ({ name: item.name, count: item.count, share: share(item.count) })),
    coverage: share(sampled.filter((terms) => [...terms].some((key) => topKeys.has(key))).length),
    halfAt,
    excluded,
  };
}

function contrastOf(liked: TermRank[], shared: TermRank[]): StoryLexicon["contrast"] {
  const keysOf = (list: TermRank[], size: number) => new Set(list.slice(0, size).map((item) => item.key));
  const sharedTop = keysOf(shared, 30), sharedWide = keysOf(shared, 100), likedWide = keysOf(liked, 100);
  return {
    both: liked.slice(0, 30).filter((item) => sharedTop.has(item.key)).slice(0, 4).map((item) => item.name),
    sharedOnly: shared.slice(0, 30).filter((item) => !likedWide.has(item.key)).slice(0, 4).map((item) => item.name),
    likedOnly: liked.slice(0, 30).filter((item) => !sharedWide.has(item.key)).slice(0, 4).map((item) => item.name),
  };
}

function friendMessages(messages: ChatMessage[], conversations: ChatConversationSummary[]): ChatMessage[] {
  const groupIds = new Set(conversations.filter((conversation) => conversation.kind === "group").map((conversation) => conversation.id));
  return messages.filter((message) => message.conversationType !== "group" && (!message.conversationId || !groupIds.has(message.conversationId)));
}

type Segmenter = { segment(input: string): Iterable<{ segment: string; isWordLike?: boolean }> };

/** Chat has no hashtags, so words come from the browser's own segmenter; platform boilerplate is dropped first. */
function chatField(friend: ChatMessage[]): StoryTermField | null {
  const factory = (Intl as unknown as { Segmenter?: new (locale: string, options: { granularity: string }) => Segmenter }).Segmenter;
  if (typeof factory !== "function") return null;
  const texts = friend.filter((message) => message.type === "text" && message.text?.trim());
  const shape = (text: string) => text.replace(/\d+/gu, "#").replace(/\s+/gu, "").slice(0, 40);
  const byShape = new Map<string, Set<string>>();
  for (const message of texts) {
    const key = shape(message.text ?? "");
    const ids = byShape.get(key) ?? new Set<string>();
    ids.add(message.conversationId ?? "");
    byShape.set(key, ids);
  }
  // the same sentence in three or more conversations is the platform talking, not the person
  const boilerplate = new Set([...byShape].filter(([, ids]) => ids.size >= 3).map(([key]) => key));
  const kept = texts.filter((message) => !boilerplate.has(shape(message.text ?? "")));
  const segmenter = new factory("zh", { granularity: "word" });
  return termField(kept.map((message) => chatWords(segmenter, message.text ?? "")), texts.length, texts.length - kept.length);
}

function chatWords(segmenter: Segmenter, text: string): string[] {
  const cleaned = text.replace(/https?:\/\/\S+/gu, " ").replace(/\[[^\]]{1,8}\]/gu, " ").replace(/@[^\s@:：,，]{1,20}/gu, " ").replace(/#[^#\s,，。.!！?？:：;；]{1,50}/gu, " ");
  const words: string[] = [];
  let run = "";
  // ponytail: a run of single characters is one word the segmenter split up; a long run is a sentence, not a word, so it is dropped
  const flush = () => { if (run.length >= 2 && run.length <= 6) words.push(run); run = ""; };
  for (const piece of segmenter.segment(cleaned)) {
    const word = piece.segment;
    if (!piece.isWordLike) { flush(); continue; }
    if (HAN.test(word)) {
      if (word.length === 1) { run += word; continue; }
      flush();
      words.push(word);
    } else {
      flush();
      if (/^[a-z]{2,}$/iu.test(word)) words.push(word.toLowerCase());
    }
  }
  flush();
  return words.filter((word) => word.length >= 2 && new Set(word).size > 1 && !CHAT_STOPWORDS.has(word));
}

function shares<T>(items: T[], buckets: Array<[string, (value: T) => boolean]>): Array<{ label: string; share: number }> | null {
  if (!items.length) return null;
  return buckets.map(([label, test]) => ({ label, share: items.filter(test).length / items.length }));
}

function median(values: number[]): number { const sorted = values.slice().sort((a, b) => a - b); return sorted[Math.floor((sorted.length - 1) / 2)] ?? 0; } // ponytail: lower middle, no averaging
function recordKey(record: PersonalVideoRecord): string { return record.videoId ?? record.url ?? record.id; }
function validTime(value: string | null | undefined): number | null { if (!value) return null; const time = new Date(value).getTime(); return Number.isFinite(time) ? time : null; }
function isoDay(time: number): string { const date = new Date(time); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
