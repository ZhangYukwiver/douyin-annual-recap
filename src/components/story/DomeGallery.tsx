import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import type { StoryContentItem } from "./storyModel";

// ReactBits Dome Gallery, adapted only for local story records, selection and horizontal-only dragging.
// Source: https://github.com/DavidHDev/react-bits/tree/main/src/ts-default/Components/DomeGallery
const DEFAULT_SEGMENTS = 34;
const CURVE_SCALE = 1.3;
const DISPLAY_SEGMENTS = DEFAULT_SEGMENTS * CURVE_SCALE;
const ITEMS_PER_COLUMN = 5;
const CENTER_COLUMN = 18;
const RECYCLE_COLUMNS = 2;
const COLUMN_ANGLE = 360 / DISPLAY_SEGMENTS;
const RECYCLE_ANGLE = COLUMN_ANGLE * RECYCLE_COLUMNS;

export interface DomeGalleryEntry {
  accent: string;
  id: string;
  item: StoryContentItem;
  sourceKey: string;
  sourceLabel: string;
}

interface DomeGalleryProps {
  accent: string;
  dragDampening?: number;
  dragSensitivity?: number;
  entries: readonly DomeGalleryEntry[];
  fit?: number;
  fitBasis?: "auto" | "min" | "max" | "width" | "height";
  grayscale?: boolean;
  imageBorderRadius?: string;
  interactive: boolean;
  maxRadius?: number;
  minRadius?: number;
  onSelect: (entry: DomeGalleryEntry) => void;
  overlayBlurColor?: string;
  privacy: boolean;
  reducedMotion: boolean;
  selectedEntryId: string | null;
}

interface DomeSlot<T> {
  item: T;
  poolIndex: number;
  sizeX: number;
  sizeY: number;
  x: number;
  y: number;
}

interface DragState {
  captured: boolean;
  captureTarget: Element;
  lastClientX: number;
  lastTime: number;
  moved: boolean;
  pointerId: number;
  startClientX: number;
  velocityX: number;
}

type DomeCssProperties = CSSProperties & Record<`--${string}`, string | number>;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const modulo = (value: number, divisor: number) => ((value % divisor) + divisor) % divisor;

/** ReactBits' alternating five-row horizontal belt. */
export function buildDomeSlots<T>(pool: readonly T[], segments = DEFAULT_SEGMENTS): DomeSlot<T>[] {
  if (!pool.length) return [];
  const columns = Array.from({ length: segments }, (_, index) => -37 + index * 2);
  const evenRows = [-4, -2, 0, 2, 4];
  const oddRows = [-3, -1, 1, 3, 5];
  const coordinates = columns.flatMap((x, column) => (
    (column % 2 === 0 ? evenRows : oddRows).map((y) => ({ x, y }))
  ));

  return coordinates.map(({ x, y }, index) => ({
    item: pool[index % pool.length]!,
    poolIndex: index % pool.length,
    sizeX: 2,
    sizeY: 2,
    x,
    y,
  }));
}

export function buildDomeWindow(count: number, centerColumn: number) {
  if (count <= 0) return [];
  const totalColumns = Math.ceil(count / ITEMS_PER_COLUMN);
  return Array.from({ length: DEFAULT_SEGMENTS * ITEMS_PER_COLUMN }, (_, slotIndex) => {
    const physicalColumn = Math.floor(slotIndex / ITEMS_PER_COLUMN);
    const row = slotIndex % ITEMS_PER_COLUMN;
    const unwrappedColumn = centerColumn + physicalColumn - CENTER_COLUMN;
    const logicalColumn = modulo(unwrappedColumn, totalColumns);
    return {
      entryIndex: (logicalColumn * ITEMS_PER_COLUMN + row) % count,
      slotKey: `${unwrappedColumn}:${row}`,
    };
  });
}

