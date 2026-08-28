import React, { useEffect, useRef, useState } from "react";

// ponytail: web-only DOM overlay(原生 CSS preserve-3d 翻页, RNW 样式做不了); 非 web 平台由调用方跳过
// 软纸翻页: 每页切 SEGS 条嵌套铰接竖片, rAF 逐帧驱动; 铰链角全落贴脊第一条 => 终态平贴
// 尾声: 翻完露出末页上的印章线稿 -> 线稿渐变成真实金印 -> 黑场以印章为心虹膜收拢,
//       onDone 把印章屏幕矩形交给 SealIntro 从原位起飞落成第一页(旧燃烧转场已移除)
const SEGS = 12;
const LEAVES = [
  { delay: 500, dur: 1450, end: 176.8, z: 1.35 },
  { delay: 820, dur: 1450, end: 175.4, z: 1.1 },
  { delay: 1140, dur: 1450, end: 174, z: 0.85 },
  { delay: 1460, dur: 1450, end: 172.6, z: 0.6 },
  { delay: 1780, dur: 1450, end: 171.2, z: 0.35 },
];
const MORPH_START = 3350;
const MORPH_DUR = 900;
const IRIS_START = 4450;
const IRIS_DUR = 700;
const TOTAL_MS = 5250;

export interface SealStart { cx: number; cy: number; d: number }

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

// 纸页遮罩: 只覆盖封面，不改变底下封面的透明度；片间步进不足 1 个色阶
function segPaperTone(k: number): string {
  const mix = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
  const t = (k + 0.5) / SEGS;
  return [
    "linear-gradient(180deg, rgba(96,78,48,.03), rgba(96,78,48,0) 4%, rgba(96,78,48,0) 96%, rgba(96,78,48,.04))",
    "repeating-linear-gradient(0deg, rgba(118,98,64,.026) 0 1px, rgba(255,255,255,0) 1px 3.6px)",
    "radial-gradient(150% 90% at 50% 10%, rgba(255,250,236,.05), rgba(255,250,236,0) 60%)",
    `linear-gradient(0deg, rgba(${mix(233, 242, t)}, ${mix(226, 235, t)}, ${mix(208, 221, t)}, .76), rgba(${mix(233, 242, t)}, ${mix(226, 235, t)}, ${mix(208, 221, t)}, .76))`,
  ].join(", ");
}

function pageVeilOpacity(k: number): number {
  // 从贴脊侧到页尖侧逐渐变透明，封面层始终保持不透明。
  return Number((0.8 - ((k + 0.5) / SEGS) * 0.46).toFixed(3));
}

// ponytail: 用确定性多边形近似撕纸边，避免给 preserve-3d 父层加 mask 导致翻页被压平；
// 若以后需要逐像素艺术化边缘，再换成一张带 alpha 的统一遮罩素材。
function segmentEdgeClip(k: number): string {
  const jitter = (n: number, amount: number) => Math.sin((k + 1) * (n + 1) * 1.73) * amount;
  const top = [0, 24, 52, 78, 100].map((_, i) => 2.1 + jitter(i, 1.15));
  const bottom = [0, 24, 52, 78, 100].map((_, i) => 97.9 + jitter(i + 5, 1.05));
  const left = k === 0 ? 1.7 + jitter(11, 0.75) : 0;
  const right = k === SEGS - 1 ? 98.3 + jitter(12, 0.75) : 100;
  return `polygon(${left.toFixed(2)}% ${top[0]!.toFixed(2)}%, 24% ${top[1]!.toFixed(2)}%, 52% ${top[2]!.toFixed(2)}%, 78% ${top[3]!.toFixed(2)}%, ${right.toFixed(2)}% ${top[4]!.toFixed(2)}%, ${right.toFixed(2)}% ${bottom[4]!.toFixed(2)}%, 78% ${bottom[3]!.toFixed(2)}%, 52% ${bottom[2]!.toFixed(2)}%, 24% ${bottom[1]!.toFixed(2)}%, ${left.toFixed(2)}% ${bottom[0]!.toFixed(2)}%)`;
}

function coverSliceStyle(k: number, uri: string) {
  const position = `${((k / Math.max(1, SEGS - 1)) * 100).toFixed(3)}% 0`;
  const clipPath = segmentEdgeClip(k);
  return {
    backgroundImage: `url(${JSON.stringify(uri)})`,
    backgroundPosition: position,
    backgroundRepeat: "no-repeat",
    backgroundSize: `${SEGS * 100}% 100%`,
    clipPath,
    WebkitClipPath: clipPath,
  };
}

