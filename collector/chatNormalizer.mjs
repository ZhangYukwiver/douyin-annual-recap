const SUPPORTED_HOSTS = new Set(["imapi.douyin.com", "imapi.snssdk.com"]);
const SUPPORTED_PATHS = new Set([
  "/v1/message/get_by_conversation",
  "/v1/message/get_by_user",
  "/v1/message/get_message_by_init",
  "/v1/message/get_user_message",
  "/v1/message/get_by_id",
]);
const IMAGE_HOST_SUFFIXES = [
  "douyin.com",
  "douyinpic.com",
  "douyinvod.com",
  "byteimg.com",
  "ibytedtos.com",
  "snssdk.com",
];
const CHAT_TYPES = new Set(["text", "image", "sticker", "share", "call", "system", "voice", "video", "unknown"]);
const CONVERSATION_KINDS = new Set(["friend", "group", "unknown"]);
const STICKER_TYPES = new Set([500, 501, 507, 508, 510, 514, 516]);
const IMAGE_TYPES = new Set([2702, 2703, 2704]);
const SHARE_TYPES = new Set([700, 800, 801, 803, 10401, 10500, 11029, 11054, 11055, 11063, 11066, 11067, 11069, 11070]);
const MAX_STRING = 500;
const MAX_URL = 2_048;
const MAX_CHAT_MESSAGES = 100_000;
const MAX_CHAT_CONVERSATIONS = 10_000;

export class CollectorAdapterError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CollectorAdapterError";
    this.code = code;
  }
}

export function createEmptyChatMessages() {
  return [];
}

export function matchImapiEndpoint(value) {
  try {
    const url = new URL(value);
    const pathname = url.pathname.replace(/\/$/u, "") || "/";
    if (!SUPPORTED_HOSTS.has(url.hostname) || !SUPPORTED_PATHS.has(pathname)) return null;
    return { kind: "chat_messages", pathname };
  } catch {
    return null;
  }
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanString(value, limit = MAX_STRING) {
  if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") {
    const text = String(value).trim();
    return text ? text.slice(0, limit) : null;
  }
  return null;
}

function normalizeConversationKind(value) {
  const text = cleanString(value, 50)?.toLowerCase();
  if (text === "1" || text === "one_to_one" || text === "one_to_one_chat" || text === "friend" || text === "private" || text === "好友" || text === "私聊") return "friend";
  if (text === "2" || text === "group" || text === "group_chat" || text === "群聊") return "group";
  return CONVERSATION_KINDS.has(text) ? text : "unknown";
}

function firstString(...values) {
  for (const value of values) {
    const text = cleanString(value);
    if (text) return text;
  }
  return null;
}

function toUint8Array(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw new CollectorAdapterError("invalid_response", "聊天响应不是有效的二进制数据。");
}

function readVarint(bytes, start) {
  let value = 0;
  let shift = 0;
  let pos = start;
  while (pos < bytes.length) {
    const byte = bytes[pos];
    pos += 1;
    value += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) return [value, pos];
    shift += 7;
    if (shift > 53) break;
  }
  throw new CollectorAdapterError("invalid_response", "聊天响应的 protobuf 数据被截断。");
}

function readVarintBig(bytes, start) {
  let value = 0n;
  let shift = 0n;
  let pos = start;
  while (pos < bytes.length) {
    const byte = bytes[pos];
    pos += 1;
    value |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return [value, pos];
    shift += 7n;
    if (shift > 70n) break;
  }
  throw new CollectorAdapterError("invalid_response", "聊天响应的 protobuf 数据被截断。");
}

function readProtoFields(bytes) {
  const fields = new Map();
  let pos = 0;
  while (pos < bytes.length) {
    const [tag, next] = readVarint(bytes, pos);
    pos = next;
    const field = tag >> 3;
    const wireType = tag & 7;
    if (wireType === 0) {
      const [bigValue, nextValue] = readVarintBig(bytes, pos);
      const value = bigValue <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(bigValue) : bigValue.toString();
      pos = nextValue;
      const list = fields.get(field) ?? [];
      list.push({ wireType, value });
      fields.set(field, list);
      continue;
    }
    if (wireType === 2) {
      const [length, nextValue] = readVarint(bytes, pos);
      const end = nextValue + length;
      if (end > bytes.length) throw new CollectorAdapterError("invalid_response", "聊天响应的 protobuf 长度字段无效。");
      const list = fields.get(field) ?? [];
      list.push({ wireType, value: bytes.slice(nextValue, end) });
      fields.set(field, list);
      pos = end;
      continue;
    }
    if (wireType === 1) {
      if (pos + 8 > bytes.length) throw new CollectorAdapterError("invalid_response", "聊天响应的 protobuf 数据被截断。");
      pos += 8;
      continue;
    }
    if (wireType === 5) {
      if (pos + 4 > bytes.length) throw new CollectorAdapterError("invalid_response", "聊天响应的 protobuf 数据被截断。");
      pos += 4;
      continue;
    }
    throw new CollectorAdapterError("invalid_response", "聊天响应包含不支持的 protobuf 字段。");
  }
  return fields;
}

