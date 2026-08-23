import React, { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Platform, StyleSheet, View, type ViewStyle } from "react-native";

export type PixelSwapPattern =
  | "random"
  | "center"
  | "edges"
  | "left-to-right"
  | "right-to-left"
  | "top-to-bottom"
  | "bottom-to-top";

export interface PixelSwapProps {
  firstContent: ReactNode;
  secondContent: ReactNode;
  active: boolean;
  onComplete?: (active: boolean) => void;
  pixelSize?: number;
  pixelColor?: string;
  pixelRadius?: number;
  pixelSpin?: number;
  pixelScale?: number;
  duration?: number;
  pixelDuration?: number;
  pattern?: PixelSwapPattern;
  revealUnderlying?: boolean;
  style?: React.CSSProperties;
}

interface Pixel {
  id: number;
  left: number;
  top: number;
  offset: number;
}

interface Grid {
  pixels: Pixel[];
  size: number;
  gap: number;
  width: number;
  height: number;
}

interface Transition {
  to: boolean;
  grid: Grid;
}

// ponytail: cap DOM clones at 220 pixels; move the transition to a canvas if larger scenes need it.
const MAX_PIXELS = 220;
const DOM_VIEW = "div" as unknown as React.ElementType;

const PATTERNS: Record<PixelSwapPattern, (x: number, y: number) => number | null> = {
  random: () => null,
  center: (x, y) => Math.hypot(x - 0.5, y - 0.5) / Math.SQRT1_2,
  edges: (x, y) => Math.min(x, 1 - x, y, 1 - y) * 2,
  "left-to-right": (x) => x,
  "right-to-left": (x) => 1 - x,
  "top-to-bottom": (_x, y) => y,
  "bottom-to-top": (_x, y) => 1 - y,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function noise(seed: number): number {
  const value = Math.sin(seed * 127.1 + 311.7) * 43_758.5453;
  return value - Math.floor(value);
}

function buildGrid(width: number, height: number, pixelSize: number, pattern: PixelSwapPattern): Grid {
  if (width <= 0 || height <= 0) return { pixels: [], size: Math.max(8, Math.round(pixelSize)), gap: 0, width, height };
  let size = Math.max(8, Math.round(pixelSize));
  let columns = Math.max(1, Math.ceil(width / size));
  let rows = Math.max(1, Math.ceil(height / size));
  if (columns * rows > MAX_PIXELS) {
    size = Math.ceil(size * Math.sqrt((columns * rows) / MAX_PIXELS));
    columns = Math.max(1, Math.ceil(width / size));
    rows = Math.max(1, Math.ceil(height / size));
  }

  const originX = (width - columns * size) / 2;
  const originY = (height - rows * size) / 2;
  const order = PATTERNS[pattern] ?? PATTERNS.random;
  const pixels: Pixel[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const id = row * columns + column;
      const x = columns <= 1 ? 0.5 : column / (columns - 1);
      const y = rows <= 1 ? 0.5 : row / (rows - 1);
      const orderedOffset = order(x, y);
      pixels.push({
        id,
        left: originX + column * size,
        top: originY + row * size,
        offset: orderedOffset === null ? noise(id + 1) : orderedOffset,
      });
    }
  }
  return { pixels, size, gap: 0, width, height };
}

function coverScale(size: number, radius: number): number {
  const corner = clamp(radius, 0, 50) / 100;
  return Math.max(1, Math.SQRT1_2 / (Math.SQRT2 * (0.5 - corner) + corner));
}

/**
 * Small ReactBits Pixel Swap adaptation for the React Native Web story surface.
 * The DOM path keeps each pixel as a window onto the incoming layer; native
 * falls back to an immediate content swap because the story is web-gated.
 */
