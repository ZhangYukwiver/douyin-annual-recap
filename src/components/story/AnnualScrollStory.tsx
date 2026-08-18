import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  ImageBackground,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import {
  ArrowRight,
  Bookmark,
  Clock3,
  Heart,
  History,
  LayoutDashboard,
  Play,
  Sparkles,
  Star,
  Users,
  X,
} from "lucide-react-native";
import Svg, {
  ClipPath,
  Defs,
  FeGaussianBlur,
  Filter,
  G,
  Mask,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";

import type {
  AnnualContentRef,
  AnnualHighlightsData,
  AnnualKeptData,
  AnnualOverviewData,
  AnnualReport,
} from "../../domain/annualReport";
import type {
  PersonalRecordCollection,
  PersonalRecordType,
} from "../../domain/personalRecords";
import { workspaceColors as color, workspaceRadii as radius } from "../workspace/workspaceTheme";
import {
  buildStoryModel,
  type StoryContentItem,
  type StoryHour,
  type StoryModel,
  type StoryOverlap,
  type StoryOverlapKey,
  type StoryStream as StoryStreamData,
  type StoryTopic,
} from "./storyModel";
import {
  consumeFixedSteps,
  FIXED_STEP_MS,
  insetCollisionBox,
  openingPileDestinationStep,
  OpeningParticlePhysics,
  planOpeningDestinations,
} from "./openingParticlePhysics";

const MIN_STORY_WIDTH = 1024;
const CHAPTER_COUNT = 6;
const OPENING_STEP_COUNT = 12;
const OPENING_TAG_LIMIT = 24;
const OPENING_TITLE_LIMIT = 120;
const OPENING_CREATOR_LIMIT = 48;
const OPENING_PARTICLE_SCALE = 1.12;
const OPENING_COLLISION_SETTLE_FRAMES = 42;
// 词条逐个从底边进入，整堆共享同一段连续上推动画。
const OPENING_TOTAL_DURATION = 4_300;
const OPENING_WORD_FADE_SLOTS = 3;
const OPENING_SETTLE_FORCE = 0.000_16;
const OPENING_GRAVITY = 0.7;
const OPENING_TRAVEL_FRICTION = 0.055;
const OPENING_DECELERATION_FRICTION = 0.22;
const OPENING_SETTLE_TIMEOUT = 900;
const OPENING_REST_EPSILON = 0.06;
const OPENING_DRIFT_DURATION = 16_000;
const OPENING_FADE_DELAY = 500;
const OPENING_FADE_DURATION = 900;
const NOTE_WIDTH = 220;
const NOTE_HEIGHT = 240;
const NOTE_VIEWBOX_WIDTH = 220;
const NOTE_VIEWBOX_HEIGHT = 240;
const NOTE_PATH = "M121 18H158C159 43 177 64 204 70V105C187 103 171 98 158 89V170C158 203 131 228 98 228C65 228 38 204 38 173C38 142 63 117 95 117C104 117 113 119 121 123V160C114 155 106 152 98 152C84 152 73 162 73 175C73 188 84 198 98 198C112 198 124 188 124 174L121 18Z";
const LIQUID_PATH = "M-120 10C-100 -2 -80 -2 -60 10S-20 22 0 10S40 -2 60 10S100 22 120 10S160 -2 180 10S220 22 240 10S280 -2 300 10S340 22 360 10L360 260L-120 260Z";
const NOTE_WORD_MASK_URI = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${NOTE_VIEWBOX_WIDTH} ${NOTE_VIEWBOX_HEIGHT}"><path fill="white" d="${NOTE_PATH}"/></svg>`)}")`;
const OPENING_MESSAGE_LINES = ["你的内容世界", "已经有了形状"] as const;
const GLOW_CANVAS = 520;
const RING_POINTS = 132;
const RING_GAP = 9;
const RING_MIN_GAP = 4;
const RING_FOLLOW = 0.11;
const RING_WAVES = [
  { k: 3, amp: 2.6, speed: 0.85, phase: 0 },
  { k: 5, amp: 1.7, speed: -1.35, phase: 1.7 },
  { k: 8, amp: 0.9, speed: 2.1, phase: 3.2 },
];
const RING_BREATH = 1.4;
const RING_CREST_GAIN = 5.5;
const RING_CREST_SPREAD = 0.5;
const RING_CREST_RADIUS = 235;
const RING_CHROMA = { x: 3.6, y: -2.5 };
const RING_CORE_WIDTH = 2.4;
const RING_EDGE_WIDTH = 5.6;
const RING_BLOOM_WIDTH = 16;
const RING_BLOOM_BLUR = 9;
const RING_CORE_BLUR = 3;
const AnimatedSvgGroup = Animated.createAnimatedComponent(G);
const ABSOLUTE_FILL: ViewStyle = { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 };
const OPENING_COVER_LAYOUTS: readonly ViewStyle[] = [
  { left: "-6%", top: "-10%", width: "28%", height: "38%", transform: [{ rotate: "-5deg" }] },
  { left: "17%", top: "-8%", width: "25%", height: "34%", transform: [{ rotate: "3deg" }] },
  { left: "38%", top: "-13%", width: "30%", height: "41%", transform: [{ rotate: "-2deg" }] },
  { left: "65%", top: "-7%", width: "20%", height: "33%", transform: [{ rotate: "5deg" }] },
  { left: "81%", top: "-11%", width: "25%", height: "40%", transform: [{ rotate: "-4deg" }] },
  { left: "-8%", top: "21%", width: "29%", height: "39%", transform: [{ rotate: "4deg" }] },
  { left: "17%", top: "24%", width: "21%", height: "34%", transform: [{ rotate: "-3deg" }] },
  { left: "34%", top: "20%", width: "29%", height: "43%", transform: [{ rotate: "5deg" }] },
  { left: "59%", top: "23%", width: "25%", height: "36%", transform: [{ rotate: "-5deg" }] },
  { left: "80%", top: "21%", width: "27%", height: "42%", transform: [{ rotate: "3deg" }] },
  { left: "-5%", top: "51%", width: "22%", height: "39%", transform: [{ rotate: "-4deg" }] },
  { left: "12%", top: "49%", width: "30%", height: "40%", transform: [{ rotate: "5deg" }] },
  { left: "39%", top: "53%", width: "21%", height: "39%", transform: [{ rotate: "-3deg" }] },
  { left: "56%", top: "50%", width: "29%", height: "38%", transform: [{ rotate: "4deg" }] },
  { left: "80%", top: "51%", width: "25%", height: "40%", transform: [{ rotate: "-5deg" }] },
  { left: "-6%", top: "80%", width: "29%", height: "32%", transform: [{ rotate: "3deg" }] },
  { left: "19%", top: "78%", width: "25%", height: "34%", transform: [{ rotate: "-4deg" }] },
  { left: "41%", top: "81%", width: "30%", height: "32%", transform: [{ rotate: "5deg" }] },
  { left: "68%", top: "78%", width: "21%", height: "35%", transform: [{ rotate: "-3deg" }] },
  { left: "85%", top: "80%", width: "22%", height: "34%", transform: [{ rotate: "4deg" }] },
];
const WEB_POINTER = Platform.OS === "web" ? ({ cursor: "pointer" } as object) : null;
const LIST_LABELS: Record<PersonalRecordType, string> = {
  watch_history: "观看历史",
  liked_videos: "喜欢列表",
  favorite_videos: "收藏列表",
};
const OVERLAP_LABELS: Record<StoryOverlapKey, string> = {
  watchLiked: "观看 ∩ 喜欢",
  watchFavorite: "观看 ∩ 收藏",
  likedFavorite: "喜欢 ∩ 收藏",
  allThree: "三类列表都有",
};

export interface NarrativeCopyProvider {
  hourStory: (hour: StoryHour) => string;
  topicStory: (topic: StoryTopic) => string;
}

export interface AnnualScrollStoryProps {
  report: AnnualReport | null;
  records: PersonalRecordCollection;
  sourceLabel: string;
  privacy: boolean;
  onEnterDashboard: () => void;
  copyProvider?: NarrativeCopyProvider;
}

interface StoryDetail {
  title: string;
  author: string;
  occurredAt: string | null;
  durationSeconds: number | null;
  lists: PersonalRecordType[];
  topics: string[];
  music: string | null;
}

interface OpeningParticle {
  key: string;
  kind: "tag" | "title" | "creator";
  label: string;
  count?: number;
  /** 水位层（自下而上 1..OPENING_STEP_COUNT），决定落点所在的那一层。 */
  revealStep: number;
  /** 全局释放次序，词条逐个入场而不是整层一起出现。 */
  revealOrder: number;
  /** 淡入窗口，与 openingReveal（0..1）同一把尺子。 */
  revealFrom: number;
  revealTo: number;
}

interface OpeningParticleLayout {
  x: number;
  y: number;
  width: number;
  fontSize: number;
  rotation: number;
  textAlign: "left" | "center" | "right";
}

interface OpeningParticleMotion {
  x: Animated.Value;
  y: Animated.Value;
}

const localCopyProvider: NarrativeCopyProvider = {
  hourStory: (hour) => {
    if (hour.count === 0) return "这个小时没有可靠行为时间记录，不生成具体结论。";
    if (hour.topTopic && /童年|怀旧/u.test(hour.topTopic)) return `${padHour(hour.hour)} 是你遇见 #${hour.topTopic} 最多的时刻。找到你的童年了吗？`;
    return hour.topTopic
      ? `${padHour(hour.hour)} 的可靠记录里，#${hour.topTopic} 出现得最多。`
      : `${padHour(hour.hour)} 有 ${hour.count} 条可靠记录，显式标签仍不足。`;
  },
  topicStory: (topic) => topic.records[0]
    ? `#${topic.name} 关联 ${topic.count} 条内容，代表内容来自 ${topic.records[0].record.author ?? "未知创作者"}。`
    : `#${topic.name} 有明确计数，但当前样本没有可展示的代表内容。`,
};

const highlightDefinitions: Array<{
  key: keyof AnnualHighlightsData;
  label: string;
  rule: string;
  accent: string;
}> = [
  { key: "first", label: "首条记录", rule: "按可靠行为时间排序", accent: color.cyan },
  { key: "last", label: "末条记录", rule: "按可靠行为时间排序", accent: color.green },
  { key: "peakDay", label: "峰值日代表", rule: "活跃峰值日中的代表内容", accent: color.accent },
  { key: "longest", label: "最长内容", rule: "按可用时长字段排序", accent: color.amber },
  { key: "mostEngaged", label: "互动快照最高", rule: "按平台互动统计快照合计", accent: color.cyan },
];