function firstField(fields, fieldNumber, wireType = null) {
  const items = fields.get(fieldNumber);
  if (!items) return null;
  return items.find((item) => wireType === null || item.wireType === wireType) ?? null;
}

function fieldValues(fields, fieldNumber, wireType = null) {
  const items = fields.get(fieldNumber) ?? [];
  return wireType === null ? items.map((item) => item.value) : items.filter((item) => item.wireType === wireType).map((item) => item.value);
}

function decodeText(value, limit = MAX_STRING) {
  if (!(value instanceof Uint8Array)) return cleanString(value, limit);
  if (value.length === 0) return null;
  return cleanString(new TextDecoder().decode(value), limit);
}

function decodeJsonMaybe(value) {
  let text = decodeText(value, 20_000);
  if (!text) return null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const parsed = JSON.parse(text);
      if (isObject(parsed) || Array.isArray(parsed)) return parsed;
      text = String(parsed);
    } catch {
      return null;
    }
  }
  return null;
}

function parseTimestamp(value) {
  const text = cleanString(value, 100);
  if (!text) return null;
  if (/^\d+(?:\.\d+)?$/u.test(text)) {
    const numeric = Number(text);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    const milliseconds = numeric >= 1e14 ? numeric / 1_000
      : numeric >= 1e11 ? numeric
        : numeric >= 1e9 ? numeric * 1_000
          : numeric * 1_000;
    const date = new Date(milliseconds);
    return Number.isFinite(date.getTime()) && date.getUTCFullYear() >= 2000 && date.getUTCFullYear() <= 2100 ? date.toISOString() : null;
  }
  const date = new Date(text);
  return Number.isFinite(date.getTime()) && date.getUTCFullYear() >= 2000 && date.getUTCFullYear() <= 2100 ? date.toISOString() : null;
}

function parseSnowflakeTimestamp(value) {
  try {
    const numeric = BigInt(String(value));
    if (numeric <= 0n) return null;
    return parseTimestamp((numeric >> 32n).toString());
  } catch {
    return null;
  }
}

function normalizeImageUrl(value) {
  const text = cleanString(value, MAX_URL);
  if (!text) return null;
  try {
    const url = new URL(text);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || !IMAGE_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) {
      return null;
    }
    return url.toString().slice(0, MAX_URL);
  } catch {
    return null;
  }
}

function normalizeDouyinUrl(value) {
  const text = cleanString(value, MAX_URL);
  if (!text) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" || !(url.hostname === "douyin.com" || url.hostname.endsWith(".douyin.com"))) return null;
    url.search = "";
    url.hash = "";
    return url.toString().slice(0, MAX_URL);
  } catch {
    return null;
  }
}

function normalizeDurationSeconds(value) {
  const text = cleanString(value, 100);
  if (!text || !/^\d+(?:\.\d+)?$/u.test(text)) return null;
  const numeric = Number(text);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  const seconds = numeric > 86_400 ? numeric / 1_000 : numeric;
  return seconds <= 86_400 ? Math.round(seconds * 100) / 100 : null;
}

function parseDurationFromContent(content) {
  if (!isObject(content)) return null;
  const keys = [
    ["callDurationSeconds", "seconds"],
    ["call_duration_seconds", "seconds"],
    ["durationSeconds", "seconds"],
    ["duration_seconds", "seconds"],
    ["callDurationMs", "milliseconds"],
    ["call_duration_ms", "milliseconds"],
    ["durationMs", "milliseconds"],
    ["duration_ms", "milliseconds"],
    ["callDurationUs", "microseconds"],
    ["call_duration_us", "microseconds"],
    ["durationUs", "microseconds"],
    ["duration_us", "microseconds"],
    ["callDuration", "auto"],
    ["call_duration", "auto"],
    ["duration", "auto"],
  ];
  for (const [key, unit] of keys) {
    if (content[key] === undefined) continue;
    const text = cleanString(content[key], 100);
    if (!text || !/^\d+(?:\.\d+)?$/u.test(text)) continue;
    const numeric = Number(text);
    if (!Number.isFinite(numeric) || numeric < 0) continue;
    if (unit === "seconds") return numeric <= 86_400 ? Math.round(numeric * 100) / 100 : null;
    if (unit === "milliseconds") return numeric <= 86_400_000 ? Math.round((numeric / 1_000) * 100) / 100 : null;
    if (unit === "microseconds") return numeric <= 86_400_000_000 ? Math.round((numeric / 1_000_000) * 100) / 100 : null;
    return normalizeDurationSeconds(numeric > 86_400 ? numeric / 1_000 : numeric);
  }
  return null;
}

function parseDurationFromText(value) {
  const text = cleanString(value, MAX_STRING);
  if (!text) return null;
  let match = text.match(/(\d+)\s*(?:分|分钟)\s*(?:(\d+)\s*秒)?/u);
  if (match) {
    const seconds = Number(match[1]) * 60 + Number(match[2] ?? 0);
    return seconds <= 86_400 ? seconds : null;
  }
  match = text.match(/(\d{1,4})\s*[:：]\s*(\d{1,2})/u);
  if (match) {
    const seconds = Number(match[1]) * 60 + Number(match[2]);
    return seconds <= 86_400 ? seconds : null;
  }
  match = text.match(/(\d+(?:\.\d+)?)\s*秒/u);
  if (!match) return null;
  const seconds = Math.round(Number(match[1]));
  return seconds <= 86_400 ? seconds : null;
}

