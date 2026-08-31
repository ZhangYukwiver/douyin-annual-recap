import React, { useEffect, useRef, useState } from "react";

// ponytail: web-only DOM overlay(原生 CSS preserve-3d 翻页, RNW 样式做不了); 非 web 平台由调用方跳过
// 软纸翻页: 每页切 SEGS 条嵌套铰接竖片, rAF 逐帧驱动; 终态所有片平贴
// 尾声: 翻完露出末页上的印章线稿 -> 线稿渐变成真实金印 -> 黑场以印章为心虹膜收拢,
//       onDone 把印章屏幕矩形交给 SealIntro 从原位起飞落成第一页(旧燃烧转场已移除)
// 8 片足够画出 ≤40° 的拱度(每片 5°); 页数翻到 14 之后, 12 片的元素总量没必要
const SEGS = 8;
// 相邻片必须重叠，否则每片各自是一个 preserve-3d 合成层，层边界的抗锯齿会留下 1.5px 的亮缝。
// 但重叠区里半透明的层（veil / edge）会叠两遍、图会被 backgroundSize 放大 —— 所以这些层各自内缩一个重叠量，
// 只留不透明的 sheet 铺满去盖缝。
const SEG_OVERLAP = 1.5;
// 翻书要像"哗啦一下捻过去"而不是一页一页翻: 单页快(950ms)、间隔密(105ms),
// 于是任意时刻空中有 ~9 页、彼此差 ~20°, 连成一把扇面。5 页 / 320ms 间隔时页与页
// 差 40° 以上, 看着是"轮流各翻一页", 不是翻书。
const LEAF_COUNT = 14;
export const BOOK_PAGE_COUNT = LEAF_COUNT;
const LEAVES = Array.from({ length: LEAF_COUNT }, (_, i) => ({
  delay: 460 + i * 105,
  dur: 950,
  end: 177 - i * 0.5,
  z: 1.4 - i * 0.09,
}));
// 纸的弯曲集中在自由缘: 靠书脊几乎不弯, 越往外每片吃到的增量越大。
// 平均分(旧写法)出来的是一段圆弧, 看着像卷起来的铁皮; 加权后才是纸。
const BEND_W = (() => {
  const raw = Array.from({ length: SEGS - 1 }, (_, i) => i + 1);
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map((v) => v / sum);
})();
// 竖片的受光: 这一层是"看起来像纸在转"的全部来源 —— 少了它, 一页转开只是被横向压扁, 读作擦除。
// 漫反射按面朝视线的程度(|cos|): 正对最亮, 侧到 90° 最暗, 过 90° 露出背面纸又亮回来。
// 高光是固定在世界里的一盏斜光, 页转过去时它自己从纸的外缘扫向书脊 —— 只有暗部的话,
// 立起来的页读成一块平的灰卡片, 有这道扫光才看得出纸是弯的。
const KEY_LIGHT = 34;
function shadeAt(deg: number): { dark: string; hi: string } {
  const lit = Math.abs(Math.cos((deg * Math.PI) / 180));
  // 纸是哑光: 高光要窄要淡, 宽一点整页就发灰发糊(0.42/^14 试过, 未翻的页都被洗白了)
  const spec = Math.max(0, Math.cos(((deg - KEY_LIGHT) * Math.PI) / 180)) ** 26;
  return {
    // 同时有 ~9 页在飞、影子会层层叠加, 单层再按 0.44 给整把扇面就压成灰的了
    dark: `rgba(22,15,7,${(0.3 * (1 - lit) ** 1.2).toFixed(3)})`,
    hi: spec < 0.01 ? "" : `rgba(255,249,233,${(0.17 * spec).toFixed(3)})`,
  };
}
// ponytail: 开场动效(翻页 + 印章飞入)暂时藏起来 —— 平板滑动/空白内页/黑屏断层, 见 2026-08-30 录屏。
// 点封面直接进报告 01。重做好把这里改回 false, 动画代码原样留着。
export const SKIP_INTRO = true;
// ponytail: 连书本本身也一起藏了 —— 打开报告直接落 01 章。想找回整套开场把这里改回 false。
export const SKIP_BOOK = true;
const MORPH_START = 3350;
const MORPH_DUR = 900;
const IRIS_START = 4450;
const IRIS_DUR = 700;
const TOTAL_MS = 5250;

export interface SealStart { cx: number; cy: number; d: number }

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
// 翻页用近似匀角速: easeInOutQuad 会让每页把大半时间耗在 0° 和 180° 附近,
// 于是同时在飞的 9 页全挤在两头、中间是空的 —— 扇面散不开。只在收尾留一点缓冲。
const flipEase = (t: number) => 1 - (1 - t) ** 1.25;