const DOME_CSS = `
.story-dome-root {
  position: relative;
  width: 100%;
  height: 100%;
  isolation: isolate;
  --radius: ${520 * CURVE_SCALE}px;
  --circ: calc(var(--radius) * 3.14);
  --rot-y: calc((360deg / var(--segments-x)) / 2);
  --rot-x: calc((360deg / var(--segments-y)) / 2);
  --item-width: calc(var(--circ) / var(--segments-x));
  --item-height: calc(var(--circ) / var(--segments-y));
}
.story-dome-root * { box-sizing: border-box; }
.story-dome-root .sphere,
.story-dome-root .item,
.story-dome-root .item__image { transform-style: preserve-3d; }
main.story-dome-main {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  cursor: grab;
  background: transparent;
}
.story-dome-root[data-interactive="false"] main.story-dome-main { cursor: default; }
.story-dome-root[data-dragging="true"] main.story-dome-main { cursor: grabbing; }
.story-dome-root .stage {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  perspective: calc(var(--radius) * 2);
  perspective-origin: 50% 50%;
  contain: layout paint size;
}
.story-dome-root .sphere {
  transform: translateZ(calc(var(--radius) * -1));
  will-change: transform;
}
.story-dome-root .item {
  position: absolute;
  inset: -999px;
  width: calc(var(--item-width) * var(--item-size-x));
  height: calc(var(--item-height) * var(--item-size-y));
  margin: auto;
  transform-origin: 50% 50%;
  backface-visibility: hidden;
  transform:
    rotateY(calc(var(--rot-y) * (var(--offset-x) + ((var(--item-size-x) - 1) / 2))))
    rotateX(calc(var(--rot-x) * (var(--offset-y) - ((var(--item-size-y) - 1) / 2))))
    translateZ(var(--radius));
}
.story-dome-root .item__image {
  --entry-accent: var(--dome-accent);
  position: absolute;
  display: block;
  inset: 10px;
  overflow: hidden;
  padding: 0;
  border: 0;
  border-radius: var(--tile-radius, 30px);
  background: color-mix(in srgb, var(--entry-accent) 20%, #120f17);
  color: rgba(244,246,250,.7);
  backface-visibility: hidden;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  pointer-events: auto;
  transform: translateZ(0);
}
.story-dome-root[data-interactive="false"] .item__image { pointer-events: none; }
.story-dome-root .item__image:focus { outline: none; }
.story-dome-root .item__image:focus-visible { outline: 3px solid var(--entry-accent); outline-offset: 3px; }
.story-dome-root .item__image[data-selected="true"] { box-shadow: inset 0 0 0 3px var(--entry-accent); }
.story-dome-root .item__image img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
  backface-visibility: hidden;
  filter: var(--image-filter, none);
}
.story-dome-root .story-dome-fallback {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: 15px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.story-dome-root .overlay {
  position: absolute;
  inset: 0;
  margin: auto;
  z-index: 3;
  pointer-events: none;
  background-image: radial-gradient(rgba(235,235,235,0) 65%, var(--overlay-blur-color, #120f17) 100%);
}
.story-dome-root .edge-fade {
  position: absolute;
  left: 0;
  right: 0;
  height: 120px;
  z-index: 5;
  pointer-events: none;
  background: linear-gradient(to bottom, transparent, var(--overlay-blur-color, #120f17));
}
.story-dome-root .edge-fade--top { top: 0; transform: rotate(180deg); }
.story-dome-root .edge-fade--bottom { bottom: 0; }
.story-dome-root .story-dome-empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  margin: 0;
  color: rgba(244,246,250,.56);
  font-size: 14px;
}
`;

