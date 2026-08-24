import React, {
  Children,
  cloneElement,
  forwardRef,
  isValidElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from "react";
import gsap from "gsap";

import { DESKTOP_FALL, createFallRng, seedFallBodies, stepFallBodies } from "./desktopFallPhysics";
import { DomeGallery, type DomeGalleryEntry } from "./DomeGallery";
import type { StoryContentItem } from "./storyModel";

export interface DesktopStoryStream {
  accent: string;
  count: number;
  key: string;
  label: string;
  records: StoryContentItem[];
  /** Display-ready top term of this list, e.g. "#模型"; null when unknown. */
  term: string | null;
}

interface DesktopCardSwapProps {
  active: boolean;
  appIcon: ReactNode;
  copy: string;
  eyebrow: string;
  onOpenApp: () => void;
  onOpenRecord: (item: StoryContentItem) => void;
  privacy: boolean;
  /** Days of the living report's recent window, used by the watch narrative title. */
  recentDays: number;
  reducedMotion: boolean;
  streams: DesktopStoryStream[];
  title: string;
  viewportHeight: number;
  viewportWidth: number;
  wallpaperUri: string;
}

export interface CardSwapController {
  bringToFront: (index: number) => void;
}

interface CardSwapProps {
  cardDistance?: number;
  children: ReactNode;
  controllerRef?: RefObject<CardSwapController | null>;
  easing?: "elastic" | "linear";
  height?: number | string;
  onCardClick?: (index: number) => void;
  onFrontChange?: (index: number) => void;
  skewAmount?: number;
  verticalDistance?: number;
  width?: number | string;
}

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  customClass?: string;
}

type DesktopIconKind = "doc" | "folder" | "thumb";

interface DesktopIconSpec {
  kind: DesktopIconKind;
  label: string;
  leftPct: number;
  topPct: number;
}

// 桌面零件布局按用户桌面截图排布（1280×800 基准换算成百分比）；
// 全部是独立渲染的装饰零件，不可交互，坠落时逐个释放
const DESKTOP_ICONS: readonly DesktopIconSpec[] = [
  { kind: "folder", label: "rider", leftPct: 61.02, topPct: 7.75 },
  { kind: "folder", label: "wuko-launch-studio", leftPct: 79.22, topPct: 5.0 },
  { kind: "folder", label: "日报", leftPct: 87.5, topPct: 5.25 },
  { kind: "folder", label: "wuko-launch-studio-fi…-shopify", leftPct: 36.25, topPct: 16.25 },
  { kind: "thumb", label: "截屏 2026-08-03 下午5.40.18", leftPct: 71.64, topPct: 15.63 },
  { kind: "folder", label: "报错", leftPct: 79.22, topPct: 15.5 },
  { kind: "folder", label: "wuko-launch-studio-main (1)", leftPct: 87.19, topPct: 15.0 },
  { kind: "folder", label: "wuko-launch-studio-s…y-button", leftPct: 53.44, topPct: 30.0 },
  { kind: "folder", label: "截图", leftPct: 71.8, topPct: 26.5 },
  { kind: "folder", label: "wuko-launch-studio-m2", leftPct: 87.19, topPct: 27.5 },
  { kind: "folder", label: "dy 2", leftPct: 53.44, topPct: 42.25 },
  { kind: "folder", label: "wuko-launch-studio-s…0-bridge", leftPct: 62.11, topPct: 42.5 },
  { kind: "doc", label: "DESIGN.md", leftPct: 71.8, topPct: 41.0 },
  { kind: "folder", label: "skill", leftPct: 53.44, topPct: 54.38 },
  { kind: "thumb", label: "Codex 图像 2026年8月12日", leftPct: 62.11, topPct: 53.5 },
  { kind: "folder", label: "md-files", leftPct: 87.66, topPct: 52.5 },
  { kind: "doc", label: "test_input.csv", leftPct: 62.81, topPct: 68.13 },
  { kind: "doc", label: "price_tracker.md", leftPct: 79.77, topPct: 67.25 },
];

const WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"] as const;