export function AnnualScrollStory({
  report,
  records,
  sourceLabel,
  privacy,
  onEnterDashboard,
  copyProvider = localCopyProvider,
}: AnnualScrollStoryProps) {
  const { width, height } = useWindowDimensions();
  const compact = width < 1180;
  const sceneHeight = Math.max(650, height - 68);
  const model = useMemo(() => buildStoryModel(records), [records]);
  const storyContent = useMemo(() => collectStoryContent(model), [model]);
  const openingContent = useMemo(() => collectOpeningContent(model), [model]);
  const openingCovers = useMemo(() => buildOpeningCovers(openingContent), [openingContent]);
  const openingParticles = useMemo(
    () => buildOpeningParticles(model, openingContent, privacy),
    [model, openingContent, privacy],
  );
  const overview = report?.overview.data as AnnualOverviewData | undefined;
  const highlights = report?.highlights.data as AnnualHighlightsData | undefined;
  const kept = report?.kept.data as AnnualKeptData | undefined;
  const overlapsAvailable = Boolean(kept && kept.comparableVideoCount > 0);
  const [activeChapter, setActiveChapter] = useState(1);
  const [selectedHour, setSelectedHour] = useState(() => {
    const rhythm = report?.rhythm.data as { mostActiveHour?: { hour: number } | null } | undefined;
    return rhythm?.mostActiveHour?.hour ?? model.hours.find((hour) => hour.count > 0)?.hour ?? 0;
  });
  const [selectedTopic, setSelectedTopic] = useState(model.topics[0]?.name ?? null);
  const [selectedOverlap, setSelectedOverlap] = useState<StoryOverlapKey>("allThree");
  const [detail, setDetail] = useState<StoryDetail | null>(null);
  const [openingStep, setOpeningStep] = useState(0);
  const [openingForegroundHidden, setOpeningForegroundHidden] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => (
    Platform.OS === "web"
    && typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ));
  const openingStepRef = useRef(0);
  const openingSequenceStarted = useRef(false);
  const openingParticlePoses = useRef(new Map<string, { x: number; y: number }>());
  const openingPhysics = useRef<OpeningParticlePhysics | null>(null);
  const openingSequenceFrame = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
  const openingForegroundFade = useRef<Animated.CompositeAnimation | null>(null);
  const openingReveal = useRef(new Animated.Value(0)).current;
  const openingForegroundOpacity = useRef(new Animated.Value(1)).current;
  const openingDrift = useRef(new Animated.Value(0)).current;
  const storyProgress = useRef(new Animated.Value(0)).current;
  const liquidWave = useRef(new Animated.Value(0)).current;
  const hourRotation = useRef(new Animated.Value(selectedHour)).current;
  const rootRef = useRef<View | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);
  const sectionOffsets = useRef<number[]>([]);

  const selectedHourData = model.hours[selectedHour] ?? model.hours[0]!;
  const selectedTopicData = model.topics.find((topic) => topic.name === selectedTopic) ?? model.topics[0] ?? null;
  const selectedTopicIndex = selectedTopicData ? model.topics.findIndex((topic) => topic.name === selectedTopicData.name) : -1;
  const selectedOverlapData = model.overlaps[selectedOverlap];
  const stickyStyle = Platform.OS === "web" && !reducedMotion
    ? ({ position: "sticky", top: 0 } as unknown as ViewStyle)
    : null;
  const particleLayouts = useMemo(
    () => storyParticleLayouts(openingParticles, width, sceneHeight),
    [openingParticles, sceneHeight, width],
  );
  const particleMotions = useMemo(
    () => new Map<string, OpeningParticleMotion>(openingParticles.map((item) => [item.key, {
      x: new Animated.Value(0),
      y: new Animated.Value(0),
    }])),
    [openingParticles],
  );
  const openingProgress = Math.round((openingStep / OPENING_STEP_COUNT) * 100);
  const progressWidth = storyProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
    extrapolate: "clamp",
  });
  // Logo 液面和整堆词条共用 openingReveal（0..1），两边没有第二套计时器。
  const liquidTransform = openingReveal.interpolate({
    inputRange: [0, 1],
    outputRange: [`translate(0 ${NOTE_VIEWBOX_HEIGHT})`, "translate(0 -12)"],
    extrapolate: "clamp",
  });
  const waveTransform = liquidWave.interpolate({
    inputRange: [0, 1],
    outputRange: ["translate(0 0)", "translate(-120 0)"],
  });
  const noteLeft = width / 2 - NOTE_WIDTH / 2;
  const noteTop = sceneHeight / 2 - NOTE_HEIGHT / 2;
  const openingWordLayerMask = Platform.OS === "web"
    ? ({
        WebkitMaskComposite: "xor",
        WebkitMaskImage: `linear-gradient(black, black), ${NOTE_WORD_MASK_URI}`,
        WebkitMaskPosition: `0 0, ${noteLeft}px ${noteTop}px`,
        WebkitMaskRepeat: "no-repeat, no-repeat",
        WebkitMaskSize: `100% 100%, ${NOTE_WIDTH}px ${NOTE_HEIGHT}px`,
        maskComposite: "exclude",
        maskImage: `linear-gradient(black, black), ${NOTE_WORD_MASK_URI}`,
        maskPosition: `0 0, ${noteLeft}px ${noteTop}px`,
        maskRepeat: "no-repeat, no-repeat",
        maskSize: `100% 100%, ${NOTE_WIDTH}px ${NOTE_HEIGHT}px`,
      } as unknown as ViewStyle)
    : null;
  const collageTransform = [
    { scale: openingDrift.interpolate({ inputRange: [0, 1], outputRange: [1.04, 1.1] }) },
    { translateY: openingDrift.interpolate({ inputRange: [0, 1], outputRange: [12, -12] }) },
  ];

  const stopOpeningSequence = useCallback(() => {
    if (openingSequenceFrame.current !== null) cancelAnimationFrame(openingSequenceFrame.current);
    openingSequenceFrame.current = null;
    openingForegroundFade.current?.stop();
    openingForegroundFade.current = null;
    openingPhysics.current?.dispose();
    openingPhysics.current = null;
  }, []);

  useEffect(() => {
    stopOpeningSequence();
    openingParticlePoses.current.clear();
    openingParticles.forEach((item, index) => {
      const motion = particleMotions.get(item.key);
      const layout = particleLayouts[index];
      if (!motion || !layout) return;
      motion.x.setValue(layout.x);
      motion.y.setValue(layout.y);
      openingParticlePoses.current.set(item.key, { x: layout.x, y: layout.y });
    });
    return stopOpeningSequence;
  }, [openingParticles, particleLayouts, particleMotions, stopOpeningSequence]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    if (!reducedMotion) return;
    stopOpeningSequence();
    openingReveal.setValue(openingStepRef.current / OPENING_STEP_COUNT);
    if (!openingSequenceStarted.current) return;
    openingStepRef.current = OPENING_STEP_COUNT;
    setOpeningStep(OPENING_STEP_COUNT);
    openingReveal.setValue(1);
    openingForegroundOpacity.setValue(0);
    setOpeningForegroundHidden(true);
  }, [openingForegroundOpacity, openingReveal, reducedMotion, stopOpeningSequence]);

  useEffect(() => {
    openingDrift.stopAnimation();
    if (reducedMotion || activeChapter !== 1) {
      openingDrift.setValue(0);
      return undefined;
    }
    const leg = (toValue: number) => Animated.timing(openingDrift, {
      toValue,
      duration: OPENING_DRIFT_DURATION,
      easing: Easing.inOut(Easing.sin),
      useNativeDriver: Platform.OS !== "web",
    });
    const animation = Animated.loop(Animated.sequence([leg(1), leg(0)]));
    animation.start();
    return () => animation.stop();
  }, [activeChapter, openingDrift, reducedMotion]);

  useEffect(() => {
    liquidWave.stopAnimation();
    if (reducedMotion) {
      liquidWave.setValue(0.25);
      return undefined;
    }
    liquidWave.setValue(0);
    const animation = Animated.loop(Animated.timing(liquidWave, {
      toValue: 1,
      duration: 1_400,
      easing: Easing.linear,
      useNativeDriver: false,
    }));
    animation.start();
    return () => animation.stop();
  }, [liquidWave, reducedMotion]);

  useEffect(() => {
    if (Platform.OS !== "web" || width < MIN_STORY_WIDTH || reducedMotion) return undefined;
    let disposed = false;
    let revert: () => void = () => undefined;
    void (async () => {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);
      if (disposed) return;
      gsap.registerPlugin(ScrollTrigger);
      const root = rootRef.current as unknown as HTMLElement | null;
      const scroller = scrollRef.current?.getScrollableNode?.() as HTMLElement | undefined;
      if (!root || !scroller) return;
      const context = gsap.context(() => {
        root.querySelectorAll<HTMLElement>("[data-story-reveal]").forEach((element, index) => {
          gsap.fromTo(element, { opacity: 0, y: 24 }, {
            opacity: 1,
            y: 0,
            duration: 0.5,
            delay: Math.min(index % 3, 2) * 0.04,
            ease: "power2.out",
            scrollTrigger: { trigger: element, scroller, start: "top 86%", once: true },
          });
        });
      }, root);
      ScrollTrigger.refresh();
      revert = () => context.revert();
    })();
    return () => {
      disposed = true;
      revert();
    };
  }, [reducedMotion, width]);

  useEffect(() => {
    hourRotation.stopAnimation();
    if (reducedMotion) {
      hourRotation.setValue(selectedHour);
      return;
    }
    Animated.timing(hourRotation, {
      toValue: selectedHour,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }, [hourRotation, reducedMotion, selectedHour]);

  const startOpeningSequence = useCallback(() => {
    if (openingSequenceStarted.current || openingStepRef.current > 0) return;
    openingSequenceStarted.current = true;
    stopOpeningSequence();
    setOpeningForegroundHidden(false);
    openingForegroundOpacity.setValue(1);
    openingReveal.stopAnimation();
    openingReveal.setValue(0);

    const seed = Math.floor(Math.random() * 4_294_967_296);
    const entries = openingParticles.flatMap((item, index) => {
      const layout = particleLayouts[index];
      if (!layout) return [];
      return [{
        item,
        layout,
        collision: insetCollisionBox(layout.width, layout.fontSize),
      }];
    });

    // 最早出现的词条最终位于最上方，后续词条从下面持续把整堆顶高。
    const destinations = new Map<string, { x: number; y: number }>();
    for (let row = 1; row <= OPENING_STEP_COUNT; row += 1) {
      const rowEntries = entries.filter((entry) => entry.item.revealStep === row);
      if (rowEntries.length === 0) continue;
      planOpeningDestinations({
        seed,
        width,
        height: sceneHeight,
        step: openingPileDestinationStep(row, OPENING_STEP_COUNT),
        stepCount: OPENING_STEP_COUNT,
        items: rowEntries.map((entry) => ({
          key: entry.item.key,
          collisionWidth: entry.collision.width,
          collisionHeight: entry.collision.height,
        })),
      }).forEach((pose, key) => destinations.set(key, pose));
    }

    const physics = new OpeningParticlePhysics(width, sceneHeight, {
      gravityY: OPENING_GRAVITY,
      fallWhenUnsupported: true,
    });

    const targetFor = (entry: typeof entries[number], progress: number) => {
      const destination = destinations.get(entry.item.key) ?? { x: entry.layout.x, y: entry.layout.y };
      const finalY = sceneHeight / 2 + destination.y;
      const bottomLimit = sceneHeight - entry.collision.height / 2 - 4;
      return {
        x: width / 2 + destination.x,
        y: Math.min(bottomLimit, finalY + (1 - progress) * sceneHeight),
        finalY,
      };
    };

    const releaseWord = (entry: typeof entries[number], settled: boolean, progress: number) => {
      const target = targetFor(entry, settled ? 1 : progress);
      const remainingFrames = Math.max(1, ((1 - progress) * OPENING_TOTAL_DURATION) / FIXED_STEP_MS);
      physics.add({
        key: entry.item.key,
        targetX: target.x,
        targetY: settled ? target.finalY : target.y,
        collisionWidth: entry.collision.width,
        collisionHeight: entry.collision.height,
        angle: entry.layout.rotation * Math.PI / 180,
        spawnX: target.x,
        spawnY: settled ? target.finalY : target.y,
        velocityX: 0,
        velocityY: settled ? 0 : (target.finalY - target.y) / remainingFrames,
        frictionAir: settled ? OPENING_DECELERATION_FRICTION : OPENING_TRAVEL_FRICTION,
        restitution: 0.12,
        targetForce: OPENING_SETTLE_FORCE,
      });
      const pose = { x: target.x - width / 2, y: (settled ? target.finalY : target.y) - sceneHeight / 2 };
      const motion = particleMotions.get(entry.item.key);
      motion?.x.setValue(pose.x);
      motion?.y.setValue(pose.y);
      openingParticlePoses.current.set(entry.item.key, pose);
    };

    const commitPoses = (poses: ReturnType<typeof physics.poses>): number => {
      let movedCount = 0;
      poses.forEach((pose, key) => {
        const motion = particleMotions.get(key);
        if (!motion) return;
        const previous = openingParticlePoses.current.get(key);
        const relativePose = { x: pose.x - width / 2, y: pose.y - sceneHeight / 2 };
        // ponytail: skip sub-pixel writes so settled words stop churning styles every frame.
        if (previous
          && Math.abs(previous.x - relativePose.x) < OPENING_REST_EPSILON
          && Math.abs(previous.y - relativePose.y) < OPENING_REST_EPSILON) return;
        movedCount += 1;
        motion.x.setValue(relativePose.x);
        motion.y.setValue(relativePose.y);
        openingParticlePoses.current.set(key, relativePose);
      });
      return movedCount;
    };

    const finish = () => {
      openingStepRef.current = OPENING_STEP_COUNT;
      setOpeningStep(OPENING_STEP_COUNT);
      openingReveal.setValue(1);
    };

    const fadeForeground = () => {
      const fade = Animated.sequence([
        Animated.delay(OPENING_FADE_DELAY),
        Animated.timing(openingForegroundOpacity, {
          toValue: 0,
          duration: OPENING_FADE_DURATION,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: Platform.OS !== "web",
        }),
      ]);
      openingForegroundFade.current = fade;
      fade.start(({ finished }) => {
        if (openingForegroundFade.current === fade) openingForegroundFade.current = null;
        if (finished) setOpeningForegroundHidden(true);
      });
    };

    if (reducedMotion) {
      entries.forEach((entry) => releaseWord(entry, true, 1));
      for (let frame = 0; frame < OPENING_COLLISION_SETTLE_FRAMES; frame += 1) physics.advance(FIXED_STEP_MS);
      commitPoses(physics.poses());
      physics.dispose();
      finish();
      openingForegroundOpacity.setValue(0);
      setOpeningForegroundHidden(true);
      return;
    }

    const schedule = [...entries]
      .sort((left, right) => left.item.revealOrder - right.item.revealOrder)
      .map((entry) => ({ entry, releaseAt: entry.item.revealFrom * OPENING_TOTAL_DURATION }));

    openingPhysics.current = physics;
    const wordKeys = schedule.map(({ entry }) => entry.item.key);
    let lastFrameTime = 0;
    let stepRemainder = 0;
    // ponytail: hidden tabs pause rAF. Logo、词堆目标位和物理步进共用 simulated，恢复后不会错位。
    let simulated = 0;
    let releasedCount = 0;
    let settleTail = 0;
    const animateFlood = (frameTime: number) => {
      if (openingPhysics.current !== physics) return;
      if (lastFrameTime === 0) lastFrameTime = frameTime;
      const drained = consumeFixedSteps(stepRemainder, frameTime - lastFrameTime);
      lastFrameTime = frameTime;
      stepRemainder = drained.remainder;
      let movedCount = 0;
      for (let step = 0; step < drained.steps; step += 1) {
        simulated += FIXED_STEP_MS;
        const stepProgress = Math.min(1, simulated / OPENING_TOTAL_DURATION);
        while (releasedCount < schedule.length && schedule[releasedCount]!.releaseAt <= simulated) {
          releaseWord(schedule[releasedCount]!.entry, false, stepProgress);
          releasedCount += 1;
        }
        for (let index = 0; index < releasedCount; index += 1) {
          const entry = schedule[index]!.entry;
          const target = targetFor(entry, stepProgress);
          physics.setTarget(entry.item.key, target.x, stepProgress >= 1 ? target.finalY : target.y);
        }
        movedCount += commitPoses(physics.advance(FIXED_STEP_MS));
      }

      const progress = Math.min(1, simulated / OPENING_TOTAL_DURATION);
      openingReveal.setValue(progress);
      const row = Math.min(OPENING_STEP_COUNT, Math.floor(progress * OPENING_STEP_COUNT) + 1);
      if (row !== openingStepRef.current) {
        openingStepRef.current = row;
        setOpeningStep(row);
      }

      const allReleased = releasedCount >= schedule.length && progress >= 1;
      if (allReleased) {
        if (settleTail === 0) physics.setFrictionAir(wordKeys, OPENING_DECELERATION_FRICTION);
        settleTail += drained.steps * FIXED_STEP_MS;
      }
      const atRest = allReleased && settleTail >= 200 && movedCount === 0;
      if (!allReleased || (!atRest && settleTail < OPENING_SETTLE_TIMEOUT)) {
        openingSequenceFrame.current = requestAnimationFrame(animateFlood);
        return;
      }

      openingSequenceFrame.current = null;
      physics.dispose();
      if (openingPhysics.current === physics) openingPhysics.current = null;
      finish();
      fadeForeground();
    };
    openingSequenceFrame.current = requestAnimationFrame(animateFlood);
  }, [
    openingParticles,
    openingForegroundOpacity,
    openingReveal,
    particleLayouts,
    particleMotions,
    reducedMotion,
    sceneHeight,
    stopOpeningSequence,
    width,
  ]);

  const registerChapter = useCallback((index: number) => (event: LayoutChangeEvent) => {
    sectionOffsets.current[index - 1] = event.nativeEvent.layout.y;
  }, []);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const scrollable = Math.max(1, contentSize.height - layoutMeasurement.height);
    storyProgress.setValue(Math.min(1, Math.max(0, contentOffset.y / scrollable)));
    const marker = event.nativeEvent.contentOffset.y + event.nativeEvent.layoutMeasurement.height * 0.38;
    let next = 1;
    sectionOffsets.current.forEach((offset, index) => {
      if (Number.isFinite(offset) && marker >= offset) next = index + 1;
    });
    setActiveChapter((current) => current === next ? current : next);
  }, [storyProgress]);

  const handleHourWheel = useCallback((event: unknown) => {
    if (Platform.OS !== "web") return;
    const deltaY = (event as { nativeEvent?: { deltaY?: number } }).nativeEvent?.deltaY ?? 0;
    if (!deltaY) return;
    const next = (selectedHour + (deltaY > 0 ? 1 : -1) + 24) % 24;
    setSelectedHour(next);
  }, [selectedHour]);

  useEffect(() => {
    if (Platform.OS !== "web") return undefined;
    const scroller = scrollRef.current?.getScrollableNode?.() as HTMLElement | undefined;
    if (!scroller) return undefined;
    let dragging = false;
    let startY = 0;
    let startScrollTop = 0;
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("button, a, input, textarea, [role='button']")) return;
      dragging = true;
      startY = event.clientY;
      startScrollTop = scroller.scrollTop;
      scroller.setPointerCapture?.(event.pointerId);
      scroller.style.cursor = "grabbing";
    };
    const onPointerMove = (event: PointerEvent) => {
      if (dragging) scroller.scrollTop = startScrollTop - (event.clientY - startY);
    };
    const stopDragging = () => {
      dragging = false;
      scroller.style.cursor = "grab";
    };
    scroller.style.overflowY = "auto";
    scroller.style.touchAction = "pan-y";
    scroller.style.cursor = "grab";
    scroller.addEventListener("pointerdown", onPointerDown);
    scroller.addEventListener("pointermove", onPointerMove);
    scroller.addEventListener("pointerup", stopDragging);
    scroller.addEventListener("pointercancel", stopDragging);
    return () => {
      scroller.removeEventListener("pointerdown", onPointerDown);
      scroller.removeEventListener("pointermove", onPointerMove);
      scroller.removeEventListener("pointerup", stopDragging);
      scroller.removeEventListener("pointercancel", stopDragging);
    };
  }, [width]);

  const openStoryRecord = useCallback((item: StoryContentItem | null) => {
    if (!item) return;
    setDetail(detailFromStoryRecord(item));
  }, []);

  const openHighlight = useCallback((item: AnnualContentRef | null) => {
    if (!item) return;
    const match = storyContent.find((candidate) =>
      (item.videoId && candidate.videoId === item.videoId)
      || (item.url && candidate.record.url === item.url)
      || candidate.record.title === item.title,
    );
    setDetail(match ? detailFromStoryRecord(match) : detailFromHighlight(item));
  }, [storyContent]);

  const handleHourKey = useCallback((event: unknown, hour: number) => {
    const key = (event as { nativeEvent?: { key?: string }; preventDefault?: () => void }).nativeEvent?.key;
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(key ?? "")) return;
    (event as { preventDefault?: () => void }).preventDefault?.();
    const delta = key === "ArrowLeft" || key === "ArrowUp" ? -1 : 1;
    const next = (hour + delta + 24) % 24;
    setSelectedHour(next);
    if (Platform.OS === "web") {
      requestAnimationFrame(() => {
        const root = rootRef.current as unknown as HTMLElement | null;
        root?.querySelector<HTMLElement>(`[data-story-hour="${next}"]`)?.focus();
      });
    }
  }, []);

  if (width < MIN_STORY_WIDTH) {
    return <StoryWidthGate onEnterDashboard={onEnterDashboard} />;
  }

  if (!report || report.status === "empty" || !overview || !highlights) {
    return <StoryEmpty onEnterDashboard={onEnterDashboard} />;
  }

  return (
    <View ref={rootRef} style={styles.root} testID="annual-scroll-story">
      <View style={styles.topbar}>
        <View style={styles.brand}>
          <View style={styles.brandMark}>
            <View style={styles.brandMarkCyan} />
            <View style={styles.brandMarkRed} />
            <View style={styles.brandMarkCore}><Play color={color.white} fill={color.white} size={13} /></View>
          </View>
          <View>
            <Text style={styles.brandTitle}>年度故事</Text>
            <Text style={styles.brandMeta}>{sourceLabel} · {report.periodLabel}</Text>
          </View>
        </View>
        <View accessibilityLabel={`年度故事第 ${activeChapter} 章，共 ${CHAPTER_COUNT} 章`} accessibilityRole="progressbar" style={styles.progressWrap}>
          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
          </View>
          <Text style={styles.progressText}>{String(activeChapter).padStart(2, "0")} / 06</Text>
        </View>
        <Pressable
          accessibilityLabel="直接看数据大屏"
          accessibilityRole="button"
          onPress={onEnterDashboard}
          style={({ pressed }) => [styles.skipButton, pressed && styles.buttonPressed, WEB_POINTER]}
        >
          <LayoutDashboard color={color.text} size={18} />
          <Text style={styles.skipButtonText}>直接看数据</Text>
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        style={styles.storyScroller}
        testID="story-scroll-view"
      >
        <View onLayout={registerChapter(1)} style={[styles.stickyChapter, { minHeight: sceneHeight + 460 }]}>
          <View style={[styles.scene, { minHeight: sceneHeight }, stickyStyle]}>
            <View style={styles.openingBackdrop} testID="opening-cover-collage">
              <Animated.View pointerEvents="none" style={[styles.openingCollageLayer, { transform: collageTransform }]}>
                {openingCovers.map((item, index) => (
                  <OpeningCoverTile
                    item={item.record}
                    key={`${item.key}:${index}`}
                    layout={OPENING_COVER_LAYOUTS[index]!}
                    privacy={privacy}
                  />
                ))}
              </Animated.View>
              <View pointerEvents="none" style={styles.openingBackdropShade} />
              <OpeningStaggeredMessage active={openingForegroundHidden} reducedMotion={reducedMotion} />
            </View>

            <Animated.View
              accessibilityElementsHidden={openingForegroundHidden}
              aria-hidden={openingForegroundHidden}
              importantForAccessibility={openingForegroundHidden ? "no-hide-descendants" : "auto"}
              pointerEvents={openingStep > 0 || openingForegroundHidden ? "none" : "box-none"}
              style={[styles.openingForeground, { opacity: openingForegroundOpacity }]}
              testID="opening-foreground"
            >
              <Svg
                height="100%"
                pointerEvents="none"
                preserveAspectRatio="none"
                style={styles.openingForegroundFill}
                viewBox={`0 0 ${width} ${sceneHeight}`}
                width="100%"
              >
                <Defs>
                  <ClipPath id="opening-foreground-note-clip">
                    <Path d={NOTE_PATH} />
                  </ClipPath>
                  <Mask
                    height={sceneHeight}
                    id="opening-foreground-cutout-mask"
                    maskUnits="userSpaceOnUse"
                    width={width}
                    x="0"
                    y="0"
                  >
                    <Rect fill="white" height={sceneHeight} width={width} />
                    <G
                      clipPath="url(#opening-foreground-note-clip)"
                      transform={`translate(${noteLeft} ${noteTop})`}
                    >
                      <AnimatedSvgGroup transform={liquidTransform}>
                        <AnimatedSvgGroup transform={waveTransform}>
                          <Path d={LIQUID_PATH} fill="black" />
                        </AnimatedSvgGroup>
                      </AnimatedSvgGroup>
                    </G>
                  </Mask>
                </Defs>
                <Rect
                  fill={color.black}
                  height={sceneHeight}
                  mask="url(#opening-foreground-cutout-mask)"
                  width={width}
                />
              </Svg>
              <View
                accessible
                accessibilityLabel={`年度内容已展开 ${openingProgress}%`}
                style={styles.openingParticleStage}
              >
                <View pointerEvents="none" style={[styles.openingWordLayer, openingWordLayerMask]} testID="opening-word-layer">
                  {openingParticles.map((item, index) => {
                    const layout = particleLayouts[index]!;
                    const motion = particleMotions.get(item.key);
                    if (!motion) return null;
                    const hidden = item.revealStep > openingStep;
                    const itemHeight = openingParticleHeight(layout.fontSize);
                    return (
                      <Animated.View
                        accessible
                        accessibilityLabel={openingParticleAccessibilityLabel(item)}
                        accessibilityElementsHidden={hidden}
                        aria-hidden={hidden}
                        importantForAccessibility={hidden ? "no-hide-descendants" : "auto"}
                        key={item.key}
                        pointerEvents="none"
                        style={[
                          styles.floatingItem,
                          {
                            width: layout.width,
                            height: itemHeight,
                            marginLeft: -layout.width / 2,
                            marginTop: -itemHeight / 2,
                            opacity: openingReveal.interpolate({
                              inputRange: [item.revealFrom, item.revealTo],
                              outputRange: [0, 1],
                              extrapolate: "clamp",
                            }),
                            transform: [
                              { translateX: motion.x },
                              { translateY: motion.y },
                              { rotate: `${layout.rotation}deg` },
                              { scale: openingReveal.interpolate({ inputRange: [item.revealFrom, item.revealTo], outputRange: [0.72, 1], extrapolate: "clamp" }) },
                            ],
                          },
                        ]}
                      >
                        <Text
                          numberOfLines={1}
                          style={[
                            item.kind === "tag" ? styles.floatingTag : item.kind === "title" ? styles.floatingTitle : styles.floatingCreator,
                            { fontSize: layout.fontSize, lineHeight: itemHeight, textAlign: layout.textAlign },
                          ]}
                        >
                          {item.label}
                          {item.count === undefined ? null : <Text style={styles.floatingCount}> {formatNumber(item.count)}</Text>}
                        </Text>
                      </Animated.View>
                    );
                  })}
                </View>
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.logoGlowLayer,
                    {
                      opacity: openingReveal.interpolate({
                        inputRange: [0, 0.06],
                        outputRange: [1, 0],
                        extrapolate: "clamp",
                      }),
                    },
                  ]}
                >
                  <OpeningLogoGlow active={openingStep === 0} reducedMotion={reducedMotion} />
                </Animated.View>
                <Pressable
                  accessibilityHint="点击一次后自动展开全部真实标签、视频标题和创作者"
                  accessibilityLabel={openingStep >= OPENING_STEP_COUNT
                    ? "年度内容已全部展开"
                    : openingStep > 0
                      ? "年度内容正在自动展开"
                      : "自动展开年度内容"}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: openingStep > 0 }}
                  disabled={openingStep > 0}
                  {...(Platform.OS === "web" ? { dataSet: { focusTreatment: "scale" } } : {})}
                  onPress={startOpeningSequence}
                  style={({ pressed }) => [styles.logoButton, pressed && styles.logoButtonPressed, WEB_POINTER]}
                  testID="opening-logo-button"
                >
                  <View
                    accessible
                    accessibilityLabel={`内容展开进度 ${openingProgress}%`}
                    accessibilityRole="progressbar"
                    accessibilityValue={{ min: 0, max: 100, now: openingProgress }}
                    style={styles.logoProgress}
                  >
                    <Svg
                      accessibilityLabel="抖音音符标志"
                      height={NOTE_HEIGHT}
                      pointerEvents="none"
                      viewBox={`0 0 ${NOTE_VIEWBOX_WIDTH} ${NOTE_VIEWBOX_HEIGHT}`}
                      width={NOTE_WIDTH}
                    >
                      <Defs>
                        <Mask
                          height={NOTE_VIEWBOX_HEIGHT}
                          id="opening-logo-fill-mask"
                          maskUnits="userSpaceOnUse"
                          width={NOTE_VIEWBOX_WIDTH}
                          x="0"
                          y="0"
                        >
                          <Path d={NOTE_PATH} fill="white" />
                          <AnimatedSvgGroup transform={liquidTransform}>
                            <AnimatedSvgGroup transform={waveTransform}>
                              <Path d={LIQUID_PATH} fill="black" />
                            </AnimatedSvgGroup>
                          </AnimatedSvgGroup>
                        </Mask>
                      </Defs>
                      <Path d={NOTE_PATH} fill="none" stroke="#25F4EE" strokeLinejoin="round" strokeWidth={14} transform="translate(-7 5)" />
                      <Path d={NOTE_PATH} fill="none" stroke="#FE2C55" strokeLinejoin="round" strokeWidth={14} transform="translate(7 -4)" />
                      <Rect fill="#F4F6FA" height={NOTE_VIEWBOX_HEIGHT} mask="url(#opening-logo-fill-mask)" width={NOTE_VIEWBOX_WIDTH} />
                    </Svg>
                  </View>
                </Pressable>
              </View>
            </Animated.View>
          </View>
        </View>

        <View onLayout={registerChapter(2)} style={styles.chapter}>
          <View style={styles.sectionInner}>
            <SectionHeading
              chapter="02"
              eyebrow="内容足迹"
              title="三条内容流，汇成同一段足迹。"
              copy="观看、喜欢和收藏分别保留原始列表口径，再汇聚为去重内容总量。"
            />
            <View style={[styles.streamGrid, compact && styles.streamGridCompact]} {...revealDataSet()}>
              <StoryStream
                accent={color.cyan}
                icon={History}
                label="观看"
                onOpen={openStoryRecord}
                privacy={privacy}
                stream={model.streams.watch_history}
              />
              <StoryStream
                accent={color.accent}
                icon={Heart}
                label="喜欢"
                onOpen={openStoryRecord}
                privacy={privacy}
                stream={model.streams.liked_videos}
              />
              <StoryStream
                accent={color.amber}
                icon={Bookmark}
                label="收藏"
                onOpen={openStoryRecord}
                privacy={privacy}
                stream={model.streams.favorite_videos}
              />
            </View>
            <View style={styles.totalKnot} {...revealDataSet()}>
              <Text style={styles.totalKnotLabel}>三类记录去重后</Text>
              <Text style={styles.totalKnotValue}>{formatNumber(overview.counts.total)}</Text>
              <Text style={styles.totalKnotMeta}>数字来自统计，叙事不会改变它。</Text>
            </View>
          </View>
        </View>

        <View onLayout={registerChapter(3)} style={[styles.stickyChapter, { minHeight: sceneHeight + 380 }]}>
          <View style={[styles.scene, styles.rhythmScene, { minHeight: sceneHeight }, stickyStyle]}>
            <View style={[styles.rhythmLayout, compact && styles.rhythmLayoutCompact]}>
              <View style={styles.rhythmCopy} {...revealDataSet()}>
                <Text style={styles.chapterNo}>CHAPTER 03 · 使用节奏</Text>
                <Text style={styles.sectionTitle}>一天里的哪一刻，{`\n`}内容最常出现？</Text>
                <Text style={styles.lead}>只使用可靠行为时间。方向键也可以切换小时。</Text>
                <View style={styles.hourStory}>
                  <Text style={styles.hourStoryLabel}>{padHour(selectedHourData.hour)} · {selectedHourData.count} 条可靠记录</Text>
                  <Text style={styles.hourStoryText}>{privacy ? privateHourStory(selectedHourData) : copyProvider.hourStory(selectedHourData)}</Text>
                  {selectedHourData.representative ? (
                    <StoryRecordButton compact item={selectedHourData.representative} onOpen={openStoryRecord} privacy={privacy} />
                  ) : <Text style={styles.emptyText}>这个小时没有可展示的代表内容</Text>}
                </View>
              </View>
              <HourDial
                hourRotation={hourRotation}
                hours={model.hours}
                onWheel={handleHourWheel}
                onHourKey={handleHourKey}
                onSelectHour={setSelectedHour}
                selectedHour={selectedHour}
              />
            </View>
          </View>
        </View>

        <View onLayout={registerChapter(4)} style={styles.chapter}>
          <View style={styles.sectionInner}>
            <SectionHeading
              chapter="04"
              eyebrow="偏好与创作者"
              title="显式标签，连接起内容与创作者。"
              copy="点击标签，只展示真实命中的代表内容与对应创作者。音乐和时长只作为辅助字段。"
            />
            <View style={[styles.preferenceLayout, compact && styles.preferenceLayoutCompact]}>
              <View style={styles.topicField} {...revealDataSet()}>
                {model.topics.length ? model.topics.slice(0, 12).map((topic, index) => {
                  const selected = topic.name === selectedTopicData?.name;
                  return (
                    <Pressable
                      key={topic.name}
                      accessibilityLabel={`${privacy ? `话题 ${index + 1}` : `话题 ${topic.name}`}，${topic.count} 条内容`}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => setSelectedTopic(topic.name)}
                      style={({ pressed }) => [styles.topicButton, selected && styles.topicButtonSelected, pressed && styles.buttonPressed, WEB_POINTER]}
                    >
                      <Text style={[styles.topicButtonText, selected && styles.topicButtonTextSelected]}>{privacy ? `话题 ${index + 1}` : `#${topic.name}`}</Text>
                      <Text style={styles.topicButtonCount}>{topic.count}</Text>
                    </Pressable>
                  );
                }) : <Text style={styles.emptyText}>当前样本没有可识别的显式标签</Text>}
              </View>
              <View style={styles.preferenceResult} {...revealDataSet()}>
                {selectedTopicData ? (
                  <>
                    <Text style={styles.resultEyebrow}>SELECTED TOPIC</Text>
                    <Text style={styles.resultTitle}>{privacy ? `话题 ${selectedTopicIndex + 1}` : `#${selectedTopicData.name}`}</Text>
                    <Text style={styles.resultCopy}>{privacy ? `该标签关联 ${selectedTopicData.count} 条内容，标签与创作者已隐藏。` : copyProvider.topicStory(selectedTopicData)}</Text>
                    {selectedTopicData.records[0] ? <StoryRecordButton item={selectedTopicData.records[0]} onOpen={openStoryRecord} privacy={privacy} /> : null}
                    <View style={styles.creatorFilmstrip}>
                      {selectedTopicData.creators.length ? selectedTopicData.creators.slice(0, 5).map((creator, index) => (
                        <View key={creator.key} style={styles.creatorFrame}>
                          <Text style={styles.creatorIndex}>{String(index + 1).padStart(2, "0")}</Text>
                          <Text numberOfLines={1} style={styles.creatorName}>{privacy ? `创作者 ${index + 1}` : creator.name} · {creator.count}</Text>
                        </View>
                      )) : <Text style={styles.emptyText}>没有可归属的创作者</Text>}
                    </View>
                  </>
                ) : null}
              </View>
            </View>
          </View>
        </View>

        <View onLayout={registerChapter(5)} style={styles.chapter}>
          <View style={styles.sectionInner}>
            <SectionHeading
              chapter="05"
              eyebrow="真正留下的内容"
              title="列表相遇的位置，才是可比较的交集。"
              copy="交集只使用可比较 videoId；缺失标识的记录不会被猜测为同一内容。"
            />
            <View style={[styles.keptLayout, compact && styles.keptLayoutCompact]}>
              <View style={styles.confluence} {...revealDataSet()}>
                <Svg accessibilityLabel="观看、喜欢和收藏三条真实数据轨道汇流图" height="100%" viewBox="0 0 700 390" width="100%">
                  <Path d={buildTrackPath(model.streams.watch_history.uniqueCount, overview.counts.total, 88, 194, false)} fill="none" stroke={color.cyan} strokeLinecap="round" strokeWidth="6" />
                  <Path d={buildTrackPath(model.streams.liked_videos.uniqueCount, overview.counts.total, 195, 194, false)} fill="none" stroke={color.accent} strokeLinecap="round" strokeWidth="6" />
                  <Path d={buildTrackPath(model.streams.favorite_videos.uniqueCount, overview.counts.total, 302, 194, true)} fill="none" stroke={color.amber} strokeLinecap="round" strokeWidth="6" />
                </Svg>
                <Text style={[styles.trackLabel, styles.trackWatch]}>观看</Text>
                <Text style={[styles.trackLabel, styles.trackLiked]}>喜欢</Text>
                <Text style={[styles.trackLabel, styles.trackFavorite]}>收藏</Text>
                <OverlapButton available={overlapsAvailable} data={model.overlaps.watchLiked} id="watchLiked" onSelect={setSelectedOverlap} selected={selectedOverlap === "watchLiked"} style={styles.overlapWatchLiked} />
                <OverlapButton available={overlapsAvailable} data={model.overlaps.watchFavorite} id="watchFavorite" onSelect={setSelectedOverlap} selected={selectedOverlap === "watchFavorite"} style={styles.overlapWatchFavorite} />
                <OverlapButton available={overlapsAvailable} data={model.overlaps.likedFavorite} id="likedFavorite" onSelect={setSelectedOverlap} selected={selectedOverlap === "likedFavorite"} style={styles.overlapLikedFavorite} />
                <OverlapButton available={overlapsAvailable} data={model.overlaps.allThree} id="allThree" onSelect={setSelectedOverlap} selected={selectedOverlap === "allThree"} style={styles.overlapAll} />
              </View>
              <View style={styles.overlapResult} {...revealDataSet()}>
                <Text style={styles.resultEyebrow}>LIST INTERSECTION</Text>
                <Text style={styles.resultTitle}>{OVERLAP_LABELS[selectedOverlap]}</Text>
                <Text style={styles.resultCopy}>{overlapsAvailable ? `${selectedOverlapData.count} 个可比较视频` : "缺少可比较 videoId，无法判断"}</Text>
                <View style={styles.overlapItems}>
                  {selectedOverlapData.records.length ? selectedOverlapData.records.map((item) => (
                    <StoryRecordButton compact item={item} key={item.key} onOpen={openStoryRecord} privacy={privacy} />
                  )) : <Text style={styles.emptyText}>当前交集没有可展示内容</Text>}
                </View>
                <View style={styles.snapshotNotice}><View style={styles.snapshotMark} /><Text style={styles.snapshotNoticeText}>当前列表快照，不代表行为转化</Text></View>
              </View>
            </View>
          </View>
        </View>

        <View onLayout={registerChapter(6)} style={[styles.chapter, styles.highlightsChapter]}>
          <View style={styles.sectionInner}>
            <SectionHeading
              chapter="06"
              eyebrow="年度高光与收束"
              title="五个规则坐标，把故事落回真实内容。"
              copy="横向浏览首条、末条、峰值日、最长内容和互动快照最高内容。"
            />
            <ScrollView
              contentContainerStyle={styles.highlightStrip}
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.highlightScroller}
              {...revealDataSet()}
            >
              {highlightDefinitions.map((definition, index) => (
                <StoryHighlightCard
                  accent={definition.accent}
                  index={index}
                  item={highlights[definition.key]}
                  key={definition.key}
                  label={definition.label}
                  onOpen={openHighlight}
                  privacy={privacy}
                  rule={definition.rule}
                />
              ))}
            </ScrollView>
          </View>
          <View style={styles.finale}>
            <View style={styles.finaleMark} />
            <Text style={styles.finaleEyebrow}>YOUR CONTENT, YOUR YEAR</Text>
            <Text style={styles.finaleTitle}>这些内容不是答案，{`\n`}是你留下的坐标。</Text>
            <Text style={styles.finaleCopy}>完整数字、数据口径与独立年度高光，已经整理在数据大屏中。</Text>
            <Pressable
              accessibilityLabel="进入数据大屏"
              accessibilityRole="button"
              onPress={onEnterDashboard}
              style={({ pressed }) => [styles.dashboardButton, pressed && styles.buttonPressed, WEB_POINTER]}
            >
              <Text style={styles.dashboardButtonText}>进入数据大屏</Text>
              <ArrowRight color={color.white} size={20} />
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <StoryDetailModal detail={detail} onClose={() => setDetail(null)} privacy={privacy} />
    </View>
  );
}

