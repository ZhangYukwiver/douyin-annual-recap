import { ANNUAL_TIME_ZONE } from "./annualReport";
import { countChatMessages, type ChatConversationSummary, type ChatMessage } from "./chatRecords";
import type { PersonalRecordCollection, PersonalVideoRecord } from "./personalRecords";

export type SurpriseInsightId = "depth-contrast" | "return-depth" | "night-exploration";

export interface SurpriseInsight {
  id: SurpriseInsightId;
  title: string;
  text: string;
  status: "observed" | "pending";
  evidence: Readonly<Record<string, number | null>>;
}

export interface SurpriseInsightOptions {
  timezone?: string;
  chatConversations?: readonly ChatConversationSummary[];
}

const PENDING_TEXT: Record<SurpriseInsightId, string> = {
  "depth-contrast": "观看进度样本不足，停留对比待观测。",
  "return-depth": "重复观看、收藏与聊天样本不足，回访关系待观测。",
  "night-exploration": "带有时间与主题/创作者信息的昼夜样本不足，探索差异待观测。",
};

function pending(id: SurpriseInsightId, evidence: Record<string, number | null>): SurpriseInsight {
  return { id, title: "待观测", text: PENDING_TEXT[id], status: "pending", evidence };
}

function finiteDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time) : null;
}

function usableDate(record: PersonalVideoRecord): Date | null {
  return record.occurredAtSource === "unknown" ? null : finiteDate(record.occurredAt);
}

function progressOf(record: PersonalVideoRecord): number | null {
  const value = record.watchProgress?.percent;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
}

function recordKey(record: PersonalVideoRecord, index: number): string {
  return record.videoId?.trim() || record.url?.trim() || `row:${record.id || index}`;
}

function creatorKey(record: PersonalVideoRecord): string | null {
  const id = record.authorId?.trim();
  const name = record.author?.trim();
  return id ? `id:${id}` : name ? `name:${name}` : null;
}

function topicKeys(record: PersonalVideoRecord): string[] {
  return [...new Set((record.topics ?? []).map((topic) => topic.trim()).filter(Boolean))];
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
}

function rounded(value: number): number {
  return Math.round(value);
}

function hourFormatter(timezone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "2-digit", hour12: false });
}

function hourOf(date: Date, formatter: Intl.DateTimeFormat): number {
  const part = formatter.formatToParts(date).find((item) => item.type === "hour")?.value;
  const hour = Number(part);
  return Number.isFinite(hour) ? hour % 24 : date.getUTCHours();
}

function isNight(date: Date, formatter: Intl.DateTimeFormat): boolean {
  const hour = hourOf(date, formatter);
  return hour >= 20 || hour < 5;
}

function deriveDepthContrast(watch: PersonalVideoRecord[]): SurpriseInsight {
  const progress = watch.map(progressOf).filter((value): value is number => value !== null);
  const completion = mean(progress);
  const evidence = { watchCount: watch.length, progressSamples: progress.length, completion: completion === null ? null : rounded(completion) };
  if (watch.length < 10 || progress.length < 6 || completion === null) return pending("depth-contrast", evidence);
  if (completion <= 45) {
    return {
      id: "depth-contrast",
      title: "看得多 ≠ 留得久",
      text: `样本中记录了 ${watch.length} 次观看，平均进度 ${rounded(completion)}%；观看量与停留深度并不一致。`,
      status: "observed",
      evidence,
    };
  }
  if (completion >= 70) {
    return {
      id: "depth-contrast",
      title: "看得多，也留得深",
      text: `样本中记录了 ${watch.length} 次观看，平均进度 ${rounded(completion)}%；较多内容形成了较深停留。`,
      status: "observed",
      evidence,
    };
  }
  return pending("depth-contrast", evidence);
}

function deriveReturnDepth(
  records: PersonalRecordCollection,
  chats: ChatMessage[],
  chatConversations: readonly ChatConversationSummary[],
): SurpriseInsight {
  const watch = records.watch_history;
  const ids = watch.map((record, index) => recordKey(record, index));
  const counts = new Map<string, number>();
  ids.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));
  const repeats = [...counts.values()].filter((count) => count > 1).length;
  const watchIdSet = new Set(ids);
  const uniqueWatch = watchIdSet.size;
  const keptIds = new Set([...records.liked_videos, ...records.favorite_videos].map((record, index) => recordKey(record, index)));
  const keptInWatch = [...keptIds].filter((id) => watchIdSet.has(id));
  const keepRate = uniqueWatch ? keptInWatch.length / uniqueWatch : null;
  const completion = mean(watch.map(progressOf).filter((value): value is number => value !== null));
  const chatCount = countChatMessages(chats, chatConversations);
  const evidence = { watchCount: watch.length, uniqueWatch, repeatedVideos: repeats, keptVideos: keptInWatch.length, keepRate: keepRate === null ? null : rounded(keepRate * 100), completion: completion === null ? null : rounded(completion), chatCount };

  if (watch.length >= 8 && repeats >= 2 && keepRate !== null && keepRate <= 0.35 && completion !== null && completion >= 60) {
    const chatSuffix = chatCount > 0 ? ` 同期还记录到 ${chatCount} 条聊天互动。` : "";
    return {
      id: "return-depth",
      title: "收藏少但回访深",
      text: `观看样本中有 ${repeats} 个视频出现重复记录，收藏/点赞覆盖约 ${rounded(keepRate * 100)}%。${chatSuffix}`,
      status: "observed",
      evidence,
    };
  }
  if (watch.length >= 8 && chatCount >= 6 && chatCount > watch.length) {
    return {
      id: "return-depth",
      title: "互动回声更密集",
      text: `样本中记录了 ${chatCount} 条聊天互动与 ${watch.length} 次观看，互动记录相对更密集；仅作并列观测。`,
      status: "observed",
      evidence,
    };
  }
  return pending("return-depth", evidence);
}

