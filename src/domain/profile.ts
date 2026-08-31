import { countChatMessages, type ChatConversationSummary, type ChatMessage } from "./chatRecords";
import { ANNUAL_TIME_ZONE } from "./annualReport";
import type { PersonalRecordCollection, PersonalVideoRecord } from "./personalRecords";

/**
 * The profile badge is intentionally derived from several observable signals.
 * These are display labels, not a judgement of the person behind the data.
 */
export type ProfileTitle =
  | "万象漫游者"
  | "深度沉浸者"
  | "珍藏策展人"
  | "社交回响者"
  | "多维共鸣者"
  | "静默观测者"
  | "等待更多足迹";

export interface ProfileMetrics {
  /** Whether the default recent-window filter was actually applied. */
  windowed: boolean;
  /** Requested duration for this derivation; null means all-period mode. */
  windowRequestedDays: number | null;
  /** True when the watch history covered fewer days than the requested window. */
  windowLimited: boolean;
  /** True when no reliable watch timestamp existed to establish a window. */
  windowUnavailable: boolean;
  /** Effective evaluation interval, inclusive, in ISO-8601 form. */
  windowStartAt: string | null;
  windowEndAt: string | null;
  /** Elapsed coverage of the effective interval, rounded up to whole days. */
  windowObservedDays: number | null;
  /** Record counts after the title-evaluation time filter, before de-duplication. */
  windowWatchRecords: number;
  windowLikeRecords: number;
  windowFavoriteRecords: number;
  /** Number of distinct topic labels found on unique watched content. */
  topicCount: number;
  /** 0..100: topic count and topic balance combined. */
  topicBreadth: number | null;
  /** Number of distinct creators on unique watched content. */
  creatorCount: number;
  /** 0..100: distinct creators / watched content with a creator. */
  creatorBreadth: number | null;
  /** Unique liked content that also appears in watch history / unique watched content. */
  likeRate: number | null;
  /** Unique favorite content that also appears in watch history / unique watched content. */
  favoriteRate: number | null;
  /** Scaled 0..100 signals used by the composite score. */
  likeScore: number | null;
  favoriteScore: number | null;
  /** Arithmetic mean of available watch progress values, in percentage points. */
  completion: number | null;
  progressSamples: number;
  uniqueWatched: number;
  /** Active friend conversations/contacts with observable chat activity. */
  chatPeople: number;
  chatMessages: number;
  chatActiveDays: number;
  /** Messages per day on which a dated chat message was observed. */
  chatFrequency: number | null;
  chatPeopleScore: number | null;
  chatFrequencyScore: number | null;
  /** Composite signals used by the radar and title selection. */
  explorationScore: number | null;
  retentionScore: number | null;
  socialScore: number | null;
  overallScore: number | null;
  availableDimensions: number;
  sufficientEvidence: boolean;
}

export interface DerivedProfile {
  title: ProfileTitle;
  english: string;
  reason: string;
  metrics: ProfileMetrics;
}

export const PROFILE_ENGLISH: Record<ProfileTitle, string> = {
  "万象漫游者": "Many-Worlds Wanderer",
  "深度沉浸者": "Deep Immersionist",
  "珍藏策展人": "Archive Curator",
  "社交回响者": "Social Resonator",
  "多维共鸣者": "Multidimensional Resonator",
  "静默观测者": "Quiet Observer",
  "等待更多足迹": "Awaiting Traces",
};

/** Default title-evaluation period. The report UI may still show all-time data. */
export const PROFILE_WINDOW_DAYS = 7;

export interface ProfileDerivationOptions {
  /** Set to null to disable temporal scoping (used for all-period report axes). */
  windowDays?: number | null;
}

const TOPIC_TARGET = 8;
const LIKE_TARGET = 35;
const FAVORITE_TARGET = 12;
const CHAT_PEOPLE_TARGET = 8;
const CHAT_FREQUENCY_TARGET = 8;
const MIN_WATCH_RECORDS = 5;
const MIN_CHAT_MESSAGES = 10;
const DAY_MS = 86_400_000;

/**
 * Reference points for the 0..100 composite signals (not hard title gates):
 * 8 topic labels, 35% like coverage, 12% favorite coverage, 8 active chat
 * contacts and 8 messages per dated chat day represent a full-strength signal.
 * The overall weights are 20/10/10/15/20/12.5/12.5 for topic, creator, like,
 * favorite, completion, chat people and chat frequency respectively.
 */

