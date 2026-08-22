import React from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  Activity,
  ArrowUpRight,
  Bookmark,
  Clock3,
  Eye,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react-native";

import type {
  LivingAxis,
  LivingChapter,
  LivingReport,
  LivingSignal,
} from "../../domain/livingReport";
import { workspaceColors as color, workspaceRadii as radius } from "./workspaceTheme";

type IconComponent = React.ComponentType<{
  color?: string;
  size?: number;
  strokeWidth?: number;
}>;

export interface DenseSummaryDashboardProps {
  report: LivingReport;
  privacy: boolean;
  mobile: boolean;
  onOpenRecord: (url: string) => Promise<void>;
}

const CHAPTER_ICONS: Record<LivingChapter["id"], IconComponent> = {
  current: Sparkles,
  rhythm: Clock3,
  shift: TrendingUp,
  profile: Users,
  kept: Bookmark,
  continuation: Activity,
};

const CHAPTER_ACCENTS: Record<LivingChapter["id"], string> = {
  current: color.cyan,
  rhythm: color.amber,
  shift: color.accent,
  profile: color.green,
  kept: color.amber,
  continuation: color.cyan,
};

export function DenseSummaryDashboard({ report, privacy, mobile, onOpenRecord }: DenseSummaryDashboardProps) {
  const current = chapterFor(report, "current");
  const chapters = (["shift", "profile", "rhythm", "kept", "continuation"] as const)
    .map((id) => chapterFor(report, id));
  const reliablePercent = Math.round(report.coverage.reliableDateRatio * 100);

  return (
    <ScrollView
      testID="living-report-view"
      contentContainerStyle={[styles.content, mobile && styles.contentMobile]}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.header, mobile && styles.headerMobile]}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>LIVING REPORT · {freshnessLabel(report.freshness)}</Text>
          <Text style={[styles.title, mobile && styles.titleMobile]}>你正在经历哪一段内容生活？</Text>
          <Text style={styles.lead}>这不是年度结算，而是随着新记录不断展开的当前章节。</Text>
        </View>
        <View style={[styles.freshnessBlock, mobile && styles.freshnessBlockMobile]}>
          <Text style={styles.freshnessValue}>{reliablePercent}%</Text>
          <Text style={styles.freshnessLabel}>可靠时间覆盖</Text>
          <Text style={styles.freshnessMeta}>{report.sourceUpdatedAt ? `快照 ${formatDate(report.sourceUpdatedAt)}` : `分析 ${formatDate(report.asOf)}`}</Text>
          {report.sourceUpdatedAt ? <Text style={styles.freshnessMeta}>分析于 {formatDate(report.asOf)}</Text> : null}
        </View>
      </View>

      <View testID="living-report-current" style={[styles.hero, { borderLeftColor: CHAPTER_ACCENTS.current }]}>
        <Text style={styles.heroEyebrow}>{current.eyebrow}</Text>
        <Text style={[styles.heroTitle, mobile && styles.heroTitleMobile]}>{current.title}</Text>
        <Text style={styles.heroNarrative}>{displayNarrative(current, privacy)}</Text>
        <View style={styles.heroMetaRow}>
          <Text style={styles.windowLabel}>{report.currentWindow.label} · {report.currentWindow.uniqueVideoCount} 条去重内容</Text>
          <ConfidenceBadge confidence={current.confidence} />
        </View>
        <SignalList signals={current.signals} privacy={privacy} />
        <EvidenceRow evidence={current.evidence} onOpenRecord={onOpenRecord} privacy={privacy} />
      </View>

      <View style={styles.chapterList}>
        {chapters.map((chapter) => (
          chapter.id === "profile"
            ? <ProfileBlock chapter={chapter} mobile={mobile} privacy={privacy} profile={report.profile} key={chapter.id} />
            : <ChapterBlock chapter={chapter} key={chapter.id} mobile={mobile} onOpenRecord={onOpenRecord} privacy={privacy} report={report} />
        ))}
      </View>

      <View testID="living-report-coverage" style={styles.coverageBlock}>
        <View style={styles.coverageHeader}>
          <View style={styles.coverageIcon}><Eye color={color.green} size={16} /></View>
          <Text style={styles.coverageTitle}>数据边界</Text>
          <Text style={styles.coverageMeta}>{report.status === "partial" ? "部分样本" : "本地样本"}</Text>
        </View>
        <Text style={styles.coverageText}>
          {report.coverage.recordCount} 条记录中，{report.coverage.reliableRecordCount} 条带可靠行为时间；无日期记录仍计入内容总量，但不会生成时间结论。
        </Text>
        {report.coverage.unknownSourceRecordCount > 0 ? <Text style={styles.notice}>{report.coverage.unknownSourceRecordCount} 条记录的行为时间来源不可靠，未用于时间叙事。</Text> : null}
        {report.usedFallbackWindow ? <Text style={styles.notice}>最近 30 天样本不足，当前报告已扩大到最近 90 天。</Text> : null}
        {report.coverage.warnings.slice(0, 2).map((warning) => <Text key={warning} style={styles.notice}>{warning}</Text>)}
      </View>
    </ScrollView>
  );
}

