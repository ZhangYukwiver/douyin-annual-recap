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
import { coverGatherWindow, coverStackLayerOffset, shuffledCoverIndices } from "./openingParticlePhysics";

const ROW_CONFIGS = [
  { speed: 1, phase: 0.06 },
  { speed: -0.72, phase: 0.42 },
  { speed: 0.88, phase: 0.7 },
  { speed: -0.62, phase: 0.2 },
  { speed: 0.76, phase: 0.54 },
] as const;
const OPENING_COVER_SOURCE_ROTATION = "-5deg";
const ABSOLUTE_FILL = { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 } as const;
const FALLBACK_COLORS = ["#153334", "#3A1721", "#382E19", "#1D2940", "#2D2038", "#173429"] as const;

interface OpeningReelGalleryProps {
  active: boolean;
  height: number;
  items: readonly StoryContentItem[];
  privacy: boolean;
  reducedMotion: boolean;
  transitionProgress: Animated.Value;
  width: number;
}

interface ReelCell {
  id: string;
  item: StoryContentItem;
}

interface DeckCard {
  key: string;
  sourceKey: string;
  item: StoryContentItem;
  gatherStart: number;
  targetX: number;
  targetY: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function OpeningReelGallery({
  active,
  height,
  items,
  privacy,
  reducedMotion,
  transitionProgress,
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
  const lastVerticalWheelAt = useRef(0);
  const gatherTarget = useRef({ x: width / 2, y: height / 2 });
  const transitioning = useRef(false);
  const deckCaptured = useRef(false);
  const coversHiddenRef = useRef(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [coversHidden, setCoversHidden] = useState(false);
  const [deckCards, setDeckCards] = useState<DeckCard[]>([]);
  const [gatherStartByKey, setGatherStartByKey] = useState<Map<string, number>>(new Map());

  const rowCount = Math.max(1, Math.min(ROW_CONFIGS.length, items.length));
  const stageWidth = width * 1.24;
  const rowGap = clamp(height * 0.014, 8, 12);
  const rowHeight = clamp((height * 1.08 - rowGap * (rowCount - 1)) / rowCount, 106, 138);
  const tileWidth = rowHeight * (9 / 16);
  const tileGap = clamp(tileWidth * 0.13, 7, 10);
  const stageHeight = rowCount * rowHeight + (rowCount - 1) * rowGap;

  const rows = useMemo(() => buildRows(items, rowCount), [items, rowCount]);
  const rowWidths = useMemo(() => rows.map((row) => (
    row.length * tileWidth + Math.max(0, row.length - 1) * tileGap
  )), [rows, tileGap, tileWidth]);
  // Only rows wider than the viewport need a second, off-screen copy for a seamless wrap.
  // The copy is one cycle away, so the same cover cannot be visible twice at once.
  const trackCopies = useMemo(() => rowWidths.map((rowWidth) => rowWidth > width ? 2 : 1), [rowWidths, width]);
  const trackWidths = useMemo(() => rowWidths.map((rowWidth, index) => {
    const copies = trackCopies[index] ?? 1;
    return rowWidth * copies + tileGap * Math.max(0, copies - 1);
  }), [rowWidths, tileGap, trackCopies]);
  const itemsByKey = useMemo(() => new Map(items.map((item) => [item.key, item])), [items]);
  const selectedCell = useMemo(
    () => rows.flat().find((cell) => selectedId?.endsWith(`:${cell.id}`)) ?? null,
    [rows, selectedId],
  );

  const captureDeckCards = useCallback(() => {
    if (Platform.OS !== "web") return;
    const root = rootRef.current as unknown as HTMLElement | null;
    if (!root) return;
    const rootRect = root.getBoundingClientRect();
    const targetX = clamp(gatherTarget.current.x, 0, rootRect.width);
    const targetY = clamp(gatherTarget.current.y, 0, rootRect.height);
    const visible = Array.from(root.querySelectorAll<HTMLElement>("[data-opening-cover='true']"))
      .map((node) => {
        const item = itemsByKey.get(node.dataset.openingItemKey ?? "");
        const rect = node.getBoundingClientRect();
        return item ? {
          key: `${node.dataset.openingCellKey ?? item.key}:${rect.left}:${rect.top}`,
          sourceKey: node.dataset.openingCellKey ?? item.key,
          item,
          targetX,
          targetY,
          x: rect.left - rootRect.left,
          y: rect.top - rootRect.top,
          width: rect.width,
          height: rect.height,
          right: rect.right,
          bottom: rect.bottom,
        } : null;
      })
      .filter((card): card is DeckCard & { right: number; bottom: number } => Boolean(
        card
        && card.right > rootRect.left
        && card.x < rootRect.width
        && card.bottom > rootRect.top
        && card.y < rootRect.height,
      ))
      .sort((left, right) => left.y - right.y || left.x - right.x);

    const selected = shuffledCoverIndices(visible.length).map((index, orderIndex) => {
      const { right: _right, bottom: _bottom, ...card } = visible[index]!;
      return {
        ...card,
        gatherStart: coverGatherWindow(orderIndex, visible.length)[0],
      };
    });

    deckCaptured.current = true;
    setDeckCards(selected);
    setGatherStartByKey(new Map(selected.map((card) => [card.sourceKey, card.gatherStart])));
  }, [itemsByKey]);

  useEffect(() => {
    deckCaptured.current = false;
    setDeckCards([]);
    setGatherStartByKey(new Map());
    if (!transitioning.current) gatherTarget.current = { x: width / 2, y: height / 2 };
    if (!transitioning.current || Platform.OS !== "web") return undefined;
    const frame = window.requestAnimationFrame(captureDeckCards);
    return () => window.cancelAnimationFrame(frame);
  }, [captureDeckCards, height, items, width]);

  useEffect(() => {
    const listener = transitionProgress.addListener(({ value }) => {
      const nextTransitioning = value > 0.001;
      if (nextTransitioning && !transitioning.current) velocity.current = 0;
      if (!nextTransitioning && transitioning.current) {
        deckCaptured.current = false;
        setDeckCards([]);
        setGatherStartByKey(new Map());
      }
      transitioning.current = nextTransitioning;
      const nextCoversHidden = value > 0.05;
      if (nextCoversHidden !== coversHiddenRef.current) {
        coversHiddenRef.current = nextCoversHidden;
        setCoversHidden(nextCoversHidden);
      }
      if (value > 0.001 && !deckCaptured.current) {
        captureDeckCards();
        setSelectedId(null);
      }
    });
    return () => transitionProgress.removeListener(listener);
  }, [captureDeckCards, transitionProgress]);

  const updateTracks = useCallback((nextPosition: number) => {
    rows.forEach((_, index) => {
      const config = ROW_CONFIGS[index]!;
      const rowWidth = rowWidths[index] ?? 0;
      const center = (stageWidth - rowWidth) / 2;
      const cycle = rowWidth > width ? rowWidth + tileGap : 0;
      if (cycle === 0) {
        translations[index]?.setValue(center);
        return;
      }
      const offset = positiveModulo(nextPosition * config.speed + cycle * config.phase, cycle);
      translations[index]?.setValue(center - offset);
    });
  }, [rowWidths, rows, stageWidth, tileGap, translations, width]);

  const updateGatherTarget = useCallback((clientX: number, clientY: number) => {
    const root = rootRef.current as unknown as HTMLElement | null;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    gatherTarget.current = {
      x: clamp(clientX - rect.left, 0, rect.width),
      y: clamp(clientY - rect.top, 0, rect.height),
    };
  }, []);

  const handleWheel = useCallback((event: unknown) => {
    if (!active || reducedMotion || transitioning.current || Platform.OS !== "web") return;
    const nativeEvent = (event as { nativeEvent?: { clientX?: number; clientY?: number; deltaX?: number; deltaY?: number } }).nativeEvent;
    const clientX = nativeEvent?.clientX;
    const clientY = nativeEvent?.clientY;
    if (typeof clientX === "number" && typeof clientY === "number") {
      updateGatherTarget(clientX, clientY);
    }
    const deltaX = nativeEvent?.deltaX ?? 0;
    const deltaY = nativeEvent?.deltaY ?? 0;
    if (Math.abs(deltaX) <= Math.abs(deltaY)) {
      velocity.current = 0;
      lastVerticalWheelAt.current = window.performance.now();
      return;
    }
    velocity.current = clamp(velocity.current + clamp(deltaX, -140, 140) * 0.022, -5.2, 5.2);
  }, [active, reducedMotion, updateGatherTarget]);

  useEffect(() => {
    updateTracks(position.current);
  }, [updateTracks]);

  useEffect(() => {
    if (!active || reducedMotion || Platform.OS !== "web" || typeof window === "undefined") return undefined;
    let frame: number | null = null;
    let previousTime = window.performance.now();

    const animate = (time: number) => {
      const frameScale = clamp((time - previousTime) / (1000 / 60), 0.25, 2.5);
      previousTime = time;
      if (!dragging.current && !transitioning.current && time - lastVerticalWheelAt.current > 160) {
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
      updateGatherTarget(event.clientX, event.clientY);
      if (event.button !== 0 || transitioning.current) return;
      dragging.current = true;
      pointerId.current = event.pointerId;
      lastPointerX.current = event.clientX;
      lastPointerTime.current = event.timeStamp;
      totalPointerTravel.current = 0;
      velocity.current = 0;
    };
    const onPointerMove = (event: PointerEvent) => {
      updateGatherTarget(event.clientX, event.clientY);
      if (transitioning.current || !dragging.current || pointerId.current !== event.pointerId) return;
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
  }, [active, reducedMotion, updateGatherTarget, updateTracks]);

  const selectCell = useCallback((selectionId: string) => {
    if (Platform.OS === "web" && window.performance.now() - lastDragEndedAt.current < 140) return;
    setSelectedId((current) => current === selectionId ? null : selectionId);
  }, []);

  return (
    <View
      {...({ onWheel: handleWheel } as Record<string, unknown>)}
      accessibilityElementsHidden={coversHidden}
      importantForAccessibility={coversHidden ? "no-hide-descendants" : "auto"}
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
                  width: trackWidths[rowIndex],
                },
              ]}
            >
              {Array.from({ length: trackCopies[rowIndex] ?? 1 }, (_, copyIndex) => row.map((cell, cellIndex) => {
                const selectionId = `${rowIndex}:${copyIndex}:${cellIndex}:${cell.id}`;
                return (
                  <ReelCover
                    accessible={!coversHidden && copyIndex === 0 && rowIndex === Math.floor(rows.length / 2)}
                    cellKey={selectionId}
                    height={rowHeight}
                    item={cell.item}
                    key={selectionId}
                    onPress={() => selectCell(selectionId)}
                    privacy={privacy}
                    selected={selectedId === selectionId}
                    gatherStart={gatherStartByKey.get(selectionId)}
                    transitionProgress={transitionProgress}
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

      <View
        accessibilityElementsHidden
        aria-hidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={styles.deckLayer}
        testID="opening-card-deck"
      >
        {deckCards.map((card, index) => {
          const targetWidth = clamp(width * 0.1, 112, 132);
          const targetHeight = targetWidth * (card.height / card.width);
          const targetCenterX = card.targetX + coverStackLayerOffset(index, deckCards.length);
          const targetCenterY = card.targetY;
          const targetLeft = targetCenterX - targetWidth / 2;
          const targetTop = targetCenterY - targetHeight / 2;
          const [gatherStart, gatherEnd] = coverGatherWindow(index, deckCards.length);
          const cardProgressInput = [0, gatherStart, gatherEnd, 1];
          const cardVisibleInput = [0, gatherStart, gatherStart + 0.04, 1];
          const cardHighlightInput = [0, 0.01, gatherStart, gatherStart + 0.001, gatherEnd, gatherEnd + 0.001, 1];
          return (
            <Animated.View
              key={card.key}
              style={[
                styles.deckCard,
                {
                  height: transitionProgress.interpolate({ inputRange: cardProgressInput, outputRange: [card.height, card.height, targetHeight, targetHeight], extrapolate: "clamp" }),
                  left: transitionProgress.interpolate({ inputRange: cardProgressInput, outputRange: [card.x, card.x, targetLeft, targetLeft], extrapolate: "clamp" }),
                  opacity: transitionProgress.interpolate({
                    inputRange: cardVisibleInput,
                    outputRange: [0, 0, 1, 1],
                    extrapolate: "clamp",
                  }),
                  top: transitionProgress.interpolate({ inputRange: cardProgressInput, outputRange: [card.y, card.y, targetTop, targetTop], extrapolate: "clamp" }),
                  transform: [{
                    rotate: transitionProgress.interpolate({
                      inputRange: cardProgressInput,
                      outputRange: [OPENING_COVER_SOURCE_ROTATION, OPENING_COVER_SOURCE_ROTATION, "0deg", "0deg"],
                      extrapolate: "clamp",
                    }),
                  }],
                  width: transitionProgress.interpolate({ inputRange: cardProgressInput, outputRange: [card.width, card.width, targetWidth, targetWidth], extrapolate: "clamp" }),
                  zIndex: deckCards.length - index,
                },
              ]}
            >
              <CoverArtwork item={card.item.record} privacy={privacy} />
              <Animated.View
                pointerEvents="none"
                style={[styles.deckHighlight, {
                  opacity: transitionProgress.interpolate({
                    inputRange: cardHighlightInput,
                    outputRange: [0, 0, 0, 0.16, 0.16, 0, 0],
                    extrapolate: "clamp",
                  }),
                }]}
              />
            </Animated.View>
          );
        })}
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
  cellKey,
  gatherStart,
  height,
  item,
  onPress,
  privacy,
  selected,
  transitionProgress,
  width,
}: {
  accessible: boolean;
  cellKey: string;
  gatherStart?: number;
  height: number;
  item: StoryContentItem;
  onPress: () => void;
  privacy: boolean;
  selected: boolean;
  transitionProgress: Animated.Value;
  width: number;
}) {
  const sourceOpacity = gatherStart === undefined
    ? transitionProgress.interpolate({ inputRange: [0, 1], outputRange: [1, 1], extrapolate: "clamp" })
    : transitionProgress.interpolate({
        inputRange: [0, gatherStart, gatherStart + 0.04, 1],
        outputRange: [1, 1, 0, 0],
        extrapolate: "clamp",
      });

  return (
    <Pressable
      accessible={accessible}
      accessibilityLabel={accessible ? (privacy ? "选择内容封面" : `选择封面：${item.record.title}`) : undefined}
      accessibilityElementsHidden={!accessible}
      accessibilityRole={accessible ? "button" : undefined}
      aria-hidden={!accessible}
      {...(Platform.OS === "web" ? { dataSet: {
        openingCellKey: cellKey,
        openingCover: "true",
        openingItemKey: item.key,
      } } : {})}
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
      <Animated.View style={[styles.coverVisual, { opacity: sourceOpacity }]}>
        {selected ? <View pointerEvents="none" style={styles.selectedCyan} /> : null}
        {selected ? <View pointerEvents="none" style={styles.selectedRed} /> : null}
        <View style={styles.coverFrame}>
          <CoverArtwork item={item.record} privacy={privacy} />
        </View>
        {selected ? (
          <View pointerEvents="none" style={styles.playBadge}>
            <Play color={color.text} fill={color.text} size={12} />
          </View>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

function CoverArtwork({ item, privacy }: { item: StoryContentItem["record"]; privacy: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [item.coverUrl]);

  if (item.coverUrl && !privacy && !failed) {
    return (
      <ImageBackground
        onError={() => setFailed(true)}
        resizeMode="cover"
        source={{ uri: item.coverUrl }}
        style={styles.coverArtwork}
      >
        <View style={styles.coverImageShade} />
      </ImageBackground>
    );
  }

  return (
    <View style={[styles.coverArtwork, styles.coverFallback, { backgroundColor: fallbackColor(item.id) }]}>
      <Text numberOfLines={4} style={styles.coverFallbackTitle}>
        {privacy ? "内容封面" : item.title}
      </Text>
      <Text numberOfLines={1} style={styles.coverFallbackAuthor}>
        {privacy ? "已隐藏" : item.author ?? "未知创作者"}
      </Text>
    </View>
  );
}

function buildRows(items: readonly StoryContentItem[], rowCount: number): ReelCell[][] {
  if (items.length === 0) return [];
  const rows = Array.from({ length: rowCount }, () => [] as ReelCell[]);
  items.forEach((item, index) => {
    const rowIndex = index % rowCount;
    rows[rowIndex]!.push({ id: `${rowIndex}-${Math.floor(index / rowCount)}-${item.key}`, item });
  });
  return rows;
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
  stage: { position: "absolute", transform: [{ rotate: OPENING_COVER_SOURCE_ROTATION }, { scale: 1.06 }] },
  row: { overflow: "visible" },
  track: { flexDirection: "row", alignItems: "stretch" },
  coverButton: { position: "relative", flexShrink: 0 },
  coverVisual: { position: "relative", flex: 1 },
  coverPointer: { cursor: "grab" } as never,
  coverPressed: { opacity: 0.82, transform: [{ scale: 0.975 }] },
  coverFrame: { flex: 1, position: "relative", overflow: "hidden", borderRadius: radius.small, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(17,18,22,0.32)" },
  coverArtwork: { ...ABSOLUTE_FILL, overflow: "hidden" },
  coverImageShade: { ...ABSOLUTE_FILL, backgroundColor: "rgba(5,5,6,0.1)" },
  coverFallback: { justifyContent: "space-between", paddingHorizontal: 8, paddingVertical: 10 },
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
  deckLayer: { ...ABSOLUTE_FILL, zIndex: 8 },
  deckCard: { position: "absolute", overflow: "hidden", borderRadius: radius.small, borderWidth: 1, borderColor: "rgba(247,247,248,0.28)", backgroundColor: color.sidebar, ...(Platform.OS === "web" ? ({ boxShadow: "0 12px 28px rgba(5,5,6,0.34)", willChange: "transform, opacity" } as unknown as ViewStyle) : {}) },
  deckHighlight: { ...ABSOLUTE_FILL, zIndex: 1, backgroundColor: "rgba(255,255,255,0.16)" },
  selectionMeta: { position: "absolute", zIndex: 4, left: 28, bottom: 26, maxWidth: 320, minHeight: 48, flexDirection: "row", alignItems: "stretch", backgroundColor: "rgba(5,5,6,0.78)" },
  selectionAccent: { width: 3, backgroundColor: color.cyan },
  selectionCopy: { minWidth: 0, flex: 1, justifyContent: "center", paddingHorizontal: 12, paddingVertical: 8 },
  selectionTitle: { color: color.text, fontSize: 11, fontWeight: "900" },
  selectionAuthor: { color: color.textMuted, fontSize: 9, fontWeight: "700", marginTop: 3 },
});