function Segs({ k, coverUri }: { k: number; coverUri?: string }) {
  if (k >= SEGS) return null;
  return (
    <div
      className="gate-seg"
      style={{
        left: k === 0 ? 0 : "calc(100% - 1.5px)",
        width: k === 0 ? `calc(${100 / SEGS}% + 1.5px)` : "100%",
        borderRadius: k === SEGS - 1 ? "0 6px 6px 0" : 0,
      }}
    >
      {coverUri ? <div aria-hidden className="gate-seg-cover" style={coverSliceStyle(k, coverUri)} /> : null}
      <div aria-hidden className="gate-seg-paper" style={{ background: segPaperTone(k), opacity: pageVeilOpacity(k), clipPath: segmentEdgeClip(k), WebkitClipPath: segmentEdgeClip(k) }} />
      <div aria-hidden className="gate-seg-edge" style={{ clipPath: segmentEdgeClip(k), WebkitClipPath: segmentEdgeClip(k) }} />
      <Segs k={k + 1} coverUri={coverUri} />
    </div>
  );
}

// 内封魔法刻印: 确定性几何(无随机), 径向构图翻转后朝向不变
const SIGIL_STARS = Array.from({ length: 20 }, (_, i) => ({
  x: 12 + ((i * 53.7 + 23) % 276),
  y: 14 + ((i * 97.3 + 31) % 396),
  r: i % 6 === 0 ? 1.5 : i % 3 === 0 ? 1.05 : 0.75,
  o: 0.14 + ((i * 29) % 26) / 100,
  gold: i % 4 === 0,
}));
const SIGIL_TICKS = Array.from({ length: 24 }, (_, i) => (i * Math.PI) / 12);
const SIGIL_DIAMONDS = [0, 90, 180, 270];

function Sigil() {
  const cx = 150, cy = 196;
  return (
    <svg aria-hidden className="gate-sigil" preserveAspectRatio="xMidYMid meet" viewBox="0 0 300 424">
      {SIGIL_STARS.map((s, i) => (
        <circle cx={s.x} cy={s.y} fill={s.gold ? "#B08F52" : "#8A7452"} key={i} opacity={s.o} r={s.r} />
      ))}
      <polyline fill="none" points="36,336 68,318 104,324 132,306" stroke="#8A6F3E" strokeOpacity=".22" strokeWidth=".7" />
      <polyline fill="none" points="198,80 228,88 252,72" stroke="#8A6F3E" strokeOpacity=".2" strokeWidth=".7" />
      {[[36, 336], [68, 318], [104, 324], [132, 306], [198, 80], [228, 88], [252, 72]].map(([x, y]) => (
        <circle cx={x} cy={y} fill="#A8854A" key={`${x}-${y}`} opacity=".4" r="1.3" />
      ))}
      <circle cx={cx} cy={cy} fill="none" r={98} stroke="#8A6F3E" strokeOpacity=".5" strokeWidth="1" />
      <circle cx={cx} cy={cy} fill="none" r={89} stroke="#8A6F3E" strokeDasharray="1.6 5.2" strokeOpacity=".4" strokeWidth=".9" />
      <circle cx={cx} cy={cy} fill="none" r={72} stroke="#8A6F3E" strokeOpacity=".46" strokeWidth="1" />
      {SIGIL_TICKS.map((a, i) => (
        <line key={i} stroke="#8A6F3E" strokeOpacity={i % 2 === 0 ? 0.42 : 0.26} strokeWidth=".8"
          x1={cx + Math.cos(a) * 66} y1={cy + Math.sin(a) * 66} x2={cx + Math.cos(a) * 72} y2={cy + Math.sin(a) * 72} />
      ))}
      <circle cx={cx} cy={cy} fill="none" r={46} stroke="#8A6F3E" strokeOpacity=".4" strokeWidth=".9" />
      <path d={`M ${cx} ${cy - 40} L ${cx + 40} ${cy} L ${cx} ${cy + 40} L ${cx - 40} ${cy} Z`} fill="none" stroke="#A8854A" strokeOpacity=".45" strokeWidth="1" />
      <path d={`M ${cx} ${cy - 28} L ${cx + 28} ${cy} L ${cx} ${cy + 28} L ${cx - 28} ${cy} Z`} fill="none" stroke="#A8854A" strokeOpacity=".3" strokeWidth=".8" transform={`rotate(45 ${cx} ${cy})`} />
      {SIGIL_DIAMONDS.map((deg) => (
        <path d={`M ${cx} ${cy - 104} l 4.5 7 l -4.5 7 l -4.5 -7 Z`} fill="none" key={deg} stroke="#A8854A" strokeOpacity=".38" strokeWidth=".8" transform={`rotate(${deg} ${cx} ${cy})`} />
      ))}
      <path d={`M ${cx + 14} ${cy - 62} a 15 15 0 1 0 6 26 a 12.5 12.5 0 1 1 -6 -26 Z`} fill="#8A6F3E" opacity=".2" />
      <circle cx={cx} cy={cy} fill="#8A6F3E" opacity=".5" r={2.2} />
      <circle cx={cx} cy={cy} fill="none" opacity=".3" r={7} stroke="#8A6F3E" strokeWidth=".7" />
    </svg>
  );
}

