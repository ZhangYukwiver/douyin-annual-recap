import React, { useCallback, useEffect, useMemo, useRef, type CSSProperties } from "react";

import type { StoryContentItem } from "./storyModel";

const DEFAULT_SEGMENTS = 35;
const DEFAULT_MAX_VERTICAL_ROTATION = 5;
const DEFAULT_DRAG_SENSITIVITY = 20;

interface DomeGalleryProps {
  accent: string;
  interactive: boolean;
  onOpen: (item: StoryContentItem) => void;
  privacy: boolean;
  records: readonly StoryContentItem[];
  reducedMotion: boolean;
  skewYDeg?: number;
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
  captureTarget: Element;
  lastClientX: number;
  lastClientY: number;
  lastTime: number;
  moved: boolean;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startRotationX: number;
  startRotationY: number;
  velocityX: number;
  velocityY: number;
}

type DomeCssProperties = CSSProperties & Record<`--${string}`, string | number>;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const wrapAngleSigned = (degrees: number) => ((((degrees + 180) % 360) + 360) % 360) - 180;

/** Converts a screen-space drag into the card's local axes after Card Swap's skewY transform. */
export function cardLocalPointerDelta(deltaX: number, deltaY: number, skewYDeg: number) {
  return {
    x: deltaX,
    y: deltaY - deltaX * Math.tan(skewYDeg * Math.PI / 180),
  };
}

