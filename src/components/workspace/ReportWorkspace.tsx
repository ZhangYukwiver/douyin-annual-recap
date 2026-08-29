import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock6,
  Clock9,
  Clock12,
  Compass,
  Download,
  Eye,
  Heart,
  Hourglass,
  Image as ImageIcon,
  Info,
  Layers,
  Lock,
  MessageCircle,
  Moon,
  Mountain,
  Pause,
  Phone,
  Play,
  Radio,
  RotateCcw,
  Send,
  Settings2,
  Signature,
  SkipForward,
  Star,
  Sticker,
  Target,
  Telescope,
  UserRound,
} from "lucide-react-native";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  Line,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
  Text as SvgText,
  TextPath,
} from "react-native-svg";

import type {
  AnnualCreatorsData,
  AnnualInterestsData,
  AnnualKeptData,
  AnnualMonthlyData,
  AnnualOverviewData,
  AnnualReport,
  AnnualRhythmData,
} from "../../domain/annualReport";
import { countChatMessages } from "../../domain/chatRecords";
import type { ChatConversationSummary, ChatMessage, ChatMessageType } from "../../domain/chatRecords";
import type { LivingReport } from "../../domain/livingReport";
import { deriveSurpriseInsights } from "../../domain/surpriseInsights";
import type {
  PersonalRecordCollection,
  PersonalRecordType,
  PersonalVideoRecord,
} from "../../domain/personalRecords";
import type { CollectorStatus } from "../../services/localCollector";
import { BookGate, type SealStart } from "./BookGate";

export type WorkspaceViewKey = PersonalRecordType | "chat" | "summary" | "highlights";

export interface ContentWorkspaceProps {
  activeView: WorkspaceViewKey;
  records: PersonalRecordCollection;
  chatMessages: ChatMessage[];
  chatConversations?: ChatConversationSummary[];
  report: AnnualReport | LivingReport | null;
  sourceLabel: string;
  updatedAt: string | null;
  busy: boolean;
  status: CollectorStatus | null;
  onChangeView: (view: WorkspaceViewKey) => void;
  onOpenRecord: (url: string) => Promise<void>;
  onOpenSettings: () => void;
  onReplayStory: () => void;
  onSync: () => void;
  onTogglePrivacy: () => void;
  privacy: boolean;
}

type Icon = React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
type PageId = "open" | "evidence" | "footprint" | "timeline" | "rhythm" | "attention" | "content" | "creators" | "chat" | "cross" | "surprises" | "profile";

const pages: Array<{ id: PageId; title: string; en: string; dossier: string }> = [
  { id: "open", title: "入口", en: "OPEN THE REPORT", dossier: "OBSERVATION" },
  { id: "evidence", title: "观测凭证", en: "EVIDENCE", dossier: "EVIDENCE" },
  { id: "footprint", title: "内容足迹", en: "FOOTPRINT", dossier: "FOOTPRINT" },
  { id: "timeline", title: "时间轴", en: "TIMELINE", dossier: "TIMELINE" },
  { id: "rhythm", title: "你的节拍", en: "RHYTHM", dossier: "RHYTHM" },
  { id: "attention", title: "你如何停留", en: "ATTENTION", dossier: "ATTENTION" },
  { id: "content", title: "内容回声", en: "CONTENT ECHO", dossier: "CONTENT" },
  { id: "creators", title: "创作者宇宙", en: "CREATOR UNIVERSE", dossier: "CREATOR" },
  { id: "chat", title: "聊天回声", en: "CHAT ECHO", dossier: "CHAT" },
  { id: "cross", title: "交叉洞察", en: "CROSS PATTERNS", dossier: "PATTERN" },
  { id: "surprises", title: "意外发现", en: "SURPRISES", dossier: "SURPRISE" },
  { id: "profile", title: "习惯印章", en: "HABIT PROFILE", dossier: "PROFILE" },
];

const BOOK_PAGE_COUNT = 5;
const BOOK_RECORD_TYPES = ["watch_history", "liked_videos", "favorite_videos"] as const;

export function selectBookCoverUris(records: PersonalRecordCollection, privacy = false): string[] {
  if (privacy) return [];
  const seenKeys = new Set<string>();
  const seenUris = new Set<string>();
  return BOOK_RECORD_TYPES
    .flatMap((type, typeIndex) => records[type].map((record, recordIndex) => ({ record, order: typeIndex * 1_000_000 + recordIndex })))
    .filter(({ record }) => Boolean(record.coverUrl?.trim()))
    .sort((left, right) => time(right.record.occurredAt) - time(left.record.occurredAt) || left.order - right.order)
    .filter(({ record }) => {
      const uri = record.coverUrl!.trim();
      const key = record.videoId?.trim() ? `video:${record.videoId.trim()}` : `cover:${uri}`;
      if (seenKeys.has(key) || seenUris.has(uri)) return false;
      seenKeys.add(key);
      seenUris.add(uri);
      return true;
    })
    .slice(0, BOOK_PAGE_COUNT)
    .map(({ record }) => record.coverUrl!.trim());
}

const weekdays = ["一", "二", "三", "四", "五", "六", "日"];
const weekLetters = ["M", "T", "W", "T", "F", "S", "S"];
const monthNames = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"];
const monthAbbr = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const chatTypes: Array<{ id: ChatMessageType; label: string }> = [
  { id: "text", label: "文字" }, { id: "image", label: "图片" }, { id: "sticker", label: "表情" },
  { id: "share", label: "分享" }, { id: "call", label: "通话" }, { id: "voice", label: "语音" }, { id: "video", label: "视频" },
  { id: "system", label: "系统" }, { id: "unknown", label: "其他" },
];
// Keep the five visual rows from the reference page while folding newer
// message types into their closest interaction family.
const chatDisplayTypes: Array<{ id: ChatMessageType; label: string }> = chatTypes.slice(0, 5);
function chatDisplayType(type: ChatMessageType): ChatMessageType | null {
  switch (type) {
    case "text":
    case "image":
    case "sticker":
    case "share":
    case "call":
      return type;
    case "voice":
      return "call";
    case "video":
      return "share";
    // System notices are text-like; unknown payloads stay out of the chart.
    // New message types must be assigned here explicitly instead of falling
    // through into a misleading visual bucket.
    case "system":
      return "text";
    case "unknown":
      return null;
  }
}
const pointer = Platform.OS === "web" ? ({ cursor: "pointer" } as object) : null;
const motionData = (motion: "frame" | "sparkle-group" | "twinkle", index = 0) => ({
  dataSet: { loopMotion: motion, loopIndex: String(index % 6) },
} as unknown as { dataSet: Record<string, string> });
const LOOP_MOTION_CSS = `
@keyframes contentFrameGlow {
  0%, 100% { box-shadow: inset 0 0 0 0 rgba(201,161,91,0), 0 0 0 rgba(112,195,191,0); }
  50% { box-shadow: inset 0 0 0 1px rgba(201,161,91,.16), 0 0 18px rgba(112,195,191,.055); }
}
@keyframes contentSparkleGroup {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: .72; transform: scale(1.015); }
}
@keyframes contentTwinkle {
  0%, 100% { filter: brightness(1); transform: scale(1); }
  45% { filter: brightness(1.42); transform: scale(1.14); }
  65% { filter: brightness(1.04); transform: scale(.96); }
}
[data-loop-motion="frame"] { animation: contentFrameGlow 8s ease-in-out infinite; }
[data-loop-motion="sparkle-group"] { animation: contentSparkleGroup 5.6s ease-in-out infinite; transform-origin: center; will-change: opacity, transform; }
[data-loop-motion="twinkle"] { animation: contentTwinkle 4.8s ease-in-out infinite; transform-origin: center; will-change: filter, transform; }
[data-loop-motion="twinkle"][data-loop-index="1"] { animation-delay: 0.7s; }
[data-loop-motion="twinkle"][data-loop-index="2"] { animation-delay: 1.4s; }
[data-loop-motion="twinkle"][data-loop-index="3"] { animation-delay: 2.1s; }
[data-loop-motion="twinkle"][data-loop-index="4"] { animation-delay: 2.8s; }
[data-loop-motion="twinkle"][data-loop-index="5"] { animation-delay: 3.5s; }
@media (prefers-reduced-motion: reduce) {
  [data-loop-motion] { animation: none !important; filter: none !important; transform: none !important; box-shadow: none !important; }
}
`;

interface Ranked { name: string; count: number; share: number }
interface EvidenceRow {
  count: number;
  dots: number;
  confidence: number;
  range: [string, string] | null;
  caveat: string[];
  months: boolean[];
}
interface CrossData {
  labels: string[];
  matrix: Array<Array<number | null>>;
  patterns: Array<{ title: string; text: string }>;
  days: number;
}
interface Model {
  year: number;
  period: string;
  total: number;
  unique: number;
  watch: number;
  liked: number;
  favorite: number;
  chat: number;
  chatGroups: ChatConversationSummary[];
  chatGroupMessages: number;
  chatOwnGroupMessages: number;
  dated: number;
  activeDays: number;
  creatorsCount: number;
  reliableRatio: number;
  status: "empty" | "partial" | "ok";
  warnings: string[];
  heatmap: number[];
  hours: number[];
  chatHours: number[];
  months: number[];
  topics: Ranked[];
  creators: Ranked[];
  formats: Ranked[];
  durations: Ranked[];
  chatKinds: Ranked[];
  completion: number | null;
  replays: number;
  intersection: { watchLiked: number; watchFavorite: number; likedFavorite: number; allThree: number };
  peakHour: number | null;
  peakDay: number | null;
  peakMonth: number | null;
  overlap: number | null;
  recent: Array<{ title: string; author: string | null; time: string | null; url: string | null }>;
  axes: Array<{ label: string; left: string; right: string; value: number | null }>;
  profile: string;
  attentionSeconds: number;
  evidence: Record<"watch" | "chat" | "kept" | "creators", EvidenceRow>;
  events: Array<{ kind: "watch" | "chat" | "kept"; label: string; time: string; url: string | null }>;
  calendar: number[][];
  seasons: Array<{ title: string; sub: string[] }>;
  milestones: Array<{ title: string; sub: string }>;
  progressPercents: number[];
  durationBands: Array<{ label: string; en: string; share: number | null }>;
  chatSlots: Array<{ id: string; label: string; en: string; slots: number[] }>;
  cross: CrossData;
  creatorFocus: { concentration: number | null; discovery: number | null; tail: number[] };
  surprises: ReturnType<typeof deriveSurpriseInsights>;
}

export function ContentWorkspace(props: ContentWorkspaceProps) {
  const { width, height } = useWindowDimensions();
  // The story reference canvas is 768px wide; keep tablet-sized web windows
  // in the editorial two-column layout and reserve stacking for phones.
  const mobile = width < 720;
  const [page, setPage] = useState(() => initialPage(props.activeView));
  const [gate, setGate] = useState<"book" | "seal" | "done">(() => Platform.OS === "web" && initialPage(props.activeView) === 0 ? "book" : "done");
  const [sealStart, setSealStart] = useState<SealStart | null>(null);
  const model = useMemo(() => buildReportModel(props.records, props.chatMessages, props.report, props.chatConversations ?? []), [props.chatConversations, props.chatMessages, props.records, props.report]);
  const bookCoverUris = useMemo(() => selectBookCoverUris(props.records, props.privacy), [props.privacy, props.records]);
  const { onOpenSettings } = props;

  useEffect(() => {
    if (props.activeView === "chat") setPage(8);
    if (props.activeView === "highlights") setPage(10);
  }, [props.activeView]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return undefined;
    const styleId = "content-workspace-loop-motion";
    if (document.getElementById(styleId)) return undefined;
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = LOOP_MOTION_CSS;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  const select = (next: number) => setPage(Math.max(0, Math.min(pages.length - 1, next)));
  const restart = () => select(0);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (event.key === "Escape") {
        onOpenSettings();
        return;
      }
      if (["ArrowRight", "ArrowDown", "PageDown"].includes(event.key) || event.key === " ") {
        event.preventDefault();
        setPage((current) => Math.min(pages.length - 1, current + 1));
      } else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(event.key)) {
        event.preventDefault();
        setPage((current) => Math.max(0, current - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpenSettings]);

  const def = pages[page]!;
  const late = page >= 4;
  const compactNav = Platform.OS === "web" && width < 900;
  const webGateScale = Platform.OS === "web" ? Math.min(width / 768, height / 482) : 1;
  // Dynamic pages use a 620px design height.  Fit that canvas into short web
  // viewports so the real components stay visible instead of being clipped by
  // the outer stage header/padding.  Wide desktop layouts remain at 1×.
  const webMobilePadding = !late && mobile ? 56 : 0;
  const webFrameWidth = Math.max(1, width - 52 - (late ? 0 : 92) - webMobilePadding);
  const webFrameHeight = Math.max(1, height - 42 - (late ? 0 : 44) - webMobilePadding);
  const webPageScale = Platform.OS === "web" ? Math.min(1, webFrameWidth / 768, webFrameHeight / 620) : 1;
  const pageContent = (
    <Page current={def.id} mobile={mobile} model={model} onNext={() => select(page + 1)} onOpen={props.onOpenRecord} onRestart={restart} onSettings={props.onOpenSettings} privacy={props.privacy} source={props.sourceLabel} updatedAt={props.updatedAt} />
  );
  const renderedPage = Platform.OS === "web"
    ? <WebPageTransition pageKey={def.id}>{pageContent}</WebPageTransition>
    : pageContent;
  const fittedPage = Platform.OS === "web"
    ? <WebPageFit height={webFrameHeight} scale={webPageScale} width={webFrameWidth}>{renderedPage}</WebPageFit>
    : renderedPage;
  return (
    <>
    <View testID="content-workspace" style={styles.root}>
      {late ? null : (
        <View style={styles.stageHead}>
          <Text style={styles.stageNo}>{String(page + 1).padStart(2, "0")}</Text>
          <Text style={styles.stageTitle}>{def.title}</Text>
          <Text style={styles.stageEn}>/ {def.en}</Text>
        </View>
      )}
      <View {...motionData("frame")} style={styles.frame}>
        {late ? (
          <ScrollView contentContainerStyle={styles.lateScroll} showsVerticalScrollIndicator={false} style={styles.flex}>
            {fittedPage}
          </ScrollView>
        ) : (
        <>
        <View style={styles.strip}>
          <View style={styles.stripTop}>
            <Text style={styles.stripYear}>{model.year}</Text>
            <Text style={styles.stripDossier}>{def.dossier}</Text>
            <Text style={styles.stripDossier}>DOSSIER</Text>
            <View style={styles.stripDash} />
          </View>
          <View style={styles.stripWords}>
            {["evidence", "observed", "pattern"].map((word) => <Text key={word} style={styles.stripWord}>{word}</Text>)}
          </View>
          <Compass color="#57492E" size={20} strokeWidth={1.1} />
        </View>
        {mobile ? (
          <ScrollView contentContainerStyle={styles.stageScroll} showsVerticalScrollIndicator={false} style={styles.flex}>
            {fittedPage}
          </ScrollView>
        ) : (
          <View style={styles.flex}>
            {fittedPage}
          </View>
        )}
        </>
        )}
      </View>
      <View style={[styles.nav, compactNav && styles.navCompact]}>
        <Pressable accessibilityLabel="上一章" accessibilityRole="button" disabled={page === 0} onPress={() => select(page - 1)} style={({ pressed }) => [styles.navButton, compactNav && styles.navButtonCompact, page === 0 && styles.disabled, pressed && styles.pressed, pointer]}><ChevronLeft color="#9A9184" size={15} /></Pressable>
        <Text style={[styles.navCount, compactNav && styles.navCountCompact]}>{String(page + 1).padStart(2, "0")} / {String(pages.length).padStart(2, "0")}</Text>
        <Pressable accessibilityLabel="下一章" accessibilityRole="button" disabled={page === pages.length - 1} onPress={() => select(page + 1)} style={({ pressed }) => [styles.navButton, compactNav && styles.navButtonCompact, page === pages.length - 1 && styles.disabled, pressed && styles.pressed, pointer]}><ChevronRight color="#9A9184" size={15} /></Pressable>
        <Pressable accessibilityLabel="连接与采集" accessibilityRole="button" onPress={props.onOpenSettings} style={({ pressed }) => [styles.navButton, compactNav && styles.navButtonCompact, pressed && styles.pressed, pointer]}><Settings2 color="#6F675B" size={13} /></Pressable>
      </View>
    </View>
    {Platform.OS === "web" && gate === "book" ? <BookGate covers={bookCoverUris} onDone={(start) => { setSealStart(start); setGate("seal"); }} privacy={props.privacy} /> : null}
    {Platform.OS === "web" && gate === "seal" ? <SealIntro auto onDone={() => setGate("done")} scale={webGateScale} start={sealStart} /> : null}
    </>
  );
}

function Page(args: PageArgs & { current: PageId }) {
  switch (args.current) {
    case "open": return <OpenPage {...args} />;
    case "evidence": return <EvidencePage {...args} />;
    case "footprint": return <FootprintPage {...args} />;
    case "timeline": return <TimelinePage {...args} />;
    case "rhythm": return <RhythmPage {...args} />;
    case "attention": return <AttentionPage {...args} />;
    case "content": return <ContentPage {...args} />;
    case "creators": return <CreatorsPage {...args} />;
    case "chat": return <ChatPage {...args} />;
    case "cross": return <CrossPage {...args} />;
    case "surprises": return <SurprisesPage {...args} />;
    case "profile": return <ProfilePage {...args} />;
  }
}

function WebPageTransition({ children, pageKey }: { children: React.ReactNode; pageKey: PageId }) {
  const progress = useRef(new Animated.Value(1)).current;
  const [settled, setSettled] = useState(true);
  const staticFrameData = { dataSet: { staticFrame: "true" } } as unknown as { dataSet: Record<string, string> };

  useEffect(() => {
    if (Platform.OS !== "web") return undefined;
    const reducedMotion = typeof window !== "undefined"
      && typeof window.matchMedia === "function"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    progress.stopAnimation();
    if (reducedMotion) {
      progress.setValue(1);
      setSettled(true);
      return undefined;
    }
    setSettled(false);
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: false,
    });
    animation.start(({ finished }) => {
      if (finished) setSettled(true);
    });
    return () => animation.stop();
  }, [pageKey, progress]);

  return (
    <Animated.View
      {...staticFrameData}
      style={[
        styles.flex,
        settled
          ? { opacity: 1 }
          : {
              opacity: progress,
              transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
            },
      ]}
    >
      {children}
    </Animated.View>
  );
}

function WebPageFit({ children, height, scale, width }: { children: React.ReactNode; height: number; scale: number; width: number }) {
  if (scale >= 0.999) return <View style={styles.flex}>{children}</View>;
  return (
    <View style={[styles.webFitViewport, { height, width }]}>
      <View style={{ height: height / scale, transform: [{ scale }], transformOrigin: "top left", width: width / scale }}>
        {children}
      </View>
    </View>
  );
}

function referenceSheets() {
  if (Platform.OS !== "web" || typeof document === "undefined") return [] as const;
  return [
    require("./assets/reference/pages-01-04.png"),
    require("./assets/reference/pages-05-08.png"),
    require("./assets/reference/pages-09-12.png"),
  ] as const;
}

/* ---------- 印章开场: 手绘印章逐渐落成第一页 ---------- */

// 印章在第一页画布(768×512)里的裁剪框与圆心, 从参考图实测: 圆界 x352-488 / y210-348
const SEAL_BOX = { x: 346, y: 205, size: 148 };
const SEAL_CENTER = { x: 420, y: 279 };
const SEAL_DISC = 137;
const SEAL_INTRO_MS = 2200;

