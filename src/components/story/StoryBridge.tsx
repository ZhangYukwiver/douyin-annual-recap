import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";

// 章节场景段（SceneSection）：第三章起的每一章是一个钉住的场景。
// 单段滚动时间轴：淡入(F) → 定住可交互(V) → 物件原地形变成下一章的物件(M) → 终态保持(T)，
// 其间下一段用负边距叠上来、在同一位置淡入——所以章与章之间没有整屏平移，只有原地交替。
// 与 DesktopCardSwap 一样是纯 DOM 组件（故事页只对 web 开放），滚动时直接写 style，不走 React 重渲染。
// JSX 里的样式全部是常量：React 只在自己声明的值变化时才写 DOM，常量样式不会覆盖 painter 写的值。

export type StoryBridgeKind = "cardsToDial" | "dialToBubbles" | "bubblesToStreams" | "nodesToCards";

// RhythmEqualizer / TopicBubbleField / StoryHighlightCard 的原始尺寸，作为换算基准。
const DIAL_BASE = 540;
const DIAL_INNER = 122;
const DIAL_BAR_MAX = 86;
const DIAL_BAR_STUB = 8;
const DIAL_BAR_WIDTH = 12;
const BUBBLE_MIN_RADIUS = 36;
const BUBBLE_MAX_RADIUS = 64;
const BUBBLE_BASE_HEIGHT = 470;
const HIGHLIGHT_CARD_WIDTH = 298;
const HIGHLIGHT_CARD_HEIGHT = 220;
const HIGHLIGHT_CARD_GAP = 16;
// 与 AnnualScrollStory 的 STAGE_BLEED 一致。
const STAGE_BLEED = 24;

// 第五章四个交集节点在物件区里的相对位置（confluenceMath 的 NODE 布局）。
const OVERLAP_SPOTS: ReadonlyArray<readonly [number, number]> = [
  [0.9, 0.5],
  [0.44, 0.33],
  [0.66, 0.52],
  [0.46, 0.68],
];
const OVERLAP_NODE_W = 96;
const OVERLAP_NODE_H = 66;

const STREAM_COLORS = ["#25F4EE", "#FE2C55", "#F4C45E"];
const STREAM_LABELS = ["观看", "喜欢", "收藏"];
const TILE_TONES = ["#1B3138", "#33161E", "#332B18"];

// 段内各阶段的滚动跨度（相对 sceneHeight 的比例）。
const FADE_RATIO = 0.32;
const HOLD_RATIO = 0.42;
const MORPH_RATIO = 0.88;
const TAIL_RATIO = 0.15;

export interface StoryBridgeTopic {
  label: string;
  count: number;
  color: string;
}

export interface StoryBridgeNode {
  label: string;
  color: string;
}

export interface BridgeBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Shape {
  x: number;
  y: number;
  w: number;
  h: number;
  radius: number;
  rotate: number;
  skew: number;
  opacity: number;
  background: string;
  border: string;
  shadow: string;
  label: string;
  labelColor: string;
  labelSize: number;
  labelOpacity: number;
}

const lerp = (from: number, to: number, t: number) => from + (to - from) * t;
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
// 暗色上 oklab 混合比 sRGB 少一段发灰的中间态。
const mix = (from: string, to: string, t: number) =>
  `color-mix(in oklab, ${from} ${Math.round((1 - t) * 100)}%, ${to})`;

// 物件区 = StageCard 去掉 72px 卡头与 44px 描述条之后的内容区，
// 公式与 AnnualScrollStory 里的 stageCardHeight / stageObject 一致。
export function bridgeObjectBox(width: number, height: number): BridgeBox {
  const cardHeight = Math.round(Math.min(760, height * 0.84));
  // stageObject 从视口中线铺到 right: -STAGE_BLEED，卡片无内边距、上限 940。
  const objectWidth = width / 2 + STAGE_BLEED;
  const cardWidth = Math.min(940, Math.max(240, objectWidth));
  return {
    x: width / 2 + (objectWidth - cardWidth) / 2,
    y: (height - cardHeight) / 2 + 116,
    w: cardWidth,
    h: cardHeight - 116,
  };
}

