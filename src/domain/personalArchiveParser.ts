import { strFromU8, unzipSync } from "fflate";

import { detectPersonalArchiveFormat } from "./fileFormat";
import {
  countPersonalRecords,
  createEmptyPersonalRecords,
  type PersonalArchiveData,
  type PersonalRecordCollection,
  type PersonalRecordType,
  type PersonalVideoRecord,
} from "./personalRecords";

export const MAX_ARCHIVE_BYTES = 32 * 1024 * 1024;

const MAX_ZIP_ENTRIES = 250;
const MAX_ZIP_ENTRY_BYTES = 16 * 1024 * 1024;
const MAX_ZIP_EXPANDED_BYTES = 64 * 1024 * 1024;
const MAX_ZIP_COMPRESSION_RATIO = 250;
const MAX_JSON_DEPTH = 16;
const MAX_JSON_NODES = 200_000;

const RECORD_ALIASES: Record<PersonalRecordType, readonly string[]> = {
  watch_history: [
    "观看历史",
    "观看记录",
    "浏览历史",
    "浏览记录",
    "watchhistory",
    "viewhistory",
    "watchrecords",
    "viewrecords",
  ],
  liked_videos: [
    "点赞列表",
    "点赞记录",
    "点赞视频",
    "喜欢列表",
    "喜欢记录",
    "喜欢视频",
    "likedvideos",
    "likelist",
    "likerecords",
  ],
  favorite_videos: [
    "收藏列表",
    "收藏记录",
    "收藏视频",
    "我的收藏",
    "favoritevideos",
    "favouritevideos",
    "favoritelist",
    "collectionlist",
    "collectrecords",
  ],
};

const TITLE_KEYS = [
  "title",
  "videotitle",
  "awemetitle",
  "desc",
  "description",
  "content",
  "视频标题",
  "作品标题",
  "标题",
  "文案",
  "内容",
] as const;
const AUTHOR_KEYS = [
  "authorname",
  "nickname",
  "username",
  "creatorname",
  "author",
  "creator",
  "作者昵称",
  "作者",
  "昵称",
  "用户名",
] as const;
const URL_KEYS = [
  "shareurl",
  "videourl",
  "awemeurl",
  "weburl",
  "url",
  "link",
  "href",
  "分享链接",
  "视频链接",
  "作品链接",
  "链接",
] as const;
const TIME_KEYS = [
  "occurredat",
  "watchtime",
  "viewtime",
  "liketime",
  "favoritetime",
  "collecttime",
  "eventtime",
  "timestamp",
  "datetime",
  "date",
  "time",
  "观看时间",
  "浏览时间",
  "点赞时间",
  "收藏时间",
  "时间",
] as const;
const PUBLISHED_TIME_KEYS = [
  "publishedat",
  "publishtime",
  "createtime",
  "creationtime",
  "发布时间",
  "发布时刻",
] as const;
const ID_KEYS = [
  "awemeid",
  "videoid",
  "itemid",
  "groupid",
  "作品id",
  "视频id",
] as const;
const AUTHOR_ID_KEYS = ["authorid", "authoruid", "uid", "secuid", "作者id", "用户id"] as const;
const AUTHOR_AVATAR_KEYS = ["authoravatarurl", "authoravatar", "avatarurl", "avatar", "头像"] as const;
const COVER_KEYS = ["coverurl", "cover", "coverimage", "thumbnail", "封面", "封面链接"] as const;
const DURATION_KEYS = ["durationseconds", "duration", "videoduration", "时长", "视频时长"] as const;
const MEDIA_TYPE_KEYS = ["mediatype", "awemetype", "内容类型", "媒体类型"] as const;
const EVENT_SOURCE_KEYS = ["occurredatsource", "eventtimesource", "时间来源"] as const;
const PLAY_COUNT_KEYS = ["playcount", "viewcount", "播放数", "播放量"] as const;
const DIGG_COUNT_KEYS = ["diggcount", "likecount", "点赞数", "点赞量"] as const;
const COMMENT_COUNT_KEYS = ["commentcount", "评论数", "评论量"] as const;
const SHARE_COUNT_KEYS = ["sharecount", "分享数", "分享量"] as const;
const COLLECT_COUNT_KEYS = ["collectcount", "favoritecount", "收藏数", "收藏量"] as const;
const DOWNLOAD_COUNT_KEYS = ["downloadcount", "下载数", "下载量"] as const;
const WATCHED_SECONDS_KEYS = ["watchedseconds", "watchedduration", "watchduration", "观看时长"] as const;
const PROGRESS_PERCENT_KEYS = ["percent", "progress", "playprogress", "观看进度"] as const;
const TYPE_KEYS = ["recordtype", "datatype", "category", "type", "记录类型", "数据类型", "分类"] as const;

