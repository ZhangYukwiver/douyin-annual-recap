import React, { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import {
  ArrowRight,
  Flame,
  Heart,
  Hourglass,
  LayoutDashboard,
  MoonStar,
  Play,
  Sparkles,
  Sunrise,
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
  topStreamTopic,
  type StoryContentItem,
  type StoryHour,
  type StoryModel,
  type StoryOverlap,
  type StoryOverlapKey,
  type StoryTopic,
} from "./storyModel";
import { ConfluenceFlow } from "./ConfluenceFlow";
import { DesktopCardSwap, type DesktopStoryStream } from "./DesktopCardSwap";
import { fluidSurfacePaths, type FluidSurfacePaths } from "./fluidSurface";
import { OpeningReelGallery } from "./OpeningReelGallery";
import { PixelSwap } from "./PixelSwap";
import {
  attachPixelSparks,
  attachPixelTrail,
  createPixelLayer,
  DECODE_STEP_MS,
  decodeFrame,
  decodePool,
  type PixelLayer,
} from "./pixelDecor";
import { RhythmEqualizer } from "./RhythmEqualizer";
import { SceneSection } from "./StoryBridge";
import { STORY_PARTICLE_COLORS, storyParticleColor, type StoryParticleColor } from "./storyPalette";
import { TopicBubbleField } from "./TopicBubbleField";
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
// 与 DesktopCardSwap 的舞台同色，第二章之后的章节都落在这块黑底上。
const STAGE_CANVAS = "#090B0F";
const STAGE_TEXT = "#F4F6FA";
// 物件向右越过画幅的像素数，StoryBridge 的落点几何用同一个值。
// 上限由第五章定：ConfluenceFlow 把落点节点放在自身宽度的 90%，出血再大就把它推出画幅。
const STAGE_BLEED = 24;

// 每一章一套背景：墨底都留在 #09 系，但光和质地一路从深夜走到破晓；
// 转场屏的背景是前后两章的交叠，所以「每屏不同」本身也在叙事。
// 质地一律用能自铺的 repeating-* 渐变，省掉 backgroundSize（RN Web 只稳定透传 backgroundImage）。
interface StageAtmosphere {
  base: string;
  layers: readonly string[];
}

type StageAtmosphereKey =
  | "bridgeRhythm"
  | "rhythm"
  | "bridgePreference"
  | "preference"
  | "bridgeKept"
  | "kept"
  | "bridgeContinuation"
  | "continuation"
  | "finale";

const STAGE_ATMOSPHERES: Record<StageAtmosphereKey, StageAtmosphere> = {
  // 02 → 03：左边还留着桌面那屏的青光，右边已经压进夜里的蓝紫。
  bridgeRhythm: {
    base: "#070A10",
    layers: [
      "radial-gradient(circle at 22% 44%, rgba(37,244,238,0.11), transparent 32%)",
      "radial-gradient(ellipse 90% 74% at 90% 66%, rgba(88,110,255,0.10), transparent 60%)",
      "linear-gradient(100deg, #090B0F 0%, #070A10 100%)",
    ],
  },
  // 03 深夜：光从画幅底部漫上来，同心环大致压在表盘所在的位置。
  rhythm: {
    base: "#070A10",
    layers: [
      "repeating-radial-gradient(circle at 75% 54%, transparent 0 57px, rgba(244,246,250,0.024) 57px 58px)",
      "radial-gradient(ellipse 130% 70% at 50% 112%, rgba(37,244,238,0.13), transparent 62%)",
      "radial-gradient(circle at 78% 44%, rgba(37,244,238,0.06), transparent 40%)",
    ],
  },
  // 03 → 04：深夜的冷光退到左下，右边开始冒出粉和青柠。
  bridgePreference: {
    base: "#0A0910",
    layers: [
      "radial-gradient(ellipse 84% 92% at 10% 104%, rgba(37,244,238,0.11), transparent 62%)",
      "radial-gradient(circle at 72% 30%, rgba(255,93,206,0.08), transparent 38%)",
      "radial-gradient(circle at 90% 74%, rgba(184,245,0,0.06), transparent 34%)",
      "linear-gradient(96deg, #070A10 0%, #0A0910 100%)",
    ],
  },
  // 04 星丛：六团标签色光斑 + 交叉细纹，全片最杂最亮的一屏。
  preference: {
    base: "#0A0910",
    layers: [
      "repeating-linear-gradient(45deg, rgba(244,246,250,0.035) 0 1px, transparent 1px 5px)",
      "repeating-linear-gradient(-45deg, rgba(244,246,250,0.025) 0 1px, transparent 1px 5px)",
      "radial-gradient(circle at 74% 42%, rgba(37,244,238,0.09), transparent 26%)",
      "radial-gradient(circle at 90% 25%, rgba(254,44,85,0.07), transparent 22%)",
      "radial-gradient(circle at 63% 19%, rgba(184,245,0,0.05), transparent 20%)",
      "radial-gradient(circle at 90% 62%, rgba(255,176,0,0.05), transparent 22%)",
      "radial-gradient(circle at 60% 67%, rgba(255,93,206,0.05), transparent 20%)",
      "radial-gradient(circle at 76% 78%, rgba(109,140,255,0.05), transparent 22%)",
    ],
  },
  // 04 → 05：散开的彩色光斑往右收，聚成一条横向亮带。
  bridgeKept: {
    base: "#080B0E",
    layers: [
      "repeating-linear-gradient(to bottom, rgba(244,246,250,0.012) 0 1px, transparent 1px 7px)",
      "radial-gradient(circle at 18% 28%, rgba(255,93,206,0.07), transparent 30%)",
      "radial-gradient(circle at 34% 72%, rgba(184,245,0,0.05), transparent 28%)",
      "radial-gradient(ellipse 70% 42% at 88% 50%, rgba(37,244,238,0.10), transparent 66%)",
      "linear-gradient(94deg, #0A0910 0%, #080B0E 100%)",
    ],
  },
  // 05 河谷：一条横贯中部的宽光带就是三条河交汇的位置，层理给沉积感。
  kept: {
    base: "#080B0E",
    layers: [
      "repeating-linear-gradient(to bottom, rgba(244,246,250,0.020) 0 1px, transparent 1px 7px)",
      "radial-gradient(ellipse 76% 34% at 62% 50%, rgba(37,244,238,0.12), transparent 70%)",
      "radial-gradient(ellipse 40% 28% at 100% 22%, rgba(254,44,85,0.06), transparent 70%)",
      "radial-gradient(ellipse 40% 28% at 100% 78%, rgba(244,196,94,0.06), transparent 70%)",
    ],
  },
  // 05 → 06：全片唯一一次色温翻转，冷光留在左侧，右下角起琥珀。
  bridgeContinuation: {
    base: "#0C0A09",
    layers: [
      "repeating-linear-gradient(to bottom, rgba(244,246,250,0.014) 0 1px, transparent 1px 3px)",
      "radial-gradient(ellipse 62% 42% at 12% 50%, rgba(37,244,238,0.09), transparent 68%)",
      "radial-gradient(ellipse 78% 74% at 94% 92%, rgba(244,196,94,0.12), transparent 64%)",
      "linear-gradient(92deg, #080B0E 0%, #0C0A09 100%)",
    ],
  },
  // 06 破晓：暖光从卡组所在的右下角升起，密扫描线像旧档案的纸纹。
  continuation: {
    base: "#0C0A09",
    layers: [
      "repeating-linear-gradient(to bottom, rgba(244,246,250,0.026) 0 1px, transparent 1px 3px)",
      "radial-gradient(ellipse 96% 76% at 84% 96%, rgba(244,196,94,0.13), transparent 62%)",
      "radial-gradient(ellipse 60% 50% at 96% 62%, rgba(254,44,85,0.08), transparent 66%)",
      "radial-gradient(circle at 22% 24%, rgba(37,244,238,0.05), transparent 40%)",
    ],
  },
  // 尾声：回到调色板真正的黑，青红两团光错开半格（就是标题重影那半格），暗角收视线。
  finale: {
    base: "#050506",
    layers: [
      "repeating-linear-gradient(45deg, rgba(244,246,250,0.028) 0 1px, transparent 1px 6px)",
      "radial-gradient(ellipse 104% 84% at 50% 50%, transparent 38%, rgba(0,0,0,0.74) 100%)",
      "radial-gradient(circle at 46% 43%, rgba(37,244,238,0.13), transparent 34%)",
      "radial-gradient(circle at 55% 57%, rgba(254,44,85,0.11), transparent 34%)",
    ],
  },
};

// backgroundImage 只有 react-native-web 认；原生端退回纯底色。
function atmosphereStyle(key: StageAtmosphereKey): ViewStyle {
  const atmosphere = STAGE_ATMOSPHERES[key];
  if (Platform.OS !== "web") return { backgroundColor: atmosphere.base };
  return {
    backgroundColor: atmosphere.base,
    backgroundImage: atmosphere.layers.join(", "),
  } as unknown as ViewStyle;
}

function atmosphereCss(key: StageAtmosphereKey): React.CSSProperties {
  const atmosphere = STAGE_ATMOSPHERES[key];
  return { backgroundColor: atmosphere.base, backgroundImage: atmosphere.layers.join(", ") };
}
const CHAPTER_COUNT = 6;
const PROGRESS_SEGMENTS = [1, 2, 3, 4, 5, 6] as const;
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
const OPENING_CURSOR_LOGO_URI = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="-14 -14 248 268"><path d="${NOTE_PATH}" fill="#25F4EE" transform="translate(-7 5)"/><path d="${NOTE_PATH}" fill="#FE2C55" transform="translate(7 -4)"/><path d="${NOTE_PATH}" fill="#F7F7F8"/></svg>`)}`;
const USER_DESKTOP_WALLPAPER_URI = (require("./assets/user-desktop-wallpaper.jpg") as { uri: string }).uri;
// 液面几何：注意符 viewBox 坐标系里的采样跨度与封口边。
const FLUID_FILL_SURFACE = {
  baselineY: 8,
  amplitude: 16,
  idleAmplitude: 5,
  spanStart: -120,
  spanEnd: 360,
  closeY: 260,
} as const;
const FLUID_CURTAIN_SURFACE = {
  baselineY: 12,
  amplitude: 26,
  idleAmplitude: 8,
  spanStart: -120,
  spanEnd: 360,
  closeY: -60,
} as const;
// openingReveal 的满速约 0.3/s（easeInOut 峰值），映射到扰动强度 1。
const FLUID_FULL_AGITATION_VELOCITY = 0.28;
const NOTE_WORD_MASK_URI = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${NOTE_VIEWBOX_WIDTH} ${NOTE_VIEWBOX_HEIGHT}"><path fill="white" d="${NOTE_PATH}"/></svg>`)}")`;
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
const ABSOLUTE_FILL: ViewStyle = { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 };
const WEB_POINTER = Platform.OS === "web" ? ({ cursor: "pointer" } as object) : null;
const OPENING_LOGO_CURSOR = Platform.OS === "web"
  ? ({ cursor: `url("${OPENING_CURSOR_LOGO_URI}") 18 18, pointer` } as unknown as ViewStyle)
  : null;
const WEB_NO_WRAP = Platform.OS === "web" ? ({ whiteSpace: "nowrap" } as unknown as TextStyle) : null;
const HIGHLIGHT_CARD_WEB = Platform.OS === "web"
  ? ({
      transition: "transform 0.18s ease-out, box-shadow 0.28s ease",
      willChange: "transform",
    } as unknown as ViewStyle)
  : null;
const HIGHLIGHT_SHEEN_WEB = Platform.OS === "web"
  ? ({
      backgroundImage: "radial-gradient(circle at var(--sheen-x, 50%) var(--sheen-y, 38%), rgba(255,255,255,0.13), transparent 56%)",
      opacity: "var(--sheen-opacity, 0)",
      transition: "opacity 0.3s ease",
    } as unknown as ViewStyle)
  : null;
const FINALE_GHOST_CYAN_WEB = Platform.OS === "web"
  ? ({ WebkitTextStroke: "1px rgba(37,244,238,0.75)", textShadow: "-3px 0 10px rgba(37,244,238,0.35)" } as unknown as TextStyle)
  : null;
const FINALE_GHOST_RED_WEB = Platform.OS === "web"
  ? ({ WebkitTextStroke: "1px rgba(254,44,85,0.75)", textShadow: "3px 0 10px rgba(254,44,85,0.35)" } as unknown as TextStyle)
  : null;
const DASHBOARD_BUTTON_GLOW_WEB = Platform.OS === "web"
  ? ({ boxShadow: "0 0 18px rgba(254,44,85,0.45), 0 0 44px rgba(254,44,85,0.2)" } as unknown as ViewStyle)
  : null;
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
const OVERLAP_ACCENTS: Record<StoryOverlapKey, string> = {
  watchLiked: color.cyan,
  watchFavorite: color.amber,
  likedFavorite: color.accent,
  allThree: color.green,
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

type HighlightIcon = React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;

const highlightDefinitions: Array<{
  key: keyof AnnualHighlightsData;
  label: string;
  rule: string;
  accent: string;
  icon: HighlightIcon;
}> = [
  { key: "first", label: "首条记录", rule: "按可靠行为时间排序", accent: color.cyan, icon: Sunrise },
  { key: "last", label: "末条记录", rule: "按可靠行为时间排序", accent: color.green, icon: MoonStar },
  { key: "peakDay", label: "峰值日代表", rule: "活跃峰值日中的代表内容", accent: color.accent, icon: Flame },
  { key: "longest", label: "最长内容", rule: "按可用时长字段排序", accent: color.amber, icon: Hourglass },
  { key: "mostEngaged", label: "互动快照最高", rule: "按平台互动统计快照合计", accent: color.cyan, icon: Heart },
];

interface OpeningWebglRevealProps {
  disabledRef: { readonly current: boolean };
  height: number;
  reducedMotion: boolean;
}

function OpeningWebglReveal({ disabledRef, height, reducedMotion }: OpeningWebglRevealProps) {
  const containerRef = useRef<View | null>(null);

  useEffect(() => {
    if (Platform.OS !== "web") return undefined;
    const container = containerRef.current as unknown as HTMLElement | null;
    const stage = container?.parentElement;
    if (!container || !stage) return undefined;

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
    <View
      accessibilityElementsHidden
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      ref={containerRef}
      style={[styles.openingWebglReveal, { height }]}
      testID="opening-webgl-reveal"
    />
  );
}

interface OpeningFluidSurfaceProps {
  reveal: Animated.Value;
  active: boolean;
  reducedMotion: boolean;
  surface: {
    baselineY: number;
    amplitude: number;
    idleAmplitude: number;
    spanStart: number;
    spanEnd: number;
    closeY: number;
  };
  fill: string;
  /** 沿液面画一条青色光边（词条幕布用）。 */
  showSurfaceGlow?: boolean;
}

/**
 * 流体液面：波形由多个不可通约频率叠加（无可见循环），
 * 波幅跟随 openingReveal 的上升速度——涨得快时涌动，停下后回落成微幅涟漪。
 */
function OpeningFluidSurface({
  reveal,
  active,
  reducedMotion,
  surface,
  fill,
  showSurfaceGlow = false,
}: OpeningFluidSurfaceProps) {
  const [paths, setPaths] = useState<FluidSurfacePaths>(() => fluidSurfacePaths({
    timeMs: 0,
    agitation: 0,
    ...surface,
  }));

  useEffect(() => {
    if (reducedMotion) {
      setPaths(fluidSurfacePaths({ timeMs: 4_200, agitation: 0.3, ...surface }));
      return undefined;
    }
    if (!active || typeof requestAnimationFrame !== "function") return undefined;

    let latestReveal: number | null = null;
    const listener = reveal.addListener(({ value }) => {
      latestReveal = value;
    });

    let frame = 0;
    let lastValue: number | null = null;
    let lastTime: number | null = null;
    let smoothedVelocity = 0;
    const step = (now: number) => {
      frame = requestAnimationFrame(step);
      if (lastTime === null || latestReveal === null) {
        lastTime = now;
        lastValue = latestReveal;
        return;
      }
      const dt = Math.max(1, now - lastTime) / 1000;
      const velocity = lastValue === null ? 0 : Math.abs(latestReveal - lastValue) / dt;
      lastValue = latestReveal;
      lastTime = now;
      smoothedVelocity += (velocity - smoothedVelocity) * Math.min(1, dt * 6);
      setPaths(fluidSurfacePaths({
        timeMs: now,
        agitation: smoothedVelocity / FLUID_FULL_AGITATION_VELOCITY,
        ...surface,
      }));
    };
    frame = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(frame);
      reveal.removeListener(listener);
    };
  }, [active, reducedMotion, reveal, surface]);

  return (
    <>
      <Path d={paths.body} fill={fill} />
      {showSurfaceGlow ? (
        <>
          <Path d={paths.surface} fill="none" stroke="rgba(37,244,238,0.28)" strokeWidth={7} vectorEffect="non-scaling-stroke" />
          <Path d={paths.surface} fill="none" stroke="rgba(210,254,255,0.85)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        </>
      ) : null}
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
  const openingSceneHeight = Math.max(1, height - 68);
  const sceneHeight = Math.max(650, height - 68);
  const model = useMemo(() => buildStoryModel(records), [records]);
  const storyContent = useMemo(() => collectStoryContent(model), [model]);
  const openingContent = useMemo(() => collectOpeningContent(model), [model]);
  const openingCovers = useMemo(
    () => selectOpeningCovers(model, OPENING_REEL_COVERS_PER_STREAM),
    [model],
  );
  const desktopStreams = useMemo<DesktopStoryStream[]>(() => {
    // 观看卡的词条取最近窗口的头号线索（与"这 N 天"口径一致）；
    // 喜欢/收藏没有窗口分析，取各自列表的最高频话题
    const recentTerm = findLivingChapter(livingReport, "current")?.signals[0]?.label ?? null;
    const likedTopic = topStreamTopic(model.streams.liked_videos.records);
    const favoriteTopic = topStreamTopic(model.streams.favorite_videos.records);
    return [
      {
        key: "watch_history",
        label: "观看",
        accent: color.cyan,
        count: model.streams.watch_history.uniqueCount,
        records: model.streams.watch_history.records,
        term: recentTerm,
      },
      {
        key: "liked_videos",
        label: "喜欢",
        accent: color.accent,
        count: model.streams.liked_videos.uniqueCount,
        records: model.streams.liked_videos.records,
        term: likedTopic ? `#${likedTopic}` : null,
      },
      {
        key: "favorite_videos",
        label: "收藏",
        accent: color.amber,
        count: model.streams.favorite_videos.uniqueCount,
        records: model.streams.favorite_videos.records,
        term: favoriteTopic ? `#${favoriteTopic}` : null,
      },
    ];
  }, [model, livingReport]);
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
  const [openingPixelSwapActive, setOpeningPixelSwapActive] = useState(false);
  const [desktopOpened, setDesktopOpened] = useState(false);
  const [logoFocused, setLogoFocused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => (
    Platform.OS === "web"
    && typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ));
  const openingStepRef = useRef(0);
  const openingSequenceStarted = useRef(false);
  const openingContinuedRef = useRef(false);
  const openingPixelSwapInFlight = useRef(false);
  const openingForegroundFade = useRef<Animated.CompositeAnimation | null>(null);
  const openingReveal = useRef(new Animated.Value(0)).current;
  const openingForegroundOpacity = useRef(new Animated.Value(1)).current;
  const openingTransition = useRef(new Animated.Value(0)).current;
  const logoNeon = useRef(new Animated.Value(0)).current;
  const storyProgress = useRef(new Animated.Value(0)).current;
  const rootRef = useRef<View | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);
  const sectionOffsets = useRef<number[]>([]);

  const selectedHourData = model.hours[selectedHour] ?? model.hours[0]!;
  const selectedTopicData = model.topics.find((topic) => topic.name === selectedTopic) ?? model.topics[0] ?? null;
  const selectedTopicIndex = selectedTopicData ? model.topics.findIndex((topic) => topic.name === selectedTopicData.name) : -1;
  // 与 TopicBubbleField 用同一个种子，标题词条的颜色和气泡颜色一致。
  const selectedTopicAccent = selectedTopicData ? storyParticleColor(`topic-bubble:${selectedTopicData.name}`).text : color.cyan;

  // 转场取的是两侧章节的真实数据，接缝处的刻度长度、气泡大小才和下一屏对得上。
  const bridgeHours = useMemo(() => model.hours.map((entry) => entry.count), [model.hours]);
  const bridgeTopics = useMemo(() => model.topics.slice(0, 12).map((topic, index) => ({
    label: privacy ? `话题 ${index + 1}` : `#${topic.name}`,
    count: topic.count,
    color: storyParticleColor(`topic-bubble:${topic.name}`).text,
  })), [model.topics, privacy]);
  const bridgeNodes = useMemo(() => (["allThree", "watchLiked", "watchFavorite", "likedFavorite"] as const)
    .map((key) => ({ label: OVERLAP_LABELS[key], color: OVERLAP_ACCENTS[key] })), []);
  const bridgeCardLabels = useMemo(
    () => highlightDefinitions.map((definition) => (livingReport ? livingHighlightLabel(definition.key) : definition.label)),
    [livingReport],
  );

  // 三段场景内形变的文案与数据；kind 对应「本章物件 → 下一章物件」。
  const bridgeSpecs = useMemo(() => ({
    lead: {
      kind: "cardsToDial" as const,
      hours: bridgeHours,
      eyebrow: "CHAPTER 02 → 03",
      line1: "看过什么之后，",
      line2: "该问什么时候看的了。",
      copy: "三叠卡片的封面格摊平，按小时重新排成一圈——下一屏的表盘，就是这些格子换了一套坐标系。",
    },
    rhythm: {
      kind: "dialToBubbles" as const,
      hours: bridgeHours,
      topics: bridgeTopics,
      eyebrow: "CHAPTER 03 → 04",
      line1: "知道了什么时候，",
      line2: "再看是什么在吸引你。",
      copy: "刻度从环上松开浮起，一半聚成标签气泡，一半安静退场——时间让位给偏好。",
    },
    preference: {
      kind: "bubblesToStreams" as const,
      topics: bridgeTopics,
      eyebrow: "CHAPTER 04 → 05",
      line1: "标签之外，",
      line2: "还有真正留下来的。",
      copy: "气泡沉进三条列表的源头，观看、喜欢、收藏各自成河——从「喜欢什么」转到「留下了什么」。",
    },
    kept: {
      kind: "nodesToCards" as const,
      nodes: bridgeNodes,
      cardLabels: bridgeCardLabels,
      eyebrow: "CHAPTER 05 → 06",
      line1: "留下来的里面，",
      line2: "有几个格外具体的坐标。",
      copy: "四个交集节点松开、排队，摊成六章的五张坐标卡——故事在这里落回真实记录。",
    },
  }), [bridgeCardLabels, bridgeHours, bridgeNodes, bridgeTopics]);
  const chapterTopSetters = useMemo(
    () => [3, 4, 5, 6].map((index) => (y: number) => {
      sectionOffsets.current[index - 1] = y;
    }),
    [],
  );
  const selectedOverlapData = model.overlaps[selectedOverlap];
  // 第三到第六章共用的舞台尺寸：卡片按视口高等比收缩，卡头 72 + 描述条 44 之后剩下的给物件。
  const stageCardHeight = Math.round(Math.min(760, sceneHeight * 0.84));
  const stageBodyHeight = stageCardHeight - 116;
  const rhythmDiscScale = Math.min(1, (stageBodyHeight - 24) / 540);
  const openingStickyStyle = Platform.OS === "web"
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
  // 装饰颗粒的颜色跟着当前章走：星丛用红、破晓用琥珀，其余留在青。
  const pixelAccent = activeChapter === 4 ? color.accent : activeChapter === 6 ? color.amber : color.cyan;
  const pixelAccentRef = useRef(pixelAccent);
  pixelAccentRef.current = pixelAccent;
  const pixelLayerRef = useRef<PixelLayer | null>(null);
  // Logo 液面和词条幕布共用 openingReveal（0..1）决定水位；波形扰动由 OpeningFluidSurface 按上升速度实时生成。
  const liquidTransform = openingReveal.interpolate({
    inputRange: [0, 1],
    outputRange: [`translate(0 ${NOTE_VIEWBOX_HEIGHT})`, "translate(0 -12)"],
    extrapolate: "clamp",
  });
  // 液面动效只在揭示进行中运行；揭示前不可见，前景淡出后停表。
  const fluidActive = openingStep > 0 && !openingForegroundHidden;
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

  // 指针余迹：整条故事线共用一层，颜色由 pixelAccentRef 随章切换，
  // 所以这层只在挂载时建一次，不跟着章节重挂。
  useEffect(() => {
    if (Platform.OS !== "web" || reducedMotion) return undefined;
    const layer = createPixelLayer(rootRef.current as unknown as HTMLElement | null);
    if (!layer) return undefined;
    pixelLayerRef.current = layer;
    const detach = attachPixelTrail(layer, layer.element.parentElement!, () => pixelAccentRef.current);
    return () => {
      detach();
      layer.destroy();
      pixelLayerRef.current = null;
    };
  }, [reducedMotion]);

  // 第六章的规则卡：悬停时沿卡缘冒暖色火花。
  useEffect(() => {
    if (Platform.OS !== "web" || reducedMotion || activeChapter !== 6) return undefined;
    const layer = pixelLayerRef.current;
    const root = rootRef.current as unknown as HTMLElement | null;
    if (!layer || !root) return undefined;
    const cards = Array.from(root.querySelectorAll<HTMLElement>("[data-highlight-card='true']"));
    const detachers = cards.map((card) => attachPixelSparks(
      layer,
      card,
      () => card.dataset.highlightAccent || pixelAccentRef.current,
    ));
    return () => detachers.forEach((detach) => detach());
  }, [activeChapter, reducedMotion]);

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

  // 第六章卡片：指针跟随的 3D 倾斜和光泽扫过（与词条描边光同一套 DOM 模式）。
  useEffect(() => {
    if (Platform.OS !== "web" || reducedMotion) return undefined;
    const root = rootRef.current as unknown as HTMLElement | null;
    if (!root) return undefined;
    const cards = Array.from(root.querySelectorAll<HTMLElement>("[data-tilt-card='true']"));
    if (cards.length === 0) return undefined;
    const cleanups = cards.map((card) => {
      const followPointer = (event: PointerEvent) => {
        const rect = card.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        const ratioX = (event.clientX - rect.left) / rect.width;
        const ratioY = (event.clientY - rect.top) / rect.height;
        card.style.transform = `perspective(920px) rotateX(${((0.5 - ratioY) * 7).toFixed(2)}deg) rotateY(${((ratioX - 0.5) * 8).toFixed(2)}deg) translateY(-4px)`;
        card.style.setProperty("--sheen-x", `${(ratioX * 100).toFixed(1)}%`);
        card.style.setProperty("--sheen-y", `${(ratioY * 100).toFixed(1)}%`);
        card.style.setProperty("--sheen-opacity", "1");
      };
      const reset = () => {
        card.style.transform = "";
        card.style.setProperty("--sheen-opacity", "0");
      };
      card.addEventListener("pointermove", followPointer, { passive: true });
      card.addEventListener("pointerleave", reset);
      return () => {
        card.removeEventListener("pointermove", followPointer);
        card.removeEventListener("pointerleave", reset);
      };
    });
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [reducedMotion]);

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
          gsap.fromTo(element, { opacity: 0, y: 30, scale: 0.985, filter: "blur(8px)" }, {
            opacity: 1,
            y: 0,
            scale: 1,
            filter: "blur(0px)",
            duration: 0.65,
            delay: Math.min(index % 3, 2) * 0.05,
            ease: "power3.out",
            clearProps: "filter,transform",
            scrollTrigger: { trigger: element, scroller, start: "top 86%", once: true },
          });
        });
        const cascadeCards = root.querySelectorAll<HTMLElement>("[data-story-cascade]");
        if (cascadeCards.length) {
          gsap.fromTo(cascadeCards, { opacity: 0, y: 52, rotate: -2.4 }, {
            opacity: 1,
            y: 0,
            rotate: 0,
            duration: 0.72,
            stagger: 0.09,
            ease: "power3.out",
            clearProps: "transform",
            scrollTrigger: { trigger: cascadeCards[0]!, scroller, start: "top 90%", once: true },
          });
        }
      }, root);
      ScrollTrigger.refresh();
      revert = () => context.revert();
    })();
    return () => {
      disposed = true;
      revert();
    };
  }, [reducedMotion, width]);

  const startOpeningSequence = useCallback(() => {
    if (openingSequenceStarted.current || openingStepRef.current > 0) return;
    openingSequenceStarted.current = true;
    logoNeon.stopAnimation();
    if (reducedMotion) {
      logoNeon.setValue(1);
    } else {
      const flicker = (toValue: number, duration: number) => Animated.timing(logoNeon, {
        toValue,
        duration,
        easing: Easing.linear,
        useNativeDriver: Platform.OS !== "web",
      });
      Animated.sequence([
        flicker(1, 90),
        Animated.delay(160),
        flicker(0.72, 55),
        flicker(0.96, 90),
        Animated.delay(120),
        flicker(0.8, 50),
        flicker(1, 110),
        Animated.delay(110),
        flicker(0.9, 40),
        flicker(1, 90),
      ]).start();
    }
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
    logoNeon,
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
    if (!openingStacked || openingContinuedRef.current || openingPixelSwapInFlight.current) return;
    openingPixelSwapInFlight.current = true;
    openingContinuedRef.current = true;
    setOpeningContinued(true);
    const scrollToNextChapter = () => scrollRef.current?.scrollTo({
      y: sectionOffsets.current[1] ?? openingSceneHeight + OPENING_TRANSITION_SCROLL,
      animated: false,
    });
    if (Platform.OS === "web" && !reducedMotion && typeof window !== "undefined") {
      setOpeningPixelSwapActive(true);
      window.requestAnimationFrame(scrollToNextChapter);
    } else {
      scrollToNextChapter();
      openingPixelSwapInFlight.current = false;
    }
  }, [openingSceneHeight, openingStacked, reducedMotion]);

  const finishOpeningPixelSwap = useCallback((active: boolean) => {
    if (!active) return;
    openingPixelSwapInFlight.current = false;
    setOpeningPixelSwapActive(false);
  }, []);

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

  const openDesktopApp = useCallback(() => {
    setDesktopOpened(true);
  }, []);
  const desktopIntroActive = openingContinued && !desktopOpened;
  const storyScrollEnabled = (openingContinued && desktopOpened) || (openingMessageReady && !openingStacked);

  useEffect(() => {
    if (Platform.OS !== "web" || !openingStacked || openingContinuedRef.current || typeof window === "undefined") return undefined;
    const blockOpeningWheel = (event: WheelEvent) => {
      if (openingContinuedRef.current) return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("wheel", blockOpeningWheel, { capture: true, passive: false });
    return () => window.removeEventListener("wheel", blockOpeningWheel, { capture: true });
  }, [openingContinued, openingStacked]);

  useEffect(() => {
    if (Platform.OS !== "web") return undefined;
    const scroller = scrollRef.current?.getScrollableNode?.() as HTMLElement | undefined;
    if (!scroller) return undefined;
    scroller.style.overflowY = storyScrollEnabled ? "auto" : "hidden";
    scroller.style.touchAction = storyScrollEnabled ? "pan-y" : "none";
    const restingCursor = desktopIntroActive
      ? 'url("' + OPENING_CURSOR_LOGO_URI + '") 18 18, pointer'
      : desktopOpened
        ? "default"
        : storyScrollEnabled
          ? "grab"
          : "default";
    scroller.style.cursor = restingCursor;
    if (!storyScrollEnabled) return undefined;
    let dragging = false;
    let startY = 0;
    let startScrollTop = 0;
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("button, a, input, textarea, [role='button'], [data-testid='opening-reel-gallery'], [data-story-dome-gallery='true']")) return;
      dragging = true;
      startY = event.clientY;
      startScrollTop = scroller.scrollTop;
      scroller.setPointerCapture?.(event.pointerId);
      scroller.style.cursor = desktopOpened ? "default" : "grabbing";
    };
    const onPointerMove = (event: PointerEvent) => {
      if (dragging) scroller.scrollTop = startScrollTop - (event.clientY - startY);
    };
    const stopDragging = () => {
      dragging = false;
      scroller.style.cursor = restingCursor;
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
  }, [desktopIntroActive, desktopOpened, storyScrollEnabled, width]);

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
            {PROGRESS_SEGMENTS.map((chapter) => (
              <View
                key={chapter}
                style={[styles.progressSeg, chapter <= activeChapter && styles.progressSegOn]}
              />
            ))}
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
          <View style={[styles.scene, { minHeight: openingSceneHeight }, openingStickyStyle]}>
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
                        <OpeningFluidSurface
                          active={fluidActive}
                          fill="black"
                          reducedMotion={reducedMotion}
                          reveal={openingReveal}
                          surface={FLUID_FILL_SURFACE}
                        />
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
                    const particleColor = openingParticleColor(item);
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
                          <View
                            style={[styles.openingBubbleSurface, {
                              backgroundColor: particleColor.surface,
                              borderColor: particleColor.border,
                            }]}
                          />
                          <View style={[styles.openingBubbleGlow, OPENING_BORDER_GLOW_WEB]} />
                        </Animated.View>
                        <Text
                          numberOfLines={Platform.OS === "web" ? undefined : 1}
                          style={[
                            item.kind === "tag" ? styles.floatingTag : item.kind === "title" ? styles.floatingTitle : styles.floatingCreator,
                            WEB_NO_WRAP,
                            {
                              alignSelf: "stretch",
                              color: particleColor.text,
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
                    <OpeningFluidSurface
                      active={fluidActive}
                      fill={color.black}
                      reducedMotion={reducedMotion}
                      reveal={openingReveal}
                      showSurfaceGlow
                      surface={FLUID_CURTAIN_SURFACE}
                    />
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
                  onBlur={() => setLogoFocused(false)}
                  onFocus={() => setLogoFocused(true)}
                  onPress={startOpeningSequence}
                  style={({ pressed }) => [
                    styles.logoButton,
                    logoFocused && styles.logoButtonFocused,
                    pressed && styles.logoButtonPressed,
                    WEB_POINTER,
                  ]}
                  testID="opening-logo-button"
                >
                  <View
                    accessible
                    accessibilityLabel={`内容展开进度 ${openingProgress}%`}
                    accessibilityRole="progressbar"
                    accessibilityValue={{ min: 0, max: 100, now: openingProgress }}
                    style={[styles.logoProgress, { transform: [{ scale: OPENING_LOGO_SCALE }] }]}
                  >
                    <View style={styles.logoBody}>
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
                              <OpeningFluidSurface
                                active={fluidActive}
                                fill="black"
                                reducedMotion={reducedMotion}
                                reveal={openingReveal}
                                surface={FLUID_FILL_SURFACE}
                              />
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
                          <AnimatedSvgGroup opacity={logoNeon}>
                            <Path d={NOTE_PATH} fill="none" filter="url(#opening-logo-edge-bloom)" opacity={0.24} stroke="#62F8FF" strokeLinejoin="round" strokeWidth={24} transform="translate(-7 5)" />
                            <Path d={NOTE_PATH} fill="none" filter="url(#opening-logo-edge-bloom)" opacity={0.24} stroke="#62F8FF" strokeLinejoin="round" strokeWidth={24} transform="translate(7 -4)" />
                            <Path d={NOTE_PATH} fill="none" filter="url(#opening-logo-edge-bloom)" opacity={0.46} stroke="#62F8FF" strokeLinejoin="round" strokeWidth={24} transform="translate(-7 5)" />
                            <Path d={NOTE_PATH} fill="none" filter="url(#opening-logo-edge-bloom)" opacity={0.46} stroke="#62F8FF" strokeLinejoin="round" strokeWidth={24} transform="translate(7 -4)" />
                            <Path d={NOTE_PATH} fill="none" opacity={0.94} stroke="#D2FEFF" strokeLinejoin="round" strokeWidth={18} transform="translate(-7 5)" />
                            <Path d={NOTE_PATH} fill="none" opacity={0.94} stroke="#D2FEFF" strokeLinejoin="round" strokeWidth={18} transform="translate(7 -4)" />
                          </AnimatedSvgGroup>
                        </G>
                        <Path d={NOTE_PATH} fill="none" stroke="#25F4EE" strokeLinejoin="round" strokeWidth={14} transform="translate(-7 5)" />
                        <Path d={NOTE_PATH} fill="none" stroke="#FE2C55" strokeLinejoin="round" strokeWidth={14} transform="translate(7 -4)" />
                        <Rect fill="#F4F6FA" height={NOTE_VIEWBOX_HEIGHT} mask="url(#opening-logo-fill-mask)" width={NOTE_VIEWBOX_WIDTH} />
                      </Svg>
                    </View>
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
                style={[styles.openingContinue, OPENING_LOGO_CURSOR]}
                testID="opening-continue"
              />
            ) : null}
          </View>
        </View>

        <View
          onLayout={registerChapter(2)}
          style={[styles.chapter, styles.desktopChapter, { minHeight: sceneHeight }]}
        >
          <DesktopCardSwap
            active={openingContinued && !openingPixelSwapActive}
            appIcon={<DesktopDouyinIcon />}
            copy={livingChapterCopy(
              currentChapter,
              "观看、喜欢和收藏各自保留真实列表口径，封面会在对应页面中展开。",
              privacy,
            )}
            eyebrow={"CHAPTER 02 · " + (currentChapter?.eyebrow ?? "最近发生什么")}
            onOpenApp={openDesktopApp}
            onOpenRecord={openStoryRecord}
            privacy={privacy}
            recentDays={livingReport?.currentWindow.days ?? 30}
            reducedMotion={reducedMotion}
            streams={desktopStreams}
            title={currentChapter?.title ?? "你最近在靠近什么？"}
            viewportHeight={sceneHeight}
            viewportWidth={width}
            wallpaperUri={USER_DESKTOP_WALLPAPER_URI}
          />
        </View>

        <SceneSection
          atmosphereNext={atmosphereCss("rhythm")}
          atmosphereSelf={atmosphereCss("bridgeRhythm")}
          bridge={bridgeSpecs.lead}
          fadeIn
          height={sceneHeight}
          reducedMotion={reducedMotion}
          width={width}
          zIndex={10}
        />

        <SceneSection
          atmosphereNext={atmosphereCss("preference")}
          atmosphereSelf={atmosphereCss("rhythm")}
          bridge={bridgeSpecs.rhythm}
          height={sceneHeight}
          onTop={chapterTopSetters[0]}
          overlapPrev
          reducedMotion={reducedMotion}
          width={width}
          zIndex={11}
        >
          <ChapterStage
            accent={color.cyan}
            atmosphere="rhythm"
            copy={livingChapterCopy(rhythmChapter, "只使用可靠行为时间。点击圆盘上的小时，方向键和滚轮也可以切换。", privacy)}
            detail={selectedHourData.representative
              ? <StoryRecordButton compact item={selectedHourData.representative} onOpen={openStoryRecord} privacy={privacy} />
              : <Text style={styles.emptyText}>这个小时没有可展示的代表内容</Text>}
            eyebrow={`CHAPTER 03 · ${rhythmChapter?.eyebrow ?? "你的节拍"}`}
            height={sceneHeight}
            title={hourNarrativeTitle(selectedHourData, privacy)}
            width={width}
          >
            <StageCard
              accent={color.cyan}
              description={privacy ? privateHourStory(selectedHourData) : copyProvider.hourStory(selectedHourData)}
              height={stageCardHeight}
              label={padHour(selectedHourData.hour)}
              meta="一天里的这一刻"
              value={selectedHourData.count}
            >
              <View style={[styles.stageDisc, { transform: [{ scale: rhythmDiscScale }] }]}>
                <RhythmEqualizer
                  active={activeChapter >= 3}
                  hours={model.hours}
                  onHourKey={handleHourKey}
                  onSelectHour={setSelectedHour}
                  onWheel={handleHourWheel}
                  reducedMotion={reducedMotion}
                  selectedHour={selectedHour}
                />
              </View>
            </StageCard>
          </ChapterStage>
        </SceneSection>

        <SceneSection
          atmosphereNext={atmosphereCss("kept")}
          atmosphereSelf={atmosphereCss("preference")}
          bridge={bridgeSpecs.preference}
          height={sceneHeight}
          onTop={chapterTopSetters[1]}
          overlapPrev
          reducedMotion={reducedMotion}
          width={width}
          zIndex={12}
        >
          <ChapterStage
            accent={selectedTopicAccent}
            atmosphere="preference"
            copy={livingChapterCopy(shiftChapter, "点击气泡切换标签，只展示真实命中的代表内容与对应创作者。", privacy)}
            detail={selectedTopicData ? (
              <>
                {selectedTopicData.records[0] ? (
                  <StoryRecordButton compact item={selectedTopicData.records[0]} onOpen={openStoryRecord} privacy={privacy} />
                ) : null}
                <View style={styles.creatorRankList}>
                  {selectedTopicData.creators.length ? selectedTopicData.creators.slice(0, 5).map((creator, index) => {
                    const topCount = Math.max(1, selectedTopicData.creators[0]?.count ?? 1);
                    const share = Math.max(0.12, creator.count / topCount);
                    return (
                      <View key={creator.key} style={styles.creatorRankRow}>
                        <Text style={styles.creatorIndex}>{String(index + 1).padStart(2, "0")}</Text>
                        <View style={styles.creatorRankBody}>
                          <Text numberOfLines={1} style={styles.creatorName}>{privacy ? `创作者 ${index + 1}` : creator.name}</Text>
                          <View style={styles.creatorRankTrack}>
                            <View
                              style={[
                                styles.creatorRankFill,
                                {
                                  width: `${Math.round(share * 100)}%`,
                                  backgroundColor: index === 0 ? selectedTopicAccent : hexToRgba(selectedTopicAccent, 0.7 - index * 0.12),
                                },
                              ]}
                            />
                          </View>
                        </View>
                        <Text style={styles.creatorRankCount}>{creator.count}</Text>
                      </View>
                    );
                  }) : <Text style={styles.emptyText}>没有可归属的创作者</Text>}
                </View>
              </>
            ) : null}
            eyebrow={`CHAPTER 04 · ${shiftChapter?.eyebrow ?? "偏好与创作者"}`}
            height={sceneHeight}
            title={topicNarrativeTitle(selectedTopicData, selectedTopicIndex, selectedTopicAccent, privacy)}
            width={width}
          >
            <StageCard
              accent={selectedTopicAccent}
              description={selectedTopicData
                ? (privacy
                  ? `该标签关联 ${selectedTopicData.count} 条内容，标签与创作者已隐藏。`
                  : copyProvider.topicStory(selectedTopicData))
                : "当前样本没有可识别的显式标签"}
              height={stageCardHeight}
              label={selectedTopicData ? (privacy ? `话题 ${selectedTopicIndex + 1}` : `#${selectedTopicData.name}`) : "无标签"}
              meta="显式标签 · 拖拽甩动"
              value={selectedTopicData?.count ?? 0}
            >
              {model.topics.length ? (
                <TopicBubbleField
                  active={activeChapter === 4}
                  bare
                  height={stageBodyHeight}
                  onSelect={setSelectedTopic}
                  reducedMotion={reducedMotion}
                  selectedName={selectedTopicData?.name ?? null}
                  topics={model.topics.slice(0, 12).map((topic, index) => ({
                    name: topic.name,
                    label: privacy ? `话题 ${index + 1}` : `#${topic.name}`,
                    count: topic.count,
                  }))}
                />
              ) : <View style={styles.stageEmpty}><Text style={styles.emptyText}>当前样本没有可识别的显式标签</Text></View>}
            </StageCard>
          </ChapterStage>
        </SceneSection>

        <SceneSection
          atmosphereNext={atmosphereCss("continuation")}
          atmosphereSelf={atmosphereCss("kept")}
          bridge={bridgeSpecs.kept}
          height={sceneHeight}
          onTop={chapterTopSetters[2]}
          overlapPrev
          reducedMotion={reducedMotion}
          width={width}
          zIndex={13}
        >
          <ChapterStage
            accent={OVERLAP_ACCENTS[selectedOverlap]}
            atmosphere="kept"
            copy={selectedOverlap === "allThree"
              // 生活报告的这段叙述只讲三类列表的交集，换到别的节点就退回规则说明，避免和标题打架。
              ? livingChapterCopy(keptChapter, "交集只使用可比较 videoId；缺失标识的记录不会被猜测为同一内容。", privacy)
              : "交集只使用可比较 videoId；缺失标识的记录不会被猜测为同一内容。"}
            detail={(
              <>
                <View style={styles.overlapItems}>
                  {selectedOverlapData.records.length ? selectedOverlapData.records.slice(0, 3).map((item) => (
                    <StoryRecordButton compact item={item} key={item.key} onOpen={openStoryRecord} privacy={privacy} />
                  )) : <Text style={styles.emptyText}>当前交集没有可展示内容</Text>}
                </View>
                <View style={styles.snapshotNotice}><View style={styles.snapshotMark} /><Text style={styles.snapshotNoticeText}>当前列表快照，不代表行为转化</Text></View>
              </>
            )}
            eyebrow={`CHAPTER 05 · ${keptChapter?.eyebrow ?? "真正留下的内容"}`}
            height={sceneHeight}
            title={overlapNarrativeTitle(selectedOverlap, selectedOverlapData.count, overlapsAvailable)}
            width={width}
          >
            <StageCard
              accent={OVERLAP_ACCENTS[selectedOverlap]}
              description={overlapsAvailable
                ? `${selectedOverlapData.count} 个可比较视频同时出现在这份交集里。`
                : "缺少可比较 videoId，无法判断交集。"}
              height={stageCardHeight}
              label={OVERLAP_LABELS[selectedOverlap]}
              meta="列表交集 · 点击节点切换"
              value={selectedOverlapData.count}
            >
              <ConfluenceFlow
                accent={OVERLAP_ACCENTS[selectedOverlap]}
                active={activeChapter === 5}
                available={overlapsAvailable}
                bare
                height={stageBodyHeight}
                onSelect={setSelectedOverlap}
                overlaps={(["watchLiked", "watchFavorite", "likedFavorite", "allThree"] as const).map((key) => ({
                  key,
                  label: OVERLAP_LABELS[key],
                  count: model.overlaps[key].count,
                }))}
                reducedMotion={reducedMotion}
                selected={selectedOverlap}
                streamCounts={{
                  watch_history: model.streams.watch_history.uniqueCount,
                  liked_videos: model.streams.liked_videos.uniqueCount,
                  favorite_videos: model.streams.favorite_videos.uniqueCount,
                }}
                streamLabels={{
                  watch_history: "观看",
                  liked_videos: "喜欢",
                  favorite_videos: "收藏",
                }}
              />
            </StageCard>
          </ChapterStage>
        </SceneSection>

        <SceneSection
          atmosphereSelf={atmosphereCss("continuation")}
          height={sceneHeight}
          onTop={chapterTopSetters[3]}
          overlapPrev
          reducedMotion={reducedMotion}
          width={width}
          zIndex={14}
        >
          <ChapterStage
            accent={color.cyan}
            atmosphere="continuation"
            copy={livingChapterCopy(continuationChapter, "横向浏览代表内容，让故事落回真实记录。", privacy)}
            detail={<Text style={styles.stageHint}>横向滑动，看完 5 张规则卡 →</Text>}
            eyebrow={`CHAPTER 06 · ${continuationChapter?.eyebrow ?? "故事还在继续"}`}
            flush
            height={sceneHeight}
            title={continuationChapter?.title ?? <>五个规则坐标，{`\n`}把故事落回真实内容。</>}
            width={width}
          >
            <ScrollView
              contentContainerStyle={styles.highlightStrip}
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.highlightScroller}
            >
              {highlightDefinitions.map((definition, index) => (
                <StoryHighlightCard
                  accent={definition.accent}
                  icon={definition.icon}
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
          </ChapterStage>
        </SceneSection>
        <View style={[styles.finale, atmosphereStyle("finale")]}>
            <FinaleEqualizer active={activeChapter === 6} reducedMotion={reducedMotion} />
            <DecodedText style={styles.finaleEyebrow} text="YOUR CONTENT, STILL UNFOLDING" />
            <View style={styles.finaleTitleWrap} {...revealDataSet()}>
              <Text
                accessibilityElementsHidden
                aria-hidden
                importantForAccessibility="no-hide-descendants"
                style={[styles.finaleTitle, styles.finaleTitleGhost, styles.finaleTitleGhostCyan, FINALE_GHOST_CYAN_WEB]}
              >
                这些内容不是答案，{`\n`}是仍在展开的坐标。
              </Text>
              <Text
                accessibilityElementsHidden
                aria-hidden
                importantForAccessibility="no-hide-descendants"
                style={[styles.finaleTitle, styles.finaleTitleGhost, styles.finaleTitleGhostRed, FINALE_GHOST_RED_WEB]}
              >
                这些内容不是答案，{`\n`}是仍在展开的坐标。
              </Text>
              <Text style={styles.finaleTitle}>这些内容不是答案，{`\n`}是仍在展开的坐标。</Text>
            </View>
            <Text style={styles.finaleCopy}>{livingReport && profileLabels ? `当前样本更接近：${profileLabels}。` : "新的记录会继续改变这份内容报告。"}</Text>
            <Pressable
              accessibilityLabel="进入持续报告"
              accessibilityRole="button"
              onPress={onEnterDashboard}
              style={(state) => [
                styles.dashboardButton,
                // hovered 只有 react-native-web 提供，核心类型里没有。
                Boolean((state as { hovered?: boolean }).hovered) && DASHBOARD_BUTTON_GLOW_WEB,
                state.pressed && styles.buttonPressed,
                WEB_POINTER,
              ]}
            >
              <Text style={styles.dashboardButtonText}>进入持续报告</Text>
              <ArrowRight color={color.white} size={20} />
            </Pressable>
        </View>
      </ScrollView>

      {openingPixelSwapActive ? (
        <View pointerEvents="none" style={styles.openingTransitionOverlay} testID="opening-transition-overlay">
          <PixelSwap
            active
            firstContent={<View style={styles.pixelSwapEmpty} />}
            onComplete={finishOpeningPixelSwap}
            pixelColor={color.black}
            pixelDuration={460}
            pixelSize={58}
            pattern="random"
            revealUnderlying
            secondContent={<View style={styles.pixelSwapEmpty} />}
            style={styles.openingTransitionPixels as React.CSSProperties}
          />
        </View>
      ) : null}

      <StoryDetailModal detail={detail} onClose={() => setDetail(null)} privacy={privacy} />
    </View>
  );
}

function FinaleEqualizer({ active, reducedMotion }: { active: boolean; reducedMotion: boolean }) {
  const progress = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    progress.stopAnimation();
    if (reducedMotion || !active) {
      progress.setValue(0.5);
      return undefined;
    }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(progress, { toValue: 1, duration: 640, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== "web" }),
      Animated.timing(progress, { toValue: 0, duration: 640, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== "web" }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [active, progress, reducedMotion]);

  const bases = [0.4, 0.85, 0.55, 1, 0.5, 0.9, 0.62];
  return (
    <View accessibilityElementsHidden aria-hidden importantForAccessibility="no-hide-descendants" style={styles.finaleEq}>
      {bases.map((base, index) => (
        <Animated.View
          key={index}
          style={[
            styles.finaleEqBar,
            {
              backgroundColor: index % 2 ? color.accent : color.cyan,
              transform: [{
                scaleY: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: index % 2 ? [base, 1.4 - base] : [1.4 - base, base],
                }),
              }],
            },
          ]}
        />
      ))}
    </View>
  );
}