function dialGeometry(box: BridgeBox) {
  const scale = Math.min(1, (box.h - 24) / DIAL_BASE);
  return {
    cx: box.x + box.w / 2,
    cy: box.y + box.h / 2,
    inner: DIAL_INNER * scale,
    max: DIAL_BAR_MAX * scale,
    stub: DIAL_BAR_STUB * scale,
    barWidth: DIAL_BAR_WIDTH * scale,
  };
}

function barAt(box: BridgeBox, index: number, count: number, max: number) {
  const dial = dialGeometry(box);
  const length = dial.stub + (count / Math.max(1, max)) * dial.max;
  const angle = index * 15;
  const radians = (angle * Math.PI) / 180;
  const mid = dial.inner + length / 2;
  return {
    w: dial.barWidth,
    h: length,
    cx: dial.cx + Math.sin(radians) * mid,
    cy: dial.cy - Math.cos(radians) * mid,
    rotate: angle,
  };
}

function coverGrid(box: BridgeBox) {
  const gap = box.h * 0.02;
  const tile = Math.min((box.w - gap * 5) / 6, (box.h - gap * 3) / 4);
  return {
    x: box.x + (box.w - (tile * 6 + gap * 5)) / 2,
    y: box.y + (box.h - (tile * 4 + gap * 3)) / 2,
    tile,
    gap,
  };
}

function bubbleDiameter(box: BridgeBox, count: number, max: number) {
  const scale = Math.min(1.4, box.h / BUBBLE_BASE_HEIGHT);
  const radius = BUBBLE_MIN_RADIUS + (BUBBLE_MAX_RADIUS - BUBBLE_MIN_RADIUS) * Math.sqrt(count / Math.max(1, max));
  return radius * 2 * scale;
}

// 气泡落位：中心一颗，外面两圈。matter-js 接管后会自己散开，
// 这里只需要落在物件区里、量级对得上。
function bubbleSpots(box: BridgeBox, total: number): Array<readonly [number, number]> {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const rx = box.w * 0.3;
  const ry = box.h * 0.3;
  return Array.from({ length: total }, (_, index) => {
    if (index === 0) return [cx, cy] as const;
    const inner = index <= 5;
    const seat = inner ? index - 1 : index - 6;
    const seats = inner ? 5 : Math.max(1, total - 6);
    const angle = (seat / seats) * Math.PI * 2 - Math.PI / 2 + (inner ? 0 : Math.PI / seats);
    const spread = inner ? 0.58 : 1;
    return [cx + Math.cos(angle) * rx * spread, cy + Math.sin(angle) * ry * spread] as const;
  });
}

// 第五章三条源流的起点在物件区左缘（confluenceMath 各 track 的 p0）。
function streamMouths(box: BridgeBox): Array<readonly [number, number]> {
  const x = box.x + box.w * 0.05;
  return [0.16, 0.5, 0.84].map((fraction) => [x, box.y + box.h * fraction] as const);
}

// 第六章是横向卡片条：卡片 298×220、步进 314，从物件区左缘排开，后两张在视口外。
// stageObject 没有左右内边距，所以左缘就是视口中线（+1px 边框）。
function highlightSlots(width: number, height: number): BridgeBox[] {
  const startX = width / 2 + 1;
  return Array.from({ length: 5 }, (_, index) => ({
    x: startX + index * (HIGHLIGHT_CARD_WIDTH + HIGHLIGHT_CARD_GAP),
    y: (height - HIGHLIGHT_CARD_HEIGHT) / 2,
    w: HIGHLIGHT_CARD_WIDTH,
    h: HIGHLIGHT_CARD_HEIGHT,
  }));
}