function isCallContent(typeCode, content) {
  const explicit = cleanString(typeCode, 50)?.toLowerCase();
  const contentCode = cleanString(content?.aweType ?? content?.awe_type, 50)?.toLowerCase();
  if (explicit === "call" || explicit === "193" || contentCode === "193") return true;
  if (!isObject(content)) return false;
  const text = [content.text, content.tips, content.hint_text, content.push_detail, content.description]
    .map((value) => cleanString(value))
    .filter(Boolean)
    .join(" ");
  return /通话|视频通话|voice.?call|video.?call|call.?duration/iu.test(text)
    || Object.keys(content).some((key) => /call.?duration|call.?time|elapsed/iu.test(key));
}

function parseCallDuration(content, depth = 0) {
  if (depth > 4) return null;
  if (Array.isArray(content)) {
    for (const item of content.slice(0, 20)) {
      const nested = parseCallDuration(item, depth + 1);
      if (nested !== null) return nested;
    }
    return null;
  }
  if (!isObject(content)) return null;
  const direct = parseDurationFromContent(content) ?? parseDurationFromText(parseText(content));
  if (direct !== null) return direct;
  for (const [key, value] of Object.entries(content)) {
    if (/call.?duration|duration.?seconds|elapsed|call.?time/iu.test(key)) {
      const fromText = parseDurationFromText(value);
      if (fromText !== null) return fromText;
    }
  }
  const entries = Object.entries(content);
  const startValue = entries.find(([key]) => /(?:start|begin).*(?:time|at)|(?:start|begin)$/iu.test(key))?.[1];
  const endValue = entries.find(([key]) => /(?:end|finish).*(?:time|at)|(?:end|finish)$/iu.test(key))?.[1];
  const start = parseTimestamp(startValue);
  const end = parseTimestamp(endValue);
  if (start && end) {
    const seconds = Math.round((Date.parse(end) - Date.parse(start)) / 1_000);
    if (seconds >= 0 && seconds <= 86_400) return seconds;
  }
  for (const child of Object.values(content)) {
    if (isObject(child)) {
      const nested = parseCallDuration(child, depth + 1);
      if (nested !== null) return nested;
    }
  }
  return null;
}

function parseText(content) {
  if (!isObject(content)) return null;
  return firstString(
    content.text,
    content.description,
    content.desc,
    content.content,
    content.message,
    content.caption,
    content.title,
    content.push_detail,
    content.hint_text,
    content.tips,
    content.display_name,
    content.comment,
  );
}

function parseShare(content) {
  if (!isObject(content)) return null;
  const source = isObject(content.share) ? content.share
    : isObject(content.share_info) ? content.share_info
      : isObject(content.shareInfo) ? content.shareInfo
        : isObject(content.video) ? content.video
          : isObject(content.item) ? content.item
            : isObject(content.link) ? content.link
              : isObject(content.related_share_video) ? content.related_share_video
              : (content.content_title || content.aweme_title || content.cover_url || content.coverUrl || content.itemId || content.aweType || content.awe_type)
                ? content
                : null;
  if (!source) return null;
  const coverValue = source.coverUrl ?? source.cover_url ?? source.cover ?? source.image_url ?? source.thumb_url
    ?? content.coverUrl ?? content.cover_url ?? content.cover;
  const coverUrl = normalizeImageUrl(coverValue)
    ?? (isObject(coverValue) ? normalizeImageUrl(
      coverValue.url_list?.[0] ?? coverValue.origin_url_list?.[0] ?? coverValue.large_url_list?.[0],
    ) : null);
  const sourceAuthor = isObject(source.author) ? source.author : null;
  const share = {
    title: firstString(source.title, source.content_title, source.aweme_title, source.description, source.desc, source.text, source.push_detail, content.content_title, content.aweme_title, content.title, content.description),
    author: firstString(source.author_name, source.content_name, source.nickname, source.owner_name, source.display_name, typeof source.author === "string" ? source.author : null, sourceAuthor?.nickname, content.content_name, content.author_name, content.author?.nickname, typeof content.author === "string" ? content.author : null),
    coverUrl,
    url: normalizeDouyinUrl(source.url ?? source.share_url ?? source.shareUrl ?? source.link ?? content.url ?? content.share_url ?? content.shareUrl)
      ?? (firstString(source.itemId, source.item_id, content.itemId, content.item_id, content.aweme_id)
        ? `https://www.douyin.com/video/${encodeURIComponent(firstString(source.itemId, source.item_id, content.itemId, content.item_id, content.aweme_id))}`
        : null),
  };
  return Object.values(share).some((value) => value) ? share : null;
}