// 章节舞台：与第二章同一套版式——满屏黑底、左侧叙事列、右半屏一个可点的主物件。
/**
 * 章节眉的解码进场：自己拿 state 重渲染，不去写别人的 DOM——
 * 直接改 textContent 会被父组件的下一次重渲染抹掉。
 */
function DecodedText({ style, testID, text }: { style?: StyleProp<TextStyle>; testID?: string; text: string }) {
  const [frame, setFrame] = useState(text);

  useEffect(() => {
    const reduced = Platform.OS === "web"
      && typeof window !== "undefined"
      && typeof window.matchMedia === "function"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (Platform.OS !== "web" || reduced) {
      setFrame(text);
      return undefined;
    }
    const glyphs = Array.from(text);
    const pool = decodePool(text);
    let revealed = 0;
    setFrame(decodeFrame(glyphs, 0, pool, Math.random));
    const timer = window.setInterval(() => {
      revealed += 1;
      if (revealed >= glyphs.length) {
        window.clearInterval(timer);
        setFrame(text);
        return;
      }
      setFrame(decodeFrame(glyphs, revealed, pool, Math.random));
    }, DECODE_STEP_MS);
    return () => window.clearInterval(timer);
  }, [text]);

  return <Text style={style} testID={testID}>{frame}</Text>;
}