const IMAGE_HOST_SUFFIXES = [
  "douyin.com",
  "douyinpic.com",
  "douyinvod.com",
  "byteimg.com",
  "ibytedtos.com",
  "snssdk.com",
] as const;

type Primitive = string | number | boolean;

export type PersonalArchiveErrorCode =
  | "too_large"
  | "unsupported_format"
  | "invalid_json"
  | "invalid_zip"
  | "unsafe_zip"
  | "too_complex";

export class PersonalArchiveError extends Error {
  constructor(
    public readonly code: PersonalArchiveErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PersonalArchiveError";
  }
}

interface ParseContext {
  records: PersonalRecordCollection;
  dedupeKeys: Record<PersonalRecordType, Set<string>>;
  nodeCount: number;
}

interface ZipEntryMetadata {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
  directory: boolean;
}

function normalizeKey(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/\.json$|\.txt$/u, "")
    .replace(/[\s_\-./\\()[\]{}:：]+/gu, "");
}

function classifyLabel(value: string): PersonalRecordType | null {
  const normalized = normalizeKey(value);

  for (const type of Object.keys(RECORD_ALIASES) as PersonalRecordType[]) {
    if (RECORD_ALIASES[type].some((alias) => normalized === alias || normalized.includes(alias))) {
      return type;
    }
  }

  return null;
}

function classifyPath(path: readonly string[]): PersonalRecordType | null {
  for (let index = path.length - 1; index >= 0; index -= 1) {
    const segment = path[index];
    if (!segment) continue;
    const type = classifyLabel(segment);
    if (type) return type;
  }

  return null;
}

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectPrimitiveFields(
  value: Record<string, unknown>,
  depth = 0,
  result = new Map<string, Primitive>(),
): Map<string, Primitive> {
  if (depth > 3) return result;

  for (const [key, fieldValue] of Object.entries(value)) {
    const normalizedKey = normalizeKey(key);
    if (
      (typeof fieldValue === "string" ||
        typeof fieldValue === "number" ||
        typeof fieldValue === "boolean") &&
      !result.has(normalizedKey)
    ) {
      result.set(normalizedKey, fieldValue);
    } else if (isRecordObject(fieldValue)) {
      collectPrimitiveFields(fieldValue, depth + 1, result);
    }
  }

  return result;
}

function findField(fields: Map<string, Primitive>, aliases: readonly string[]): Primitive | null {
  for (const alias of aliases) {
    const value = fields.get(normalizeKey(alias));
    if (value !== undefined) return value;
  }
  return null;
}

function toCleanString(value: Primitive | null, limit = 500): string | null {
  if (value === null) return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized.slice(0, limit) : null;
}

function toHttpUrl(value: Primitive | null): string | null {
  const candidate = toCleanString(value, 2_048);
  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    const host = url.hostname.toLocaleLowerCase();
    const trusted = host === "douyin.com"
      || host.endsWith(".douyin.com")
      || host === "iesdouyin.com"
      || host.endsWith(".iesdouyin.com")
      || host === "amemv.com"
      || host.endsWith(".amemv.com");
    if (url.protocol !== "https:" || !trusted) return null;
    url.search = "";
    url.hash = "";
    return url.toString().slice(0, 2_048);
  } catch {
    return null;
  }
}