function parseMediaUrlFromContent(content) {
  if (!isObject(content)) return null;
  const candidate = [
    content.mediaUrl,
    content.media_url,
    content.imageUrl,
    content.image_url,
    content.stickerUrl,
    content.sticker_url,
    content.url,
    isObject(content.image) ? content.image.url : null,
    isObject(content.sticker) ? content.sticker.url : null,
    isObject(content.cover) ? content.cover.url : null,
    isObject(content.url) ? content.url.url_list?.[0] : null,
    isObject(content.resource_url) ? content.resource_url.large_url_list?.[0] : null,
    isObject(content.resource_url) ? content.resource_url.origin_url_list?.[0] : null,
    isObject(content.resource_url) ? content.resource_url.medium_url_list?.[0] : null,
    isObject(content.resource_url) ? content.resource_url.thumb_url_list?.[0] : null,
    isObject(content.resource_url) ? content.resource_url.url_list?.[0] : null,
    isObject(content.poster) ? content.poster.origin_url_list?.[0] : null,
    content.stickers?.[0]?.static_url?.url_list?.[0],
    content.joker_stickers?.[0]?.static_url?.url_list?.[0],
  ].find((value) => normalizeImageUrl(value));
  return normalizeImageUrl(candidate)
    ?? (isObject(candidate) ? normalizeImageUrl(candidate.url_list?.[0] ?? candidate.origin_url_list?.[0]) : null);
}

function parseMessageType(typeCode, content) {
  const explicit = cleanString(typeCode, 50)?.toLowerCase();
  if (explicit === "call" || explicit === "193") return "call";
  if (!isObject(content)) return "unknown";
  if (isCallContent(typeCode, content)) return "call";
  const numeric = /^\d+$/u.test(explicit ?? "") ? Number(explicit) : null;
  const contentNumericText = cleanString(content.aweType ?? content.awe_type, 50);
  const contentNumeric = /^\d+$/u.test(contentNumericText ?? "") ? Number(contentNumericText) : null;
  if (STICKER_TYPES.has(contentNumeric) || content.sticker || content.sticker_url || content.stickerUrl || content.stickers || content.joker_stickers) return "sticker";
  if (IMAGE_TYPES.has(contentNumeric)) return "image";
  if (SHARE_TYPES.has(contentNumeric)) return "share";
  if (contentNumeric !== null && contentNumeric >= 100_000) return "system";
  if (content.video || content.poster) return "video";
  if (content.resource_url && content.duration) return "voice";
  if (CHAT_TYPES.has(explicit)) return explicit;
  if (explicit === "7") return "text";
  if (STICKER_TYPES.has(numeric)) return "sticker";
  if (IMAGE_TYPES.has(numeric)) return "image";
  if (SHARE_TYPES.has(numeric)) return "share";
  if (numeric !== null && numeric >= 100_000) return "system";
  if (parseShare(content)) return "share";
  if (parseMediaUrlFromContent(content)) return content.type === "sticker" ? "sticker" : "image";
  if (parseText(content)) return "text";
  return "unknown";
}

function parseMessageObject(value, fallbackConversationId = null, fallbackConversation = {}) {
  if (!isObject(value)) return null;
  const content = isObject(value.content_json)
    ? value.content_json
    : isObject(value.contentJson)
      ? value.contentJson
      : isObject(value.content)
        ? value.content
      : decodeJsonMaybe(value.content_json ?? value.contentJson ?? value.content);
  const contentObject = isObject(content) ? content : null;
  const conversation = typeof fallbackConversationId === "object" && fallbackConversationId !== null
    ? fallbackConversationId
    : { id: fallbackConversationId, kind: fallbackConversation.conversationType, name: fallbackConversation.conversationName };
  const conversationId = firstString(value.conv_id, value.conversation_id, value.conversationId, conversation.id, contentObject?.conv_id);
  const conversationType = normalizeConversationKind(value.conversation_type ?? value.conversationType ?? conversation.kind);
  const conversationName = firstString(
    value.conversation_name,
    value.conversationName,
    contentObject?.conversation_name,
    contentObject?.conversationName,
    conversation.name,
  );
  const senderId = firstString(value.sender_uid, value.sender_id, value.senderId, contentObject?.sender_uid, contentObject?.sender_id);
  const serverId = firstString(value.server_id, value.serverId, value.message_id, value.messageId, value.id);
  const sentAt = parseTimestamp(value.created_at_us ?? value.createdAtUs ?? value.created_at ?? value.createdAt ?? value.timestamp ?? contentObject?.created_at_us ?? contentObject?.createdAt)
    ?? parseSnowflakeTimestamp(serverId);
  const rawTypeCode = value.type_code ?? value.typeCode ?? contentObject?.type_code ?? contentObject?.aweType ?? contentObject?.awe_type ?? contentObject?.type;
  const contentForClassification = contentObject ?? value;
  const type = parseMessageType(rawTypeCode, contentForClassification);
  const fallbackId = [conversationId, senderId, sentAt, type, JSON.stringify(contentObject ?? value)].filter(Boolean).join(":");
  const id = serverId ?? (fallbackId || null);
  if (!id) return null;
  const message = {
    id: id.slice(0, 300),
    conversationId,
    conversationType,
    conversationName,
    senderId,
    senderName: firstString(value.sender_name, value.senderName, contentObject?.sender_name, contentObject?.senderName, contentObject?.nickname),
    sentAt,
    type,
    text: null,
    mediaUrl: null,
    share: null,
    callDurationSeconds: null,
  };
  const share = type === "share" ? parseShare(contentForClassification) : null;
  const mediaUrl = parseMediaUrlFromContent(contentForClassification);
  const messageText = parseText(contentObject) ?? parseText(value);
  const duration = type === "call"
    ? parseCallDuration(contentForClassification) ?? parseCallDuration(value)
    : null;
  const text = messageText ?? share?.title ?? null;
  if (text) message.text = text;
  if (mediaUrl) message.mediaUrl = mediaUrl;
  if (share) message.share = share;
  if (duration !== null) message.callDurationSeconds = duration;
  if (type === "call" && message.callDurationSeconds === null) {
    message.callDurationSeconds = duration;
  }
  if (type === "image" && message.mediaUrl === null) {
    message.mediaUrl = mediaUrl;
  }
  if (type === "sticker" && message.mediaUrl === null) {
    message.mediaUrl = mediaUrl;
  }
  if (message.text === null) {
    message.text = type === "call"
      ? "[通话]"
      : type === "sticker"
        ? "[表情包]"
        : type === "image"
          ? "[图片]"
          : type === "share"
            ? "[分享]"
            : null;
  }
  if (type === "share" && message.mediaUrl === null) message.mediaUrl = share?.coverUrl ?? null;
  return message;
}

