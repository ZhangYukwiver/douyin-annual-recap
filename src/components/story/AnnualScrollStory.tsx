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
import { Mesh, Program, Renderer, Triangle } from "ogl";
import Svg, {
  ClipPath,
  Defs,
  FeGaussianBlur,
  Filter,
  G,
  Mask,
  Path,
  Rect,
} from "react-native-svg";

import type {
  AnnualContentRef,
  AnnualHighlightsData,
  AnnualKeptData,
  AnnualOverviewData,
  AnnualReport,
} from "../../domain/annualReport";
import type { LivingChapter, LivingReport } from "../../domain/livingReport";
import type {
  PersonalRecordCollection,
  PersonalRecordType,
} from "../../domain/personalRecords";
import { workspaceColors as color, workspaceRadii as radius } from "../workspace/workspaceTheme";
import {
  buildStoryModel,
  selectOpeningCovers,
  type StoryContentItem,
  type StoryHour,
  type StoryModel,
  type StoryOverlap,
  type StoryOverlapKey,
  type StoryStream as StoryStreamData,
  type StoryTopic,
} from "./storyModel";
import { OpeningReelGallery } from "./OpeningReelGallery";
import {
  fillOpeningRows,
  openingBorderGlowPose,
  openingMessageExitWindow,
  openingScrollTop,
  openingTransitionProgress,
  planOpeningDestinations,
  truncateOpeningParticleLabel,
} from "./openingParticlePhysics";

const MIN_STORY_WIDTH = 1024;
const CHAPTER_COUNT = 6;
const OPENING_STEP_COUNT = 12;
const OPENING_PARTICLE_SCALE = 1.28;
const OPENING_VISUAL_ROW_HEIGHT = 30;
const OPENING_LABEL_MAX_LENGTH = 8;
const OPENING_ROW_GAP = 12;
// Logo 液面和词条幕布共用这段进度。
const OPENING_TOTAL_DURATION = 6_500;
const OPENING_FADE_DELAY = 500;
const OPENING_FADE_DURATION = 900;
const OPENING_TRANSITION_SCROLL = 460;
const OPENING_REEL_COVERS_PER_STREAM = 30;
const NOTE_WIDTH = 220;
const NOTE_HEIGHT = 240;
const OPENING_LOGO_SCALE = 1.1;
const OPENING_LOGO_WIDTH = NOTE_WIDTH * OPENING_LOGO_SCALE;
const OPENING_LOGO_HEIGHT = NOTE_HEIGHT * OPENING_LOGO_SCALE;
const NOTE_VIEWBOX_WIDTH = 220;
const NOTE_VIEWBOX_HEIGHT = 240;
const NOTE_PATH = "M121 18H158C159 43 177 64 204 70V105C187 103 171 98 158 89V170C158 203 131 228 98 228C65 228 38 204 38 173C38 142 63 117 95 117C104 117 113 119 121 123V160C114 155 106 152 98 152C84 152 73 162 73 175C73 188 84 198 98 198C112 198 124 188 124 174L121 18Z";
const LIQUID_WAVE_PATH = "M-120 -2C-110 -2 -100 22 -90 22S-70 4 -60 4S-40 16 -30 16S-10 -2 0 -2S20 22 30 22S50 4 60 4S80 16 90 16S110 -2 120 -2S140 22 150 22S170 4 180 4S200 16 210 16S230 -2 240 -2S260 22 270 22S290 4 300 4S320 16 330 16S350 -2 360 -2";
const LIQUID_PATH = `${LIQUID_WAVE_PATH}L360 260L-120 260Z`;
const CURTAIN_WAVE_PATHS = [
  "M-120 18C-107 18 -95 -2 -82 -2C-57 -2 -33 24 -8 24C6 24 20 8 34 8C49 8 63 17 78 17C93 17 107 6 122 6C140 6 158 22 176 22C201 22 225 -1 250 -1C287 -1 323 18 360 18L360 -80L-120 -80Z",
  "M-120 16C-111 16 -103 7 -94 7C-77 7 -59 22 -42 22C-12 22 18 -2 48 -2C69 -2 91 20 112 20C128 20 144 8 160 8C177 8 193 28 210 28C236 28 262 3 288 3C312 3 336 16 360 16L360 -80L-120 -80Z",
  "M-120 20C-101 20 -81 2 -62 2C-35 2 -9 16 18 16C35 16 53 9 70 9C86 9 102 30 118 30C138 30 158 -2 178 -2C198 -2 218 21 238 21C261 21 285 6 308 6C325 6 343 20 360 20L360 -80L-120 -80Z",
] as const;
const LOGO_ENTRANCE_FRAGMENTS = [
  { key: "cap", top: -12, height: 72, revealAt: 0.02, arriveAt: 0.42, fromX: -72, fromY: 16, fromRotation: -7, overshootX: 8, color: "#25F4EE" },
  { key: "shoulder", top: 48, height: 70, revealAt: 0.07, arriveAt: 0.47, fromX: 64, fromY: -12, fromRotation: 6, overshootX: -7, color: "#FE2C55" },
  { key: "joint", top: 106, height: 74, revealAt: 0.12, arriveAt: 0.51, fromX: -56, fromY: 10, fromRotation: -5, overshootX: 6, color: "#25F4EE" },
  { key: "base", top: 168, height: 84, revealAt: 0.17, arriveAt: 0.55, fromX: 76, fromY: -14, fromRotation: 7, overshootX: -9, color: "#FE2C55" },
] as const;
const NOTE_WORD_MASK_URI = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${NOTE_VIEWBOX_WIDTH} ${NOTE_VIEWBOX_HEIGHT}"><path fill="white" d="${NOTE_PATH}"/></svg>`)}")`;
const OPENING_LOGO_SPOTLIGHT = Platform.OS === "web"
  ? ({
      backgroundImage: "radial-gradient(circle 24vmin at var(--opening-spotlight-x, -999px) var(--opening-spotlight-y, -999px), rgba(255,255,255,0.38) 0%, rgba(255,255,255,0.18) 52%, transparent 78%)",
      WebkitMaskImage: NOTE_WORD_MASK_URI,
      WebkitMaskPosition: "center",
      WebkitMaskRepeat: "no-repeat",
      WebkitMaskSize: `${OPENING_LOGO_WIDTH}px ${OPENING_LOGO_HEIGHT}px`,
      maskImage: NOTE_WORD_MASK_URI,
      maskPosition: "center",
      maskRepeat: "no-repeat",
      maskSize: `${OPENING_LOGO_WIDTH}px ${OPENING_LOGO_HEIGHT}px`,
      mixBlendMode: "screen",
    } as unknown as ViewStyle)
  : null;
// ReactBits GradientBlinds 的光斑核心；移除底色和百叶，只保留中性光与黑幕揭示。
const OPENING_SPOTLIGHT_VERTEX = `
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;
const OPENING_SPOTLIGHT_FRAGMENT = `
precision highp float;

uniform vec3 iResolution;
uniform vec2 iMouse;
uniform float iTime;
uniform float uNoise;
uniform float uSpotlightRadius;
uniform float uSpotlightSoftness;
uniform float uSpotlightOpacity;
varying vec2 vUv;

float rand(vec2 co) {
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv0 = fragCoord.xy / iResolution.xy;
  vec2 offset = vec2(iMouse.x / iResolution.x, iMouse.y / iResolution.y);
  vec2 spotlightDelta = uv0 - offset;
  float aspectCorrection = mix(1.0, iResolution.x / max(iResolution.y, 1.0), 0.24);
  spotlightDelta.x *= aspectCorrection;
  float d = length(spotlightDelta);
  float r = max(uSpotlightRadius, 1e-4);
  float dn = d / r;
  float spotlight = (1.0 - 2.0 * pow(dn, uSpotlightSoftness)) * uSpotlightOpacity;
  float grain = (rand(gl_FragCoord.xy + iTime) - 0.5) * uNoise;
  float reveal = clamp(spotlight + grain * 0.22, 0.0, 1.0);
  float light = clamp(
    pow(clamp(spotlight, 0.0, 1.0), 1.6) * 0.38 + grain * 0.08,
    0.0,
    reveal
  );

  float curtain = 1.0 - reveal;
  float layerAlpha = clamp(curtain + light, 0.0, 1.0);
  float lightMix = layerAlpha > 1e-4 ? light / layerAlpha : 0.0;
  fragColor = vec4(vec3(lightMix), layerAlpha);
}

void main() {
  mainImage(gl_FragColor, gl_FragCoord.xy);
}
`;
const OPENING_MESSAGE_LINES = ["你的内容世界", "已经有了形状"] as const;
type SvgGroupProps = React.ComponentProps<typeof G> & { collapsable?: boolean };
const SvgGroup = React.forwardRef<React.ComponentRef<typeof G>, SvgGroupProps>(function SvgGroup(
  { collapsable: _collapsable, ...props },
  ref,
) {
  return <G ref={ref} {...props} />;
});
const AnimatedSvgGroup = Animated.createAnimatedComponent(SvgGroup);
type SvgPathProps = React.ComponentProps<typeof Path> & { collapsable?: boolean };
const SvgPath = React.forwardRef<React.ComponentRef<typeof Path>, SvgPathProps>(function SvgPath(
  { collapsable: _collapsable, ...props },
  ref,
) {
  return <Path ref={ref} {...props} />;
});
const AnimatedSvgPath = Animated.createAnimatedComponent(SvgPath);
const ABSOLUTE_FILL: ViewStyle = { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 };
const WEB_POINTER = Platform.OS === "web" ? ({ cursor: "pointer" } as object) : null;
const WEB_NO_WRAP = Platform.OS === "web" ? ({ whiteSpace: "nowrap" } as unknown as TextStyle) : null;
const OPENING_BORDER_GLOW_WEB = Platform.OS === "web"
  ? ({
      WebkitMaskImage: "conic-gradient(from var(--cursor-angle, 45deg) at center, black 2.5%, transparent 10%, transparent 90%, black 97.5%)",
      boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.95), inset 0 0 5px rgba(255,255,255,0.48), 0 0 2px rgba(255,255,255,0.72), 0 0 8px rgba(255,255,255,0.38), 0 0 18px rgba(255,255,255,0.18)",
      maskImage: "conic-gradient(from var(--cursor-angle, 45deg) at center, black 2.5%, transparent 10%, transparent 90%, black 97.5%)",
      opacity: "calc(0.72 * (var(--edge-proximity, 70) - 30) / 70)",
      transition: "opacity 0.25s ease-out",
      willChange: "opacity",
    } as unknown as ViewStyle)
  : null;

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
  livingReport?: LivingReport | null;
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
  /** 进度层（自下而上 1..OPENING_STEP_COUNT），决定词条的出现顺序。 */
  revealStep: number;
  /** 全局出现次序，用于把词条预排到自下而上的固定行。 */
  revealOrder: number;
}