function cardsToDial(t: number, box: BridgeBox, hours: number[]): Shape[] {
  const max = Math.max(1, ...hours);
  const grid = coverGrid(box);
  return hours.map((count, index) => {
    const fromX = grid.x + (index % 6) * (grid.tile + grid.gap);
    const fromY = grid.y + Math.floor(index / 6) * (grid.tile + grid.gap);
    const bar = barAt(box, index, count, max);
    const peak = count === max;
    const ratio = count / max;
    return {
      x: lerp(fromX, bar.cx - bar.w / 2, t),
      y: lerp(fromY, bar.cy - bar.h / 2, t),
      w: lerp(grid.tile, bar.w, t),
      h: lerp(grid.tile, bar.h, t),
      radius: lerp(10, bar.w / 2, t),
      rotate: lerp(0, bar.rotate, t),
      skew: 0,
      opacity: 1,
      background: mix(
        TILE_TONES[index % TILE_TONES.length]!,
        peak ? "#25F4EE" : `rgba(244,246,250,${(0.13 + ratio * 0.24).toFixed(3)})`,
        t,
      ),
      border: mix("rgba(255,255,255,0.22)", "rgba(255,255,255,0)", t),
      shadow: peak ? `0 0 ${Math.round(t * 18)}px rgba(37,244,238,${(t * 0.55).toFixed(2)})` : "none",
      label: `${index < 10 ? "0" : ""}${index}`,
      labelColor: "rgba(255,255,255,0.6)",
      labelSize: Math.max(10, grid.tile * 0.15),
      labelOpacity: clamp01(1 - t * 3),
    };
  });
}

function dialToBubbles(t: number, box: BridgeBox, hours: number[], topics: StoryBridgeTopic[]): Shape[] {
  const hourMax = Math.max(1, ...hours);
  const topicMax = Math.max(1, ...topics.map((topic) => topic.count));
  const spots = bubbleSpots(box, topics.length);
  const dial = dialGeometry(box);
  return hours.map((count, index) => {
    const bar = barAt(box, index, count, hourMax);
    const seat = index / 2;
    const topic = index % 2 === 0 ? topics[seat] : undefined;
    const spot = topic ? spots[seat] : undefined;
    const diameter = topic ? bubbleDiameter(box, topic.count, topicMax) : 10;
    const barColor = `rgba(244,246,250,${(0.13 + (count / hourMax) * 0.24).toFixed(3)})`;
    return {
      x: lerp(bar.cx - bar.w / 2, spot ? spot[0] - diameter / 2 : dial.cx - 5, t),
      y: lerp(bar.cy - bar.h / 2, spot ? spot[1] - diameter / 2 : dial.cy - 5, t),
      w: lerp(bar.w, diameter, t),
      h: lerp(bar.h, diameter, t),
      radius: lerp(bar.w / 2, diameter / 2, t),
      rotate: lerp(bar.rotate, 0, t),
      skew: 0,
      // 只有一半刻度会变成气泡，其余的收回圆心淡出。
      opacity: topic ? 1 : clamp01(1 - t * 1.6),
      background: mix(barColor, topic ? "rgba(17,18,22,0.9)" : "rgba(17,18,22,0)", t),
      border: topic ? mix("rgba(255,255,255,0)", topic.color, t) : "rgba(255,255,255,0)",
      shadow: topic && t > 0.6 ? `0 ${Math.round(t * 14)}px ${Math.round(t * 34)}px rgba(0,0,0,0.42)` : "none",
      label: topic ? topic.label : "",
      labelColor: topic ? topic.color : "transparent",
      labelSize: Math.max(11, diameter * 0.115),
      labelOpacity: clamp01((t - 0.55) / 0.45),
    };
  });
}