function readJsonMessages(payload) {
  const pick = (value) => {
    if (Array.isArray(value)) return value;
    if (isObject(value)) {
      for (const key of ["msgs", "messages", "message_list", "msg_list", "chatMessages", "items", "list"]) {
        if (Array.isArray(value[key])) return value[key];
      }
    }
    return null;
  };
  if (Array.isArray(payload)) return payload;
  if (!isObject(payload)) return null;
  return pick(payload) ?? pick(payload.data) ?? pick(payload.result);
}

function parseConversationInfo(bytes) {
  const fields = readProtoFields(bytes);
  const core = firstField(fields, 50, 2)?.value;
  const coreFields = core instanceof Uint8Array ? readProtoFields(core) : null;
  return {
    id: firstString(decodeText(firstField(fields, 1, 2)?.value), decodeText(firstField(fields, 1)?.value)),
    kind: normalizeConversationKind(firstField(fields, 3, 0)?.value ?? decodeText(firstField(fields, 3, 2)?.value)),
    name: firstString(
      coreFields ? decodeText(firstField(coreFields, 5, 2)?.value) : null,
      coreFields ? decodeText(firstField(coreFields, 5)?.value) : null,
    ),
  };
}

function parseProtoMessage(bytes, fallbackConversation = null) {
  const fields = readProtoFields(bytes);
  const fallback = typeof fallbackConversation === "string"
    ? { id: fallbackConversation }
    : fallbackConversation ?? {};
  const conversationId = firstString(
    decodeText(firstField(fields, 1, 2)?.value),
    fallback.id,
    decodeText(firstField(fields, 1)?.value),
  );
  const senderId = firstString(
    firstField(fields, 7, 0)?.value,
    decodeText(firstField(fields, 7, 2)?.value),
  );
  const message = {
    server_id: firstString(firstField(fields, 3, 0)?.value, decodeText(firstField(fields, 3, 2)?.value)),
    message_index: firstString(firstField(fields, 17, 0)?.value, firstField(fields, 13, 0)?.value),
    created_at_us: firstString(
      firstField(fields, 10, 0)?.value,
      decodeText(firstField(fields, 10, 2)?.value),
      firstField(fields, 4, 0)?.value,
      decodeText(firstField(fields, 4, 2)?.value),
    ),
    order: firstString(firstField(fields, 5, 0)?.value, decodeText(firstField(fields, 5, 2)?.value)),
    type_code: firstField(fields, 6, 0)?.value ?? cleanString(decodeText(firstField(fields, 6, 2)?.value)),
    conversation_type: normalizeConversationKind(firstField(fields, 2, 0)?.value ?? decodeText(firstField(fields, 2, 2)?.value) ?? fallback.kind),
    conversation_name: fallback.name ?? null,
    sender_uid: senderId,
    conv_id: conversationId,
    content_json: decodeText(firstField(fields, 8, 2)?.value, 20_000) ?? null,
  };
  return message;
}

function boolField(fields, fieldNumber) {
  const value = firstField(fields, fieldNumber, 0)?.value;
  return value === undefined || value === null ? null : value === 1 || value === "1";
}

function unwrapResponseBody(bytes) {
  const topFields = readProtoFields(bytes);
  const body = firstField(topFields, 6, 2)?.value;
  return body instanceof Uint8Array
    ? { body, fields: readProtoFields(body) }
    : { body: bytes, fields: topFields };
}

function parseConversationMessage(bytes) {
  const fields = readProtoFields(bytes);
  const info = firstField(fields, 1, 2)?.value;
  const conversation = info instanceof Uint8Array ? parseConversationInfo(info) : { id: null, kind: "unknown", name: null };
  return {
    conversation,
    messages: fieldValues(fields, 2, 2)
      .map((message) => parseProtoMessage(message, conversation))
      .filter(Boolean),
  };
}