// 片段本身必须带有纸面，否则没有封面图时 rotateY 只会旋转一组透明 div，
// 用户看到的就只剩封面移动。各片段的色阶只做很小的渐变，避免接缝变成明显竖纹。
// 每片一个固定不透明度会在缝上留 12 级阶跃 —— 改成片内横向渐变，边界处两片取同一个值就接上了。
const veilAlpha = (u: number) => (0.08 - u * 0.05).toFixed(3);

function segPaperTone(k: number): string {
  const mix = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
  const stop = (u: number) => `rgba(${mix(233, 242, u)}, ${mix(226, 235, u)}, ${mix(208, 221, u)}, ${veilAlpha(u)})`;
  return [
    "linear-gradient(180deg, rgba(96,78,48,.01), rgba(96,78,48,0) 4%, rgba(96,78,48,0) 96%, rgba(96,78,48,.014))",
    `linear-gradient(90deg, ${stop(k / SEGS)}, ${stop((k + 1) / SEGS)})`,
  ].join(", ");
}

// 只给每片的外缘加轻微不规则边；不要把 mask 放到 preserve-3d 的父层上。
// 噪声按"整页横向位置"取样, 相邻片在交界处落到同一个 u -> 同一个 y, 毛边才连得上;
// 按片索引取样(旧写法)会让每条缝两侧各取一个无关值, 缝上留台阶, 幅度一大就露馅。
// 双频: 低频给整页 7 个大起伏, 高频给 23 个细齿, 合起来像手工纸毛边而不是锯齿。
const EDGE_XS = [0, 12.5, 25, 37.5, 50, 62.5, 75, 87.5, 100];
const edgeWave = (u: number, phase: number) => Math.sin(u * 44 + phase) * 0.64 + Math.sin(u * 145 + phase * 1.7) * 0.36;

export function segmentEdgeClip(k: number): string {
  const at = (x: number) => (k + x / 100) / SEGS;
  const top = EDGE_XS.map((x) => 2.1 + edgeWave(at(x), 0) * 0.55);
  const bottom = EDGE_XS.map((x) => 97.9 + edgeWave(at(x), 3.4) * 0.5);
  // 中间片的左右边要伸到片外：正好落在片边缘的话，clip-path 的抗锯齿会留下一条半透明边，
  // 12 片叠起来就是 11 条亮竖线（底下的纸透出来）。只有首末片才真的需要裁左右。
  const left = k === 0 ? 1.7 + edgeWave(0.5, 1.1) * 0.8 : -4;
  const right = k === SEGS - 1 ? 98.3 + edgeWave(0.5, 5.2) * 0.8 : 104;
  const px = (x: number) => (x === 0 ? left.toFixed(2) : x === 100 ? right.toFixed(2) : x.toFixed(1));
  const edge = (ys: number[]) => EDGE_XS.map((x, i) => `${px(x)}% ${ys[i]!.toFixed(2)}%`);
  return `polygon(${[...edge(top), ...edge(bottom).reverse()].join(", ")})`;
}

function coverSliceStyle(k: number, uri: string) {
  const clipPath = segmentEdgeClip(k);
  return {
    backgroundImage: `url(${JSON.stringify(uri)})`,
    backgroundPosition: `${((k / Math.max(1, SEGS - 1)) * 100).toFixed(3)}% 0`,
    backgroundRepeat: "no-repeat",
    // 尺寸要按"没有重叠时的片宽"算：直接写 1200% 是相对含重叠的元素宽，图会被撑大 SEGS*OVERLAP，
    // 片间内容逐格错开就是可见的接缝。position 仍用 k/(SEGS-1)，由此带来的累积偏移全页不到 1.5px。
    backgroundSize: `calc((100% - ${SEG_OVERLAP + 2}px) * ${SEGS}) 100%`,
    bottom: "1.8%",
    clipPath,
    // 左右各外扩 1px：元素边界的抗锯齿只要落在片边界上就会露出底下的亮纸，
    // 挪进邻片的覆盖范围里就看不见了。外扩量一并从 backgroundSize 里扣掉，图才不被撑大。
    left: k === 0 ? "6px" : "-1px",
    right: k === SEGS - 1 ? "6px" : "-1px",
    top: "1.8%",
    WebkitClipPath: clipPath,
  };
}

function pageImageStyle(uri: string) {
  return {
    backgroundImage: `url(${JSON.stringify(uri)})`,
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    backgroundSize: "cover",
  };
}

type BakedCover = { uri: string; baked: boolean };

// 水彩上色的 CSS 近似；烤不出来时降级路径直接用同一串，两条路观感一致。
const WATERCOLOR_CSS = "blur(0.3px) sepia(.16) saturate(1.02) contrast(1.16)";

function loadCoverImage(src: string, anonymous: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const el = new window.Image();
    if (anonymous) el.crossOrigin = "anonymous";
    el.decoding = "async";
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = src;
  });
}