// 末页印章线稿: 与真印同构图(双圈边/点划环/内圈/弧形字/望远镜/三脚架/星点), 细墨线画在纸上
function SealSketch() {
  return (
    <svg fill="none" preserveAspectRatio="xMidYMid meet" viewBox="0 0 137 137">
      <g opacity=".82" stroke="#54462F" strokeWidth="1.1">
        <circle cx="68.5" cy="68.5" r="66" />
        <circle cx="68.5" cy="68.5" opacity=".7" r="63.2" strokeWidth=".8" />
        <circle cx="68.5" cy="68.5" r="57.5" strokeDasharray="1 3.4" strokeWidth=".8" />
        <circle cx="68.5" cy="68.5" r="44.5" />
        <g transform="translate(68.5 72) scale(1.16) translate(-68.5 -72)">
          <g transform="rotate(-33 68.5 64)">
            <path d="M 44 60.4 L 88 57.6 L 88 66.4 L 44 63.6 Z" />
            <path d="M 88 56.4 L 97 55.8 L 97 68.2 L 88 67.6 Z" strokeWidth=".9" />
            <path d="M 40 60.9 L 44 60.4 L 44 63.6 L 40 63.1 Z" strokeWidth=".9" />
            <line opacity=".7" strokeWidth=".7" x1="58" x2="58" y1="59.6" y2="64.4" />
            <line opacity=".7" strokeWidth=".7" x1="73" x2="73" y1="58.6" y2="65.4" />
          </g>
          <circle cx="68.5" cy="72" r="2.4" strokeWidth=".9" />
          <line strokeWidth=".9" x1="68.5" x2="68.5" y1="74.4" y2="79" />
          <line x1="68.5" x2="54" y1="79" y2="103" />
          <line x1="68.5" x2="83" y1="79" y2="103" />
          <line strokeWidth=".8" x1="68.5" x2="68.5" y1="79" y2="105" />
          <line opacity=".7" strokeWidth=".7" x1="59.5" x2="77.5" y1="94" y2="94" />
        </g>
      </g>
      <g fill="#54462F" opacity=".55">
        {[[46, 51], [92, 47], [43, 88], [95, 90], [83, 39]].map(([x, y], i) => (
          <path d={`M ${x} ${y! - (i % 2 ? 2.1 : 2.8)} l ${i % 2 ? 1.5 : 2} ${i % 2 ? 2.1 : 2.8} l ${i % 2 ? -1.5 : -2} ${i % 2 ? 2.1 : 2.8} l ${i % 2 ? -1.5 : -2} ${i % 2 ? -2.1 : -2.8} Z`} key={i} />
        ))}
      </g>
      <defs>
        <path d="M 17.5 68.5 A 51 51 0 0 1 119.5 68.5" id="bgSketchTop" />
        <path d="M 19.5 68.5 A 49 49 0 0 0 117.5 68.5" id="bgSketchBottom" />
      </defs>
      <text fill="#54462F" fontFamily="Georgia, 'Times New Roman', serif" fontSize="11" letterSpacing="4.5" opacity=".85">
        <textPath href="#bgSketchTop" startOffset="23%">OBSERVED</textPath>
      </text>
      <text fill="#54462F" fontFamily="Georgia, 'Times New Roman', serif" fontSize="9" letterSpacing="3.5" opacity=".8">
        <textPath href="#bgSketchBottom" startOffset="39%">· 2026 ·</textPath>
      </text>
    </svg>
  );
}