const CHAT_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: ANNUAL_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Return a timestamp only when it can reasonably represent a user action.
 * An explicitly unknown source is never used to establish or satisfy a
 * recent-window boundary. Legacy rows without a source remain supported.
 */
function eventTimestamp(record: PersonalVideoRecord): number | null {
  if (record.occurredAtSource === "unknown" || !record.occurredAt) return null;
  const timestamp = new Date(record.occurredAt).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

interface ProfileEvaluationWindow {
  requestedDays: number | null;
  windowed: boolean;
  windowLimited: boolean;
  windowUnavailable: boolean;
  start: number | null;
  end: number | null;
  observedDays: number | null;
}

function normalizedWindowDays(value: number | null | undefined): number | null {
  if (value === null) return null;
  if (value === undefined || !Number.isFinite(value) || value <= 0) return PROFILE_WINDOW_DAYS;
  return value;
}

/**
 * Resolve the title-evaluation interval from the watch history itself. The
 * latest reliable watch event is the as-of point, which keeps imported
 * historical snapshots deterministic instead of comparing them with the
 * computer's current clock.
 */
function resolveEvaluationWindow(
  watchRecords: readonly PersonalVideoRecord[],
  requestedDays: number | null,
): ProfileEvaluationWindow {
  if (requestedDays === null) {
    return {
      requestedDays: null,
      windowed: false,
      windowLimited: false,
      windowUnavailable: false,
      start: null,
      end: null,
      observedDays: null,
    };
  }
  const timestamps = watchRecords
    .map(eventTimestamp)
    .filter((value): value is number => value !== null);
  if (!timestamps.length) {
    return {
      requestedDays,
      windowed: false,
      windowLimited: false,
      windowUnavailable: true,
      start: null,
      end: null,
      observedDays: null,
    };
  }
  const observedStart = timestamps.reduce((minimum, value) => Math.min(minimum, value), Number.POSITIVE_INFINITY);
  const end = timestamps.reduce((maximum, value) => Math.max(maximum, value), Number.NEGATIVE_INFINITY);
  const targetStart = end - requestedDays * DAY_MS;
  const start = Math.max(targetStart, observedStart);
  const observedDays = Math.max(1, Math.ceil((end - start) / DAY_MS));
  return {
    requestedDays,
    windowed: true,
    windowLimited: observedStart > targetStart,
    windowUnavailable: false,
    start,
    end,
    observedDays,
  };
}

function inEvaluationWindow(record: PersonalVideoRecord, window: ProfileEvaluationWindow): boolean {
  if (!window.windowed || window.start === null || window.end === null) return true;
  const timestamp = eventTimestamp(record);
  return timestamp !== null && timestamp >= window.start && timestamp <= window.end;
}

function isoTimestamp(value: number | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

function scaled(value: number | null, target: number): number | null {
  return value === null ? null : clamp(value / target * 100);
}

function weightedMean(values: Array<[number | null, number]>): number | null {
  const available = values.filter(([value]) => value !== null && Number.isFinite(value));
  const weight = available.reduce((sum, [, itemWeight]) => sum + itemWeight, 0);
  if (!weight) return null;
  return available.reduce((sum, [value, itemWeight]) => sum + (value ?? 0) * itemWeight, 0) / weight;
}

function canonicalUrl(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    url.hostname = url.hostname.toLocaleLowerCase();
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/u, "");
  } catch {
    return null;
  }
}

/** The same identity order used by the report's content counters. */
function contentKey(record: PersonalVideoRecord, type: keyof PersonalRecordCollection, index: number): string {
  const videoId = record.videoId?.trim();
  if (videoId) return `video:${videoId}`;
  const url = canonicalUrl(record.url);
  if (url) return `url:${url}`;
  return `record:${type}:${record.id || index}`;
}

function uniqueRecordMap(records: readonly PersonalVideoRecord[], type: keyof PersonalRecordCollection): Map<string, PersonalVideoRecord> {
  const result = new Map<string, PersonalVideoRecord>();
  records.forEach((record, index) => {
    const key = contentKey(record, type, index);
    if (!result.has(key)) result.set(key, record);
  });
  return result;
}