interface ExplorationSlice {
  records: PersonalVideoRecord[];
  topics: Set<string>;
  creators: Set<string>;
  coverage: number;
}

function explorationSlice(records: PersonalVideoRecord[]): ExplorationSlice {
  const topics = new Set<string>();
  const creators = new Set<string>();
  let metadataRows = 0;
  for (const record of records) {
    const rowTopics = topicKeys(record);
    const creator = creatorKey(record);
    rowTopics.forEach((topic) => topics.add(topic));
    if (creator) creators.add(creator);
    if (rowTopics.length || creator) metadataRows += 1;
  }
  return { records, topics, creators, coverage: records.length ? metadataRows / records.length : 0 };
}

function deriveNightExploration(
  records: PersonalRecordCollection,
  chats: ChatMessage[],
  timezone: string,
): SurpriseInsight {
  const formatter = hourFormatter(timezone);
  const dated = records.watch_history
    .map((record) => ({ record, date: usableDate(record) }))
    .filter((item): item is { record: PersonalVideoRecord; date: Date } => item.date !== null);
  const night = explorationSlice(dated.filter((item) => isNight(item.date, formatter)).map((item) => item.record));
  const day = explorationSlice(dated.filter((item) => !isNight(item.date, formatter)).map((item) => item.record));
  const nightChat = chats.filter((message) => {
    const date = finiteDate(message.sentAt);
    return date ? isNight(date, formatter) : false;
  }).length;
  const dayChat = chats.filter((message) => {
    const date = finiteDate(message.sentAt);
    return date ? !isNight(date, formatter) : false;
  }).length;
  const nightRate = night.records.length ? (night.topics.size + night.creators.size) / night.records.length : null;
  const dayRate = day.records.length ? (day.topics.size + day.creators.size) / day.records.length : null;
  const evidence = {
    nightRecords: night.records.length,
    dayRecords: day.records.length,
    nightTopics: night.topics.size,
    dayTopics: day.topics.size,
    nightCreators: night.creators.size,
    dayCreators: day.creators.size,
    nightChat,
    dayChat,
    nightCoverage: rounded(night.coverage * 100),
    dayCoverage: rounded(day.coverage * 100),
  };
  if (night.records.length < 3 || day.records.length < 3 || night.coverage < 0.5 || day.coverage < 0.5 || nightRate === null || dayRate === null) {
    return pending("night-exploration", evidence);
  }
  const ratio = dayRate ? nightRate / dayRate : null;
  const chatSuffix = nightChat + dayChat > 0 ? ` 同期聊天记录为夜间 ${nightChat} 条、白天 ${dayChat} 条。` : "";
  if (ratio !== null && ratio >= 1.35 && nightRate - dayRate >= 0.15) {
    return {
      id: "night-exploration",
      title: "夜间更容易探索",
      text: `夜间 ${night.records.length} 条记录覆盖 ${night.topics.size} 个主题与 ${night.creators.size} 位创作者，单位记录覆盖度高于白天。${chatSuffix}`,
      status: "observed",
      evidence,
    };
  }
  if (ratio !== null && ratio <= 0.74 && dayRate - nightRate >= 0.15) {
    return {
      id: "night-exploration",
      title: "白天探索更广",
      text: `白天 ${day.records.length} 条记录覆盖 ${day.topics.size} 个主题与 ${day.creators.size} 位创作者，单位记录覆盖度高于夜间。${chatSuffix}`,
      status: "observed",
      evidence,
    };
  }
  return pending("night-exploration", evidence);
}

/** Return three evidence-backed observations for the page-11 cards. */
export function deriveSurpriseInsights(
  records: PersonalRecordCollection,
  chats: ChatMessage[] = [],
  options: SurpriseInsightOptions = {},
): [SurpriseInsight, SurpriseInsight, SurpriseInsight] {
  const chatConversations = options.chatConversations ?? [];
  return [
    deriveDepthContrast(records.watch_history),
    deriveReturnDepth(records, chats, chatConversations),
    deriveNightExploration(records, chats, options.timezone ?? ANNUAL_TIME_ZONE),
  ];
}