function toImageUrl(value: Primitive | null): string | null {
  const candidate = toCleanString(value, 2_048);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    const host = url.hostname.toLocaleLowerCase();
    const trusted = IMAGE_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
    return url.protocol === "https:" && trusted ? url.toString().slice(0, 2_048) : null;
  } catch {
    return null;
  }
}

function normalizeDate(value: Primitive | null): string | null {
  const candidate = toCleanString(value);
  if (!candidate) return null;

  if (/^\d{10,13}$/u.test(candidate)) {
    const numeric = Number(candidate);
    const milliseconds = candidate.length === 10 ? numeric * 1000 : numeric;
    const date = new Date(milliseconds);
    if (Number.isFinite(date.getTime()) && date.getUTCFullYear() >= 2000 && date.getUTCFullYear() <= 2100) {
      return date.toISOString();
    }
  }

  const parsed = new Date(candidate);
  return Number.isFinite(parsed.getTime()) && parsed.getUTCFullYear() >= 2000 && parsed.getUTCFullYear() <= 2100
    ? parsed.toISOString()
    : null;
}

function toCount(value: Primitive | null): number | null {
  const candidate = toCleanString(value, 30);
  if (!candidate || !/^\d+$/u.test(candidate)) return null;
  const numeric = Number(candidate);
  return Number.isSafeInteger(numeric) && numeric >= 0 && numeric <= 1_000_000_000_000 ? numeric : null;
}

function toDurationSeconds(value: Primitive | null): number | null {
  const candidate = toCleanString(value, 30);
  if (!candidate || !/^\d+(?:\.\d+)?$/u.test(candidate)) return null;
  const numeric = Number(candidate);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  const seconds = numeric <= 86_400 ? numeric : numeric / 1_000;
  return seconds <= 86_400 ? Math.round(seconds * 100) / 100 : null;
}

function toPercent(value: Primitive | null): number | null {
  const candidate = toCleanString(value, 30);
  if (!candidate || !/^\d+(?:\.\d+)?$/u.test(candidate)) return null;
  const numeric = Number(candidate);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  const percent = numeric <= 1 ? numeric * 100 : numeric;
  return percent <= 100 ? Math.round(percent * 100) / 100 : null;
}

function videoIdFromUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const match = new URL(url).pathname.match(/\/video\/([^/?#]+)/u);
    return match?.[1] ? decodeURIComponent(match[1]).slice(0, 200) : null;
  } catch {
    return null;
  }
}

function collectTopics(value: Record<string, unknown>, title: string | null): string[] {
  const topics: string[] = [];
  const add = (candidate: unknown): void => {
    if (typeof candidate !== "string" && typeof candidate !== "number") return;
    const normalized = String(candidate).trim().replace(/^#/u, "").slice(0, 100);
    if (normalized && !topics.includes(normalized) && topics.length < 100) topics.push(normalized);
  };
  const visit = (candidate: unknown, depth = 0): void => {
    if (depth > 3 || topics.length >= 100) return;
    if (Array.isArray(candidate)) {
      for (const item of candidate.slice(0, 100)) {
        if (typeof item === "string" || typeof item === "number") add(item);
        else visit(item, depth + 1);
      }
      return;
    }
    if (!isRecordObject(candidate)) return;
    for (const [key, child] of Object.entries(candidate)) {
      const normalizedKey = normalizeKey(key);
      const topicContainer = ["topics", "topic", "hashtags", "hashtag", "chalist", "textextra", "话题", "标签"].includes(normalizedKey);
      const topicName = ["chaname", "hashtagname", "topicname", "话题名", "标签名"].includes(normalizedKey);
      if (topicName) add(child);
      else if (topicContainer) visit(child, depth + 1);
      else if (isRecordObject(child)) visit(child, depth + 1);
    }
  };
  visit(value);
  if (title) {
    for (const match of title.matchAll(/#([^#\s,，。！？!?;；]{1,100})/gu)) add(match[1]);
  }
  return topics;
}

function findNestedRecord(
  value: Record<string, unknown>,
  aliases: readonly string[],
  depth = 0,
): Record<string, unknown> | null {
  if (depth > 3) return null;
  const normalizedAliases = aliases.map(normalizeKey);
  for (const [key, child] of Object.entries(value)) {
    if (isRecordObject(child) && normalizedAliases.includes(normalizeKey(key))) return child;
  }
  for (const child of Object.values(value)) {
    if (!isRecordObject(child)) continue;
    const match = findNestedRecord(child, aliases, depth + 1);
    if (match) return match;
  }
  return null;
}

function firstUrlInValue(value: unknown, depth = 0): string | null {
  if (depth > 3) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return toImageUrl(value);
  }
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 20)) {
      const url = firstUrlInValue(item, depth + 1);
      if (url) return url;
    }
  } else if (isRecordObject(value)) {
    for (const child of Object.values(value)) {
      const url = firstUrlInValue(child, depth + 1);
      if (url) return url;
    }
  }
  return null;
}