function ChapterBlock({
  chapter,
  mobile,
  onOpenRecord,
  privacy,
  report,
}: {
  chapter: LivingChapter;
  mobile: boolean;
  onOpenRecord: (url: string) => Promise<void>;
  privacy: boolean;
  report: LivingReport;
}) {
  const Icon = CHAPTER_ICONS[chapter.id];
  const accent = CHAPTER_ACCENTS[chapter.id];
  const isShift = chapter.id === "shift";
  return (
    <View testID={`living-chapter-${chapter.id}`} style={[styles.chapter, mobile && styles.chapterMobile, { borderTopColor: accent }]}>
      <View style={styles.chapterHeader}>
        <View style={[styles.chapterIcon, { backgroundColor: `${accent}18` }]}><Icon color={accent} size={16} /></View>
        <View style={styles.chapterHeaderCopy}>
          <Text style={styles.chapterEyebrow}>{chapter.eyebrow}</Text>
          <Text style={styles.chapterTitle}>{chapter.title}</Text>
        </View>
        <ConfidenceBadge confidence={chapter.confidence} />
      </View>
      <Text style={styles.chapterNarrative}>{displayNarrative(chapter, privacy)}</Text>
      {isShift ? <Text style={styles.compareMeta}>{report.currentWindow.label} 对比 {report.comparisonWindow.label}</Text> : null}
      <SignalList signals={chapter.signals} privacy={privacy} />
      {chapter.notice ? <Text style={styles.notice}>{chapter.notice}</Text> : null}
      <EvidenceRow evidence={chapter.evidence} onOpenRecord={onOpenRecord} privacy={privacy} />
    </View>
  );
}

function SignalList({
  signals,
  privacy,
}: {
  signals: LivingSignal[];
  privacy: boolean;
}) {
  if (!signals.length) return null;
  return (
    <View style={styles.signalList}>
      {signals.map((signal) => (
        <View key={signal.id} style={styles.signalRow}>
          <View style={[styles.signalDot, { backgroundColor: signal.direction === "down" ? color.amber : color.cyan }]} />
          <View style={styles.signalCopy}>
            <View style={styles.signalTitleRow}>
              <Text numberOfLines={1} style={styles.signalLabel}>{privacy ? maskLabel(signal.label) : signal.label}</Text>
              <Text style={styles.signalValue}>{signal.value}</Text>
            </View>
            <View style={styles.signalTrack}><View style={[styles.signalFill, { width: `${Math.max(4, signal.share * 100)}%`, backgroundColor: signal.direction === "down" ? color.amber : color.cyan }]} /></View>
          </View>
          <Text style={[styles.signalDelta, signal.direction === "up" && styles.signalDeltaUp, signal.direction === "down" && styles.signalDeltaDown]}>{formatDelta(signal.delta)}</Text>
        </View>
      ))}
    </View>
  );
}