function bubblesToStreams(t: number, box: BridgeBox, topics: StoryBridgeTopic[]): Shape[] {
  const topicMax = Math.max(1, ...topics.map((topic) => topic.count));
  const spots = bubbleSpots(box, topics.length);
  const mouths = streamMouths(box);
  const dot = Math.max(14, box.h * 0.035);
  const shapes: Shape[] = topics.map((topic, index) => {
    const spot = spots[index]!;
    const diameter = bubbleDiameter(box, topic.count, topicMax);
    const lane = index % 3;
    const seat = Math.floor(index / 3);
    const mouth = mouths[lane]!;
    const laneColor = STREAM_COLORS[lane]!;
    return {
      x: lerp(spot[0] - diameter / 2, mouth[0] + seat * dot * 1.3 - dot / 2, t),
      y: lerp(spot[1] - diameter / 2, mouth[1] + (seat - 1.5) * dot * 1.05 - dot / 2, t),
      w: lerp(diameter, dot, t),
      h: lerp(diameter, dot, t),
      radius: lerp(diameter / 2, dot / 2, t),
      rotate: 0,
      skew: 0,
      opacity: 1,
      background: mix("rgba(17,18,22,0.9)", laneColor, t),
      border: mix(topic.color, laneColor, t),
      shadow: `0 0 ${Math.round(t * 16)}px ${laneColor}4D`,
      label: topic.label,
      labelColor: topic.color,
      labelSize: Math.max(11, diameter * 0.115),
      // 缩小时先把文字收掉，否则会挤成一团。
      labelOpacity: clamp01(1 - t * 2.2),
    };
  });
  const pillW = Math.min(132, box.w * 0.19);
  const pillH = Math.min(84, box.h * 0.15);
  mouths.forEach((mouth, index) => {
    const laneColor = STREAM_COLORS[index]!;
    shapes.push({
      x: mouth[0] - pillW * 0.2,
      y: mouth[1] - pillH / 2,
      w: pillW,
      h: pillH,
      radius: 8,
      rotate: 0,
      skew: 0,
      opacity: clamp01((t - 0.4) / 0.6),
      background: "rgba(12,14,18,0.94)",
      border: laneColor,
      shadow: `0 0 22px ${laneColor}2E`,
      label: STREAM_LABELS[index]!,
      labelColor: laneColor,
      labelSize: 17,
      labelOpacity: 1,
    });
  });
  return shapes;
}

function nodesToCards(
  t: number,
  box: BridgeBox,
  width: number,
  height: number,
  nodes: StoryBridgeNode[],
  cardLabels: string[],
): Shape[] {
  const slots = highlightSlots(width, height);
  return slots.map((slot, index) => {
    const spot = OVERLAP_SPOTS[index];
    const node = nodes[index];
    const accent = node?.color ?? "#46D39A";
    // 第五个没有对应节点，从最后一个节点的位置淡入补齐。
    const anchor = spot ?? OVERLAP_SPOTS[OVERLAP_SPOTS.length - 1]!;
    const fromW = spot ? OVERLAP_NODE_W : OVERLAP_NODE_W * 0.5;
    const fromH = spot ? OVERLAP_NODE_H : OVERLAP_NODE_H * 0.5;
    const fromX = box.x + box.w * anchor[0] - fromW / 2;
    const fromY = box.y + box.h * anchor[1] - fromH / 2;
    return {
      x: lerp(fromX, slot.x, t),
      y: lerp(fromY, slot.y, t),
      w: lerp(fromW, slot.w, t),
      h: lerp(fromH, slot.h, t),
      radius: lerp(6, 8, t),
      rotate: 0,
      skew: 0,
      opacity: spot ? 1 : Math.min(1, t * 1.8),
      background: mix("rgba(17,18,22,0.9)", "#17181D", t),
      border: mix(accent, "#30323A", t),
      shadow: `0 ${Math.round(t * 18)}px ${Math.round(t * 40)}px rgba(0,0,0,0.42)`,
      // 半程换词：交集节点名 → 坐标名。
      label: t < 0.5 ? (node?.label ?? "") : (cardLabels[index] ?? ""),
      labelColor: t < 0.5 ? accent : "#F4F6FA",
      labelSize: lerp(12, 16, t),
      labelOpacity: 1,
    };
  });
}