const DESKTOP_LABEL: React.CSSProperties = {
  maxWidth: 96,
  color: "#FFFFFF",
  fontSize: 10.5,
  lineHeight: 1.3,
  textAlign: "center",
  textShadow: "0 1px 4px rgba(0,0,0,0.78)",
  wordBreak: "break-all",
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

const MENU_ITEM: React.CSSProperties = { color: "#1D1D1F", fontSize: 12 };

const WIDGET_CARD: React.CSSProperties = {
  borderRadius: 17,
  boxShadow: "0 6px 20px rgba(10,20,30,0.22)",
  boxSizing: "border-box",
};

const DOCK_TILE: React.CSSProperties = {
  width: 42,
  height: 42,
  borderRadius: 10,
  display: "grid",
  placeItems: "center",
  flex: "0 0 auto",
  boxShadow: "0 2px 6px rgba(0,0,0,0.18)",
};

const CAL_CELL: React.CSSProperties = {
  width: 16,
  color: "#3A3A3C",
  fontSize: 9,
  lineHeight: 1.7,
  textAlign: "center",
  fontVariantNumeric: "tabular-nums",
};

function DesktopFolderGlyph() {
  return (
    <svg aria-hidden height={38} viewBox="0 0 46 38" width={46}>
      <path d="M2 7 a4 4 0 0 1 4 -4 h10.5 l4.5 4.5 h19 a4 4 0 0 1 4 4 v2 H2 Z" fill="#3E92E8" />
      <rect fill="#64B2F6" height={26} rx={4} width={42} x={2} y={9.5} />
      <rect fill="#78BEF9" height={5} rx={2.5} width={42} x={2} y={9.5} />
    </svg>
  );
}

function DesktopDocGlyph() {
  return (
    <svg aria-hidden height={40} style={{ margin: "0 0 -1px" }} viewBox="0 0 34 40" width={34}>
      <path d="M4 2 h18 l8 8 v28 h-26 Z" fill="#FBFBFD" stroke="#C9CDD4" strokeWidth={1} />
      <path d="M22 2 l8 8 h-8 Z" fill="#DDE1E7" />
      <path d="M9 17 h16 M9 22 h16 M9 27 h16 M9 32 h11" stroke="#AEB4BE" strokeLinecap="round" strokeWidth={1.6} />
    </svg>
  );
}

function DesktopThumbGlyph() {
  return (
    <svg aria-hidden height={34} style={{ margin: "3px 0" }} viewBox="0 0 46 34" width={46}>
      <rect fill="#B8C9D8" height={33} rx={3.5} stroke="rgba(255,255,255,0.85)" width={45} x={0.5} y={0.5} />
      <rect fill="#E8EDF2" height={7} rx={3.5} width={45} x={0.5} y={0.5} />
      <path d="M6 28 L15 17 L22 24 L29 14 L40 28 Z" fill="#7E97AB" />
    </svg>
  );
}

function DesktopMenuBar() {
  const now = new Date();
  const hours = now.getHours();
  const dateLabel = `${now.getMonth() + 1}月${now.getDate()}日 ${WEEKDAY_LABELS[now.getDay()]}`;
  const timeLabel = `${hours < 12 ? "上午" : "下午"}${hours % 12 === 0 ? 12 : hours % 12}:${String(now.getMinutes()).padStart(2, "0")}`;
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 30,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 14px",
        background: "rgba(242,245,249,0.62)",
        backdropFilter: "blur(16px) saturate(1.5)",
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <svg aria-hidden height={15} viewBox="0 0 13 15" width={13}>
          <path d="M8.4 2.4C8.9 1.8 9.3 0.9 9.2 0 C8.4 0.1 7.5 0.6 7 1.2 C6.5 1.8 6.1 2.7 6.2 3.5 C7.1 3.5 7.9 3 8.4 2.4 Z M10.7 7.9 C10.7 6.5 11.4 5.4 12.5 4.7 C11.8 3.8 10.8 3.2 9.6 3.2 C8.4 3.1 7.4 3.9 6.8 3.9 C6.2 3.9 5.2 3.2 4.2 3.2 C2.4 3.3 0.7 4.9 0.7 7.4 C0.7 8.9 1.2 10.4 1.9 11.4 C2.6 12.3 3.3 13.3 4.3 13.2 C5.2 13.2 5.6 12.6 6.8 12.6 C7.9 12.6 8.3 13.2 9.3 13.2 C10.3 13.2 11 12.3 11.6 11.4 C12 10.8 12.3 10.1 12.5 9.4 C11.4 9 10.7 8.5 10.7 7.9 Z" fill="#1D1D1F" />
        </svg>
        <strong style={{ ...MENU_ITEM, fontWeight: 700 }}>ChatGPT</strong>
        <span style={MENU_ITEM}>文件</span>
        <span style={MENU_ITEM}>编辑</span>
        <span style={MENU_ITEM}>视图</span>
        <span style={MENU_ITEM}>窗口</span>
        <span style={MENU_ITEM}>帮助</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
        <span style={MENU_ITEM}>317字</span>
        <span style={{ display: "grid", placeItems: "center", width: 15, height: 15, border: "1.3px solid #1D1D1F", borderRadius: 3, color: "#1D1D1F", fontSize: 9, fontWeight: 600 }}>中</span>
        <svg aria-hidden height={12} viewBox="0 0 16 12" width={16}>
          <path d="M8 11 C8.7 11 9.3 10.4 9.3 9.7 C9.3 9 8.7 8.4 8 8.4 C7.3 8.4 6.7 9 6.7 9.7 C6.7 10.4 7.3 11 8 11 Z" fill="#1D1D1F" />
          <path d="M4.6 7.2 C5.5 6.4 6.7 5.9 8 5.9 C9.3 5.9 10.5 6.4 11.4 7.2" fill="none" stroke="#1D1D1F" strokeLinecap="round" strokeWidth={1.4} />
          <path d="M2.2 4.7 C3.7 3.3 5.7 2.4 8 2.4 C10.3 2.4 12.3 3.3 13.8 4.7" fill="none" stroke="#1D1D1F" strokeLinecap="round" strokeWidth={1.4} />
        </svg>
        <svg aria-hidden height={10} viewBox="0 0 20 10" width={20}>
          <rect fill="none" height={8.6} opacity={0.55} rx={2.4} stroke="#1D1D1F" strokeWidth={1.1} width={15.6} x={0.7} y={0.7} />
          <rect fill="#1D1D1F" height={5.6} rx={1.2} width={10} x={2.2} y={2.2} />
          <path d="M18 3.4 V6.6" opacity={0.55} stroke="#1D1D1F" strokeLinecap="round" strokeWidth={1.6} />
        </svg>
        <svg aria-hidden height={13} viewBox="0 0 13 13" width={13}>
          <circle cx={5.5} cy={5.5} fill="none" r={4} stroke="#1D1D1F" strokeWidth={1.5} />
          <path d="M8.6 8.6 L12 12" stroke="#1D1D1F" strokeLinecap="round" strokeWidth={1.5} />
        </svg>
        <span style={MENU_ITEM}>{dateLabel}</span>
        <span style={MENU_ITEM}>{timeLabel}</span>
      </div>
    </div>
  );
}

function desktopCalendarRows(now: Date): string[][] {
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).getDay();
  const dayCount = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const rows: string[][] = [];
  let row: string[] = Array.from({ length: firstDay }, () => "");
  for (let day = 1; day <= dayCount; day += 1) {
    row.push(String(day));
    if (row.length === 7) {
      rows.push(row);
      row = [];
    }
  }
  if (row.length) rows.push([...row, ...Array.from({ length: 7 - row.length }, () => "")]);
  return rows;
}