export interface BookGateProps {
  onDone: (start: SealStart | null) => void;
  covers?: readonly string[];
  privacy?: boolean;
}

export function BookGate({ onDone, covers = [], privacy = false }: BookGateProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const realRef = useRef<HTMLDivElement>(null);
  const blackoutRef = useRef<HTMLDivElement>(null);
  const openingRef = useRef(false);
  const startAtRef = useRef(0);
  const timerRef = useRef(0);
  const flipFrameRef = useRef(0);
  const [opening, setOpening] = useState(false);
  const [readyCovers, setReadyCovers] = useState<string[]>([]);
  const coverUri = (require("./assets/book-cover.png") as { uri: string }).uri;
  const sheetUri = (require("./assets/reference/pages-01-04.png") as { uri: string }).uri;

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const requested = privacy
      ? []
      : [...new Set(covers.filter((uri): uri is string => typeof uri === "string" && uri.trim().length > 0))].slice(0, LEAVES.length);
    let active = true;
    const loaded = new Set<string>();
    const update = () => {
      if (active) setReadyCovers(requested.filter((uri) => loaded.has(uri)));
    };
    setReadyCovers([]);
    const images = requested.map((uri) => {
      const image = new window.Image();
      image.decoding = "async";
      image.onload = () => { loaded.add(uri); update(); };
      image.onerror = update;
      image.src = uri;
      return image;
    });
    return () => {
      active = false;
      images.forEach((image) => { image.onload = null; image.onerror = null; });
    };
  }, [covers, privacy]);

  const measureSeal = (): SealStart | null => {
    const rect = realRef.current?.getBoundingClientRect();
    return rect ? { cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2, d: rect.width } : null;
  };

  const begin = () => {
    if (openingRef.current) {
      // 翻页中再次交互 = 跳过; 线稿已变实印才把原位交给 SealIntro, 否则走默认居中开场
      window.clearTimeout(timerRef.current);
      window.cancelAnimationFrame(flipFrameRef.current);
      onDone(performance.now() - startAtRef.current > MORPH_START + MORPH_DUR ? measureSeal() : null);
      return;
    }
    openingRef.current = true;
    if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onDone(null);
      return;
    }
    const scene = sceneRef.current;
    if (scene) {
      scene.style.setProperty("--tilt-x", "0deg");
      scene.style.setProperty("--tilt-y", "0deg");
      scene.style.setProperty("--lift", "0px");
    }
    setOpening(true);
    startAtRef.current = performance.now();
    timerRef.current = window.setTimeout(() => onDone(measureSeal()), TOTAL_MS);

    // 一条 rAF 驱动全部编排: 软纸翻页 -> 线稿变实印 -> 虹膜压黑(印章圆外收拢)
    const leaves = Array.from(bookRef.current?.querySelectorAll<HTMLElement>(".gate-bleaf") ?? []);
    const segLists = leaves.map((leaf) => Array.from(leaf.querySelectorAll<HTMLElement>(".gate-seg")));
    let irisGeom: { cx: number; cy: number; R: number } | null = null;
    const t0 = startAtRef.current;
    const step = (now: number) => {
      let live = false;
      leaves.forEach((leaf, i) => {
        const def = LEAVES[i]!;
        const local = (now - t0 - def.delay) / def.dur;
        if (local <= 0) { live = true; return; }
        const t = Math.min(1, local);
        if (t < 1) live = true;
        const te = ease(t);
        // 铰链角全部由贴脊第一条承担 => 终态必定平贴左侧;
        // 弯曲量: 中段保持拱形, 头尾页尖领先/拖尾, 落地精确归零
        const hinge = def.end * te;
        const bend = 38 * Math.sin(Math.PI * te) + 30 * Math.sin(2 * Math.PI * te);
        segLists[i]!.forEach((seg, k) => {
          const r = k === 0 ? hinge : bend / (SEGS - 1);
          seg.style.transform = `rotateY(${(-r).toFixed(3)}deg)`;
        });
      });

      // 线稿 -> 实印: 原位交叉淡化, 线稿微涨散开, 实印从 .985 落定
      const mu = (now - t0 - MORPH_START) / MORPH_DUR;
      if (mu > 0 && lineRef.current && realRef.current) {
        const e = ease(Math.min(1, mu));
        lineRef.current.style.opacity = (1 - e).toFixed(3);
        lineRef.current.style.transform = `scale(${(1 + 0.02 * e).toFixed(4)})`;
        realRef.current.style.opacity = e.toFixed(3);
        realRef.current.style.transform = `scale(${(0.985 + 0.015 * e).toFixed(4)})`;
      }

      // 虹膜压黑: 遮罩挖以印章为心的圆孔, 孔径收到印章圆缘定格 => 黑场只剩金印
      const iu = (now - t0 - IRIS_START) / IRIS_DUR;
      const blackout = blackoutRef.current;
      if (iu > 0 && blackout) {
        if (!irisGeom) {
          const rect = realRef.current?.getBoundingClientRect();
          irisGeom = rect
            ? { cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2, R: rect.width / 2 }
            : { cx: window.innerWidth / 2, cy: window.innerHeight / 2, R: 120 };
        }
        const e = ease(Math.min(1, iu));
        blackout.style.opacity = Math.min(1, e * 1.5).toFixed(3);
        const hole = irisGeom.R * (2.6 - 1.56 * e);
        const soft = 30 * (1 - e) + 3;
        const mask = `radial-gradient(circle at ${irisGeom.cx.toFixed(1)}px ${irisGeom.cy.toFixed(1)}px, rgba(0,0,0,0) ${hole.toFixed(1)}px, #000 ${(hole + soft).toFixed(1)}px)`;
        blackout.style.webkitMaskImage = mask;
        blackout.style.maskImage = mask;
      }

      if (now - t0 < TOTAL_MS - 80) live = true;
      if (live) flipFrameRef.current = window.requestAnimationFrame(step);
    };
    flipFrameRef.current = window.requestAnimationFrame(step);
  };

  useEffect(() => {
    const root = rootRef.current;
    const scene = sceneRef.current;
    if (!root || !scene) return undefined;
    scene.focus({ preventScroll: true });

    let targetTiltX = 0, targetTiltY = 0, targetLift = 0;
    let currentTiltX = 0, currentTiltY = 0, currentLift = 0;
    let tiltFrame = 0;
    const animateTilt = () => {
      currentTiltX += (targetTiltX - currentTiltX) * 0.16;
      currentTiltY += (targetTiltY - currentTiltY) * 0.16;
      currentLift += (targetLift - currentLift) * 0.16;
      scene.style.setProperty("--tilt-x", `${currentTiltX.toFixed(2)}deg`);
      scene.style.setProperty("--tilt-y", `${currentTiltY.toFixed(2)}deg`);
      scene.style.setProperty("--lift", `${currentLift.toFixed(2)}px`);
      if (Math.abs(targetTiltX - currentTiltX) > 0.02 || Math.abs(targetTiltY - currentTiltY) > 0.02 || Math.abs(targetLift - currentLift) > 0.02) tiltFrame = window.requestAnimationFrame(animateTilt);
      else tiltFrame = 0;
    };
    const queueTilt = () => { if (!tiltFrame) tiltFrame = window.requestAnimationFrame(animateTilt); };
    const resetTilt = () => {
      targetTiltX = 0; targetTiltY = 0; targetLift = 0;
      root.style.setProperty("--glow-x", "50%");
      root.style.setProperty("--glow-y", "35%");
      queueTilt();
    };
    const updateTilt = (event: PointerEvent) => {
      if (openingRef.current) return;
      const rect = scene.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) { resetTilt(); return; }
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      targetTiltX = -y * 13;
      targetTiltY = x * 18;
      targetLift = (Math.abs(x) + Math.abs(y)) * 10;
      root.style.setProperty("--glow-x", `${((x + 0.5) * 100).toFixed(1)}%`);
      root.style.setProperty("--glow-y", `${((y + 0.5) * 100).toFixed(1)}%`);
      queueTilt();
    };
    const onKey = (event: KeyboardEvent) => {
      if (["Enter", " ", "ArrowRight", "ArrowDown", "PageDown"].includes(event.key)) {
        event.preventDefault();
        begin();
      }
    };
    window.addEventListener("pointermove", updateTilt, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", updateTilt);
      window.removeEventListener("keydown", onKey);
      if (tiltFrame) window.cancelAnimationFrame(tiltFrame);
      window.cancelAnimationFrame(flipFrameRef.current);
      window.clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`gate-root${opening ? " opening" : ""}`} data-testid="book-gate" ref={rootRef}>
      <style>{css}</style>
      <div className="gate-burnable">
        <div aria-label="翻开报告，进入年度故事" className="gate-scene" data-testid="book-gate-scene" onClick={begin} ref={sceneRef} role="button" tabIndex={0}>
          <div aria-hidden className="gate-aura" />
          <div className="gate-book" ref={bookRef}>
            <div className="gate-leaf gate-base gate-paper">
              <div className="gate-sealwrap">
                <div className="gate-sealline" ref={lineRef}><SealSketch /></div>
                <div className="gate-sealreal" ref={realRef}>
                  <img alt="" draggable={false} src={sheetUri} />
                </div>
              </div>
            </div>
            {LEAVES.map((leaf, index) => (
              <div className="gate-bleaf" data-testid={`book-page-${index + 1}`} key={index} style={{ transform: `translateZ(${leaf.z}px)` }}>
                <Segs k={0} coverUri={readyCovers[index]} />
              </div>
            ))}
            <div className="gate-leaf gate-cover">
              <div className="gate-face gate-cover-front">
                <img alt="个人内容宇宙报告封面" draggable={false} src={coverUri} />
                <div className="gate-sheen" />
              </div>
              <div className="gate-face gate-back gate-cover-back">
                <Sigil />
              </div>
            </div>
          </div>
          <div className="gate-hint">点击 · 翻开报告</div>
        </div>
      </div>
      <div aria-hidden className="gate-blackout" ref={blackoutRef} />
    </div>
  );
}

