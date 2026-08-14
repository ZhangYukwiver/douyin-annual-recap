import React, { useEffect, useMemo, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Polyline, Rect } from "react-native-svg";

import type {
  AnnualCalendarDay,
  AnnualHeatmapCell,
  AnnualMonthPoint,
  AnnualCardStatus,
  AnnualContentRef,
} from "../../domain/annualReport";

export const annualColors = {
  ink: "#17191C",
  inkMuted: "#5F656B",
  inkFaint: "#8B9298",
  paper: "#F5F7F8",
  surface: "#FFFFFF",
  line: "#DCE1E5",
  lineStrong: "#C4CBD1",
  cyan: "#0B9FA8",
  cyanSoft: "#D9F3F3",
  cyanMid: "#77D1D0",
  red: "#D74257",
  redSoft: "#FBE5E8",
  gold: "#C68A18",
  goldSoft: "#FFF0C9",
  carbon: "#202429",
  carbonSoft: "#2A3035",
  white: "#FFFFFF",
  warning: "#9B5B12",
  warningSoft: "#FFF4DE",
} as const;

const TYPE_COLORS = {
  liked: annualColors.red,
  favorite: annualColors.gold,
} as const;

export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(value);
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${Math.round(value * 100)}%`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "日期未知";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/u);
  return match ? `${match[1]}年${Number(match[2])}月${Number(match[3])}日` : value.slice(0, 10);
}

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function placeholderColors(seed: string): { background: string; foreground: string } {
  const palette = [
    { background: "#DDF4F3", foreground: "#0A777D" },
    { background: "#FBE6E9", foreground: "#A82F45" },
    { background: "#FFF0CD", foreground: "#8B5B0C" },
    { background: "#E8EDF1", foreground: "#46525B" },
  ];
  return palette[hashSeed(seed) % palette.length] ?? palette[0]!;
}

function monogram(value: string): string {
  const normalized = value.trim();
  if (!normalized) return "DY";
  return Array.from(normalized).slice(0, 2).join("").toUpperCase();
}

export function CoverImage({
  uri,
  title,
  privacy,
  size = "medium",
}: {
  uri: string | null | undefined;
  title: string | null | undefined;
  privacy: boolean;
  size?: "small" | "medium" | "large";
}) {
  const [failed, setFailed] = useState(!uri);
  useEffect(() => setFailed(!uri), [uri]);
  const dimensions = size === "small" ? styles.coverSmall : size === "large" ? styles.coverLarge : styles.coverMedium;
  if (privacy) {
    return (
      <View style={[styles.cover, dimensions, styles.coverPrivacy]} accessibilityRole="image" accessibilityLabel="隐私占位图">
        <View style={styles.privacyMark} />
        <Text style={styles.privacyCoverLabel}>已隐藏</Text>
      </View>
    );
  }
  if (failed || !uri) {
    const tone = placeholderColors(title ?? "douyin");
    return (
      <View
        style={[styles.cover, dimensions, { backgroundColor: tone.background }]}
        accessibilityRole="image"
        accessibilityLabel="视频封面占位图"
      >
        <Text style={[styles.coverMonogram, { color: tone.foreground }]}>{monogram(title ?? "DY")}</Text>
        <Text style={[styles.coverPlaceholderLabel, { color: tone.foreground }]}>封面不可用</Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={[styles.cover, dimensions]}
      resizeMode="cover"
      accessibilityRole="image"
      accessibilityLabel={`视频封面：${title || "未命名视频"}`}
      onError={() => setFailed(true)}
    />
  );
}

export function StatusPill({ status }: { status: AnnualCardStatus }) {
  const ok = status === "ok";
  return (
    <View style={[styles.statusPill, ok ? styles.statusOk : styles.statusInsufficient]} accessibilityRole="text">
      <View style={[styles.statusDot, { backgroundColor: ok ? annualColors.cyan : annualColors.warning }]} />
      <Text style={[styles.statusText, { color: ok ? "#08777D" : annualColors.warning }]}>{ok ? "可分析" : "数据不足"}</Text>
    </View>
  );
}

export function MetricBlock({
  label,
  value,
  detail,
  accent = annualColors.ink,
  large = false,
}: {
  label: string;
  value: string;
  detail?: string;
  accent?: string;
  large?: boolean;
}) {
  return (
    <View style={styles.metricBlock} accessibilityRole="text">
      <View style={[styles.metricRule, { backgroundColor: accent }]} />
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, large && styles.metricValueLarge]}>{value}</Text>
      {detail ? <Text style={styles.metricDetail}>{detail}</Text> : null}
    </View>
  );
}

export function CalendarHeatmap({ days }: { days: readonly AnnualCalendarDay[] }) {
  const legend = [0, 1, 2, 3, 4] as const;
  return (
    <View style={styles.calendarWrap} accessibilityRole="image" accessibilityLabel="样本日期活动热力图">
      <View style={styles.calendarGrid}>
        {days.map((day) => (
          <View
            key={day.date}
            style={[styles.calendarCell, { backgroundColor: calendarColor(day.level) }]}
            accessibilityRole="text"
            accessibilityLabel={`${day.date}，${day.count}条可靠记录`}
          />
        ))}
      </View>
      <View style={styles.legendRow}>
        <Text style={styles.legendLabel}>少</Text>
        {legend.map((level) => <View key={level} style={[styles.legendCell, { backgroundColor: calendarColor(level) }]} />)}
        <Text style={styles.legendLabel}>多</Text>
      </View>
    </View>
  );
}

function calendarColor(level: 0 | 1 | 2 | 3 | 4): string {
  return ["#E8EDF0", "#CBE9E8", "#8FD6D5", "#42B9BA", annualColors.cyan][level] ?? "#E8EDF0";
}

export function RhythmHeatmap({ cells }: { cells: readonly AnnualHeatmapCell[] }) {
  const max = Math.max(1, ...cells.map((cell) => cell.count));
  const byKey = useMemo(() => new Map(cells.map((cell) => [`${cell.weekday}:${cell.hour}`, cell])), [cells]);
  const labels = ["一", "二", "三", "四", "五", "六", "日"];
  return (
    <View style={styles.rhythmWrap} accessibilityRole="image" accessibilityLabel="观看历史七乘二十四小时热力图">
      <View style={styles.hourLabels}>
        <View style={styles.dayLabelSpacer} />
        {[0, 3, 6, 9, 12, 15, 18, 21].map((hour) => <Text key={hour} style={styles.hourLabel}>{String(hour).padStart(2, "0")}</Text>)}
      </View>
      {labels.map((day, weekday) => (
        <View style={styles.rhythmRow} key={day}>
          <Text style={styles.dayLabel}>{day}</Text>
          <View style={styles.rhythmCells}>
            {Array.from({ length: 24 }, (_, hour) => {
              const cell = byKey.get(`${weekday}:${hour}`);
              const ratio = (cell?.count ?? 0) / max;
              return (
                <View
                  key={hour}
                  style={[styles.rhythmCell, { backgroundColor: rhythmColor(ratio) }]}
                  accessibilityRole="text"
                  accessibilityLabel={`周${day}${String(hour).padStart(2, "0")}点，${cell?.count ?? 0}条记录`}
                />
              );
            })}
          </View>
        </View>
      ))}
      <View style={styles.legendRow}>
        <Text style={styles.legendLabel}>低频</Text>
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => <View key={ratio} style={[styles.legendCell, { backgroundColor: rhythmColor(ratio) }]} />)}
        <Text style={styles.legendLabel}>高频</Text>
      </View>
    </View>
  );
}

function rhythmColor(ratio: number): string {
  if (ratio <= 0) return "#E8EDF0";
  if (ratio < 0.25) return "#CBE9E8";
  if (ratio < 0.5) return "#8FD6D5";
  if (ratio < 0.75) return "#42B9BA";
  return annualColors.cyan;
}

export function MonthlyChart({ months }: { months: readonly AnnualMonthPoint[] }) {
  const width = 720;
  const height = 210;
  const left = 30;
  const right = 16;
  const top = 18;
  const bottom = 36;
  const values = months.flatMap((month) => [month.liked, month.favorite].filter((value): value is number => value !== null));
  const max = Math.max(1, ...values);
  const x = (index: number) => left + (index / Math.max(1, months.length - 1)) * (width - left - right);
  const y = (value: number) => top + (1 - value / max) * (height - top - bottom);
  const series = [
    { key: "liked" as const, label: "喜欢", color: TYPE_COLORS.liked, dash: undefined },
    { key: "favorite" as const, label: "收藏", color: TYPE_COLORS.favorite, dash: "2 4" },
  ];
  return (
    <View accessibilityRole="image" accessibilityLabel="十二个月喜欢与收藏偏好变化图">
      <Svg width="100%" height={210} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        {[0, 0.5, 1].map((ratio) => <Line key={ratio} x1={left} x2={width - right} y1={y(max * ratio)} y2={y(max * ratio)} stroke="#E5E9EC" strokeWidth={1} />)}
        {series.map(({ key, color, dash }) => {
          const points = months
            .map((month, index) => month[key] === null ? null : `${x(index)},${y(month[key] ?? 0)}`)
            .filter((point): point is string => point !== null)
            .join(" ");
          return points ? <Polyline key={key} points={points} fill="none" stroke={color} strokeWidth={3} strokeDasharray={dash} strokeLinecap="round" strokeLinejoin="round" /> : null;
        })}
        {months.map((month, index) => <Line key={month.month} x1={x(index)} x2={x(index)} y1={height - bottom + 4} y2={height - bottom + 10} stroke="#9CA5AC" strokeWidth={1} />)}
      </Svg>
      <View style={styles.monthLabels}>
        {months.map((month) => <Text key={month.month} style={styles.monthLabel}>{month.label.replace("月", "")}</Text>)}
      </View>
      <View style={styles.seriesLegend}>
        {series.map(({ key, label, color }) => <View key={key} style={styles.seriesItem}><View style={[styles.seriesSwatch, { backgroundColor: color }]} /><Text style={styles.seriesLabel}>{label}</Text></View>)}
      </View>
    </View>
  );
}

export function RankBar({
  rank,
  label,
  value,
  max,
  share,
  accent = annualColors.cyan,
}: {
  rank: number;
  label: string;
  value: number;
  max: number;
  share?: number;
  accent?: string;
}) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <View style={styles.rankRow} accessibilityRole="text" accessibilityLabel={`${rank}，${label}，${formatCount(value)}个视频${share === undefined ? "" : `，占比${formatPercent(share)}`}`}>
      <Text style={styles.rankNumber}>{String(rank).padStart(2, "0")}</Text>
      <View style={styles.rankCopy}><Text style={styles.rankLabel} numberOfLines={1}>{label}</Text><View style={styles.rankTrack}><View style={[styles.rankFill, { width: `${Math.max(ratio * 100, value > 0 ? 4 : 0)}%`, backgroundColor: accent }]} /></View></View>
      <Text style={styles.rankValue}>{formatCount(value)}</Text>
    </View>
  );
}

export function ContentPreview({
  item,
  privacy,
  compact = false,
}: {
  item: AnnualContentRef | null;
  privacy: boolean;
  compact?: boolean;
}) {
  if (!item) {
    return <View style={[styles.contentPreview, compact && styles.contentPreviewCompact]}><View style={[styles.cover, compact ? styles.coverSmall : styles.coverMedium, styles.coverUnavailable]} /><Text style={styles.contentUnavailable}>暂无可确定内容</Text></View>;
  }
  if (privacy) {
    return (
      <View style={[styles.contentPreview, compact && styles.contentPreviewCompact]} accessibilityRole="text" accessibilityLabel="内容已隐私隐藏">
        <CoverImage uri={null} title={null} privacy size={compact ? "small" : "medium"} />
        <View style={styles.contentCopy}><Text style={styles.contentTitle}>内容已隐藏</Text><Text style={styles.contentMeta}>作者与标题已替换</Text></View>
      </View>
    );
  }
  return (
    <View style={[styles.contentPreview, compact && styles.contentPreviewCompact]} accessibilityRole="text" accessibilityLabel={`${item.title}${item.author ? `，作者${item.author}` : ""}`}>
      <CoverImage uri={item.coverUrl} title={item.title} privacy={false} size={compact ? "small" : "medium"} />
      <View style={styles.contentCopy}><Text style={styles.contentTitle} numberOfLines={2}>{item.title}</Text><Text style={styles.contentMeta} numberOfLines={1}>{item.author || "作者未知"}{item.occurredAt ? ` · ${formatDate(item.occurredAt)}` : ""}</Text></View>
    </View>
  );
}

export function MiniBars({
  values,
  colors,
  labels,
}: {
  values: readonly number[];
  colors: readonly string[];
  labels: readonly string[];
}) {
  const max = Math.max(1, ...values);
  return (
    <View style={styles.miniBars} accessibilityRole="image" accessibilityLabel="分类数值条形图">
      {values.map((value, index) => (
        <View style={styles.miniBarGroup} key={labels[index] ?? index}>
          <View style={styles.miniBarTrack}><View style={[styles.miniBarFill, { height: `${Math.max((value / max) * 100, value > 0 ? 5 : 0)}%`, backgroundColor: colors[index] ?? annualColors.cyan }]} /></View>
          <Text style={styles.miniBarValue}>{formatCount(value)}</Text>
          <Text style={styles.miniBarLabel}>{labels[index] ?? ""}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { alignItems: "center", justifyContent: "center", overflow: "hidden", borderRadius: 6 },
  coverSmall: { width: 62, height: 62 },
  coverMedium: { width: 104, height: 104 },
  coverLarge: { width: 220, height: 220 },
  coverPrivacy: { backgroundColor: "#D9DEE2" },
  coverUnavailable: { backgroundColor: "#E8EDF0" },
  privacyMark: { width: 20, height: 14, borderRadius: 3, borderWidth: 2, borderColor: "#69727A", marginBottom: 6 },
  privacyCoverLabel: { color: "#69727A", fontSize: 11, fontWeight: "700" },
  coverMonogram: { fontSize: 24, fontWeight: "900", letterSpacing: 0 },
  coverPlaceholderLabel: { marginTop: 5, fontSize: 10, fontWeight: "700" },
  statusPill: { minHeight: 28, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 10, borderRadius: 6 },
  statusOk: { backgroundColor: annualColors.cyanSoft },
  statusInsufficient: { backgroundColor: annualColors.warningSoft },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: "800" },
  metricBlock: { minWidth: 124, paddingRight: 18, paddingVertical: 8 },
  metricRule: { width: 28, height: 4, borderRadius: 2, marginBottom: 10 },
  metricLabel: { color: annualColors.inkMuted, fontSize: 12, fontWeight: "700" },
  metricValue: { color: annualColors.ink, fontSize: 26, lineHeight: 31, fontWeight: "900", marginTop: 2 },
  metricValueLarge: { fontSize: 36, lineHeight: 42 },
  metricDetail: { color: annualColors.inkFaint, fontSize: 11, lineHeight: 16, marginTop: 3 },
  calendarWrap: { width: "100%", marginTop: 8 },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap", gap: 3, alignContent: "flex-start" },
  calendarCell: { width: 9, height: 9, borderRadius: 2 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 9 },
  legendLabel: { color: annualColors.inkFaint, fontSize: 10, fontWeight: "700" },
  legendCell: { width: 10, height: 10, borderRadius: 2 },
  rhythmWrap: { width: "100%", maxWidth: 620, marginTop: 4 },
  hourLabels: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  dayLabelSpacer: { width: 24 },
  hourLabel: { width: 25, color: annualColors.inkFaint, fontSize: 9, textAlign: "center" },
  rhythmRow: { flexDirection: "row", alignItems: "center", height: 14, marginBottom: 3 },
  dayLabel: { width: 24, color: annualColors.inkMuted, fontSize: 10, fontWeight: "800" },
  rhythmCells: { flexDirection: "row", gap: 3 },
  rhythmCell: { width: 9, height: 10, borderRadius: 2 },
  monthLabels: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 4, marginTop: -2 },
  monthLabel: { color: annualColors.inkFaint, fontSize: 10, width: 22, textAlign: "center" },
  seriesLegend: { flexDirection: "row", gap: 18, marginTop: 3 },
  seriesItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  seriesSwatch: { width: 20, height: 4, borderRadius: 2 },
  seriesLabel: { color: annualColors.inkMuted, fontSize: 11, fontWeight: "700" },
  rankRow: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: annualColors.line },
  rankNumber: { width: 26, color: annualColors.inkFaint, fontSize: 12, fontWeight: "900" },
  rankCopy: { flex: 1, minWidth: 0 },
  rankLabel: { color: annualColors.ink, fontSize: 13, fontWeight: "800", marginBottom: 6 },
  rankTrack: { width: "100%", height: 6, borderRadius: 3, backgroundColor: "#E8EDF0", overflow: "hidden" },
  rankFill: { height: 6, borderRadius: 3 },
  rankValue: { width: 48, color: annualColors.ink, fontSize: 13, fontWeight: "900", textAlign: "right" },
  contentPreview: { minHeight: 112, flexDirection: "row", alignItems: "center", gap: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: annualColors.line, paddingVertical: 8 },
  contentPreviewCompact: { minHeight: 78 },
  contentCopy: { flex: 1, minWidth: 0 },
  contentTitle: { color: annualColors.ink, fontSize: 14, lineHeight: 20, fontWeight: "800" },
  contentMeta: { color: annualColors.inkMuted, fontSize: 11, lineHeight: 17, marginTop: 5 },
  contentUnavailable: { color: annualColors.inkMuted, fontSize: 13, marginLeft: 14 },
  miniBars: { minHeight: 128, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-around", gap: 18, paddingTop: 8 },
  miniBarGroup: { flex: 1, alignItems: "center", justifyContent: "flex-end" },
  miniBarTrack: { width: 24, height: 72, justifyContent: "flex-end", borderRadius: 4, backgroundColor: "#E8EDF0", overflow: "hidden" },
  miniBarFill: { width: 24, borderRadius: 4 },
  miniBarValue: { color: annualColors.ink, fontSize: 12, fontWeight: "900", marginTop: 6 },
  miniBarLabel: { color: annualColors.inkMuted, fontSize: 11, fontWeight: "700", marginTop: 3 },
});