function SectionHeading({ chapter, eyebrow, title, copy }: { chapter: string; eyebrow: string; title: string; copy: string }) {
  return (
    <View style={styles.sectionHeading} {...revealDataSet()}>
      <Text style={styles.sectionChapter}>{chapter}</Text>
      <View style={styles.sectionHeadingCopy}>
        <Text style={styles.chapterNo}>CHAPTER {chapter} · {eyebrow}</Text>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionLead}>{copy}</Text>
      </View>
    </View>
  );
}

function StoryStream({
  accent,
  icon: Icon,
  label,
  onOpen,
  privacy,
  stream,
}: {
  accent: string;
  icon: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
  label: string;
  onOpen: (item: StoryContentItem | null) => void;
  privacy: boolean;
  stream: StoryStreamData;
}) {
  return (
    <View style={[styles.stream, { borderTopColor: accent }]}>
      <View style={styles.streamHeader}>
        <View style={styles.streamTitle}><Icon color={accent} size={19} /><Text style={styles.streamLabel}>{label}</Text></View>
        <Text style={styles.streamCount}>{formatNumber(stream.uniqueCount)}</Text>
      </View>
      <View style={styles.streamLine} />
      <View style={styles.streamItems}>
        {stream.records.slice(0, 3).map((item) => (
          <StoryRecordButton compact item={item} key={item.key} onOpen={onOpen} privacy={privacy} />
        ))}
        {!stream.representative ? <Text style={styles.emptyText}>暂无代表内容</Text> : null}
      </View>
    </View>
  );
}