// 水彩的色域两头都不到位：最亮处是纸本身（不是纯白），最暗处是厚颜料（不是纯黑）。
// 把整张图重映射进 [墨, 纸] 之间，白的地方就自然成了纸的留白、黑的地方成了颜料 ——
// 只抬暗端不够，亮端留在纯白的话背景永远是"照片的白"，纸感出不来。
const PAPER_LO = [36, 33, 28];
const PAPER_HI = [236, 228, 206];
// 抖音封面大多曝光偏暗（夜景、影棚、游戏画面），线性映射抬不动中间调，纸感只在边上有。
// gamma<1 把中间调整体提起来，接近水彩那种"照着画、不照着曝光"的明度分布。
const PAPER_GAMMA = 0.72;

function mapToPaperRange(data: Uint8ClampedArray, w: number, h: number): void {
  // 每像素三次 pow 太贵，256 项查找表足够
  const lut = PAPER_LO.map((lo, c) => {
    const table = new Uint8Array(256);
    for (let v = 0; v < 256; v += 1) table[v] = Math.round(lo + (v / 255) ** PAPER_GAMMA * (PAPER_HI[c]! - lo));
    return table;
  });
  for (let p = 0; p < w * h * 4; p += 4) {
    data[p] = lut[0]![data[p]!]!;
    data[p + 1] = lut[1]![data[p + 1]!]!;
    data[p + 2] = lut[2]![data[p + 2]!]!;
  }
}

// 拉普拉斯 3x3 取边缘再 multiply 进水彩层：与原 #gate-ink-filter 同核同阈值，只是挪到烘焙期算一次。
function inkOnto(data: Uint8ClampedArray, w: number, h: number): void {
  const lum = new Float32Array(w * h);
  const tmp = new Float32Array(w * h);
  for (let i = 0; i < lum.length; i += 1) lum[i] = (data[i * 4]! * 0.299 + data[i * 4 + 1]! * 0.587 + data[i * 4 + 2]! * 0.114) / 255;
  // 两轮 3x3 均值(≈5x5)再检边：封面里的星点和压缩噪点只有 1-2px，拉普拉斯对孤立亮点的响应是个环，
  // 不抹掉就满图小圆圈；两轮足够吃掉它们，器物和波浪那种粗边留得住。
  for (let pass = 0; pass < 2; pass += 1) {
    tmp.set(lum);
    for (let y = 1; y < h - 1; y += 1) {
      for (let x = 1; x < w - 1; x += 1) {
        const i = y * w + x;
        lum[i] = (tmp[i - w - 1]! + tmp[i - w]! + tmp[i - w + 1]! + tmp[i - 1]! + tmp[i]! + tmp[i + 1]! + tmp[i + w - 1]! + tmp[i + w]! + tmp[i + w + 1]!) / 9;
      }
    }
  }
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x;
      const e = Math.abs(lum[i]! * 8 - lum[i - 1]! - lum[i + 1]! - lum[i - w]! - lum[i + w]! - lum[i - w - 1]! - lum[i - w + 1]! - lum[i + w - 1]! - lum[i + w + 1]!);
      const ink = Math.min(1, (e - 0.055) * 4.8);
      if (ink <= 0) continue;
      const k = 1 - ink * 0.85;
      const p = i * 4;
      data[p] = data[p]! * k;
      data[p + 1] = data[p + 1]! * k;
      data[p + 2] = data[p + 2]! * k;
    }
  }
}

// 双线性插值的 value noise：低分辨率随机网格放大，用来把边界揉成不规则形状。
function valueNoise(cells: number, seed: number): (u: number, v: number) => number {
  const row = cells + 1;
  const grid = new Float32Array(row * row);
  let state = seed;
  for (let i = 0; i < grid.length; i += 1) { state = (state * 48271) % 2147483647; grid[i] = state / 2147483647; }
  return (u, v) => {
    const x = Math.max(0, Math.min(cells - 0.0001, u * cells));
    const y = Math.max(0, Math.min(cells - 0.0001, v * cells));
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const a = grid[y0 * row + x0]!, b = grid[y0 * row + x0 + 1]!;
    const c = grid[(y0 + 1) * row + x0]!, d = grid[(y0 + 1) * row + x0 + 1]!;
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  };
}