const FALLBACK_HOURS = Array.from({ length: 24 }, (_, index) => 4 + ((index * 7) % 17));

export interface StoryBridgeData {
  cardLabels?: string[];
  height: number;
  hours?: number[];
  nodes?: StoryBridgeNode[];
  topics?: StoryBridgeTopic[];
  width: number;
}

// 导出给测试用：每段形变的终点要落在下一章物件真正所在的位置上。
export function storyBridgeShapes(kind: StoryBridgeKind, t: number, data: StoryBridgeData): Shape[] {
  const box = bridgeObjectBox(data.width, data.height);
  const hours = data.hours && data.hours.length === 24 ? data.hours : FALLBACK_HOURS;
  if (kind === "cardsToDial") return cardsToDial(t, box, hours);
  if (kind === "dialToBubbles") return dialToBubbles(t, box, hours, data.topics ?? []);
  if (kind === "bubblesToStreams") return bubblesToStreams(t, box, data.topics ?? []);
  return nodesToCards(t, box, data.width, data.height, data.nodes ?? [], data.cardLabels ?? []);
}

function shapeCountFor(kind: StoryBridgeKind, topicCount: number): number {
  if (kind === "cardsToDial" || kind === "dialToBubbles") return 24;
  if (kind === "bubblesToStreams") return topicCount + 3;
  return 5;
}

export interface SceneBridgeSpec {
  cardLabels?: string[];
  copy: string;
  eyebrow: string;
  hours?: number[];
  kind: StoryBridgeKind;
  line1: string;
  line2: string;
  nodes?: StoryBridgeNode[];
  topics?: StoryBridgeTopic[];
}

export interface SceneSectionProps {
  /** 形变目标章的背景（与下一段自身的背景相同，交接两层同色所以看不见换层）。 */
  atmosphereNext?: React.CSSProperties;
  /** 本段自己的背景；形变期间垫在代理形状之下，接住章节层淡出。 */
  atmosphereSelf: React.CSSProperties;
  bridge?: SceneBridgeSpec;
  children?: ReactNode;
  fadeIn?: boolean;
  height: number;
  onTop?: (y: number) => void;
  overlapPrev?: boolean;
  reducedMotion: boolean;
  width: number;
  zIndex: number;
}