interface OpeningParticleLayout {
  x: number;
  y: number;
  width: number;
  fontSize: number;
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

interface OpeningWebglRevealProps {
  disabledRef: { readonly current: boolean };
  height: number;
  reducedMotion: boolean;
}

function OpeningWebglReveal({ disabledRef, height, reducedMotion }: OpeningWebglRevealProps) {
  const containerRef = useRef<View | null>(null);
  const logoSpotlightRef = useRef<View | null>(null);

  useEffect(() => {
    if (Platform.OS !== "web") return undefined;
    const container = containerRef.current as unknown as HTMLElement | null;
    const logoSpotlight = logoSpotlightRef.current as unknown as HTMLElement | null;
    const stage = container?.parentElement;
    if (!container || !logoSpotlight || !stage) return undefined;

    const renderer = new Renderer({
      dpr: window.devicePixelRatio || 1,
      alpha: true,
      antialias: true,
    });
    const gl = renderer.gl;
    const canvas = gl.canvas;
    gl.clearColor(0, 0, 0, 0);
    Object.assign(canvas.style, {
      display: "block",
      height: "100%",
      left: "0",
      pointerEvents: "none",
      position: "absolute",
      top: "0",
      width: "100%",
    });
    container.appendChild(canvas);

    const geometry = new Triangle(gl);
    const uniforms = {
      iResolution: { value: [1, 1, 1] },
      iMouse: { value: [-10_000, -10_000] },
      iTime: { value: 0 },
      uNoise: { value: 0.5 },
      uSpotlightRadius: { value: 0.38 },
      uSpotlightSoftness: { value: 1.35 },
      uSpotlightOpacity: { value: 1 },
    };
    const program = new Program(gl, {
      vertex: OPENING_SPOTLIGHT_VERTEX,
      fragment: OPENING_SPOTLIGHT_FRAGMENT,
      uniforms,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const mesh = new Mesh(gl, { geometry, program });

    const hideReveal = () => {
      uniforms.iMouse.value = [-10_000, -10_000];
      logoSpotlight.style.setProperty("--opening-spotlight-x", "-999px");
      logoSpotlight.style.setProperty("--opening-spotlight-y", "-999px");
    };
    const resize = () => {
      const rect = container.getBoundingClientRect();
      renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height));
      uniforms.iResolution.value = [canvas.width, canvas.height, canvas.width / canvas.height];
    };
    const followPointer = (event: PointerEvent) => {
      if (disabledRef.current) {
        hideReveal();
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const scale = renderer.dpr || 1;
      const x = (event.clientX - rect.left) * scale;
      const y = (rect.height - (event.clientY - rect.top)) * scale;
      uniforms.iMouse.value = [x, y];
      const spotlightRect = logoSpotlight.getBoundingClientRect();
      logoSpotlight.style.setProperty("--opening-spotlight-x", `${event.clientX - spotlightRect.left}px`);
      logoSpotlight.style.setProperty("--opening-spotlight-y", `${event.clientY - spotlightRect.top}px`);
    };

    resize();
    hideReveal();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    stage.addEventListener("pointermove", followPointer, { passive: true });
    stage.addEventListener("pointerleave", hideReveal);

    let frame = 0;
    const render = (time: number) => {
      if (disabledRef.current) hideReveal();
      uniforms.iTime.value = reducedMotion ? 0 : time * 0.001;
      renderer.render({ scene: mesh });
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      stage.removeEventListener("pointermove", followPointer);
      stage.removeEventListener("pointerleave", hideReveal);
      geometry.remove();
      program.remove();
      canvas.remove();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [disabledRef, reducedMotion]);

  return (
    <>
      <View
        accessibilityElementsHidden
        aria-hidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        ref={containerRef}
        style={[styles.openingWebglReveal, { height }]}
        testID="opening-webgl-reveal"
      />
      <View
        accessibilityElementsHidden
        aria-hidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        ref={logoSpotlightRef}
        style={[styles.openingLogoSpotlight, OPENING_LOGO_SPOTLIGHT]}
        testID="opening-logo-spotlight"
      />
    </>
  );
}

export function AnnualScrollStory({
  report,
  livingReport = null,
  records,
  sourceLabel,
  privacy,
  onEnterDashboard,
  copyProvider = localCopyProvider,
}: AnnualScrollStoryProps) {
  const { width, height } = useWindowDimensions();
  const compact = width < 1180;
  const openingSceneHeight = Math.max(1, height - 68);
  const sceneHeight = Math.max(650, height - 68);
  const model = useMemo(() => buildStoryModel(records), [records]);
  const storyContent = useMemo(() => collectStoryContent(model), [model]);
  const openingContent = useMemo(() => collectOpeningContent(model), [model]);
  const openingCovers = useMemo(
    () => selectOpeningCovers(model, OPENING_REEL_COVERS_PER_STREAM),
    [model],
  );
  const openingParticles = useMemo(
    () => buildOpeningParticles(model, openingContent, privacy),
    [model, openingContent, privacy],
  );
  const overview = report?.overview.data as AnnualOverviewData | undefined;
  const highlights = report?.highlights.data as AnnualHighlightsData | undefined;
  const kept = report?.kept.data as AnnualKeptData | undefined;
  const currentChapter = findLivingChapter(livingReport, "current");
  const rhythmChapter = findLivingChapter(livingReport, "rhythm");
  const shiftChapter = findLivingChapter(livingReport, "shift");
  const keptChapter = findLivingChapter(livingReport, "kept");
  const continuationChapter = findLivingChapter(livingReport, "continuation");
  const profileLabels = livingReport?.profile.axes
    .filter((axis) => axis.label)
    .map((axis) => axis.label)
    .join(" · ") ?? "";
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
  const [openingMessageReady, setOpeningMessageReady] = useState(false);
  const [openingStacked, setOpeningStacked] = useState(false);
  const [openingContinued, setOpeningContinued] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => (
    Platform.OS === "web"
    && typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ));
  const openingStepRef = useRef(0);
  const openingSequenceStarted = useRef(false);
  const openingContinuedRef = useRef(false);
  const openingForegroundFade = useRef<Animated.CompositeAnimation | null>(null);
  const openingReveal = useRef(new Animated.Value(0)).current;
  const openingForegroundOpacity = useRef(new Animated.Value(1)).current;
  const openingTransition = useRef(new Animated.Value(0)).current;
  const logoEntrance = useRef(new Animated.Value(0)).current;
  const logoNeon = useRef(new Animated.Value(1)).current;
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
    () => storyParticleLayouts(openingParticles, width, openingSceneHeight),
    [openingParticles, openingSceneHeight, width],
  );
  const openingProgress = Math.round((openingStep / OPENING_STEP_COUNT) * 100);
  const progressWidth = storyProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
    extrapolate: "clamp",
  });
  // Logo 液面和词条幕布共用 openingReveal（0..1），两边没有第二套计时器。
  const liquidTransform = openingReveal.interpolate({
    inputRange: [0, 1],
    outputRange: [`translate(0 ${NOTE_VIEWBOX_HEIGHT})`, "translate(0 -12)"],
    extrapolate: "clamp",
  });
  const waveTransform = liquidWave.interpolate({
    inputRange: [0, 1],
    outputRange: ["translate(0 0)", "translate(-120 0)"],
  });
  const curtainWavePath = liquidWave.interpolate({
    inputRange: [0, 0.34, 0.68, 1],
    easing: Easing.inOut(Easing.sin),
    outputRange: [CURTAIN_WAVE_PATHS[0], CURTAIN_WAVE_PATHS[1], CURTAIN_WAVE_PATHS[2], CURTAIN_WAVE_PATHS[0]],
  });
  const noteLeft = width / 2 - OPENING_LOGO_WIDTH / 2;
  const noteTop = openingSceneHeight / 2 - OPENING_LOGO_HEIGHT / 2;
  const openingWordLayerMask = Platform.OS === "web"
    ? ({
        WebkitMaskComposite: "xor",
        WebkitMaskImage: `linear-gradient(black, black), ${NOTE_WORD_MASK_URI}`,
        WebkitMaskPosition: `0 0, ${noteLeft}px ${noteTop}px`,
        WebkitMaskRepeat: "no-repeat, no-repeat",
        WebkitMaskSize: `100% 100%, ${OPENING_LOGO_WIDTH}px ${OPENING_LOGO_HEIGHT}px`,
        maskComposite: "exclude",
        maskImage: `linear-gradient(black, black), ${NOTE_WORD_MASK_URI}`,
        maskPosition: `0 0, ${noteLeft}px ${noteTop}px`,
        maskRepeat: "no-repeat, no-repeat",
        maskSize: `100% 100%, ${OPENING_LOGO_WIDTH}px ${OPENING_LOGO_HEIGHT}px`,
      } as unknown as ViewStyle)
    : null;
  const logoBodyOpacity = logoEntrance.interpolate({
    inputRange: [0, 0.36, 0.56, 0.8, 1],
    outputRange: [0, 0, 0.54, 1, 1],
    extrapolate: "clamp",
  });
  const logoBodyScale = logoEntrance.interpolate({
    inputRange: [0, 0.36, 0.56, 0.74, 0.9, 1],
    outputRange: [0.78, 0.78, 1.08, 0.96, 1.025, 1],
    extrapolate: "clamp",
  });
  const logoBodyTranslateY = logoEntrance.interpolate({
    inputRange: [0, 0.36, 0.56, 0.74, 0.9, 1],
    outputRange: [14, 14, -5, 3, -1, 0],
    extrapolate: "clamp",
  });
  const logoBodyRotation = logoEntrance.interpolate({
    inputRange: [0, 0.36, 0.56, 0.74, 0.9, 1],
    outputRange: ["-4deg", "-4deg", "1.4deg", "-0.8deg", "0.25deg", "0deg"],
    extrapolate: "clamp",
  });
  const logoLockFlash = logoEntrance.interpolate({
    inputRange: [0, 0.5, 0.58, 0.76, 1],
    outputRange: [0, 0, 0.92, 0, 0],
    extrapolate: "clamp",
  });
  const logoFragmentMotions = LOGO_ENTRANCE_FRAGMENTS.map((fragment) => ({
    opacity: logoEntrance.interpolate({
      inputRange: [0, fragment.revealAt, fragment.arriveAt, 0.8, 1],
      outputRange: [0, 0, 1, 0.18, 0],
      extrapolate: "clamp",
    }),
    translateX: logoEntrance.interpolate({
      inputRange: [0, fragment.arriveAt, 0.8, 1],
      outputRange: [fragment.fromX, fragment.overshootX, 0, 0],
      extrapolate: "clamp",
    }),
    translateY: logoEntrance.interpolate({
      inputRange: [0, fragment.arriveAt, 0.8, 1],
      outputRange: [fragment.fromY, -fragment.fromY * 0.18, 0, 0],
      extrapolate: "clamp",
    }),
    rotation: logoEntrance.interpolate({
      inputRange: [0, fragment.arriveAt, 0.8, 1],
      outputRange: [`${fragment.fromRotation}deg`, `${-fragment.fromRotation * 0.18}deg`, "0deg", "0deg"],
      extrapolate: "clamp",
    }),
    scale: logoEntrance.interpolate({
      inputRange: [0, fragment.arriveAt, 0.8, 1],
      outputRange: [0.86, 1.06, 1, 1],
      extrapolate: "clamp",
    }),
  }));