function DesktopCalendarWidget() {
  const now = new Date();
  const today = String(now.getDate());
  return (
    <div style={{ ...WIDGET_CARD, width: 150, height: 148, padding: "10px 13px", background: "rgba(252,252,253,0.92)" }}>
      <div style={{ marginBottom: 3 }}>
        <strong style={{ color: "#FF453A", fontSize: 12 }}>{now.getMonth() + 1}月</strong>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        {["日", "一", "二", "三", "四", "五", "六"].map((weekday) => (
          <span key={weekday} style={{ ...CAL_CELL, color: "#8A8A8E", fontSize: 7.5 }}>{weekday}</span>
        ))}
      </div>
      {desktopCalendarRows(now).map((row, rowIndex) => (
        <div key={rowIndex} style={{ display: "flex", justifyContent: "space-between" }}>
          {row.map((day, dayIndex) => (
            <span
              key={dayIndex}
              style={day && day === today
                ? { ...CAL_CELL, borderRadius: "50%", background: "#FF453A", color: "#FFFFFF", fontWeight: 700 }
                : CAL_CELL}
            >
              {day}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function DesktopWeatherWidget() {
  return (
    <div style={{ ...WIDGET_CARD, width: 150, height: 148, padding: "12px 14px", background: "rgba(27,30,37,0.9)", color: "#FFFFFF" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600 }}>
        郫都区
        <svg aria-hidden height={8} viewBox="0 0 8 8" width={8}>
          <path d="M0.8 4.2 L7 0.8 L4.4 7.2 L3.4 4.6 Z" fill="#FFFFFF" />
        </svg>
      </div>
      <div style={{ marginTop: 2, fontSize: 34, fontWeight: 400, letterSpacing: "-0.02em" }}>27°</div>
      <svg aria-hidden height={12} style={{ marginTop: 2 }} viewBox="0 0 17 12" width={17}>
        <path d="M4.5 11 C2.5 11 1 9.6 1 7.9 C1 6.3 2.2 5.1 3.8 4.9 C4.3 2.7 6.2 1 8.5 1 C10.9 1 12.9 2.8 13.2 5.1 C14.8 5.2 16 6.4 16 7.9 C16 9.6 14.6 11 12.8 11 Z" fill="#EDEFF4" />
      </svg>
      <div style={{ marginTop: 3, fontSize: 10, color: "rgba(255,255,255,0.92)" }}>多云</div>
      <div style={{ marginTop: 7, fontSize: 9.5, color: "rgba(255,255,255,0.7)" }}>最高32° 最低25°</div>
    </div>
  );
}

function DesktopPhotosWidget() {
  return (
    <div style={{ ...WIDGET_CARD, width: 316, height: 128, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, background: "rgba(250,250,252,0.94)" }}>
      <svg aria-hidden height={42} viewBox="0 0 42 42" width={42}>
        <ellipse cx={21} cy={10.5} fill="#F5504E" opacity={0.85} rx={5.4} ry={9} />
        <ellipse cx={21} cy={10.5} fill="#F7A34C" opacity={0.85} rx={5.4} ry={9} transform="rotate(60 21 21)" />
        <ellipse cx={21} cy={10.5} fill="#F7D44C" opacity={0.85} rx={5.4} ry={9} transform="rotate(120 21 21)" />
        <ellipse cx={21} cy={10.5} fill="#6BC96B" opacity={0.85} rx={5.4} ry={9} transform="rotate(180 21 21)" />
        <ellipse cx={21} cy={10.5} fill="#4C9AF7" opacity={0.85} rx={5.4} ry={9} transform="rotate(240 21 21)" />
        <ellipse cx={21} cy={10.5} fill="#A05CF0" opacity={0.85} rx={5.4} ry={9} transform="rotate(300 21 21)" />
      </svg>
      <span style={{ color: "#6E6E73", fontSize: 10.5 }}>处理完成后，照片将在此处显示</span>
    </div>
  );
}

function DesktopDock() {
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        bottom: 10,
        transform: "translateX(-50%)",
        width: 840,
        height: 58,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        padding: "0 14px",
        border: "1px solid rgba(255,255,255,0.4)",
        borderRadius: 18,
        background: "rgba(244,246,250,0.36)",
        backdropFilter: "blur(18px) saturate(1.6)",
        boxSizing: "border-box",
      }}
    >
      <span style={{ ...DOCK_TILE, background: "linear-gradient(180deg, #FFFFFF, #DCE9F5)" }}>
        <svg aria-hidden height={27} viewBox="0 0 27 27" width={27}>
          <path d="M13.5 1 C6.6 1 1 6.6 1 13.5 C1 20.4 6.6 26 13.5 26 L13.5 1 Z" fill="#FFFFFF" />
          <path d="M13.5 1 C20.4 1 26 6.6 26 13.5 C26 20.4 20.4 26 13.5 26 L13.5 1 Z" fill="#4AB8F0" />
          <path d="M8 10.5 V13 M19 10.5 V13" stroke="#1B7FD4" strokeLinecap="round" strokeWidth={1.7} />
          <path d="M7.5 17.5 C11 20.5 16 20.5 19.5 17.5" fill="none" stroke="#1B7FD4" strokeLinecap="round" strokeWidth={1.7} />
        </svg>
      </span>
      <span style={{ ...DOCK_TILE, background: "#16233A" }}>
        <svg aria-hidden height={24} viewBox="0 0 24 24" width={24}>
          <path d="M3 15 C6 9 10 6 12 6 C14 6 18 9 21 15 C18 13.4 15 12.6 12 12.6 C9 12.6 6 13.4 3 15 Z" fill="#EAF2FB" />
          <path d="M5 18.5 C7.5 17 9.7 16.2 12 16.2 C14.3 16.2 16.5 17 19 18.5" fill="none" stroke="#9FC2E8" strokeLinecap="round" strokeWidth={1.6} />
        </svg>
      </span>
      <span style={{ ...DOCK_TILE, background: "#E2714D" }}>
        <svg aria-hidden height={24} viewBox="0 0 24 24" width={24}>
          <g stroke="#FFF4EC" strokeLinecap="round" strokeWidth={2.3}>
            <path d="M12 3.5 V20.5" />
            <path d="M3.5 12 H20.5" />
            <path d="M6 6 L18 18" />
            <path d="M18 6 L6 18" />
          </g>
        </svg>
      </span>
      <span style={{ ...DOCK_TILE, background: "#FFFFFF", border: "1px solid #E3E5EA" }}>
        <svg aria-hidden height={25} viewBox="0 0 25 25" width={25}>
          <g fill="none" stroke="#202123" strokeLinecap="round" strokeWidth={2}>
            <path d="M12.5 4 A8.5 8.5 0 0 1 20.6 9.9" />
            <path d="M21 12.5 A8.5 8.5 0 0 1 16.7 19.9" />
            <path d="M14 21.4 A8.5 8.5 0 0 1 5.6 18.4" />
            <path d="M4 12.5 A8.5 8.5 0 0 1 8.3 5.1" />
          </g>
          <circle cx={12.5} cy={12.5} fill="none" r={3.2} stroke="#202123" strokeWidth={2} />
        </svg>
      </span>
      <span style={{ ...DOCK_TILE, background: "linear-gradient(160deg, #9A6BF5, #5B34C9)" }}>
        <svg aria-hidden height={24} viewBox="0 0 22 24" width={22}>
          <path d="M11 1.5 L18.5 8 L15.5 22.5 L6.5 22.5 L3.5 8 Z" fill="#EEE6FF" />
          <path d="M11 1.5 L11 22.5 L6.5 22.5 L3.5 8 Z" fill="#D9C8FF" />
        </svg>
      </span>
      <span style={{ ...DOCK_TILE, background: "#FFFFFF", border: "1px solid #E3E5EA", position: "relative" }}>
        <svg aria-hidden height={24} viewBox="0 0 25 24" width={25}>
          <path d="M10 3 C5 3 1.5 6.3 1.5 10.3 C1.5 12.6 2.7 14.6 4.6 15.9 L3.9 18.4 L6.8 16.9 C7.8 17.2 8.9 17.4 10 17.4 C15 17.4 18.5 14.3 18.5 10.3 C18.5 6.3 15 3 10 3 Z" fill="#2E7CF6" />
          <path d="M16.5 9 C20 9.4 23.5 11.7 23.5 14.9 C23.5 16.7 22.5 18.2 21 19.2 L21.5 21.2 L19.2 20 C18.4 20.2 17.5 20.4 16.6 20.4 C13.5 20.4 10.9 18.9 9.9 16.8" fill="#4FD165" />
        </svg>
        <span style={{ position: "absolute", top: -4, right: -4, display: "grid", placeItems: "center", width: 15, height: 15, borderRadius: "50%", background: "#FF3B30", color: "#FFFFFF", fontSize: 9, fontWeight: 700 }}>1</span>
      </span>
      <span style={{ ...DOCK_TILE, background: "#F78B1F" }}>
        <svg aria-hidden height={23} viewBox="0 0 23 23" width={23}>
          <circle cx={11.5} cy={11.5} fill="none" r={8.5} stroke="#FFFFFF" strokeDasharray="40 14" strokeDashoffset={-20} strokeLinecap="round" strokeWidth={3} />
          <path d="M11.5 11 V19" stroke="#FFFFFF" strokeLinecap="round" strokeWidth={3} />
        </svg>
      </span>
      <span style={{ ...DOCK_TILE, background: "#1A1D23", border: "1px solid rgba(255,255,255,0.18)" }}>
        <svg aria-hidden height={22} viewBox="0 0 22 22" width={22}>
          <path d="M4 5 L10 11 L4 17" fill="none" stroke="#EDEFF4" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} />
          <path d="M12 17 H18" stroke="#EDEFF4" strokeLinecap="round" strokeWidth={2.2} />
        </svg>
      </span>
      <span style={{ width: 1, height: 36, background: "rgba(20,30,40,0.22)" }} />
      <span style={{ ...DOCK_TILE, background: "#1273C8" }}>
        <svg aria-hidden height={24} viewBox="0 0 24 24" width={24}>
          <path d="M17 2 L21 4 V20 L17 22 L6 13.5 L3 15.8 L1.8 14.8 V9.2 L3 8.2 L6 10.5 Z M17 7.5 L10 12 L17 16.5 Z" fill="#FFFFFF" />
        </svg>
      </span>
      <span style={{ ...DOCK_TILE, background: "linear-gradient(180deg, #E4E6EA, #B9BEC7)" }}>
        <svg aria-hidden height={26} viewBox="0 0 26 26" width={26}>
          <g stroke="#5A6069" strokeLinecap="round" strokeWidth={2.4}>
            <path d="M13 2.5 V6" />
            <path d="M13 20 V23.5" />
            <path d="M2.5 13 H6" />
            <path d="M20 13 H23.5" />
            <path d="M5.6 5.6 L8 8" />
            <path d="M18 18 L20.4 20.4" />
            <path d="M20.4 5.6 L18 8" />
            <path d="M8 18 L5.6 20.4" />
          </g>
          <circle cx={13} cy={13} fill="none" r={5} stroke="#5A6069" strokeWidth={2.6} />
        </svg>
      </span>
      <span style={{ ...DOCK_TILE, background: "rgba(255,255,255,0.62)", border: "1px solid rgba(255,255,255,0.7)" }}>
        <svg aria-hidden height={24} viewBox="0 0 22 24" width={22}>
          <path d="M4 7 L5.5 22 H16.5 L18 7" fill="none" stroke="#6E747E" strokeLinejoin="round" strokeWidth={1.8} />
          <path d="M2.5 5 H19.5" stroke="#6E747E" strokeLinecap="round" strokeWidth={1.8} />
          <path d="M8 3 H14" stroke="#6E747E" strokeLinecap="round" strokeWidth={1.8} />
          <path d="M8 10 L8.6 18.5 M11 10 V18.5 M14 10 L13.4 18.5" stroke="#9CA2AB" strokeLinecap="round" strokeWidth={1.4} />
        </svg>
      </span>
    </div>
  );
}

const CSS = [
  ".desktop-card-swap-root * { box-sizing: border-box; }",
  ".desktop-app-button:focus-visible { outline: 3px solid #25F4EE; outline-offset: 4px; }",
  // 宽屏沿用户标注向左上出血；窄屏仍使用 925px 宽度。
  ".desktop-card-swap-root .card-swap-container { position: absolute; bottom: 0; right: 0; transform: translate(-1%, 4%); transform-origin: bottom right; perspective: 1665px; overflow: visible; }",
  ".desktop-card-swap-root .card { position: absolute; top: 50%; left: 50%; border-radius: 20px; border: 1px solid #fff; background: #000; transform-style: preserve-3d; will-change: transform; backface-visibility: hidden; -webkit-backface-visibility: hidden; }",
  "@media (max-width: 768px) {",
  "  .desktop-card-swap-root .card-swap-container { transform: scale(.75) translate(25%, 25%); }",
  "}",
  "@media (max-width: 480px) {",
  "  .desktop-card-swap-root .card-swap-container { transform: scale(.55) translate(25%, 25%); }",
  "}",
  // 图标入场（方案B 重力坠入）：从屏顶坠到中心，落点微压缩 + 一次小回弹，标签随后浮起
  ".desktop-app-button .desktop-app-drop { display: block; transform-origin: center bottom; }",
  ".desktop-app-button.desktop-app-enter .desktop-app-drop { animation: desktopAppDrop 0.98s both; }",
  ".desktop-app-button.desktop-app-enter .desktop-app-label { animation: desktopAppLabelUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.9s both; }",
  ".desktop-app-button.desktop-app-enter .desktop-app-label-2 { animation-delay: 1.02s; }",
  "@keyframes desktopAppDrop {",
  "  0% { transform: translateY(-72vh); animation-timing-function: cubic-bezier(0.4, 0, 0.85, 0.4); }",
  "  56% { transform: translateY(0) scale(1, 1); animation-timing-function: ease-out; }",
  "  63% { transform: translateY(0) scale(1.05, 0.94); animation-timing-function: ease-out; }",
  "  77% { transform: translateY(-15px) scale(0.995, 1.005); animation-timing-function: ease-in; }",
  "  88% { transform: translateY(0) scale(1.012, 0.99); animation-timing-function: ease-out; }",
  "  100% { transform: translateY(0) scale(1); }",
  "}",
  "@keyframes desktopAppLabelUp {",
  "  0% { opacity: 0; transform: translateY(8px); }",
  "  100% { opacity: 1; transform: translateY(0); }",
  "}",
  "@media (prefers-reduced-motion: reduce) {",
  "  .desktop-app-drop, .desktop-app-label { animation: none !important; }",
  "}",
].join("\n");

export const Card = forwardRef<HTMLDivElement, CardProps>(({ customClass, ...rest }, ref) => (
  <div ref={ref} {...rest} className={`card ${customClass ?? ""} ${rest.className ?? ""}`.trim()} />
));
Card.displayName = "Card";

type CardRef = RefObject<HTMLDivElement | null>;
interface Slot {
  x: number;
  y: number;
  z: number;
  zIndex: number;
}

export const makeSlot = (index: number, distanceX: number, distanceY: number, total: number): Slot => ({
  x: index * distanceX,
  y: -index * distanceY,
  z: -index * distanceX * 1.5,
  zIndex: total - index,
});

const placeNow = (element: HTMLElement, slot: Slot, skew: number) => gsap.set(element, {
  x: slot.x,
  y: slot.y,
  z: slot.z,
  xPercent: -50,
  yPercent: -50,
  skewY: skew,
  transformOrigin: "center center",
  zIndex: slot.zIndex,
  force3D: true,
});

// ReactBits Card Swap source and defaults:
// https://reactbits.dev/components/card-swap
function CardSwap({
  width = 500,
  height = 400,
  cardDistance = 60,
  verticalDistance = 70,
  controllerRef,
  onCardClick,
  onFrontChange,
  skewAmount = 6,
  easing = "elastic",
  children,
}: CardSwapProps) {
  const config = easing === "elastic"
    ? {
        ease: "elastic.out(0.6,0.9)",
        durDrop: 2,
        durMove: 2,
        durReturn: 2,
        promoteOverlap: 0.9,
        returnDelay: 0.05,
      }
    : {
        ease: "power1.inOut",
        durDrop: 0.8,
        durMove: 0.8,
        durReturn: 0.8,
        promoteOverlap: 0.45,
        returnDelay: 0.2,
      };
  const childArr = useMemo(
    () => Children.toArray(children) as ReactElement<CardProps>[],
    [children],
  );
  const refs = useMemo<CardRef[]>(
    () => childArr.map(() => React.createRef<HTMLDivElement>()),
    [childArr.length],
  );
  const order = useRef<number[]>(Array.from({ length: childArr.length }, (_, index) => index));
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const chainTimeoutRef = useRef<number>(0);
  const container = useRef<HTMLDivElement>(null);
  const onFrontChangeRef = useRef(onFrontChange);
  onFrontChangeRef.current = onFrontChange;
  const dropDistance = typeof height === "number" ? height * 1.25 : 500;

  useEffect(() => {
    const total = refs.length;
    refs.forEach((itemRef, index) => placeNow(
      itemRef.current!,
      makeSlot(index, cardDistance, verticalDistance, total),
      skewAmount,
    ));

    const swap = () => {
      const [front, ...rest] = order.current;
      if (front === undefined || order.current.length < 2) return;
      // 点击驱动下相邻 swap 会重叠：先杀上一条 timeline，避免它迟到的
      // 位置补间和 zIndex 设定在新 timeline 结束后把卡拖回旧槽位
      tlRef.current?.kill();
      order.current = [...rest, front];
      onFrontChangeRef.current?.(rest[0]!);
      const frontElement = refs[front]!.current!;
      const timeline = gsap.timeline();
      tlRef.current = timeline;

      timeline.to(frontElement, {
        y: "+=" + dropDistance,
        duration: config.durDrop,
        ease: config.ease,
        overwrite: "auto",
      });
      timeline.addLabel("promote", "-=" + config.durDrop * config.promoteOverlap);
      rest.forEach((index, position) => {
        const element = refs[index]!.current!;
        const slot = makeSlot(position, cardDistance, verticalDistance, refs.length);
        timeline.set(element, { zIndex: slot.zIndex }, "promote");
        timeline.to(element, {
          x: slot.x,
          y: slot.y,
          z: slot.z,
          duration: config.durMove,
          ease: config.ease,
          overwrite: "auto",
        }, "promote+=" + position * 0.15);
      });
      const backSlot = makeSlot(refs.length - 1, cardDistance, verticalDistance, refs.length);
      timeline.addLabel("return", "promote+=" + config.durMove * config.returnDelay);
      timeline.call(() => {
        gsap.set(frontElement, { zIndex: backSlot.zIndex });
      }, undefined, "return");
      timeline.to(frontElement, {
        x: backSlot.x,
        y: backSlot.y,
        z: backSlot.z,
        duration: config.durReturn,
        ease: config.ease,
        overwrite: "auto",
      }, "return");
    };

    // 无自动轮换：只有点击卡片上边栏才切换；点第三张会连续换到最前
    const bringToFront = (childIndex: number) => {
      const position = order.current.indexOf(childIndex);
      if (position < 0) return;
      window.clearTimeout(chainTimeoutRef.current);
      swap();
      if (position === 2) chainTimeoutRef.current = window.setTimeout(swap, 650);
    };
    if (controllerRef) controllerRef.current = { bringToFront };

    return () => {
      if (controllerRef) controllerRef.current = null;
      window.clearTimeout(chainTimeoutRef.current);
      tlRef.current?.kill();
    };
  }, [cardDistance, verticalDistance, skewAmount, easing, dropDistance]);

  const rendered = childArr.map((child, index) => isValidElement<CardProps>(child)
    ? cloneElement(child, {
        key: index,
        ref: refs[index],
        style: { width, height, ...(child.props.style ?? {}) },
        onClick: (event: React.MouseEvent<HTMLDivElement>) => {
          child.props.onClick?.(event);
          onCardClick?.(index);
        },
      } as CardProps & React.RefAttributes<HTMLDivElement>)
    : child);

  return (
    <div
      ref={container}
      aria-label="全部内容封面卡片"
      className="card-swap-container"
      style={{ width, height }}
    >
      {rendered}
    </div>
  );
}

function ContentPage({
  description,
  entries,
  galleryInteractive = true,
  onSelect,
  privacy,
  reducedMotion,
  selectedEntry,
  stream,
}: {
  description?: ReactNode;
  entries: readonly DomeGalleryEntry[];
  galleryInteractive?: boolean;
  onSelect: (entry: DomeGalleryEntry) => void;
  privacy: boolean;
  reducedMotion: boolean;
  selectedEntry: DomeGalleryEntry | null;
  stream: DesktopStoryStream;
}) {
  return (
    <div
      aria-label={stream.label + "，" + stream.count.toLocaleString("zh-CN") + " 个视频"}
      role="group"
      style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}
    >
      <header
        aria-label={`${stream.label}，${stream.count.toLocaleString("zh-CN")} 个视频`}
        style={{
          height: 72,
          flex: "0 0 72px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 22px",
          borderTop: "4px solid " + stream.accent,
          borderBottom: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(12,14,18,0.94)",
        }}
      >
        <div style={{ minWidth: 0, display: "flex", alignItems: "baseline", gap: 12 }}>
          <strong style={{ flex: "0 0 auto", color: "#F4F6FA", fontSize: 20 }}>{stream.label}</strong>
          <span style={{ flex: "0 0 auto", color: "rgba(244,246,250,0.5)", fontSize: 11 }}>视频封面</span>
          {description ? (
            <p
              style={{
                minWidth: 0,
                margin: 0,
                overflow: "hidden",
                color: "rgba(244,246,250,0.66)",
                fontSize: 13,
                lineHeight: 1.5,
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
              }}
            >
              {description}
            </p>
          ) : null}
        </div>
        <strong
          style={{
            flex: "0 0 auto",
            color: "#F4F6FA",
            fontSize: 25,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {stream.count.toLocaleString("zh-CN")}
        </strong>
      </header>
      <div
        style={{ flex: 1, minHeight: 0, position: "relative", background: "#120F17" }}
      >
        <DomeGallery
          accent={stream.accent}
          entries={entries}
          grayscale={false}
          interactive={galleryInteractive}
          onSelect={onSelect}
          privacy={privacy}
          reducedMotion={reducedMotion}
          selectedEntryId={selectedEntry?.id ?? null}
        />
      </div>
    </div>
  );
}

const STREAM_TITLE_FALLBACKS: Record<string, string> = {
  favorite_videos: "你最近在留住什么？",
  liked_videos: "你最近在偏爱什么？",
};

// 叙事行：主标题 = 词条 + 描述，词条用该卡强调色；无词条或隐私模式退回通用标题
function narrativeTitle(
  stream: DesktopStoryStream,
  privacy: boolean,
  recentDays: number,
  watchFallback: string,
): ReactNode {
  const term = privacy ? null : stream.term;
  if (!term) return STREAM_TITLE_FALLBACKS[stream.key] ?? watchFallback;
  const accentTerm = <span style={{ color: stream.accent }}>{term}</span>;
  if (stream.key === "liked_videos") return <>心动的时刻，<br />多半有 {accentTerm}</>;
  if (stream.key === "favorite_videos") return <>怕忘掉的，<br />是 {accentTerm}</>;
  return <>这 {recentDays} 天，{accentTerm}<br />一直在你眼前</>;
}

function narrativeDescription(stream: DesktopStoryStream, privacy: boolean): ReactNode {
  const count = stream.count.toLocaleString("zh-CN");
  const term = privacy ? null : stream.term;
  const strongStyle: React.CSSProperties = { color: stream.accent, fontWeight: 800 };
  if (stream.key === "liked_videos") {
    return <><strong style={strongStyle}>{count} 条喜欢</strong>是你最用力的靠近，每一次点亮都记在这份清单里。</>;
  }
  if (stream.key === "favorite_videos") {
    return <><strong style={strongStyle}>{count} 个收藏</strong>安静地留在列表里，每一条都是你打算再回来看一眼的内容。</>;
  }
  return <><strong style={strongStyle}>{count} 个视频</strong>进入过你的视野{term ? <>，{term} 是你最常靠近的内容线索</> : null}。</>;
}

export function buildDomeGalleryEntries(streams: readonly DesktopStoryStream[]): DomeGalleryEntry[] {
  return streams.flatMap((stream) => stream.records.map((item, index) => ({
    accent: stream.accent,
    id: `${stream.key}:${item.key}:${index}`,
    item,
    sourceKey: stream.key,
    sourceLabel: stream.label,
  })));
}

export function DesktopCardSwap({
  active,
  appIcon,
  copy,
  eyebrow,
  onOpenApp,
  onOpenRecord,
  privacy,
  recentDays,
  reducedMotion,
  streams,
  title,
  viewportHeight,
  viewportWidth,
  wallpaperUri,
}: DesktopCardSwapProps) {
  const [opened, setOpened] = useState(false);
  const [ready, setReady] = useState(false);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const galleryEntries = useMemo(() => buildDomeGalleryEntries(streams), [streams]);
  const selectedEntry = galleryEntries.find((entry) => entry.id === selectedEntryId) ?? galleryEntries[0] ?? null;
  const selectedStream = streams.find((stream) => stream.key === selectedEntry?.sourceKey) ?? streams[0] ?? null;
  const selectEntry = useCallback((entry: DomeGalleryEntry) => {
    if (selectedEntryId === entry.id) {
      onOpenRecord(entry.item);
      return;
    }
    setSelectedEntryId(entry.id);
  }, [onOpenRecord, selectedEntryId]);
  // 卡片组按 1600×900 设计稿等比缩放到当前视口
  const stageScale = Math.min(1.15, Math.max(0.55, Math.min(viewportWidth / 1600, viewportHeight / 900)));
  const rootRef = useRef<HTMLDivElement | null>(null);
  const desktopRef = useRef<HTMLDivElement | null>(null);
  const fallerRefs = useRef<Array<HTMLElement | null>>([]);
  const appRef = useRef<HTMLButtonElement | null>(null);
  const reportRef = useRef<HTMLDivElement | null>(null);
  const openedRef = useRef(false);
  const flierCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => () => {
    flierCleanupRef.current?.();
  }, []);

  useEffect(() => {
    if (!active || !rootRef.current || !desktopRef.current || !appRef.current || !reportRef.current) {
      return undefined;
    }
    if (openedRef.current) {
      gsap.set(desktopRef.current, { autoAlpha: 0 });
      gsap.set(reportRef.current, { autoAlpha: 1, scale: 1 });
      return undefined;
    }
    setReady(false);
    const fallers = fallerRefs.current.filter((node): node is HTMLElement => Boolean(node));
    gsap.set(desktopRef.current, { autoAlpha: 1, scale: 1 });
    gsap.set(reportRef.current, { autoAlpha: 0, scale: 0.985 });
    gsap.set(appRef.current, { autoAlpha: 0 });
    appRef.current.classList.remove("desktop-app-enter");
    fallers.forEach((node) => {
      node.style.transform = "";
      node.style.visibility = "";
    });

    if (reducedMotion) {
      fallers.forEach((node) => {
        node.style.visibility = "hidden";
      });
      gsap.set(appRef.current, { autoAlpha: 1 });
      setReady(true);
      return undefined;
    }

    const bodies = seedFallBodies(
      fallers.map((node) => ({ width: node.offsetWidth, height: node.offsetHeight })),
      createFallRng(0x08_23),
    );
    const exitY = Math.max(760, viewportHeight);
    let elapsed = 0;
    let last = performance.now();
    let frame = 0;
    let iconStarted = false;
    let readyCall: gsap.core.Tween | null = null;
    const tick = (now: number) => {
      const dt = Math.min(DESKTOP_FALL.maxStep, (now - last) / 1000);
      last = now;
      elapsed += dt;
      const allDone = stepFallBodies(bodies, dt, elapsed, exitY);
      bodies.forEach((body, index) => {
        const node = fallers[index]!;
        if (body.done) {
          node.style.visibility = "hidden";
          return;
        }
        if (elapsed >= body.releaseAt) {
          node.style.transform = `translate3d(${body.x.toFixed(1)}px, ${body.y.toFixed(1)}px, 0) rotate(${body.angle.toFixed(3)}rad)`;
        }
      });
      if (!iconStarted && elapsed >= DESKTOP_FALL.iconEnterAt) {
        // 图标入场（方案B）：沿同一重力世界从屏顶坠入，动画在 CSS 里
        iconStarted = true;
        appRef.current?.classList.add("desktop-app-enter");
        gsap.set(appRef.current, { autoAlpha: 1 });
        readyCall = gsap.delayedCall(DESKTOP_FALL.iconEnterDuration, () => setReady(true));
      }
      if (!allDone || !iconStarted) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      readyCall?.kill();
      appRef.current?.classList.remove("desktop-app-enter");
    };
  }, [active, reducedMotion, viewportHeight]);

  // 点击图标时，logo 光标"攒着"的封面从点击点撒出，飞进最前卡片的封面格落位——
  // 光标变回普通箭头的瞬间和下一页内容通过封面接上因果。
  // 球面封面先按屏幕投影取样，再换回卡片坐标；卡片入场轮换时落点仍跟着卡片走。
  const spawnCoverFliers = useCallback((clientX: number, clientY: number) => {
    const root = rootRef.current;
    if (!root) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const cards = Array.from(root.querySelectorAll<HTMLElement>(".card"));
        if (!cards.length) return;
        const containers: HTMLElement[] = [];
        const timeline = gsap.timeline({
          onComplete: () => {
            containers.forEach((node) => node.remove());
            flierCleanupRef.current = null;
          },
        });
        let spawned = 0;
        const card = cards[0]!;
        const cardRect = card.getBoundingClientRect();
        const tiles = Array.from(card.querySelectorAll<HTMLElement>(".story-dome-media"))
          .map((tile) => ({ tile, rect: tile.getBoundingClientRect() }))
          .filter(({ rect }) => rect.width > 10 && rect.height > 10
            && rect.right > cardRect.left && rect.left < cardRect.right
            && rect.bottom > cardRect.top && rect.top < cardRect.bottom)
          .sort((left, right) => {
            const centerX = cardRect.left + cardRect.width / 2;
            const centerY = cardRect.top + cardRect.height / 2;
            const leftDistance = Math.hypot(left.rect.left + left.rect.width / 2 - centerX, left.rect.top + left.rect.height / 2 - centerY);
            const rightDistance = Math.hypot(right.rect.left + right.rect.width / 2 - centerX, right.rect.top + right.rect.height / 2 - centerY);
            return leftDistance - rightDistance;
          })
          .map(({ tile }) => tile);
        if (galleryEntries.length && tiles.length) {
          const scaleX = cardRect.width / Math.max(1, card.offsetWidth);
          const scaleY = cardRect.height / Math.max(1, card.offsetHeight);
          const localClickX = (clientX - cardRect.left) / scaleX;
          const localClickY = (clientY - cardRect.top) / scaleY;
          const container = document.createElement("div");
          container.className = "desktop-cover-fliers";
          container.setAttribute("aria-hidden", "true");
          Object.assign(container.style, { position: "absolute", inset: "0", pointerEvents: "none", zIndex: "30" });
          card.appendChild(container);
          containers.push(container);
          for (let index = 0; index < Math.min(8, tiles.length); index += 1) {
            const tile = tiles[index]!;
            const tileRect = tile.getBoundingClientRect();
            const pos = {
              x: (tileRect.left - cardRect.left) / scaleX,
              y: (tileRect.top - cardRect.top) / scaleY,
            };
            const tileWidth = tileRect.width / scaleX;
            const tileHeight = tileRect.height / scaleY;
            const entryIndex = Number(tile.dataset.domeEntryIndex);
            const entry = Number.isFinite(entryIndex) ? galleryEntries[entryIndex] : undefined;
            if (!entry) continue;
            const record = entry.item.record;
            const flier = document.createElement("div");
            flier.className = "desktop-cover-flier";
            Object.assign(flier.style, {
              position: "absolute",
              left: `${pos.x}px`,
              top: `${pos.y}px`,
              width: `${tileWidth}px`,
              height: `${tileHeight}px`,
              overflow: "hidden",
              border: "1px solid rgba(255,255,255,0.22)",
              borderRadius: "30px",
              background: `linear-gradient(145deg, ${entry.accent}44, #171B23)`,
              boxShadow: "0 10px 28px rgba(0,0,0,0.45)",
              display: "grid",
              placeItems: "center",
              color: "rgba(255,255,255,0.72)",
              fontSize: "15px",
              fontWeight: "800",
            });
            flier.textContent = String(entryIndex + 1).padStart(2, "0");
            if (record?.coverUrl && !privacy) {
              const img = document.createElement("img");
              img.src = record.coverUrl;
              img.alt = "";
              Object.assign(img.style, {
                position: "absolute",
                inset: "0",
                width: "100%",
                height: "100%",
                objectFit: "cover",
                filter: "none",
              });
              img.onerror = () => img.remove();
              flier.appendChild(img);
            }
            container.appendChild(flier);
            const dx = localClickX - (pos.x + tileWidth / 2);
            const dy = localClickY - (pos.y + tileHeight / 2);
            const delay = index * 0.03;
            timeline.fromTo(flier, {
              x: dx,
              y: dy,
              scale: 0.22,
              rotation: (index % 2 ? -1 : 1) * (8 + index * 1.4),
              autoAlpha: 0.5,
            }, {
              x: 0,
              y: 0,
              scale: 1,
              rotation: 0,
              autoAlpha: 1,
              duration: 0.72,
              ease: "power3.out",
            }, delay);
            timeline.to(flier, { autoAlpha: 0, duration: 0.24, ease: "power1.out" }, delay + 0.8);
            spawned += 1;
          }
        }
        if (!spawned) {
          containers.forEach((node) => node.remove());
          return;
        }
        flierCleanupRef.current = () => {
          timeline.kill();
          containers.forEach((node) => node.remove());
          flierCleanupRef.current = null;
        };
      });
    });
  }, [galleryEntries, privacy]);

  const openApp = useCallback((event?: React.MouseEvent<HTMLButtonElement>) => {
    if (!ready || opened || !desktopRef.current || !reportRef.current) return;
    openedRef.current = true;
    setOpened(true);
    onOpenApp();
    if (reducedMotion) {
      gsap.set(desktopRef.current, { autoAlpha: 0 });
      gsap.set(reportRef.current, { autoAlpha: 1, scale: 1 });
      return;
    }
    const hasPointer = Boolean(event && (event.clientX || event.clientY));
    const iconRect = appRef.current?.getBoundingClientRect();
    const clientX = hasPointer && event ? event.clientX : iconRect ? iconRect.left + iconRect.width / 2 : 0;
    const clientY = hasPointer && event ? event.clientY : iconRect ? iconRect.top + iconRect.height / 2 : 0;
    if (clientX || clientY) spawnCoverFliers(clientX, clientY);
    gsap.timeline()
      .to(desktopRef.current, {
        autoAlpha: 0,
        scale: 1.018,
        duration: 0.42,
        ease: "power2.inOut",
      })
      .to(reportRef.current, {
        autoAlpha: 1,
        scale: 1,
        duration: 0.58,
        ease: "power3.out",
      }, "-=0.18");
  }, [onOpenApp, opened, ready, reducedMotion, spawnCoverFliers]);

  const selectedHeading = selectedStream
    ? narrativeTitle(selectedStream, privacy, recentDays, title)
    : title;

  return (
    <div
      ref={rootRef}
      className="desktop-card-swap-root"
      data-testid="desktop-card-swap"
      style={{
        position: "relative",
        width: "100%",
        minHeight: viewportHeight,
        overflow: "hidden",
        background: "#090B0F",
        color: "#F4F6FA",
      }}
    >
      <style>{CSS}</style>
      <div
        ref={desktopRef}
        aria-hidden={opened}
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          pointerEvents: opened ? "none" : "auto",
          transformOrigin: "center",
        }}
      >
        <img
          alt=""
          src={wallpaperUri}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
        <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <div
            ref={(node) => {
              fallerRefs.current[0] = node;
            }}
            style={{ position: "absolute", top: 48, left: 26, willChange: "transform" }}
          >
            <DesktopCalendarWidget />
          </div>
          <div
            ref={(node) => {
              fallerRefs.current[1] = node;
            }}
            style={{ position: "absolute", top: 48, left: 192, willChange: "transform" }}
          >
            <DesktopWeatherWidget />
          </div>
          <div
            ref={(node) => {
              fallerRefs.current[2] = node;
            }}
            style={{ position: "absolute", top: 214, left: 26, willChange: "transform" }}
          >
            <DesktopPhotosWidget />
          </div>
          {DESKTOP_ICONS.map((icon, index) => (
            <div
              key={icon.label}
              ref={(node) => {
                fallerRefs.current[index + 3] = node;
              }}
              style={{
                position: "absolute",
                left: `${icon.leftPct}%`,
                top: `${icon.topPct}%`,
                width: 96,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 3,
                willChange: "transform",
              }}
            >
              {icon.kind === "folder" ? <DesktopFolderGlyph /> : icon.kind === "doc" ? <DesktopDocGlyph /> : <DesktopThumbGlyph />}
              <span style={DESKTOP_LABEL}>{icon.label}</span>
            </div>
          ))}
          <DesktopMenuBar />
          <DesktopDock />
        </div>
        <button
          ref={appRef}
          aria-hidden={!ready}
          aria-label="打开抖音内容页"
          className="desktop-app-button"
          disabled={!ready}
          onClick={openApp}
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 13,
            width: 154,
            padding: 0,
            border: 0,
            background: "transparent",
            color: "#F4F6FA",
            cursor: "inherit",
            transform: "translate(-50%, -50%)",
            opacity: 0,
            visibility: "hidden",
          }}
          tabIndex={ready ? 0 : -1}
          type="button"
        >
          <span className="desktop-app-drop">
            <span
              style={{
                width: 116,
                height: 116,
                display: "grid",
                placeItems: "center",
                overflow: "hidden",
                border: "1px solid rgba(255,255,255,0.24)",
                borderRadius: 28,
                background: "#0A0C10",
                boxShadow: "0 24px 58px rgba(0,0,0,0.38), inset 0 1px 0 rgba(255,255,255,0.12)",
              }}
            >
              {appIcon}
            </span>
          </span>
          <strong className="desktop-app-label" style={{ fontSize: 15, textShadow: "0 2px 8px rgba(0,0,0,0.8)" }}>抖音</strong>
          <span className="desktop-app-label desktop-app-label-2" style={{ color: "rgba(255,255,255,0.78)", fontSize: 11, textShadow: "0 2px 8px rgba(0,0,0,0.8)" }}>
            点击打开
          </span>
        </button>
      </div>

      <div
        ref={reportRef}
        aria-hidden={!opened}
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          visibility: opened ? undefined : "hidden",
          opacity: opened ? undefined : 0,
          pointerEvents: opened ? "auto" : "none",
          background: "radial-gradient(circle at 72% 46%, rgba(37,244,238,0.08), transparent 34%), #090B0F",
        }}
      >
        <section
          style={{
            position: "absolute",
            top: reducedMotion ? 26 : "36%",
            left: reducedMotion ? 34 : viewportWidth < 1250 ? 44 : "5%",
            width: reducedMotion ? 560 : viewportWidth < 1250 ? 320 : 560,
            pointerEvents: "none",
            zIndex: 5,
          }}
        >
          <p style={{ margin: 0, color: "#25F4EE", fontSize: reducedMotion ? 11 : 13, fontWeight: 900 }}>
            {eyebrow}
          </p>
          <h1
            style={{
              maxWidth: 560,
              margin: reducedMotion ? "10px 0 0" : "14px 0 0",
              color: "#F4F6FA",
              fontSize: reducedMotion ? 36 : viewportWidth < 1250 ? 38 : 56,
              lineHeight: 1.12,
              letterSpacing: "-0.04em",
            }}
          >
            {selectedHeading}
          </h1>
          {reducedMotion ? (
            <p style={{ maxWidth: 520, margin: "12px 0 0", color: "rgba(244,246,250,0.62)", fontSize: 14, lineHeight: 1.75 }}>
              {copy}
            </p>
          ) : null}
        </section>

        {opened && reducedMotion && selectedStream ? (
          <div
            style={{
              position: "absolute",
              top: 190,
              right: 24,
              bottom: 24,
              left: 34,
              overflow: "hidden",
              border: "1px solid rgba(255,255,255,0.18)",
              borderRadius: 18,
            }}
          >
            <ContentPage
              description={narrativeDescription(selectedStream, privacy)}
              entries={galleryEntries}
              onSelect={selectEntry}
              privacy={privacy}
              reducedMotion
              selectedEntry={selectedEntry}
              stream={selectedStream}
            />
          </div>
        ) : opened && selectedStream ? (
          <div
            className="desktop-card-swap-stage"
            style={{ position: "absolute", top: 0, right: 0, width: "50%", height: "100%", zIndex: 2 }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                transform: `scale(${stageScale})`,
                transformOrigin: "bottom right",
              }}
            >
              <CardSwap
                easing="elastic"
                height={740}
                skewAmount={6}
                width={viewportWidth < 1250 ? 925 : 1250}
              >
                <Card key="all-content" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
                  <ContentPage
                    description={narrativeDescription(selectedStream, privacy)}
                    entries={galleryEntries}
                    onSelect={selectEntry}
                    privacy={privacy}
                    reducedMotion={false}
                    selectedEntry={selectedEntry}
                    stream={selectedStream}
                  />
                </Card>
              </CardSwap>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
