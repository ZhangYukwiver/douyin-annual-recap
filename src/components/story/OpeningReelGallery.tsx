import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  ImageBackground,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { Play } from "lucide-react-native";

import { workspaceColors as color, workspaceRadii as radius } from "../workspace/workspaceTheme";
import type { StoryContentItem } from "./storyModel";

const ROW_CONFIGS = [
  { speed: 1, phase: 0.06 },
  { speed: -0.72, phase: 0.42 },
  { speed: 0.88, phase: 0.7 },
  { speed: -0.62, phase: 0.2 },
  { speed: 0.76, phase: 0.54 },
] as const;
const TRACK_COPIES = 3;
const MIN_ITEMS_PER_ROW = 14;
const MAX_ITEMS_PER_ROW = 22;
const ABSOLUTE_FILL = { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 } as const;
const FALLBACK_COLORS = ["#153334", "#3A1721", "#382E19", "#1D2940", "#2D2038", "#173429"] as const;

interface OpeningReelGalleryProps {
  active: boolean;
  height: number;
  items: readonly StoryContentItem[];
  privacy: boolean;
  reducedMotion: boolean;
  width: number;
}

interface ReelCell {
  id: string;
  item: StoryContentItem;
}

export function OpeningReelGallery({
  active,
  height,
  items,
  privacy,
  reducedMotion,
  width,
}: OpeningReelGalleryProps) {
  const rootRef = useRef<View | null>(null);
  const translations = useRef(ROW_CONFIGS.map(() => new Animated.Value(0))).current;
  const position = useRef(0);
  const velocity = useRef(0.12);
  const dragging = useRef(false);
  const pointerId = useRef<number | null>(null);
  const pointerCaptured = useRef(false);
  const lastPointerX = useRef(0);
  const lastPointerTime = useRef(0);
  const totalPointerTravel = useRef(0);
  const lastDragEndedAt = useRef(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const stageWidth = width * 1.24;
  const rowGap = clamp(height * 0.014, 8, 12);
  const rowHeight = clamp((height * 1.08 - rowGap * (ROW_CONFIGS.length - 1)) / ROW_CONFIGS.length, 106, 138);
  const tileWidth = rowHeight * (9 / 16);
  const tileGap = clamp(tileWidth * 0.13, 7, 10);
  const pitch = tileWidth + tileGap;
  const itemsPerRow = clamp(
    Math.ceil(stageWidth / (pitch * 2)) + 2,
    MIN_ITEMS_PER_ROW,
    MAX_ITEMS_PER_ROW,
  );
  const cycleWidth = itemsPerRow * pitch;
  const stageHeight = ROW_CONFIGS.length * rowHeight + (ROW_CONFIGS.length - 1) * rowGap;

  const rows = useMemo(() => buildRows(items, itemsPerRow), [items, itemsPerRow]);
  const selectedCell = useMemo(
    () => rows.flat().find((cell) => selectedId?.endsWith(`:${cell.id}`)) ?? null,
    [rows, selectedId],
  );

  const updateTracks = useCallback((nextPosition: number) => {
    ROW_CONFIGS.forEach((config, index) => {
      const phase = cycleWidth * config.phase;
      const shift = positiveModulo(nextPosition * config.speed + phase, cycleWidth);
      translations[index]?.setValue(-cycleWidth + shift);
    });
  }, [cycleWidth, translations]);

  const handleWheel = useCallback((event: unknown) => {
    if (!active || reducedMotion || Platform.OS !== "web") return;
    const nativeEvent = (event as { nativeEvent?: { deltaX?: number; deltaY?: number } }).nativeEvent;
    const deltaX = nativeEvent?.deltaX ?? 0;
    const deltaY = nativeEvent?.deltaY ?? 0;
    const delta = Math.abs(deltaY) >= Math.abs(deltaX) ? deltaY : deltaX;
    velocity.current = clamp(velocity.current + clamp(delta, -140, 140) * 0.022, -5.2, 5.2);
  }, [active, reducedMotion]);

  useEffect(() => {
    position.current = positiveModulo(position.current, cycleWidth);
    updateTracks(position.current);
  }, [cycleWidth, updateTracks]);

  useEffect(() => {
    if (!active || reducedMotion || Platform.OS !== "web" || typeof window === "undefined") return undefined;
    let frame: number | null = null;
    let previousTime = window.performance.now();

    const animate = (time: number) => {
      const frameScale = clamp((time - previousTime) / (1000 / 60), 0.25, 2.5);
      previousTime = time;
      if (!dragging.current) {
        const damping = Math.pow(0.925, frameScale);
        velocity.current *= damping;
        if (Math.abs(velocity.current) < 0.12) {
          velocity.current += (0.12 - velocity.current) * Math.min(1, 0.045 * frameScale);
        }
        position.current += velocity.current * frameScale;
        updateTracks(position.current);
      }
      frame = window.requestAnimationFrame(animate);
    };

    frame = window.requestAnimationFrame(animate);
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [active, reducedMotion, updateTracks]);

  useEffect(() => {
    if (!active || reducedMotion || Platform.OS !== "web") return undefined;
    const root = rootRef.current as unknown as HTMLElement | null;
    if (!root?.addEventListener) return undefined;

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      dragging.current = true;
      pointerId.current = event.pointerId;
      lastPointerX.current = event.clientX;
      lastPointerTime.current = event.timeStamp;
      totalPointerTravel.current = 0;
      velocity.current = 0;
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging.current || pointerId.current !== event.pointerId) return;
      const deltaX = event.clientX - lastPointerX.current;
      const elapsed = Math.max(8, event.timeStamp - lastPointerTime.current);
      totalPointerTravel.current += Math.abs(deltaX);
      position.current += deltaX * 1.08;
      velocity.current = clamp((deltaX / elapsed) * (1000 / 60) * 0.82, -5.2, 5.2);
      lastPointerX.current = event.clientX;
      lastPointerTime.current = event.timeStamp;
      updateTracks(position.current);
      if (totalPointerTravel.current > 5) {
        if (!pointerCaptured.current) {
          root.setPointerCapture?.(event.pointerId);
          pointerCaptured.current = true;
        }
        event.preventDefault();
      }
    };
    const stopDragging = (event: PointerEvent) => {
      if (pointerId.current !== event.pointerId) return;
      if (totalPointerTravel.current > 5) lastDragEndedAt.current = window.performance.now();
      dragging.current = false;
      pointerId.current = null;
      if (pointerCaptured.current) root.releasePointerCapture?.(event.pointerId);
      pointerCaptured.current = false;
    };

    root.addEventListener("pointerdown", onPointerDown);
    root.addEventListener("pointermove", onPointerMove);
    root.addEventListener("pointerup", stopDragging);
    root.addEventListener("pointercancel", stopDragging);
    return () => {
      root.removeEventListener("pointerdown", onPointerDown);
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerup", stopDragging);
      root.removeEventListener("pointercancel", stopDragging);
      dragging.current = false;
      pointerId.current = null;
      pointerCaptured.current = false;
    };
  }, [active, reducedMotion, updateTracks]);

  const selectCell = useCallback((selectionId: string) => {
    if (Platform.OS === "web" && window.performance.now() - lastDragEndedAt.current < 140) return;
    setSelectedId((current) => current === selectionId ? null : selectionId);
  }, []);

  return (
    <View
      {...({ onWheel: handleWheel } as Record<string, unknown>)}
      accessibilityElementsHidden={false}
      ref={rootRef}
      pointerEvents="auto"
      style={styles.root}
      testID="opening-reel-gallery"
    >
      <View
        pointerEvents="box-none"
        style={[
          styles.stage,
          {
            height: stageHeight,
            left: (width - stageWidth) / 2,
            top: (height - stageHeight) / 2,
            width: stageWidth,
          },
        ]}
      >
        {rows.map((row, rowIndex) => (
          <View
            key={`reel-row-${rowIndex}`}
            pointerEvents="box-none"
            style={[styles.row, { height: rowHeight, marginBottom: rowIndex === rows.length - 1 ? 0 : rowGap }]}
          >
            <Animated.View
              pointerEvents="box-none"
              style={[
                styles.track,
                {
                  gap: tileGap,
                  transform: [{ translateX: translations[rowIndex]! }],
                  width: cycleWidth * TRACK_COPIES,
                },
              ]}
            >
              {Array.from({ length: TRACK_COPIES }, (_, copyIndex) => row.map((cell, cellIndex) => {
                const selectionId = `${rowIndex}:${copyIndex}:${cellIndex}:${cell.id}`;
                return (
                  <ReelCover
                    accessible={copyIndex === 1 && rowIndex === 2}
                    height={rowHeight}
                    item={cell.item.record}
                    key={selectionId}
                    onPress={() => selectCell(selectionId)}
                    privacy={privacy}
                    selected={selectedId === selectionId}
                    width={tileWidth}
                  />
                );
              }))}
            </Animated.View>
          </View>
        ))}
      </View>

      <View pointerEvents="none" style={styles.tint} />
      <View pointerEvents="none" style={styles.edgeLeft} />
      <View pointerEvents="none" style={styles.edgeRight} />
      <View pointerEvents="none" style={styles.motionRail}>
        <View style={styles.motionRailActive} />
      </View>

      {selectedCell ? (
        <View accessibilityLiveRegion="polite" pointerEvents="none" style={styles.selectionMeta} testID="opening-reel-selection">
          <View style={styles.selectionAccent} />
          <View style={styles.selectionCopy}>
            <Text numberOfLines={1} style={styles.selectionTitle}>
              {privacy ? "内容封面" : selectedCell.item.record.title}
            </Text>
            <Text numberOfLines={1} style={styles.selectionAuthor}>
              {privacy ? "创作者已隐藏" : selectedCell.item.record.author ?? "未知创作者"}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function ReelCover({
  accessible,
  height,
  item,
  onPress,
  privacy,
  selected,
  width,
}: {
  accessible: boolean;
  height: number;
  item: StoryContentItem["record"];
  onPress: () => void;
  privacy: boolean;
  selected: boolean;
  width: number;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [item.coverUrl]);

  return (
    <Pressable
      accessible={accessible}
      accessibilityLabel={accessible ? (privacy ? "选择内容封面" : `选择封面：${item.title}`) : undefined}
      accessibilityElementsHidden={!accessible}
      accessibilityRole={accessible ? "button" : undefined}
      aria-hidden={!accessible}
      focusable={accessible}
      importantForAccessibility={accessible ? "auto" : "no-hide-descendants"}
      onPress={onPress}
      tabIndex={accessible ? 0 : -1}
      style={({ pressed }) => [
        styles.coverButton,
        { height, width },
        pressed && styles.coverPressed,
        Platform.OS === "web" ? styles.coverPointer : null,
      ]}
    >
      {selected ? <View pointerEvents="none" style={styles.selectedCyan} /> : null}
      {selected ? <View pointerEvents="none" style={styles.selectedRed} /> : null}
      <View style={styles.coverFrame}>
        {item.coverUrl && !privacy && !failed ? (
          <ImageBackground
            onError={() => setFailed(true)}
            resizeMode="cover"
            source={{ uri: item.coverUrl }}
            style={styles.coverImage}
          >
            <View style={styles.coverImageShade} />
          </ImageBackground>
        ) : (
          <View style={[styles.coverFallback, { backgroundColor: fallbackColor(item.id) }]}>
            <Text numberOfLines={4} style={styles.coverFallbackTitle}>
              {privacy ? "内容封面" : item.title}
            </Text>
            <Text numberOfLines={1} style={styles.coverFallbackAuthor}>
              {privacy ? "已隐藏" : item.author ?? "未知创作者"}
            </Text>
          </View>
        )}
      </View>
      {selected ? (
        <View pointerEvents="none" style={styles.playBadge}>
          <Play color={color.text} fill={color.text} size={12} />
        </View>
      ) : null}
    </Pressable>
  );
}

function buildRows(items: readonly StoryContentItem[], itemCount: number): ReelCell[][] {
  if (items.length === 0) return [];
  return ROW_CONFIGS.map((_, rowIndex) => {
    const row: ReelCell[] = [];
    const direction = rowIndex % 2 === 0 ? 1 : -1;
    const stride = Math.max(1, Math.floor(items.length / Math.min(items.length, itemCount)));
    for (let slot = 0; slot < itemCount; slot += 1) {
      const rawIndex = rowIndex * 3 + direction * slot * stride;
      const itemIndex = positiveModulo(rawIndex, items.length);
      const item = items[itemIndex]!;
      row.push({ id: `${rowIndex}-${slot}-${item.key}`, item });
    }
    return row;
  });
}

function positiveModulo(value: number, divisor: number): number {
  if (divisor === 0) return 0;
  return ((value % divisor) + divisor) % divisor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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
  return FALLBACK_COLORS[hashString(value) % FALLBACK_COLORS.length]!;
}

const styles = StyleSheet.create({
  root: {
    ...ABSOLUTE_FILL,
    overflow: "hidden",
    backgroundColor: color.black,
    ...(Platform.OS === "web" ? ({ touchAction: "pan-y", userSelect: "none" } as unknown as ViewStyle) : {}),
  },
  stage: { position: "absolute", transform: [{ rotate: "-5deg" }, { scale: 1.06 }] },
  row: { overflow: "visible" },
  track: { flexDirection: "row", alignItems: "stretch" },
  coverButton: { position: "relative", flexShrink: 0 },
  coverPointer: { cursor: "grab" } as never,
  coverPressed: { opacity: 0.82, transform: [{ scale: 0.975 }] },
  coverFrame: { flex: 1, overflow: "hidden", borderRadius: radius.small, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: color.surfaceMuted },
  coverImage: { flex: 1 },
  coverImageShade: { ...ABSOLUTE_FILL, backgroundColor: "rgba(5,5,6,0.1)" },
  coverFallback: { flex: 1, justifyContent: "space-between", paddingHorizontal: 8, paddingVertical: 10 },
  coverFallbackTitle: { color: "rgba(255,255,255,0.72)", fontSize: 11, lineHeight: 16, fontWeight: "900" },
  coverFallbackAuthor: { color: "rgba(255,255,255,0.48)", fontSize: 8, fontWeight: "800" },
  selectedCyan: { position: "absolute", zIndex: 2, top: -4, right: 3, bottom: 3, left: -4, borderWidth: 2, borderColor: color.cyan, borderRadius: radius.small },
  selectedRed: { position: "absolute", zIndex: 2, top: 3, right: -4, bottom: -4, left: 3, borderWidth: 2, borderColor: color.accent, borderRadius: radius.small },
  playBadge: { position: "absolute", zIndex: 3, right: 7, bottom: 7, width: 26, height: 26, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: "rgba(5,5,6,0.8)" },
  tint: { ...ABSOLUTE_FILL, backgroundColor: "rgba(5,5,6,0.3)" },
  edgeLeft: { position: "absolute", top: 0, bottom: 0, left: 0, width: "8%", backgroundColor: "rgba(5,5,6,0.42)" },
  edgeRight: { position: "absolute", top: 0, right: 0, bottom: 0, width: "8%", backgroundColor: "rgba(5,5,6,0.42)" },
  motionRail: { position: "absolute", right: 24, top: "39%", width: 2, height: "22%", backgroundColor: "rgba(255,255,255,0.22)" },
  motionRailActive: { width: 2, height: "34%", backgroundColor: color.text },
  selectionMeta: { position: "absolute", zIndex: 4, left: 28, bottom: 26, maxWidth: 320, minHeight: 48, flexDirection: "row", alignItems: "stretch", backgroundColor: "rgba(5,5,6,0.78)" },
  selectionAccent: { width: 3, backgroundColor: color.cyan },
  selectionCopy: { minWidth: 0, flex: 1, justifyContent: "center", paddingHorizontal: 12, paddingVertical: 8 },
  selectionTitle: { color: color.text, fontSize: 11, fontWeight: "900" },
  selectionAuthor: { color: color.textMuted, fontSize: 9, fontWeight: "700", marginTop: 3 },
});