function parseMusic(value: Record<string, unknown>): PersonalVideoRecord["music"] {
  const music = findNestedRecord(value, ["music", "musicinfo", "音乐", "配乐"]);
  if (!music) return null;
  const fields = collectPrimitiveFields(music);
  const result: NonNullable<PersonalVideoRecord["music"]> = {};
  const id = toCleanString(findField(fields, ["id", "musicid", "音乐id"]), 200);
  const title = toCleanString(findField(fields, ["title", "name", "musicname", "音乐名", "配乐名"]));
  const author = toCleanString(findField(fields, ["author", "authorname", "ownername", "artist", "音乐作者"]));
  const url = firstUrlInValue(music);
  if (id) result.id = id;
  if (title) result.title = title;
  if (author) result.author = author;
  if (url) result.url = url;
  return Object.keys(result).length > 0 ? result : null;
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function parseRecord(value: unknown, type: PersonalRecordType): PersonalVideoRecord | null {
  if (typeof value === "string" || typeof value === "number") {
    const text = String(value).trim();
    if (!text) return null;
    const url = toHttpUrl(text);
    const result: PersonalVideoRecord = {
      id: `${type}-${stableHash(text)}`,
      title: url ? "视频记录" : text,
      author: null,
      occurredAt: null,
      url,
      occurredAtSource: "unknown",
    };
    const videoId = videoIdFromUrl(url);
    if (videoId) result.videoId = videoId;
    return result;
  }

  if (!isRecordObject(value)) return null;

  const fields = collectPrimitiveFields(value);
  const sourceId = toCleanString(findField(fields, ID_KEYS), 200);
  const rawTitle = toCleanString(findField(fields, TITLE_KEYS));
  const author = toCleanString(findField(fields, AUTHOR_KEYS));
  const url = toHttpUrl(findField(fields, URL_KEYS));
  const occurredAt = normalizeDate(findField(fields, TIME_KEYS));
  const videoId = sourceId ?? videoIdFromUrl(url);
  const legacyCollectorRecord = typeof value.id === "string" && value.id.startsWith(`${type}:`);

  if (!videoId && !rawTitle && !url) return null;

  const identity = videoId ?? url ?? `${rawTitle ?? ""}|${author ?? ""}|${occurredAt ?? ""}`;
  const result: PersonalVideoRecord = {
    id: `${type}-${stableHash(identity)}`,
    title: rawTitle ?? "未命名视频",
    author,
    occurredAt,
    url,
    occurredAtSource: occurredAt ? legacyCollectorRecord ? "platform_action" : "archive_action" : "unknown",
  };
  if (videoId) result.videoId = videoId;

  const authorId = toCleanString(findField(fields, AUTHOR_ID_KEYS), 200);
  const avatarObject = findNestedRecord(value, ["avatarthumb", "avatarmedium", "avatarlarger", "authoravatar"]);
  const authorAvatarUrl = toImageUrl(findField(fields, AUTHOR_AVATAR_KEYS)) ?? firstUrlInValue(avatarObject);
  const explicitSource = toCleanString(findField(fields, EVENT_SOURCE_KEYS), 30);
  const publishedAt = normalizeDate(findField(fields, PUBLISHED_TIME_KEYS));
  const coverObject = findNestedRecord(value, ["cover", "origincover", "dynamiccover", "thumbnail"]);
  const coverUrl = toImageUrl(findField(fields, COVER_KEYS)) ?? firstUrlInValue(coverObject);
  const rawMediaType = toCleanString(findField(fields, MEDIA_TYPE_KEYS), 30)?.toLocaleLowerCase();
  const durationSeconds = toDurationSeconds(findField(fields, DURATION_KEYS));
  if (authorId) result.authorId = authorId;
  if (authorAvatarUrl) result.authorAvatarUrl = authorAvatarUrl;
  if (explicitSource === "platform_action" || explicitSource === "archive_action" || explicitSource === "unknown") {
    result.occurredAtSource = explicitSource;
  }
  if (publishedAt) result.publishedAt = publishedAt;
  if (coverUrl) result.coverUrl = coverUrl;
  if (rawMediaType === "video" || rawMediaType === "image" || rawMediaType === "live" || rawMediaType === "unknown") {
    result.mediaType = rawMediaType;
  }
  if (durationSeconds !== null) result.durationSeconds = durationSeconds;

  const music = parseMusic(value);
  const topics = collectTopics(value, rawTitle);
  const stats: NonNullable<PersonalVideoRecord["stats"]> = {};
  const playCount = toCount(findField(fields, PLAY_COUNT_KEYS));
  const diggCount = toCount(findField(fields, DIGG_COUNT_KEYS));
  const commentCount = toCount(findField(fields, COMMENT_COUNT_KEYS));
  const shareCount = toCount(findField(fields, SHARE_COUNT_KEYS));
  const collectCount = toCount(findField(fields, COLLECT_COUNT_KEYS));
  const downloadCount = toCount(findField(fields, DOWNLOAD_COUNT_KEYS));
  if (playCount !== null) stats.playCount = playCount;
  if (diggCount !== null) stats.diggCount = diggCount;
  if (commentCount !== null) stats.commentCount = commentCount;
  if (shareCount !== null) stats.shareCount = shareCount;
  if (collectCount !== null) stats.collectCount = collectCount;
  if (downloadCount !== null) stats.downloadCount = downloadCount;
  const watchedSeconds = toDurationSeconds(findField(fields, WATCHED_SECONDS_KEYS));
  const percent = toPercent(findField(fields, PROGRESS_PERCENT_KEYS));
  if (music) result.music = music;
  if (topics.length > 0) result.topics = topics;
  if (Object.keys(stats).length > 0) result.stats = stats;
  if (watchedSeconds !== null || percent !== null) {
    result.watchProgress = {};
    if (watchedSeconds !== null) result.watchProgress.watchedSeconds = watchedSeconds;
    if (percent !== null) result.watchProgress.percent = percent;
  }
  return result;
}

function recordDedupeKey(record: PersonalVideoRecord): string {
  return record.videoId ?? record.url ?? `${record.title}|${record.author ?? ""}|${record.occurredAt ?? ""}`;
}

function addRecord(context: ParseContext, type: PersonalRecordType, value: unknown): void {
  const record = parseRecord(value, type);
  if (!record) return;

  const dedupeKey = recordDedupeKey(record);
  if (context.dedupeKeys[type].has(dedupeKey)) return;

  context.dedupeKeys[type].add(dedupeKey);
  context.records[type].push(record);
}

function classifyItem(value: unknown): PersonalRecordType | null {
  if (!isRecordObject(value)) return null;
  const fields = collectPrimitiveFields(value);
  const explicitType = toCleanString(findField(fields, TYPE_KEYS));
  return explicitType ? classifyLabel(explicitType) : null;
}

function walkJson(value: unknown, path: readonly string[], context: ParseContext, depth = 0): void {
  context.nodeCount += 1;
  if (context.nodeCount > MAX_JSON_NODES || depth > MAX_JSON_DEPTH) {
    throw new PersonalArchiveError("too_complex", "个人信息文件结构过大，已停止解析。");
  }

  if (Array.isArray(value)) {
    const pathType = classifyPath(path);
    for (const item of value) {
      const itemType = pathType ?? classifyItem(item);
      if (itemType) {
        addRecord(context, itemType, item);
      } else if (isRecordObject(item) || Array.isArray(item)) {
        walkJson(item, path, context, depth + 1);
      }
    }
    return;
  }

  if (!isRecordObject(value)) return;

  for (const [key, child] of Object.entries(value)) {
    walkJson(child, [...path, key], context, depth + 1);
  }
}

function createParseContext(): ParseContext {
  return {
    records: createEmptyPersonalRecords(),
    dedupeKeys: {
      watch_history: new Set<string>(),
      liked_videos: new Set<string>(),
      favorite_videos: new Set<string>(),
    },
    nodeCount: 0,
  };
}

function parseJsonDocument(text: string, sourcePath: string, context: ParseContext): void {
  const normalizedText = text.replace(/^\uFEFF/u, "").trim();
  if (!normalizedText) {
    throw new PersonalArchiveError("invalid_json", `${sourcePath} 是空 JSON 文件。`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(normalizedText) as unknown;
  } catch {
    throw new PersonalArchiveError("invalid_json", `${sourcePath} 不是有效的 JSON 文件。`);
  }

  walkJson(parsed, [sourcePath], context);
}

function readZipMetadata(bytes: Uint8Array): ZipEntryMetadata[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const minimumEocdOffset = Math.max(0, bytes.length - 65_557);
  let eocdOffset = -1;

  for (let offset = bytes.length - 22; offset >= minimumEocdOffset; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }

  if (eocdOffset < 0) {
    throw new PersonalArchiveError("invalid_zip", "ZIP 文件缺少有效的目录信息。");
  }

  const diskNumber = view.getUint16(eocdOffset + 4, true);
  const centralDisk = view.getUint16(eocdOffset + 6, true);
  const entryCount = view.getUint16(eocdOffset + 10, true);
  const centralSize = view.getUint32(eocdOffset + 12, true);
  const centralOffset = view.getUint32(eocdOffset + 16, true);

  if (diskNumber !== 0 || centralDisk !== 0 || entryCount === 0xffff) {
    throw new PersonalArchiveError("unsafe_zip", "暂不支持多卷或 ZIP64 个人信息包。");
  }
  if (entryCount > MAX_ZIP_ENTRIES) {
    throw new PersonalArchiveError("unsafe_zip", `ZIP 条目超过 ${MAX_ZIP_ENTRIES} 个，已停止解析。`);
  }
  if (centralOffset + centralSize > bytes.length) {
    throw new PersonalArchiveError("invalid_zip", "ZIP 中央目录已损坏。");
  }

  const entries: ZipEntryMetadata[] = [];
  let cursor = centralOffset;
  let totalExpandedBytes = 0;

  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > bytes.length || view.getUint32(cursor, true) !== 0x02014b50) {
      throw new PersonalArchiveError("invalid_zip", "ZIP 条目目录已损坏。");
    }

    const flags = view.getUint16(cursor + 8, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const nameStart = cursor + 46;
    const nextCursor = nameStart + nameLength + extraLength + commentLength;

    if (nextCursor > bytes.length || compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) {
      throw new PersonalArchiveError("unsafe_zip", "ZIP 使用了暂不支持的扩展格式。");
    }
    if ((flags & 0x1) !== 0) {
      throw new PersonalArchiveError("unsafe_zip", "暂不支持加密 ZIP，请先在本机解密。");
    }

    const name = strFromU8(bytes.subarray(nameStart, nameStart + nameLength));
    const normalizedPath = name.replace(/\\/gu, "/");
    const pathParts = normalizedPath.split("/");
    if (/^(?:\/|[a-z]:)/iu.test(normalizedPath) || pathParts.includes("..")) {
      throw new PersonalArchiveError("unsafe_zip", "ZIP 包含不安全的文件路径。");
    }
    if (uncompressedSize > MAX_ZIP_ENTRY_BYTES) {
      throw new PersonalArchiveError("unsafe_zip", "ZIP 中存在过大的单个文件。");
    }
    if (
      uncompressedSize > 0 &&
      (compressedSize === 0 || uncompressedSize / compressedSize > MAX_ZIP_COMPRESSION_RATIO)
    ) {
      throw new PersonalArchiveError("unsafe_zip", "ZIP 压缩比异常，已停止解析。");
    }

    totalExpandedBytes += uncompressedSize;
    if (totalExpandedBytes > MAX_ZIP_EXPANDED_BYTES) {
      throw new PersonalArchiveError("unsafe_zip", "ZIP 解压后内容过大，已停止解析。");
    }

    entries.push({
      name,
      compressedSize,
      uncompressedSize,
      directory: normalizedPath.endsWith("/"),
    });
    cursor = nextCursor;
  }

  return entries;
}

function sortRecords(records: PersonalRecordCollection): void {
  for (const type of Object.keys(records) as PersonalRecordType[]) {
    records[type].sort((left, right) => {
      const leftTime = left.occurredAt ? Date.parse(left.occurredAt) : Number.NaN;
      const rightTime = right.occurredAt ? Date.parse(right.occurredAt) : Number.NaN;
      const safeLeft = Number.isFinite(leftTime) ? leftTime : 0;
      const safeRight = Number.isFinite(rightTime) ? rightTime : 0;
      return safeRight - safeLeft;
    });
  }
}

function buildWarnings(records: PersonalRecordCollection, warnings: string[]): string[] {
  if (countPersonalRecords(records) === 0) {
    warnings.push("未找到可识别的观看历史、点赞列表或收藏列表字段。");
  }
  return [...new Set(warnings)];
}

export function parsePersonalArchiveBytes(
  bytes: Uint8Array,
  sourceName = "personal-data.json",
): PersonalArchiveData {
  if (bytes.byteLength > MAX_ARCHIVE_BYTES) {
    throw new PersonalArchiveError("too_large", "个人信息文件超过 32 MB，请选择仅包含记录的导出文件。");
  }

  const format = detectPersonalArchiveFormat(bytes);
  const context = createParseContext();

  if (format === "json") {
    parseJsonDocument(strFromU8(bytes), sourceName, context);
    sortRecords(context.records);
    return {
      format,
      records: context.records,
      parsedFileCount: 1,
      ignoredFileCount: 0,
      warnings: buildWarnings(context.records, []),
    };
  }

  if (format !== "zip") {
    throw new PersonalArchiveError("unsupported_format", "请选择 JSON 或 ZIP 格式的官方个人信息文件。");
  }

  const metadata = readZipMetadata(bytes);
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(bytes);
  } catch {
    throw new PersonalArchiveError("invalid_zip", "ZIP 文件无法解压或已损坏。");
  }

  const warnings: string[] = [];
  let parsedFileCount = 0;
  let ignoredFileCount = 0;

  for (const entry of metadata) {
    if (entry.directory) continue;
    const contents = unzipped[entry.name];
    const lowercaseName = entry.name.toLocaleLowerCase();
    const jsonCandidate = lowercaseName.endsWith(".json") || lowercaseName.endsWith(".txt");

    if (!contents || !jsonCandidate) {
      ignoredFileCount += 1;
      continue;
    }

    const text = strFromU8(contents).replace(/^\uFEFF/u, "").trim();
    if (!text.startsWith("{") && !text.startsWith("[")) {
      ignoredFileCount += 1;
      continue;
    }

    try {
      parseJsonDocument(text, entry.name, context);
      parsedFileCount += 1;
    } catch (error) {
      if (error instanceof PersonalArchiveError && error.code === "invalid_json") {
        ignoredFileCount += 1;
        warnings.push(`${entry.name} 无法解析，已跳过。`);
      } else {
        throw error;
      }
    }
  }

  if (parsedFileCount === 0) {
    warnings.push("ZIP 中没有可读取的 JSON 记录文件。");
  }

  sortRecords(context.records);
  return {
    format,
    records: context.records,
    parsedFileCount,
    ignoredFileCount,
    warnings: buildWarnings(context.records, warnings),
  };
}