function EvidenceRow({
  evidence,
  onOpenRecord,
  privacy,
}: {
  evidence: LivingChapter["evidence"];
  onOpenRecord: (url: string) => Promise<void>;
  privacy: boolean;
}) {
  const items = evidence.slice(0, 3);
  if (!items.length) return null;
  return (
    <View style={styles.evidenceRow}>
      <Text style={styles.evidenceLabel}>证据</Text>
      {items.map((item, index) => {
        const title = privacy ? `内容 ${index + 1}` : item.title;
        const canOpen = Boolean(item.url && !privacy);
        return (
          <Pressable
            accessibilityLabel={`${title}${canOpen ? "，打开记录" : ""}`}
            accessibilityRole={canOpen ? "link" : undefined}
            disabled={!canOpen}
            key={`${item.videoId ?? item.title}:${index}`}
            onPress={() => item.url && void onOpenRecord(item.url)}
            style={({ pressed }) => [styles.evidenceItem, pressed && styles.pressed]}
          >
            <Text numberOfLines={1} style={styles.evidenceTitle}>{title}</Text>
            <Text numberOfLines={1} style={styles.evidenceMeta}>{privacy ? "详情已隐藏" : item.author ?? "未知创作者"}</Text>
            {canOpen ? <ArrowUpRight color={color.textMuted} size={13} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function ProfileBlock({
  chapter,
  mobile,
  privacy,
  profile,
}: {
  chapter: LivingChapter;
  mobile: boolean;
  privacy: boolean;
  profile: LivingReport["profile"];
}) {
  return (
    <View testID="living-report-profile" style={[styles.profileBlock, mobile && styles.profileBlockMobile]}>
      <View style={styles.profileHeader}>
        <View style={styles.chapterIcon}><Users color={color.green} size={16} /></View>
        <View style={styles.chapterHeaderCopy}>
          <Text style={styles.chapterEyebrow}>{chapter.eyebrow}</Text>
          <Text style={styles.chapterTitle}>{chapter.title}</Text>
        </View>
        <ConfidenceBadge confidence={chapter.confidence} />
      </View>
      <Text style={styles.chapterNarrative}>
        {privacy ? "当前样本显示出一些行为倾向，但具体内容已隐藏。" : chapter.narrative}
      </Text>
      <View style={styles.axisList}>
        {profile.axes.filter((axis) => axis.value !== null).map((axis) => <AxisRow axis={axis} key={axis.id} />)}
        {!profile.axes.some((axis) => axis.value !== null) ? <Text style={styles.notice}>需要更多带可靠时间、观看进度或发布时间的记录。</Text> : null}
      </View>
      {profile.notice ? <Text style={styles.notice}>{profile.notice}</Text> : null}
    </View>
  );
}

function AxisRow({ axis }: { axis: LivingAxis }) {
  const value = axis.value === null ? 0 : axis.value;
  return (
    <View style={styles.axisRow}>
      <View style={styles.axisLabels}><Text style={styles.axisLabel}>{axis.leftLabel}</Text><Text style={styles.axisLabel}>{axis.rightLabel}</Text></View>
      <View style={styles.axisTrack}>
        <View style={[styles.axisFill, { width: `${value}%` }]} />
        {axis.value !== null ? <View style={[styles.axisMarker, { left: `${value}%` }]} /> : null}
      </View>
      <Text style={styles.axisResult}>{axis.label ?? "尚在形成"}</Text>
    </View>
  );
}

function ConfidenceBadge({ confidence }: { confidence: LivingChapter["confidence"] }) {
  const label = confidence === "high" ? "高置信" : confidence === "medium" ? "当前样本" : "尚在形成";
  return <Text style={[styles.confidence, confidence === "high" && styles.confidenceHigh, confidence === "insufficient" && styles.confidenceLow]}>{label}</Text>;
}

function chapterFor(report: LivingReport, id: LivingChapter["id"]): LivingChapter {
  return report.chapters.find((chapter) => chapter.id === id) ?? report.chapters[0]!;
}

function displayNarrative(chapter: LivingChapter, privacy: boolean): string {
  if (!privacy) return chapter.narrative;
  switch (chapter.id) {
    case "current": return "最近一段时间里，你的内容线索已经出现了明显轮廓。";
    case "shift": return "近期内容线索的占比正在发生变化。";
    case "profile": return "当前样本显示出一些行为倾向，但具体内容已隐藏。";
    case "kept": return "列表之间存在可比较的交集，具体内容已隐藏。";
    default: return chapter.narrative;
  }
}

function maskLabel(label: string): string {
  return label.startsWith("#") ? "#话题" : "创作者";
}

function freshnessLabel(value: LivingReport["freshness"]): string {
  return value === "fresh" ? "刚更新" : value === "stale" ? "需要更新" : value === "partial" ? "部分采集" : "时间未知";
}

function formatDelta(value: number | null): string {
  if (value === null) return "";
  const percent = Math.round(Math.abs(value) * 100);
  return value > 0.02 ? `+${percent}%` : value < -0.02 ? `-${percent}%` : "稳定";
}

function formatDate(value: string | null): string {
  if (!value) return "时间未知";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "时间未知";
  return date.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

const styles = StyleSheet.create({
  content: { padding: 28, paddingBottom: 48, backgroundColor: color.canvas },
  contentMobile: { padding: 14, paddingBottom: 88 },
  header: { minHeight: 112, flexDirection: "row", alignItems: "flex-end", gap: 24, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: color.border },
  headerMobile: { flexDirection: "column", alignItems: "stretch", gap: 14 },
  headerCopy: { flex: 1, minWidth: 0 },
  eyebrow: { color: color.cyan, fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
  title: { color: color.text, fontSize: 30, lineHeight: 38, fontWeight: "900", marginTop: 6 },
  titleMobile: { fontSize: 24, lineHeight: 31 },
  lead: { color: color.textSecondary, fontSize: 12, lineHeight: 19, marginTop: 9 },
  freshnessBlock: { minWidth: 190, alignItems: "flex-end", paddingLeft: 18, borderLeftWidth: 1, borderLeftColor: color.border },
  freshnessBlockMobile: { alignItems: "flex-start", paddingLeft: 0, paddingTop: 12, borderLeftWidth: 0, borderTopWidth: 1, borderTopColor: color.border },
  freshnessValue: { color: color.green, fontSize: 25, fontWeight: "900" },
  freshnessLabel: { color: color.textSecondary, fontSize: 10, fontWeight: "800", marginTop: 2 },
  freshnessMeta: { color: color.textMuted, fontSize: 9, marginTop: 5 },
  hero: { marginTop: 22, padding: 20, borderLeftWidth: 3, borderWidth: 1, borderColor: color.border, borderRadius: radius.large, backgroundColor: color.surface },
  heroEyebrow: { color: color.cyan, fontSize: 10, fontWeight: "900" },
  heroTitle: { color: color.text, fontSize: 25, lineHeight: 32, fontWeight: "900", marginTop: 7 },
  heroTitleMobile: { fontSize: 21, lineHeight: 28 },
  heroNarrative: { maxWidth: 720, color: color.textSecondary, fontSize: 15, lineHeight: 24, marginTop: 10 },
  heroMetaRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 15 },
  windowLabel: { color: color.textMuted, fontSize: 10 },
  chapterList: { marginTop: 20 },
  chapter: { paddingVertical: 20, borderTopWidth: 2, borderBottomWidth: 1, borderBottomColor: color.borderSoft },
  chapterMobile: { paddingVertical: 17 },
  chapterHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  chapterIcon: { width: 30, height: 30, alignItems: "center", justifyContent: "center", borderRadius: radius.small, backgroundColor: color.surfaceRaised },
  chapterHeaderCopy: { flex: 1, minWidth: 0 },
  chapterEyebrow: { color: color.textMuted, fontSize: 9, fontWeight: "900", letterSpacing: 0.4 },
  chapterTitle: { color: color.text, fontSize: 17, lineHeight: 23, fontWeight: "900", marginTop: 2 },
  confidence: { color: color.cyan, fontSize: 9, fontWeight: "900", paddingHorizontal: 7, paddingVertical: 4, borderRadius: radius.small, backgroundColor: color.cyanSoft },
  confidenceHigh: { color: color.green, backgroundColor: color.greenSoft },
  confidenceLow: { color: color.amber, backgroundColor: color.amberSoft },
  chapterNarrative: { maxWidth: 760, color: color.textSecondary, fontSize: 13, lineHeight: 21, marginTop: 10 },
  compareMeta: { color: color.textMuted, fontSize: 9, marginTop: 7 },
  signalList: { gap: 9, marginTop: 15 },
  signalRow: { minHeight: 28, flexDirection: "row", alignItems: "center", gap: 8 },
  signalDot: { width: 6, height: 6, borderRadius: 3 },
  signalCopy: { flex: 1, minWidth: 0 },
  signalTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  signalLabel: { flex: 1, color: color.textSecondary, fontSize: 10, fontWeight: "800" },
  signalValue: { color: color.text, fontSize: 10, fontWeight: "900" },
  signalTrack: { height: 3, overflow: "hidden", marginTop: 5, backgroundColor: color.surfaceMuted },
  signalFill: { height: 3 },
  signalDelta: { width: 42, color: color.textMuted, fontSize: 9, textAlign: "right" },
  signalDeltaUp: { color: color.green },
  signalDeltaDown: { color: color.amber },
  evidenceRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 7, marginTop: 14 },
  evidenceLabel: { color: color.textMuted, fontSize: 9, fontWeight: "900", marginRight: 2 },
  evidenceItem: { minWidth: 120, maxWidth: 230, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 6, borderWidth: 1, borderColor: color.border, borderRadius: radius.small, backgroundColor: color.surfaceRaised },
  evidenceTitle: { flex: 1, color: color.textSecondary, fontSize: 9, fontWeight: "800" },
  evidenceMeta: { maxWidth: 60, color: color.textMuted, fontSize: 8 },
  profileBlock: { marginTop: 22, padding: 20, borderWidth: 1, borderColor: color.border, borderRadius: radius.large, backgroundColor: color.surface },
  profileBlockMobile: { padding: 15 },
  profileHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  axisList: { gap: 14, marginTop: 18 },
  axisRow: { gap: 6 },
  axisLabels: { flexDirection: "row", justifyContent: "space-between" },
  axisLabel: { color: color.textMuted, fontSize: 9 },
  axisTrack: { height: 6, position: "relative", overflow: "visible", backgroundColor: color.surfaceMuted },
  axisFill: { height: 6, backgroundColor: color.green },
  axisMarker: { position: "absolute", top: -3, width: 12, height: 12, marginLeft: -6, borderRadius: 6, borderWidth: 2, borderColor: color.canvas, backgroundColor: color.green },
  axisResult: { color: color.textSecondary, fontSize: 10, fontWeight: "800", marginTop: 3 },
  coverageBlock: { marginTop: 22, paddingTop: 17, borderTopWidth: 1, borderTopColor: color.border },
  coverageHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  coverageIcon: { width: 26, height: 26, alignItems: "center", justifyContent: "center", borderRadius: radius.small, backgroundColor: color.greenSoft },
  coverageTitle: { flex: 1, color: color.text, fontSize: 12, fontWeight: "900" },
  coverageMeta: { color: color.textMuted, fontSize: 9 },
  coverageText: { maxWidth: 800, color: color.textSecondary, fontSize: 10, lineHeight: 16, marginTop: 9 },
  notice: { color: color.amber, fontSize: 10, lineHeight: 15, marginTop: 8 },
  pressed: { opacity: 0.72 },
});