  const stopOpeningSequence = useCallback(() => {
    openingReveal.stopAnimation();
    openingForegroundFade.current?.stop();
    openingForegroundFade.current = null;
  }, [openingReveal]);

  useEffect(() => {
    return () => {
      stopOpeningSequence();
    };
  }, [stopOpeningSequence]);

  useEffect(() => {
    const listener = openingReveal.addListener(({ value }) => {
      const row = value <= 0
        ? 0
        : Math.min(OPENING_STEP_COUNT, Math.ceil(value * OPENING_STEP_COUNT));
      if (row === openingStepRef.current) return;
      openingStepRef.current = row;
      setOpeningStep(row);
    });
    return () => openingReveal.removeListener(listener);
  }, [openingReveal]);

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
    logoEntrance.stopAnimation();
    if (reducedMotion) {
      logoEntrance.setValue(1);
      return undefined;
    }
    logoEntrance.setValue(0);
    const animation = Animated.sequence([
      Animated.delay(40),
      Animated.timing(logoEntrance, {
        toValue: 0.5,
        duration: 560,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== "web",
      }),
      Animated.timing(logoEntrance, {
        toValue: 0.68,
        duration: 230,
        easing: Easing.out(Easing.quad),
        useNativeDriver: Platform.OS !== "web",
      }),
      Animated.delay(80),
      Animated.timing(logoEntrance, {
        toValue: 0.86,
        duration: 460,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: Platform.OS !== "web",
      }),
      Animated.timing(logoEntrance, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== "web",
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [logoEntrance, reducedMotion]);

  useEffect(() => {
    logoNeon.stopAnimation();
    if (reducedMotion || activeChapter !== 1 || openingForegroundHidden) {
      logoNeon.setValue(1);
      return undefined;
    }
    const flash = (toValue: number, duration: number) => Animated.timing(logoNeon, {
      toValue,
      duration,
      easing: Easing.linear,
      useNativeDriver: Platform.OS !== "web",
    });
    const animation = Animated.loop(Animated.sequence([
      Animated.delay(2_400),
      flash(0.48, 55), flash(1, 85), flash(0.72, 45), flash(1, 95),
      Animated.delay(2_300),
      flash(0.62, 60), flash(1, 110),
    ]));
    animation.start();
    return () => animation.stop();
  }, [activeChapter, logoNeon, openingForegroundHidden, reducedMotion]);

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
    if (Platform.OS !== "web") return undefined;
    const root = rootRef.current as unknown as HTMLElement | null;
    const bubbles = root
      ? Array.from(root.querySelectorAll<HTMLElement>("[data-opening-border-glow='true']"))
      : [];
    if (!root || bubbles.length === 0) return undefined;

    const hideGlows = () => bubbles.forEach((bubble) => bubble.style.setProperty("--edge-proximity", "70"));
    const followPointer = (event: PointerEvent) => {
      bubbles.forEach((bubble) => {
        const rect = bubble.getBoundingClientRect();
        const pose = openingBorderGlowPose(
          rect.width,
          rect.height,
          event.clientX - rect.left,
          event.clientY - rect.top,
        );
        bubble.style.setProperty("--edge-proximity", pose ? pose.edgeProximity.toFixed(3) : "70");
        if (pose) bubble.style.setProperty("--cursor-angle", `${pose.angle.toFixed(3)}deg`);
      });
    };

    root.addEventListener("pointermove", followPointer, { passive: true });
    root.addEventListener("pointerleave", hideGlows);
    return () => {
      root.removeEventListener("pointermove", followPointer);
      root.removeEventListener("pointerleave", hideGlows);
    };
  }, [openingParticles, width]);

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
    logoEntrance.stopAnimation();
    logoEntrance.setValue(1);
    stopOpeningSequence();
    setOpeningMessageReady(false);
    openingTransition.setValue(0);
    setOpeningForegroundHidden(false);
    openingForegroundOpacity.setValue(1);
    openingReveal.stopAnimation();
    openingReveal.setValue(0);

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
      openingStepRef.current = OPENING_STEP_COUNT;
      setOpeningStep(OPENING_STEP_COUNT);
      openingReveal.setValue(1);
      openingForegroundOpacity.setValue(0);
      setOpeningForegroundHidden(true);
      return;
    }

    Animated.timing(openingReveal, {
      toValue: 1,
      duration: OPENING_TOTAL_DURATION,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (!finished) return;
      openingStepRef.current = OPENING_STEP_COUNT;
      setOpeningStep(OPENING_STEP_COUNT);
      openingReveal.setValue(1);
      fadeForeground();
    });
  }, [
    openingForegroundOpacity,
    openingReveal,
    openingTransition,
    logoEntrance,
    reducedMotion,
    stopOpeningSequence,
  ]);

  const updateOpeningTransition = useCallback((scrollY: number) => {
    const progress = openingTransitionProgress(
      scrollY,
      OPENING_TRANSITION_SCROLL,
      openingMessageReady,
    );
    const visibleProgress = reducedMotion && progress > 0 ? 1 : progress;
    const stacked = visibleProgress >= 1;
    openingTransition.setValue(visibleProgress);
    setOpeningStacked((current) => current === stacked ? current : stacked);
  }, [openingMessageReady, openingTransition, reducedMotion]);

  useEffect(() => {
    const scroller = scrollRef.current?.getScrollableNode?.() as HTMLElement | undefined;
    updateOpeningTransition(scroller?.scrollTop ?? 0);
  }, [updateOpeningTransition]);

  const handleOpeningMessageComplete = useCallback(() => {
    setOpeningMessageReady(true);
  }, []);

  const continuePastOpening = useCallback(() => {
    if (!openingStacked || openingContinuedRef.current) return;
    openingContinuedRef.current = true;
    setOpeningContinued(true);
    const scrollToNextChapter = () => scrollRef.current?.scrollTo({
      y: sectionOffsets.current[1] ?? openingSceneHeight + OPENING_TRANSITION_SCROLL,
      animated: false,
    });
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.requestAnimationFrame(scrollToNextChapter);
    } else {
      scrollToNextChapter();
    }
  }, [openingSceneHeight, openingStacked]);

  const registerChapter = useCallback((index: number) => (event: LayoutChangeEvent) => {
    sectionOffsets.current[index - 1] = event.nativeEvent.layout.y;
  }, []);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const scrollY = openingScrollTop(
      contentOffset.y,
      OPENING_TRANSITION_SCROLL,
      openingMessageReady,
      openingContinuedRef.current,
    );
    if (scrollY !== contentOffset.y) scrollRef.current?.scrollTo({ y: scrollY, animated: false });
    updateOpeningTransition(scrollY);
    const scrollable = Math.max(1, contentSize.height - layoutMeasurement.height);
    storyProgress.setValue(Math.min(1, Math.max(0, scrollY / scrollable)));
    const marker = scrollY + event.nativeEvent.layoutMeasurement.height * 0.38;
    let next = 1;
    sectionOffsets.current.forEach((offset, index) => {
      if (Number.isFinite(offset) && marker >= offset) next = index + 1;
    });
    setActiveChapter((current) => current === next ? current : next);
  }, [openingMessageReady, storyProgress, updateOpeningTransition]);

  const handleHourWheel = useCallback((event: unknown) => {
    if (Platform.OS !== "web") return;
    const deltaY = (event as { nativeEvent?: { deltaY?: number } }).nativeEvent?.deltaY ?? 0;
    if (!deltaY) return;
    const next = (selectedHour + (deltaY > 0 ? 1 : -1) + 24) % 24;
    setSelectedHour(next);
  }, [selectedHour]);

  const storyScrollEnabled = openingContinued || (openingMessageReady && !openingStacked);

  useEffect(() => {
    if (Platform.OS !== "web") return undefined;
    const scroller = scrollRef.current?.getScrollableNode?.() as HTMLElement | undefined;
    if (!scroller) return undefined;
    scroller.style.overflowY = storyScrollEnabled ? "auto" : "hidden";
    scroller.style.touchAction = storyScrollEnabled ? "pan-y" : "none";
    scroller.style.cursor = storyScrollEnabled ? "grab" : "default";
    if (!storyScrollEnabled) return undefined;
    let dragging = false;
    let startY = 0;
    let startScrollTop = 0;
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("button, a, input, textarea, [role='button'], [data-testid='opening-reel-gallery']")) return;
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
  }, [storyScrollEnabled, width]);

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
            <Text style={styles.brandTitle}>内容故事</Text>
            <Text style={styles.brandMeta}>{sourceLabel} · {report.periodLabel}</Text>
          </View>
        </View>
        <View accessibilityLabel={`内容故事第 ${activeChapter} 章，共 ${CHAPTER_COUNT} 章`} accessibilityRole="progressbar" style={styles.progressWrap}>
          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
          </View>
          <Text style={styles.progressText}>{String(activeChapter).padStart(2, "0")} / 06</Text>
        </View>
        <Pressable
          accessibilityLabel="直接看持续报告"
          accessibilityRole="button"
          onPress={onEnterDashboard}
          style={({ pressed }) => [styles.skipButton, pressed && styles.buttonPressed, WEB_POINTER]}
        >
          <LayoutDashboard color={color.text} size={18} />
          <Text style={styles.skipButtonText}>直接看持续报告</Text>
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEnabled={storyScrollEnabled}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        style={styles.storyScroller}
        testID="story-scroll-view"
      >
        <View onLayout={registerChapter(1)} style={[styles.stickyChapter, { minHeight: openingSceneHeight + OPENING_TRANSITION_SCROLL }]}>
          <View style={[styles.scene, { minHeight: openingSceneHeight }, stickyStyle]}>
            <View style={styles.openingBackdrop} testID="opening-cover-collage">
              <OpeningReelGallery
                active={activeChapter === 1}
                height={openingSceneHeight}
                items={openingCovers}
                privacy={privacy}
                reducedMotion={reducedMotion}
                transitionProgress={openingTransition}
                width={width}
              />
              <OpeningStaggeredMessage
                active={openingForegroundHidden}
                onComplete={handleOpeningMessageComplete}
                reducedMotion={reducedMotion}
                transitionProgress={openingTransition}
              />
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
                viewBox={`0 0 ${width} ${openingSceneHeight}`}
                width="100%"
              >
                <Defs>
                  <ClipPath id="opening-foreground-note-clip">
                    <Path d={NOTE_PATH} />
                  </ClipPath>
                  <Mask
                    height={openingSceneHeight}
                    id="opening-foreground-cutout-mask"
                    maskUnits="userSpaceOnUse"
                    width={width}
                    x="0"
                    y="0"
                  >
                    <Rect fill="white" height={openingSceneHeight} width={width} />
                    <G
                      clipPath="url(#opening-foreground-note-clip)"
                      transform={`translate(${noteLeft} ${noteTop}) scale(${OPENING_LOGO_SCALE})`}
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
                  height={openingSceneHeight}
                  mask="url(#opening-foreground-cutout-mask)"
                  width={width}
                />
              </Svg>
              <View
                accessible
                accessibilityLabel={`内容已展开 ${openingProgress}%`}
                style={styles.openingParticleStage}
              >
                <View pointerEvents="none" style={[styles.openingWordLayer, openingWordLayerMask]} testID="opening-word-layer">
                  {openingParticles.map((item, index) => {
                    const layout = particleLayouts[index];
                    if (!layout) return null;
                    const displayLabel = truncateOpeningParticleLabel(item.label, OPENING_LABEL_MAX_LENGTH);
                    const hidden = item.revealStep > openingStep;
                    const itemHeight = openingParticleHeight(layout.fontSize);
                    const bubbleFrom = Math.min(0.96, Math.max(
                      0.02,
                      (openingSceneHeight / 2 + 24 - layout.y) / (openingSceneHeight + 50),
                    ));
                    const bubbleTo = Math.min(0.995, bubbleFrom + 0.085);
                    const bubbleInset = Math.max(3, layout.width * 0.04);
                    const bubbleScale = reducedMotion ? 1 : openingReveal.interpolate({
                      inputRange: [0, bubbleFrom, bubbleTo, 1],
                      outputRange: [0, 0, 1, 1],
                      easing: Easing.out(Easing.back(1.5)),
                      extrapolate: "clamp",
                    });
                    return (
                      <View
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
                            height: itemHeight + 2,
                            marginLeft: -layout.width / 2,
                            marginTop: -(itemHeight + 2) / 2,
                            transform: [
                              { translateX: layout.x },
                              { translateY: layout.y },
                            ],
                          },
                        ]}
                      >
                        <Animated.View
                          {...(Platform.OS === "web" ? {
                            dataSet: {
                              openingBorderGlow: "true",
                            },
                          } : {})}
                          style={[
                            styles.openingBubble,
                            {
                              left: bubbleInset,
                              right: bubbleInset,
                              transform: [{ scale: bubbleScale }],
                            },
                          ]}
                        >
                          <View style={styles.openingBubbleSurface} />
                          <View style={[styles.openingBubbleGlow, OPENING_BORDER_GLOW_WEB]} />
                        </Animated.View>
                        <Text
                          numberOfLines={Platform.OS === "web" ? undefined : 1}
                          style={[
                            item.kind === "tag" ? styles.floatingTag : item.kind === "title" ? styles.floatingTitle : styles.floatingCreator,
                            WEB_NO_WRAP,
                            {
                              alignSelf: "stretch",
                              marginHorizontal: bubbleInset + 6,
                              fontSize: layout.fontSize,
                              lineHeight: itemHeight,
                              textAlign: "center",
                            },
                          ]}
                          testID="opening-particle-text"
                        >
                          {displayLabel}
                          {item.count === undefined ? null : <Text style={styles.floatingCount}> {formatNumber(item.count)}</Text>}
                        </Text>
                      </View>
                    );
                  })}
                </View>
                <Animated.View
                  accessibilityElementsHidden
                  aria-hidden
                  importantForAccessibility="no-hide-descendants"
                  pointerEvents="none"
                  style={[
                    styles.openingWordCurtain,
                    {
                      height: openingSceneHeight + 40,
                      opacity: Platform.OS === "web" && openingStep === 0 ? 0 : 1,
                      transform: [{
                        translateY: openingReveal.interpolate({
                          inputRange: [0, 1],
                          outputRange: [10, -(openingSceneHeight + 40)],
                          extrapolate: "clamp",
                        }),
                      }],
                    },
                  ]}
                  testID="opening-word-curtain"
                >
                  <Svg
                    height="100%"
                    preserveAspectRatio="none"
                    viewBox={`-120 ${-openingSceneHeight} 480 ${openingSceneHeight + 40}`}
                    width="100%"
                  >
                    <Rect
                      fill={color.black}
                      height={Math.max(0, openingSceneHeight - 36)}
                      width="480"
                      x="-120"
                      y={-openingSceneHeight}
                    />
                    <AnimatedSvgPath d={curtainWavePath} fill={color.black} />
                  </Svg>
                </Animated.View>
                {Platform.OS === "web" && openingStep === 0 ? (
                  <OpeningWebglReveal
                    disabledRef={openingSequenceStarted}
                    height={openingSceneHeight + 40}
                    reducedMotion={reducedMotion}
                  />
                ) : null}
                <Pressable
                  accessibilityHint="点击一次后自动展开全部真实标签、视频标题和创作者"
                  accessibilityLabel={openingStep >= OPENING_STEP_COUNT
                    ? "内容已全部展开"
                    : openingStep > 0
                      ? "内容正在自动展开"
                      : "自动展开内容"}
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
                    style={[styles.logoProgress, { transform: [{ scale: OPENING_LOGO_SCALE }] }]}
                  >
                    {LOGO_ENTRANCE_FRAGMENTS.map((fragment, index) => {
                      const motion = logoFragmentMotions[index]!;
                      const glowId = `opening-logo-fragment-bloom-${fragment.key}`;
                      return (
                        <Animated.View
                          accessibilityElementsHidden
                          importantForAccessibility="no-hide-descendants"
                          key={fragment.key}
                          pointerEvents="none"
                          style={[
                            styles.logoFragment,
                            {
                              top: fragment.top,
                              height: fragment.height,
                              opacity: motion.opacity,
                              transform: [
                                { translateX: motion.translateX },
                                { translateY: motion.translateY },
                                { rotate: motion.rotation },
                                { scale: motion.scale },
                              ],
                            },
                          ]}
                          testID={`opening-logo-fragment-${fragment.key}`}
                        >
                          <Svg
                            height={300}
                            pointerEvents="none"
                            style={[styles.logoFragmentArtwork, { top: -30 - fragment.top }]}
                            viewBox="-30 -30 280 300"
                            width={280}
                          >
                            <Defs>
                              <Filter height="180%" id={glowId} width="180%" x="-40%" y="-40%">
                                <FeGaussianBlur stdDeviation={6} />
                              </Filter>
                            </Defs>
                            <Path d={NOTE_PATH} fill="#080B10" opacity={0.9} stroke={fragment.color} strokeLinejoin="round" strokeWidth={18} />
                            <Path d={NOTE_PATH} fill="none" filter={`url(#${glowId})`} opacity={0.42} stroke={fragment.color} strokeLinejoin="round" strokeWidth={24} />
                            <Path d={NOTE_PATH} fill="none" opacity={0.82} stroke="#F4F6FA" strokeLinejoin="round" strokeWidth={4} />
                          </Svg>
                        </Animated.View>
                      );
                    })}
                    <Animated.View
                      style={[
                        styles.logoEntryBody,
                        {
                          opacity: logoBodyOpacity,
                          transform: [
                            { translateY: logoBodyTranslateY },
                            { rotate: logoBodyRotation },
                            { scale: logoBodyScale },
                          ],
                        },
                      ]}
                    >
                      <Svg
                        accessibilityLabel="抖音音符标志"
                        height={300}
                        pointerEvents="none"
                        style={styles.logoArtwork}
                        viewBox="-30 -30 280 300"
                        width={280}
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
                          <Mask height={300} id="opening-logo-outer-mask" maskUnits="userSpaceOnUse" width={280} x={-30} y={-30}>
                            <Rect fill="white" height={300} width={280} x={-30} y={-30} />
                            <Path d={NOTE_PATH} fill="black" />
                          </Mask>
                          <Filter height="180%" id="opening-logo-edge-bloom" width="180%" x="-40%" y="-40%">
                            <FeGaussianBlur stdDeviation={7} />
                          </Filter>
                        </Defs>
                        <G mask="url(#opening-logo-outer-mask)">
                          <Path d={NOTE_PATH} fill="#0A0D12" opacity={0.96} stroke="#030406" strokeLinejoin="round" strokeWidth={8} transform="translate(10 12)" />
                          <Path d={NOTE_PATH} fill="none" opacity={0.72} stroke="#53616B" strokeLinejoin="round" strokeWidth={4} transform="translate(7 8)" />
                          <Path d={NOTE_PATH} fill="none" filter="url(#opening-logo-edge-bloom)" opacity={0.24} stroke="#62F8FF" strokeLinejoin="round" strokeWidth={24} transform="translate(-7 5)" />
                          <Path d={NOTE_PATH} fill="none" filter="url(#opening-logo-edge-bloom)" opacity={0.24} stroke="#62F8FF" strokeLinejoin="round" strokeWidth={24} transform="translate(7 -4)" />
                          <AnimatedSvgGroup opacity={logoNeon}>
                            <Path d={NOTE_PATH} fill="none" filter="url(#opening-logo-edge-bloom)" opacity={0.46} stroke="#62F8FF" strokeLinejoin="round" strokeWidth={24} transform="translate(-7 5)" />
                            <Path d={NOTE_PATH} fill="none" filter="url(#opening-logo-edge-bloom)" opacity={0.46} stroke="#62F8FF" strokeLinejoin="round" strokeWidth={24} transform="translate(7 -4)" />
                            <Path d={NOTE_PATH} fill="none" opacity={0.94} stroke="#D2FEFF" strokeLinejoin="round" strokeWidth={18} transform="translate(-7 5)" />
                            <Path d={NOTE_PATH} fill="none" opacity={0.94} stroke="#D2FEFF" strokeLinejoin="round" strokeWidth={18} transform="translate(7 -4)" />
                          </AnimatedSvgGroup>
                        </G>
                        <Path d={NOTE_PATH} fill="none" stroke="#25F4EE" strokeLinejoin="round" strokeWidth={14} transform="translate(-7 5)" />
                        <Path d={NOTE_PATH} fill="none" stroke="#FE2C55" strokeLinejoin="round" strokeWidth={14} transform="translate(7 -4)" />
                        <Rect fill="#F4F6FA" height={NOTE_VIEWBOX_HEIGHT} mask="url(#opening-logo-fill-mask)" width={NOTE_VIEWBOX_WIDTH} />
                        <AnimatedSvgGroup opacity={logoLockFlash}>
                          <Path d={NOTE_PATH} fill="none" filter="url(#opening-logo-edge-bloom)" stroke="#F4F6FA" strokeLinejoin="round" strokeWidth={28} />
                          <Path d={NOTE_PATH} fill="none" stroke="#FFFFFF" strokeLinejoin="round" strokeWidth={4} />
                        </AnimatedSvgGroup>
                      </Svg>
                    </Animated.View>
                  </View>
                </Pressable>
              </View>
            </Animated.View>
            {openingStacked && !openingContinued ? (
              <Pressable
                accessibilityHint="进入内容足迹"
                accessibilityLabel="进入下一页"
                accessibilityRole="button"
                onPress={continuePastOpening}
                style={[styles.openingContinue, WEB_POINTER]}
                testID="opening-continue"
              />
            ) : null}
          </View>
        </View>

        <View onLayout={registerChapter(2)} style={styles.chapter}>
          <View style={styles.sectionInner}>
            <SectionHeading
              chapter="02"
              eyebrow={currentChapter?.eyebrow ?? "内容足迹"}
              title={currentChapter?.title ?? "三条内容流，汇成同一段足迹。"}
              copy={livingChapterCopy(currentChapter, "观看、喜欢和收藏分别保留原始列表口径，再汇聚为去重内容总量。", privacy)}
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
                <Text style={styles.chapterNo}>CHAPTER 03 · {rhythmChapter?.eyebrow ?? "你的节拍"}</Text>
                <Text style={styles.sectionTitle}>{rhythmChapter?.title ?? <>一天里的哪一刻，{`\n`}内容最常出现？</>}</Text>
                <Text style={styles.lead}>{livingChapterCopy(rhythmChapter, "只使用可靠行为时间。方向键也可以切换小时。", privacy)}</Text>
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
              eyebrow={shiftChapter?.eyebrow ?? "偏好与创作者"}
              title={shiftChapter?.title ?? "显式标签，连接起内容与创作者。"}
              copy={livingChapterCopy(shiftChapter, "点击标签，只展示真实命中的代表内容与对应创作者。音乐和时长只作为辅助字段。", privacy)}
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
              eyebrow={keptChapter?.eyebrow ?? "真正留下的内容"}
              title={keptChapter?.title ?? "列表相遇的位置，才是可比较的交集。"}
              copy={livingChapterCopy(keptChapter, "交集只使用可比较 videoId；缺失标识的记录不会被猜测为同一内容。", privacy)}
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
              eyebrow={continuationChapter?.eyebrow ?? "故事还在继续"}
              title={continuationChapter?.title ?? "五个规则坐标，把故事落回真实内容。"}
              copy={livingChapterCopy(continuationChapter, "横向浏览代表内容，让故事落回真实记录。", privacy)}
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
                  label={livingReport ? livingHighlightLabel(definition.key) : definition.label}
                  onOpen={openHighlight}
                  privacy={privacy}
                  rule={livingReport ? livingHighlightRule(definition.key) : definition.rule}
                />
              ))}
            </ScrollView>
          </View>
          <View style={styles.finale}>
            <View style={styles.finaleMark} />
            <Text style={styles.finaleEyebrow}>YOUR CONTENT, STILL UNFOLDING</Text>
            <Text style={styles.finaleTitle}>这些内容不是答案，{`\n`}是仍在展开的坐标。</Text>
            <Text style={styles.finaleCopy}>{livingReport && profileLabels ? `当前样本更接近：${profileLabels}。` : "新的记录会继续改变这份内容报告。"}</Text>
            <Pressable
              accessibilityLabel="进入持续报告"
              accessibilityRole="button"
              onPress={onEnterDashboard}
              style={({ pressed }) => [styles.dashboardButton, pressed && styles.buttonPressed, WEB_POINTER]}
            >
              <Text style={styles.dashboardButtonText}>进入持续报告</Text>
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