function StoryRecordButton({ item, onOpen, privacy, compact = false }: { item: StoryContentItem; onOpen: (item: StoryContentItem | null) => void; privacy: boolean; compact?: boolean }) {
  return (
    <Pressable
      accessibilityLabel={`${privacy ? "内容标题已隐藏" : item.record.title}，打开内容详情`}
      accessibilityRole="button"
      onPress={() => onOpen(item)}
      style={({ pressed }) => [styles.recordButton, compact && styles.recordButtonCompact, pressed && styles.buttonPressed, WEB_POINTER]}
    >
      <StoryCover item={item.record} privacy={privacy} />
      <View style={styles.recordCopy}>
        <Text numberOfLines={2} style={styles.recordTitle}>{privacy ? "内容标题已隐藏" : item.record.title}</Text>
        <Text numberOfLines={1} style={styles.recordMeta}>{privacy ? "创作者已隐藏" : item.record.author ?? "未知创作者"} · {formatShortDate(item.record.occurredAt)}</Text>
      </View>
      <ArrowRight color={color.textMuted} size={16} />
    </Pressable>
  );
}

function StoryCover({ item, privacy }: { item: StoryContentItem["record"]; privacy: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [item.coverUrl]);
  if (item.coverUrl && !privacy && !failed) {
    return <ImageBackground onError={() => setFailed(true)} resizeMode="cover" source={{ uri: item.coverUrl }} style={styles.recordCover} />;
  }
  return <View style={[styles.recordCover, styles.recordCoverFallback]}><Play color={color.cyan} size={15} /></View>;
}