function topicLabels(record: PersonalVideoRecord): string[] {
  const values = Array.isArray(record.topics) ? record.topics : [];
  const labels = values
    .map((value) => String(value).replace(/^#/u, "").trim())
    .filter(Boolean);
  for (const match of (record.title ?? "").matchAll(/#([^#\s,，。.!！?？:：;；]{1,50})/gu)) {
    const label = match[1]?.trim();
    if (label) labels.push(label);
  }
  return [...new Set(labels)];
}

function creatorKey(record: PersonalVideoRecord): string | null {
  const id = record.authorId?.trim();
  if (id) return `id:${id}`;
  const name = record.author?.trim().toLocaleLowerCase();
  return name ? `name:${name}` : null;
}

/** Return a percentage in 0..100, using seconds only when percent is absent. */
export function progressPercentOf(record: PersonalVideoRecord): number | null {
  const percent = record.watchProgress?.percent;
  if (finite(percent)) return clamp(percent);
  const watchedSeconds = record.watchProgress?.watchedSeconds;
  const duration = record.durationSeconds;
  if (finite(watchedSeconds) && finite(duration) && duration > 0) return clamp(watchedSeconds / duration * 100);
  return null;
}

function isGroupMessage(message: ChatMessage, groupIds: ReadonlySet<string>): boolean {
  return message.conversationType === "group" || (message.conversationId !== null && groupIds.has(message.conversationId));
}

function chatPersonKey(message: ChatMessage): string | null {
  if (message.conversationId?.trim()) return `conversation:${message.conversationId.trim()}`;
  const senderId = message.senderId?.trim();
  if (senderId && !/^(?:me|self|我|自己)$/iu.test(senderId)) return `sender:${senderId}`;
  const name = message.conversationName?.trim() || message.senderName?.trim();
  if (name && !/^(?:我|自己)$/u.test(name)) return `name:${name}`;
  return null;
}

function chatDateKey(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Map(CHAT_DATE_FORMATTER.formatToParts(date).map((part) => [part.type, part.value]));
  const year = parts.get("year");
  const month = parts.get("month");
  const day = parts.get("day");
  return year && month && day ? `${year}-${month}-${day}` : null;
}

function chatMetrics(
  chats: readonly ChatMessage[],
  conversations: readonly ChatConversationSummary[],
): { people: number; messages: number; activeDays: number; frequency: number | null } {
  const groupIds = new Set(conversations.filter((conversation) => conversation.kind === "group").map((conversation) => conversation.id));
  const friendMessages = chats.filter((message) => !isGroupMessage(message, groupIds));
  const people = new Set<string>();
  for (const message of friendMessages) {
    const key = chatPersonKey(message);
    if (key) people.add(key);
  }
  for (const conversation of conversations) {
    if (conversation.kind !== "friend" || conversation.messageCount <= 0) continue;
    people.add(`conversation:${conversation.id}`);
  }
  const activeDays = new Set(
    friendMessages
      .map((message) => message.sentAt)
      .map(chatDateKey)
      .filter((value): value is string => value !== null),
  ).size;
  const messages = countChatMessages(chats, conversations);
  const frequency = messages > 0 && activeDays > 0 ? messages / activeDays : messages > 0 ? null : 0;
  return { people: people.size, messages, activeDays, frequency };
}

function profileReason(title: ProfileTitle, metrics: ProfileMetrics): string {
  const pct = (value: number | null) => value === null ? "待补充" : `${Math.round(value)}%`;
  const requestedDays = metrics.windowRequestedDays ?? PROFILE_WINDOW_DAYS;
  const windowText = metrics.windowed
    ? metrics.windowLimited
      ? `近${requestedDays}天窗口（观看记录实际覆盖${metrics.windowObservedDays ?? 1}天）`
      : `近${requestedDays}天窗口`
    : metrics.windowUnavailable
      ? "未建立时间窗口（观看时间不可用，暂用现有记录）"
      : "全量有效记录";
  const prefix = `${windowText}（仅用于称号判定）；`;
  switch (title) {
    case "万象漫游者":
      return `${prefix}综合指数 ${pct(metrics.overallScore)}；优势在词条广度与创作者覆盖。`;
    case "深度沉浸者":
      return `${prefix}综合指数 ${pct(metrics.overallScore)}；优势在观看深度与收藏倾向。`;
    case "珍藏策展人":
      return `${prefix}综合指数 ${pct(metrics.overallScore)}；优势在点赞与收藏转化。`;
    case "社交回响者":
      return `${prefix}综合指数 ${pct(metrics.overallScore)}；优势在聊天连接与交流频率。`;
    case "多维共鸣者":
      return `${prefix}综合指数 ${pct(metrics.overallScore)}，多个行为维度同时活跃。`;
    case "静默观测者":
      return `${prefix}综合指数 ${pct(metrics.overallScore)}，当前行为尚未形成突出单一倾向。`;
    case "等待更多足迹":
      return `${prefix}有效行为样本不足，继续积累后再判定。`;
  }
}

function chooseTitle(metrics: ProfileMetrics): ProfileTitle {
  if (!metrics.sufficientEvidence) return "等待更多足迹";
  const scores = [
    metrics.topicBreadth,
    metrics.creatorBreadth,
    metrics.likeScore,
    metrics.favoriteScore,
    metrics.completion,
    metrics.chatPeopleScore,
    metrics.chatFrequencyScore,
  ];
  const strongCount = scores.filter((value) => value !== null && value >= 55).length;
  // Balanced: at least five of seven signals are strong and the weighted
  // composite clears 62. Specialized profiles use a 40-point baseline.
  if ((metrics.overallScore ?? 0) >= 62 && strongCount >= 5) return "多维共鸣者";

  // A specialized title still needs a reasonable overall evidence baseline;
  // the paired signals below determine which behavior is most characteristic.
  const candidates: Array<{ title: ProfileTitle; score: number; order: number }> = [];
  const add = (title: ProfileTitle, left: number | null, right: number | null, order: number) => {
    if (left === null || right === null) return;
    candidates.push({ title, score: (left + right) / 2, order });
  };
  if ((metrics.overallScore ?? 0) >= 40) {
    if ((metrics.topicBreadth ?? 0) >= 60 && (metrics.creatorBreadth ?? 0) >= 55) add("万象漫游者", metrics.topicBreadth, metrics.creatorBreadth, 0);
    if ((metrics.completion ?? 0) >= 70 && (metrics.favoriteRate ?? 0) >= 5) add("深度沉浸者", metrics.completion, metrics.favoriteScore, 1);
    if ((metrics.likeRate ?? 0) >= 20 && (metrics.favoriteRate ?? 0) >= 5) add("珍藏策展人", metrics.likeScore, metrics.favoriteScore, 2);
    if (metrics.chatMessages >= 20 && metrics.chatPeople >= 5 && (metrics.chatFrequency ?? 0) >= 4) add("社交回响者", metrics.chatPeopleScore, metrics.chatFrequencyScore, 3);
  }
  candidates.sort((left, right) => right.score - left.score || left.order - right.order);
  if (candidates[0]) return candidates[0].title;
  return "静默观测者";
}

export function deriveProfile(
  records: PersonalRecordCollection,
  chats: readonly ChatMessage[] = [],
  conversations: readonly ChatConversationSummary[] = [],
  options: ProfileDerivationOptions = {},
): DerivedProfile {
  const requestedDays = normalizedWindowDays(options.windowDays);
  const evaluationWindow = resolveEvaluationWindow(records.watch_history, requestedDays);
  // Once a reliable watch boundary exists, every video category uses the
  // same inclusive interval. This is what prevents old likes/favorites from
  // inflating a short recent watch history. If no boundary can be built, keep
  // the available rows but expose that limitation in the returned metrics.
  const watchRecords = records.watch_history.filter((record) => inEvaluationWindow(record, evaluationWindow));
  const likedRecords = records.liked_videos.filter((record) => inEvaluationWindow(record, evaluationWindow));
  const favoriteRecords = records.favorite_videos.filter((record) => inEvaluationWindow(record, evaluationWindow));
  const uniqueWatch = uniqueRecordMap(watchRecords, "watch_history");
  const uniqueWatched = uniqueWatch.size;
  const watchedKeys = new Set(uniqueWatch.keys());

  const topicCounts = new Map<string, number>();
  const creators = new Map<string, Set<string>>();
  for (const record of uniqueWatch.values()) {
    for (const topic of topicLabels(record)) topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
    const creator = creatorKey(record);
    if (creator) {
      const keys = creators.get(creator) ?? new Set<string>();
      keys.add(contentKey(record, "watch_history", 0));
      creators.set(creator, keys);
    }
  }
  const topicTotal = [...topicCounts.values()].reduce((sum, value) => sum + value, 0);
  const topicCount = topicCounts.size;
  const topicBalance = topicTotal > 0 ? (1 - Math.max(...topicCounts.values()) / topicTotal) * 100 : null;
  const topicBreadth = topicCount > 0
    ? weightedMean([[scaled(topicCount, TOPIC_TARGET), 0.55], [topicBalance, 0.45]])
    : null;
  const creatorCount = creators.size;
  const creatorRecords = [...creators.values()].reduce((sum, keys) => sum + keys.size, 0);
  const creatorBreadth = creatorRecords > 0 ? clamp(creatorCount / creatorRecords * 100) : null;

  const likedKeys = new Set(uniqueRecordMap(likedRecords, "liked_videos").keys());
  const favoriteKeys = new Set(uniqueRecordMap(favoriteRecords, "favorite_videos").keys());
  const likeCount = [...likedKeys].filter((key) => watchedKeys.has(key)).length;
  const favoriteCount = [...favoriteKeys].filter((key) => watchedKeys.has(key)).length;
  const likeRate = uniqueWatched > 0 ? likeCount / uniqueWatched * 100 : null;
  const favoriteRate = uniqueWatched > 0 ? favoriteCount / uniqueWatched * 100 : null;
  const likeScore = scaled(likeRate, LIKE_TARGET);
  const favoriteScore = scaled(favoriteRate, FAVORITE_TARGET);

  const progress = watchRecords.map(progressPercentOf).filter((value): value is number => value !== null);
  const completion = progress.length ? progress.reduce((sum, value) => sum + value, 0) / progress.length : null;
  const chat = chatMetrics(chats, conversations);
  // Chat is a separate snapshot signal. The video evaluation window does not
  // trim it; only the title's video/like/favorite inputs are time-scoped.
  const chatObserved = chats.length > 0 || conversations.length > 0 || records.watch_history.length > 0;
  const chatPeople = chatObserved ? chat.people : 0;
  const chatFrequency = chatObserved ? chat.frequency : null;
  const chatPeopleScore = scaled(chatPeople, CHAT_PEOPLE_TARGET);
  const chatFrequencyScore = scaled(chatFrequency, CHAT_FREQUENCY_TARGET);
  const explorationScore = weightedMean([[topicBreadth, 0.7], [creatorBreadth, 0.3]]);
  const retentionScore = weightedMean([[likeScore, 0.4], [favoriteScore, 0.6]]);
  const socialScore = weightedMean([[chatPeopleScore, 0.5], [chatFrequencyScore, 0.5]]);
  const dimensions: Array<[number | null, number]> = [
    [topicBreadth, 20],
    [creatorBreadth, 10],
    [likeScore, 10],
    [favoriteScore, 15],
    [completion, 20],
    [chatPeopleScore, 12.5],
    [chatFrequencyScore, 12.5],
  ];
  const overallScore = weightedMean(dimensions);
  const availableDimensions = dimensions.filter(([value]) => value !== null).length;
  const sufficientEvidence = availableDimensions >= 4 && (watchRecords.length >= MIN_WATCH_RECORDS || chat.messages >= MIN_CHAT_MESSAGES);
  const metrics: ProfileMetrics = {
    windowed: evaluationWindow.windowed,
    windowRequestedDays: evaluationWindow.requestedDays,
    windowLimited: evaluationWindow.windowLimited,
    windowUnavailable: evaluationWindow.windowUnavailable,
    windowStartAt: isoTimestamp(evaluationWindow.start),
    windowEndAt: isoTimestamp(evaluationWindow.end),
    windowObservedDays: evaluationWindow.observedDays,
    windowWatchRecords: watchRecords.length,
    windowLikeRecords: likedRecords.length,
    windowFavoriteRecords: favoriteRecords.length,
    topicCount,
    topicBreadth,
    creatorCount,
    creatorBreadth,
    likeRate,
    favoriteRate,
    likeScore,
    favoriteScore,
    completion,
    progressSamples: progress.length,
    uniqueWatched,
    chatPeople,
    chatMessages: chat.messages,
    chatActiveDays: chat.activeDays,
    chatFrequency,
    chatPeopleScore,
    chatFrequencyScore,
    explorationScore,
    retentionScore,
    socialScore,
    overallScore,
    availableDimensions,
    sufficientEvidence,
  };
  const title = chooseTitle(metrics);
  return { title, english: PROFILE_ENGLISH[title], reason: profileReason(title, metrics), metrics };
}