function findLivingChapter(report: LivingReport | null, id: LivingChapter["id"]): LivingChapter | null {
  return report?.chapters.find((chapter) => chapter.id === id) ?? null;
}

function livingChapterCopy(chapter: LivingChapter | null, fallback: string, privacy: boolean): string {
  if (!chapter) return fallback;
  if (!privacy) return chapter.narrative;
  switch (chapter.id) {
    case "current": return "最近一段时间里，内容线索已经出现轮廓。";
    case "shift": return "近期内容线索的占比正在发生变化。";
    case "kept": return "列表之间存在可比较的交集，具体内容已隐藏。";
    case "profile": return "当前样本显示出一些行为倾向，但具体内容已隐藏。";
    default: return "新的记录会继续改变这一章。";
  }
}

function livingHighlightLabel(key: keyof AnnualHighlightsData): string {
  switch (key) {
    case "first": return "最早留下";
    case "last": return "最近新增";
    case "peakDay": return "内容密度峰值";
    case "longest": return "深看内容";
    case "mostEngaged": return "互动线索";
  }
}

function livingHighlightRule(key: keyof AnnualHighlightsData): string {
  switch (key) {
    case "first": return "最早的可靠行为时间";
    case "last": return "最近的可靠行为时间";
    case "peakDay": return "可靠行为时间的活跃峰值日";
    case "longest": return "按可用时长字段保留";
    case "mostEngaged": return "平台互动统计快照";
  }
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

function OpeningStaggeredMessage({
  active,
  onComplete,
  reducedMotion,
  transitionProgress,
}: {
  active: boolean;
  onComplete: () => void;
  reducedMotion: boolean;
  transitionProgress: Animated.Value;
}) {
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
    if (!active) return undefined;
    if (reducedMotion) {
      onComplete();
      return undefined;
    }
    const animation = Animated.stagger(
      80,
      charProgress.map((value) => Animated.timing(value, {
        toValue: 1,
        duration: 700,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== "web",
      })),
    );
    animation.start(({ finished }) => {
      if (finished) onComplete();
    });
    return () => animation.stop();
  }, [active, charProgress, onComplete, reducedMotion]);

  let charIndex = 0;
  return (
    <View pointerEvents="none" style={styles.openingMessage} testID="opening-staggered-message">
      {lineChars.map((line, lineIndex) => (
        <View key={`opening-message-line-${lineIndex}`} style={styles.openingMessageLine}>
          {line.map((char) => {
            const currentCharIndex = charIndex;
            const progress = charProgress[currentCharIndex]!;
            charIndex += 1;
            const [exitStart, exitEnd] = openingMessageExitWindow(currentCharIndex, charProgress.length);
            const exitVisibility = transitionProgress.interpolate({
              inputRange: [0, exitStart, exitEnd, 1],
              outputRange: [1, 1, 0, 0],
              extrapolate: "clamp",
            });
            const visibleProgress = Animated.multiply(progress, exitVisibility);
            const charAnimationStyle = {
              opacity: visibleProgress,
              transform: [
                { translateY: visibleProgress.interpolate({ inputRange: [0, 1], outputRange: [-18, 0] }) },
                { scale: visibleProgress.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
              ],
            };
            const webBlurStyle = Platform.OS === "web"
              ? ({ filter: visibleProgress.interpolate({ inputRange: [0, 1], outputRange: ["blur(9px)", "blur(0px)"] }) } as unknown as TextStyle)
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
      <Text style={styles.chapterNo}>CONTENT STORY / DESKTOP</Text>
      <Text style={styles.gateTitle}>滚动故事需要至少 1024px 的窗口宽度。</Text>
      <Text style={styles.gateCopy}>当前设备直接进入持续报告，完整数字和变化线索仍然可用。</Text>
      <Pressable accessibilityRole="button" onPress={onEnterDashboard} style={({ pressed }) => [styles.dashboardButton, pressed && styles.buttonPressed, WEB_POINTER]}>
        <Text style={styles.dashboardButtonText}>直接看持续报告</Text><ArrowRight color={color.white} size={20} />
      </Pressable>
    </View>
  );
}

function StoryEmpty({ onEnterDashboard }: { onEnterDashboard: () => void }) {
  return (
    <View style={styles.gateRoot} testID="story-empty-state">
      <View style={styles.gateMark}><Sparkles color={color.cyan} size={28} /></View>
      <Text style={styles.chapterNo}>CONTENT STORY / LOCAL ONLY</Text>
      <Text style={styles.gateTitle}>这一章还在形成。</Text>
      <Text style={styles.gateCopy}>完成一次读取并积累带可靠行为时间的记录后，内容故事会在进入内容库时出现。</Text>
      <Pressable accessibilityRole="button" onPress={onEnterDashboard} style={({ pressed }) => [styles.dashboardButton, pressed && styles.buttonPressed, WEB_POINTER]}>
        <Text style={styles.dashboardButtonText}>返回持续报告</Text><ArrowRight color={color.white} size={20} />
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

function buildOpeningParticles(
  model: StoryModel,
  content: readonly StoryContentItem[],
  privacy: boolean,
): OpeningParticle[] {
  const tags = model.topics;
  const titles: Array<{ key: string; label: string }> = [];
  const creators: Array<{ key: string; label: string }> = [];
  const seenTitles = new Set<string>();

  const addTitle = (item: StoryContentItem) => {
    const title = item.record.title.trim();
    const titleKey = title.toLocaleLowerCase("zh-Hans");
    const meaningfulLength = Array.from(title).filter((character) => /[\p{L}\p{N}]/u.test(character)).length;
    if (meaningfulLength <= 4 || seenTitles.has(titleKey)) return;
    titles.push({ key: item.key, label: title });
    seenTitles.add(titleKey);
  };

  // 超短标题缺少可辨识信息，开场只保留更完整的真实标题。
  content.forEach(addTitle);

  for (const item of content) {
    const creator = item.record.author?.trim();
    if (creator) creators.push({ key: item.key, label: creator });
  }

  const particles: Array<Omit<OpeningParticle, "revealOrder">> = [];
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
  return particles.map((item) => ({ ...item, revealOrder: releaseOrder.get(item.key) ?? 0 }));
}

function openingParticleAccessibilityLabel(item: OpeningParticle): string {
  if (item.kind === "tag") return `视频标签 ${item.label}${item.count === undefined ? "" : `，出现 ${item.count} 次`}`;
  if (item.kind === "title") return `视频标题 ${item.label}`;
  return `创作者 ${item.label.replace(/^@/u, "")}`;
}

function openingParticleHeight(fontSize: number): number {
  return fontSize * 1.18;
}

function estimateOpeningParticleWidth(item: OpeningParticle, fontSize: number): number {
  const label = truncateOpeningParticleLabel(item.label, OPENING_LABEL_MAX_LENGTH);
  const text = item.count === undefined ? label : `${label} ${formatNumber(item.count)}`;
  const glyphUnits = Array.from(text).reduce((total, character) => {
    if (/\s/u.test(character)) return total + 0.32;
    if (/[\u0021-\u007e]/u.test(character)) return total + 0.58;
    return total + 1;
  }, 0);
  const textWidth = glyphUnits * fontSize * 1.08;
  return Math.max(fontSize * 1.6, (textWidth + 16) / 0.92);
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

function storyParticleLayouts(
  items: readonly OpeningParticle[],
  width: number,
  height: number,
): Array<OpeningParticleLayout | null> {
  const narrow = width < 1180;
  const layouts = new Map<string, OpeningParticleLayout>();
  const maxRows = Math.min(items.length, Math.max(OPENING_STEP_COUNT, Math.round(height / OPENING_VISUAL_ROW_HEIGHT)));
  const measured = [...items]
    .sort((left, right) => left.revealOrder - right.revealOrder)
    .map((item) => {
      const hash = hashString(item.key);
      const fontSize = item.kind === "title"
        ? (narrow ? 12 + (hash % 5) : 14 + (hash % 7))
        : item.kind === "tag"
          ? (narrow ? 11 + (hash % 5) : 13 + (hash % 7))
          : (narrow ? 10 + (hash % 4) : 11 + (hash % 6));
      const scaledFontSize = fontSize * OPENING_PARTICLE_SCALE;
      return {
        item,
        fontSize: scaledFontSize,
        width: estimateOpeningParticleWidth(item, scaledFontSize),
      };
    });
  const rows = fillOpeningRows(
    measured,
    Math.max(1, width - 48),
    maxRows,
    OPENING_ROW_GAP,
  );

  rows.forEach((arranged, rowIndex) => {
    const destinations = planOpeningDestinations({
      seed: hashString(`opening-row:${rowIndex + 1}`),
      width,
      height,
      step: rowIndex + 1,
      stepCount: rows.length,
      itemGap: OPENING_ROW_GAP,
      items: arranged.map((item) => ({
        key: item.item.key,
        collisionWidth: item.width * 0.94,
        collisionHeight: openingParticleHeight(item.fontSize) * 0.92,
        displayWidth: item.width,
      })),
    });

    arranged.forEach(({ item, fontSize, width: itemWidth }) => {
      const position = destinations.get(item.key)!;
      layouts.set(item.key, {
        x: position.x,
        y: position.y,
        width: itemWidth,
        fontSize,
      });
    });
  });

  return items.map((item) => layouts.get(item.key) ?? null);
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
  openingMessage: { ...ABSOLUTE_FILL, zIndex: 3, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  openingMessageLine: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  openingMessageCharShell: { position: "relative" },
  openingMessageChar: { color: "rgba(255,255,255,0.72)", fontSize: 110, lineHeight: 112, fontWeight: "900", textShadowColor: "rgba(5,5,6,0.72)", textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 14 },
  openingMessageCharOutlineBlue: { position: "absolute", left: -2, top: 0, color: "transparent", textShadowColor: "rgba(37,244,238,0.82)", textShadowOffset: { width: -2, height: 0 }, textShadowRadius: 6, ...(Platform.OS === "web" ? ({ WebkitTextStroke: "1px rgba(37,244,238,0.9)", textShadow: "-2px 0 2px rgba(37,244,238,0.92), -4px 0 10px rgba(37,244,238,0.42)" } as unknown as TextStyle) : {}) },
  openingMessageCharOutlineRed: { position: "absolute", left: 2, top: 0, color: "transparent", textShadowColor: "rgba(254,44,85,0.82)", textShadowOffset: { width: 2, height: 0 }, textShadowRadius: 6, ...(Platform.OS === "web" ? ({ WebkitTextStroke: "1px rgba(254,44,85,0.9)", textShadow: "2px 0 2px rgba(254,44,85,0.92), 4px 0 10px rgba(254,44,85,0.42)" } as unknown as TextStyle) : {}) },
  openingForeground: { ...ABSOLUTE_FILL, zIndex: 5 },
  openingForegroundFill: { ...ABSOLUTE_FILL },
  openingParticleStage: { ...ABSOLUTE_FILL, zIndex: 4, alignItems: "center", justifyContent: "center" },
  openingWordLayer: { ...ABSOLUTE_FILL },
  openingWordCurtain: { position: "absolute", zIndex: 6, top: 0, left: 0, width: "100%" },
  openingWebglReveal: { position: "absolute", zIndex: 7, top: 10, left: 0, width: "100%", overflow: "hidden" },
  openingLogoSpotlight: { ...ABSOLUTE_FILL, zIndex: 11 },
  openingContinue: { ...ABSOLUTE_FILL, zIndex: 12 },
  chapterNo: { color: color.cyan, fontSize: 10, fontWeight: "900" },
  lead: { maxWidth: 640, color: color.textSecondary, fontSize: 16, lineHeight: 26, marginTop: 18 },
  floatingItem: { position: "absolute", zIndex: 4, left: "50%", top: "50%", justifyContent: "center" },
  openingBubble: { position: "absolute", top: 0, bottom: 0, borderRadius: 999 },
  openingBubbleSurface: { ...ABSOLUTE_FILL, borderWidth: 1, borderColor: "rgba(255,255,255,0.18)", borderRadius: 999, backgroundColor: "rgba(17,18,22,0.9)" },
  openingBubbleGlow: { ...ABSOLUTE_FILL, borderRadius: 999 },
  floatingTag: { color: "rgba(255,255,255,0.9)", fontWeight: "900", lineHeight: 26 * OPENING_PARTICLE_SCALE },
  floatingTitle: { color: "rgba(255,255,255,0.9)", fontWeight: "900", lineHeight: 29 * OPENING_PARTICLE_SCALE },
  floatingCreator: { color: "rgba(255,255,255,0.78)", fontWeight: "800", lineHeight: 23 * OPENING_PARTICLE_SCALE },
  floatingCount: { color: "rgba(255,255,255,0.62)", fontSize: 10 * OPENING_PARTICLE_SCALE, fontWeight: "900" },
  logoButton: { zIndex: 10, width: NOTE_WIDTH, height: NOTE_HEIGHT, alignItems: "center", justifyContent: "center" },
  logoButtonPressed: { opacity: 0.86, transform: [{ scale: 0.97 }] },
  logoProgress: { width: NOTE_WIDTH, height: NOTE_HEIGHT, alignItems: "center", justifyContent: "center" },
  logoFragment: { position: "absolute", zIndex: 2, left: -30, width: 280, overflow: "hidden" },
  logoFragmentArtwork: { position: "absolute", left: 0 },
  logoEntryBody: { ...ABSOLUTE_FILL, zIndex: 3, alignItems: "center", justifyContent: "center" },
  logoArtwork: { position: "absolute", left: -30, top: -30 },
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