interface OutlineSample {
  x: number;
  y: number;
  nx: number;
  ny: number;
  angle: number;
  phase: number;
}

function sampleNoteOutline(count: number): OutlineSample[] {
  const center = GLOW_CANVAS / 2;
  const offsetX = (GLOW_CANVAS - NOTE_VIEWBOX_WIDTH) / 2;
  const offsetY = (GLOW_CANVAS - NOTE_VIEWBOX_HEIGHT) / 2;
  const fallback = () => Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2;
    return {
      x: center + Math.cos(angle) * 104,
      y: center + Math.sin(angle) * 116,
      nx: Math.cos(angle),
      ny: Math.sin(angle),
      angle,
      phase: angle,
    };
  });
  if (Platform.OS !== "web" || typeof document === "undefined") return fallback();
  try {
    const node = document.createElementNS("http://www.w3.org/2000/svg", "path");
    node.setAttribute("d", NOTE_PATH);
    const total = node.getTotalLength();
    if (!Number.isFinite(total) || total <= 0) return fallback();
    const points = Array.from({ length: count }, (_, index) => {
      const point = node.getPointAtLength((index / count) * total);
      return { x: point.x + offsetX, y: point.y + offsetY };
    });
    const signedArea = points.reduce((area, point, index) => {
      const next = points[(index + 1) % points.length]!;
      return area + point.x * next.y - next.x * point.y;
    }, 0);
    const normalDirection = signedArea >= 0 ? 1 : -1;
    return points.map((point, index) => {
      const previous = points[(index - 1 + points.length) % points.length]!;
      const next = points[(index + 1) % points.length]!;
      const tangentX = next.x - previous.x;
      const tangentY = next.y - previous.y;
      const tangentLength = Math.hypot(tangentX, tangentY) || 1;
      return {
        ...point,
        nx: normalDirection * tangentY / tangentLength,
        ny: normalDirection * -tangentX / tangentLength,
        angle: Math.atan2(point.y - center, point.x - center),
        phase: (index / count) * Math.PI * 2,
      };
    });
  } catch {
    return fallback();
  }
}