function parseMessageByInitResponse(bytes) {
  const fields = readProtoFields(bytes);
  const conversations = fieldValues(fields, 1, 2).map(parseConversationMessage);
  return {
    messages: conversations.flatMap((entry) => entry.messages),
    conversations: conversations.map((entry) => entry.conversation),
    pagination: {
      hasMore: boolField(fields, 2),
      cursor: firstString(firstField(fields, 3, 0)?.value, firstField(fields, 5, 0)?.value),
    },
  };
}

function parseUserMessageResponse(bytes) {
  const fields = readProtoFields(bytes);
  const messages = [];
  const conversations = [];
  let hasMore = null;
  let cursor = null;
  for (const recentBytes of fieldValues(fields, 1, 2)) {
    const recentFields = readProtoFields(recentBytes);
    hasMore ??= boolField(recentFields, 3);
    cursor ??= firstString(firstField(recentFields, 1, 0)?.value);
    for (const conversationBytes of fieldValues(recentFields, 2, 2)) {
      const conversationFields = readProtoFields(conversationBytes);
      const conversation = {
        id: firstString(
          decodeText(firstField(conversationFields, 5, 2)?.value),
          decodeText(firstField(conversationFields, 5)?.value),
        ),
        kind: "unknown",
        name: null,
      };
      conversations.push(conversation);
      for (const message of [
        ...fieldValues(conversationFields, 2, 2),
        ...fieldValues(conversationFields, 6, 2),
      ]) messages.push(parseProtoMessage(message, conversation));
    }
  }
  for (const commandBytes of fieldValues(fields, 2, 2)) {
    const commandFields = readProtoFields(commandBytes);
    hasMore ??= boolField(commandFields, 2);
    cursor ??= firstString(firstField(commandFields, 3, 0)?.value, firstField(commandFields, 4, 0)?.value);
    for (const message of fieldValues(commandFields, 1, 2)) messages.push(parseProtoMessage(message));
  }
  return { messages: messages.filter(Boolean), conversations, pagination: { hasMore, cursor } };
}

function parseMessageByIdResponse(bytes) {
  const { body, fields } = unwrapResponseBody(bytes);
  const command = firstField(fields, 211, 2)?.value;
  if (!(command instanceof Uint8Array)) return { messages: [], conversations: [], pagination: { hasMore: false, cursor: null } };
  const commandFields = readProtoFields(command);
  const messages = [];
  for (const envelopeBytes of fieldValues(commandFields, 1, 2)) {
    const envelopeFields = readProtoFields(envelopeBytes);
    for (const messageBytes of fieldValues(envelopeFields, 2, 2)) {
      const message = parseProtoMessage(messageBytes);
      if (message) messages.push(message);
    }
  }
  return { messages, conversations: [], pagination: { hasMore: false, cursor: null } };
}

function parseProtoMessages(payload, endpointPath = "") {
  const bytes = toUint8Array(payload);
  const { body, fields: bodyFields } = unwrapResponseBody(bytes);
  if (endpointPath === "/v1/message/get_message_by_init") {
    const command = firstField(bodyFields, 2043, 2)?.value ?? body;
    return parseMessageByInitResponse(command);
  }
  if (endpointPath === "/v1/message/get_user_message") {
    const command = firstField(bodyFields, 2048, 2)?.value ?? body;
    return parseUserMessageResponse(command);
  }
  if (endpointPath === "/v1/message/get_by_id") {
    return parseMessageByIdResponse(body);
  }
  const section = firstField(bodyFields, 301, 2)?.value ?? body;
  const sectionFields = section === body ? bodyFields : readProtoFields(section);
  const rows = fieldValues(sectionFields, 1, 2);
  const conversations = [];
  const pagination = {
    hasMore: boolField(sectionFields, 3),
    cursor: firstString(firstField(sectionFields, 2, 0)?.value, decodeText(firstField(sectionFields, 2, 2)?.value)),
  };
  if (rows.length > 0) {
    return { messages: rows.map(parseProtoMessage), conversations, pagination };
  }
  const looksLikeMessage = [1, 3, 4, 6, 7, 8, 10].some((field) => (sectionFields.get(field)?.length ?? 0) > 0);
  if (!looksLikeMessage) return { messages: [], conversations, pagination };
  return { messages: [parseProtoMessage(section)], conversations, pagination };
}

function normalizeMessages(rawMessages) {
  const messages = [];
  const seen = new Set();
  for (const item of rawMessages) {
    if (messages.length >= MAX_CHAT_MESSAGES) break;
    const message = parseMessageObject(item);
    if (!message || seen.has(message.id)) continue;
    seen.add(message.id);
    messages.push(message);
  }
  return messages.sort((left, right) => {
    const leftTime = left.sentAt ? Date.parse(left.sentAt) : 0;
    const rightTime = right.sentAt ? Date.parse(right.sentAt) : 0;
    return rightTime - leftTime || left.id.localeCompare(right.id);
  });
}

export function normalizeImapiMessage(value, fallbackConversationId = null) {
  return parseMessageObject(value, fallbackConversationId);
}

