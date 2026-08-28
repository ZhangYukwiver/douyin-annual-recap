import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => {
  const Component = () => null;
  return {
    Platform: { OS: "web" },
    Pressable: Component,
    ScrollView: Component,
    StyleSheet: { create: <T,>(value: T) => value, absoluteFill: {} },
    Text: Component,
    useWindowDimensions: () => ({ width: 1440, height: 900 }),
    View: Component,
  };
});
vi.mock("lucide-react-native", () => {
  const Component = () => null;
  return Object.fromEntries([
    "Bookmark", "BookOpen", "CalendarDays", "ChevronLeft", "ChevronRight", "CircleCheck", "Clock6", "Clock9",
    "Clock12", "Compass", "Download", "Eye", "Feather", "Heart", "Hourglass", "Image", "Info", "Layers", "Lock",
    "MessageCircle", "Moon", "Mountain", "Pause", "Phone", "Play", "Radio", "RotateCcw", "Send", "Settings2",
    "Signature", "SkipForward", "Star", "Sticker", "Target", "Telescope", "UserRound",
  ].map((name) => [name, Component]));
});
vi.mock("react-native-svg", () => {
  const Component = () => null;
  return {
    default: Component,
    ...Object.fromEntries(["Circle", "Defs", "Ellipse", "Line", "LinearGradient", "Path", "RadialGradient", "Rect", "Stop", "Text", "TextPath"].map((name) => [name, Component])),
  };
});

import type { ChatMessage } from "../../domain/chatRecords";
import type { PersonalRecordCollection, PersonalVideoRecord } from "../../domain/personalRecords";
import { buildReportModel, selectBookCoverUris } from "./ReportWorkspace";

function video(id: string, occurredAt: string, percent?: number): PersonalVideoRecord {
  return {
    id,
    videoId: "video-1",
    title: "示例内容",
    author: "示例作者",
    occurredAt,
    occurredAtSource: "platform_action",
    url: null,
    mediaType: "video",
    topics: ["知识"],
    durationSeconds: 42,
    watchProgress: percent === undefined ? null : { percent },
  };
}

describe("buildReportModel", () => {
  it("keeps counts, replay, intersections and attention grounded in records", () => {
    const records: PersonalRecordCollection = {
      watch_history: [video("watch-1", "2026-08-20T12:00:00+08:00", 80), video("watch-2", "2026-08-21T12:00:00+08:00", 40)],
      liked_videos: [video("liked-1", "2026-08-21T12:05:00+08:00")],
      favorite_videos: [video("favorite-1", "2026-08-21T12:10:00+08:00")],
    };
    const chats: ChatMessage[] = [{
      id: "chat-1",
      conversationId: "conversation-1",
      conversationName: null,
      senderId: null,
      senderName: null,
      sentAt: "2026-08-21T12:20:00+08:00",
      type: "text",
      text: null,
      mediaUrl: null,
      share: null,
      callDurationSeconds: null,
    }];

    const model = buildReportModel(records, chats, null);

    expect(model.total).toBe(4);
    expect(model.unique).toBe(1);
    expect(model.replays).toBe(1);
    expect(model.intersection.allThree).toBe(1);
    expect(model.completion).toBe(60);
    expect(model.peakHour).toBe(12);
    expect(model.overlap).toBe(100);
    // 新增的档案页数据
    expect(model.attentionSeconds).toBeCloseTo(0.8 * 42 + 0.4 * 42);
    expect(model.evidence.watch.count).toBe(2);
    expect(model.evidence.watch.dots).toBe(1);
    expect(model.evidence.watch.range).toEqual(["2026-08-20", "2026-08-21"]);
    expect(model.evidence.watch.months[7]).toBe(true);
    expect(model.evidence.chat.caveat).toEqual(["observed", "partial"]);
    expect(model.evidence.creators.count).toBe(1);
    expect(model.events).toHaveLength(5);
    expect(model.events[0]).toMatchObject({ kind: "chat", label: "聊天互动", time: "12:20" });
    expect(model.calendar).toHaveLength(12);
    expect(model.calendar[7]!.some((level) => level > 0)).toBe(true);
    expect(model.calendar[0]!.every((level) => level === 0)).toBe(true);
    expect(model.seasons).toHaveLength(3);
    expect(model.seasons[1]!.title.startsWith("夏季")).toBe(true);
    expect(model.seasons[0]!.title).toBe("春季暂无观测");
  });

  it("selects the five newest unique book covers and honors privacy mode", () => {
    const cover = (id: string, occurredAt: string, videoId = id): PersonalVideoRecord => ({
      ...video(id, occurredAt),
      videoId,
      coverUrl: `https://p3.douyinpic.com/${id}.jpg`,
    });
    const records: PersonalRecordCollection = {
      watch_history: [
        cover("old", "2026-08-01T12:00:00Z"),
        cover("new-1", "2026-08-06T12:00:00Z"),
        cover("new-2", "2026-08-05T12:00:00Z"),
        cover("duplicate", "2026-08-04T12:00:00Z", "shared"),
      ],
      liked_videos: [cover("same-video", "2026-08-03T12:00:00Z", "shared"), cover("new-3", "2026-08-02T12:00:00Z")],
      favorite_videos: [cover("new-4", "2026-08-01T13:00:00Z"), cover("new-5", "2026-07-31T12:00:00Z")],
    };

    expect(selectBookCoverUris(records)).toEqual([
      "https://p3.douyinpic.com/new-1.jpg",
      "https://p3.douyinpic.com/new-2.jpg",
      "https://p3.douyinpic.com/duplicate.jpg",
      "https://p3.douyinpic.com/new-3.jpg",
      "https://p3.douyinpic.com/new-4.jpg",
    ]);
    expect(selectBookCoverUris(records, true)).toEqual([]);
  });

  it("counts group summaries without treating group bodies as friend content", () => {
    const records: PersonalRecordCollection = { watch_history: [], liked_videos: [], favorite_videos: [] };
    const chats: ChatMessage[] = [{
      id: "friend-1",
      conversationId: "friend-1",
      conversationType: "friend",
      conversationName: null,
      senderId: null,
      senderName: null,
      sentAt: "2026-08-21T12:20:00+08:00",
      type: "text",
      text: "好友消息",
      mediaUrl: null,
      share: null,
      callDurationSeconds: null,
    }, {
      id: "group-body-1",
      conversationId: "group-1",
      conversationType: "group",
      conversationName: "测试群",
      senderId: null,
      senderName: null,
      sentAt: "2026-08-21T12:21:00+08:00",
      type: "text",
      text: "不应参与好友节奏",
      mediaUrl: null,
      share: null,
      callDurationSeconds: null,
    }];
    const model = buildReportModel(records, chats, null, [{
      id: "group-1",
      kind: "group",
      name: "测试群",
      messageCount: 12,
      ownMessageCount: 3,
    }]);

    expect(model.chat).toBe(13);
    expect(model.chatGroupMessages).toBe(12);
    expect(model.chatOwnGroupMessages).toBe(3);
    expect(model.chatKinds).toEqual([expect.objectContaining({ name: "文字", count: 1 })]);
    expect(model.chatGroups).toHaveLength(1);
  });
});