function ringPath(
  outline: readonly OutlineSample[],
  time: number,
  crestAngle: number,
  offsetX: number,
  offsetY: number,
): string {
  let path = "";
  outline.forEach((sample, index) => {
    let gap = Math.abs(sample.angle - crestAngle) % (Math.PI * 2);
    if (gap > Math.PI) gap = Math.PI * 2 - gap;
    let distance = RING_GAP + RING_BREATH * Math.sin(time * 1.1);
    for (const wave of RING_WAVES) {
      distance += wave.amp * Math.sin(wave.k * sample.phase + wave.speed * time + wave.phase);
    }
    distance += RING_CREST_GAIN * Math.exp(-(gap * gap) / (2 * RING_CREST_SPREAD * RING_CREST_SPREAD));
    distance = Math.max(RING_MIN_GAP, distance);
    const x = sample.x + sample.nx * distance + offsetX;
    const y = sample.y + sample.ny * distance + offsetY;
    path += `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  return `${path}Z`;
}

function OpeningLogoGlow({ active, reducedMotion }: { active: boolean; reducedMotion: boolean }) {
  const [beat, setBeat] = useState({ angle: -Math.PI / 2, time: 0 });
  const hostRef = useRef<View | null>(null);
  const targetAngle = useRef(-Math.PI / 2);
  const liveAngle = useRef(-Math.PI / 2);
  const outline = useMemo(() => sampleNoteOutline(RING_POINTS), []);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined" || !active || reducedMotion) return undefined;
    const onPointerMove = (event: PointerEvent) => {
      const rect = (hostRef.current as unknown as HTMLElement | null)?.getBoundingClientRect();
      if (!rect) return;
      targetAngle.current = Math.atan2(
        event.clientY - (rect.top + rect.height / 2),
        event.clientX - (rect.left + rect.width / 2),
      );
    };
    const startedAt = performance.now();
    let frame = requestAnimationFrame(function pulse(now) {
      let delta = targetAngle.current - liveAngle.current;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      liveAngle.current += delta * RING_FOLLOW;
      setBeat({ angle: liveAngle.current, time: (now - startedAt) / 1000 });
      frame = requestAnimationFrame(pulse);
    });
    window.addEventListener("pointermove", onPointerMove);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      cancelAnimationFrame(frame);
    };
  }, [active, reducedMotion]);

  const center = GLOW_CANVAS / 2;
  const cyanRing = ringPath(outline, beat.time, beat.angle, -RING_CHROMA.x, -RING_CHROMA.y);
  const redRing = ringPath(outline, beat.time, beat.angle, RING_CHROMA.x, RING_CHROMA.y);
  const coreRing = ringPath(outline, beat.time, beat.angle, 0, 0);
  const crestX = center + Math.cos(beat.angle) * (RING_CREST_RADIUS * 0.62);
  const crestY = center + Math.sin(beat.angle) * (RING_CREST_RADIUS * 0.62);

  return (
    <View
      accessibilityElementsHidden
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      ref={hostRef}
      style={styles.logoGlow}
      testID="opening-logo-glow"
    >
      <Svg height={GLOW_CANVAS} pointerEvents="none" width={GLOW_CANVAS}>
        <Defs>
          <Filter height="240%" id="opening-ring-bloom" width="240%" x="-70%" y="-70%">
            <FeGaussianBlur stdDeviation={RING_BLOOM_BLUR} />
          </Filter>
          <Filter height="200%" id="opening-ring-core" width="200%" x="-50%" y="-50%">
            <FeGaussianBlur stdDeviation={RING_CORE_BLUR} />
          </Filter>
          <RadialGradient
            cx={crestX}
            cy={crestY}
            gradientUnits="userSpaceOnUse"
            id="opening-ring-hot"
            r={RING_CREST_RADIUS}
          >
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity="1" />
            <Stop offset="0.55" stopColor="#FFFFFF" stopOpacity="0.5" />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
          </RadialGradient>
          <Mask height={GLOW_CANVAS} id="opening-ring-hot-mask" maskUnits="userSpaceOnUse" width={GLOW_CANVAS} x="0" y="0">
            <Rect fill="url(#opening-ring-hot)" height={GLOW_CANVAS} width={GLOW_CANVAS} x="0" y="0" />
          </Mask>
        </Defs>

        <G filter="url(#opening-ring-bloom)">
          <Path d={cyanRing} fill="none" opacity={0.5} stroke="#25F4EE" strokeLinejoin="round" strokeWidth={RING_BLOOM_WIDTH} />
          <Path d={redRing} fill="none" opacity={0.5} stroke="#FE2C55" strokeLinejoin="round" strokeWidth={RING_BLOOM_WIDTH} />
        </G>

        <G filter="url(#opening-ring-core)">
          <Path d={cyanRing} fill="none" opacity={0.9} stroke="#25F4EE" strokeLinejoin="round" strokeWidth={RING_EDGE_WIDTH} />
          <Path d={redRing} fill="none" opacity={0.88} stroke="#FE2C55" strokeLinejoin="round" strokeWidth={RING_EDGE_WIDTH} />
        </G>

        <G mask="url(#opening-ring-hot-mask)">
          <Path d={coreRing} fill="none" opacity={0.5} stroke="#FFFFFF" strokeLinejoin="round" strokeWidth={RING_EDGE_WIDTH * 1.6} />
          <Path d={coreRing} fill="none" opacity={0.95} stroke="#FFFFFF" strokeLinejoin="round" strokeWidth={RING_CORE_WIDTH} />
        </G>
      </Svg>
    </View>
  );
}

function OpeningStaggeredMessage({ active, reducedMotion }: { active: boolean; reducedMotion: boolean }) {
  const lineChars = useMemo(() => OPENING_MESSAGE_LINES.map((line) => Array.from(line)), []);
  const charProgress = useMemo(
    () => lineChars.flatMap((line) => line.map(() => new Animated.Value(0))),
    [lineChars],
  );

  useEffect(() => {
    charProgress.forEach((value) => {
      value.stopAnimation();
      value.setValue(active && reducedMotion ? 1 : 0);
    });
    if (!active || reducedMotion) return undefined;
    const animation = Animated.stagger(
      80,
      charProgress.map((value) => Animated.timing(value, {
        toValue: 1,
        duration: 700,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== "web",
      })),
    );
    animation.start();
    return () => animation.stop();
  }, [active, charProgress, reducedMotion]);

  let charIndex = 0;
  return (
    <View pointerEvents="none" style={styles.openingMessage} testID="opening-staggered-message">
      {lineChars.map((line, lineIndex) => (
        <View key={`opening-message-line-${lineIndex}`} style={styles.openingMessageLine}>
          {line.map((char) => {
            const progress = charProgress[charIndex]!;
            charIndex += 1;
            const charAnimationStyle = {
              opacity: progress,
              transform: [
                { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-18, 0] }) },
                { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
              ],
            };
            const webBlurStyle = Platform.OS === "web"
              ? ({ filter: progress.interpolate({ inputRange: [0, 1], outputRange: ["blur(9px)", "blur(0px)"] }) } as unknown as TextStyle)
              : null;
            return (
              <View key={`opening-message-char-${lineIndex}-${charIndex}`} style={styles.openingMessageCharShell}>
                <Animated.Text style={[styles.openingMessageChar, styles.openingMessageCharOutlineBlue, charAnimationStyle, webBlurStyle]}>
                  {char}
                </Animated.Text>
                <Animated.Text style={[styles.openingMessageChar, styles.openingMessageCharOutlineRed, charAnimationStyle, webBlurStyle]}>
                  {char}
                </Animated.Text>
                <Animated.Text style={[styles.openingMessageChar, charAnimationStyle, webBlurStyle]}>
                  {char}
                </Animated.Text>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function OpeningCoverTile({
  item,
  layout,
  privacy,
}: {
  item: StoryContentItem["record"];
  layout: ViewStyle;
  privacy: boolean;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [item.coverUrl]);

  return (
    <View accessibilityElementsHidden aria-hidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={[styles.openingCoverTile, layout]}>
      {item.coverUrl && !privacy && !failed ? (
        <ImageBackground
          onError={() => setFailed(true)}
          resizeMode="cover"
          source={{ uri: item.coverUrl }}
          style={styles.openingCoverImage}
        >
          <View style={styles.openingCoverImageShade} />
        </ImageBackground>
      ) : (
        <View style={[styles.openingCoverFallback, { backgroundColor: openingCoverColor(item.id) }]}>
          <Text numberOfLines={3} style={styles.openingCoverFallbackTitle}>
            {privacy ? "内容封面" : item.title}
          </Text>
          <Text numberOfLines={1} style={styles.openingCoverFallbackAuthor}>
            {privacy ? "创作者已隐藏" : item.author ?? "未知创作者"}
          </Text>
        </View>
      )}
    </View>
  );
}

function HourDial({
  hourRotation,
  hours,
  selectedHour,
  onSelectHour,
  onHourKey,
  onWheel,
}: {
  hourRotation: Animated.Value;
  hours: StoryHour[];
  selectedHour: number;
  onSelectHour: (hour: number) => void;
  onHourKey: (event: unknown, hour: number) => void;
  onWheel: (event: unknown) => void;
}) {
  const rotation = hourRotation.interpolate({ inputRange: [0, 24], outputRange: ["0deg", "360deg"] });
  const maxCount = Math.max(1, ...hours.map((hour) => hour.count));
  return (
    <View
      accessibilityLabel="24 小时可靠记录拨盘，滚动鼠标滚轮可切换小时"
      style={styles.dialWrap}
      {...revealDataSet()}
      {...({ onWheel } as Record<string, unknown>)}
    >
      <View style={styles.dialTrack} />
      <Animated.View style={[styles.dialHand, { transform: [{ rotate: rotation }] }]}><View style={styles.dialHandLine} /></Animated.View>
      {hours.map((hour) => {
        const angle = hour.hour / 24 * Math.PI * 2 - Math.PI / 2;
        const left = 50 + Math.cos(angle) * 43;
        const top = 50 + Math.sin(angle) * 43;
        const selected = hour.hour === selectedHour;
        return (
          <Pressable
            key={hour.hour}
            accessibilityLabel={`${padHour(hour.hour)}，${hour.count} 条可靠记录`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onSelectHour(hour.hour)}
            style={({ pressed }) => [
              styles.hourButton,
              { left: `${left}%`, top: `${top}%` },
              selected && styles.hourButtonSelected,
              pressed && styles.buttonPressed,
              WEB_POINTER,
            ]}
            {...({
              dataSet: { storyHour: String(hour.hour) },
              onKeyDown: (event: unknown) => onHourKey(event, hour.hour),
              tabIndex: selected ? 0 : -1,
            } as Record<string, unknown>)}
          >
            <View style={[styles.hourDot, { opacity: 0.28 + hour.count / maxCount * 0.72 }, selected && styles.hourDotSelected]} />
            <Text style={[styles.hourText, selected && styles.hourTextSelected]}>{String(hour.hour).padStart(2, "0")}</Text>
          </Pressable>
        );
      })}
      <View style={styles.dialCenter}>
        <Clock3 color={color.cyan} size={22} />
        <Text style={styles.dialTime}>{padHour(selectedHour)}</Text>
        <Text style={styles.dialCount}>{hours[selectedHour]?.count ?? 0} 条可靠记录</Text>
      </View>
    </View>
  );
}

function OverlapButton({
  available,
  data,
  id,
  selected,
  onSelect,
  style,
}: {
  available: boolean;
  data: StoryOverlap;
  id: StoryOverlapKey;
  selected: boolean;
  onSelect: (id: StoryOverlapKey) => void;
  style: ViewStyle;
}) {
  return (
    <Pressable
      accessibilityLabel={`${OVERLAP_LABELS[id]}，${available ? `${data.count} 个视频` : "不可判断"}`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={() => onSelect(id)}
      style={({ pressed }) => [styles.overlapButton, style, selected && styles.overlapButtonSelected, pressed && styles.buttonPressed, WEB_POINTER]}
    >
      <Text style={styles.overlapButtonLabel}>{OVERLAP_LABELS[id]}</Text>
      <Text style={styles.overlapButtonValue}>{available ? data.count : "--"}</Text>
    </Pressable>
  );
}

function StoryHighlightCard({
  accent,
  index,
  item,
  label,
  rule,
  onOpen,
  privacy,
}: {
  accent: string;
  index: number;
  item: AnnualContentRef | null;
  label: string;
  rule: string;
  onOpen: (item: AnnualContentRef | null) => void;
  privacy: boolean;
}) {
  const title = item ? (privacy ? "内容标题已隐藏" : item.title) : "暂无可确定内容";
  const author = item ? (privacy ? "创作者已隐藏" : item.author ?? "未知创作者") : "当前样本缺少对应记录";
  return (
    <Pressable
      accessibilityLabel={`${label}：${title}${item ? "，打开详情" : ""}`}
      accessibilityRole={item ? "button" : undefined}
      disabled={!item}
      onPress={() => onOpen(item)}
      style={({ pressed }) => [styles.highlightCard, { borderTopColor: accent }, !item && styles.disabled, pressed && styles.buttonPressed, item && WEB_POINTER]}
    >
      <View style={[styles.highlightVisual, { backgroundColor: fallbackColor(`${label}:${index}`) }]}>
        <Star color={accent} size={48} strokeWidth={1.5} />
        <Text style={styles.highlightIndex}>{String(index + 1).padStart(2, "0")}</Text>
      </View>
      <View style={styles.highlightCopy}>
        <Text style={[styles.highlightLabel, { color: accent }]}>{label}</Text>
        <Text numberOfLines={2} style={styles.highlightTitle}>{title}</Text>
        <Text numberOfLines={1} style={styles.highlightMeta}>{author}</Text>
        <Text style={styles.highlightRule}>{rule}</Text>
      </View>
    </Pressable>
  );
}

function StoryDetailModal({ detail, onClose, privacy }: { detail: StoryDetail | null; onClose: () => void; privacy: boolean }) {
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={detail !== null}>
      <View style={styles.modalScrim}>
        <View accessibilityViewIsModal style={styles.modalPanel}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.resultEyebrow}>CONTENT DETAIL</Text>
              <Text style={styles.modalKicker}>当前页详情</Text>
            </View>
            <Pressable accessibilityLabel="关闭内容详情" accessibilityRole="button" onPress={onClose} style={({ pressed }) => [styles.modalClose, pressed && styles.buttonPressed, WEB_POINTER]}>
              <X color={color.text} size={20} />
            </Pressable>
          </View>
          {detail ? (
            <ScrollView contentContainerStyle={styles.modalBody} showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>{privacy ? "内容标题已隐藏" : detail.title}</Text>
              <Text style={styles.modalAuthor}>{privacy ? "创作者已隐藏" : detail.author}</Text>
              <View style={styles.detailFacts}>
                <DetailFact label="观看时间" value={formatDateTime(detail.occurredAt)} />
                <DetailFact label="列表归属" value={detail.lists.map((list) => LIST_LABELS[list]).join("、") || "未识别"} />
                <DetailFact label="时长" value={detail.durationSeconds === null ? "暂无" : formatDuration(detail.durationSeconds)} />
                <DetailFact label="音乐" value={privacy && detail.music ? "已隐藏" : detail.music ?? "暂无"} />
              </View>
              <View style={styles.detailTags}>
                {detail.topics.length
                  ? privacy
                    ? <Text style={styles.emptyText}>标签已隐藏</Text>
                    : detail.topics.map((topic) => <Text key={topic} style={styles.detailTag}>#{topic}</Text>)
                  : <Text style={styles.emptyText}>没有显式标签</Text>}
              </View>
              <View style={styles.detailNote}>
                <Text style={styles.detailNoteText}>当前记录没有独立描述字段，因此不补写事实性描述。</Text>
              </View>
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function DetailFact({ label, value }: { label: string; value: string }) {
  return <View style={styles.detailFact}><Text style={styles.detailFactLabel}>{label}</Text><Text style={styles.detailFactValue}>{value}</Text></View>;
}

function StoryWidthGate({ onEnterDashboard }: { onEnterDashboard: () => void }) {
  return (
    <View style={styles.gateRoot} testID="story-width-gate">
      <View style={styles.gateMark}><Sparkles color={color.cyan} size={28} /></View>
      <Text style={styles.chapterNo}>ANNUAL STORY / DESKTOP</Text>
      <Text style={styles.gateTitle}>滚动故事需要至少 1024px 的窗口宽度。</Text>
      <Text style={styles.gateCopy}>当前设备直接进入数据大屏，完整数字和年度高光仍然可用。</Text>
      <Pressable accessibilityRole="button" onPress={onEnterDashboard} style={({ pressed }) => [styles.dashboardButton, pressed && styles.buttonPressed, WEB_POINTER]}>
        <Text style={styles.dashboardButtonText}>直接看数据</Text><ArrowRight color={color.white} size={20} />
      </Pressable>
    </View>
  );
}

function StoryEmpty({ onEnterDashboard }: { onEnterDashboard: () => void }) {
  return (
    <View style={styles.gateRoot} testID="story-empty-state">
      <View style={styles.gateMark}><Sparkles color={color.cyan} size={28} /></View>
      <Text style={styles.chapterNo}>ANNUAL STORY / LOCAL ONLY</Text>
      <Text style={styles.gateTitle}>还没有可以讲述的内容。</Text>
      <Text style={styles.gateCopy}>完成一次读取后，滚动故事会在进入内容库时出现。</Text>
      <Pressable accessibilityRole="button" onPress={onEnterDashboard} style={({ pressed }) => [styles.dashboardButton, pressed && styles.buttonPressed, WEB_POINTER]}>
        <Text style={styles.dashboardButtonText}>返回数据大屏</Text><ArrowRight color={color.white} size={20} />
      </Pressable>
    </View>
  );
}

function detailFromStoryRecord(item: StoryContentItem): StoryDetail {
  return {
    title: item.record.title,
    author: item.record.author ?? "未知创作者",
    occurredAt: item.occurredAt,
    durationSeconds: item.record.durationSeconds ?? null,
    lists: item.lists,
    topics: item.topics,
    music: item.record.music?.title ?? null,
  };
}

function detailFromHighlight(item: AnnualContentRef): StoryDetail {
  return {
    title: item.title,
    author: item.author ?? "未知创作者",
    occurredAt: item.occurredAt,
    durationSeconds: item.durationSeconds,
    lists: [item.type],
    topics: [],
    music: null,
  };
}

function revealDataSet(): Record<string, unknown> {
  return Platform.OS === "web" ? { dataSet: { storyReveal: "true" } } : {};
}

function collectOpeningContent(model: StoryModel): StoryContentItem[] {
  const items = new Map<string, StoryContentItem>();
  Object.values(model.streams).forEach((stream) => {
    stream.records.forEach((item) => {
      if (!items.has(item.key)) items.set(item.key, item);
    });
  });
  return [...items.values()];
}

function buildOpeningCovers(items: readonly StoryContentItem[]): StoryContentItem[] {
  if (items.length === 0) return [];
  // 连续的观看记录常指向同一张封面，直接取前 20 条会让相邻拼图重图，接缝看着像撕裂。
  // 相邻拼图不能取相邻记录：连续的观看记录常是同一创作者的同系列，缩略图几乎一样，
  // 接缝看着就像撕裂。跨全表等距取样，再跳过与上一块同作者的候选。
  const stride = Math.max(1, Math.floor(items.length / OPENING_COVER_LAYOUTS.length));
  const picked: StoryContentItem[] = [];
  const usedKeys = new Set<string>();
  for (let slot = 0; slot < OPENING_COVER_LAYOUTS.length; slot += 1) {
    let candidate = items[(slot * stride) % items.length]!;
    for (let probe = 0; probe < stride; probe += 1) {
      const next = items[(slot * stride + probe) % items.length]!;
      const clashes = usedKeys.has(next.key)
        || (picked.at(-1)?.record.author != null && next.record.author === picked.at(-1)!.record.author);
      if (!clashes) {
        candidate = next;
        break;
      }
    }
    usedKeys.add(candidate.key);
    picked.push(candidate);
  }
  return picked;
}

function buildOpeningParticles(
  model: StoryModel,
  content: readonly StoryContentItem[],
  privacy: boolean,
): OpeningParticle[] {
  const tags = model.topics.slice(0, OPENING_TAG_LIMIT);
  const titles: Array<{ key: string; label: string }> = [];
  const creators: Array<{ key: string; label: string }> = [];
  const seenTitles = new Set<string>();

  const addTitle = (item: StoryContentItem) => {
    const title = item.record.title.trim();
    const titleKey = title.toLocaleLowerCase("zh-Hans");
    if (!title || seenTitles.has(titleKey) || titles.length >= OPENING_TITLE_LIMIT) return;
    titles.push({ key: item.key, label: title });
    seenTitles.add(titleKey);
  };

  // 真实档案里的短标题优先入堆，其余标题仍按原始内容顺序补足。
  content.filter((item) => [...item.record.title.trim()].length <= 4).forEach(addTitle);
  content.forEach(addTitle);

  for (const item of content) {
    const creator = item.record.author?.trim();
    if (creator && creators.length < OPENING_CREATOR_LIMIT) {
      creators.push({ key: item.key, label: creator });
    }
    if (creators.length >= OPENING_CREATOR_LIMIT) break;
  }

  const particles: Array<Omit<OpeningParticle, "revealOrder" | "revealFrom" | "revealTo">> = [];
  tags.forEach((tag, index) => particles.push({
    key: `tag:${tag.name}`,
    kind: "tag",
    label: privacy ? `话题 ${index + 1}` : `#${tag.name}`,
    count: tag.count,
    revealStep: (index % OPENING_STEP_COUNT) + 1,
  }));
  titles.forEach((title, index) => particles.push({
    key: `title:${title.key}`,
    kind: "title",
    label: privacy ? `视频标题 ${index + 1}` : title.label,
    revealStep: (index % OPENING_STEP_COUNT) + 1,
  }));
  creators.forEach((creator, index) => particles.push({
    key: `creator:${creator.key}`,
    kind: "creator",
    label: privacy ? `创作者 ${index + 1}` : `@${creator.label}`,
    revealStep: (index % OPENING_STEP_COUNT) + 1,
  }));
  // 先按水位层排序保证自下而上，层内用哈希打散，避免看出从左到右的扫描感。
  const releaseOrder = new Map([...particles]
    .sort((left, right) => left.revealStep - right.revealStep
      || (hashString(left.key) >>> 4) - (hashString(right.key) >>> 4)
      || left.key.localeCompare(right.key))
    .map((item, index) => [item.key, index] as const));
  const total = Math.max(1, particles.length);
  const fadeWidth = OPENING_WORD_FADE_SLOTS / total;
  return particles.map((item) => {
    const revealOrder = releaseOrder.get(item.key) ?? 0;
    const revealFrom = revealOrder / total;
    return { ...item, revealOrder, revealFrom, revealTo: Math.min(1, revealFrom + fadeWidth) };
  });
}