export function PixelSwap({
  active,
  duration = 1_250,
  firstContent,
  onComplete,
  pattern = "random",
  pixelColor = "#090A0D",
  pixelDuration = 420,
  pixelRadius = 0,
  pixelScale = 0.35,
  pixelSize = 56,
  pixelSpin = 0,
  revealUnderlying = false,
  secondContent,
  style,
}: PixelSwapProps) {
  const [shownActive, setShownActive] = useState(false);
  const [transition, setTransition] = useState<Transition | null>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLElement | null>(null);
  const layerRefs = useRef<(HTMLElement | null)[]>([]);
  const baseRef = useRef<HTMLElement | null>(null);
  const pixelRefs = useRef<(HTMLElement | null)[]>([]);
  const animationsRef = useRef<Animation[]>([]);
  const timerRef = useRef<number | null>(null);
  const grid = useMemo(
    () => buildGrid(box.width, box.height, pixelSize, pattern),
    [box.height, box.width, pattern, pixelSize],
  );
  const gridRef = useRef(grid);
  gridRef.current = grid;
  const incomingIndex = transition?.to ? 1 : 0;

  const stopAnimations = useCallback(() => {
    animationsRef.current.forEach((animation) => animation.cancel());
    animationsRef.current = [];
    pixelRefs.current.forEach((pixel) => pixel?.replaceChildren());
    if (timerRef.current !== null && typeof window !== "undefined") window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return undefined;
    const container = containerRef.current;
    if (!container) return undefined;
    const measure = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (!width || !height) return;
      setBox((current) => current.width === width && current.height === height ? current : { width, height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => stopAnimations, [stopAnimations]);

  useEffect(() => {
    if (Platform.OS !== "web" || transition || active === shownActive || box.width <= 0 || box.height <= 0 || !grid.pixels.length) return;
    setTransition({ to: active, grid });
  }, [active, box.height, box.width, grid, shownActive, transition]);

  useEffect(() => {
    if (Platform.OS !== "web" || !transition) return undefined;
    const frozenGrid = transition.grid;
    const to = transition.to;
    const finish = () => {
      stopAnimations();
      setShownActive(to);
      setTransition(null);
      onComplete?.(to);
    };
    const source = revealUnderlying ? null : layerRefs.current[to ? 1 : 0];
    const reduced = typeof window.matchMedia === "function"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if ((!revealUnderlying && !source) || !frozenGrid.pixels.length || reduced) {
      finish();
      return undefined;
    }

    const total = Math.max(200, duration);
    const pixelMs = clamp(pixelDuration, 60, total);
    const spread = Math.max(0, total - pixelMs);
    const endScale = coverScale(frozenGrid.size, pixelRadius);
    if (revealUnderlying) {
      // The grid itself is the black cover. Once it has mounted, let the real
      // page underneath show through the gaps as each square disappears.
      baseRef.current?.style.setProperty("opacity", "0");
      baseRef.current?.style.setProperty("visibility", "hidden");
    }
    frozenGrid.pixels.forEach((pixel, index) => {
      const pixelElement = pixelRefs.current[index];
      if (!pixelElement) return;
      if (revealUnderlying) {
        pixelElement.replaceChildren();
        const pixelAnimation = pixelElement.animate([
          { opacity: 1, transform: `rotate(${pixelSpin}deg) scale(${Math.max(1, endScale)})` },
          { opacity: 1, transform: "rotate(0deg) scale(0.42)", offset: 0.72 },
          { opacity: 0, transform: "rotate(0deg) scale(0.01)" },
        ], {
          duration: pixelMs,
          delay: pixel.offset * spread,
          easing: "linear",
          fill: "both",
        });
        animationsRef.current.push(pixelAnimation);
        return;
      }
      if (!source) return;
      const content = document.createElement("div");
      content.style.position = "absolute";
      content.style.left = `${-pixel.left}px`;
      content.style.top = `${-pixel.top}px`;
      content.style.width = `${frozenGrid.width}px`;
      content.style.height = `${frozenGrid.height}px`;
      content.style.transformOrigin = `${pixel.left + frozenGrid.size / 2}px ${pixel.top + frozenGrid.size / 2}px`;
      const clone = source.cloneNode(true) as HTMLElement;
      clone.removeAttribute("aria-hidden");
      clone.style.visibility = "visible";
      content.appendChild(clone);
      pixelElement.replaceChildren(content);

      const timing: KeyframeAnimationOptions = {
        duration: pixelMs,
        delay: pixel.offset * spread,
        easing: "linear",
        fill: "both",
      };
      const windowAnimation = pixelElement.animate([
        { opacity: 0, transform: `rotate(${pixelSpin}deg) scale(${clamp(pixelScale, 0.05, 1) * endScale})` },
        { opacity: 1, transform: `rotate(0deg) scale(${endScale})` },
      ], timing);
      const contentAnimation = content.animate([
        { transform: `scale(${1 / (clamp(pixelScale, 0.05, 1) * endScale)}) rotate(${-pixelSpin}deg)` },
        { transform: `scale(${1 / endScale})` },
      ], timing);
      animationsRef.current.push(windowAnimation, contentAnimation);
    });
    timerRef.current = window.setTimeout(finish, total + 24);
    return stopAnimations;
  }, [duration, onComplete, pixelDuration, pixelRadius, pixelScale, pixelSpin, revealUnderlying, stopAnimations, transition]);

  if (Platform.OS !== "web") {
    return <View style={styles.nativeRoot}>{active ? secondContent : firstContent}</View>;
  }

  const renderLayer = (content: ReactNode, index: number) => {
    const visible = index === (shownActive ? 1 : 0);
    return React.createElement(
      DOM_VIEW,
      {
        key: index,
        ref: (node: HTMLElement | null) => {
          layerRefs.current[index] = node;
        },
        style: {
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          zIndex: visible ? 2 : 1,
          visibility: visible && !(transition && index === incomingIndex) ? "visible" : "hidden",
        } as React.CSSProperties,
        "aria-hidden": !visible,
      },
      content,
    );
  };

  return React.createElement(
    DOM_VIEW,
    {
      ref: (node: HTMLElement | null) => {
        containerRef.current = node;
      },
      style: {
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        isolation: "isolate",
        outline: "none",
        pointerEvents: "none",
        ...style,
      } as React.CSSProperties,
      "data-active": active,
      "data-transitioning": Boolean(transition),
      "aria-hidden": !active,
    },
    renderLayer(firstContent, 0),
    renderLayer(secondContent, 1),
    revealUnderlying && active ? React.createElement(
      DOM_VIEW,
      {
        key: "pixel-base",
        ref: (node: HTMLElement | null) => {
          baseRef.current = node;
        },
        style: {
          position: "absolute",
          inset: 0,
          zIndex: 1,
          backgroundColor: pixelColor,
          pointerEvents: "none",
        } as React.CSSProperties,
        "data-pixel-base": "true",
        "aria-hidden": true,
      },
    ) : null,
    transition ? React.createElement(
      DOM_VIEW,
      {
        key: "pixel-grid",
        style: { position: "absolute", inset: 0, zIndex: 3, pointerEvents: "none" } as React.CSSProperties,
        "data-pixel-grid": "true",
        "aria-hidden": true,
      },
      transition.grid.pixels.map((pixel, index) => React.createElement(DOM_VIEW, {
        key: pixel.id,
        ref: (node: HTMLElement | null) => {
          pixelRefs.current[index] = node;
        },
        style: {
          position: "absolute",
          left: pixel.left,
          top: pixel.top,
          width: transition.grid.size,
          height: transition.grid.size,
          overflow: "hidden",
          opacity: revealUnderlying ? 1 : 0,
          backgroundColor: pixelColor,
          borderRadius: `${clamp(pixelRadius, 0, 50)}%`,
          contain: "paint",
          transformOrigin: "center",
        } as React.CSSProperties,
      })),
    ) : null,
  );
}

const styles = StyleSheet.create({
  nativeRoot: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 } as ViewStyle,
});