function ChapterStage({
  accent,
  atmosphere,
  children,
  copy,
  detail,
  eyebrow,
  flush,
  height,
  title,
  width,
}: {
  accent: string;
  atmosphere: StageAtmosphereKey;
  children: ReactNode;
  copy: string;
  detail?: ReactNode;
  eyebrow: string;
  flush?: boolean;
  height: number;
  title: ReactNode;
  width: number;
}) {
  const narrow = width < 1250;
  return (
    <View style={[styles.stageInner, { minHeight: height }, atmosphereStyle(atmosphere)]}>
      <View
        style={[styles.stageCopy, { left: narrow ? 44 : "14%", width: narrow ? 320 : 560 }]}
        {...revealDataSet()}
        {...(Platform.OS === "web" ? { dataSet: { sceneCopy: "true", storyReveal: "true" } } : {})}
      >
        <DecodedText style={[styles.stageEyebrow, { color: accent }]} testID="stage-eyebrow" text={eyebrow} />
        <Text style={[styles.stageTitle, narrow && styles.stageTitleNarrow]}>{title}</Text>
        <Text style={styles.stageLead}>{copy}</Text>
        {detail ? <View style={styles.stageDetail}>{detail}</View> : null}
      </View>
      <View style={[styles.stageObject, { left: narrow ? 380 : "50%" }, flush && styles.stageObjectFlush]}>
        {children}
      </View>
    </View>
  );
}

