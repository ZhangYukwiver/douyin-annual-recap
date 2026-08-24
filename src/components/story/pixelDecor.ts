/**
 * 像素装饰：把「每条记录 = 一颗像素」的隐喻铺到整条故事线。
 * 网格与噪声口径跟 PixelSwap.tsx 一致，只是尺度从 56px 转场降到 12px 装饰。
 * ponytail: 纯 DOM + WAAPI，零新依赖，也刻意不 import react-native——
 * 这样纯逻辑能直接进 vitest（RN 入口是 Flow 语法，测试环境解析不了）。
 */

export const PIXEL_GRID = 12;
// PixelSwap 的 MAX_PIXELS 是 220；装饰层只拿它的一半，转场永远比装饰重要。
export const PIXEL_MAX_LIVE = 110;
export const DECODE_STEP_MS = 35;

const DECODE_EXTRA_POOL = "CHAPTER0123456789#/=+<>";
// 这些字符撑着行的结构，乱码期间原样保留，否则整行宽度会跳。
const DECODE_KEEP = new Set([" ", "·", "\n"]);

export function pixelReducedMotion(): boolean {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function snapToGrid(value: number): number {
  return Math.floor(value / PIXEL_GRID) * PIXEL_GRID;
}

export function decodePool(text: string): readonly string[] {
  const own = Array.from(text).filter((glyph) => !DECODE_KEEP.has(glyph));
  return [...new Set([...own, ...Array.from(DECODE_EXTRA_POOL)])];
}

/** 解码的第 `revealed` 帧：前 revealed 个字已落定，其余抽乱码。 */
export function decodeFrame(
  glyphs: readonly string[],
  revealed: number,
  pool: readonly string[],
  random: () => number,
): string {
  let out = "";
  for (let index = 0; index < glyphs.length; index += 1) {
    const glyph = glyphs[index]!;
    if (index < revealed || DECODE_KEEP.has(glyph) || !pool.length) {
      out += glyph;
      continue;
    }
    out += pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]!;
  }
  return out;
}

/** 迸溅位移：沿圆周均分再抖动，调用方只管把结果喂给 spawn。 */
export function burstOffsets(
  count: number,
  radius: number,
  random: () => number,
): readonly { x: number; y: number; dx: number; dy: number }[] {
  const offsets: { x: number; y: number; dx: number; dy: number }[] = [];
  for (let index = 0; index < count; index += 1) {
    const angle = (index / Math.max(1, count)) * Math.PI * 2 + random() * 0.5;
    const travel = radius * (0.6 + random() * 0.8);
    offsets.push({
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      dx: Math.cos(angle) * travel,
      dy: Math.sin(angle) * travel,
    });
  }
  return offsets;
}

export interface PixelSpawnOptions {
  size?: number;
  dx?: number;
  dy?: number;
  ms?: number;
  easing?: string;
}

export interface PixelLayer {
  element: HTMLElement;
  spawn: (x: number, y: number, color: string, options?: PixelSpawnOptions) => void;
  liveCount: () => number;
  destroy: () => void;
}

export function createPixelLayer(host: HTMLElement | null, zIndex = 25): PixelLayer | null {
  if (!host || typeof document === "undefined") return null;
  const element = host.ownerDocument.createElement("div");
  element.setAttribute("aria-hidden", "true");
  element.setAttribute("data-pixel-decor", "layer");
  element.style.cssText = `position:absolute;inset:0;z-index:${zIndex};pointer-events:none;overflow:hidden;`;
  host.appendChild(element);

  let live = 0;
  let disposed = false;
  const running = new Set<Animation>();

  return {
    element,
    liveCount: () => live,
    spawn(x, y, color, options = {}) {
      if (disposed || live >= PIXEL_MAX_LIVE) return;
      const size = options.size ?? PIXEL_GRID;
      const node = element.ownerDocument.createElement("div");
      node.style.cssText = `position:absolute;left:${snapToGrid(x)}px;top:${snapToGrid(y)}px;`
        + `width:${size}px;height:${size}px;background:${color};`;
      if (typeof node.animate !== "function") return;
      element.appendChild(node);
      live += 1;
      const animation = node.animate([
        { opacity: 0.95, transform: "translate(0,0) scale(1)" },
        { opacity: 0, transform: `translate(${options.dx ?? 0}px,${options.dy ?? 0}px) scale(0.5)` },
      ], {
        duration: options.ms ?? 430,
        easing: options.easing ?? "linear",
        fill: "forwards",
      });
      running.add(animation);
      animation.onfinish = () => {
        running.delete(animation);
        node.remove();
        live -= 1;
      };
    },
    destroy() {
      disposed = true;
      running.forEach((animation) => animation.cancel());
      running.clear();
      live = 0;
      element.remove();
    },
  };
}

/** 指针余迹：每个网格格子最多留一颗，颜色跟当前章走。 */
export function attachPixelTrail(
  layer: PixelLayer,
  host: HTMLElement,
  getColor: () => string,
): () => void {
  if (pixelReducedMotion()) return () => undefined;
  let lastCell = "";
  const onMove = (event: MouseEvent) => {
    const box = layer.element.getBoundingClientRect();
    const x = event.clientX - box.left;
    const y = event.clientY - box.top;
    if (x < 0 || y < 0 || x > box.width || y > box.height) return;
    const cell = `${snapToGrid(x)}:${snapToGrid(y)}`;
    if (cell === lastCell) return;
    lastCell = cell;
    layer.spawn(x, y, Math.random() < 0.85 ? getColor() : "rgba(244,246,250,0.85)", {
      ms: 430 + Math.random() * 180,
    });
  };
  host.addEventListener("mousemove", onMove);
  return () => host.removeEventListener("mousemove", onMove);
}

/** 悬停期间沿元素周界持续冒火花。 */
export function attachPixelSparks(
  layer: PixelLayer,
  target: HTMLElement,
  getColor: () => string,
): () => void {
  if (pixelReducedMotion()) return () => undefined;
  let timer: number | null = null;
  const stop = () => {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
  };
  const start = () => {
    stop();
    timer = window.setInterval(() => {
      const layerBox = layer.element.getBoundingClientRect();
      const box = target.getBoundingClientRect();
      const left = box.left - layerBox.left;
      const top = box.top - layerBox.top;
      const side = Math.floor(Math.random() * 4);
      let x = left + Math.random() * box.width;
      let y = top + Math.random() * box.height;
      if (side === 0) y = top;
      if (side === 1) y = top + box.height;
      if (side === 2) x = left;
      if (side === 3) x = left + box.width;
      layer.spawn(x, y, getColor(), {
        size: 7 + Math.floor(Math.random() * 5),
        dx: (Math.random() - 0.5) * 16,
        dy: -8 - Math.random() * 18,
        ms: 680,
      });
    }, 130);
  };
  target.addEventListener("mouseenter", start);
  target.addEventListener("mouseleave", stop);
  return () => {
    stop();
    target.removeEventListener("mouseenter", start);
    target.removeEventListener("mouseleave", stop);
  };
}

/** 点击/选中的迸溅。 */
export function pixelBurst(
  layer: PixelLayer,
  center: { x: number; y: number },
  color: string,
  count = 10,
  radius = 26,
): void {
  if (pixelReducedMotion()) return;
  burstOffsets(count, radius, Math.random).forEach((offset) => {
    layer.spawn(center.x + offset.x, center.y + offset.y, color, {
      size: 6 + Math.floor(Math.random() * 7),
      dx: offset.dx,
      dy: offset.dy,
      ms: 620 + Math.random() * 260,
      easing: "cubic-bezier(0.16,1,0.3,1)",
    });
  });
}