export function buildDomeSlots<T>(pool: readonly T[], segments = DEFAULT_SEGMENTS): DomeSlot<T>[] {
  if (!pool.length) return [];
  const columns = Array.from({ length: segments }, (_, index) => -(segments + 2) + index * 2);
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

const DOME_CSS = `
.story-dome-root {
  position: relative;
  width: 100%;
  height: 100%;
  isolation: isolate;
  --radius: 600px;
  --circ: calc(var(--radius) * 3.14);
  --rot-y: calc((360deg / var(--segments-x)) / 2);
  --rot-x: calc((360deg / var(--segments-y)) / 2);
  --item-width: calc(var(--circ) / var(--segments-x));
  --item-height: calc(var(--circ) / var(--segments-y));
}
.story-dome-root * { box-sizing: border-box; }
.story-dome-sphere,
.story-dome-item,
.story-dome-media { transform-style: preserve-3d; }
.story-dome-main {
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
.story-dome-root[data-interactive="false"] .story-dome-main { cursor: default; }
.story-dome-root[data-dragging="true"] .story-dome-main { cursor: grabbing; }
.story-dome-stage {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  perspective: calc(var(--radius) * 2);
  perspective-origin: 50% 50%;
  contain: layout paint size;
}
.story-dome-sphere {
  transform: translateZ(calc(var(--radius) * -1));
  will-change: transform;
}
.story-dome-item {
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
.story-dome-media {
  position: absolute;
  inset: 10px;
  display: block;
  overflow: hidden;
  padding: 0;
  border: 1px solid rgba(255,255,255,.13);
  border-radius: var(--tile-radius);
  background: linear-gradient(145deg, color-mix(in srgb, var(--dome-accent) 34%, #151820), #151820 72%);
  color: rgba(244,246,250,.72);
  cursor: pointer;
  backface-visibility: hidden;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  transform: translateZ(0);
  transition: border-color 180ms ease, filter 180ms ease, transform 180ms ease;
}
.story-dome-root[data-interactive="false"] .story-dome-media { pointer-events: none; }
.story-dome-media:hover { border-color: rgba(255,255,255,.48); filter: brightness(1.08); }
.story-dome-media:active { transform: translateZ(0) scale(.98); }
.story-dome-media:focus-visible { outline: 3px solid var(--dome-accent); outline-offset: 3px; }
.story-dome-media img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
  backface-visibility: hidden;
  filter: grayscale(1);
}
.story-dome-fallback {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: 15px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.story-dome-overlay,
.story-dome-overlay-blur {
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
}
.story-dome-overlay {
  background: radial-gradient(circle, rgba(21,24,32,0) 64%, var(--dome-edge) 100%);
}
.story-dome-overlay-blur {
  -webkit-mask-image: radial-gradient(circle, transparent 68%, #000 91%);
  mask-image: radial-gradient(circle, transparent 68%, #000 91%);
  backdrop-filter: blur(3px);
}
.story-dome-edge {
  position: absolute;
  left: 0;
  right: 0;
  height: min(120px, 22%);
  z-index: 4;
  pointer-events: none;
  background: linear-gradient(to bottom, transparent, var(--dome-edge));
}
.story-dome-edge-top { top: 0; transform: rotate(180deg); }
.story-dome-edge-bottom { bottom: 0; }
.story-dome-empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: rgba(244,246,250,.56);
  font-size: 14px;
}
@media (prefers-reduced-motion: reduce) {
  .story-dome-media { transition: none; }
}
`;

export function DomeGallery({
  accent,
  interactive,
  onOpen,
  privacy,
  records,
  reducedMotion,
  skewYDeg = 0,
}: DomeGalleryProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const sphereRef = useRef<HTMLDivElement | null>(null);
  const rotationRef = useRef({ x: 0, y: 0 });
  const dragRef = useRef<DragState | null>(null);
  const inertiaFrameRef = useRef<number | null>(null);
  const lastDragEndedAtRef = useRef(0);
  const sourceRecords = useMemo(() => records.slice(0, 18), [records]);
  const slots = useMemo(() => buildDomeSlots(sourceRecords), [sourceRecords]);

  const applyTransform = useCallback((x: number, y: number) => {
    if (!sphereRef.current) return;
    sphereRef.current.style.transform = `translateZ(calc(var(--radius) * -1)) rotateX(${x}deg) rotateY(${y}deg)`;
  }, []);

  const stopInertia = useCallback(() => {
    if (inertiaFrameRef.current === null) return;
    cancelAnimationFrame(inertiaFrameRef.current);
    inertiaFrameRef.current = null;
  }, []);

  const startInertia = useCallback((velocityX: number, velocityY: number) => {
    if (reducedMotion || !interactive) return;
    let nextVelocityX = clamp(velocityX, -1.4, 1.4) * 80;
    let nextVelocityY = clamp(velocityY, -1.4, 1.4) * 80;
    let frames = 0;
    const step = () => {
      nextVelocityX *= 0.988;
      nextVelocityY *= 0.988;
      if (++frames > 260 || (Math.abs(nextVelocityX) < 0.03 && Math.abs(nextVelocityY) < 0.03)) {
        inertiaFrameRef.current = null;
        return;
      }
      const x = clamp(
        rotationRef.current.x - nextVelocityY / 200,
        -DEFAULT_MAX_VERTICAL_ROTATION,
        DEFAULT_MAX_VERTICAL_ROTATION,
      );
      const y = wrapAngleSigned(rotationRef.current.y + nextVelocityX / 200);
      rotationRef.current = { x, y };
      applyTransform(x, y);
      inertiaFrameRef.current = requestAnimationFrame(step);
    };
    stopInertia();
    inertiaFrameRef.current = requestAnimationFrame(step);
  }, [applyTransform, interactive, reducedMotion, stopInertia]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const resize = () => {
      const { width, height } = root.getBoundingClientRect();
      const safeWidth = Math.max(1, width);
      const safeHeight = Math.max(1, height);
      const basis = safeWidth / safeHeight >= 1.3 ? safeWidth : Math.min(safeWidth, safeHeight);
      const radius = clamp(Math.min(basis * 0.5, safeHeight * 1.35), 600, 900);
      root.style.setProperty("--radius", `${Math.round(radius)}px`);
      applyTransform(rotationRef.current.x, rotationRef.current.y);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(root);
    resize();
    return () => observer.disconnect();
  }, [applyTransform]);

  useEffect(() => {
    if (interactive) return undefined;
    dragRef.current = null;
    rootRef.current?.removeAttribute("data-dragging");
    stopInertia();
    return undefined;
  }, [interactive, stopInertia]);

  useEffect(() => stopInertia, [stopInertia]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive || reducedMotion || event.button !== 0) return;
    stopInertia();
    const captureTarget = event.target as Element;
    captureTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      captureTarget,
      lastClientX: event.clientX,
      lastClientY: event.clientY,
      lastTime: event.timeStamp,
      moved: false,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startRotationX: rotationRef.current.x,
      startRotationY: rotationRef.current.y,
      velocityX: 0,
      velocityY: 0,
    };
    rootRef.current?.setAttribute("data-dragging", "true");
  }, [interactive, reducedMotion, stopInertia]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const total = cardLocalPointerDelta(
      event.clientX - drag.startClientX,
      event.clientY - drag.startClientY,
      skewYDeg,
    );
    const step = cardLocalPointerDelta(
      event.clientX - drag.lastClientX,
      event.clientY - drag.lastClientY,
      skewYDeg,
    );
    const elapsed = Math.max(8, event.timeStamp - drag.lastTime);
    drag.velocityX = step.x / elapsed;
    drag.velocityY = step.y / elapsed;
    drag.lastClientX = event.clientX;
    drag.lastClientY = event.clientY;
    drag.lastTime = event.timeStamp;
    if (!drag.moved && total.x * total.x + total.y * total.y > 16) drag.moved = true;

    const x = clamp(
      drag.startRotationX - total.y / DEFAULT_DRAG_SENSITIVITY,
      -DEFAULT_MAX_VERTICAL_ROTATION,
      DEFAULT_MAX_VERTICAL_ROTATION,
    );
    const y = wrapAngleSigned(drag.startRotationY + total.x / DEFAULT_DRAG_SENSITIVITY);
    rotationRef.current = { x, y };
    applyTransform(x, y);
  }, [applyTransform, skewYDeg]);

  const finishDrag = useCallback((event: React.PointerEvent<HTMLDivElement>, cancelled = false) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag.captureTarget.releasePointerCapture?.(event.pointerId);
    dragRef.current = null;
    rootRef.current?.removeAttribute("data-dragging");
    if (drag.moved) {
      lastDragEndedAtRef.current = performance.now();
      if (!cancelled) startInertia(drag.velocityX, drag.velocityY);
    }
  }, [startInertia]);

  const rootStyle: DomeCssProperties = {
    "--dome-accent": accent,
    "--dome-edge": "#151820",
    "--segments-x": DEFAULT_SEGMENTS,
    "--segments-y": DEFAULT_SEGMENTS,
    "--tile-radius": "30px",
  };

  return (
    <div
      ref={rootRef}
      aria-label="球面视频封面画廊"
      className="story-dome-root"
      data-interactive={interactive ? "true" : "false"}
      data-story-dome-gallery="true"
      role="region"
      style={rootStyle}
    >
      <style>{DOME_CSS}</style>
      {slots.length ? (
        <div
          className="story-dome-main"
          onPointerCancel={(event) => finishDrag(event, true)}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishDrag}
        >
          <div className="story-dome-stage">
            <div ref={sphereRef} className="story-dome-sphere">
              {slots.map((slot, index) => {
                const title = privacy ? "内容封面已隐藏" : slot.item.record.title;
                const itemStyle: DomeCssProperties = {
                  "--item-size-x": slot.sizeX,
                  "--item-size-y": slot.sizeY,
                  "--offset-x": slot.x,
                  "--offset-y": slot.y,
                };
                return (
                  <div className="story-dome-item" key={`${slot.x}:${slot.y}:${index}`} style={itemStyle}>
                    <button
                      aria-label={`${title}，打开详情`}
                      className="story-dome-media"
                      data-dome-pool-index={slot.poolIndex}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (performance.now() - lastDragEndedAtRef.current < 100) return;
                        onOpen(slot.item);
                      }}
                      tabIndex={interactive ? 0 : -1}
                      title={title}
                      type="button"
                    >
                      <span aria-hidden className="story-dome-fallback">
                        {String(slot.poolIndex + 1).padStart(2, "0")}
                      </span>
                      {slot.item.record.coverUrl && !privacy ? (
                        <img
                          alt=""
                          decoding="async"
                          draggable={false}
                          loading={index < 12 ? "eager" : "lazy"}
                          onError={(event) => {
                            event.currentTarget.style.display = "none";
                          }}
                          src={slot.item.record.coverUrl}
                        />
                      ) : null}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="story-dome-overlay" />
          <div className="story-dome-overlay-blur" />
          <div className="story-dome-edge story-dome-edge-top" />
          <div className="story-dome-edge story-dome-edge-bottom" />
        </div>
      ) : (
        <p className="story-dome-empty">当前列表没有可展示的封面</p>
      )}
    </div>
  );
}