const css = `
.gate-root { position: fixed; inset: 0; z-index: 60; overflow: hidden; --glow-x: 50%; --glow-y: 35%; }
.gate-burnable { position: absolute; inset: 0; background: #07090b; isolation: isolate; display: grid; place-items: center; padding: 24px 18px; }
.gate-blackout { position: absolute; inset: 0; background: #0A0A0B; opacity: 0; pointer-events: none; }
.gate-sealwrap { position: absolute; left: 50%; top: 45%; width: 46%; aspect-ratio: 1 / 1; transform: translate(-50%, -50%); pointer-events: none; }
.gate-sealline { position: absolute; inset: 0; }
.gate-sealline svg { width: 100%; height: 100%; display: block; }
.gate-sealreal { position: absolute; inset: 0; border-radius: 50%; overflow: hidden; opacity: 0; }
.gate-sealreal img { position: absolute; width: 1121.2%; height: 747.5%; left: -256.6%; top: -153.7%; max-width: none; user-select: none; -webkit-user-drag: none; }
.gate-burnable::before { content: ""; position: absolute; inset: 0; z-index: -2; pointer-events: none; opacity: .62; background: radial-gradient(circle at var(--glow-x) var(--glow-y), rgba(137,170,161,.1), transparent 34%), radial-gradient(circle at 50% 120%, rgba(218,168,92,.12), transparent 42%), linear-gradient(125deg, #050608 0%, #111316 48%, #080a0c 100%); }
.gate-burnable::after { content: ""; position: absolute; inset: 0; z-index: -1; pointer-events: none; opacity: .16; mix-blend-mode: screen; background-image: repeating-linear-gradient(0deg, rgba(255,255,255,.04) 0 1px, transparent 1px 4px), repeating-linear-gradient(90deg, rgba(0,0,0,.12) 0 1px, transparent 1px 5px); }
.gate-scene { --book-h: clamp(390px, 76dvh, 617px); --book-w: calc(var(--book-h) * .705); --tilt-x: 0deg; --tilt-y: 0deg; --lift: 0px; position: relative; width: min(94vw, calc(var(--book-w) + 80px)); height: calc(var(--book-h) + 80px); display: grid; place-items: center; perspective: 1800px; outline: none; cursor: pointer; transform: translateZ(var(--lift)) rotateX(var(--tilt-x)) rotateY(var(--tilt-y)); transform-style: preserve-3d; will-change: transform; }
.gate-scene:focus-visible { outline: 1px solid rgba(201,164,104,.72); outline-offset: 10px; }
.opening .gate-scene { transition: transform .5s cubic-bezier(.4,0,.2,1); cursor: default; }
.gate-aura { position: absolute; width: 72%; height: 72%; border-radius: 50%; background: radial-gradient(ellipse, rgba(0,0,0,.85), transparent 70%); filter: blur(22px); transform: translateY(18%); pointer-events: none; }
.gate-book { position: relative; width: var(--book-w); height: var(--book-h); transform-style: preserve-3d; transform-origin: 100% 50%; }
.opening .gate-book { animation: gateBook ${TOTAL_MS}ms cubic-bezier(.62,.04,.3,1) forwards; }
@keyframes gateBook {
  0% { transform: translateX(0) scale(1); }
  11% { transform: translateX(3%) scale(1.02); }
  31% { transform: translateX(44%) scale(1.05); }
  62% { transform: translateX(46.5%) scale(1.07); }
  100% { transform: translateX(46.5%) scale(1.07); }
}
.gate-book::before { content: ""; position: absolute; left: -7px; top: 6px; width: 10px; height: calc(100% - 12px); border-radius: 3px 0 0 3px; background: repeating-linear-gradient(90deg, #756b5b 0 1px, #c6bbaa 1px 2px, #8e8270 2px 3px, #d6cdbd 3px 5px); opacity: .86; transform: translateZ(-4px); box-shadow: -2px 0 4px rgba(0,0,0,.35); pointer-events: none; }
.gate-leaf { position: absolute; inset: 0; transform-origin: left center; transform-style: preserve-3d; border-radius: 4px 6px 6px 4px; }
.gate-bleaf { position: absolute; inset: 0; transform-style: preserve-3d; pointer-events: none; }
.gate-seg { position: absolute; top: 0; height: 100%; transform-origin: left center; transform-style: preserve-3d; backface-visibility: visible; }
.gate-seg-cover, .gate-seg-paper { position: absolute; inset: 0; pointer-events: none; }
.gate-seg-cover { z-index: 0; background-color: #E8E0CB; }
.gate-seg-paper { z-index: 1; }
.gate-seg-edge { position: absolute; inset: 0; z-index: 1.5; pointer-events: none; background:
  linear-gradient(180deg, rgba(82,63,39,.24), rgba(82,63,39,0) 7%, rgba(82,63,39,0) 93%, rgba(82,63,39,.3)),
  linear-gradient(90deg, rgba(82,63,39,.18), rgba(82,63,39,0) 9%, rgba(82,63,39,0) 91%, rgba(82,63,39,.28)),
  repeating-linear-gradient(0deg, rgba(255,249,229,.16) 0 1px, transparent 1px 4px);
  mix-blend-mode: multiply; opacity: .7; }
.gate-seg > .gate-seg { z-index: 2; }
.gate-face { position: absolute; inset: 0; backface-visibility: hidden; border-radius: 4px 6px 6px 4px; overflow: hidden; transform: translateZ(.2px); }
.gate-face.gate-back { transform: rotateY(180deg) translateZ(.2px); border-radius: 6px 4px 4px 6px; }
.gate-paper { background:
  linear-gradient(180deg, rgba(96,78,48,.06), rgba(96,78,48,0) 4%, rgba(96,78,48,0) 96%, rgba(96,78,48,.08)),
  repeating-linear-gradient(0deg, rgba(118,98,64,.026) 0 1px, rgba(255,255,255,0) 1px 3.6px),
  radial-gradient(120% 100% at 40% 14%, rgba(255,250,236,.07), rgba(255,250,236,0) 55%),
  radial-gradient(100% 90% at 82% 88%, rgba(120,96,60,.06), rgba(120,96,60,0) 60%),
  linear-gradient(105deg, #EFE8D6 0%, #E8E0CB 55%, #EFE7D5 100%);
  box-shadow: inset 0 0 0 1px rgba(90,76,54,.16), inset 16px 0 30px -20px rgba(56,42,24,.5), inset -6px 0 14px -12px rgba(56,42,24,.28); }
.gate-base { transform: none; }
.gate-base::after { content: ""; position: absolute; right: 0; top: 1.4%; bottom: 1.2%; width: 7px; border-radius: 0 6px 6px 0; background:
  linear-gradient(180deg, rgba(80,64,40,.2), rgba(80,64,40,0) 9%, rgba(80,64,40,0) 91%, rgba(80,64,40,.24)),
  repeating-linear-gradient(90deg, #CBBFA3 0 1px, #E9E1CC 1px 2.2px, #DDD3BA 2.2px 3.4px); }
.gate-base::before { content: ""; position: absolute; left: 1%; right: 1px; bottom: 0; height: 6px; border-radius: 0 0 6px 4px; background:
  linear-gradient(90deg, rgba(80,64,40,.16), rgba(80,64,40,0) 10%, rgba(80,64,40,0) 88%, rgba(80,64,40,.2)),
  repeating-linear-gradient(0deg, #C7BB9F 0 1px, #E7DFC9 1px 2.1px, #DAD0B6 2.1px 3.2px); }
.gate-cover { transform: translateZ(1.6px); }
.opening .gate-cover { animation: gateFlipCover 1.3s cubic-bezier(.7,.05,.28,1) .12s forwards; }
@keyframes gateFlipCover { to { transform: translateZ(1.6px) rotateY(-178.4deg); } }
.gate-cover-front { box-shadow: inset 0 0 0 1px rgba(61,45,31,.34); }
.gate-cover-front img { display: block; width: 100%; height: 100%; object-fit: cover; user-select: none; -webkit-user-drag: none; }
.gate-sheen { position: absolute; inset: 0; pointer-events: none; background: linear-gradient(112deg, transparent 31%, rgba(255,255,255,.12) 48%, transparent 64%); mix-blend-mode: screen; opacity: .46; }
.gate-cover-back { background:
  radial-gradient(130% 96% at 10% 6%, rgba(216,196,156,.06), rgba(216,196,156,0) 42%),
  radial-gradient(110% 90% at 90% 94%, rgba(0,0,0,.34), rgba(0,0,0,0) 55%),
  linear-gradient(250deg, #2F281C 0%, #241F15 52%, #2B2519 100%);
  box-shadow: inset 0 0 0 1px rgba(201,164,104,.17), inset 0 1px 0 rgba(255,255,255,.05), inset -1px 0 0 rgba(0,0,0,.25), inset 0 0 46px rgba(0,0,0,.5); }
.gate-cover-back::before { content: ""; position: absolute; inset: 4.2% 7.2% 4.2% 4.8%; border-radius: 2px; background:
  linear-gradient(180deg, rgba(64,50,30,.1), rgba(64,50,30,0) 5%, rgba(64,50,30,0) 95%, rgba(64,50,30,.12)),
  repeating-linear-gradient(0deg, rgba(120,98,62,.03) 0 1px, rgba(255,255,255,0) 1px 3.2px),
  radial-gradient(130% 100% at 30% 18%, rgba(255,247,228,.07), rgba(255,247,228,0) 55%),
  radial-gradient(90% 80% at 80% 88%, rgba(96,76,44,.12), rgba(96,76,44,0) 60%),
  linear-gradient(112deg, #E4D9C0 0%, #DCD0B4 48%, #E4D9C1 100%);
  box-shadow: inset 0 0 0 1px rgba(110,88,54,.24), inset -12px 0 20px -13px rgba(50,36,18,.6), inset 9px 0 16px -13px rgba(50,36,18,.34), 0 1px 8px rgba(0,0,0,.3); }
.gate-cover-back::after { content: ""; position: absolute; top: 2.4%; bottom: 2.4%; right: 3%; width: 2.6%; border-radius: 2px; background:
  linear-gradient(90deg, rgba(0,0,0,0), rgba(0,0,0,.28) 42%, rgba(0,0,0,.34) 58%, rgba(140,112,68,.14) 88%, rgba(0,0,0,0)); }
.gate-sigil { position: absolute; inset: 4.2% 7.2% 4.2% 4.8%; width: calc(100% - 12%); height: calc(100% - 8.4%); opacity: .88;
  -webkit-mask-image: radial-gradient(125% 105% at 46% 44%, #000 52%, rgba(0,0,0,.4) 80%, rgba(0,0,0,.14) 100%);
  mask-image: radial-gradient(125% 105% at 46% 44%, #000 52%, rgba(0,0,0,.4) 80%, rgba(0,0,0,.14) 100%); }
.gate-hint { position: absolute; bottom: 4px; left: 0; right: 0; text-align: center; color: #b9ae9c; opacity: .55; font-size: 12px; letter-spacing: 4px; margin-left: 4px; font-family: "Songti SC", "Noto Serif SC", Georgia, serif; }
.opening .gate-hint { opacity: 0; transition: opacity .3s; }
@media (max-width: 700px) {
  .gate-burnable { padding: 10px 7px 14px; }
  .gate-scene { --book-h: min(72dvh, 560px, calc(92vw / .705)); width: min(98vw, calc(var(--book-w) + 44px)); height: calc(var(--book-h) + 54px); }
}
`;