export function SceneSection({
  atmosphereNext,
  atmosphereSelf,
  bridge,
  children,
  fadeIn,
  height,
  onTop,
  overlapPrev,
  reducedMotion,
  width,
  zIndex,
}: SceneSectionProps) {
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const chapterRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const bgNextRef = useRef<HTMLDivElement | null>(null);
  const copyRef = useRef<HTMLDivElement | null>(null);
  const chapterCopyRef = useRef<HTMLElement | null>(null);
  const shapeRefs = useRef<Array<HTMLDivElement | null>>([]);
  const labelRefs = useRef<Array<HTMLSpanElement | null>>([]);

  // 数据走 ref：父级每次交互都重渲染，painter 不能跟着重挂。
  const bridgeRef = useRef(bridge);
  bridgeRef.current = bridge;

  // F 同时是：lead 的淡入跨度、章节文案的替换窗口、以及相邻段的交接重叠量。
  const fadeSpan = Math.round(height * FADE_RATIO);
  const holdSpan = children ? Math.round(height * HOLD_RATIO) : 0;
  const morphSpan = bridge ? Math.round(height * MORPH_RATIO) : 0;
  // 终态只保留 F：下一段在形变末段隐形滑入，pin 帧正好是形变结束帧，物件原地交棒、没有静止等待。
  const tailSpan = bridge ? fadeSpan : children ? Math.round(height * TAIL_RATIO) : 0;
  const totalHeight = height + fadeSpan + holdSpan + morphSpan + tailSpan;
  const overlapMargin = overlapPrev ? -(height + fadeSpan) : 0;

  const kind = bridge?.kind;
  const topicCount = bridge?.topics?.length ?? 0;
  const shapeCount = useMemo(
    () => (kind ? shapeCountFor(kind, topicCount) : 0),
    [kind, topicCount],
  );

  const measureTop = useCallback(() => {
    const section = sectionRef.current;
    if (!section || !onTop) return;
    const scroller = section.closest('[data-testid="story-scroll-view"]') as HTMLElement | null;
    if (!scroller) return;
    const rect = section.getBoundingClientRect();
    const outer = scroller.getBoundingClientRect();
    onTop(rect.top - outer.top + scroller.scrollTop);
  }, [onTop]);

  useEffect(() => {
    if (reducedMotion) return undefined;
    measureTop();
    window.addEventListener("resize", measureTop);
    return () => window.removeEventListener("resize", measureTop);
  }, [measureTop, reducedMotion, totalHeight]);

  useLayoutEffect(() => {
    if (reducedMotion) return undefined;
    const section = sectionRef.current;
    if (!section) return undefined;
    const scroller = section.closest('[data-testid="story-scroll-view"]') as HTMLElement | null;
    let frame = 0;
    let lastMorph = -1;

    const writeShapes = (t: number) => {
      const spec = bridgeRef.current;
      if (!spec) return;
      const shapes = storyBridgeShapes(spec.kind, t, {
        cardLabels: spec.cardLabels,
        height,
        hours: spec.hours,
        nodes: spec.nodes,
        topics: spec.topics,
        width,
      });
      const count = Math.min(shapes.length, shapeRefs.current.length);
      for (let index = 0; index < count; index += 1) {
        const node = shapeRefs.current[index];
        const shape = shapes[index]!;
        if (!node) continue;
        node.style.transform = `translate3d(${shape.x.toFixed(1)}px, ${shape.y.toFixed(1)}px, 0) rotate(${shape.rotate.toFixed(2)}deg) skewY(${shape.skew.toFixed(2)}deg)`;
        node.style.width = `${shape.w.toFixed(1)}px`;
        node.style.height = `${shape.h.toFixed(1)}px`;
        node.style.borderRadius = `${shape.radius.toFixed(1)}px`;
        node.style.opacity = shape.opacity.toFixed(3);
        node.style.background = shape.background;
        node.style.borderColor = shape.border;
        node.style.boxShadow = shape.shadow;
        const label = labelRefs.current[index];
        if (!label) continue;
        label.textContent = shape.label;
        label.style.color = shape.labelColor;
        label.style.fontSize = `${Math.round(shape.labelSize)}px`;
        label.style.opacity = shape.labelOpacity.toFixed(3);
      }
    };

    const paint = () => {
      frame = 0;
      const travel = -section.getBoundingClientRect().top;
      const stage = stageRef.current;
      if (stage) {
        // lead 从黑里淡入；章节段 pin 瞬间直接接管——底下是上一段的终态，
        // 物件同形同位、背景相同，所以读作"物件不动，其余内容换上来"。
        stage.style.opacity = fadeIn ? clamp01(travel / fadeSpan).toFixed(3) : travel >= 0 ? "1" : "0";
        stage.style.pointerEvents = travel >= 0 ? "auto" : "none";
      }
      const chapterCopy = chapterCopyRef.current
        ?? (chapterCopyRef.current = chapterRef.current?.querySelector('[data-scene-copy]') as HTMLElement | null ?? null);
      if (chapterCopy) chapterCopy.style.opacity = clamp01(travel / Math.max(1, Math.round(height * 0.18))).toFixed(3);
      if (!morphSpan) return;
      const morphStart = fadeSpan + holdSpan;
      const tMorph = clamp01((travel - morphStart) / morphSpan);
      const overlay = overlayRef.current;
      if (overlay) overlay.style.opacity = clamp01((travel - morphStart) / (morphSpan * 0.12)).toFixed(3);
      const bgNext = bgNextRef.current;
      if (bgNext) bgNext.style.opacity = tMorph.toFixed(3);
      const copy = copyRef.current;
      if (copy) copy.style.opacity = clamp01((tMorph - 0.1) / 0.2).toFixed(3);
      const chapter = chapterRef.current;
      if (chapter) {
        // 代理形状 t=0 与真实物件同形同位，章节层在形变头 20% 内让位。
        const gone = clamp01((travel - morphStart) / (morphSpan * 0.2));
        chapter.style.opacity = (1 - gone).toFixed(3);
        chapter.style.pointerEvents = gone >= 1 ? "none" : "auto";
      }
      if (Math.abs(tMorph - lastMorph) < 0.002) return;
      lastMorph = tMorph;
      writeShapes(tMorph);
    };

    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(paint);
    };

    paint();
    scroller?.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      scroller?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [fadeIn, fadeSpan, height, holdSpan, kind, morphSpan, reducedMotion, shapeCount, totalHeight, width]);

  if (reducedMotion) {
    if (!children) return null;
    return <div style={{ position: "relative", width: "100%" }}>{children}</div>;
  }

  return (
    <div
      ref={sectionRef}
      style={{
        position: "relative",
        width: "100%",
        height: totalHeight,
        marginTop: overlapMargin,
        zIndex,
      }}
    >
      <div style={{ position: "sticky", top: 0, height, overflow: "hidden" }}>
        <div ref={stageRef} style={{ position: "absolute", inset: 0, opacity: 0 }}>
          {children ? (
            <div ref={chapterRef} style={{ position: "absolute", inset: 0 }}>
              {children}
            </div>
          ) : null}
        </div>
        {bridge ? (
          <div
            ref={overlayRef}
            aria-hidden
            style={{ position: "absolute", inset: 0, opacity: 0, pointerEvents: "none" }}
          >
            <div style={{ position: "absolute", inset: 0, ...atmosphereSelf }} />
            {atmosphereNext ? (
              <div ref={bgNextRef} style={{ position: "absolute", inset: 0, opacity: 0, ...atmosphereNext }} />
            ) : null}
            {Array.from({ length: shapeCount }, (_, index) => (
              <div
                key={index}
                ref={(node) => {
                  shapeRefs.current[index] = node;
                }}
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  display: "grid",
                  placeItems: "center",
                  overflow: "hidden",
                  borderWidth: 1,
                  borderStyle: "solid",
                  borderColor: "transparent",
                  opacity: 0,
                  willChange: "transform, width, height",
                }}
              >
                <span
                  ref={(node) => {
                    labelRefs.current[index] = node;
                  }}
                  style={{
                    maxWidth: "88%",
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                    fontWeight: 900,
                    opacity: 0,
                  }}
                />
              </div>
            ))}
            <div
              ref={copyRef}
              style={{
                position: "absolute",
                left: width < 1250 ? 44 : "14%",
                top: 0,
                bottom: 0,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                width: width < 1250 ? 320 : 560,
                opacity: 0,
              }}
            >
              <p style={{ margin: 0, color: "#25F4EE", fontSize: 13, fontWeight: 900 }}>{bridge.eyebrow}</p>
              <h2
                style={{
                  margin: "14px 0 0",
                  color: "#F4F6FA",
                  fontSize: width < 1250 ? 38 : 52,
                  lineHeight: 1.14,
                  letterSpacing: "-0.04em",
                  fontWeight: 700,
                }}
              >
                {bridge.line1}
                <br />
                {bridge.line2}
              </h2>
              <p style={{ maxWidth: 510, margin: "20px 0 0", color: "rgba(244,246,250,0.46)", fontSize: 14, lineHeight: 1.78 }}>
                {bridge.copy}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