// 物件外壳：第二章卡片的同款卡头（强调色顶边 + 标签 + 大号数字）与 44px 描述条。
function StageCard({
  accent,
  children,
  description,
  height,
  label,
  meta,
  value,
}: {
  accent: string;
  children: ReactNode;
  description: string;
  height: number;
  label: string;
  meta: string;
  value: number;
}) {
  return (
    <View style={[styles.stageCard, { height, borderTopColor: accent }]} {...revealDataSet()}>
      <View style={styles.stageCardHeader}>
        <View style={styles.stageCardHeaderCopy}>
          <Text numberOfLines={1} style={styles.stageCardLabel}>{label}</Text>
          <Text style={styles.stageCardMeta}>{meta}</Text>
        </View>
        <Text style={styles.stageCardValue}>{formatNumber(value)}</Text>
      </View>
      <View style={styles.stageCardDescription}>
        <Text numberOfLines={1} style={styles.stageCardDescriptionText}>{description}</Text>
      </View>
      <View style={styles.stageCardBody}>{children}</View>
    </View>
  );
}

// 叙事标题：词条 + 描述两行，词条用该章强调色（与第二章 narrativeTitle 同一写法）。
function hourNarrativeTitle(hour: StoryHour, privacy: boolean): ReactNode {
  const label = padHour(hour.hour);
  if (!hour.count) return <>{label} 前后，{`\n`}还没有可靠记录</>;
  if (!privacy && hour.topTopic) {
    return <>{label} 前后，{`\n`}<Text style={{ color: color.cyan }}>#{hour.topTopic}</Text> 出现得最多</>;
  }
  return <>{label} 前后，{`\n`}有 <Text style={{ color: color.cyan }}>{hour.count}</Text> 条可靠记录</>;
}