export function normalizeImapiResponse(endpoint, payload) {
  if (!endpoint || endpoint.kind !== "chat_messages") {
    throw new CollectorAdapterError("unsupported_endpoint", "采集器收到了不支持的 IM API 响应。");
  }

  let rawMessages = null;
  let rawConversations = [];
  let pagination = { hasMore: null, cursor: null };
  if (payload instanceof Uint8Array || payload instanceof ArrayBuffer || ArrayBuffer.isView(payload)) {
    ({ messages: rawMessages, conversations: rawConversations = [], pagination } = parseProtoMessages(payload, endpoint.pathname));
  } else if (typeof payload === "string") {
    try {
      const parsed = JSON.parse(payload);
      rawMessages = readJsonMessages(parsed);
      if (!rawMessages) throw new CollectorAdapterError("invalid_response", "IM API 返回了无法识别的 JSON。");
      const source = isObject(parsed.data) ? parsed.data : isObject(parsed.result) ? parsed.result : parsed;
      rawConversations = Array.isArray(source?.conversations)
        ? source.conversations
        : Array.isArray(source?.conversation_list) ? source.conversation_list : [];
      pagination = {
        hasMore: source?.has_more === 1 || source?.has_more === "1" ? true : source?.has_more === 0 || source?.has_more === "0" ? false : null,
        cursor: firstString(source?.next_ts, source?.next_timestamp, source?.nextTimestamp, source?.cursor),
      };
    } catch (error) {
      if (error instanceof CollectorAdapterError) throw error;
      throw new CollectorAdapterError("invalid_response", "IM API 返回了无法识别的文本响应。");
    }
  } else if (isObject(payload) || Array.isArray(payload)) {
    rawMessages = readJsonMessages(payload);
    if (!rawMessages) {
      if (isObject(payload) && ("content_json" in payload || "contentJson" in payload || "server_id" in payload || "serverId" in payload)) {
        rawMessages = [payload];
      } else {
        throw new CollectorAdapterError("schema_changed", "IM API 响应缺少消息列表。请更新采集器适配器。");
      }
    }
    const source = isObject(payload.data) ? payload.data : isObject(payload.result) ? payload.result : payload;
    rawConversations = Array.isArray(source?.conversations)
      ? source.conversations
      : Array.isArray(source?.conversation_list) ? source.conversation_list : [];
    pagination = {
      hasMore: source?.has_more === 1 || source?.has_more === "1" ? true : source?.has_more === 0 || source?.has_more === "0" ? false : null,
      cursor: firstString(source?.next_ts, source?.next_timestamp, source?.nextTimestamp, source?.cursor),
    };
  } else {
    throw new CollectorAdapterError("invalid_response", "IM API 响应类型无效。");
  }

  const chatMessages = normalizeMessages(rawMessages);
  if (rawMessages.length > 0 && chatMessages.length === 0) {
    throw new CollectorAdapterError("schema_changed", "IM API 消息列表包含无法识别的数据。请更新采集器适配器。");
  }

  const conversations = new Map();
  for (const value of rawConversations) {
    const id = firstString(value?.id, value?.conversationId, value?.conversation_id);
    if (!id) continue;
    conversations.set(id, {
      id,
      kind: normalizeConversationKind(value.kind ?? value.type ?? value.conversationType ?? value.conversation_type),
      name: firstString(value.name, value.conversationName, value.conversation_name),
    });
  }
  for (const message of chatMessages) {
    if (!message.conversationId) continue;
    const previous = conversations.get(message.conversationId);
    conversations.set(message.conversationId, {
      id: message.conversationId,
      kind: previous?.kind && previous.kind !== "unknown" ? previous.kind : message.conversationType,
      name: previous?.name ?? message.conversationName,
    });
  }

  return { chatMessages, conversations: [...conversations.values()], pagination };
}

// Internal collector names keep the chat listener independent from the
// endpoint's historical name.
export const ChatAdapterError = CollectorAdapterError;
export const matchChatEndpoint = matchImapiEndpoint;

export function normalizeChatPayload(payload, context = {}) {
  const endpoint = context.endpoint?.kind === "chat_messages"
    ? context.endpoint
    : { kind: "chat_messages", pathname: "/v1/message/get_by_conversation" };
  const result = normalizeImapiResponse(endpoint, payload);
  if (!context || Object.keys(context).length === 0 || !context.endpoint && !context.conversationId && !context.conversationName) {
    return {
      messages: result.chatMessages,
      conversations: result.conversations,
      hasMore: result.pagination.hasMore,
      nextTimestamp: result.pagination.cursor,
    };
  }
  const messages = result.chatMessages.map((message) => ({
    ...message,
    conversationId: message.conversationId ?? context.conversationId ?? null,
    conversationType: message.conversationType === "unknown"
      ? normalizeConversationKind(context.conversationType)
      : message.conversationType,
    conversationName: message.conversationName ?? context.conversationName ?? null,
  }));
  const conversations = result.conversations.length > 0 || !context.conversationId
    ? result.conversations
    : [{
        id: context.conversationId,
        kind: normalizeConversationKind(context.conversationType),
        name: context.conversationName ?? null,
      }];
  return {
    messages,
    conversations,
    hasMore: result.pagination.hasMore,
    nextTimestamp: result.pagination.cursor,
  };
}

export class ChatMessageAccumulator {
  constructor(initialMessages = createEmptyChatMessages()) {
    this.messages = new Map();
    this.addMessages(initialMessages, false);
  }