export function DomeGallery({
  accent,
  dragDampening = 0.15,
  dragSensitivity = 47,
  entries,
  fit = 0.8,
  fitBasis = "auto",
  grayscale = false,
  imageBorderRadius = "30px",
  interactive,
  maxRadius = Infinity,
  minRadius = 600,
  onSelect,
  overlayBlurColor = "#120F17",
  privacy,
  reducedMotion,
  selectedEntryId,
}: DomeGalleryProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const sphereRef = useRef<HTMLDivElement | null>(null);
  const rotationRef = useRef(0);
  const dragRef = useRef<DragState | null>(null);
  const inertiaFrameRef = useRef<number | null>(null);
  const lastDragEndedAtRef = useRef(0);
  const [windowColumn, setWindowColumn] = useState(0);
  const windowColumnRef = useRef(0);
  const slots = useMemo(() => buildDomeSlots(
    buildDomeWindow(entries.length, windowColumn).map(({ entryIndex, slotKey }) => ({
      entry: entries[entryIndex]!,
      entryIndex,
      slotKey,
    })),
  ), [entries, windowColumn]);

  const applyTransform = useCallback((y: number) => {
    if (!sphereRef.current) return;
    sphereRef.current.style.transform = `translateZ(calc(var(--radius) * -1)) rotateY(${y}deg)`;
  }, []);

  useLayoutEffect(() => {
    applyTransform(rotationRef.current);
  }, [applyTransform, windowColumn]);

  const stopInertia = useCallback(() => {
    if (inertiaFrameRef.current === null) return;
    cancelAnimationFrame(inertiaFrameRef.current);
    inertiaFrameRef.current = null;
  }, []);

  const rotateBy = useCallback((degrees: number) => {
    const rawRotation = rotationRef.current + degrees;
    // The stagger repeats every two columns, so recycling one column would jump vertically.
    const columnShift = Math.round(rawRotation / RECYCLE_ANGLE) * RECYCLE_COLUMNS;
    const rotation = rawRotation - columnShift * COLUMN_ANGLE;
    rotationRef.current = rotation;
    if (columnShift) {
      const nextColumn = windowColumnRef.current - columnShift;
      windowColumnRef.current = nextColumn;
      setWindowColumn(nextColumn);
      return;
    }
    applyTransform(rotation);
  }, [applyTransform]);

  const startInertia = useCallback((velocityX: number) => {
    if (reducedMotion || !interactive) return;
    let nextVelocityX = clamp(velocityX, -1.4, 1.4) * 25;
    let frames = 0;
    const dampening = clamp(dragDampening, 0, 1);
    const friction = 0.94 + 0.055 * dampening;
    const stopThreshold = 0.015 - 0.01 * dampening;
    const maxFrames = Math.round(90 + 270 * dampening);

    const step = () => {
      nextVelocityX *= friction;
      if (++frames > maxFrames
        || Math.abs(nextVelocityX) < stopThreshold) {
        inertiaFrameRef.current = null;
        return;
      }
      rotateBy(nextVelocityX / 200);
      inertiaFrameRef.current = requestAnimationFrame(step);
    };

    stopInertia();
    inertiaFrameRef.current = requestAnimationFrame(step);
  }, [dragDampening, interactive, reducedMotion, rotateBy, stopInertia]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const width = Math.max(1, entry.contentRect.width);
      const height = Math.max(1, entry.contentRect.height);
      const minDimension = Math.min(width, height);
      const maxDimension = Math.max(width, height);
      const aspect = width / height;
      const basis = fitBasis === "min"
        ? minDimension
        : fitBasis === "max"
          ? maxDimension
          : fitBasis === "width"
            ? width
            : fitBasis === "height"
              ? height
              : aspect >= 1.3
                ? width
                : minDimension;
      const referenceRadius = clamp(Math.min(basis * fit, height * 1.35), minRadius, maxRadius);
      root.style.setProperty("--radius", `${Math.round(referenceRadius * CURVE_SCALE)}px`);
      applyTransform(rotationRef.current);
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, [applyTransform, fit, fitBasis, maxRadius, minRadius]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (!interactive || reducedMotion || event.button !== 0) return;
    stopInertia();
    dragRef.current = {
      captured: false,
      captureTarget: event.target as Element,
      lastClientX: event.clientX,
      lastTime: event.timeStamp,
      moved: false,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      velocityX: 0,
    };
    rootRef.current?.setAttribute("data-dragging", "true");
  }, [interactive, reducedMotion, stopInertia]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startClientX;
    const stepX = event.clientX - drag.lastClientX;
    const elapsed = Math.max(8, event.timeStamp - drag.lastTime);
    drag.velocityX = stepX / elapsed;
    drag.lastClientX = event.clientX;
    drag.lastTime = event.timeStamp;
    if (!drag.moved && Math.abs(deltaX) > 4) {
      drag.moved = true;
      drag.captureTarget.setPointerCapture?.(event.pointerId);
      drag.captured = true;
    }

    if (stepX) rotateBy(stepX / dragSensitivity);
  }, [dragSensitivity, rotateBy]);

  const finishDrag = useCallback((event: React.PointerEvent<HTMLElement>, cancelled = false) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.captured) drag.captureTarget.releasePointerCapture?.(event.pointerId);
    dragRef.current = null;
    rootRef.current?.removeAttribute("data-dragging");
    if (!drag.moved) return;
    lastDragEndedAtRef.current = performance.now();
    if (!cancelled) startInertia(drag.velocityX);
  }, [startInertia]);

  useEffect(() => {
    if (interactive) return undefined;
    dragRef.current = null;
    rootRef.current?.removeAttribute("data-dragging");
    stopInertia();
    return undefined;
  }, [interactive, stopInertia]);

  useEffect(() => stopInertia, [stopInertia]);

  const rootStyle: DomeCssProperties = {
    "--dome-accent": accent,
    "--image-filter": grayscale ? "grayscale(1)" : "none",
    "--overlay-blur-color": overlayBlurColor,
    "--segments-x": DISPLAY_SEGMENTS,
    "--segments-y": DISPLAY_SEGMENTS,
    "--tile-radius": imageBorderRadius,
  };
  const selectedSlotIndex = slots.findIndex(({ item }) => item.entry.id === selectedEntryId);

  return (
    <div
      ref={rootRef}
      aria-label="全部视频封面横向画廊"
      className="story-dome-root"
      data-interactive={interactive ? "true" : "false"}
      data-story-dome-gallery="true"
      role="region"
      style={rootStyle}
    >
      <style>{DOME_CSS}</style>
      {slots.length ? (
        <main
          className="story-dome-main"
          onPointerCancel={(event) => finishDrag(event, true)}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishDrag}
        >
          <div className="stage">
            <div ref={sphereRef} className="sphere">
              {slots.map((slot, index) => {
                const title = privacy ? "内容封面已隐藏" : slot.item.entry.item.record.title;
                const selected = slot.item.entry.id === selectedEntryId
                  && index === selectedSlotIndex;
                const preload = Math.abs(slot.x + 0.5) <= 18 && Math.abs(slot.y - 0.5) <= 12;
                const itemStyle: DomeCssProperties = {
                  "--item-size-x": slot.sizeX,
                  "--item-size-y": slot.sizeY,
                  "--offset-x": slot.x,
                  "--offset-y": slot.y,
                };
                const imageStyle: DomeCssProperties = { "--entry-accent": slot.item.entry.accent };
                return (
                  <div className="item" key={slot.item.slotKey} style={itemStyle}>
                    <button
                      aria-label={`${selected ? "已选中" : "选择"}${slot.item.entry.sourceLabel}中的${title}${selected ? "，再次点击打开详情" : ""}`}
                      aria-pressed={selected}
                      className="item__image story-dome-media"
                      data-dome-entry-index={slot.item.entryIndex}
                      data-dome-source-key={slot.item.entry.sourceKey}
                      data-selected={selected ? "true" : "false"}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (!interactive || performance.now() - lastDragEndedAtRef.current < 80) return;
                        onSelect(slot.item.entry);
                      }}
                      style={imageStyle}
                      tabIndex={interactive ? 0 : -1}
                      title={title}
                      type="button"
                    >
                      <span aria-hidden className="story-dome-fallback">
                        {String(slot.item.entryIndex + 1).padStart(2, "0")}
                      </span>
                      {slot.item.entry.item.record.coverUrl && !privacy ? (
                        <img
                          alt=""
                          decoding="async"
                          draggable={false}
                          loading={preload ? "eager" : "lazy"}
                          onError={(event) => {
                            event.currentTarget.style.display = "none";
                          }}
                          src={slot.item.entry.item.record.coverUrl}
                        />
                      ) : null}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="overlay" />
          <div className="edge-fade edge-fade--top" />
          <div className="edge-fade edge-fade--bottom" />
        </main>
      ) : (
        <p className="story-dome-empty">当前列表没有可展示的封面</p>
      )}
    </div>
  );
}