function topicNarrativeTitle(
  topic: StoryTopic | null,
  index: number,
  accent: string,
  privacy: boolean,
): ReactNode {
  if (!topic) return "当前样本没有可识别的显式标签";
  const label = privacy ? `话题 ${index + 1}` : `#${topic.name}`;
  return <><Text style={{ color: accent }}>{label}</Text> 出现在{`\n`}{topic.count} 条内容里</>;
}

function overlapNarrativeTitle(key: StoryOverlapKey, count: number, available: boolean): ReactNode {
  if (!available) return <>列表快照缺少可比较 videoId，{`\n`}这一章无法判断交集</>;
  return (
    <>
      <Text style={{ color: OVERLAP_ACCENTS[key] }}>{OVERLAP_LABELS[key]}</Text>，{`\n`}
      有 {count} 个视频同时在场
    </>
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

function DesktopDouyinIcon() {
  return (
    <Svg accessibilityLabel="抖音" height="78%" viewBox="-14 -14 248 268" width="78%">
      <Path d={NOTE_PATH} fill="#25F4EE" transform="translate(-7 5)" />
      <Path d={NOTE_PATH} fill="#FE2C55" transform="translate(7 -4)" />
      <Path d={NOTE_PATH} fill="#F7F7F8" />
    </Svg>
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

function StoryHighlightCard({
  accent,
  icon: Icon,
  index,
  item,
  label,
  rule,
  onOpen,
  privacy,
}: {
  accent: string;
  icon: HighlightIcon;
  index: number;
  item: AnnualContentRef | null;
  label: string;
  rule: string;
  onOpen: (item: AnnualContentRef | null) => void;
  privacy: boolean;
}) {
  const title = item ? (privacy ? "内容标题已隐藏" : item.title) : "暂无可确定内容";
  const author = item ? (privacy ? "创作者已隐藏" : item.author ?? "未知创作者") : "当前样本缺少对应记录";
  const visualBackground = Platform.OS === "web"
    ? ({
        backgroundImage: `linear-gradient(155deg, ${hexToRgba(accent, 0.2)} 0%, rgba(17,18,22,0.35) 62%), radial-gradient(circle at 82% 16%, ${hexToRgba(accent, 0.16)}, transparent 55%)`,
      } as unknown as ViewStyle)
    : ({ backgroundColor: hexToRgba(accent, 0.14) } as ViewStyle);
  return (
    <Pressable
      accessibilityLabel={`${label}：${title}${item ? "，打开详情" : ""}`}
      accessibilityRole={item ? "button" : undefined}
      disabled={!item}
      onPress={() => onOpen(item)}
      {...(Platform.OS === "web"
        ? { dataSet: { storyCascade: "true", tiltCard: "true", highlightCard: "true", highlightAccent: accent } }
        : {})}
      style={({ pressed }) => [
        styles.highlightCard,
        { borderTopColor: accent },
        HIGHLIGHT_CARD_WEB,
        !item && styles.disabled,
        pressed && styles.buttonPressed,
        item && WEB_POINTER,
      ]}
    >
      <View style={[styles.highlightVisual, visualBackground]}>
        <Icon color={accent} size={54} strokeWidth={1.4} />
        <Text style={[styles.highlightIndex, { color: hexToRgba(accent, 0.3) }]}>{String(index + 1).padStart(2, "0")}</Text>
      </View>
      <View style={styles.highlightCopy}>
        <Text style={[styles.highlightLabel, { color: accent }]}>{label}</Text>
        <Text numberOfLines={2} style={styles.highlightTitle}>{title}</Text>
        <Text numberOfLines={1} style={styles.highlightMeta}>{author}</Text>
        <Text style={styles.highlightRule}>{rule}</Text>
      </View>
      <View pointerEvents="none" style={[styles.highlightSheen, HIGHLIGHT_SHEEN_WEB]} />
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

function openingParticleColor(item: OpeningParticle): StoryParticleColor {
  // 用词条 key 做种子，保留随机感，同时避免重渲染时跳色。
  return STORY_PARTICLE_COLORS[hashString(`${item.key}:${item.revealOrder}`) % STORY_PARTICLE_COLORS.length]!;
}

function hexToRgba(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
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
  // 进度条也按像素语言走：6 段方块代替连续条，走过的段点亮。
  // ponytail: 当前段不做闪烁——RN 没有 steps() 动画，为一个呼吸注入 CSS 不值。
  progressTrack: { width: 196, flexDirection: "row", alignItems: "center", gap: 8 },
  progressSeg: { width: 26, height: 6, backgroundColor: color.border },
  progressSegOn: { backgroundColor: color.cyan },
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
  openingContinue: { ...ABSOLUTE_FILL, zIndex: 12 },
  openingTransitionOverlay: { position: "absolute", top: 68, right: 0, bottom: 0, left: 0, zIndex: 25 },
  openingTransitionPixels: { ...ABSOLUTE_FILL, zIndex: 25 },
  pixelSwapEmpty: { ...ABSOLUTE_FILL, backgroundColor: "transparent" },
  chapterNo: { color: color.cyan, fontSize: 10, fontWeight: "900" },
  floatingItem: { position: "absolute", zIndex: 4, left: "50%", top: "50%", justifyContent: "center" },
  openingBubble: { position: "absolute", top: 0, bottom: 0, borderRadius: 999 },
  openingBubbleSurface: { ...ABSOLUTE_FILL, borderWidth: 1, borderColor: "rgba(255,255,255,0.18)", borderRadius: 999, backgroundColor: "rgba(17,18,22,0.9)" },
  openingBubbleGlow: { ...ABSOLUTE_FILL, borderRadius: 999 },
  floatingTag: { color: "rgba(255,255,255,0.9)", fontWeight: "900", lineHeight: 26 * OPENING_PARTICLE_SCALE },
  floatingTitle: { color: "rgba(255,255,255,0.9)", fontWeight: "900", lineHeight: 29 * OPENING_PARTICLE_SCALE },
  floatingCreator: { color: "rgba(255,255,255,0.78)", fontWeight: "800", lineHeight: 23 * OPENING_PARTICLE_SCALE },
  floatingCount: { color: "rgba(255,255,255,0.62)", fontSize: 10 * OPENING_PARTICLE_SCALE, fontWeight: "900" },
  logoButton: { zIndex: 6, width: NOTE_WIDTH, height: NOTE_HEIGHT, alignItems: "center", justifyContent: "center" },
  logoButtonFocused: { zIndex: 8 },
  logoButtonPressed: { opacity: 0.86, transform: [{ scale: 0.97 }] },
  logoProgress: { width: NOTE_WIDTH, height: NOTE_HEIGHT, alignItems: "center", justifyContent: "center" },
  logoBody: { ...ABSOLUTE_FILL, zIndex: 3, alignItems: "center", justifyContent: "center" },
  logoArtwork: { position: "absolute", left: -30, top: -30 },
  chapter: { minHeight: 820, justifyContent: "center", paddingHorizontal: 52, paddingVertical: 92, borderTopWidth: 1, borderTopColor: color.borderSoft, backgroundColor: color.canvas },
  desktopChapter: { paddingHorizontal: 0, paddingVertical: 0, borderTopWidth: 0 },
  // 第三到第六章舞台：与 DesktopCardSwap 同一底色与版式
  stage: { position: "relative", backgroundColor: STAGE_CANVAS },
  stageInner: { position: "relative", width: "100%", overflow: "hidden", backgroundColor: STAGE_CANVAS },
  stageCopy: { position: "absolute", zIndex: 2, top: 0, bottom: 0, justifyContent: "center" },
  stageEyebrow: { fontSize: 13, fontWeight: "900" },
  stageTitle: { marginTop: 14, color: STAGE_TEXT, fontSize: 56, lineHeight: 63, fontWeight: "700", letterSpacing: -2.2 },
  // 与第二章同一个断点：窄屏把大标题降到 38px。
  stageTitleNarrow: { marginTop: 10, fontSize: 38, lineHeight: 46, letterSpacing: -1.5 },
  stageLead: { marginTop: 16, color: "rgba(244,246,250,0.62)", fontSize: 14, lineHeight: 24 },
  stageDetail: { gap: 10, marginTop: 26 },
  stageHint: { color: "rgba(244,246,250,0.42)", fontSize: 11, fontWeight: "800" },
  // 物件向右越过画幅边缘（由 stageInner 的 overflow 裁掉），每章的剪影才不一样。
  stageObject: { position: "absolute", top: 0, right: -STAGE_BLEED, bottom: 0, alignItems: "center", justifyContent: "center", paddingHorizontal: 0 },
  stageObjectFlush: { paddingRight: 0 },
  // 没有外框、没有圆角、没有底色：卡头与描述条各自带底，物件直接落在场景背景上。
  stageCard: { width: "100%", maxWidth: 940, borderTopWidth: 4, borderColor: "transparent" },
  stageCardHeader: { height: 72, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16, paddingHorizontal: 22, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.12)", backgroundColor: "rgba(12,14,18,0.94)", marginRight: STAGE_BLEED },
  stageCardHeaderCopy: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "baseline", gap: 12 },
  stageCardLabel: { flexShrink: 1, color: STAGE_TEXT, fontSize: 20, fontWeight: "800" },
  stageCardMeta: { color: "rgba(244,246,250,0.5)", fontSize: 11 },
  stageCardValue: { color: STAGE_TEXT, fontSize: 25, fontWeight: "800", fontVariant: ["tabular-nums"] },
  stageCardDescription: { height: 44, justifyContent: "center", paddingHorizontal: 22, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.12)", backgroundColor: "rgba(16,19,26,0.94)", marginRight: STAGE_BLEED },
  stageCardDescriptionText: { color: "rgba(244,246,250,0.66)", fontSize: 14, lineHeight: 22 },
  stageCardBody: { flex: 1, minHeight: 0 },
  stageDisc: { flex: 1, alignItems: "center", justifyContent: "center" },
  stageEmpty: { flex: 1, alignItems: "center", justifyContent: "center" },
  recordButton: { minHeight: 78, flexDirection: "row", alignItems: "center", gap: 12, padding: 10, borderWidth: 1, borderColor: color.border, borderRadius: radius.medium, backgroundColor: color.surfaceRaised },
  recordButtonCompact: { minHeight: 66 },
  recordCover: { width: 42, height: 52, flexShrink: 0, overflow: "hidden", borderRadius: radius.small, backgroundColor: color.surfaceMuted },
  recordCoverFallback: { alignItems: "center", justifyContent: "center" },
  recordCopy: { flex: 1, minWidth: 0 },
  recordTitle: { color: color.text, fontSize: 12, lineHeight: 18, fontWeight: "800" },
  recordMeta: { color: color.textMuted, fontSize: 9, marginTop: 5 },
  emptyText: { color: color.textMuted, fontSize: 11, lineHeight: 18 },
  resultEyebrow: { color: color.cyan, fontSize: 9, fontWeight: "900" },
  creatorRankList: { gap: 10, marginTop: 18, paddingTop: 16, borderTopWidth: 1, borderTopColor: color.border },
  creatorRankRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 34 },
  creatorRankBody: { flex: 1, minWidth: 0 },
  creatorRankTrack: { height: 5, marginTop: 5, borderRadius: 3, overflow: "hidden", backgroundColor: color.surfaceMuted },
  creatorRankFill: { height: 5, borderRadius: 3 },
  creatorRankCount: { width: 34, color: color.textSecondary, fontSize: 11, fontWeight: "900", textAlign: "right", fontVariant: ["tabular-nums"] },
  creatorIndex: { color: color.textMuted, fontSize: 9, fontWeight: "900" },
  creatorName: { color: color.text, fontSize: 11, fontWeight: "800" },
  overlapItems: { gap: 8 },
  snapshotNotice: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: 9, marginTop: 18, paddingHorizontal: 12, backgroundColor: color.amberSoft },
  snapshotMark: { width: 16, height: 3, backgroundColor: color.amber },
  snapshotNoticeText: { flex: 1, color: color.textSecondary, fontSize: 9 },
  // 舞台里横向滑动的高光带：卡片保持自身高度，从左列右侧一直流出右边缘。
  highlightScroller: { width: "100%", maxHeight: 460 },
  highlightStrip: { gap: 14 },
  highlightCard: { width: 300, minHeight: 410, overflow: "hidden", borderWidth: 1, borderTopWidth: 4, borderColor: color.border, borderRadius: radius.large, backgroundColor: color.surface },
  highlightVisual: { position: "relative", height: 220, alignItems: "center", justifyContent: "center", backgroundColor: color.surfaceRaised },
  highlightIndex: { position: "absolute", right: 14, bottom: 4, fontSize: 76, lineHeight: 82, fontWeight: "900", fontVariant: ["tabular-nums"] },
  highlightSheen: { ...ABSOLUTE_FILL },
  highlightCopy: { flex: 1, padding: 18 },
  highlightLabel: { fontSize: 9, fontWeight: "900" },
  highlightTitle: { minHeight: 46, color: color.text, fontSize: 15, lineHeight: 22, fontWeight: "900", marginTop: 8 },
  highlightMeta: { color: color.textMuted, fontSize: 10, marginTop: 8 },
  highlightRule: { color: color.textSecondary, fontSize: 9, lineHeight: 15, marginTop: "auto", paddingTop: 14, borderTopWidth: 1, borderTopColor: color.border },
  disabled: { opacity: 0.52 },
  finale: { width: "100%", minHeight: 560, alignItems: "center", justifyContent: "center", paddingVertical: 96, paddingHorizontal: 40 },
  finaleEq: { flexDirection: "row", alignItems: "center", gap: 6, height: 30 },
  finaleEqBar: {
    width: 6,
    height: 26,
    borderRadius: 3,
    ...(Platform.OS === "web" ? ({ transformOrigin: "50% 100%" } as unknown as ViewStyle) : null),
  },
  finaleEyebrow: { color: color.cyan, fontSize: 10, fontWeight: "900", marginTop: 34 },
  finaleTitleWrap: { position: "relative", marginTop: 12 },
  finaleTitle: { color: color.text, fontSize: 46, lineHeight: 58, fontWeight: "900", textAlign: "center" },
  finaleTitleGhost: { ...ABSOLUTE_FILL, color: "transparent" },
  finaleTitleGhostCyan: { transform: [{ translateX: -3 }] },
  finaleTitleGhostRed: { transform: [{ translateX: 3 }] },
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