function openingParticleAccessibilityLabel(item: OpeningParticle): string {
  if (item.kind === "tag") return `视频标签 ${item.label}${item.count === undefined ? "" : `，出现 ${item.count} 次`}`;
  if (item.kind === "title") return `视频标题 ${item.label}`;
  return `创作者 ${item.label.replace(/^@/u, "")}`;
}

function openingParticleHeight(fontSize: number): number {
  return fontSize * 1.18;
}

function estimateOpeningParticleWidth(item: OpeningParticle, fontSize: number, maxWidth: number): number {
  const text = item.count === undefined ? item.label : `${item.label} ${formatNumber(item.count)}`;
  const glyphUnits = Array.from(text).reduce((total, character) => {
    if (/\s/u.test(character)) return total + 0.32;
    if (/[\u0021-\u007e]/u.test(character)) return total + 0.58;
    return total + 1;
  }, 0);
  return Math.min(maxWidth, Math.max(fontSize * 1.6, glyphUnits * fontSize + fontSize * 0.4));
}

function privateHourStory(hour: StoryHour): string {
  if (hour.count === 0) return "这个小时没有可靠行为时间记录，不生成具体结论。";
  return `${padHour(hour.hour)} 有 ${hour.count} 条可靠记录，相关标签已隐藏。`;
}

function collectStoryContent(model: StoryModel): StoryContentItem[] {
  const items = new Map<string, StoryContentItem>();
  const add = (item: StoryContentItem | null | undefined) => {
    if (item && !items.has(item.key)) items.set(item.key, item);
  };

  Object.values(model.streams).forEach((stream) => add(stream.representative));
  model.hours.forEach((hour) => add(hour.representative));
  model.topics.forEach((topic) => {
    topic.records.forEach(add);
    topic.creators.forEach((creator) => add(creator.representative));
  });
  Object.values(model.overlaps).forEach((overlap) => overlap.records.forEach(add));
  return [...items.values()];
}

function storyParticleLayouts(items: readonly OpeningParticle[], width: number, height: number): OpeningParticleLayout[] {
  const radiusX = Math.min(610, Math.max(420, (width - 160) * 0.46));
  const radiusY = Math.min(340, Math.max(260, height * 0.43));
  const columnCount = width < 1180 ? 10 : 12;
  const rowCount = Math.max(12, Math.ceil(items.length / columnCount));
  const slots = Array.from({ length: columnCount * rowCount }, (_, index) => ({
    column: index % columnCount,
    row: Math.floor(index / columnCount),
  })).map(({ column, row }) => ({
    x: ((column + 0.5) / columnCount) * 2 - 1,
    y: ((row + 0.5) / rowCount) * 2 - 1,
  }));
  const availableSlots = slots.map((_, index) => index);
  const alignments = ["left", "center", "right"] as const;

  return items.map((item) => {
    const hash = hashString(item.key);
    const availableIndex = hash % availableSlots.length;
    const slotIndex = availableSlots.splice(availableIndex, 1)[0] ?? 0;
    const slot = slots[slotIndex]!;
    const narrow = width < 1180;
    const widthForKind = item.kind === "title"
      ? (narrow ? 104 + (hash % 19) : 145 + (hash % 32))
      : item.kind === "creator"
        ? (narrow ? 112 + (hash % 17) : 120 + (hash % 41))
        : (narrow ? 88 + (hash % 18) : 110 + (hash % 36));
    const fontSize = item.kind === "title"
      ? (narrow ? 12 + (hash % 5) : 14 + (hash % 7))
      : item.kind === "tag"
        ? (narrow ? 11 + (hash % 5) : 13 + (hash % 7))
        : (narrow ? 10 + (hash % 4) : 11 + (hash % 6));
    const scaledFontSize = fontSize * OPENING_PARTICLE_SCALE;
    const maxWidth = widthForKind * OPENING_PARTICLE_SCALE;
    return {
      x: slot.x * radiusX + (narrow ? ((hash >>> 12) % 9) - 4 : ((hash >>> 12) % 17) - 8),
      y: slot.y * radiusY + (narrow ? ((hash >>> 17) % 11) - 5 : ((hash >>> 17) % 17) - 8),
      width: estimateOpeningParticleWidth(item, scaledFontSize, maxWidth),
      fontSize: scaledFontSize,
      rotation: ((hash >>> 5) % 15) - 7,
      textAlign: alignments[(hash >>> 9) % alignments.length]!,
    };
  });
}

function padHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

function formatNumber(value: number): string {
  return value.toLocaleString("zh-CN");
}

function formatShortDate(value: string | null): string {
  if (!value) return "时间未知";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "时间未知";
  return date.toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit" });
}