// 颜料渗透边：把矩形硬边换成水彩在纸上洇开的不规则软边。
// 到最近边的距离场被两层 value noise 扰动后 smoothstep 成 alpha；过渡带里再压暗一档，
// 模拟颜料干燥时往边缘聚集的深色沉积——水彩边缘那圈深色就是这么来的。
// 关键是这一切烤进图自己的 alpha：不是 CSS mask，所以既不碰 preserve-3d，切片后接缝也天然连续。
function bleedEdge(data: Uint8ClampedArray, w: number, h: number): void {
  const coarse = valueNoise(7, 20260830);
  const fine = valueNoise(23, 7654321);
  const band = 0.075; // 洇开带宽，占到中心距离的比例；再宽就开始吃主体了
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const u = x / (w - 1), v = y / (h - 1);
      const edge = Math.min(u, 1 - u, v, 1 - v) * 2; // 0=纸边 1=正中
      const n = coarse(u, v) * 0.62 + fine(u, v) * 0.38;
      const t = Math.max(0, Math.min(1, (edge + (n - 0.5) * 0.15) / band));
      const p = (y * w + x) * 4;
      data[p + 3] = Math.round(255 * t * t * (3 - 2 * t));
      if (t > 0.04 && t < 0.6) {
        const k = 1 - (1 - Math.abs(t - 0.32) / 0.32) * 0.24;
        data[p] = data[p]! * k;
        data[p + 1] = data[p + 1]! * k;
        data[p + 2] = data[p + 2]! * k;
      }
    }
  }
}

// 把封面预烤成"水彩上色 + 墨线勾边 + 颜料渗透边"的单张图。
// 为什么烤而不是运行时挂滤镜：12 条翻页片各自跑一次卷积，核在每条缝上被截断，缝就成了可见竖纹；
// 烤成一张再按 backgroundPosition 切片，接缝天然连续，翻页时也不必同时挂 12 份滤镜。
// 抖音图床全域回 ACAO:*，crossOrigin 能取到像素；取不到就退回原图 + CSS 近似滤镜。
async function bakeCover(src: string): Promise<BakedCover | undefined> {
  let img: HTMLImageElement;
  try {
    img = await loadCoverImage(src, true);
  } catch {
    try { await loadCoverImage(src, false); } catch { return undefined; }
    return { uri: src, baked: false };
  }
  try {
    // 900 而非 720：书页在 2x 屏上要 862 物理像素，720 会被放大 1.2 倍、细节糊掉；再往上只是白烧编码时间
    const w = Math.min(img.naturalWidth || 900, 900);
    const h = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * w) || 1200);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return { uri: src, baked: false };
    ctx.filter = WATERCOLOR_CSS;
    ctx.drawImage(img, 0, 0, w, h);
    ctx.filter = "none";
    const frame = ctx.getImageData(0, 0, w, h);
    mapToPaperRange(frame.data, w, h);
    inkOnto(frame.data, w, h);
    bleedEdge(frame.data, w, h);
    ctx.putImageData(frame, 0, 0);
    // 渗透边要 alpha，所以不能用 JPEG。编码本身比整条处理还贵（900×1200 的 WebP 实测 ~295ms/张），
    // 而 toDataURL 是同步的会卡住主线程 —— 换 toBlob，编码走后台线程，主线程只留处理那几十毫秒。
    // 不支持 WebP 的浏览器（Safari）会自己回退成 PNG；图被污染时 toBlob 抛，落到 catch。
    const blob = await new Promise<Blob | null>((resolve) => { canvas.toBlob(resolve, "image/webp", 0.92); });
    if (!blob) return { uri: src, baked: false };
    return { uri: URL.createObjectURL(blob), baked: true };
  } catch {
    return { uri: src, baked: false };
  }
}