  addMessages(messages, trackTruncation = true) {
    let added = 0;
    for (const message of messages ?? []) {
      const normalized = message?.id ? message : normalizeImapiMessage(message);
      if (!normalized) continue;
      if (!this.messages.has(normalized.id) && this.messages.size >= MAX_CHAT_MESSAGES) {
        if (trackTruncation) break;
        continue;
      }
      if (!this.messages.has(normalized.id)) added += 1;
      const previous = this.messages.get(normalized.id);
      this.messages.set(normalized.id, {
        ...previous,
        ...normalized,
        conversationId: normalized.conversationId ?? previous?.conversationId ?? null,
        conversationType: normalized.conversationType ?? previous?.conversationType ?? "unknown",
        conversationName: normalized.conversationName ?? previous?.conversationName ?? null,
        senderId: normalized.senderId ?? previous?.senderId ?? null,
        senderName: normalized.senderName ?? previous?.senderName ?? null,
        sentAt: normalized.sentAt ?? previous?.sentAt ?? null,
        text: normalized.text ?? previous?.text ?? null,
        mediaUrl: normalized.mediaUrl ?? previous?.mediaUrl ?? null,
        share: normalized.share ?? previous?.share ?? null,
        callDurationSeconds: normalized.callDurationSeconds ?? previous?.callDurationSeconds ?? null,
      });
    }
    return added;
  }

  snapshot() {
    return [...this.messages.values()].sort((left, right) => {
      const leftTime = left.sentAt ? Date.parse(left.sentAt) : 0;
      const rightTime = right.sentAt ? Date.parse(right.sentAt) : 0;
      return rightTime - leftTime || left.id.localeCompare(right.id);
    });
  }
}

export class ChatConversationAccumulator {
  constructor(initialConversations = [], currentUserId = null) {
    this.currentUserId = cleanString(currentUserId, 300);
    this.conversations = new Map();
    this.messageIds = new Map();
    this.messageSenders = new Map();
    this.addConversations(initialConversations);
  }

  setCurrentUserId(currentUserId) {
    this.currentUserId = cleanString(currentUserId, 300);
    for (const [id, conversation] of this.conversations) {
      const senders = this.messageSenders.get(id) ?? [];
      conversation.ownMessageCount = this.currentUserId
        ? senders.filter((senderId) => senderId === this.currentUserId).length
        : 0;
    }
  }

  addConversations(conversations) {
    for (const value of conversations ?? []) {
      const id = firstString(value?.id, value?.conversationId, value?.conversation_id);
      if (!id || this.conversations.size >= MAX_CHAT_CONVERSATIONS && !this.conversations.has(id)) continue;
      const kind = normalizeConversationKind(value?.kind ?? value?.type ?? value?.conversationType ?? value?.conversation_type);
      const previous = this.conversations.get(id);
      this.conversations.set(id, {
        id,
        kind: previous?.kind === "group" || kind === "group"
          ? "group"
          : kind !== "unknown" ? kind : previous?.kind ?? "unknown",
        name: previous?.kind === "group"
          ? firstString(previous?.name, value?.name, value?.conversationName, value?.conversation_name)
          : firstString(value?.name, value?.conversationName, value?.conversation_name, previous?.name),
        messageCount: previous?.messageCount ?? 0,
        ownMessageCount: previous?.ownMessageCount ?? 0,
      });
      if (!this.messageIds.has(id)) this.messageIds.set(id, new Set());
    }
  }

  addMessages(messages) {
    for (const message of messages ?? []) {
      const id = firstString(message?.conversationId, message?.conversation_id);
      if (!id) continue;
      const kind = normalizeConversationKind(message?.conversationType ?? message?.conversation_type);
      const previous = this.conversations.get(id);
      if (this.conversations.size >= MAX_CHAT_CONVERSATIONS && !previous) continue;
      if (!previous) {
        this.conversations.set(id, {
          id,
          kind,
          name: firstString(message?.conversationName, message?.conversation_name),
          messageCount: 0,
          ownMessageCount: 0,
        });
      } else if (previous.kind === "unknown" && kind !== "unknown") {
        previous.kind = kind;
      }
      const entry = this.conversations.get(id);
      const seen = this.messageIds.get(id) ?? new Set();
      this.messageIds.set(id, seen);
      const messageId = firstString(message?.id, message?.server_id, message?.serverId);
      if (!messageId || seen.has(messageId)) continue;
      seen.add(messageId);
      const senders = this.messageSenders.get(id) ?? [];
      senders.push(firstString(message?.senderId, message?.sender_id, message?.sender_uid));
      this.messageSenders.set(id, senders);
      entry.messageCount += 1;
      if (this.currentUserId && firstString(message?.senderId, message?.sender_id, message?.sender_uid) === this.currentUserId) {
        entry.ownMessageCount += 1;
      }
    }
  }

  snapshot() {
    return [...this.conversations.values()]
      .map(({ id, kind, name, messageCount, ownMessageCount }) => ({
        id,
        kind,
        name: name ?? null,
        messageCount,
        ownMessageCount,
      }))
      .sort((left, right) => (right.messageCount - left.messageCount) || left.id.localeCompare(right.id));
  }
}