function formatDateTime(value: string | null): string {
  if (!value) return "时间未知";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "时间未知";
  return date.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDuration(seconds: number): string {
  const rounded = Math.max(0, Math.round(seconds));
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
}

function hashString(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function fallbackColor(value: string): string {
  const palette = [color.cyanSoft, color.accentSoft, color.amberSoft, color.greenSoft, color.surfaceMuted];
  return palette[hashString(value) % palette.length]!;
}

function openingCoverColor(value: string): string {
  const palette = ["#153334", "#3A1721", "#382E19", "#1D2940", "#2D2038", "#173429"];
  return palette[hashString(value) % palette.length]!;
}

function buildTrackPath(count: number, total: number, startY: number, endY: number, reverse = false): string {
  const ratio = total > 0 ? Math.min(1, count / total) : 0;
  const bend = 54 + ratio * 78;
  const direction = reverse ? -1 : 1;
  const firstControlY = startY + direction * bend;
  const secondControlY = endY - direction * (bend * 0.72);
  return `M 20 ${startY} C 180 ${firstControlY}, 350 ${secondControlY}, 665 ${endY}`;
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0, backgroundColor: color.canvas },
  topbar: { height: 68, flexDirection: "row", alignItems: "center", gap: 24, paddingHorizontal: 28, borderBottomWidth: 1, borderBottomColor: color.border, backgroundColor: color.sidebar, zIndex: 30 },
  brand: { width: 280, flexDirection: "row", alignItems: "center", gap: 11 },
  brandMark: { width: 38, height: 38, position: "relative", alignItems: "center", justifyContent: "center" },
  brandMarkCyan: { position: "absolute", width: 27, height: 27, left: 2, top: 3, borderRadius: radius.medium, backgroundColor: color.cyan },
  brandMarkRed: { position: "absolute", width: 27, height: 27, right: 2, bottom: 3, borderRadius: radius.medium, backgroundColor: color.accent },
  brandMarkCore: { width: 27, height: 27, alignItems: "center", justifyContent: "center", borderRadius: radius.medium, backgroundColor: color.black },
  brandTitle: { color: color.text, fontSize: 13, fontWeight: "900" },
  brandMeta: { color: color.textMuted, fontSize: 9, marginTop: 2 },
  progressWrap: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12 },
  progressTrack: { width: 197, height: 3, overflow: "hidden", backgroundColor: color.border },
  progressFill: { height: 3, backgroundColor: color.cyan },
  progressText: { width: 44, color: color.textMuted, fontSize: 10, fontWeight: "800", fontVariant: ["tabular-nums"] },
  skipButton: { minWidth: 140, minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 15, borderWidth: 1, borderColor: color.border, borderRadius: radius.medium, backgroundColor: color.surface },
  skipButtonText: { color: color.text, fontSize: 12, fontWeight: "900" },
  buttonPressed: { opacity: 0.72 },
  storyScroller: { flex: 1, minHeight: 0 },
  scrollContent: { backgroundColor: color.canvas, paddingBottom: 40 },
  stickyChapter: { position: "relative", backgroundColor: color.canvas },
  scene: { position: "relative", justifyContent: "center", overflow: "hidden", backgroundColor: color.canvas },
  openingBackdrop: { ...ABSOLUTE_FILL, overflow: "hidden", backgroundColor: color.surfaceMuted },
  openingCollageLayer: { ...ABSOLUTE_FILL },
  openingCoverTile: { position: "absolute", overflow: "hidden", borderRadius: radius.small, backgroundColor: color.surfaceMuted },
  openingCoverImage: { flex: 1 },
  openingCoverImageShade: { ...ABSOLUTE_FILL, backgroundColor: "rgba(5,5,6,0.12)" },
  openingCoverFallback: { flex: 1, justifyContent: "space-between", padding: 20 },
  openingCoverFallbackTitle: { maxWidth: 250, color: "rgba(255,255,255,0.62)", fontSize: 22, lineHeight: 29, fontWeight: "900" },
  openingCoverFallbackAuthor: { color: "rgba(255,255,255,0.42)", fontSize: 11, fontWeight: "800" },
  openingBackdropShade: { ...ABSOLUTE_FILL, backgroundColor: "rgba(5,5,6,0.36)" },
  openingMessage: { ...ABSOLUTE_FILL, zIndex: 3, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  openingMessageLine: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  openingMessageCharShell: { position: "relative" },
  openingMessageChar: { color: "rgba(255,255,255,0.76)", fontSize: 64, lineHeight: 80, fontWeight: "900", textShadowColor: "rgba(5,5,6,0.72)", textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 14 },
  openingMessageCharOutlineBlue: { position: "absolute", left: -1, top: 0, color: "transparent", textShadowColor: "rgba(37,244,238,0.9)", textShadowOffset: { width: -1, height: 0 }, textShadowRadius: 2, ...(Platform.OS === "web" ? ({ WebkitTextStroke: "1px rgba(37,244,238,0.82)" } as unknown as TextStyle) : {}) },
  openingMessageCharOutlineRed: { position: "absolute", left: 1, top: 0, color: "transparent", textShadowColor: "rgba(254,44,85,0.9)", textShadowOffset: { width: 1, height: 0 }, textShadowRadius: 2, ...(Platform.OS === "web" ? ({ WebkitTextStroke: "1px rgba(254,44,85,0.82)" } as unknown as TextStyle) : {}) },
  openingForeground: { ...ABSOLUTE_FILL, zIndex: 5 },
  openingForegroundFill: { ...ABSOLUTE_FILL },
  openingParticleStage: { ...ABSOLUTE_FILL, zIndex: 4, alignItems: "center", justifyContent: "center" },
  openingWordLayer: { ...ABSOLUTE_FILL },
  chapterNo: { color: color.cyan, fontSize: 10, fontWeight: "900" },
  lead: { maxWidth: 640, color: color.textSecondary, fontSize: 16, lineHeight: 26, marginTop: 18 },
  floatingItem: { position: "absolute", zIndex: 4, left: "50%", top: "50%", justifyContent: "center" },
  floatingTag: { color: color.cyan, fontWeight: "900", lineHeight: 26 * OPENING_PARTICLE_SCALE },
  floatingTitle: { color: color.text, fontWeight: "900", lineHeight: 29 * OPENING_PARTICLE_SCALE },
  floatingCreator: { color: color.accent, fontWeight: "800", lineHeight: 23 * OPENING_PARTICLE_SCALE },
  floatingCount: { color: color.textMuted, fontSize: 10 * OPENING_PARTICLE_SCALE, fontWeight: "900" },
  logoGlowLayer: { ...ABSOLUTE_FILL, zIndex: 3 },
  logoGlow: { position: "absolute", zIndex: 3, left: "50%", top: "50%", width: GLOW_CANVAS, height: GLOW_CANVAS, marginLeft: -GLOW_CANVAS / 2, marginTop: -GLOW_CANVAS / 2 },
  logoButton: { zIndex: 10, width: NOTE_WIDTH, height: NOTE_HEIGHT, alignItems: "center", justifyContent: "center" },
  logoButtonPressed: { opacity: 0.86, transform: [{ scale: 0.97 }] },
  logoProgress: { width: NOTE_WIDTH, height: NOTE_HEIGHT, alignItems: "center", justifyContent: "center" },
  chapter: { minHeight: 820, justifyContent: "center", paddingHorizontal: 52, paddingVertical: 92, borderTopWidth: 1, borderTopColor: color.borderSoft, backgroundColor: color.canvas },
  sectionInner: { width: "100%", maxWidth: 1180, alignSelf: "center" },
  sectionHeading: { flexDirection: "row", alignItems: "flex-start", gap: 38, marginBottom: 48 },
  sectionChapter: { width: 84, color: color.textMuted, fontSize: 44, lineHeight: 50, fontWeight: "900", fontVariant: ["tabular-nums"] },
  sectionHeadingCopy: { flex: 1, minWidth: 0 },
  sectionTitle: { maxWidth: 820, color: color.text, fontSize: 44, lineHeight: 54, fontWeight: "900", marginTop: 10 },
  sectionLead: { maxWidth: 740, color: color.textSecondary, fontSize: 15, lineHeight: 25, marginTop: 16 },
  streamGrid: { flexDirection: "row", alignItems: "stretch", gap: 16 },
  streamGridCompact: { gap: 10 },
  stream: { flex: 1, minWidth: 0, minHeight: 470, padding: 18, borderWidth: 1, borderTopWidth: 4, borderColor: color.border, borderRadius: radius.large, backgroundColor: color.surface },
  streamHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  streamTitle: { flexDirection: "row", alignItems: "center", gap: 8 },
  streamLabel: { color: color.text, fontSize: 13, fontWeight: "900" },
  streamCount: { color: color.text, fontSize: 23, fontWeight: "900", fontVariant: ["tabular-nums"] },
  streamLine: { height: 2, marginVertical: 16, backgroundColor: color.border },
  streamItems: { gap: 8 },
  recordButton: { minHeight: 78, flexDirection: "row", alignItems: "center", gap: 12, padding: 10, borderWidth: 1, borderColor: color.border, borderRadius: radius.medium, backgroundColor: color.surfaceRaised },
  recordButtonCompact: { minHeight: 66 },
  recordCover: { width: 42, height: 52, flexShrink: 0, overflow: "hidden", borderRadius: radius.small, backgroundColor: color.surfaceMuted },
  recordCoverFallback: { alignItems: "center", justifyContent: "center" },
  recordCopy: { flex: 1, minWidth: 0 },
  recordTitle: { color: color.text, fontSize: 12, lineHeight: 18, fontWeight: "800" },
  recordMeta: { color: color.textMuted, fontSize: 9, marginTop: 5 },
  emptyText: { color: color.textMuted, fontSize: 11, lineHeight: 18 },
  totalKnot: { width: 260, alignSelf: "center", alignItems: "center", marginTop: 34, paddingTop: 24, borderTopWidth: 3, borderTopColor: color.cyan },
  totalKnotLabel: { color: color.textMuted, fontSize: 10 },
  totalKnotValue: { color: color.text, fontSize: 46, lineHeight: 52, fontWeight: "900", marginTop: 6 },
  totalKnotMeta: { color: color.textSecondary, fontSize: 11, marginTop: 6, textAlign: "center" },
  rhythmScene: { borderTopWidth: 1, borderTopColor: color.border, backgroundColor: color.sidebar },
  rhythmLayout: { width: "100%", maxWidth: 1180, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 64, paddingHorizontal: 52, paddingVertical: 64 },
  rhythmLayoutCompact: { gap: 28, paddingHorizontal: 40 },
  rhythmCopy: { flex: 1, minWidth: 0 },
  hourStory: { maxWidth: 500, minHeight: 198, marginTop: 34, padding: 20, borderLeftWidth: 3, borderLeftColor: color.accent, backgroundColor: color.surface },
  hourStoryLabel: { color: color.cyan, fontSize: 11, fontWeight: "900" },
  hourStoryText: { color: color.text, fontSize: 17, lineHeight: 26, fontWeight: "800", marginVertical: 12 },
  dialWrap: { position: "relative", width: 480, height: 480, flexShrink: 0, alignItems: "center", justifyContent: "center" },
  dialTrack: { position: "absolute", top: 34, right: 34, bottom: 34, left: 34, borderWidth: 2, borderColor: color.border, borderRadius: 206 },
  dialHand: { position: "absolute", width: 4, height: 170, left: 238, top: 70, alignItems: "center", justifyContent: "flex-start", transformOrigin: "50% 100%" },
  dialHandLine: { width: 4, height: 150, borderRadius: 2, backgroundColor: color.cyan },
  hourButton: { position: "absolute", width: 44, height: 44, marginLeft: -22, marginTop: -22, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "transparent", borderRadius: 22 },
  hourButtonSelected: { borderColor: color.cyan, backgroundColor: color.cyanSoft },
  hourDot: { position: "absolute", top: 5, width: 5, height: 5, borderRadius: 3, backgroundColor: color.accent },
  hourDotSelected: { backgroundColor: color.cyan },
  hourText: { color: color.textMuted, fontSize: 9, fontWeight: "700" },
  hourTextSelected: { color: color.text, fontWeight: "900" },
  dialCenter: { width: 190, height: 190, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: color.border, borderRadius: 95, backgroundColor: color.canvas },
  dialTime: { color: color.text, fontSize: 38, lineHeight: 44, fontWeight: "900", marginTop: 8, fontVariant: ["tabular-nums"] },
  dialCount: { color: color.textMuted, fontSize: 10, marginTop: 5 },
  preferenceLayout: { flexDirection: "row", alignItems: "stretch", gap: 34 },
  preferenceLayoutCompact: { gap: 20 },
  topicField: { width: "36%", flexDirection: "row", flexWrap: "wrap", alignContent: "flex-start", gap: 9 },
  topicButton: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 13, borderWidth: 1, borderColor: color.border, borderRadius: radius.medium, backgroundColor: color.surface },
  topicButtonSelected: { borderColor: color.cyan, backgroundColor: color.cyanSoft },
  topicButtonText: { color: color.textSecondary, fontSize: 12, fontWeight: "800" },
  topicButtonTextSelected: { color: color.cyan },
  topicButtonCount: { color: color.accent, fontSize: 9, fontWeight: "900" },
  preferenceResult: { flex: 1, minWidth: 0, minHeight: 410, padding: 26, borderWidth: 1, borderColor: color.border, borderRadius: radius.large, backgroundColor: color.surface },
  resultEyebrow: { color: color.cyan, fontSize: 9, fontWeight: "900" },
  resultTitle: { color: color.text, fontSize: 26, lineHeight: 34, fontWeight: "900", marginTop: 7 },
  resultCopy: { color: color.textSecondary, fontSize: 13, lineHeight: 21, marginVertical: 14 },
  creatorFilmstrip: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 18, paddingTop: 16, borderTopWidth: 1, borderTopColor: color.border },
  creatorFrame: { flex: 1, minWidth: 120, minHeight: 68, justifyContent: "center", paddingHorizontal: 12, borderLeftWidth: 3, borderLeftColor: color.accent, backgroundColor: color.surfaceRaised },
  creatorIndex: { color: color.textMuted, fontSize: 9, fontWeight: "900" },
  creatorName: { color: color.text, fontSize: 11, fontWeight: "800", marginTop: 5 },
  keptLayout: { flexDirection: "row", alignItems: "stretch", gap: 24 },
  keptLayoutCompact: { gap: 14 },
  confluence: { position: "relative", flex: 1.35, minWidth: 0, minHeight: 430 },
  trackLabel: { position: "absolute", left: 16, color: color.textSecondary, fontSize: 11, fontWeight: "800" },
  trackWatch: { top: 76 },
  trackLiked: { top: 183 },
  trackFavorite: { top: 290 },
  overlapButton: { position: "absolute", minWidth: 126, minHeight: 58, alignItems: "center", justifyContent: "center", paddingHorizontal: 10, borderWidth: 1, borderColor: color.border, borderRadius: radius.medium, backgroundColor: color.surface },
  overlapButtonSelected: { borderColor: color.cyan, backgroundColor: color.cyanSoft },
  overlapButtonLabel: { color: color.textSecondary, fontSize: 9, fontWeight: "800" },
  overlapButtonValue: { color: color.cyan, fontSize: 17, fontWeight: "900", marginTop: 4 },
  overlapWatchLiked: { left: "38%", top: 118 },
  overlapWatchFavorite: { left: "50%", top: 238 },
  overlapLikedFavorite: { left: "24%", top: 256 },
  overlapAll: { right: 10, top: 166 },
  overlapResult: { flex: 0.78, minWidth: 300, padding: 24, borderWidth: 1, borderColor: color.border, borderRadius: radius.large, backgroundColor: color.surface },
  overlapItems: { gap: 8 },
  snapshotNotice: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: 9, marginTop: 18, paddingHorizontal: 12, backgroundColor: color.amberSoft },
  snapshotMark: { width: 16, height: 3, backgroundColor: color.amber },
  snapshotNoticeText: { flex: 1, color: color.textSecondary, fontSize: 9 },
  highlightsChapter: { paddingHorizontal: 0, paddingBottom: 0 },
  highlightScroller: { width: "100%" },
  highlightStrip: { gap: 14, paddingBottom: 20 },
  highlightCard: { width: 300, minHeight: 410, overflow: "hidden", borderWidth: 1, borderTopWidth: 4, borderColor: color.border, borderRadius: radius.large, backgroundColor: color.surface },
  highlightVisual: { position: "relative", height: 220, alignItems: "center", justifyContent: "center" },
  highlightIndex: { position: "absolute", right: 14, bottom: 8, color: "rgba(255,255,255,0.22)", fontSize: 38, fontWeight: "900" },
  highlightCopy: { flex: 1, padding: 18 },
  highlightLabel: { fontSize: 9, fontWeight: "900" },
  highlightTitle: { minHeight: 46, color: color.text, fontSize: 15, lineHeight: 22, fontWeight: "900", marginTop: 8 },
  highlightMeta: { color: color.textMuted, fontSize: 10, marginTop: 8 },
  highlightRule: { color: color.textSecondary, fontSize: 9, lineHeight: 15, marginTop: "auto", paddingTop: 14, borderTopWidth: 1, borderTopColor: color.border },
  disabled: { opacity: 0.52 },
  finale: { width: "100%", minHeight: 560, alignItems: "center", justifyContent: "center", marginTop: 88, paddingHorizontal: 40, borderTopWidth: 1, borderTopColor: color.border, backgroundColor: color.sidebar },
  finaleMark: { width: 72, height: 5, backgroundColor: color.accent },
  finaleEyebrow: { color: color.cyan, fontSize: 10, fontWeight: "900", marginTop: 34 },
  finaleTitle: { color: color.text, fontSize: 46, lineHeight: 58, fontWeight: "900", textAlign: "center", marginTop: 12 },
  finaleCopy: { maxWidth: 680, color: color.textSecondary, fontSize: 15, lineHeight: 25, textAlign: "center", marginTop: 20 },
  dashboardButton: { minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 28, paddingHorizontal: 20, borderRadius: radius.medium, backgroundColor: color.accentAction },
  dashboardButtonText: { color: color.white, fontSize: 13, fontWeight: "900" },
  modalScrim: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, backgroundColor: "rgba(0,0,0,0.72)" },
  modalPanel: { width: "100%", maxWidth: 720, maxHeight: "88%", overflow: "hidden", borderWidth: 1, borderColor: color.border, borderRadius: radius.large, backgroundColor: color.surface },
  modalHeader: { minHeight: 70, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 20, paddingHorizontal: 24, borderBottomWidth: 1, borderBottomColor: color.border },
  modalKicker: { color: color.textSecondary, fontSize: 12, fontWeight: "800", marginTop: 4 },
  modalClose: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: color.border, borderRadius: radius.medium, backgroundColor: color.surfaceRaised },
  modalBody: { padding: 28, paddingBottom: 34 },
  modalTitle: { color: color.text, fontSize: 28, lineHeight: 38, fontWeight: "900" },
  modalAuthor: { color: color.textSecondary, fontSize: 13, marginTop: 8 },
  detailFacts: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 24 },
  detailFact: { width: "48.8%", minHeight: 78, justifyContent: "center", paddingHorizontal: 14, borderLeftWidth: 3, borderLeftColor: color.cyan, backgroundColor: color.surfaceRaised },
  detailFactLabel: { color: color.textMuted, fontSize: 9 },
  detailFactValue: { color: color.text, fontSize: 12, fontWeight: "800", marginTop: 6 },
  detailTags: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 22 },
  detailTag: { minHeight: 30, paddingHorizontal: 10, paddingTop: 7, borderRadius: 15, color: color.cyan, fontSize: 10, fontWeight: "800", backgroundColor: color.cyanSoft },
  detailNote: { marginTop: 24, padding: 16, borderLeftWidth: 3, borderLeftColor: color.accent, backgroundColor: color.surfaceRaised },
  detailNoteText: { color: color.textSecondary, fontSize: 11, lineHeight: 18 },
  gateRoot: { flex: 1, minHeight: "100%", alignItems: "center", justifyContent: "center", padding: 32, backgroundColor: color.canvas },
  gateMark: { width: 56, height: 56, alignItems: "center", justifyContent: "center", marginBottom: 22, borderWidth: 1, borderColor: color.border, borderRadius: radius.large, backgroundColor: color.surface },
  gateTitle: { maxWidth: 620, color: color.text, fontSize: 30, lineHeight: 40, fontWeight: "900", textAlign: "center", marginTop: 10 },
  gateCopy: { maxWidth: 560, color: color.textSecondary, fontSize: 14, lineHeight: 23, textAlign: "center", marginTop: 14 },
});