// 竖片是 12 个平级兄弟, 不是 12 层嵌套。嵌套版每片只写自己相对上一片的增量角,
// 读起来省事, 但 12 层深的 preserve-3d 链 Chrome 合成不住: 转过 ~90° 的片直接不画,
// 于是"翻过去的那一页"整张消失, 翻页只剩横向擦除。平级片各自算好绝对位姿, 没有这个问题。
function Segs({ baked, coverUri }: { baked?: boolean; coverUri?: string }) {
  return (
    <>
      {Array.from({ length: SEGS }, (_, k) => {
        const clipPath = segmentEdgeClip(k);
        const inset = k === SEGS - 1 ? 0 : SEG_OVERLAP;
        return (
          <div
            className="gate-seg"
            key={k}
            style={{
              left: `calc(${k} * 100% / ${SEGS})`,
              width: `calc(100% / ${SEGS} + ${SEG_OVERLAP}px)`,
              borderRadius: k === SEGS - 1 ? "0 6px 6px 0" : 0,
            }}
          >
            <div aria-hidden className="gate-seg-sheet" />
            {coverUri ? <div aria-hidden className="gate-seg-cover" data-baked={baked || undefined} style={coverSliceStyle(k, coverUri)} /> : null}
            <div aria-hidden className="gate-seg-paper" style={{ background: segPaperTone(k), clipPath, WebkitClipPath: clipPath, right: inset }} />
            <div aria-hidden className="gate-seg-edge" style={{ clipPath, WebkitClipPath: clipPath, right: inset }} />
            {/* 和 paper/edge 同理: 半透明层不能盖住 SEG_OVERLAP, 否则每条缝上叠两遍变成暗竖线 */}
            <div aria-hidden className="gate-seg-shade" style={{ right: inset }} />
          </div>
        );
      })}
    </>
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
  const castRef = useRef<HTMLDivElement>(null);
  const openingRef = useRef(false);
  const startAtRef = useRef(0);
  const timerRef = useRef(0);
  const flipFrameRef = useRef(0);
  const [opening, setOpening] = useState(false);
  const [readyCovers, setReadyCovers] = useState<Array<BakedCover | undefined>>([]);
  const coverUri = (require("./assets/book-cover.png") as { uri: string }).uri;
  const sheetUri = (require("./assets/reference/pages-01-04.png") as { uri: string }).uri;
  const paperGrainUri = (require("./assets/paper-grain.png") as { uri: string }).uri;

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const requested = privacy
      ? []
      : [...new Set(covers.filter((uri): uri is string => typeof uri === "string" && uri.trim().length > 0))].slice(0, LEAVES.length);
    let active = true;
    const done = new Map<string, BakedCover>();
    setReadyCovers([]);
    // 串行 + 每张之间让出一拍：单张烤 ~35ms（首张含 JIT 预热更久），5 张连着跑会把书本入场动画顶掉。
    // 烤在合书静止期完成，等用户点击时早就就绪，慢一点不影响。
    void (async () => {
      for (const uri of requested) {
        const cover = await bakeCover(uri);
        if (!active) return;
        if (cover) {
          done.set(uri, cover);
          setReadyCovers(requested.map((key) => done.get(key)));
        }
        await new Promise((resolve) => { window.setTimeout(resolve, 0); });
      }
    })();
    return () => {
      active = false;
      done.forEach((cover) => { if (cover.uri.startsWith("blob:")) URL.revokeObjectURL(cover.uri); });
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
    if (SKIP_INTRO || (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) {
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
    const shadeLists = leaves.map((leaf) => Array.from(leaf.querySelectorAll<HTMLElement>(".gate-seg-shade")));
    const cast = castRef.current;
    // 片距按整页实宽算一次: 折线要用像素长度接铰点, 用 % 接不上
    const pitch = (leaves[0]?.querySelector(".gate-segs") as HTMLElement | null)?.clientWidth ?? 0;
    const pitchPx = pitch / SEGS;
    let irisGeom: { cx: number; cy: number; R: number } | null = null;
    const t0 = startAtRef.current;
    const step = (now: number) => {
      let live = false;
      let lead = 0;
      // 相机在翻页期间侧过去一点再回正。正对着看时, 立到 90° 的页面屏幕宽度是 0,
      // 整个翻页就只能读成"横向擦除"; 侧一点才看得见纸面转过去的那一面。
      if (scene) {
        const c = Math.sin(Math.PI * Math.min(1, Math.max(0, (now - t0 - 240) / 3300)));
        scene.style.setProperty("--tilt-x", `${(-6 * c).toFixed(2)}deg`);
        scene.style.setProperty("--tilt-y", `${(13 * c).toFixed(2)}deg`);
      }
      leaves.forEach((leaf, i) => {
        const def = LEAVES[i]!;
        const local = (now - t0 - def.delay) / def.dur;
        if (local <= 0) { live = true; return; }
        const t = Math.min(1, local);
        if (t < 1) live = true;
        const te = flipEase(t);
        // 中段保持拱形, 头尾页尖领先/拖尾, 落地时所有竖片角度一致
        const hinge = def.end * te;
        // sin(π) 给整程的基本拱度, sin(2π) 给"抬起时自由缘领先 / 落下时拖尾"的换向
        const bend = 22 * Math.sin(Math.PI * te) + 18 * Math.sin(2 * Math.PI * te);
        if (t < 1) lead = Math.max(lead, hinge);
        // 把这一页当成一条 12 段的折线来摆: 逐段累加角度, 顺着上一段的末端接下一段的铰点。
        // 每片写的是绝对位姿(自己的世界坐标 + 自己的角度), 所以不依赖父片的变换。
        const segs = segLists[i]!;
        const cum: number[] = [];
        let px = 0, pz = 0;
        segs.forEach((seg, k) => {
          const deg = (cum[k - 1] ?? 0) + (k === 0 ? hinge : bend * BEND_W[k - 1]!);
          cum.push(deg);
          const rad = (deg * Math.PI) / 180;
          seg.style.transform = `translate3d(${(px - k * pitchPx).toFixed(2)}px, 0, ${pz.toFixed(2)}px) rotateY(${(-deg).toFixed(3)}deg)`;
          px += pitchPx * Math.cos(rad);
          pz += pitchPx * Math.sin(rad);
        });
        // 明暗按"累计角"算(片在世界里真正转过的角度), 按单片增量算等于没转。
        // 每片写成横向渐变、两端取与邻片共用的中点角: 常数色会在 12 条缝上留亮度台阶。
        shadeLists[i]!.forEach((shade, k) => {
          const a = k === 0 ? cum[0]! : (cum[k - 1]! + cum[k]!) / 2;
          const b = k === segs.length - 1 ? cum[k]! : (cum[k]! + cum[k + 1]!) / 2;
          const sa = shadeAt(a), sb = shadeAt(b);
          const dark = `linear-gradient(90deg, ${sa.dark}, ${sb.dark})`;
          // 高光只在一条窄带里非零; 其余片省掉这一层, 每帧少刷一遍 60 个元素的渐变
          shade.style.background = sa.hi || sb.hi ? `linear-gradient(90deg, ${sa.hi || "transparent"}, ${sb.hi || "transparent"}), ${dark}` : dark;
        });
      });

      // 抬起的纸在下面那叠上投的影: 从书脊往外扫, 页面立起时最重
      if (cast) {
        const s = Math.sin((Math.min(lead, 180) * Math.PI) / 180);
        cast.style.opacity = (s * 0.55).toFixed(3);
        cast.style.width = `${(6 + 22 * s).toFixed(1)}%`;
      }

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
            {/* 封面内页单独一层, 且必须排在所有书页之前。Chrome 在这个 3D 上下文里
                既不认 z-index 也没把子元素的深度算进排序, 只有 DOM 顺序稳; 内页留在
                封面里(DOM 最后)的话, 翻过去的书页全被它盖住, 翻页就只剩横向擦除。 */}
            <div aria-hidden className="gate-leaf gate-cover-verso">
              <div className="gate-face gate-back gate-cover-back">
                <Sigil />
              </div>
            </div>
            <div aria-hidden className="gate-cast" ref={castRef} />
            {LEAVES.map((leaf, index) => (
              <div className="gate-bleaf" data-testid={`book-page-${index + 1}`} key={index} style={{ transform: `translateZ(${leaf.z}px)` }}>
                {/* 纸张/水彩/墨线只在整页绘制一次；翻页片仅负责几何切片，避免每片叠加造成规则竖纹与发白。 */}
                <div aria-hidden className="gate-page-paper" />
                {privacy || !readyCovers[index] ? null : (
                  <div aria-hidden className="gate-page-art" data-baked={readyCovers[index]!.baked || undefined} style={pageImageStyle(readyCovers[index]!.uri)} />
                )}
                <div aria-hidden className="gate-segs"><Segs baked={readyCovers[index]?.baked} coverUri={privacy ? undefined : readyCovers[index]?.uri} /></div>
                <div aria-hidden className="gate-page-wash" />
                <div aria-hidden className="gate-page-grain" style={{ backgroundImage: `url(${JSON.stringify(paperGrainUri)})` }} />
                <div aria-hidden className="gate-page-edge" />
              </div>
            ))}
            <div className="gate-leaf gate-cover">
              <div className="gate-face gate-cover-front">
                <img alt="个人内容宇宙报告封面" draggable={false} src={coverUri} />
                <div className="gate-sheen" />
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
.gate-sealreal img { position: absolute; width: 1121.2%; height: 747.5%; left: -263.1%; top: -155.8%; max-width: none; user-select: none; -webkit-user-drag: none; }
.gate-burnable::before { content: ""; position: absolute; inset: 0; z-index: -2; pointer-events: none; opacity: .62; background: radial-gradient(circle at var(--glow-x) var(--glow-y), rgba(137,170,161,.1), transparent 34%), radial-gradient(circle at 50% 120%, rgba(218,168,92,.12), transparent 42%), linear-gradient(125deg, #050608 0%, #111316 48%, #080a0c 100%); }
.gate-burnable::after { content: ""; position: absolute; inset: 0; z-index: -1; pointer-events: none; opacity: .16; mix-blend-mode: screen; background-image: repeating-linear-gradient(0deg, rgba(255,255,255,.04) 0 1px, transparent 1px 4px), repeating-linear-gradient(90deg, rgba(0,0,0,.12) 0 1px, transparent 1px 5px); }
.gate-scene { --book-h: clamp(390px, 76dvh, 617px); --book-w: calc(var(--book-h) * .75); --tilt-x: 0deg; --tilt-y: 0deg; --lift: 0px; position: relative; width: min(94vw, calc(var(--book-w) + 80px)); height: calc(var(--book-h) + 80px); display: grid; place-items: center; perspective: 1150px; outline: none; cursor: pointer; transform: translateZ(var(--lift)) rotateX(var(--tilt-x)) rotateY(var(--tilt-y)); transform-style: preserve-3d; will-change: transform; }
.gate-scene:focus-visible { outline: 1px solid rgba(201,164,104,.72) !important; outline-offset: 10px !important; }
/* App.tsx 给 [role="button"] 挂了 !important 的青色 focus 环, 不压掉会在翻页全程留一个青框 */
.opening .gate-scene:focus-visible { outline: none !important; }
/* 翻页期间 --tilt-* 每帧在写, 再挂 .5s transform 过渡等于给相机加 500ms 迟滞 */
.opening .gate-scene { cursor: default; }
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
.gate-page-art { position: absolute; inset: 3.2% 3.8% 3.5% 3.2%; pointer-events: none;
  -webkit-mask-image: radial-gradient(ellipse at 50% 48%, #000 55%, rgba(0,0,0,.92) 67%, rgba(0,0,0,.48) 82%, transparent 100%);
  mask-image: radial-gradient(ellipse at 50% 48%, #000 55%, rgba(0,0,0,.92) 67%, rgba(0,0,0,.48) 82%, transparent 100%); }
.gate-page-art { z-index: 2; opacity: .92; filter: blur(0.3px) sepia(.16) saturate(1.02) contrast(1.16); }
.gate-segs { position: absolute; inset: 3.2% 3.8% 3.5% 3.2%; z-index: 4; opacity: 0; transform-style: preserve-3d; }
.gate-seg { position: absolute; top: 0; height: 100%; transform-origin: left center; transform-style: preserve-3d; backface-visibility: visible; }
.gate-seg-sheet, .gate-seg-cover, .gate-seg-paper { position: absolute; inset: 0; pointer-events: none; }
.gate-seg-sheet { z-index: 0; background:
  repeating-linear-gradient(0deg, rgba(255,250,235,.3) 0 1px, rgba(138,113,76,.06) 1px 2px, rgba(232,222,199,.34) 2px 4px),
  #EAE1CA; }
.gate-seg-cover { backface-visibility: hidden; z-index: 1; filter: blur(0.3px) sepia(.16) saturate(1.02) contrast(1.16); opacity: 0; transition: opacity .18s ease; }
/* 烤过的图已经含水彩与墨线，再套一次就是二次上色 */
.gate-page-art[data-baked], .gate-seg-cover[data-baked] { filter: none; }
.gate-seg-paper { z-index: 2; }
.gate-seg-edge { position: absolute; inset: 0; z-index: 3; pointer-events: none; background:
  linear-gradient(180deg, rgba(82,63,39,.24), rgba(82,63,39,0) 7%, rgba(82,63,39,0) 93%, rgba(82,63,39,.3)),
  repeating-linear-gradient(0deg, rgba(255,249,229,.06) 0 1px, transparent 1px 4px);
  mix-blend-mode: multiply; opacity: .7; }
.gate-page-paper { position: absolute; inset: 0; z-index: 0; pointer-events: none; background:
  linear-gradient(180deg, rgba(96,78,48,.06), rgba(96,78,48,0) 5%, rgba(96,78,48,0) 95%, rgba(96,78,48,.08)),
  radial-gradient(120% 100% at 40% 14%, rgba(255,250,236,.08), rgba(255,250,236,0) 55%),
  linear-gradient(105deg, #E6D8BE 0%, #DCC9A8 55%, #E6D7BC 100%);
  box-shadow: inset 0 0 0 1px rgba(90,76,54,.16), inset 16px 0 30px -20px rgba(56,42,24,.5), inset -6px 0 14px -12px rgba(56,42,24,.28); }
.gate-seg-shade { position: absolute; inset: 0; z-index: 3; pointer-events: none; }
.gate-cast { z-index: 25; position: absolute; left: 0; top: 2%; height: 96%; width: 7%; opacity: 0; pointer-events: none;
  transform: translateZ(.28px); border-radius: 2px 40% 40% 2px;
  background: linear-gradient(90deg, rgba(24,16,7,.62), rgba(24,16,7,.26) 42%, rgba(24,16,7,0)); filter: blur(3px); }
.gate-page-wash, .gate-page-grain, .gate-page-edge { position: absolute; inset: 0; pointer-events: none; }
.gate-page-wash { z-index: 10; background:
  radial-gradient(ellipse at 18% 16%, rgba(145,111,70,.16), transparent 38%),
  radial-gradient(ellipse at 80% 84%, rgba(121,92,58,.18), transparent 44%),
  linear-gradient(109deg, rgba(210,181,138,.2), transparent 32%, transparent 72%, rgba(155,121,78,.14));
  mix-blend-mode: multiply; opacity: .34; }
.gate-page-grain { z-index: 11; background-repeat: repeat; background-size: 256px 256px; mix-blend-mode: multiply; opacity: .16; }
.gate-page-edge { z-index: 12; clip-path: polygon(0.8% 2.8%, 12% 2.4%, 24% 2.9%, 36% 2.5%, 48% 3%, 60% 2.6%, 72% 3.1%, 84% 2.5%, 99.2% 2.9%, 99.2% 97.2%, 84% 97.6%, 72% 97.1%, 60% 97.5%, 48% 97%, 36% 97.4%, 24% 97.1%, 12% 97.6%, 0.8% 97.2%); background:
  linear-gradient(180deg, rgba(76,58,35,.32), rgba(76,58,35,0) 8%, rgba(76,58,35,0) 92%, rgba(76,58,35,.38)),
  linear-gradient(90deg, rgba(76,58,35,.2), rgba(76,58,35,0) 8%, rgba(76,58,35,0) 92%, rgba(76,58,35,.24)); mix-blend-mode: multiply; opacity: .46; }
.opening .gate-segs { opacity: 1; }
.opening .gate-page-paper, .opening .gate-page-art,
.opening .gate-page-wash, .opening .gate-page-edge { opacity: 0; transition: opacity .18s ease; }
.opening .gate-seg-cover { opacity: 1; }
.gate-face { position: absolute; inset: 0; backface-visibility: hidden; border-radius: 4px 6px 6px 4px; overflow: hidden; transform: translateZ(.2px); }
.gate-face.gate-back { transform: rotateY(180deg) translateZ(.2px); border-radius: 6px 4px 4px 6px; }
.gate-paper { background:
  linear-gradient(180deg, rgba(96,78,48,.06), rgba(96,78,48,0) 4%, rgba(96,78,48,0) 96%, rgba(96,78,48,.08)),
  repeating-linear-gradient(0deg, rgba(118,98,64,.026) 0 1px, rgba(255,255,255,0) 1px 3.6px),
  radial-gradient(120% 100% at 40% 14%, rgba(255,250,236,.07), rgba(255,250,236,0) 55%),
  radial-gradient(100% 90% at 82% 88%, rgba(120,96,60,.06), rgba(120,96,60,0) 60%),
  linear-gradient(105deg, #EFE8D6 0%, #E8E0CB 55%, #EFE7D5 100%);
  box-shadow: inset 0 0 0 1px rgba(90,76,54,.16), inset 16px 0 30px -20px rgba(56,42,24,.5), inset -6px 0 14px -12px rgba(56,42,24,.28); }
.gate-base { transform: none; z-index: 1; }
.gate-base::after { content: ""; position: absolute; right: 0; top: 1.4%; bottom: 1.2%; width: 7px; border-radius: 0 6px 6px 0; background:
  linear-gradient(180deg, rgba(80,64,40,.2), rgba(80,64,40,0) 9%, rgba(80,64,40,0) 91%, rgba(80,64,40,.24)),
  repeating-linear-gradient(90deg, #CBBFA3 0 1px, #E9E1CC 1px 2.2px, #DDD3BA 2.2px 3.4px); }
.gate-base::before { content: ""; position: absolute; left: 1%; right: 1px; bottom: 0; height: 6px; border-radius: 0 0 6px 4px; background:
  linear-gradient(90deg, rgba(80,64,40,.16), rgba(80,64,40,0) 10%, rgba(80,64,40,0) 88%, rgba(80,64,40,.2)),
  repeating-linear-gradient(0deg, #C7BB9F 0 1px, #E7DFC9 1px 2.1px, #DAD0B6 2.1px 3.2px); }
.gate-cover { transform: translateZ(1.6px); z-index: 30; }
.opening .gate-cover { animation: gateFlipCover 1.3s cubic-bezier(.7,.05,.28,1) .12s forwards; }
@keyframes gateFlipCover { to { transform: translateZ(1.6px) rotateY(-178.4deg); } }
/* 内页跟着封面同步转, 但坐在所有书页的深度之下(0.2 < 页叶的 0.35~1.35) */
/* Chrome 排序只看这一层自己的平面: 封面收在 178.4° 还留 1.6° 仰角, 平面远端会翘到 z≈+13,
   照样盖住页叶(平面 z 只有 0.35~1.35)。内页因此收到 179.4°(近似压平)并整体再沉 6px。 */
.gate-cover-verso { transform: translateZ(-6px); }
.opening .gate-cover-verso { animation: gateFlipVerso 1.3s cubic-bezier(.7,.05,.28,1) .12s forwards; }
@keyframes gateFlipVerso { to { transform: translateZ(-6px) rotateY(-179.4deg); } }
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
  .gate-scene { --book-h: min(72dvh, 560px, calc(92vw / .75)); width: min(98vw, calc(var(--book-w) + 44px)); height: calc(var(--book-h) + 54px); }
}
`;