function SealIntro({ auto, onDone, scale, start }: { auto?: boolean; onDone: () => void; scale: number; start?: SealStart | null }) {
  const [layout, setLayout] = useState<{ w: number; h: number } | null>(null);
  const progress = useRef(new Animated.Value(0)).current;
  const startedRef = useRef(false);

  const begin = () => {
    if (startedRef.current) {
      // 落章途中再点 = 跳过动画直接进第一页
      onDone();
      return;
    }
    startedRef.current = true;
    if (typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onDone();
      return;
    }
    Animated.timing(progress, { duration: SEAL_INTRO_MS, easing: Easing.inOut(Easing.cubic), toValue: 1, useNativeDriver: false }).start(({ finished }) => {
      if (finished) onDone();
    });
  };

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    // capture + preventDefault: 工作区翻页监听器见 defaultPrevented 会跳过
    const onKey = (event: KeyboardEvent) => {
      if (["Enter", " ", "ArrowRight", "ArrowDown", "PageDown"].includes(event.key)) {
        event.preventDefault();
        begin();
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    // auto: 书页压黑后停一拍自动落章(书那侧已完成点击交互); 有原位接力时拍子更短
    const timer = auto ? window.setTimeout(begin, start ? 200 : 350) : 0;
    return () => {
      window.removeEventListener("keydown", onKey, { capture: true });
      if (timer) window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sheet = referenceSheets()[0];
  const pageWidth = 768;
  const pageHeight = 482;
  const box = SEAL_BOX.size * scale;
  let body: React.ReactNode = null;
  if (layout && sheet) {
    // 印章终点 = 第一页画布(居中于本层)里的印章圆心;
    // 起点 = 书末页实印的屏幕矩形(BookGate 量好交接, 视口即本层坐标), 无接力时退回屏幕中央偏上
    const targetX = (layout.w - pageWidth * scale) / 2 + SEAL_CENTER.x * scale;
    const targetY = (layout.h - pageHeight * scale) / 2 + SEAL_CENTER.y * scale;
    const startX = start ? start.cx : layout.w / 2;
    const startY = start ? start.cy : layout.h * 0.46;
    const big = start
      ? (start.d * SEAL_BOX.size) / (SEAL_DISC * box)
      : Math.min(2.3, Math.max(1.1, (layout.h * 0.46) / box));
    const clamp = { extrapolate: "clamp" as const };
    const settle = (from: number, to: number) => progress.interpolate({ inputRange: [0, 0.08, 0.62], outputRange: [from, from * 1.03 - to * 0.03, to], ...clamp });
    body = (
      <>
        <Animated.View
          style={{
            position: "absolute",
            left: targetX - box / 2,
            top: targetY - box / 2,
            width: box,
            height: box,
            opacity: auto && !start ? progress.interpolate({ inputRange: [0, 0.07], outputRange: [0, 1], ...clamp }) : 1,
            transform: [
              { translateX: settle(startX - targetX, 0) },
              { translateY: settle(startY - targetY, 0) },
              { scale: progress.interpolate({ inputRange: [0, 0.08, 0.62], outputRange: [big, big * 1.05, 1], ...clamp }) },
              { rotate: progress.interpolate({ inputRange: [0, 0.62], outputRange: [start ? "0deg" : "-5deg", "0deg"], ...clamp }) },
            ],
          }}
        >
          <Animated.View style={[styles.sealIntroGlow, { borderRadius: box / 2, opacity: start
            ? progress.interpolate({ inputRange: [0, 0.32, 0.6], outputRange: [0, 0.5, 0], ...clamp })
            : progress.interpolate({ inputRange: [0, 0.5], outputRange: [0.9, 0], ...clamp }) }]} />
          <View style={{ borderRadius: (SEAL_DISC * scale) / 2, height: SEAL_DISC * scale, left: ((SEAL_BOX.size - SEAL_DISC) * scale) / 2, overflow: "hidden", position: "absolute", top: ((SEAL_BOX.size - SEAL_DISC) * scale) / 2, width: SEAL_DISC * scale }}>
            <Image
              resizeMode="stretch"
              source={sheet}
              style={{
                height: 1024 * scale,
                left: -(SEAL_CENTER.x - SEAL_DISC / 2) * scale,
                position: "absolute",
                top: -(SEAL_CENTER.y - SEAL_DISC / 2) * scale,
                width: 1536 * scale,
              }}
            />
          </View>
        </Animated.View>
        {auto ? null : (
          <Animated.Text style={[styles.sealIntroHint, { top: startY + (box * big) / 2 + 26, opacity: progress.interpolate({ inputRange: [0, 0.1], outputRange: [0.55, 0], ...clamp }) }]}>
            点击 · 开启报告
          </Animated.Text>
        )}
      </>
    );
  }
  return (
    <View onLayout={(event) => setLayout({ w: event.nativeEvent.layout.width, h: event.nativeEvent.layout.height })} style={StyleSheet.absoluteFill} testID="seal-gate">
      <Animated.View style={[StyleSheet.absoluteFill, styles.sealIntroBackdrop, { opacity: progress.interpolate({ inputRange: [0.6, 0.97], outputRange: [1, 0], extrapolate: "clamp" }) }]} />
      <Pressable accessibilityLabel="开启报告，进入年度故事" accessibilityRole="button" onPress={begin} style={[StyleSheet.absoluteFill, pointer]} testID="seal-gate-scene">
        {body}
      </Pressable>
    </View>
  );
}

/* ---------- 01 入口 / OPEN THE REPORT ---------- */

function OpenPage({ model, onNext }: PageArgs) {
  return (
    <View style={styles.openRoot}>
      <StarField />
      <View style={styles.openCenter}>
        <Text {...motionData("twinkle")} style={styles.openSpark}>✦</Text>
        <Text style={styles.openTitle}>个人内容宇宙报告</Text>
        <Text style={styles.openYear}>{model.year}</Text>
        <View style={styles.openSealRow}>
          <View style={styles.openRule} />
          <Text style={styles.openSealLabel}>OBSERVATION SEAL</Text>
          <View style={styles.openRule} />
        </View>
        <View style={styles.openBand}>
          <Constellation months={model.months} />
          <ObservationSeal yearValue={model.year} />
        </View>
        <Pressable accessibilityRole="button" onPress={onNext} testID="story-begin" style={({ pressed }) => [styles.plaque, pressed && styles.pressed, pointer]}>
          <View style={styles.plaqueInner}><Text style={styles.plaqueText}>开始观测</Text></View>
          <View style={[styles.plaqueNotch, styles.notchTL]} />
          <View style={[styles.plaqueNotch, styles.notchTR]} />
          <View style={[styles.plaqueNotch, styles.notchBL]} />
          <View style={[styles.plaqueNotch, styles.notchBR]} />
        </Pressable>
      </View>
    </View>
  );
}

function StarField() {
  const stars = useMemo(() => Array.from({ length: 74 }, (_, index) => ({
    left: (index * 37.7 + 5) % 100,
    top: (index * 61.3 + 11) % 100,
    size: index % 11 === 0 ? 2.6 : index % 4 === 0 ? 1.9 : 1.3,
    opacity: 0.12 + ((index * 29) % 42) / 100,
    gold: index % 9 === 0,
  })), []);
  const sparkles: Array<[number, number, number, number]> = [[9, 16, 11, 0.55], [88, 12, 9, 0.7], [16, 74, 9, 0.45], [82, 68, 12, 0.6], [46, 8, 8, 0.5], [68, 86, 8, 0.4]];
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {stars.map((star, index) => (
        <View key={index} style={{ position: "absolute", left: `${star.left}%`, top: `${star.top}%`, width: star.size, height: star.size, borderRadius: star.size, backgroundColor: star.gold ? "#C5A161" : "#D8D2C4", opacity: star.opacity }} />
      ))}
      <View {...motionData("sparkle-group")} pointerEvents="none" style={StyleSheet.absoluteFill}>
        {sparkles.map(([left, top, size, opacity], index) => (
          <Text key={`s${index}`} style={{ position: "absolute", left: `${left}%`, top: `${top}%`, color: "#C5A161", fontSize: size, opacity }}>✦</Text>
        ))}
      </View>
    </View>
  );
}

function ObservationSeal({ yearValue = year() }: { yearValue?: number }) {
  return (
    <View style={styles.sealWrap}>
      <Svg height={196} viewBox="0 0 200 200" width={196}>
        <Defs>
          <Path d="M 24 100 A 76 76 0 0 1 176 100" id="sealTop" />
          <Path d="M 26 100 A 74 74 0 0 0 174 100" id="sealBottom" />
        </Defs>
        <Circle cx={100} cy={100} fill="#0F0D08" r={97} stroke="#8A7442" strokeWidth={1.2} />
        <Circle cx={100} cy={100} fill="none" r={90} stroke="#6B5730" strokeDasharray="1 3.6" strokeWidth={0.8} />
        <Circle cx={100} cy={100} fill="#141109" r={66} stroke="#B08F52" strokeWidth={1.2} />
        <SvgText fill="#D9BC7F" fontSize={13} letterSpacing={5}>
          <TextPath href="#sealTop" startOffset="26%">OBSERVED</TextPath>
        </SvgText>
        <SvgText fill="#C9AA6C" fontSize={11} letterSpacing={4}>
          <TextPath href="#sealBottom" startOffset="40%">· {yearValue} ·</TextPath>
        </SvgText>
        <Circle cx={63} cy={74} fill="#C5A161" opacity={0.75} r={1.4} />
        <Circle cx={139} cy={70} fill="#C5A161" opacity={0.6} r={1.2} />
        <Circle cx={58} cy={124} fill="#C5A161" opacity={0.5} r={1.1} />
        <Circle cx={143} cy={128} fill="#C5A161" opacity={0.7} r={1.4} />
      </Svg>
      <View {...motionData("twinkle", 1)} style={styles.sealIcon}><Telescope color="#CBA05F" size={54} strokeWidth={1.1} /></View>
    </View>
  );
}

function Constellation({ months = [] }: { months?: number[] }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const max = Math.max(0, ...months);
  const basePts: Array<[number, number, boolean]> = ([
    [0.02, 0.64, false], [0.09, 0.46, true], [0.17, 0.66, false], [0.26, 0.5, false], [0.35, 0.6, true],
    [0.5, 0.54, false], [0.65, 0.58, false], [0.74, 0.44, true], [0.83, 0.62, false], [0.92, 0.48, false], [0.985, 0.56, false],
  ] as Array<[number, number, boolean]>).map(([x, fallback, highlighted], index) => {
    const value = months[index] ?? 0;
    const y = max ? 0.72 - value / max * 0.4 : fallback;
    return [x, Math.max(0.3, Math.min(0.78, y)), highlighted || value === max && max > 0] as [number, number, boolean];
  });
  const pts: Array<[number, number, boolean]> = basePts;
  return (
    <View onLayout={(event) => setSize({ w: event.nativeEvent.layout.width, h: event.nativeEvent.layout.height })} pointerEvents="none" style={StyleSheet.absoluteFill}>
      {size.w > 0 ? (
        <Svg height={size.h} width={size.w}>
          {pts.slice(1).map((pt, index) => {
            const prev = pts[index]!;
            return <Line key={index} stroke="#8A7442" strokeWidth={0.9} opacity={0.8} x1={prev[0] * size.w} x2={pt[0] * size.w} y1={prev[1] * size.h} y2={pt[1] * size.h} />;
          })}
          {pts.map((pt, index) => (
            <React.Fragment key={index}>
              {pt[2] ? <Circle cx={pt[0] * size.w} cy={pt[1] * size.h} fill="none" r={7} stroke="#C5A161" strokeWidth={0.8} opacity={0.35} /> : null}
              <Circle cx={pt[0] * size.w} cy={pt[1] * size.h} fill={pt[2] ? "#E3C88C" : "#C7AC72"} r={pt[2] ? 3.2 : 2.1} />
            </React.Fragment>
          ))}
          <SvgText fill="#8F887B" fontSize={10} x={0.02 * size.w} y={0.64 * size.h + 24}>01</SvgText>
          <SvgText fill="#8F887B" fontSize={10} x={0.965 * size.w} y={0.56 * size.h + 24}>12</SvgText>
        </Svg>
      ) : null}
    </View>
  );
}

/* ---------- 02 观测凭证 / EVIDENCE ---------- */

function EvidencePage({ model }: PageArgs) {
  const rows: Array<{ label: string; icon: Icon; data: EvidenceRow }> = [
    { label: "短视频观看", icon: Play, data: model.evidence.watch },
    { label: "聊天互动", icon: MessageCircle, data: model.evidence.chat },
    { label: "收藏与点赞", icon: Star, data: model.evidence.kept },
    { label: "关注与创作者", icon: UserRound, data: model.evidence.creators },
  ];
  return (
    <View style={styles.evRoot}>
      <View style={styles.evPaper}>
        <View style={styles.evPaperInner}>
          <View style={[styles.evCorner, styles.evCornerTL]} />
          <View style={[styles.evCorner, styles.evCornerTR]} />
          <View style={[styles.evCorner, styles.evCornerBL]} />
          <View style={[styles.evCorner, styles.evCornerBR]} />
          <View style={styles.evHeadRow}>
            <Text style={[styles.evHead, styles.evColSource]}>SOURCE</Text>
            <Text style={[styles.evHead, styles.evColDots]}>EVIDENCE</Text>
            <Text style={[styles.evHead, styles.evColConf]}>CONFIDENCE</Text>
            <Text style={[styles.evHead, styles.evColRange]}>TIME RANGE</Text>
            <Text style={[styles.evHead, styles.evColCaveat]}>CAVEAT</Text>
            <View style={styles.evColCoverage}>
              <Text style={styles.evCoverageTitle}>COVERAGE</Text>
              <Text style={styles.evCoverageYear}>{model.year}</Text>
              <View style={styles.evLetterRow}>{["J", "F", "M", "A", "M", "J"].map((letter, index) => <Text key={index} style={styles.evLetter}>{letter}</Text>)}</View>
            </View>
          </View>
          {rows.map(({ data, icon: RowIcon, label }) => (
            <View key={label} style={styles.evRow}>
              <View style={[styles.evColSource, styles.evSourceCell]}>
                <View style={styles.evBadge}><RowIcon color="#EDE4D2" size={17} strokeWidth={1.6} /></View>
                <Text style={styles.evSourceName}>{label}</Text>
              </View>
              <View style={[styles.evColDots, styles.evCellCenter]}>
                <View style={styles.evDots}>{[0, 1, 2, 3, 4].map((dot) => <View key={dot} style={[styles.evDot, dot < data.dots && styles.evDotOn]} />)}</View>
              </View>
              <View style={[styles.evColConf, styles.evCellCenter]}>
                <Text style={styles.evConf}>{"✦".repeat(data.confidence)}<Text style={styles.evConfOff}>{"✧".repeat(Math.max(0, 4 - data.confidence))}</Text></Text>
              </View>
              <View style={[styles.evColRange, styles.evCellCenter]}>
                {data.range ? <><Text style={styles.evRange}>{data.range[0]}</Text><Text style={styles.evRange}>~ {data.range[1]}</Text></> : <Text style={styles.evRange}>—</Text>}
              </View>
              <View style={[styles.evColCaveat, styles.evCellCenter]}>
                {data.caveat.map((line) => <Text key={line} style={styles.evCaveat}>{line}</Text>)}
              </View>
              <View style={[styles.evColCoverage, styles.evCellCenter]}>
                <View style={styles.evGrid}>
                  {data.months.map((on, index) => <View key={index} style={[styles.evSquare, on && styles.evSquareOn]} />)}
                </View>
              </View>
            </View>
          ))}
          <View style={styles.evLegend}>
            <View style={[styles.evSquare, styles.evSquareOn]} /><Text style={styles.evLegendText}>observed</Text>
            <View style={[styles.evSquare, styles.evLegendGap]} /><Text style={styles.evLegendText}>not observed</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

/* ---------- 03 内容足迹 / FOOTPRINT ---------- */

function FootprintPage({ mobile, model, onOpen }: PageArgs) {
  const stats: Array<{ icon: Icon; label: string; value: string; sub: string }> = [
    { icon: CalendarDays, label: "活跃天数", value: model.activeDays ? String(model.activeDays) : "—", sub: "/ 365" },
    { icon: Signature, label: "观测事件", value: model.total + model.chat ? (model.total + model.chat).toLocaleString("en-US") : "—", sub: "observed" },
    { icon: Layers, label: "内容形态", value: model.formats.length ? String(model.formats.length) : "—", sub: "formats" },
    { icon: Hourglass, label: "总注意力", value: attentionLabel(model.attentionSeconds), sub: "observed" },
  ];
  return (
    <View style={styles.fpRoot}>
      <View style={[styles.fpStats, mobile && styles.fpStatsMobile]}>
        {stats.map(({ icon: StatIcon, label, sub, value }, index) => (
          <View key={label} style={[styles.fpStat, index < stats.length - 1 && !mobile && styles.fpStatDivider]}>
            <StatIcon color="#C5A161" size={20} strokeWidth={1.3} />
            <Text style={styles.fpStatLabel}>{label}</Text>
            <Text style={styles.fpStatValue}>{value}</Text>
            <Text style={styles.fpStatSub}>{sub}</Text>
          </View>
        ))}
      </View>
      <View style={[styles.fpBody, mobile && styles.stack]}>
        <View style={styles.fpCol}>
          <ColHead cn="活动日历" en={`/ ${model.year}`} />
          <View style={styles.fpWeekRow}>{weekLetters.map((letter, index) => <Text key={index} style={styles.fpWeekLetter}>{letter}</Text>)}</View>
          {model.calendar.map((cells, month) => (
            <View key={month} style={styles.fpCalRow}>
              <Text style={styles.fpCalMonth}>{monthAbbr[month]}</Text>
              <View style={styles.fpCalCells}>{cells.map((level, index) => <View key={index} style={[styles.fpCell, level === 1 && styles.fpCellLow, level === 2 && styles.fpCellHigh]} />)}</View>
            </View>
          ))}
          <View style={styles.fpLegend}>
            <View style={[styles.fpCell, styles.fpCellHigh]} /><Text style={styles.fpLegendText}>active</Text>
            <View style={[styles.fpCell, styles.fpLegendGap]} /><Text style={styles.fpLegendText}>inactive</Text>
          </View>
        </View>
        <View style={[styles.fpCol, !mobile && styles.fpColMid]}>
          <ColHead cn="事件流" en="/ 近期" />
          <View style={styles.fpEvents}>
            {model.events.length ? model.events.map((event, index) => {
              const EventIcon = event.kind === "watch" ? Play : event.kind === "chat" ? MessageCircle : Star;
              const eventBody = (
                <View style={styles.fpEvent}>
                  <View style={styles.fpEventIcon}><EventIcon color="#C9B685" size={12} strokeWidth={1.6} /></View>
                  <View style={styles.flex}>
                    <Text style={styles.fpEventTag}>observed</Text>
                    <Text style={styles.fpEventName}>{event.label}</Text>
                  </View>
                  <Text style={styles.fpEventTime}>{event.time}</Text>
                </View>
              );
              return event.url ? <Pressable accessibilityRole="link" key={index} onPress={() => void onOpen(event.url!)} style={({ pressed }) => [pressed && styles.pressed, pointer]}>{eventBody}</Pressable> : <View key={index}>{eventBody}</View>;
            }) : <Text style={styles.fpEmpty}>等待可定位时间的观测事件</Text>}
          </View>
        </View>
        <View style={styles.fpCol}>
          <ColHead cn="关系图谱" en="/ 注意力分布" />
          <AttentionTriangle model={model} />
          <Text style={styles.fpNote}>* 分布为观察期内相对关系，非绝对占比</Text>
        </View>
      </View>
    </View>
  );
}

function ColHead({ cn, en }: { cn: string; en: string }) {
  return <View style={styles.colHead}><Text style={styles.colHeadCn}>{cn}</Text><Text style={styles.colHeadEn}>{en}</Text></View>;
}

function AttentionTriangle({ model }: { model: Model }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const total = model.watch + model.liked + model.favorite + model.chat;
  const share = (value: number) => total ? `${Math.round(value / total * 100)}%` : "—";
  const nodes: Array<{ x: number; y: number; icon: Icon }> = [
    { x: 0.52, y: 0.16, icon: Play },
    { x: 0.2, y: 0.74, icon: Star },
    { x: 0.84, y: 0.74, icon: MessageCircle },
  ];
  const px = (node: { x: number; y: number }) => ({ cx: node.x * size.w, cy: node.y * size.h });
  return (
    <View style={styles.triWrap}>
      <View onLayout={(event) => setSize({ w: event.nativeEvent.layout.width, h: event.nativeEvent.layout.height })} style={styles.triCanvas}>
        {size.w > 0 ? (
          <Svg height={size.h} width={size.w}>
            {[[0, 1], [1, 2], [2, 0]].map(([from, to], index) => {
              const a = px(nodes[from!]!);
              const b = px(nodes[to!]!);
              return <Line key={index} stroke="#48402F" strokeWidth={1} x1={a.cx} x2={b.cx} y1={a.cy} y2={b.cy} />;
            })}
            <Circle cx={0.52 * size.w} cy={0.55 * size.h} fill="none" r={size.h * 0.16} stroke="#4A4234" strokeDasharray="2.5 4" strokeWidth={0.9} />
            <Circle cx={0.52 * size.w + size.h * 0.16} cy={0.55 * size.h} fill="#C5A161" r={1.6} />
            {nodes.map((node, index) => {
              const point = px(node);
              return <Circle key={index} cx={point.cx} cy={point.cy} fill="#131009" r={17} stroke="#A8894F" strokeWidth={1} />;
            })}
          </Svg>
        ) : null}
        {size.w > 0 ? nodes.map((node, index) => {
          const NodeIcon = node.icon;
          return <View key={index} pointerEvents="none" style={{ position: "absolute", left: node.x * size.w - 8, top: node.y * size.h - 8 }}><NodeIcon color="#D9C089" size={16} strokeWidth={1.5} /></View>;
        }) : null}
        {size.w > 0 ? <Text {...motionData("twinkle", 2)} style={[styles.triSpark, { left: 0.52 * size.w - 6, top: 0.55 * size.h - 8 }]}>✦</Text> : null}
        {size.w > 0 ? (
          <>
            <View style={[styles.triLabel, { left: 0.52 * size.w + 26, top: 0.16 * size.h - 14 }]}><Text style={styles.triName}>观看</Text><Text style={styles.triValue}>{share(model.watch)}</Text></View>
            <View style={[styles.triLabel, { left: 0.2 * size.w - 30, top: 0.74 * size.h + 24 }]}><Text style={styles.triName}>点赞/收藏</Text><Text style={styles.triValue}>{share(model.liked + model.favorite)}</Text></View>
            <View style={[styles.triLabel, { left: 0.84 * size.w - 22, top: 0.74 * size.h + 24 }]}><Text style={styles.triName}>互动</Text><Text style={styles.triValue}>{share(model.chat)}</Text></View>
          </>
        ) : null}
      </View>
    </View>
  );
}

/* ---------- 04 时间轴 / TIMELINE ---------- */

function TimelinePage({ mobile, model }: PageArgs) {
  return (
    <View style={styles.tlRoot}>
      <View style={styles.tlTitleRow}>
        <View style={styles.tlRule} />
        <Text {...motionData("twinkle", 3)} style={styles.tlStar}>✦</Text>
        <View style={styles.tlRuleShort} />
        <Text style={styles.tlYear}>{model.year}</Text>
        <View style={styles.tlRuleShort} />
        <Text {...motionData("twinkle", 4)} style={styles.tlStar}>✦</Text>
        <View style={styles.tlRule} />
      </View>
      <View style={[styles.tlBand, styles.tlBandChart]}>
        <BandLabel cn="强度" en="INTENSITY" />
        <IntensityChart months={model.months} />
      </View>
      <View style={styles.tlBand}>
        <BandLabel cn="里程碑" en="MILESTONES" />
        {model.dated ? (
          <View style={styles.tlMilestones}>
            <View style={styles.tlBaseline} />
            {model.milestones.map((milestone) => (
              <View key={milestone.title} style={styles.tlMilestone}>
                <View style={styles.tlNode} />
                <Text numberOfLines={2} style={styles.tlMilestoneTitle}>{milestone.title}</Text>
                <Text style={styles.tlMilestoneSub}>{milestone.sub}</Text>
              </View>
            ))}
          </View>
        ) : <Text style={styles.tlEmpty}>尚无可定位的时间证据</Text>}
      </View>
      <View style={[styles.tlBand, styles.tlBandLast]}>
        <BandLabel cn="模式洞察" en="PATTERNS" />
        <View style={[styles.tlPatterns, mobile && styles.stack]}>
          {model.seasons.map((season) => (
            <View key={season.title} style={styles.tlPattern}>
              <Text {...motionData("twinkle", 5)} style={styles.tlPatternStar}>✦</Text>
              <Text style={styles.tlPatternTitle}>{season.title}</Text>
              {season.sub.map((line) => <Text key={line} style={styles.tlPatternSub}>{line}</Text>)}
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function BandLabel({ cn, en }: { cn: string; en: string }) {
  return <View style={styles.bandLabel}><Text style={styles.bandCn}>{cn}</Text><Text style={styles.bandEn}>{en}</Text></View>;
}

function IntensityChart({ months }: { months: number[] }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const max = Math.max(...months);
  const pad = 6;
  const chartH = size.h;
  const x = (index: number) => pad + index * (size.w - pad * 2) / 11;
  const y = (value: number) => max ? chartH - 12 - value / max * (chartH - 34) : chartH - 12;
  const pts = months.map((value, index) => [x(index), y(value)] as [number, number]);
  return (
    <View style={styles.flex}>
      <View style={styles.tlMonthRow}>{monthAbbr.map((name) => <Text key={name} style={styles.tlMonth}>{name}</Text>)}</View>
      <View onLayout={(event) => setSize({ w: event.nativeEvent.layout.width, h: event.nativeEvent.layout.height })} style={styles.tlChart}>
        {size.w > 0 ? (
          <Svg height={size.h} width={size.w}>
            <Defs>
              <LinearGradient id="tlArea" x1="0" x2="0" y1="0" y2="1">
                <Stop offset="0" stopColor="#35706E" stopOpacity={0.62} />
                <Stop offset="1" stopColor="#0A0A0B" stopOpacity={0.05} />
              </LinearGradient>
            </Defs>
            {monthAbbr.map((_, index) => (
              <Line key={index} stroke="#26231C" strokeDasharray="2 5" strokeWidth={0.8} x1={x(index)} x2={x(index)} y1={4} y2={chartH - 12} />
            ))}
            <Line stroke="#332E24" strokeWidth={1} x1={0} x2={size.w} y1={chartH - 12} y2={chartH - 12} />
            {max ? <Path d={`${smoothPath(pts, chartH - 12)} L ${x(11)} ${chartH - 12} L ${x(0)} ${chartH - 12} Z`} fill="url(#tlArea)" /> : null}
            {max ? <Path d={smoothPath(pts, chartH - 12)} fill="none" stroke="#6FB3AD" strokeWidth={1.6} /> : null}
          </Svg>
        ) : null}
        <Text style={[styles.tlAxis, styles.tlAxisHigh]}>高</Text>
        <Text style={[styles.tlAxis, styles.tlAxisLow]}>低</Text>
        {!max ? <Text style={styles.tlEmptyChart}>等待时间证据</Text> : null}
      </View>
    </View>
  );
}

function smoothPath(pts: Array<[number, number]>, floorY = Number.POSITIVE_INFINITY): string {
  if (!pts.length) return "";
  let path = `M ${pts[0]![0]} ${pts[0]![1]}`;
  for (let index = 0; index < pts.length - 1; index += 1) {
    const p0 = pts[Math.max(0, index - 1)]!;
    const p1 = pts[index]!;
    const p2 = pts[index + 1]!;
    const p3 = pts[Math.min(pts.length - 1, index + 2)]!;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = Math.min(floorY, p1[1] + (p2[1] - p0[1]) / 6);
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = Math.min(floorY, p2[1] - (p3[1] - p1[1]) / 6);
    path += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2[0]} ${p2[1]}`;
  }
  return path;
}

/* ---------- 05-12 章 · 观测图版 ---------- */

const heatColors = ["#12161B", "#22404C", "#33606C", "#4E7B82", "#96794A", "#C9A05B"];
function heat(t: number): string { if (t <= 0) return heatColors[0]!; if (t < 0.2) return heatColors[1]!; if (t < 0.4) return heatColors[2]!; if (t < 0.6) return heatColors[3]!; if (t < 0.8) return heatColors[4]!; return heatColors[5]!; }
function confLabel(dots: number): string { return dots >= 4 ? "高" : dots === 3 ? "中高" : dots === 2 ? "中" : dots === 1 ? "低" : "待定"; }
function pctLabel(value: number | null): string { return value === null ? "—" : `${Math.round(value)}%`; }
function starPath(cx: number, cy: number, r: number): string {
  const inner = r * 0.32;
  return `M ${cx} ${cy - r} L ${cx + inner} ${cy - inner} L ${cx + r} ${cy} L ${cx + inner} ${cy + inner} L ${cx} ${cy + r} L ${cx - inner} ${cy + inner} L ${cx - r} ${cy} L ${cx - inner} ${cy - inner} Z`;
}
function describeArc(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const x0 = cx + r * Math.cos(rad(a0));
  const y0 = cy + r * Math.sin(rad(a0));
  const x1 = cx + r * Math.cos(rad(a1));
  const y1 = cy + r * Math.sin(rad(a1));
  return `M ${x0} ${y0} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
}
function hourly(heatmap: number[], rows: number[]): number[] {
  return Array.from({ length: 24 }, (_, hour) => rows.reduce((sum, row) => sum + (heatmap[row * 24 + hour] ?? 0), 0) / rows.length);
}

function CompassRose({ color = "#4A4234", size = 30 }: { color?: string; size?: number }) {
  const c = size / 2;
  const r = c - 1;
  return (
    <Svg height={size} viewBox={`0 0 ${size} ${size}`} width={size}>
      <Circle cx={c} cy={c} fill="none" r={r} stroke={color} strokeWidth={0.9} />
      <Circle cx={c} cy={c} fill="none" r={r * 0.62} stroke={color} strokeDasharray="1 2.4" strokeWidth={0.7} />
      <Path d={`M ${c} ${c - r * 0.78} L ${c + r * 0.16} ${c} L ${c} ${c + r * 0.78} L ${c - r * 0.16} ${c} Z`} fill={color} />
      <Path d={`M ${c - r * 0.78} ${c} L ${c} ${c - r * 0.16} L ${c + r * 0.78} ${c} L ${c} ${c + r * 0.16} Z`} fill={color} opacity={0.75} />
      <Circle cx={c} cy={c} fill={color} r={1.4} />
    </Svg>
  );
}

function ChapterRail({ desc, en, mobile, no, title, yearValue }: { desc: string; en: string; mobile: boolean; no: string; title: string; yearValue?: number }) {
  return (
    <View style={[styles.lpRail, mobile && styles.lpRailMobile]}>
      <View>
        <Text style={styles.lpRailNo}>{no}</Text>
        <Text style={styles.lpRailYear}>{displayYear(yearValue)}</Text>
        <Text {...motionData("twinkle", 0)} style={styles.lpRailSpark}>✦</Text>
        <Text style={styles.lpRailTitle}>{title}</Text>
        <Text style={styles.lpRailEn}>{en}</Text>
        <View style={styles.lpRailDash} />
        <Text style={styles.lpRailDesc}>{desc}</Text>
      </View>
      <View>
        <Text style={styles.lpRailPattern}>PATTERN</Text>
        <Text style={styles.lpRailObserved}>observed</Text>
        <View style={styles.lpRailRose}><CompassRose size={34} /></View>
      </View>
    </View>
  );
}

function PatternFooter({ dots, text }: { dots: number; text: string }) {
  return (
    <View style={styles.lpFooter}>
      <Text {...motionData("twinkle", 1)} style={styles.lpFooterStar}>✦</Text>
      <View style={styles.flex}>
        <Text style={styles.lpFooterLabel}>PATTERN</Text>
        <Text style={styles.lpFooterText}>{text}</Text>
      </View>
      <View style={styles.lpFooterCell}>
        <Text style={styles.lpFooterLabel}>EVIDENCE</Text>
        <View style={styles.lpDots}>{[0, 1, 2, 3, 4].map((dot) => <View key={dot} style={[styles.lpDot, dot < dots && styles.lpDotOn]} />)}</View>
      </View>
      <View style={[styles.lpFooterCell, styles.lpFooterLast]}>
        <Text style={styles.lpFooterLabel}>CONFIDENCE</Text>
        <Text style={styles.lpFooterConf}>{confLabel(dots)}</Text>
      </View>
    </View>
  );
}

function PageHeader({ en, no, title, yearValue }: { en: string; no: string; title: string; yearValue?: number }) {
  return (
    <View style={styles.lpHead}>
      <View style={styles.lpHeadTop}>
        <Text style={styles.lpHeadPage}>PAGE {no}</Text>
        <View style={styles.lpHeadRight}>
          <Text style={styles.lpHeadObserved}>observed</Text>
          <Text style={styles.lpHeadYear}>{displayYear(yearValue)}</Text>
        </View>
      </View>
      <Text style={styles.lpHeadTitle}>{title}</Text>
      <Text style={styles.lpHeadEn}>/ {en}</Text>
      <View style={styles.lpHeadRule} />
    </View>
  );
}

function BlockTitle({ cn, en }: { cn: string; en?: string }) {
  return (
    <View style={styles.lpBlockTitle}>
      <Text style={styles.lpBlockCn}>{cn}</Text>
      {en ? <Text style={styles.lpBlockEn}>/ {en}</Text> : null}
    </View>
  );
}

/* ---------- 05 你的节拍 / RHYTHM ---------- */

function windowRange(hours: number[], from: number, to: number): string {
  const band = hours.slice(from, to);
  const max = Math.max(...band);
  if (!max) return "—";
  const peak = from + band.indexOf(max);
  let start = peak;
  let end = peak;
  while (start - 1 >= from && (hours[start - 1] ?? 0) >= max * 0.5) start -= 1;
  while (end + 1 < to && (hours[end + 1] ?? 0) >= max * 0.5) end += 1;
  const clock = (hour: number) => `${String(hour).padStart(2, "0")}:00`;
  return `${clock(start)} – ${clock(Math.min(24, end + 1))}`;
}

function twinPeaks(hours: number[]): number[] {
  const top = maxIndex(hours);
  if (top === null) return [];
  const rest = hours.map((value, index) => (Math.abs(index - top) >= 5 ? value : 0));
  const next = maxIndex(rest);
  if (next !== null && (hours[next] ?? 0) >= (hours[top] ?? 0) * 0.55 && timePhrase(next) !== timePhrase(top)) return [top, next].sort((a, b) => a - b);
  return [top];
}

function rhythmPattern(model: Model): string {
  const peaks = twinPeaks(model.hours);
  if (!peaks.length) return "时间证据不足，节拍仍在成形。";
  const weekdayPeak = maxIndex(hourly(model.heatmap, [0, 1, 2, 3, 4]));
  const weekendPeak = maxIndex(hourly(model.heatmap, [5, 6]));
  const tail = weekdayPeak === null || weekendPeak === null ? "" : weekendPeak - weekdayPeak >= 2 ? "，周末整体右移且延长" : weekdayPeak - weekendPeak >= 2 ? "，周末整体前移" : "，周末与工作日节奏相近";
  if (peaks.length === 2) return `你的节奏呈现「双峰」形态：${timePhrase(peaks[0]!)}与${timePhrase(peaks[1]!)}为内容高峰期${tail}。`;
  return `你的节奏呈现「单峰」形态：${timePhrase(peaks[0]!)}是内容高峰期${tail}。`;
}

function RhythmPage({ mobile, model }: PageArgs) {
  const max = Math.max(1, ...model.heatmap);
  const windows: Array<{ icon: Icon; label: string; range: string }> = [
    { icon: Clock6, label: "清晨", range: windowRange(model.hours, 5, 11) },
    { icon: Clock12, label: "午后", range: windowRange(model.hours, 11, 17) },
    { icon: Clock9, label: "夜晚", range: windowRange(model.hours, 17, 24) },
  ];
  return (
    <View style={[styles.lpPage, mobile && styles.stack]}>
      <ChapterRail desc="你的时间心跳图谱，在日常与周期中呈现规律与偏好。" en="RHYTHM" mobile={mobile} no="05" title="你的节拍" yearValue={model.year} />
      <View style={styles.flex}>
        <View style={[styles.rhTop, mobile && styles.stack]}>
          <View style={[styles.rhHeatBlock, !mobile && styles.lpBorderRight]}>
            <View style={styles.rhHeatHead}>
              <Text style={styles.lpBlockCn}>日 × 时 活跃热力图</Text>
              <View style={styles.rhLegend}>
                <Text style={styles.lpMuted}>低</Text>
                {heatColors.slice(1).map((color) => <View key={color} style={[styles.rhSwatch, { backgroundColor: color }]} />)}
                <Text style={styles.lpMuted}>高</Text>
              </View>
            </View>
            {weekdays.map((day, row) => (
              <View key={day} style={styles.rhHeatRow}>
                <Text style={styles.rhWeek}>周{day}</Text>
                <View style={styles.rhCells}>
                  {model.heatmap.slice(row * 24, row * 24 + 24).map((count, col) => (
                    <View key={col} style={[styles.rhCell, { backgroundColor: heat(count / max) }]} />
                  ))}
                </View>
              </View>
            ))}
            <View style={styles.rhAxisRow}>
              {Array.from({ length: 12 }, (_, index) => <Text key={index} style={styles.rhAxisText}>{index * 2}</Text>)}
            </View>
          </View>
          <View style={styles.rhWindows}>
            <Text style={styles.lpBlockCn}>活跃窗口</Text>
            {windows.map(({ icon: WindowIcon, label, range }, index) => (
              <View key={label} style={[styles.rhWindow, index > 0 && styles.rhWindowDivider]}>
                <View style={styles.rhWinIcon}><WindowIcon color="#C0A873" size={14} strokeWidth={1.4} /></View>
                <View>
                  <Text style={styles.rhWinLabel}>{label}</Text>
                  <Text style={styles.rhWinRange}>{range}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
        <View style={[styles.rhBottom, mobile && styles.stack]}>
          <View style={[styles.rhChartBlock, !mobile && styles.lpBorderRight]}>
            <Text style={styles.lpBlockCn}>会话节奏曲线</Text>
            <SessionCurve hours={model.hours} />
          </View>
          <View style={styles.rhChartBlock}>
            <View style={styles.rhWkHead}>
              <Text style={styles.lpBlockCn}>工作日 vs 周末</Text>
              <View style={styles.rhWkLegend}>
                <View style={styles.rhLegendLine} />
                <Text style={styles.lpMuted}>工作日</Text>
                <View style={styles.rhLegendDashWrap}>{[0, 1, 2].map((dash) => <View key={dash} style={styles.rhLegendDash} />)}</View>
                <Text style={styles.lpMuted}>周末</Text>
              </View>
            </View>
            <WeekSplitChart weekday={hourly(model.heatmap, [0, 1, 2, 3, 4])} weekend={hourly(model.heatmap, [5, 6])} />
          </View>
        </View>
        <PatternFooter dots={model.evidence.watch.dots} text={rhythmPattern(model)} />
      </View>
    </View>
  );
}

function SessionCurve({ hours }: { hours: number[] }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const values = Array.from({ length: 13 }, (_, index) => (hours[(index * 2) % 24] ?? 0) + (hours[(index * 2 + 1) % 24] ?? 0));
  const max = Math.max(...values);
  const x = (index: number) => 24 + index * (size.w - 34) / 12;
  const y = (value: number) => (max ? size.h - 8 - value / max * (size.h - 22) : size.h - 8);
  const pts = values.map((value, index) => [x(index), y(value)] as [number, number]);
  return (
    <View style={styles.flex}>
      <View onLayout={(event) => setSize({ w: event.nativeEvent.layout.width, h: event.nativeEvent.layout.height })} style={styles.rhChart}>
        {size.w > 0 ? (
          <Svg height={size.h} width={size.w}>
            {[0.14, 0.5, 0.86].map((frac) => <Line key={frac} stroke="#211F1A" strokeDasharray="2 5" strokeWidth={0.8} x1={24} x2={size.w - 10} y1={size.h * frac} y2={size.h * frac} />)}
            <Line stroke="#332E24" strokeWidth={1} x1={24} x2={size.w - 10} y1={size.h - 8} y2={size.h - 8} />
            {max ? <Path d={smoothPath(pts, size.h - 8)} fill="none" stroke="#6FB3AD" strokeWidth={1.5} /> : null}
            {max ? pts.map((pt, index) => (
              <Circle cx={pt[0]} cy={pt[1]} fill={(values[index] ?? 0) >= max * 0.85 ? "#D9B36C" : "#6FB3AD"} key={index} r={(values[index] ?? 0) >= max * 0.85 ? 3.1 : 2.3} />
            )) : null}
          </Svg>
        ) : null}
        <Text style={[styles.rhYLabel, styles.rhYHigh]}>高</Text>
        <Text style={[styles.rhYLabel, styles.rhYMid]}>中</Text>
        <Text style={[styles.rhYLabel, styles.rhYLow]}>低</Text>
        {!max ? <Text style={styles.lpChartEmpty}>等待时间证据</Text> : null}
      </View>
      <View style={styles.rhXAxis}>{[0, 4, 8, 12, 16, 20, 24].map((hour) => <Text key={hour} style={styles.lpAxisText}>{hour}</Text>)}</View>
    </View>
  );
}

function WeekSplitChart({ weekday, weekend }: { weekday: number[]; weekend: number[] }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const max = Math.max(...weekday, ...weekend);
  const x = (index: number) => 10 + index * (size.w - 20) / 24;
  const y = (value: number) => (max ? size.h - 8 - value / max * (size.h - 22) : size.h - 8);
  const line = (values: number[]) => smoothPath(Array.from({ length: 25 }, (_, index) => [x(index), y(values[index % 24] ?? 0)] as [number, number]), size.h - 8);
  return (
    <View style={styles.flex}>
      <View onLayout={(event) => setSize({ w: event.nativeEvent.layout.width, h: event.nativeEvent.layout.height })} style={styles.rhChart}>
        {size.w > 0 ? (
          <Svg height={size.h} width={size.w}>
            <Line stroke="#332E24" strokeWidth={1} x1={10} x2={size.w - 10} y1={size.h - 8} y2={size.h - 8} />
            {max ? <Path d={line(weekday)} fill="none" stroke="#6FB3AD" strokeWidth={1.5} /> : null}
            {max ? <Path d={line(weekend)} fill="none" stroke="#C9A05B" strokeDasharray="5 4" strokeWidth={1.4} /> : null}
          </Svg>
        ) : null}
        {!max ? <Text style={styles.lpChartEmpty}>等待时间证据</Text> : null}
      </View>
      <View style={styles.rhXAxis}>{[0, 6, 12, 18, 24].map((hour) => <Text key={hour} style={styles.lpAxisText}>{hour}</Text>)}</View>
    </View>
  );
}

/* ---------- 06 你如何停留 / ATTENTION ---------- */

function attentionPattern(completion: number | null): string {
  if (completion === null) return "尚未采集观看进度，停留方式待观测。";
  if (completion >= 66) return "你更偏向「深度沉浸」，长时间的专注观看构成主线。";
  if (completion >= 33) return "你更偏向「平衡区间」，能在兴趣内容中形成稳定的停留。";
  return "你更偏向「碎片浏览」，在快速滑动中筛选感兴趣的内容。";
}

function AttentionPage({ mobile, model }: PageArgs) {
  const pcts = model.progressPercents;
  const share = (test: (value: number) => boolean) => (pcts.length ? pcts.filter(test).length / pcts.length * 100 : null);
  const done = share((value) => value >= 90);
  const stages: Array<{ icon: Icon; label: string; value: string }> = [
    { icon: Eye, label: "开始浏览", value: pcts.length ? "100%" : "—" },
    { icon: Play, label: "继续观看", value: pctLabel(share((value) => value >= 25)) },
    { icon: Target, label: "深度观看", value: pctLabel(share((value) => value >= 60)) },
    { icon: CircleCheck, label: "完成观看", value: pctLabel(done) },
  ];
  const outcomes: Array<{ icon: Icon; label: string; value: string }> = [
    { icon: SkipForward, label: "跳过", value: pctLabel(share((value) => value < 15)) },
    { icon: Pause, label: "暂停", value: "—" },
    { icon: RotateCcw, label: "重播", value: model.watch ? `${Math.round(model.replays / model.watch * 100)}%` : "—" },
    { icon: CircleCheck, label: "完成", value: pctLabel(done) },
  ];
  const band = model.completion === null ? null : model.completion >= 66 ? 0 : model.completion >= 33 ? 1 : 2;
  const dots = [1, 10, 50, 200, 1000].filter((threshold) => pcts.length >= threshold).length;
  const specColors = ["#7FB3C9", "#D8CFBD", "#C9A05B"];
  const spectrum = [
    { name: "深度沉浸", desc: "长时观看\n专注连贯" },
    { name: "平衡区间", desc: "适度浏览\n间歇停留" },
    { name: "碎片浏览", desc: "快速滑动\n短暂停留" },
  ];
  return (
    <View style={[styles.lpPage, mobile && styles.stack]}>
      <ChapterRail desc="从开始到完成，观察注意力的流动与分布。" en="ATTENTION" mobile={mobile} no="06" title="你如何停留" yearValue={model.year} />
      <View style={styles.flex}>
        <View style={[styles.atBody, mobile && styles.stack]}>
          <View style={styles.atMain}>
            <Text style={styles.lpBlockCn}>从开始到完成的旅程</Text>
            <View style={[styles.atFunnelRow, mobile && styles.stack]}>
              <View style={styles.atStages}>
                {stages.map(({ icon: StageIcon, label, value }) => (
                  <View key={label} style={styles.atStage}>
                    <View style={styles.atStageIcon}><StageIcon color="#9CC3C6" size={12} strokeWidth={1.5} /></View>
                    <View style={styles.flex}>
                      <Text style={styles.atStageLabel}>{label}</Text>
                      <Text style={styles.atStageValue}>{value}</Text>
                    </View>
                    <View style={styles.atLead} />
                  </View>
                ))}
              </View>
              <View style={styles.atFunnelWrap}>
                <AttentionFunnel density={pcts.length ? Math.min(1, pcts.length / 200) : 0} />
                <Text style={styles.atDone}>完成</Text>
              </View>
              <View style={styles.atStages}>
                {outcomes.map(({ icon: OutIcon, label, value }) => (
                  <View key={label} style={styles.atStage}>
                    <View style={styles.atLead} />
                    <View style={[styles.atStageIcon, styles.atStageIconGold]}><OutIcon color="#C9B685" size={12} strokeWidth={1.5} /></View>
                    <View style={styles.flex}>
                      <Text style={styles.atStageLabel}>{label}</Text>
                      <Text style={styles.atStageValue}>{value}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          </View>
          <View style={styles.atSpectrum}>
            <Text style={styles.lpBlockCn}>注意力光谱</Text>
            <View style={styles.atSpecBody}>
              <Svg height={296} width={14}>
                <Defs>
                  <LinearGradient id="atSpec" x1="0" x2="0" y1="0" y2="1">
                    <Stop offset="0" stopColor="#5C89A2" />
                    <Stop offset="0.5" stopColor="#4E7B82" />
                    <Stop offset="1" stopColor="#C9A05B" />
                  </LinearGradient>
                </Defs>
                <Rect fill="url(#atSpec)" height={284} rx={3} width={6} x={4} y={6} />
                <Circle cx={7} cy={7} fill="#5C89A2" r={5} />
                <Circle cx={7} cy={289} fill="#C9A05B" r={5} />
              </Svg>
              <View style={styles.atSpecLabels}>
                {spectrum.map((row, index) => (
                  <View key={row.name} style={styles.atSpecRow}>
                    <Text style={[styles.atSpecMark, band === index && styles.atSpecMarkOn]}>▶</Text>
                    <View>
                      <Text style={[styles.atSpecName, { color: specColors[index] }]}>{row.name}</Text>
                      <Text style={styles.atSpecDesc}>{row.desc}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </View>
        <PatternFooter dots={dots} text={attentionPattern(model.completion)} />
      </View>
    </View>
  );
}

const funnelLevels: Array<[number, number]> = [[30, 148], [118, 112], [206, 78], [292, 50], [370, 27], [434, 13]];
function funnelWidth(y: number): number {
  for (let index = 0; index < funnelLevels.length - 1; index += 1) {
    const [y1, w1] = funnelLevels[index]!;
    const [y2, w2] = funnelLevels[index + 1]!;
    if (y <= y2) return w1 + (w2 - w1) * (y - y1) / (y2 - y1);
  }
  return 13;
}

function AttentionFunnel({ density }: { density: number }) {
  const leftPts = funnelLevels.map(([y, w]) => [190 - w, y] as [number, number]);
  const rightPts = funnelLevels.slice().reverse().map(([y, w]) => [190 + w, y] as [number, number]);
  const leftPath = smoothPath(leftPts);
  const rightPath = smoothPath(rightPts);
  const silhouette = `${leftPath} L ${rightPts[0]![0]} ${rightPts[0]![1]} ${rightPath.slice(rightPath.indexOf("C"))} Z`;
  const dots = Array.from({ length: Math.max(24, Math.min(128, 24 + Math.round(density * 104))) }, (_, index) => {
    const t = ((index * 47) % 113) / 113;
    const y = 40 + t * 384;
    const x = 190 + Math.sin(index * 12.9898 + 4.1) * funnelWidth(y) * 0.86;
    return {
      x,
      y,
      r: 0.7 + ((index * 13) % 10) / 8,
      gold: y > 350 || index % 9 === 0,
      opacity: 0.22 + ((index * 29) % 55) / 100,
    };
  });
  return (
    <Svg height={470} viewBox="0 0 380 470" width={380}>
      <Defs>
        <LinearGradient id="atBody" x1="0" x2="0" y1="0" y2="1">
          <Stop offset="0" stopColor="#3E6C77" stopOpacity={0.32} />
          <Stop offset="0.72" stopColor="#2E4A55" stopOpacity={0.15} />
          <Stop offset="1" stopColor="#C9A05B" stopOpacity={0.2} />
        </LinearGradient>
        <RadialGradient id="atGlow">
          <Stop offset="0" stopColor="#E7C687" stopOpacity={0.85} />
          <Stop offset="1" stopColor="#E7C687" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Path d={silhouette} fill="url(#atBody)" stroke="#4E7B82" strokeOpacity={0.5} strokeWidth={1} />
      {funnelLevels.map(([y, w], index) => (
        <Ellipse cx={190} cy={y} fill="none" key={index} rx={w} ry={Math.max(3.5, w * 0.15)} stroke="#6FA3AC" strokeOpacity={index === 0 ? 0.55 : 0.28} strokeWidth={0.9} />
      ))}
      {dots.map((dot, index) => <Circle cx={dot.x} cy={dot.y} fill={dot.gold ? "#D9B36C" : "#9CC3C6"} key={index} opacity={dot.opacity} r={dot.r} />)}
      <Circle cx={190} cy={452} fill="url(#atGlow)" r={28} />
      <Circle cx={190} cy={452} fill="#EFD9A6" r={3.4} />
    </Svg>
  );
}

/* ---------- 07 内容回声 / CONTENT ECHO ---------- */

function contentPattern(topics: Ranked[]): string {
  if (!topics.length) return "主题证据不足，回声尚未成形。";
  if (topics.length === 1) return `你的共振集中于「${topics[0]!.name}」，并在多形式中形成稳定互动。`;
  return `你的共振集中于「${topics[0]!.name}与${topics[1]!.name}」，并在多形式中形成稳定互动。`;
}

function ContentPage({ mobile, model }: PageArgs) {
  const rankColors = ["#4E8B87", "#5C89A2", "#8A7442", "#C9A05B"];
  const formatDefs: Array<{ display: string; icon: Icon; key: string }> = [
    { display: "视频", icon: Play, key: "视频" },
    { display: "图像", icon: ImageIcon, key: "图文" },
    { display: "直播", icon: Radio, key: "直播" },
  ];
  const formats = formatDefs.map((def) => ({ ...def, share: model.formats.find((item) => item.name === def.key)?.share ?? 0 }));
  const formatTotal = formats.reduce((sum, item) => sum + item.share, 0);
  const topics = model.topics.slice(0, 4);
  return (
    <View style={[styles.lpPage, mobile && styles.stack]}>
      <ChapterRail desc="你与内容的共振，在主题、形式与互动中形成回声。" en="CONTENT ECHO" mobile={mobile} no="07" title="内容回声" yearValue={model.year} />
      <View style={styles.flex}>
        <View style={[styles.ceBody, mobile && styles.stack]}>
          <View style={[styles.ceCol1, !mobile && styles.lpBorderRight]}>
            <View style={[styles.ceBlock, styles.flex]}>
              <Text style={styles.lpBlockCn}>主题星座图</Text>
              <TopicConstellation topics={topics} />
            </View>
            <View style={[styles.ceBlock, styles.lpBorderTop]}>
              <Text style={styles.lpBlockCn}>观看 × 点赞 × 收藏 交集</Text>
              <KeptVenn intersection={model.intersection} totals={{ watch: model.watch, liked: model.liked, favorite: model.favorite }} />
            </View>
          </View>
          <View style={styles.ceCol2}>
            <View style={styles.ceTopRow}>
              <View style={[styles.ceBlock, styles.ceFormats, !mobile && styles.lpBorderRight]}>
                <Text style={styles.lpBlockCn}>内容形式占比</Text>
                <View style={styles.ceFormatRow}>
                  {formats.map(({ display, icon: FormatIcon, share }) => (
                    <View key={display} style={styles.ceFormatCell}>
                      <View style={styles.ceFormatTile}><FormatIcon color="#C9B685" size={16} strokeWidth={1.4} /></View>
                      <Text style={styles.ceFormatName}>{display}</Text>
                      <Text style={styles.ceFormatValue}>{formatTotal ? `${Math.round(share / formatTotal * 100)}%` : "—"}</Text>
                    </View>
                  ))}
                </View>
                <View style={styles.ceSegments}>
                  {formatTotal ? formats.filter((item) => item.share > 0).map((item, index) => (
                    <View key={item.display} style={[styles.ceSegment, { flex: item.share, backgroundColor: ["#4E8B87", "#C5A161", "#8A7442"][index % 3] }]} />
                  )) : <View style={[styles.ceSegment, styles.ceSegmentEmpty]} />}
                </View>
              </View>
              <View style={[styles.ceBlock, styles.flex]}>
                <Text style={styles.lpBlockCn}>时长分布</Text>
                {model.durationBands.map((bandItem, index) => (
                  <View key={bandItem.label} style={styles.ceDurRow}>
                    <Text style={styles.ceDurLabel}>{bandItem.label}</Text>
                    <Text style={styles.ceDurEn}>{bandItem.en}</Text>
                    <View style={styles.ceDurTrack}>
                      {bandItem.share !== null ? <View style={[styles.ceDurFill, { width: `${Math.max(2, bandItem.share * 100)}%`, backgroundColor: ["#5C89A2", "#4E8B87", "#C5A161", "#8A7442"][index] }]} /> : null}
                    </View>
                    <Text style={styles.ceDurValue}>{bandItem.share === null ? "—" : `${Math.round(bandItem.share * 100)}%`}</Text>
                  </View>
                ))}
              </View>
            </View>
            <View style={[styles.ceBlock, styles.lpBorderTop, styles.flex]}>
              <Text style={styles.lpBlockCn}>主题强度排名（匿名）</Text>
              <View style={styles.ceRankList}>
                {topics.length ? topics.map((topic, index) => (
                  <View key={topic.name} style={styles.ceRankRow}>
                    <Text style={styles.ceRankNo}>{index + 1}</Text>
                    <Text numberOfLines={1} style={styles.ceRankName}>{topic.name}</Text>
                    <View style={styles.ceRankTrack}>
                      <View style={[styles.ceRankFill, { width: `${Math.max(5, topic.count / (topics[0]!.count || 1) * 100)}%`, backgroundColor: rankColors[index] }]} />
                    </View>
                    <Text style={styles.ceRankValue}>{`${Math.round(topic.share * 100)}%`}</Text>
                  </View>
                )) : <Text style={styles.lpEmpty}>等待主题证据</Text>}
              </View>
              <Text style={styles.ceNote}>* 排名不代表价值，仅反映相对强度。</Text>
            </View>
          </View>
        </View>
        <PatternFooter dots={model.evidence.kept.dots} text={contentPattern(model.topics)} />
      </View>
    </View>
  );
}

function TopicConstellation({ topics }: { topics: Ranked[] }) {
  const nodes = [
    { x: 205, y: 50, color: "#E9EDF2", glow: 13 },
    { x: 64, y: 92, color: "#9CC3C6", glow: 10 },
    { x: 238, y: 130, color: "#D9B36C", glow: 9 },
    { x: 96, y: 176, color: "#C9A05B", glow: 10 },
  ];
  const sparks = Array.from({ length: 16 }, (_, index) => ({
    x: (index * 53 + 17) % 290 + 5,
    y: (index * 91 + 29) % 200 + 10,
    r: index % 5 === 0 ? 1.3 : 0.9,
    opacity: 0.2 + ((index * 31) % 40) / 100,
  }));
  return (
    <View style={styles.ceConstWrap}>
      <Svg height={269} viewBox="0 0 300 224" width={360}>
        <Defs>
          <RadialGradient id="ceSun">
            <Stop offset="0" stopColor="#E7C687" stopOpacity={0.8} />
            <Stop offset="1" stopColor="#E7C687" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        {sparks.map((spark, index) => <Circle cx={spark.x} cy={spark.y} fill="#D8D2C4" key={index} opacity={spark.opacity} r={spark.r} />)}
        <Ellipse cx={150} cy={114} fill="none" rx={96} ry={62} stroke="#33404A" strokeDasharray="2 5" strokeWidth={0.9} />
        <Ellipse cx={150} cy={114} fill="none" rx={57} ry={36} stroke="#33404A" strokeDasharray="2 5" strokeWidth={0.9} />
        {nodes.map((node, index) => (topics[index] ? <Line key={index} stroke="#3A4A50" strokeDasharray="1 4" strokeWidth={0.8} x1={150} x2={node.x} y1={114} y2={node.y} /> : null))}
        <Circle cx={150} cy={114} fill="url(#ceSun)" r={22} />
        <Circle cx={150} cy={114} fill="#E3C88C" r={5} />
        {nodes.map((node, index) => {
          const topic = topics[index];
          return (
            <React.Fragment key={index}>
              <Circle cx={node.x} cy={node.y} fill={node.color} opacity={topic ? 0.14 : 0.05} r={node.glow} />
              <Circle cx={node.x} cy={node.y} fill={topic ? node.color : "#3A4046"} r={index === 0 ? 4.6 : 3.2} />
              {topic ? <SvgText fill="#D8D2C4" fontSize={10.5} textAnchor={node.x > 150 ? "start" : "end"} x={node.x + (node.x > 150 ? 12 : -12)} y={node.y + 4}>{topic.name}</SvgText> : null}
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
}

function KeptVenn({ intersection, totals }: { intersection: Model["intersection"]; totals: { watch: number; liked: number; favorite: number } }) {
  const circles: Array<{ cx: number; cy: number; stroke: string; icon: Icon; label: string; count: number; ix: number; iy: number }> = [
    { cx: 105, cy: 55, stroke: "#7FB0B4", icon: Eye, label: "观看", count: totals.watch, ix: 97, iy: 30 },
    { cx: 76, cy: 102, stroke: "#C9A05B", icon: Heart, label: "点赞", count: totals.liked, ix: 42, iy: 106 },
    { cx: 134, cy: 102, stroke: "#A8894F", icon: Star, label: "收藏", count: totals.favorite, ix: 138, iy: 106 },
  ];
  const scale = 1.3;
  return (
    <View style={styles.ceVennWrap}>
      <Svg height={158 * scale} viewBox="0 0 210 158" width={210 * scale}>
        {circles.map((circle) => (
          <Circle cx={circle.cx} cy={circle.cy} fill={circle.stroke} fillOpacity={0.09} key={circle.label} r={44} stroke={circle.stroke} strokeOpacity={0.75} strokeWidth={1} />
        ))}
        <Circle cx={105} cy={88} fill="#E7C687" opacity={0.85} r={2} />
      </Svg>
      {circles.map(({ count, icon: VennIcon, ix, iy, label, stroke }) => (
        <View key={label} pointerEvents="none" style={[styles.ceVennTag, { left: ix * scale, top: iy * scale }]}>
          <VennIcon color={stroke} size={14} strokeWidth={1.5} />
          <Text style={styles.ceVennLabel}>{label}</Text>
          <Text style={styles.ceVennCount}>{count || "—"}</Text>
        </View>
      ))}
      <View pointerEvents="none" style={[styles.ceVennCenter, { left: 105 * scale - 13, top: 88 * scale - 10 }]}>
        <Text style={styles.ceVennCount}>{intersection.allThree || "—"}</Text>
      </View>
    </View>
  );
}

/* ---------- 08 创作者宇宙 / CREATOR UNIVERSE ---------- */

function creatorsPattern(model: Model): string {
  const exploration = model.axes[2]?.value ?? null;
  if (exploration === null) return "创作者证据不足，宇宙尚未展开。";
  if (exploration >= 55) return "你的创作者宇宙「广度优先」，长尾丰富，重复访问形成稳定核心。";
  return "你的创作者宇宙「深度优先」，少数熟悉的创作者构成稳定核心。";
}

function CreatorsPage({ mobile, model, privacy }: PageArgs) {
  const top3 = model.creators.slice(0, 3);
  const labels = [0, 1, 2].map((index) => (top3[index] ? (privacy ? `creator ${"ABC"[index]}` : top3[index]!.name) : null));
  const extras = Math.min(5, Math.max(0, model.creatorsCount - 3));
  const focus = model.creatorFocus;
  return (
    <View style={[styles.lpPage, mobile && styles.stack]}>
      <ChapterRail desc="你关注的创作者构成，勾勒出一个广度与深度并存的宇宙。" en="CREATOR UNIVERSE" mobile={mobile} no="08" title="创作者宇宙" yearValue={model.year} />
      <View style={styles.flex}>
        <View style={[styles.cuBody, mobile && styles.stack]}>
          <View style={styles.cuMap}>
            <CreatorUniverse extras={extras} labels={labels} shares={top3.map((creator) => creator.share)} />
            {!model.creatorsCount ? <Text style={styles.lpEmpty}>等待创作者证据</Text> : null}
          </View>
          <View style={styles.cuRail}>
            <View style={styles.cuBlock}>
              <Text style={styles.lpBlockCn}>创作者集中度</Text>
              <View style={styles.cuDonutWrap}>
                <Donut value={focus.concentration} />
                <Text style={styles.cuDonutValue}>{pctLabel(focus.concentration)}</Text>
              </View>
              <Text style={styles.cuHint}>（越低越分散）</Text>
            </View>
            <View style={[styles.cuBlock, styles.lpBorderTop]}>
              <Text style={styles.lpBlockCn}>发现 vs 重复访问</Text>
              <DiscoveryGauge discovery={focus.discovery} />
              <View style={styles.cuLegendRow}>
                <Text {...motionData("twinkle", 2)} style={styles.cuLegendSpark}>✦</Text>
                <Text style={styles.lpMuted}>发现</Text>
                <View style={styles.cuLegendDot} />
                <Text style={styles.lpMuted}>重复访问</Text>
              </View>
            </View>
            <View style={[styles.cuBlock, styles.lpBorderTop, styles.flex]}>
              <Text style={styles.lpBlockCn}>长尾分布</Text>
              <TailChart tail={focus.tail} />
            </View>
          </View>
        </View>
        <PatternFooter dots={model.evidence.creators.dots} text={creatorsPattern(model)} />
      </View>
    </View>
  );
}

function CreatorUniverse({ extras, labels, shares }: { extras: number; labels: Array<string | null>; shares: number[] }) {
  const nodes = [
    { x: 348, y: 92, label: [320, 56] as const },
    { x: 432, y: 262, label: [396, 296] as const },
    { x: 156, y: 368, label: [118, 402] as const },
  ];
  const persons: Array<[number, number]> = [[116, 208], [226, 118], [378, 388], [452, 152], [80, 310]];
  const sparks = Array.from({ length: 42 }, (_, index) => ({
    x: (index * 73 + 31) % 496 + 12,
    y: (index * 113 + 47) % 472 + 12,
    r: index % 6 === 0 ? 1.4 : 0.9,
    opacity: 0.16 + ((index * 37) % 42) / 100,
  }));
  return (
    <View style={styles.cuMapWrap}>
      <Svg height={500} viewBox="0 0 520 500" width={520}>
        <Defs>
          <RadialGradient id="cuCore">
            <Stop offset="0" stopColor="#EFE3B8" stopOpacity={0.85} />
            <Stop offset="1" stopColor="#EFE3B8" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="cuGold">
            <Stop offset="0" stopColor="#E3C88C" stopOpacity={0.75} />
            <Stop offset="1" stopColor="#E3C88C" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        {sparks.map((spark, index) => <Circle cx={spark.x} cy={spark.y} fill="#D8D2C4" key={index} opacity={spark.opacity} r={spark.r} />)}
        {[64, 110, 156, 202, 242].map((radius) => <Circle cx={260} cy={250} fill="none" key={radius} r={radius} stroke="#2C3A40" strokeDasharray="2 6" strokeWidth={0.9} />)}
        <Circle cx={260} cy={250} fill="url(#cuCore)" r={38} />
        <Path d={starPath(260, 250, 16)} fill="#EFE3B8" />
        {labels[0] ? <>
          <Circle cx={nodes[0]!.x} cy={nodes[0]!.y} fill="#0F1416" r={10 + (shares[0] ?? 0) * 22} stroke="#9FB6BC" strokeWidth={1.1} />
          <Circle cx={nodes[0]!.x} cy={nodes[0]!.y} fill="#D8D2C4" r={2.4} />
        </> : null}
        {labels[1] ? <>
          <Circle cx={nodes[1]!.x} cy={nodes[1]!.y} fill="url(#cuGold)" r={20} />
          <Circle cx={nodes[1]!.x} cy={nodes[1]!.y} fill="#E3C88C" r={5.4} />
        </> : null}
        {labels[2] ? <>
          <Circle cx={nodes[2]!.x} cy={nodes[2]!.y} fill="#0F1416" r={8 + (shares[2] ?? 0) * 22} stroke="#6E8C90" strokeWidth={1.1} />
          <Circle cx={nodes[2]!.x} cy={nodes[2]!.y} fill="#B8C7C4" r={2} />
        </> : null}
      </Svg>
      {persons.slice(0, extras).map(([x, y], index) => (
        <View key={index} style={[styles.cuPerson, { left: x - 13, top: y - 13 }]}>
          <UserRound color="#7E8C8A" size={12} strokeWidth={1.4} />
        </View>
      ))}
      {labels.map((label, index) => (label ? (
        <Text key={index} numberOfLines={1} style={[styles.cuLabel, { left: nodes[index]!.label[0], top: nodes[index]!.label[1] }]}>{label}</Text>
      ) : null))}
    </View>
  );
}

function Donut({ value }: { value: number | null }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const pct = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <Svg height={104} viewBox="0 0 104 104" width={104}>
      <Circle cx={52} cy={52} fill="none" r={radius} stroke="#26231C" strokeWidth={9} />
      {value !== null ? (
        <Circle cx={52} cy={52} fill="none" r={radius} stroke="#C9A05B" strokeDasharray={`${circumference * pct / 100} ${circumference}`} strokeWidth={9} transform="rotate(-90 52 52)" />
      ) : null}
    </Svg>
  );
}

function DiscoveryGauge({ discovery }: { discovery: number | null }) {
  const split = discovery === null ? null : 180 + Math.max(2, Math.min(178, discovery / 100 * 180));
  return (
    <View style={styles.cuGaugeWrap}>
      <Svg height={78} viewBox="0 0 150 78" width={150}>
        {split === null ? (
          <Path d={describeArc(75, 72, 54, 180, 360)} fill="none" stroke="#26231C" strokeWidth={10} />
        ) : (
          <>
            <Path d={describeArc(75, 72, 54, 180, split)} fill="none" stroke="#4E8B87" strokeWidth={10} />
            <Path d={describeArc(75, 72, 54, split, 360)} fill="none" stroke="#C9A05B" strokeWidth={10} />
          </>
        )}
      </Svg>
      <View style={styles.cuGaugeValues}>
        <Text style={styles.cuGaugeTeal}>{pctLabel(discovery)}</Text>
        <Text style={styles.cuGaugeSep}>:</Text>
        <Text style={styles.cuGaugeGold}>{discovery === null ? "—" : `${Math.round(100 - discovery)}%`}</Text>
      </View>
    </View>
  );
}

function TailChart({ tail }: { tail: number[] }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const max = Math.max(1, ...tail);
  const pts = tail.map((value, index) => [12 + index * (size.w - 22) / Math.max(1, tail.length - 1), size.h - 12 - value / max * (size.h - 24)] as [number, number]);
  return (
    <View onLayout={(event) => setSize({ w: event.nativeEvent.layout.width, h: event.nativeEvent.layout.height })} style={styles.cuTailWrap}>
      {size.w > 0 && tail.length > 1 ? (
        <Svg height={size.h} width={size.w}>
          <Line stroke="#332E24" strokeWidth={1} x1={12} x2={12} y1={4} y2={size.h - 12} />
          <Line stroke="#332E24" strokeWidth={1} x1={12} x2={size.w - 4} y1={size.h - 12} y2={size.h - 12} />
          <Path d={smoothPath(pts, size.h - 12)} fill="none" stroke="#6FB3AD" strokeWidth={1.4} />
        </Svg>
      ) : null}
      <Text style={styles.cuTailY}>数量</Text>
      <Text style={styles.cuTailX}>排名</Text>
      {tail.length <= 1 ? <Text style={styles.lpChartEmpty}>等待更多创作者</Text> : null}
    </View>
  );
}

/* ---------- 09 聊天回声 / CHAT ECHO ---------- */

function ChatPage({ mobile, model }: PageArgs) {
  const slotIcons: Record<string, Icon> = { text: MessageCircle, image: ImageIcon, sticker: Sticker, share: Send, call: Phone, voice: Radio, video: Play, system: Info, unknown: MessageCircle };
  const privacyCn = model.chatGroups.length
    ? "隐私保护：时间与类型仅覆盖好友对话；群聊只计总量。"
    : "隐私保护：本页仅展示对话活动的时间与类型分布，不展示任何消息内容、具体信息或身份标识。";
  const privacyEn = model.chatGroups.length
    ? "Privacy first: Group chats are totals only; no content or identifiers are shown."
    : "Privacy first: No message content, details, or identifiers are shown.";
  return (
    <View style={styles.lpPageCol}>
      <PageHeader en="CHAT ECHO" no="09" title="聊天回声" yearValue={model.year} />
      <View style={styles.chBody}>
        <View>
          <BlockTitle cn="对话活动波形" en="ACTIVITY OVER TIME" />
          <View style={styles.chWaveRow}>
            <View style={styles.chWaveAxis}>
              <Text style={styles.lpMuted}>活跃度</Text>
              <Text style={styles.chAxisSmall}>High</Text>
              <Text style={styles.chAxisSmall}>Base</Text>
              <Text style={styles.chAxisSmall}>Low</Text>
            </View>
            <View style={styles.flex}>
              <ChatWave hours={model.chatHours} />
              <View style={styles.chTimeRow}>{["00:00", "04:00", "08:00", "12:00", "16:00", "20:00", "24:00"].map((label) => <Text key={label} style={styles.lpAxisText}>{label}</Text>)}</View>
            </View>
          </View>
        </View>
        <View style={[styles.chBottom, mobile && styles.stack]}>
          <View style={[styles.chTypes, !mobile && styles.lpBorderRight]}>
            <BlockTitle cn="消息类型节奏" en="MESSAGE TYPE RHYTHM" />
            {model.chatSlots.map((row) => {
              const RowIcon = slotIcons[row.id] ?? MessageCircle;
              const rowMax = Math.max(...row.slots);
              return (
                <View key={row.id} style={styles.chTypeRow}>
                  <RowIcon color="#8F887B" size={12} strokeWidth={1.5} />
                  <Text style={styles.chTypeCn}>{row.label}</Text>
                  <Text style={styles.chTypeEn}>{row.en}</Text>
                  <View style={styles.chDotLine}>
                    {row.slots.map((count, index) => {
                      const dotSize = !count ? 2 : 3.5 + count / Math.max(1, rowMax) * 4.5;
                      const color = !count ? "#2B2822" : count >= rowMax * 0.66 ? "#C9A05B" : "#5C89A2";
                      return (
                        <View key={index} style={styles.chDotSlot}>
                          <View style={{ width: dotSize, height: dotSize, borderRadius: dotSize, backgroundColor: color }} />
                        </View>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </View>
          <View style={styles.chWindows}>
            <BlockTitle cn="活跃窗口" en="ACTIVE WINDOWS" />
            <HourRing hours={model.chatHours} />
            <View style={styles.chRingLegend}>
              <View style={[styles.chLegendDot, { backgroundColor: "#5C89A2" }]} />
              <Text style={styles.lpMuted}>高活跃时段</Text>
              <View style={[styles.chLegendDot, { backgroundColor: "#C9A05B" }]} />
              <Text style={styles.lpMuted}>低活跃时段</Text>
            </View>
          </View>
        </View>
        <View style={styles.chPrivacy}>
          <View style={styles.chLockRing}><Lock color="#3A342A" size={13} strokeWidth={1.6} /></View>
          <View style={styles.flex}>
            <Text style={styles.chPrivacyCn}>{privacyCn}</Text>
            <Text style={styles.chPrivacyEn}>{privacyEn}</Text>
          </View>
          <View style={styles.chPrivacyRule} />
          <View {...motionData("twinkle", 0)}><CompassRose color="#6B5F49" size={22} /></View>
        </View>
      </View>
    </View>
  );
}

function ChatWave({ hours }: { hours: number[] }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const max = Math.max(...hours);
  const mid = size.h * 0.46;
  const x = (index: number) => index * size.w / 24;
  const up = Array.from({ length: 25 }, (_, index) => [x(index), max ? mid - (hours[index % 24] ?? 0) / max * (mid - 8) : mid] as [number, number]);
  const down = Array.from({ length: 25 }, (_, index) => [x(index), max ? mid + (hours[index % 24] ?? 0) / max * (size.h - mid - 10) * 0.82 : mid] as [number, number]);
  return (
    <View onLayout={(event) => setSize({ w: event.nativeEvent.layout.width, h: event.nativeEvent.layout.height })} style={styles.chWave}>
      {size.w > 0 ? (
        <Svg height={size.h} width={size.w}>
          <Defs>
            <LinearGradient id="chUp" x1="0" x2="0" y1="0" y2="1">
              <Stop offset="0" stopColor="#5C89A2" stopOpacity={0.55} />
              <Stop offset="1" stopColor="#5C89A2" stopOpacity={0.06} />
            </LinearGradient>
            <LinearGradient id="chDown" x1="0" x2="0" y1="0" y2="1">
              <Stop offset="0" stopColor="#C9A05B" stopOpacity={0.06} />
              <Stop offset="1" stopColor="#C9A05B" stopOpacity={0.5} />
            </LinearGradient>
          </Defs>
          {[4, 8, 12, 16, 20].map((hour) => <Line key={hour} stroke="#211F1A" strokeDasharray="2 5" strokeWidth={0.8} x1={x(hour)} x2={x(hour)} y1={6} y2={size.h - 6} />)}
          {max ? <Path d={`${smoothPath(up)} L ${size.w} ${mid} L 0 ${mid} Z`} fill="url(#chUp)" /> : null}
          {max ? <Path d={`${smoothPath(down)} L ${size.w} ${mid} L 0 ${mid} Z`} fill="url(#chDown)" /> : null}
          {max ? <Path d={smoothPath(up)} fill="none" stroke="#7FB0C9" strokeWidth={1.1} /> : null}
          {max ? <Path d={smoothPath(down)} fill="none" stroke="#C9A05B" strokeOpacity={0.7} strokeWidth={1} /> : null}
          <Line stroke="#4A4234" strokeWidth={1} x1={0} x2={size.w} y1={mid} y2={mid} />
        </Svg>
      ) : null}
      {!max ? <Text style={styles.lpChartEmpty}>等待聊天证据</Text> : null}
    </View>
  );
}

function HourRing({ hours }: { hours: number[] }) {
  const max = Math.max(...hours);
  const spans: Array<{ from: number; to: number; level: 1 | 2 }> = [];
  for (let hour = 0; hour < 24; hour += 1) {
    const count = hours[hour] ?? 0;
    const level = !count ? 0 : count >= max * 0.6 ? 2 : 1;
    if (!level) continue;
    const prev = spans[spans.length - 1];
    if (prev && prev.level === level && prev.to === hour) prev.to = hour + 1;
    else spans.push({ from: hour, to: hour + 1, level });
  }
  const angle = (hour: number) => hour / 24 * 360 - 90;
  return (
    <View style={styles.chRing}>
      <Svg height={158} viewBox="0 0 158 158" width={158}>
        <Circle cx={79} cy={79} fill="none" r={58} stroke="#26231C" strokeWidth={2} />
        {spans.map((span, index) => (
          <Path d={describeArc(79, 79, 58, angle(span.from) + 1.4, angle(span.to) - 1.4)} fill="none" key={index} stroke={span.level === 2 ? "#5C89A2" : "#C9A05B"} strokeWidth={span.level === 2 ? 11 : 5.5} />
        ))}
        <SvgText fill="#6F675B" fontSize={8.5} textAnchor="middle" x={79} y={40}>24</SvgText>
        <SvgText fill="#6F675B" fontSize={8.5} textAnchor="middle" x={120} y={83}>06</SvgText>
        <SvgText fill="#6F675B" fontSize={8.5} textAnchor="middle" x={79} y={125}>12</SvgText>
        <SvgText fill="#6F675B" fontSize={8.5} textAnchor="middle" x={38} y={83}>18</SvgText>
      </Svg>
      <View style={styles.chRingMoon}><Moon color="#8F887B" size={13} strokeWidth={1.4} /></View>
    </View>
  );
}

/* ---------- 10 交叉洞察 / CROSS PATTERNS ---------- */

function crossCellStyle(value: number | null, diagonal: boolean) {
  if (diagonal) return styles.cxCellDiag;
  if (value === null) return null;
  if (value >= 0.6) return styles.cxCellPosHot;
  if (value >= 0.3) return styles.cxCellPos;
  if (value <= -0.6) return styles.cxCellNegHot;
  if (value <= -0.3) return styles.cxCellNeg;
  return styles.cxCellWeak;
}

function CrossPage({ mobile, model }: PageArgs) {
  const { days, labels, matrix, patterns } = model.cross;
  return (
    <View style={styles.lpPageCol}>
      <PageHeader en="CROSS PATTERNS" no="10" title="交叉洞察" yearValue={model.year} />
      <View style={styles.chBody}>
        <BlockTitle cn="证据到模式" en="EVIDENCE → PATTERN" />
        <View style={[styles.cxRow, mobile && styles.stack]}>
          <View style={styles.cxBox}>
            <BlockTitle cn="相关矩阵" en="CORRELATION MATRIX" />
            <View style={styles.cxColHeadRow}>
              <View style={styles.cxRowLabelSpace} />
              {labels.map((label) => (
                <View key={label} style={styles.cxColLabel}>{[...label].map((char, index) => <Text key={index} style={styles.cxColChar}>{char}</Text>)}</View>
              ))}
            </View>
            {labels.map((rowLabel, row) => (
              <View key={rowLabel} style={styles.cxMatrixRow}>
                <Text style={styles.cxRowLabel}>{rowLabel}</Text>
                {labels.map((_, column) => <View key={column} style={[styles.cxCell, crossCellStyle(matrix[row]?.[column] ?? null, row === column)]} />)}
              </View>
            ))}
            <View style={styles.cxLegend}>
              <View style={[styles.cxLegendSwatch, { backgroundColor: "#3E6C77" }]} />
              <Text style={styles.lpMuted}>负相关</Text>
              <View style={[styles.cxLegendSwatch, { backgroundColor: "#2B2C2E" }]} />
              <Text style={styles.lpMuted}>弱相关</Text>
              <View style={[styles.cxLegendSwatch, { backgroundColor: "#96794A" }]} />
              <Text style={styles.lpMuted}>正相关</Text>
            </View>
          </View>
          <View style={[styles.cxBox, styles.cxPatterns]}>
            <BlockTitle cn="模式观察" en="PATTERN FOUND" />
            {patterns.map((pattern, index) => (
              <View key={index} style={styles.cxCard}>
                <View {...motionData("twinkle", index)} style={styles.cxCardRose}><CompassRose color="#8A7E66" size={22} /></View>
                <View style={styles.flex}>
                  <Text style={styles.cxCardTitle}>{pattern.title}</Text>
                  <Text style={styles.cxCardText}>{pattern.text}</Text>
                </View>
                <View style={styles.cxCardNo}>
                  <Text style={styles.cxCardNoLabel}>pattern</Text>
                  <Text style={styles.cxCardNoText}>{String(index + 1).padStart(2, "0")}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
        <View style={[styles.cxFacts, mobile && styles.stack]}>
          <View style={styles.cxFact}>
            <Layers color="#8F887B" size={15} strokeWidth={1.4} />
            <View style={styles.flex}>
              <Text style={styles.cxFactLabel}>样本量 / EVIDENCE</Text>
              <Text style={styles.cxFactValue}>{days >= 14 ? "足够充足 / Adequate" : days > 0 ? `有限（${days} 天）/ Limited` : "等待样本 / Awaiting"}</Text>
            </View>
          </View>
          <View style={[styles.cxFact, styles.cxFactMid]}>
            <Text {...motionData("twinkle", 3)} style={styles.cxFactSpark}>✦</Text>
            <View style={styles.flex}>
              <Text style={styles.cxFactLabel}>置信度 / CONFIDENCE</Text>
              <Text style={styles.cxFactValue}>{days >= 14 ? "中等 / Moderate" : "低 / Low"}</Text>
            </View>
          </View>
          <View style={styles.cxFact}>
            <Info color="#8F887B" size={15} strokeWidth={1.4} />
            <View style={styles.flex}>
              <Text style={styles.cxFactLabel}>注意事项 / CAVEAT</Text>
              <Text style={styles.cxFactValue}>相关不等于因果，仅为观测结果。</Text>
              <Text style={styles.cxFactEn}>Correlation ≠ Causation; Observational only.</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

/* ---------- 11 意外发现 / SURPRISES ---------- */

function SurprisesPage({ mobile, model }: PageArgs) {
  const cards = model.surprises.map((insight, index) => ({
    no: String(index + 1).padStart(2, "0"),
    title: insight.title,
    text: insight.text,
    status: insight.status,
    art: [<ArtWaves key="waves" />, <ArtOrbit key="orbit" />, <ArtNight key="night" />][index],
  }));
  return (
    <View style={styles.lpPageCol}>
      <PageHeader en="SURPRISES" no="11" title="意外发现" yearValue={model.year} />
      <View style={styles.chBody}>
        <BlockTitle cn="观察到的有趣对比" en="OBSERVED CONTRASTS" />
        <View style={[styles.spRow, mobile && styles.stack]}>
          {cards.map((card) => (
            <View key={card.no} style={styles.spCard}>
              <View style={styles.spBadge}><Text style={styles.spBadgeText}>{card.no}</Text></View>
              <Text accessibilityLabel={card.status === "pending" ? "待观测" : undefined} numberOfLines={2} style={styles.spTitle}>{card.title}</Text>
              <View style={styles.spArt}>{card.art}</View>
              <View style={styles.spObsRow}>
                <View style={styles.spObsRule} />
                <Text style={styles.spObsLabel}>观察</Text>
                <View style={styles.spObsRule} />
              </View>
              <Text numberOfLines={4} style={styles.spText}>{card.text}</Text>
              <Text {...motionData("twinkle", 4)} style={styles.spCardSpark}>✦</Text>
            </View>
          ))}
          <View style={[styles.spCard, styles.spSealCard]}>
            <WaxSeal />
            <Text style={styles.spSealTitle}>好奇心，是你最稳定的引擎。</Text>
            <Text style={styles.spSealText}>继续探索，世界在回应你。</Text>
            <Text {...motionData("twinkle", 5)} style={styles.spSealSpark}>✦</Text>
          </View>
        </View>
        <View style={styles.spFoot}>
          <Eye color="#3A342A" size={13} strokeWidth={1.5} />
          <Text style={styles.spFootText}>注：以上为观测到的现象，不代表任何评价或判断。</Text>
          <Text style={styles.spFootEn}>Note: Observations only. Not evaluations or conclusions.</Text>
          <View style={styles.flex} />
          <Text style={styles.spFootRight}>保持好奇，保持自主。</Text>
          <MiniConstellation />
        </View>
      </View>
    </View>
  );
}

function ArtWaves() { return <Image resizeMode="contain" source={require("./assets/surprise-art-1.png")} style={styles.spArtImg} />; }
function ArtOrbit() { return <Image resizeMode="contain" source={require("./assets/surprise-art-2.png")} style={styles.spArtImg} />; }
function ArtNight() { return <Image resizeMode="contain" source={require("./assets/surprise-art-3.png")} style={styles.spArtImg} />; }
function WaxSeal() { return <Image resizeMode="contain" source={require("./assets/surprise-seal.png")} style={styles.spSealImg} />; }

function MiniConstellation() {
  return (
    <Svg height={16} viewBox="0 0 46 16" width={46}>
      <Line stroke="#6E5B33" strokeWidth={0.7} x1={4} x2={16} y1={11} y2={4} />
      <Line stroke="#6E5B33" strokeWidth={0.7} x1={16} x2={30} y1={4} y2={10} />
      <Line stroke="#6E5B33" strokeWidth={0.7} x1={30} x2={42} y1={10} y2={5} />
      {([[4, 11], [16, 4], [30, 10], [42, 5]] as Array<[number, number]>).map(([x, y], index) => <Circle cx={x} cy={y} fill="#8A6E35" key={index} r={index === 1 ? 1.8 : 1.2} />)}
    </Svg>
  );
}

/* ---------- 12 习惯印章 / HABIT PROFILE ---------- */

function profileSummary(model: Model): Array<{ icon: Icon; title: string; text: string }> {
  const exploration = model.axes[2]?.value ?? null;
  const depth = model.axes[1]?.value ?? null;
  const social = model.axes[4]?.value ?? null;
  return [
    exploration === null ? { icon: Compass, title: "探索证据待补充", text: "创作者与主题的覆盖仍在积累，探索倾向尚未定型。" }
      : exploration >= 55 ? { icon: Compass, title: "以探索驱动选择", text: "更关注新内容与多元视角，形成显著的探索偏好。" }
        : { icon: Compass, title: "以熟悉驱动选择", text: "更常回到熟悉的创作者与主题，形成稳定的内容轨道。" },
    depth === null ? { icon: Target, title: "深度证据待补充", text: "观看进度样本不足，注意力深度尚无法判断。" }
      : depth >= 60 ? { icon: Target, title: "深度优先于数量", text: "在少数主题上投入更多注意力，形成更深的理解与回访。" }
        : { icon: Target, title: "广度优先于深度", text: "更倾向快速浏览与筛选，在广度中寻找感兴趣的内容。" },
    social === null ? { icon: MessageCircle, title: "表达证据待补充", text: "互动样本不足，表达倾向尚未显现。" }
      : social < 45 ? { icon: MessageCircle, title: "社交表达更克制", text: "互动频率偏低，倾向于有质量的连接，而非高频表达。" }
        : { icon: MessageCircle, title: "社交表达更活跃", text: "互动频率较高，乐于在内容之外建立连接。" },
  ];
}

const profileEn: Record<string, string> = {
  "探索者 · 深潜型": "Curious Explorer",
  "广域探索者": "Broad Explorer",
  "稳定深潜者": "Deep Diver",
  "节奏观察者": "Rhythm Observer",
  "等待更多足迹": "Awaiting Traces",
};

function ProfilePage({ mobile, model, onRestart }: PageArgs) {
  const summary = profileSummary(model);
  const conf = model.evidence.watch.dots;
  const confEn: Record<string, string> = { 高: "High", 中高: "Solid", 中: "Moderate", 低: "Low", 待定: "Pending" };
  return (
    <View style={styles.lpPageCol}>
      <PageHeader en="HABIT PROFILE" no="12" title="习惯印章" yearValue={model.year} />
      <View style={[styles.hpBody, mobile && styles.stack]}>
        <View style={[styles.hpEmblemCol, !mobile && styles.lpBorderRight]}>
          <EmblemBadge en={profileEn[model.profile] ?? "Observed Profile"} profile={model.profile} />
        </View>
        <View style={styles.hpSummary}>
          <BlockTitle cn="你的习惯画像（观测结论）" en="EVIDENCE-BACKED SUMMARY" />
          {summary.map(({ icon: LineIcon, text, title }, index) => (
            <View key={title} style={[styles.hpLine, index < summary.length - 1 && styles.hpLineDivider]}>
              <View style={styles.hpLineIcon}><LineIcon color="#C5A161" size={15} strokeWidth={1.4} /></View>
              <View style={styles.flex}>
                <Text style={styles.hpLineTitle}>{title}</Text>
                <Text style={styles.hpLineText}>{text}</Text>
              </View>
            </View>
          ))}
        </View>
        <View style={[styles.hpRadarCol, mobile && styles.hpRadarColMobile]}>
          <BlockTitle cn="行为维度" en="HABIT DIMENSIONS" />
          <HabitRadar axes={model.axes} />
        </View>
      </View>
      <View style={[styles.hpFacts, mobile && styles.stack]}>
        <View style={styles.hpFact}>
          <Text style={styles.cxFactLabel}>置信度 / CONFIDENCE</Text>
          <Text style={styles.cxFactValue}>{confLabel(conf)} / {confEn[confLabel(conf)]}</Text>
          <View style={styles.lpDots}>{[0, 1, 2, 3, 4].map((dot) => <View key={dot} style={[styles.lpDot, dot < conf && styles.lpDotOn]} />)}</View>
        </View>
        <View style={[styles.hpFact, styles.hpFactMid]}>
          <Text style={styles.cxFactLabel}>局限性 / LIMITATIONS</Text>
          <View style={styles.hpLimitRow}>
            <Mountain color="#8F887B" size={14} strokeWidth={1.4} />
            <View style={styles.flex}>
              <Text style={styles.cxFactValue}>基于行为数据的观测，可能随时间与情境变化。</Text>
              <Text style={styles.cxFactEn}>Observational limits apply.</Text>
            </View>
          </View>
        </View>
        <View style={styles.hpFact}>
          <Text style={styles.cxFactLabel}>下一步 / NEXT</Text>
          <View style={styles.hpButtons}>
            {Platform.OS === "web" ? (
              <Pressable accessibilityRole="button" onPress={() => window.print()} style={({ pressed }) => [styles.hpSaveBtn, pressed && styles.pressed, pointer]}>
                <Download color="#CFE2DE" size={14} strokeWidth={1.6} />
                <View>
                  <Text style={styles.hpSaveText}>保存报告</Text>
                  <Text style={styles.hpSaveEn}>Save Report</Text>
                </View>
              </Pressable>
            ) : null}
            <Pressable accessibilityRole="button" onPress={onRestart} style={({ pressed }) => [styles.hpReBtn, pressed && styles.pressed, pointer]}>
              <RotateCcw color="#3A342A" size={14} strokeWidth={1.6} />
              <View>
                <Text style={styles.hpReText}>重新观测</Text>
                <Text style={styles.hpReEn}>Re-observe</Text>
              </View>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

function EmblemBadge({ en, profile }: { en: string; profile: string }) {
  return (
    <View {...motionData("twinkle", 2)} style={styles.hpEmblemWrap}>
      <Image resizeMode="contain" source={require("./assets/habit-emblem.png")} style={styles.hpEmblemImg} />
      <Text style={styles.hpEmblemCn}>{profile}</Text>
      <Text style={styles.hpEmblemEn}>{en}</Text>
    </View>
  );
}

function HabitRadar({ axes }: { axes: Model["axes"] }) {
  const dims = [
    { cn: "节奏", en: "Rhythm", value: axes[0]?.value ?? null },
    { cn: "注意力", en: "Attention", value: axes[1]?.value ?? null },
    { cn: "探索", en: "Exploration", value: axes[2]?.value ?? null },
    { cn: "承诺", en: "Commitment", value: axes[3]?.value ?? null },
    { cn: "社交表达", en: "Social Expression", value: axes[4]?.value ?? null },
  ];
  const cx = 132;
  const cy = 122;
  const radius = 82;
  const angle = (index: number) => (-90 + index * 72) * Math.PI / 180;
  const point = (index: number, r: number) => [cx + Math.cos(angle(index)) * r, cy + Math.sin(angle(index)) * r] as [number, number];
  const ringPath = (r: number) => `M ${dims.map((_, index) => point(index, r).join(" ")).join(" L ")} Z`;
  const valuePts = dims.map((dim, index) => point(index, radius * Math.max(0.12, Math.min(1, (dim.value ?? 15) / 100))));
  const labelPos = [
    { top: 8, left: 32, width: 240, alignItems: "center" as const },
    { top: 86, left: 238 },
    { top: 200, left: 192 },
    { top: 200, left: 24, width: 84, alignItems: "flex-end" as const },
    { top: 80, left: 0, width: 64, alignItems: "flex-end" as const },
  ];
  return (
    <View style={styles.hpRadarWrap}>
      <Svg height={244} style={styles.hpRadarSvg} viewBox="0 0 264 244" width={264}>
        {[0.25, 0.5, 0.75, 1].map((frac) => <Path d={ringPath(radius * frac)} fill="none" key={frac} stroke="#2B2822" strokeWidth={frac === 1 ? 1 : 0.7} />)}
        {dims.map((_, index) => {
          const [x, y] = point(index, radius);
          return <Line key={index} stroke="#2B2822" strokeWidth={0.7} x1={cx} x2={x} y1={cy} y2={y} />;
        })}
        <Path d={`M ${valuePts.map((pt) => pt.join(" ")).join(" L ")} Z`} fill="#3E6C77" fillOpacity={0.3} stroke="#6FA3AC" strokeWidth={1.2} />
        {valuePts.map((pt, index) => <Circle cx={pt[0]} cy={pt[1]} fill={dims[index]!.value === null ? "#3A3428" : "#D9B36C"} key={index} r={3} stroke="#0B0B0C" strokeWidth={1} />)}
      </Svg>
      {dims.map((dim, index) => (
        <View key={dim.cn} style={[styles.hpRadarLabel, labelPos[index]]}>
          <Text style={styles.hpRadarCn}>{dim.cn}</Text>
          <Text style={styles.hpRadarEn}>{dim.en}</Text>
        </View>
      ))}
    </View>
  );
}

type PageArgs = { mobile: boolean; model: Model; onNext: () => void; onOpen: (url: string) => Promise<void>; onRestart: () => void; onSettings: () => void; privacy: boolean; source: string; updatedAt: string | null };


export function buildReportModel(
  records: PersonalRecordCollection,
  chats: ChatMessage[],
  report: AnnualReport | LivingReport | null,
  chatConversations: ChatConversationSummary[] = [],
): Model {
  const groupIds = new Set(chatConversations.filter((conversation) => conversation.kind === "group").map((conversation) => conversation.id));
  const friendChats = chats.filter((message) => message.conversationType !== "group" && (!message.conversationId || !groupIds.has(message.conversationId)));
  const chatTotal = countChatMessages(chats, chatConversations);
  const chatGroups = chatConversations.filter((conversation) => conversation.kind === "group");
  const chatGroupMessages = chatGroups.reduce((total, conversation) => total + conversation.messageCount, 0);
  const chatOwnGroupMessages = chatGroups.reduce((total, conversation) => total + conversation.ownMessageCount, 0);
  const rows = (["watch_history", "liked_videos", "favorite_videos"] as const).flatMap((type) => records[type].map((record) => ({ record, type })));
  const dated = rows.filter(({ record }) => validDate(record.occurredAt));
  const reliable = dated.filter(({ record }) => record.occurredAtSource !== "unknown");
  const heatmap = Array.from({ length: 168 }, () => 0);
  const hours = Array.from({ length: 24 }, () => 0);
  const chatHours = Array.from({ length: 24 }, () => 0);
  const months = Array.from({ length: 12 }, () => 0);
  const dayCounts = Array.from({ length: 12 }, () => Array.from({ length: 32 }, () => 0));
  for (const { record, type } of reliable) {
    const date = new Date(record.occurredAt!);
    const hour = date.getHours();
    const heatIndex = ((date.getDay() + 6) % 7) * 24 + hour;
    if (type === "watch_history") { hours[hour] = (hours[hour] ?? 0) + 1; heatmap[heatIndex] = (heatmap[heatIndex] ?? 0) + 1; }
    const month = date.getMonth();
    months[month] = (months[month] ?? 0) + 1;
    dayCounts[month]![date.getDate()] = (dayCounts[month]![date.getDate()] ?? 0) + 1;
  }
  for (const message of friendChats) if (validDate(message.sentAt)) { const hour = new Date(message.sentAt!).getHours(); chatHours[hour] = (chatHours[hour] ?? 0) + 1; }

  const annual = isAnnual(report) ? report : null;
  const modelYear = annual?.year
    ?? report?.coverage.year
    ?? inferYear(reliable.map(({ record }) => record.occurredAt))
    ?? new Date().getFullYear();
  const overview = annual?.overview.data as AnnualOverviewData | undefined;
  const rhythm = annual?.rhythm.data as AnnualRhythmData | undefined;
  const monthly = annual?.monthly.data as AnnualMonthlyData | undefined;
  const interest = annual?.interests.data as AnnualInterestsData | undefined;
  const creatorData = annual?.creators.data as AnnualCreatorsData | undefined;
  const kept = annual?.kept.data as AnnualKeptData | undefined;
  if (rhythm?.heatmap.length) for (const cell of rhythm.heatmap) heatmap[cell.weekday * 24 + cell.hour] = cell.count;
  if (monthly?.months.some((month) => (month.liked ?? 0) + (month.favorite ?? 0) > 0)) monthly.months.forEach((month, index) => { months[index] = (month.liked ?? 0) + (month.favorite ?? 0); });

  const topicCounts = count(rows.flatMap(({ record }) => record.topics ?? []));
  const creatorCounts = count(rows.map(({ record }) => record.author).filter((value): value is string => Boolean(value?.trim())));
  const formats = rankMap(count(rows.map(({ record }) => formatName(record.mediaType))));
  const durations = rankMap(count(rows.map(({ record }) => durationName(record.durationSeconds)).filter((value): value is string => value !== null)));
  const chatKinds = rankMap(count(friendChats.map((message) => chatTypes.find((item) => item.id === message.type)?.label ?? "其他")));
  const topics = interest?.topics.length ? rank(interest.topics) : rankMap(topicCounts);
  const creators = creatorData?.top.length ? creatorData.top.map((item) => ({ name: item.name, count: item.count, share: item.share })) : rankMap(creatorCounts);
  const progress = records.watch_history.map((record) => record.watchProgress?.percent).filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0);
  const completion = progress.length ? progress.reduce((sum, value) => sum + value, 0) / progress.length : null;
  const watchIds = records.watch_history.map((record) => record.videoId).filter((value): value is string => Boolean(value));
  const computedIntersection = makeIntersection(records);
  const intersection = kept ? { watchLiked: kept.pairwise.watchLiked, watchFavorite: kept.pairwise.watchFavorite, likedFavorite: kept.pairwise.likedFavorite, allThree: kept.allThree } : computedIntersection;
  const unique = new Set(rows.map(({ record, type }) => record.videoId ?? record.url ?? `${type}:${record.id}`)).size;
  const activeDays = new Set(reliable.map(({ record }) => dateKey(record.occurredAt!))).size;
  const dayTotals = weekdays.map((_, index) => heatmap.slice(index * 24, index * 24 + 24).reduce((sum, value) => sum + value, 0));
  const coverage = report?.coverage;
  const reliableRatio = coverage?.reliableDateRatio ?? (rows.length ? reliable.length / rows.length : 0);
  const status: Model["status"] = rows.length || chatTotal ? (report?.status === "partial" || coverage?.partial ? "partial" : "ok") : "empty";
  const span = spanDays(reliable.map(({ record }) => record.occurredAt!));
  const exploration = creatorData?.creatorCount ? creatorData.exploration * 100 : creators.length && unique ? creators.length / unique * 100 : null;
  const retention = rows.length ? Math.min(100, (records.liked_videos.length + records.favorite_videos.length) / rows.length * 100) : null;
  const social = rows.length || chatTotal ? Math.min(100, chatTotal / Math.max(1, rows.length + chatTotal) * 200) : null;

  let attentionSeconds = 0;
  for (const record of records.watch_history) {
    const wp = record.watchProgress;
    if (!wp) continue;
    if (typeof wp.watchedSeconds === "number" && Number.isFinite(wp.watchedSeconds) && wp.watchedSeconds > 0) attentionSeconds += wp.watchedSeconds;
    else if (typeof wp.percent === "number" && Number.isFinite(wp.percent) && typeof record.durationSeconds === "number" && Number.isFinite(record.durationSeconds)) attentionSeconds += Math.max(0, wp.percent) / 100 * record.durationSeconds;
  }

  const durationsAll = rows.map(({ record }) => record.durationSeconds).filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0);
  const durationBands = [
    { label: "短", en: "< 1 min", test: (value: number) => value < 60 },
    { label: "中", en: "1–10 min", test: (value: number) => value >= 60 && value < 600 },
    { label: "长", en: "10–30 min", test: (value: number) => value >= 600 && value < 1800 },
    { label: "超长", en: "> 30 min", test: (value: number) => value >= 1800 },
  ].map(({ en, label, test }) => ({ label, en, share: durationsAll.length ? durationsAll.filter(test).length / durationsAll.length : null }));

  const chatSlots = chatDisplayTypes.map((def) => ({ id: def.id, label: def.label, en: def.label === "文字" ? "Text" : def.label === "图片" ? "Image" : def.label === "表情" ? "Sticker" : def.label === "分享" ? "Share" : "Call", slots: Array.from({ length: 12 }, () => 0) }));
  for (const message of friendChats) {
    if (!validDate(message.sentAt)) continue;
    const slotRow = chatSlots.find((slot) => slot.id === chatDisplayType(message.type));
    if (!slotRow) continue;
    const slot = Math.floor(new Date(message.sentAt!).getHours() / 2);
    slotRow.slots[slot] = (slotRow.slots[slot] ?? 0) + 1;
  }

  const replayIds = new Set(watchIds.filter((id, index) => watchIds.indexOf(id) !== index));
  const daily = new Map<string, { watch: number; chat: number; night: number; kept: number; depthSum: number; depthN: number; revisit: number }>();
  const dayOf = (value: string) => {
    let dayRow = daily.get(dateKey(value));
    if (!dayRow) {
      dayRow = { watch: 0, chat: 0, night: 0, kept: 0, depthSum: 0, depthN: 0, revisit: 0 };
      daily.set(dateKey(value), dayRow);
    }
    return dayRow;
  };
  for (const record of records.watch_history) {
    if (!validDate(record.occurredAt) || record.occurredAtSource === "unknown") continue;
    const dayRow = dayOf(record.occurredAt!);
    dayRow.watch += 1;
    const hour = new Date(record.occurredAt!).getHours();
    if (hour >= 20 || hour < 5) dayRow.night += 1;
    if (record.videoId && replayIds.has(record.videoId)) dayRow.revisit += 1;
    const pct = record.watchProgress?.percent;
    if (typeof pct === "number" && Number.isFinite(pct)) {
      dayRow.depthSum += pct;
      dayRow.depthN += 1;
    }
  }
  for (const record of [...records.liked_videos, ...records.favorite_videos]) if (validDate(record.occurredAt)) dayOf(record.occurredAt!).kept += 1;
  for (const message of friendChats) if (validDate(message.sentAt)) dayOf(message.sentAt!).chat += 1;
  const dayRows = [...daily.values()];
  const crossLabels = ["内容深度", "活跃频率", "对话节奏", "夜间探索", "回访深度"];
  const crossSeries: Array<Array<number | null>> = [
    dayRows.map((dayRow) => (dayRow.depthN ? dayRow.depthSum / dayRow.depthN : null)),
    dayRows.map((dayRow) => dayRow.watch + dayRow.kept + dayRow.chat),
    dayRows.map((dayRow) => dayRow.chat),
    dayRows.map((dayRow) => dayRow.night),
    dayRows.map((dayRow) => dayRow.revisit),
  ];
  const crossMatrix = crossLabels.map((_, a) => crossLabels.map((__, b) => (a === b ? 1 : pearson(crossSeries[a]!, crossSeries[b]!))));
  const crossPairs: Array<{ a: string; b: string; r: number }> = [];
  for (let a = 0; a < crossLabels.length; a += 1) {
    for (let b = a + 1; b < crossLabels.length; b += 1) {
      const r = crossMatrix[a]![b] ?? null;
      if (r !== null) crossPairs.push({ a: crossLabels[a]!, b: crossLabels[b]!, r });
    }
  }
  crossPairs.sort((left, right) => Math.abs(right.r) - Math.abs(left.r));
  const crossPatterns: Array<{ title: string; text: string }> = [];
  for (const pair of crossPairs) {
    if (crossPatterns.length >= 2 || Math.abs(pair.r) < 0.35) break;
    if (pair.r > 0) {
      crossPatterns.push(crossPatterns.length === 0
        ? { title: `${pair.a}与${pair.b}呈正相关`, text: `当${pair.b}上升时，${pair.a}也随之增强。` }
        : { title: `${pair.a}与${pair.b}同向变化`, text: `${pair.b}走高的日子，${pair.a}通常也更高。` });
    } else {
      crossPatterns.push({ title: `${pair.a}与${pair.b}呈负相关`, text: `当${pair.b}上升时，${pair.a}趋于回落。` });
    }
  }
  const weakest = crossPairs[crossPairs.length - 1];
  if (weakest && Math.abs(weakest.r) < 0.25 && crossPatterns.length < 3) crossPatterns.push({ title: `${weakest.a}与${weakest.b}相对独立`, text: `${weakest.a}的变化，未明显改变${weakest.b}的走向。` });
  while (crossPatterns.length < 3) crossPatterns.push({ title: "更多模式待观测", text: "随着样本天数积累，交叉模式会逐步显现。" });

  const creatorTotals = [...creatorCounts.values()].sort((left, right) => right - left);
  const creatorSum = creatorTotals.reduce((sum, value) => sum + value, 0);
  const creatorFocus = {
    concentration: creatorSum ? creatorTotals.slice(0, 3).reduce((sum, value) => sum + value, 0) / creatorSum * 100 : null,
    discovery: creatorTotals.length ? creatorTotals.filter((value) => value === 1).length / creatorTotals.length * 100 : null,
    tail: creatorTotals.slice(0, 24),
  };

  const watchDates = records.watch_history.map((record) => record.occurredAt);
  const chatDates = friendChats.map((message) => message.sentAt);
  const keptDates = [...records.liked_videos, ...records.favorite_videos].map((record) => record.occurredAt);
  const creatorDates = rows.filter(({ record }) => record.author?.trim()).map(({ record }) => record.occurredAt);
  const evidence: Model["evidence"] = {
    watch: evidenceRow(records.watch_history.length, watchDates, reliableRatio),
    chat: evidenceRow(chatTotal, chatDates, reliableRatio),
    kept: evidenceRow(records.liked_videos.length + records.favorite_videos.length, keptDates, reliableRatio),
    creators: evidenceRow(creatorData?.creatorCount ?? creatorCounts.size, creatorDates, reliableRatio),
  };

  const events = [
    ...records.watch_history.map((record) => ({ kind: "watch" as const, label: "短视频观看", at: record.occurredAt, url: record.url })),
    ...[...records.liked_videos, ...records.favorite_videos].map((record) => ({ kind: "kept" as const, label: "收藏与点赞", at: record.occurredAt, url: record.url })),
    ...friendChats.map((message) => ({ kind: "chat" as const, label: "聊天互动", at: message.sentAt, url: message.share?.url ?? null })),
  ].filter((event) => validDate(event.at)).sort((a, b) => time(b.at) - time(a.at)).slice(0, 8)
    .map(({ at, kind, label, url }) => ({ kind, label, url, time: new Date(at!).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }) }));

  const calendar = dayCounts.map((days) => {
    const cells = Array.from({ length: 14 }, (_, cell) => {
      const lo = Math.floor(cell * 31 / 14) + 1;
      const hi = Math.floor((cell + 1) * 31 / 14);
      let sum = 0;
      for (let day = lo; day <= hi; day += 1) sum += days[day] ?? 0;
      return sum;
    });
    const cellMax = Math.max(...cells);
    return cells.map((value) => value === 0 ? 0 : value >= cellMax * 0.66 ? 2 : 1);
  });

  const monthAvg = months.reduce((sum, value) => sum + value, 0) / 12;
  const seasons = ([["春季", [2, 3, 4]], ["夏季", [5, 6, 7]], ["秋季", [8, 9, 10]]] as Array<[string, number[]]>).map(([name, span3]) => {
    const sum = span3.reduce((total, month) => total + (months[month] ?? 0), 0);
    if (!sum) return { title: `${name}暂无观测`, sub: ["awaiting", "observation"] };
    const title = sum > monthAvg * 3 * 1.15 ? `${name}内容探索增强` : sum < monthAvg * 3 * 0.85 ? `${name}节奏放缓` : `${name}节奏平稳`;
    return { title, sub: ["pattern found", "observed"] };
  });
  const reliableTimes = reliable.map(({ record }) => time(record.occurredAt));
  const firstTime = reliableTimes.length ? Math.min(...reliableTimes) : null;
  const lastTime = reliableTimes.length ? Math.max(...reliableTimes) : null;
  const peakMonthValue = maxIndex(months);
  const peakHourValue = maxIndex(hours);
  const milestones: Model["milestones"] = [
    firstTime === null
      ? { title: "观察启动待定位", sub: "awaiting" }
      : { title: `${new Date(firstTime).getMonth() + 1}月观察启动`, sub: "observed" },
    peakMonthValue === null
      ? { title: "内容强度待观测", sub: "awaiting" }
      : { title: `${peakMonthValue + 1}月内容强度最高`, sub: "pattern found" },
    chatTotal > 0
      ? { title: `聊天互动 ${chatTotal.toLocaleString("en-US")} 条`, sub: "observed" }
      : { title: "互动频次待观测", sub: "awaiting" },
    topics.length
      ? { title: `探索 ${topics.length} 个主题`, sub: "pattern found" }
      : { title: "探索多样性待观测", sub: "awaiting" },
    creators.length
      ? { title: `关注 ${creators.length} 位创作者`, sub: "observed" }
      : { title: "创作者关注待观测", sub: "awaiting" },
    lastTime === null
      ? { title: "回顾时间待补充", sub: "awaiting" }
      : { title: `${new Date(lastTime).getFullYear()}年${new Date(lastTime).getMonth() + 1}月回顾`, sub: peakHourValue === null ? "pattern reviewed" : `${timePhrase(peakHourValue)} peak` },
  ];

  return {
    year: modelYear,
    period: annual?.periodLabel ?? (report && "currentWindow" in report ? report.currentWindow.label : "当前样本"),
    total: rows.length,
    unique: overview?.counts.total ?? unique,
    watch: records.watch_history.length,
    liked: records.liked_videos.length,
    favorite: records.favorite_videos.length,
    chat: chatTotal,
    chatGroups,
    chatGroupMessages,
    chatOwnGroupMessages,
    dated: reliable.length,
    activeDays: overview?.activeDays ?? activeDays,
    creatorsCount: creatorData?.creatorCount ?? creatorCounts.size,
    reliableRatio,
    status,
    warnings: coverage?.warnings ?? [],
    heatmap,
    hours,
    chatHours,
    months,
    topics,
    creators,
    formats,
    durations: interest?.durations.some((item) => item.count) ? rank(interest.durations.map((item) => ({ name: item.label, count: item.count }))) : durations,
    chatKinds,
    completion,
    replays: watchIds.length - new Set(watchIds).size,
    intersection,
    peakHour: rhythm?.mostActiveHour?.hour ?? maxIndex(hours),
    peakDay: rhythm?.mostActiveWeekday?.weekday ?? maxIndex(dayTotals),
    peakMonth: monthly?.peakMonth ? monthly.peakMonth.month - 1 : maxIndex(months),
    overlap: overlap(hours, chatHours),
    recent: rows.slice().sort((a, b) => time(b.record.occurredAt) - time(a.record.occurredAt)).slice(0, 5).map(({ record }) => ({ title: record.title || "未命名内容", author: record.author, time: record.occurredAt, url: record.url })),
    axes: [
      { label: "节奏", left: "偶发", right: "稳定", value: span ? Math.min(100, activeDays / span * 100) : null },
      { label: "注意力", left: "碎片", right: "深潜", value: completion },
      { label: "探索", left: "熟悉", right: "广域", value: exploration === null ? null : Math.min(100, exploration) },
      { label: "留存", left: "浏览", right: "珍藏", value: retention },
      { label: "互动", left: "独处", right: "表达", value: social },
    ],
    profile: profileName(exploration, completion),
    attentionSeconds,
    evidence,
    events,
    calendar,
    seasons,
    milestones,
    progressPercents: progress,
    durationBands,
    chatSlots,
    cross: { labels: crossLabels, matrix: crossMatrix, patterns: crossPatterns, days: dayRows.length },
    creatorFocus,
    surprises: deriveSurpriseInsights(records, chats, { chatConversations }),
  };
}

function pearson(a: Array<number | null>, b: Array<number | null>): number | null {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let index = 0; index < a.length; index += 1) {
    const x = a[index];
    const y = b[index];
    if (x !== null && x !== undefined && y !== null && y !== undefined) {
      xs.push(x);
      ys.push(y);
    }
  }
  if (xs.length < 6) return null;
  const mx = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const my = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let index = 0; index < xs.length; index += 1) {
    const dx = xs[index]! - mx;
    const dy = ys[index]! - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (!sxx || !syy) return null;
  return sxy / Math.sqrt(sxx * syy);
}

function evidenceRow(total: number, dates: Array<string | null | undefined>, reliableRatio: number): EvidenceRow {
  const valid = dates.filter((value) => validDate(value ?? null)).map((value) => new Date(value!));
  const monthsSeen = Array.from({ length: 12 }, () => false);
  for (const date of valid) monthsSeen[date.getMonth()] = true;
  let range: [string, string] | null = null;
  if (valid.length) {
    const times = valid.map((date) => date.getTime());
    range = [isoDay(new Date(Math.min(...times))), isoDay(new Date(Math.max(...times)))];
  }
  const dots = [1, 10, 50, 200, 1000].filter((threshold) => total >= threshold).length;
  const confidence = total === 0 ? 0 : reliableRatio >= 0.8 ? 4 : 3;
  const caveat = total === 0 ? ["awaiting"] : monthsSeen.every(Boolean) ? ["observed"] : ["observed", "partial"];
  return { count: total, dots, confidence, range, caveat, months: monthsSeen };
}

function isAnnual(report: AnnualReport | LivingReport | null): report is AnnualReport { return Boolean(report && "cards" in report); }
function initialPage(view: WorkspaceViewKey): number { return view === "chat" ? 8 : view === "highlights" ? 10 : view === "summary" ? 0 : 2; }
function year(): number { return new Date().getFullYear(); }
function displayYear(value: number | null | undefined): number { return value ?? year(); }
function inferYear(values: Array<string | null | undefined>): number | null {
  const years: number[] = [];
  for (const value of values) {
    if (!value) continue;
    const date = new Date(value);
    const parsedYear = date.getFullYear();
    if (Number.isFinite(date.getTime()) && parsedYear >= 1970 && parsedYear <= 2200) years.push(parsedYear);
  }
  return years.length ? years.sort((a, b) => b - a)[0]! : null;
}
function attentionLabel(seconds: number): string { if (seconds >= 3600) return `${Math.round(seconds / 3600)}h`; if (seconds > 0) return `${Math.max(1, Math.round(seconds / 60))}m`; return "—"; }
function isoDay(date: Date): string { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function validDate(value: string | null): boolean { return Boolean(value && Number.isFinite(new Date(value).getTime())); }
function time(value: string | null): number { const parsed = value ? new Date(value).getTime() : 0; return Number.isFinite(parsed) ? parsed : 0; }
function dateKey(value: string): string { const date = new Date(value); return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`; }
function count(values: string[]): Map<string, number> { const result = new Map<string, number>(); for (const raw of values) { const value = raw.trim(); if (value) result.set(value, (result.get(value) ?? 0) + 1); } return result; }
function rankMap(values: Map<string, number>): Ranked[] { return rank([...values].map(([name, count]) => ({ name, count }))); }
function rank(values: Array<{ name: string; count: number }>): Ranked[] { const total = values.reduce((sum, value) => sum + value.count, 0); return values.filter((value) => value.count > 0).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-CN")).slice(0, 10).map((value) => ({ ...value, share: total ? value.count / total : 0 })); }
function formatName(value: PersonalVideoRecord["mediaType"]): string { return ({ video: "视频", image: "图文", live: "直播", unknown: "未知" } as const)[value ?? "unknown"]; }
function durationName(value: number | null | undefined): string | null { if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null; if (value < 15) return "15 秒内"; if (value < 60) return "15–60 秒"; if (value < 300) return "1–5 分钟"; return "5 分钟以上"; }
function maxIndex(values: number[]): number | null { const max = Math.max(0, ...values); return max ? values.indexOf(max) : null; }
function overlap(left: number[], right: number[]): number | null { const union = left.filter((value, index) => value > 0 || (right[index] ?? 0) > 0).length; if (!union || !right.some((value) => value > 0)) return null; return left.filter((value, index) => value > 0 && (right[index] ?? 0) > 0).length / union * 100; }
function idSet(rows: PersonalVideoRecord[]): Set<string> { return new Set(rows.map((row) => row.videoId).filter((id): id is string => Boolean(id))); }
function common(left: Set<string>, right: Set<string>): number { return [...left].filter((id) => right.has(id)).length; }
function makeIntersection(records: PersonalRecordCollection): Model["intersection"] { const watch = idSet(records.watch_history); const liked = idSet(records.liked_videos); const favorite = idSet(records.favorite_videos); return { watchLiked: common(watch, liked), watchFavorite: common(watch, favorite), likedFavorite: common(liked, favorite), allThree: [...watch].filter((id) => liked.has(id) && favorite.has(id)).length }; }
function spanDays(values: string[]): number { if (!values.length) return 0; const times = values.map((value) => new Date(value).getTime()); return Math.max(1, Math.ceil((Math.max(...times) - Math.min(...times)) / 86_400_000) + 1); }
function percent(value: number): string { return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`; }
function timePhrase(hour: number): string { return hour < 6 ? "深夜" : hour < 11 ? "上午" : hour < 14 ? "中午" : hour < 18 ? "下午" : hour < 23 ? "夜晚" : "深夜"; }
function profileName(exploration: number | null, completion: number | null): string { if (exploration === null && completion === null) return "等待更多足迹"; if ((exploration ?? 0) >= 55 && (completion ?? 0) >= 60) return "探索者 · 深潜型"; if ((exploration ?? 0) >= 55) return "广域探索者"; if ((completion ?? 0) >= 60) return "稳定深潜者"; return "节奏观察者"; }


const serif = Platform.OS === "web" ? "Georgia, 'Songti SC', 'STSong', 'SimSun', serif" : undefined;

const styles = StyleSheet.create({
  sealIntroBackdrop: { backgroundColor: "#0A0A0B" },
  sealIntroGlow: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, shadowColor: "#C9A45F", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.55, shadowRadius: 46 },
  sealIntroHint: { position: "absolute", left: 0, right: 0, textAlign: "center", color: "#B9AE9C", fontSize: 12, letterSpacing: 4, fontFamily: "Songti SC, Noto Serif SC, Georgia, serif" },
  root: { flex: 1, minHeight: "100%", backgroundColor: "#0A0A0B", paddingHorizontal: 26, paddingTop: 16, paddingBottom: 24 },
  flex: { flex: 1, minWidth: 0 },
  webFitViewport: { flex: 1, minWidth: 0, overflow: "hidden" },
  stack: { flexDirection: "column" },
  lateScroll: { flexGrow: 1 },

  /* 舞台外壳 */
  stageHead: { flexDirection: "row", alignItems: "flex-end", gap: 12, paddingHorizontal: 2, paddingBottom: 12 },
  stageNo: { color: "#C5A161", fontSize: 30, lineHeight: 32, fontFamily: serif },
  stageTitle: { color: "#EDE4D2", fontSize: 24, lineHeight: 30, fontFamily: serif, letterSpacing: 2 },
  stageEn: { color: "#7E776A", fontSize: 11, letterSpacing: 2.4, paddingBottom: 5 },
  frame: { flex: 1, minHeight: 0, flexDirection: "row", borderWidth: 1, borderColor: "#3A3428", backgroundColor: "#0B0B0C" },
  strip: { width: 92, alignItems: "center", justifyContent: "space-between", paddingVertical: 24, borderRightWidth: 1, borderRightColor: "#26231C" },
  stripTop: { alignItems: "center", gap: 3 },
  stripYear: { color: "#D6C9AE", fontSize: 16, fontFamily: serif, letterSpacing: 2, marginBottom: 8 },
  stripDossier: { color: "#6F675B", fontSize: 6.5, letterSpacing: 1.6 },
  stripDash: { width: 14, height: 1, backgroundColor: "#4A4234", marginTop: 12 },
  stripWords: { alignItems: "center", gap: 14 },
  stripWord: { color: "#5E594E", fontSize: 9, letterSpacing: 0.6 },
  stageScroll: { flexGrow: 1, padding: 28 },
  nav: { position: "absolute", right: 34, bottom: 32, flexDirection: "row", alignItems: "center", gap: 8 },
  navCompact: { right: 8, bottom: 8, gap: 4 },
  navButton: { width: 30, height: 30, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#3A3428", backgroundColor: "rgba(10,10,11,0.82)" },
  navButtonCompact: { width: 24, height: 24 },
  navCount: { color: "#9A8B67", fontSize: 9, letterSpacing: 1.6, paddingHorizontal: 4 },
  navCountCompact: { fontSize: 8, letterSpacing: 1.1, paddingHorizontal: 2 },

  /* 01 入口 */
  openRoot: { flex: 1 },
  openCenter: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 8 },
  openSpark: { color: "#C5A161", fontSize: 15, marginBottom: 20, opacity: 0.9 },
  openTitle: { color: "#F0E7D5", fontSize: 44, lineHeight: 56, fontFamily: serif, letterSpacing: 8, textAlign: "center" },
  openYear: { color: "#D2B073", fontSize: 19, letterSpacing: 12, fontFamily: serif, marginTop: 12 },
  openSealRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 30 },
  openRule: { width: 54, height: 1, backgroundColor: "#453E30" },
  openSealLabel: { color: "#8F887B", fontSize: 8, letterSpacing: 2.6 },
  openBand: { alignSelf: "stretch", height: 252, alignItems: "center", justifyContent: "center", marginTop: 6 },
  sealWrap: { width: 196, height: 196, borderRadius: 98, alignItems: "center", justifyContent: "center", shadowColor: "#C5A161", shadowOpacity: 0.28, shadowRadius: 44, shadowOffset: { width: 0, height: 0 } },
  sealIcon: { position: "absolute" },
  plaque: { marginTop: 18, backgroundColor: "#E9E0CC", padding: 3, shadowColor: "#000000", shadowOpacity: 0.5, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  plaqueInner: { borderWidth: 1, borderColor: "#8A7B5E", paddingHorizontal: 44, paddingVertical: 12 },
  plaqueText: { color: "#262019", fontSize: 15, fontFamily: serif, letterSpacing: 7, fontWeight: "700" },
  plaqueNotch: { position: "absolute", width: 6, height: 6, backgroundColor: "#0B0B0C", transform: [{ rotate: "45deg" }] },
  notchTL: { left: -3, top: -3 },
  notchTR: { right: -3, top: -3 },
  notchBL: { left: -3, bottom: -3 },
  notchBR: { right: -3, bottom: -3 },

  /* 02 观测凭证 */
  evRoot: { flex: 1, padding: 26 },
  evPaper: { flex: 1, backgroundColor: "#E9E1CE", borderWidth: 1, borderColor: "#59503D", padding: 7 },
  evPaperInner: { flex: 1, borderWidth: 1, borderColor: "#8A7E66", paddingHorizontal: 30, paddingVertical: 20 },
  evCorner: { position: "absolute", width: 5, height: 5, backgroundColor: "#8A7E66" },
  evCornerTL: { left: -3, top: -3 },
  evCornerTR: { right: -3, top: -3 },
  evCornerBL: { left: -3, bottom: -3 },
  evCornerBR: { right: -3, bottom: -3 },
  evHeadRow: { flexDirection: "row", alignItems: "flex-end", paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#9C9077" },
  evHead: { color: "#8A7E68", fontSize: 8, letterSpacing: 1.6, fontWeight: "800" },
  evColSource: { flex: 1.45 },
  evColDots: { flex: 1 },
  evColConf: { flex: 1 },
  evColRange: { flex: 1.05 },
  evColCaveat: { flex: 0.8 },
  evColCoverage: { flex: 1.4, alignItems: "center" },
  evCoverageTitle: { color: "#8A7E68", fontSize: 8, letterSpacing: 1.6, fontWeight: "800" },
  evCoverageYear: { color: "#A6987C", fontSize: 7, letterSpacing: 1.4, marginTop: 3 },
  evLetterRow: { flexDirection: "row", gap: 9, marginTop: 6 },
  evLetter: { color: "#9C9077", fontSize: 7, width: 11, textAlign: "center" },
  evRow: { flex: 1, minHeight: 62, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#C9BEA7" },
  evSourceCell: { flexDirection: "row", alignItems: "center", gap: 13 },
  evBadge: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: "#26211A" },
  evSourceName: { color: "#26211A", fontSize: 15, fontFamily: serif, fontWeight: "600" },
  evCellCenter: { alignItems: "center", justifyContent: "center" },
  evDots: { flexDirection: "row", gap: 5 },
  evDot: { width: 9, height: 9, borderRadius: 5, borderWidth: 1, borderColor: "#A99C82" },
  evDotOn: { backgroundColor: "#2E6E6C", borderColor: "#2E6E6C" },
  evConf: { color: "#2E6E6C", fontSize: 12, letterSpacing: 3 },
  evConfOff: { color: "#A99C82" },
  evRange: { color: "#5C5344", fontSize: 9.5, lineHeight: 15 },
  evCaveat: { color: "#7C725F", fontSize: 9, lineHeight: 14 },
  evGrid: { width: 6 * 11 + 5 * 3, flexDirection: "row", flexWrap: "wrap", gap: 3 },
  evSquare: { width: 11, height: 11, backgroundColor: "#D6CBB2", borderWidth: 1, borderColor: "#BFB49B" },
  evSquareOn: { backgroundColor: "#5C89A2", borderColor: "#4F7A92" },
  evLegend: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 7, paddingTop: 14 },
  evLegendGap: { marginLeft: 14 },
  evLegendText: { color: "#7C725F", fontSize: 8, letterSpacing: 0.6 },

  /* 03 内容足迹 */
  fpRoot: { flex: 1, paddingHorizontal: 30, paddingVertical: 20 },
  fpStats: { flexDirection: "row", paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: "#26231C" },
  fpStatsMobile: { flexWrap: "wrap" },
  fpStat: { flex: 1, minWidth: 140, alignItems: "center", gap: 7, paddingVertical: 10 },
  fpStatDivider: { borderRightWidth: 1, borderRightColor: "#26231C" },
  fpStatLabel: { color: "#CFC5B0", fontSize: 12, letterSpacing: 2, marginTop: 3 },
  fpStatValue: { color: "#EDE4D2", fontSize: 38, lineHeight: 44, fontFamily: serif },
  fpStatSub: { color: "#6F675B", fontSize: 9, letterSpacing: 1 },
  fpBody: { flex: 1, flexDirection: "row", paddingTop: 18 },
  fpCol: { flex: 1, minWidth: 0, paddingHorizontal: 18 },
  fpColMid: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: "#26231C" },
  colHead: { flexDirection: "row", alignItems: "baseline", gap: 8, marginBottom: 14 },
  colHeadCn: { color: "#EDE4D2", fontSize: 15, fontFamily: serif, letterSpacing: 1 },
  colHeadEn: { color: "#6F675B", fontSize: 10, letterSpacing: 1 },
  fpWeekRow: { width: 241, flexDirection: "row", justifyContent: "space-between", paddingLeft: 34, marginBottom: 6 },
  fpWeekLetter: { color: "#6F675B", fontSize: 7, letterSpacing: 1 },
  fpCalRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  fpCalMonth: { width: 34, color: "#6B665C", fontSize: 7, letterSpacing: 1 },
  fpCalCells: { flexDirection: "row", gap: 3 },
  fpCell: { width: 12, height: 12, backgroundColor: "#17181A" },
  fpCellLow: { backgroundColor: "#274F4E" },
  fpCellHigh: { backgroundColor: "#3E7C79" },
  fpLegend: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 12 },
  fpLegendGap: { marginLeft: 14, backgroundColor: "#1B1D20" },
  fpLegendText: { color: "#6F675B", fontSize: 8 },
  fpEvents: { flex: 1, gap: 13 },
  fpEvent: { flexDirection: "row", alignItems: "center", gap: 12 },
  fpEventIcon: { width: 30, height: 30, alignItems: "center", justifyContent: "center", borderRadius: 15, borderWidth: 1, borderColor: "#4A4234" },
  fpEventTag: { color: "#6F675B", fontSize: 7, letterSpacing: 1 },
  fpEventName: { color: "#D8CFBD", fontSize: 12, marginTop: 2 },
  fpEventTime: { color: "#8F887B", fontSize: 11, letterSpacing: 1, fontVariant: ["tabular-nums"] },
  fpEmpty: { color: "#6F675B", fontSize: 11, lineHeight: 18 },
  triWrap: { flex: 1 },
  triCanvas: { flex: 1, minHeight: 200 },
  triSpark: { position: "absolute", color: "#C5A161", fontSize: 12 },
  triLabel: { position: "absolute", alignItems: "flex-start" },
  triName: { color: "#CFC5B0", fontSize: 10, letterSpacing: 1 },
  triValue: { color: "#EDE4D2", fontSize: 17, fontFamily: serif, marginTop: 2 },
  fpNote: { color: "#5E594E", fontSize: 8.5, marginTop: 10 },

  /* 04 时间轴 */
  tlRoot: { flex: 1, paddingHorizontal: 34, paddingVertical: 18 },
  tlTitleRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  tlRule: { flex: 1, height: 1, backgroundColor: "#332E24" },
  tlRuleShort: { width: 26, height: 1, backgroundColor: "#4A4234" },
  tlStar: { color: "#C5A161", fontSize: 9, opacity: 0.85 },
  tlYear: { color: "#EDE4D2", fontSize: 30, fontFamily: serif, letterSpacing: 6, paddingHorizontal: 6 },
  tlBand: { flexDirection: "row", marginTop: 20 },
  tlBandChart: { flex: 1, minHeight: 150 },
  tlBandLast: { height: 150 },
  bandLabel: { width: 86, paddingTop: 8 },
  bandCn: { color: "#CFC5B0", fontSize: 12, letterSpacing: 2 },
  bandEn: { color: "#6B665C", fontSize: 7, letterSpacing: 2, marginTop: 4 },
  tlMonthRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 2, marginBottom: 6 },
  tlMonth: { color: "#8F887B", fontSize: 8, letterSpacing: 1.2 },
  tlChart: { flex: 1, minHeight: 90 },
  tlAxis: { position: "absolute", left: -22, color: "#6B665C", fontSize: 8 },
  tlAxisHigh: { top: 4 },
  tlAxisLow: { bottom: 12 },
  tlEmptyChart: { position: "absolute", alignSelf: "center", top: "42%", color: "#6F675B", fontSize: 10, letterSpacing: 2 },
  tlMilestones: { flex: 1, flexDirection: "row", paddingTop: 10 },
  tlBaseline: { position: "absolute", left: 0, right: 0, top: 14, height: 1, backgroundColor: "#37312A" },
  tlMilestone: { flex: 1, alignItems: "center", paddingHorizontal: 4 },
  tlNode: { width: 9, height: 9, borderRadius: 5, borderWidth: 1, borderColor: "#A8894F", backgroundColor: "#0B0B0C" },
  tlMilestoneTitle: { color: "#D8CFBD", fontSize: 10.5, lineHeight: 15, textAlign: "center", marginTop: 14, maxWidth: 96 },
  tlMilestoneSub: { color: "#6B665C", fontSize: 8, marginTop: 5, letterSpacing: 0.4 },
  tlEmpty: { flex: 1, color: "#6F675B", fontSize: 10, letterSpacing: 2, textAlign: "center", paddingTop: 24 },
  tlPatterns: { flex: 1, flexDirection: "row", gap: 18 },
  tlPattern: { flex: 1, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#4A4132", backgroundColor: "#0E0E10", paddingVertical: 16, paddingHorizontal: 10 },
  tlPatternStar: { position: "absolute", top: -8, color: "#C5A161", fontSize: 10, backgroundColor: "#0A0A0B", paddingHorizontal: 6 },
  tlPatternTitle: { color: "#EDE4D2", fontSize: 13.5, fontFamily: serif, letterSpacing: 1, textAlign: "center" },
  tlPatternSub: { color: "#6B665C", fontSize: 8, marginTop: 5, letterSpacing: 0.4 },

  /* 05-12 观测图版共用 */
  lpPage: { flex: 1, minHeight: 620, flexDirection: "row" },
  lpPageCol: { flex: 1, minHeight: 620 },
  lpBorderRight: { borderRightWidth: 1, borderRightColor: "#26231C" },
  lpBorderTop: { borderTopWidth: 1, borderTopColor: "#26231C" },
  lpRail: { width: 176, borderRightWidth: 1, borderRightColor: "#26231C", paddingHorizontal: 20, paddingVertical: 22, justifyContent: "space-between" },
  lpRailMobile: { width: "100%", borderRightWidth: 0, borderBottomWidth: 1, borderBottomColor: "#26231C" },
  lpRailNo: { color: "#C5A161", fontSize: 34, lineHeight: 38, fontFamily: serif },
  lpRailYear: { color: "#8F887B", fontSize: 10, letterSpacing: 2, marginTop: 2 },
  lpRailSpark: { color: "#C5A161", fontSize: 11, marginTop: 14, opacity: 0.9 },
  lpRailTitle: { color: "#EDE4D2", fontSize: 24, lineHeight: 33, fontFamily: serif, letterSpacing: 3, marginTop: 24 },
  lpRailEn: { color: "#9A8B67", fontSize: 9, letterSpacing: 2.2, marginTop: 6 },
  lpRailDash: { width: 22, height: 1, backgroundColor: "#4A4234", marginTop: 16 },
  lpRailDesc: { color: "#7E776A", fontSize: 10, lineHeight: 18, marginTop: 14 },
  lpRailPattern: { color: "#6F675B", fontSize: 7.5, letterSpacing: 1.8 },
  lpRailObserved: { color: "#57524A", fontSize: 7.5, letterSpacing: 1, marginTop: 3 },
  lpRailRose: { marginTop: 10, opacity: 0.85 },
  lpFooter: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 14, borderTopWidth: 1, borderTopColor: "#26231C", paddingLeft: 20, paddingRight: 200, paddingVertical: 9 },
  lpFooterStar: { color: "#C5A161", fontSize: 16 },
  lpFooterLabel: { color: "#6F675B", fontSize: 6.5, letterSpacing: 1.6 },
  lpFooterText: { color: "#D8CFBD", fontSize: 10.5, lineHeight: 16, marginTop: 3 },
  lpFooterCell: { borderLeftWidth: 1, borderLeftColor: "#26231C", paddingLeft: 14, minWidth: 86 },
  lpFooterLast: { minWidth: 72 },
  lpFooterConf: { color: "#D6C9AE", fontSize: 11, letterSpacing: 1, marginTop: 4 },
  lpDots: { flexDirection: "row", gap: 4, marginTop: 6 },
  lpDot: { width: 5.5, height: 5.5, borderRadius: 3, borderWidth: 1, borderColor: "#4A4234" },
  lpDotOn: { backgroundColor: "#C5A161", borderColor: "#C5A161" },
  lpHead: { paddingHorizontal: 28, paddingTop: 18 },
  lpHeadTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  lpHeadPage: { color: "#9A8B67", fontSize: 9, letterSpacing: 2.2 },
  lpHeadRight: { alignItems: "flex-end" },
  lpHeadObserved: { color: "#6F675B", fontSize: 8, letterSpacing: 1.4 },
  lpHeadYear: { color: "#9A8B67", fontSize: 9, letterSpacing: 2, marginTop: 2 },
  lpHeadTitle: { color: "#EDE4D2", fontSize: 29, lineHeight: 37, fontFamily: serif, letterSpacing: 4, marginTop: 4 },
  lpHeadEn: { color: "#9A8B67", fontSize: 10, letterSpacing: 3, marginTop: 5 },
  lpHeadRule: { height: 1, backgroundColor: "#3A3428", marginTop: 13 },
  lpBlockTitle: { flexDirection: "row", alignItems: "baseline", gap: 8, marginBottom: 10 },
  lpBlockCn: { color: "#E4DAC6", fontSize: 13, fontFamily: serif, letterSpacing: 1 },
  lpBlockEn: { color: "#6F675B", fontSize: 8, letterSpacing: 1.6 },
  lpMuted: { color: "#6F675B", fontSize: 8, letterSpacing: 0.6 },
  lpAxisText: { color: "#69635A", fontSize: 7.5 },
  lpEmpty: { color: "#6F675B", fontSize: 10, letterSpacing: 1, paddingVertical: 16 },
  lpChartEmpty: { position: "absolute", alignSelf: "center", top: "44%", color: "#6F675B", fontSize: 9.5, letterSpacing: 2 },

  /* 05 你的节拍 */
  rhTop: { flex: 1.06, flexDirection: "row" },
  rhHeatBlock: { flex: 1, paddingHorizontal: 20, paddingVertical: 15 },
  rhHeatHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  rhLegend: { flexDirection: "row", alignItems: "center", gap: 4 },
  rhSwatch: { width: 14, height: 7 },
  rhHeatRow: { flex: 1, flexDirection: "row", alignItems: "stretch", marginBottom: 3 },
  rhWeek: { width: 26, color: "#817A70", fontSize: 8, alignSelf: "center" },
  rhCells: { flex: 1, flexDirection: "row", gap: 2 },
  rhCell: { flex: 1, minHeight: 13 },
  rhAxisRow: { flexDirection: "row", paddingLeft: 26, marginTop: 5 },
  rhAxisText: { flex: 1, color: "#69635A", fontSize: 7.5 },
  rhWindows: { width: 168, paddingHorizontal: 16, paddingVertical: 15 },
  rhWindow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  rhWindowDivider: { borderTopWidth: 1, borderTopColor: "#26231C" },
  rhWinIcon: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: "#4A4234", alignItems: "center", justifyContent: "center" },
  rhWinLabel: { color: "#D8CFBD", fontSize: 11.5, fontFamily: serif, letterSpacing: 1 },
  rhWinRange: { color: "#8F887B", fontSize: 9, marginTop: 3, fontVariant: ["tabular-nums"] },
  rhBottom: { flex: 0.94, flexDirection: "row", borderTopWidth: 1, borderTopColor: "#26231C" },
  rhChartBlock: { flex: 1, paddingHorizontal: 20, paddingVertical: 13 },
  rhWkHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  rhWkLegend: { flexDirection: "row", alignItems: "center", gap: 5 },
  rhLegendLine: { width: 16, height: 1.5, backgroundColor: "#6FB3AD" },
  rhLegendDashWrap: { flexDirection: "row", gap: 2, marginLeft: 8 },
  rhLegendDash: { width: 4, height: 1.5, backgroundColor: "#C9A05B" },
  rhChart: { flex: 1, minHeight: 84, marginTop: 6 },
  rhYLabel: { position: "absolute", left: 2, color: "#69635A", fontSize: 7.5 },
  rhYHigh: { top: "10%" },
  rhYMid: { top: "46%" },
  rhYLow: { bottom: "12%" },
  rhXAxis: { flexDirection: "row", justifyContent: "space-between", paddingLeft: 20, paddingRight: 6, marginTop: 4 },

  /* 06 你如何停留 */
  atBody: { flex: 1, flexDirection: "row" },
  atMain: { flex: 1, paddingHorizontal: 22, paddingVertical: 15 },
  atFunnelRow: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, marginTop: 2 },
  atStages: { width: 186, height: 470, justifyContent: "space-between", paddingVertical: 24 },
  atStage: { flexDirection: "row", alignItems: "center", gap: 8 },
  atStageIcon: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: "#3E5A5E", alignItems: "center", justifyContent: "center" },
  atStageIconGold: { borderColor: "#5A4930" },
  atStageLabel: { color: "#CFC5B0", fontSize: 10.5 },
  atStageValue: { color: "#D9B36C", fontSize: 12, fontFamily: serif, marginTop: 2 },
  atLead: { flex: 1, minWidth: 16, height: 1, borderTopWidth: 1, borderTopColor: "#3A4A50", borderStyle: "dashed", opacity: 0.7, marginHorizontal: 4 },
  atFunnelWrap: { alignItems: "center", justifyContent: "center" },
  atDone: { color: "#D9B36C", fontSize: 11, letterSpacing: 3, marginTop: 2 },
  atSpectrum: { width: 196, borderLeftWidth: 1, borderLeftColor: "#26231C", paddingHorizontal: 18, paddingVertical: 15 },
  atSpecBody: { flex: 1, flexDirection: "row", gap: 14, marginTop: 10 },
  atSpecLabels: { flex: 1, justifyContent: "space-between", paddingVertical: 4, maxHeight: 296 },
  atSpecRow: { flexDirection: "row", gap: 7, alignItems: "flex-start" },
  atSpecMark: { color: "#8FD0CB", fontSize: 8, marginTop: 3, opacity: 0 },
  atSpecMarkOn: { opacity: 1 },
  atSpecName: { fontSize: 12, fontFamily: serif, letterSpacing: 1 },
  atSpecDesc: { color: "#6F675B", fontSize: 8.5, lineHeight: 14, marginTop: 5 },

  /* 07 内容回声 */
  ceBody: { flex: 1, flexDirection: "row" },
  ceCol1: { flex: 1 },
  ceCol2: { flex: 1.22 },
  ceBlock: { paddingHorizontal: 18, paddingVertical: 13 },
  ceTopRow: { flexDirection: "row" },
  ceFormats: { flex: 1.12 },
  ceFormatRow: { flexDirection: "row", marginTop: 6 },
  ceFormatCell: { flex: 1, alignItems: "center", gap: 5 },
  ceFormatTile: { width: 38, height: 38, borderRadius: 9, borderWidth: 1, borderColor: "#3A3428", backgroundColor: "#121317", alignItems: "center", justifyContent: "center" },
  ceFormatName: { color: "#CFC5B0", fontSize: 10 },
  ceFormatValue: { color: "#D9B36C", fontSize: 11, fontFamily: serif },
  ceSegments: { flexDirection: "row", height: 8, marginTop: 14, gap: 2 },
  ceSegment: { height: 8 },
  ceSegmentEmpty: { flex: 1, backgroundColor: "#1E1F22" },
  ceDurRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  ceDurLabel: { width: 24, color: "#CFC5B0", fontSize: 10 },
  ceDurEn: { width: 52, color: "#6F675B", fontSize: 7.5 },
  ceDurTrack: { flex: 1, height: 4.5, backgroundColor: "#1E1F22", borderRadius: 3, overflow: "hidden" },
  ceDurFill: { height: 4.5, borderRadius: 3 },
  ceDurValue: { width: 34, color: "#9A948A", fontSize: 9, textAlign: "right" },
  ceRankList: { flex: 1, maxHeight: 350, justifyContent: "space-evenly" },
  ceRankRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  ceRankNo: { width: 18, color: "#C5A161", fontSize: 13, fontFamily: serif },
  ceRankName: { width: 58, color: "#D8CFBD", fontSize: 11.5 },
  ceRankTrack: { flex: 1, height: 7, backgroundColor: "#1E1F22", borderRadius: 4, overflow: "hidden" },
  ceRankFill: { height: 7, borderRadius: 4 },
  ceRankValue: { width: 38, color: "#9A948A", fontSize: 9, textAlign: "right" },
  ceNote: { color: "#5E594E", fontSize: 8.5, marginTop: "auto", paddingTop: 12 },
  ceConstWrap: { flex: 1, minHeight: 200, alignItems: "center", justifyContent: "center" },
  ceVennWrap: { height: 214, alignItems: "center", justifyContent: "flex-start", alignSelf: "center", width: 273 },
  ceVennTag: { position: "absolute", alignItems: "center" },
  ceVennLabel: { color: "#CFC5B0", fontSize: 9, marginTop: 3 },
  ceVennCount: { color: "#E7C687", fontSize: 8, fontVariant: ["tabular-nums"] },
  ceVennCenter: { position: "absolute", alignItems: "center", justifyContent: "center", width: 26, height: 20 },

  /* 08 创作者宇宙 */
  cuBody: { flex: 1, flexDirection: "row" },
  cuMap: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 8 },
  cuMapWrap: { width: 520, height: 500 },
  cuLabel: { position: "absolute", color: "#D8D2C4", fontSize: 10.5, letterSpacing: 0.5, maxWidth: 120 },
  cuPerson: { position: "absolute", width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: "#3E4A4E", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(10,12,13,0.6)" },
  cuRail: { width: 212, borderLeftWidth: 1, borderLeftColor: "#26231C" },
  cuBlock: { paddingHorizontal: 16, paddingVertical: 13 },
  cuDonutWrap: { alignSelf: "center", alignItems: "center", justifyContent: "center", marginTop: 4 },
  cuDonutValue: { position: "absolute", color: "#EDE4D2", fontSize: 15, fontFamily: serif },
  cuHint: { color: "#6F675B", fontSize: 8, marginTop: 8, textAlign: "center" },
  cuGaugeWrap: { alignSelf: "center", alignItems: "center", marginTop: 4 },
  cuGaugeValues: { flexDirection: "row", alignItems: "baseline", gap: 5, marginTop: 2 },
  cuGaugeTeal: { color: "#7FB0AC", fontSize: 13, fontFamily: serif },
  cuGaugeSep: { color: "#6F675B", fontSize: 10 },
  cuGaugeGold: { color: "#D9B36C", fontSize: 13, fontFamily: serif },
  cuLegendRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, marginTop: 8 },
  cuLegendSpark: { color: "#6FB3AD", fontSize: 9 },
  cuLegendDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#C9A05B", marginLeft: 10 },
  cuTailWrap: { flex: 1, minHeight: 66, maxHeight: 120, marginTop: 6, alignSelf: "stretch" },
  cuTailY: { position: "absolute", left: 0, top: -2, color: "#57524A", fontSize: 7 },
  cuTailX: { position: "absolute", right: 2, bottom: -2, color: "#57524A", fontSize: 7 },

  /* 09 聊天回声 */
  chBody: { flex: 1, paddingHorizontal: 28, paddingVertical: 15 },
  chWaveRow: { flexDirection: "row", gap: 10 },
  chWaveAxis: { width: 38, justifyContent: "space-between", paddingVertical: 6 },
  chAxisSmall: { color: "#57524A", fontSize: 7, letterSpacing: 0.5 },
  chWave: { height: 148 },
  chTimeRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  chBottom: { flex: 1, flexDirection: "row", borderTopWidth: 1, borderTopColor: "#26231C", marginTop: 14, paddingTop: 12 },
  chTypes: { flex: 1.45, paddingRight: 18 },
  chTypeRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, borderBottomWidth: 1, borderBottomColor: "#1C1B18", minHeight: 28 },
  chTypeCn: { width: 28, color: "#CFC5B0", fontSize: 10 },
  chTypeEn: { width: 38, color: "#57524A", fontSize: 7 },
  chDotLine: { flex: 1, flexDirection: "row", alignItems: "center" },
  chDotSlot: { flex: 1, alignItems: "center" },
  chWindows: { width: 248, paddingLeft: 18 },
  chRing: { alignSelf: "center", marginTop: 2, alignItems: "center", justifyContent: "center" },
  chRingMoon: { position: "absolute" },
  chRingLegend: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 8 },
  chLegendDot: { width: 7, height: 7, borderRadius: 4, marginLeft: 8 },
  chPrivacy: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: "#E7DFC9", borderWidth: 1, borderColor: "#59503D", paddingLeft: 16, paddingRight: 150, paddingVertical: 11, marginTop: 14 },
  chLockRing: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: "#8A7E66", alignItems: "center", justifyContent: "center" },
  chPrivacyCn: { color: "#3A342A", fontSize: 10.5, lineHeight: 16 },
  chPrivacyEn: { color: "#7C725F", fontSize: 8, marginTop: 3, letterSpacing: 0.4 },
  chPrivacyRule: { width: 56, height: 1, backgroundColor: "#B4A88D" },

  /* 10 交叉洞察 */
  cxRow: { flex: 1, flexDirection: "row", gap: 14, marginTop: 2 },
  cxBox: { flex: 1, borderWidth: 1, borderColor: "#3A3428", paddingHorizontal: 16, paddingVertical: 13 },
  cxPatterns: { flex: 1.25 },
  cxColHeadRow: { flexDirection: "row", marginTop: 4, marginBottom: 6 },
  cxRowLabelSpace: { width: 64 },
  cxColLabel: { width: 34, alignItems: "center", marginRight: 5 },
  cxColChar: { color: "#7E776A", fontSize: 8, lineHeight: 10 },
  cxMatrixRow: { flexDirection: "row", alignItems: "center", marginBottom: 5 },
  cxRowLabel: { width: 64, color: "#9A948A", fontSize: 9 },
  cxCell: { width: 34, height: 34, marginRight: 5, backgroundColor: "#17181B", borderWidth: 1, borderColor: "#26261F" },
  cxCellDiag: { backgroundColor: "#101114" },
  cxCellPos: { backgroundColor: "#6E5B36" },
  cxCellPosHot: { backgroundColor: "#96794A" },
  cxCellNeg: { backgroundColor: "#2E5058" },
  cxCellNegHot: { backgroundColor: "#3E6C77" },
  cxCellWeak: { backgroundColor: "#2B2C2E" },
  cxLegend: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 18 },
  cxLegendSwatch: { width: 9, height: 9, marginLeft: 8 },
  cxCard: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#E7DFC9", borderWidth: 1, borderColor: "#59503D", paddingHorizontal: 14, paddingVertical: 9, marginTop: 10 },
  cxCardRose: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: "#8A7E66", alignItems: "center", justifyContent: "center" },
  cxCardTitle: { color: "#26221D", fontSize: 13, fontFamily: serif },
  cxCardText: { color: "#6F675B", fontSize: 9, lineHeight: 14, marginTop: 4 },
  cxCardNo: { alignItems: "flex-end" },
  cxCardNoLabel: { color: "#8A7E66", fontSize: 6.5, letterSpacing: 1.4 },
  cxCardNoText: { color: "#8A7442", fontSize: 15, fontFamily: serif, marginTop: 2 },
  cxFacts: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#26231C", marginTop: 14, paddingTop: 12, gap: 16 },
  cxFact: { flex: 1, flexDirection: "row", gap: 9, alignItems: "flex-start" },
  cxFactMid: { borderLeftWidth: 1, borderLeftColor: "#26231C", borderRightWidth: 1, borderRightColor: "#26231C", paddingHorizontal: 16 },
  cxFactSpark: { color: "#C5A161", fontSize: 13 },
  cxFactLabel: { color: "#6F675B", fontSize: 7, letterSpacing: 1.2 },
  cxFactValue: { color: "#CFC5B0", fontSize: 9.5, lineHeight: 14, marginTop: 4 },
  cxFactEn: { color: "#57524A", fontSize: 7.5, marginTop: 2 },

  /* 11 意外发现 */
  spRow: { flex: 1, flexDirection: "row", gap: 12, marginTop: 2 },
  spCard: { flex: 1, backgroundColor: "#C3B49E", borderWidth: 1, borderColor: "#59503D", paddingHorizontal: 14, paddingVertical: 16, alignItems: "center" },
  spBadge: { width: 26, height: 26, borderRadius: 13, backgroundColor: "#46565A", borderWidth: 1, borderColor: "#8A7442", alignItems: "center", justifyContent: "center" },
  spBadgeText: { color: "#D9BC7F", fontSize: 9, fontWeight: "800" },
  spTitle: { color: "#25211C", fontSize: 16, fontFamily: serif, letterSpacing: 1, marginTop: 12, textAlign: "center" },
  spArt: { flex: 1, alignSelf: "stretch", alignItems: "center", justifyContent: "center", marginTop: 8 },
  spArtImg: { width: "100%", height: "100%" },
  spSealImg: { width: 200, height: 203 },
  spObsRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, alignSelf: "stretch" },
  spObsRule: { flex: 1, height: 1, backgroundColor: "#8F8168" },
  spObsLabel: { color: "#5E5340", fontSize: 7.5, letterSpacing: 2 },
  spText: { color: "#3E382E", fontSize: 9.5, lineHeight: 16, textAlign: "center", marginTop: 10 },
  spCardSpark: { color: "#8A6E35", fontSize: 11, marginTop: 12 },
  spSealCard: { justifyContent: "center", gap: 12, backgroundColor: "#090C0D", borderColor: "#2E2B26" },
  spSealTitle: { color: "#D8CFBD", fontSize: 12, fontFamily: serif, textAlign: "center", lineHeight: 19 },
  spSealText: { color: "#8F887B", fontSize: 9.5, textAlign: "center" },
  spSealSpark: { color: "#C9A05B", fontSize: 11, textAlign: "center" },
  spFoot: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#CBB99E", borderWidth: 1, borderColor: "#59503D", marginTop: 14, paddingVertical: 10, paddingLeft: 14, paddingRight: 150 },
  spFootText: { color: "#3A342A", fontSize: 9.5 },
  spFootEn: { color: "#7C725F", fontSize: 8 },
  spFootRight: { color: "#4A4030", fontSize: 9.5, letterSpacing: 1 },

  /* 12 习惯印章 */
  hpBody: { flex: 1, flexDirection: "row", marginTop: 2 },
  hpEmblemCol: { width: 286, alignItems: "center", justifyContent: "center", paddingVertical: 14 },
  hpEmblemWrap: { width: 258, height: 312 },
  hpEmblemImg: { width: "100%", height: "100%" },
  hpEmblemCn: { position: "absolute", top: 239, left: 0, right: 0, textAlign: "center", color: "#E2D9C2", fontSize: 19, fontFamily: serif, letterSpacing: 2 },
  hpEmblemEn: { position: "absolute", top: 270, left: 0, right: 0, textAlign: "center", color: "#C9BFA5", fontSize: 11, fontFamily: serif, letterSpacing: 1 },
  hpSummary: { flex: 1, paddingHorizontal: 24, paddingVertical: 14 },
  hpLine: { flex: 1, flexDirection: "row", alignItems: "center", gap: 13 },
  hpLineDivider: { borderBottomWidth: 1, borderBottomColor: "#1F1D18" },
  hpLineIcon: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: "#4A4234", alignItems: "center", justifyContent: "center" },
  hpLineTitle: { color: "#E4DAC6", fontSize: 13.5, fontFamily: serif, letterSpacing: 1 },
  hpLineText: { color: "#8F887B", fontSize: 9.5, lineHeight: 15, marginTop: 4 },
  hpRadarCol: { width: 336, borderLeftWidth: 1, borderLeftColor: "#26231C", paddingHorizontal: 14, paddingVertical: 14 },
  hpRadarColMobile: { width: "100%", borderLeftWidth: 0 },
  hpRadarWrap: { width: 300, height: 248, alignSelf: "center", marginTop: "auto", marginBottom: "auto" },
  hpRadarSvg: { position: "absolute", left: 20, top: 0 },
  hpRadarLabel: { position: "absolute" },
  hpRadarCn: { color: "#CFC5B0", fontSize: 9.5 },
  hpRadarEn: { color: "#57524A", fontSize: 6.5, marginTop: 2 },
  hpFacts: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#26231C", paddingVertical: 12, paddingLeft: 24, paddingRight: 150, gap: 18, alignItems: "flex-start" },
  hpFact: { flex: 1 },
  hpFactMid: { flex: 1.2, borderLeftWidth: 1, borderLeftColor: "#26231C", borderRightWidth: 1, borderRightColor: "#26231C", paddingHorizontal: 18 },
  hpLimitRow: { flexDirection: "row", gap: 8, marginTop: 6, alignItems: "flex-start" },
  hpButtons: { flexDirection: "row", gap: 10, marginTop: 8 },
  hpSaveBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#24403E", borderWidth: 1, borderColor: "#4E6E6A", paddingHorizontal: 14, paddingVertical: 7 },
  hpSaveText: { color: "#D7E4E0", fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  hpSaveEn: { color: "#7FA39E", fontSize: 6.5, letterSpacing: 1, marginTop: 2 },
  hpReBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#E7DFC9", borderWidth: 1, borderColor: "#59503D", paddingHorizontal: 14, paddingVertical: 7 },
  hpReText: { color: "#3A342A", fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  hpReEn: { color: "#8A7E66", fontSize: 6.5, letterSpacing: 1, marginTop: 2 },

    pressed: { opacity: 0.7, transform: [{ translateY: 1 }] },
  disabled: { opacity: 0.32 },
});
