import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  ImageBackground,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import {
  ArrowUpRight,
  BarChart3,
  Bookmark,
  CalendarDays,
  Clock3,
  Eye,
  EyeOff,
  Heart,
  History,
  LayoutGrid,
  LayoutDashboard,
  List,
  Music2,
  Play,
  RefreshCw,
  Settings2,
  Sparkles,
  Star,
  Users,
} from "lucide-react-native";

import type {
  AnnualCreatorsData,
  AnnualContentRef,
  AnnualHighlightsData,
  AnnualInterestsData,
  AnnualKeptData,
  AnnualMonthlyData,
  AnnualOverviewData,
  AnnualReport,
  AnnualRhythmData,
} from "../../domain/annualReport";
import type {
  PersonalRecordCollection,
  PersonalRecordType,
  PersonalVideoRecord,
} from "../../domain/personalRecords";
import type { CollectorStatus } from "../../services/localCollector";
import { DenseSummaryDashboard } from "./DenseSummaryDashboard";
import { workspaceColors as color, workspaceRadii as radius } from "./workspaceTheme";

export type WorkspaceViewKey = PersonalRecordType | "summary" | "highlights";

export interface ContentWorkspaceProps {
  activeView: WorkspaceViewKey;
  records: PersonalRecordCollection;
  report: AnnualReport | null;
  sourceLabel: string;
  updatedAt: string | null;
  busy: boolean;
  status: CollectorStatus | null;
  onChangeView: (view: WorkspaceViewKey) => void;
  onOpenRecord: (url: string) => Promise<void>;
  onOpenSettings: () => void;
  onReplayStory: () => void;
  onSync: () => void;
  onTogglePrivacy: () => void;
  privacy: boolean;
}

type IconComponent = React.ComponentType<{
  color?: string;
  size?: number;
  strokeWidth?: number;
  fill?: string;
}>;

const navItems: Array<{ id: WorkspaceViewKey; label: string; icon: IconComponent; accent: string }> = [
  { id: "watch_history", label: "观看历史", icon: History, accent: color.cyan },
  { id: "liked_videos", label: "喜欢", icon: Heart, accent: color.accent },
  { id: "favorite_videos", label: "收藏", icon: Bookmark, accent: color.amber },
  { id: "summary", label: "数据大屏", icon: LayoutDashboard, accent: color.green },
  { id: "highlights", label: "年度高光", icon: Star, accent: color.cyan },
];

const recordNavItems = navItems.slice(0, 3);
const annualNavItems = navItems.slice(3);

const webPointer = Platform.OS === "web" ? ({ cursor: "pointer" } as object) : null;

export function ContentWorkspace({
  activeView,
  records,
  report,
  sourceLabel,
  updatedAt,
  busy,
  status,
  onChangeView,
  onOpenRecord,
  onOpenSettings,
  onReplayStory,
  onSync,
  onTogglePrivacy,
  privacy,
}: ContentWorkspaceProps) {
  const { width } = useWindowDimensions();
  const mobile = width < 720;
  const compactSidebar = width >= 720 && width < 1080;
  const currentNav = navItems.find((item) => item.id === activeView) ?? navItems[0]!;
  const totalRecords = records.watch_history.length + records.liked_videos.length + records.favorite_videos.length;
  const counts: Record<WorkspaceViewKey, number> = {
    watch_history: records.watch_history.length,
    liked_videos: records.liked_videos.length,
    favorite_videos: records.favorite_videos.length,
    summary: report ? (report.overview.data as AnnualOverviewData).counts.total : totalRecords,
    highlights: report
      ? Object.values(report.highlights.data as AnnualHighlightsData).filter(Boolean).length
      : 0,
  };
  const annualView = activeView === "summary" || activeView === "highlights";

  return (
    <View testID="content-workspace" style={styles.root}>
      {!mobile ? (
        <View style={[styles.sidebar, compactSidebar && styles.sidebarCompact]}>
          <Brand compact={compactSidebar} />
          <View accessibilityRole="tablist" style={styles.sidebarNav}>
            {!compactSidebar ? <Text style={styles.sidebarSectionLabel}>内容记录</Text> : null}
            {recordNavItems.map((item) => (
              <NavButton
                key={item.id}
                compact={compactSidebar}
                count={counts[item.id]}
                item={item}
                onPress={() => onChangeView(item.id)}
                selected={item.id === activeView}
              />
            ))}
            {!compactSidebar ? <Text style={[styles.sidebarSectionLabel, styles.sidebarSectionLabelAnnual]}>年度分析</Text> : <View style={styles.sidebarCompactDivider} />}
            {annualNavItems.map((item) => (
              <NavButton
                key={item.id}
                compact={compactSidebar}
                count={counts[item.id]}
                item={item}
                onPress={() => onChangeView(item.id)}
                selected={item.id === activeView}
              />
            ))}
          </View>
          <View style={styles.sidebarFooter}>
            <Pressable
              accessibilityLabel="重看年度故事"
              accessibilityRole="button"
              disabled={!report || report.status === "empty"}
              onPress={onReplayStory}
              style={({ pressed }) => [
                styles.navButton,
                compactSidebar && styles.navButtonCompact,
                (!report || report.status === "empty") && styles.buttonDisabled,
                pressed && styles.buttonPressed,
                webPointer,
              ]}
            >
              <View style={styles.navIconWrap}><Sparkles color={color.accent} size={20} strokeWidth={2} /></View>
              {!compactSidebar ? <Text style={styles.navLabel}>重看年度故事</Text> : null}
            </Pressable>
            {!compactSidebar ? (
              <View style={styles.localBadge}>
                <View style={styles.localBadgeDot} />
                <View style={styles.localBadgeCopy}>
                  <Text numberOfLines={1} style={styles.localBadgeTitle}>{sourceLabel}</Text>
                  <Text numberOfLines={1} style={styles.localBadgeMeta}>{updatedAt ? `更新 ${formatShortDate(updatedAt)}` : "本地数据"}</Text>
                </View>
              </View>
            ) : null}
            <Pressable
              accessibilityLabel="打开连接与采集设置"
              accessibilityRole="button"
              onPress={onOpenSettings}
              style={({ pressed }) => [styles.settingsButton, compactSidebar && styles.settingsButtonCompact, pressed && styles.buttonPressed, webPointer]}
            >
              <Settings2 color={color.textSecondary} size={19} strokeWidth={2} />
              {!compactSidebar ? <Text style={styles.settingsButtonText}>连接与采集</Text> : null}
            </Pressable>
          </View>
        </View>
      ) : null}

      <View style={[styles.main, mobile && styles.mainMobile]}>
        <View style={[styles.topbar, mobile && styles.topbarMobile]}>
          <View style={styles.topbarHeading}>
            <Text style={styles.topbarEyebrow}>{annualView ? "PERSONAL RECAP" : "CONTENT ARCHIVE"}</Text>
            <View style={styles.topbarTitleRow}>
              <Text numberOfLines={1} style={[styles.topbarTitle, mobile && styles.topbarTitleMobile]}>{currentNav.label}</Text>
              <Text style={styles.topbarCount}>{counts[activeView].toLocaleString("zh-CN")}</Text>
            </View>
          </View>
          <View style={styles.topbarActions}>
            <Pressable
              accessibilityLabel={privacy ? "关闭隐私模式" : "开启隐私模式"}
              accessibilityRole="switch"
              accessibilityState={{ checked: privacy }}
              onPress={onTogglePrivacy}
              style={({ pressed }) => [styles.toolbarButton, privacy && styles.toolbarButtonActive, pressed && styles.buttonPressed, webPointer]}
            >
              {privacy ? <EyeOff color={color.cyan} size={19} /> : <Eye color={color.textSecondary} size={19} />}
            </Pressable>
            <Pressable
              accessibilityLabel="重新增量读取记录"
              accessibilityRole="button"
              disabled={busy}
              onPress={onSync}
              style={({ pressed }) => [styles.toolbarButton, busy && styles.buttonDisabled, pressed && styles.buttonPressed, webPointer]}
            >
              {busy ? <ActivityIndicator color={color.cyan} size="small" /> : <RefreshCw color={color.textSecondary} size={19} />}
            </Pressable>
            {mobile ? (
              <Pressable
                accessibilityLabel="打开连接与采集设置"
                accessibilityRole="button"
                onPress={onOpenSettings}
                style={({ pressed }) => [styles.toolbarButton, pressed && styles.buttonPressed, webPointer]}
              >
                <Settings2 color={color.textSecondary} size={19} />
              </Pressable>
            ) : null}
          </View>
        </View>

        {activeView === "summary" ? (
          report && report.status !== "empty"
            ? <DenseSummaryDashboard mobile={mobile} privacy={privacy} report={report} />
            : <SummaryEmpty />
        ) : activeView === "highlights" ? (
          <HighlightsView mobile={mobile} onOpenRecord={onOpenRecord} privacy={privacy} report={report} />
        ) : (
          <RecordsGallery
            activeType={activeView}
            mobile={mobile}
            onOpenRecord={onOpenRecord}
            onOpenSettings={onOpenSettings}
            privacy={privacy}
            records={records[activeView]}
            sourceLabel={sourceLabel}
            status={status}
            width={width - (mobile ? 0 : compactSidebar ? 82 : 224)}
          />
        )}
      </View>

      {mobile ? (
        <View accessibilityRole="tablist" style={styles.bottomNav}>
          {navItems.map((item) => {
            const selected = item.id === activeView;
            const Icon = item.icon;
            return (
              <Pressable
                key={item.id}
                accessibilityLabel={`${item.label}，${counts[item.id]} 条`}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => onChangeView(item.id)}
                style={({ pressed }) => [styles.bottomNavItem, pressed && styles.buttonPressed, webPointer]}
              >
                <Icon color={selected ? item.accent : color.textMuted} size={20} strokeWidth={selected ? 2.5 : 2} />
                <Text style={[styles.bottomNavLabel, selected && { color: item.accent }]}>{item.label === "观看历史" ? "历史" : item.label}</Text>
                {selected ? <View style={[styles.bottomNavIndicator, { backgroundColor: item.accent }]} /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function Brand({ compact }: { compact: boolean }) {
  return (
    <View style={[styles.brand, compact && styles.brandCompact]}>
      <View style={styles.brandMarkWrap}>
        <View style={styles.brandMarkCyan} />
        <View style={styles.brandMarkRed} />
        <View style={styles.brandMarkCore}><Play color={color.white} fill={color.white} size={12} /></View>
      </View>
      {!compact ? (
        <View>
          <Text style={styles.brandName}>足迹</Text>
          <Text style={styles.brandMeta}>我的内容档案</Text>
        </View>
      ) : null}
    </View>
  );
}

function NavButton({
  compact,
  count,
  item,
  onPress,
  selected,
}: {
  compact: boolean;
  count: number;
  item: (typeof navItems)[number];
  onPress: () => void;
  selected: boolean;
}) {
  const Icon = item.icon;
  return (
    <Pressable
      testID={`workspace-nav-${item.id}`}
      accessibilityLabel={`${item.label}，${count} 条`}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.navButton,
        compact && styles.navButtonCompact,
        selected && styles.navButtonSelected,
        pressed && styles.buttonPressed,
        webPointer,
      ]}
    >
      <View style={[styles.navIconWrap, selected && { backgroundColor: `${item.accent}22` }]}>
        <Icon color={selected ? item.accent : color.textMuted} size={20} strokeWidth={selected ? 2.5 : 2} />
      </View>
      {!compact ? (
        <>
          <Text style={[styles.navLabel, selected && styles.navLabelSelected]}>{item.label}</Text>
          <Text style={[styles.navCount, selected && { color: item.accent }]}>{formatCompactNumber(count)}</Text>
        </>
      ) : null}
      {selected ? <View style={[styles.navIndicator, { backgroundColor: item.accent }]} /> : null}
    </Pressable>
  );
}

function RecordsGallery({
  activeType,
  mobile,
  onOpenRecord,
  onOpenSettings,
  privacy,
  records,
  sourceLabel,
  status,
  width,
}: {
  activeType: PersonalRecordType;
  mobile: boolean;
  onOpenRecord: (url: string) => Promise<void>;
  onOpenSettings: () => void;
  privacy: boolean;
  records: PersonalVideoRecord[];
  sourceLabel: string;
  status: CollectorStatus | null;
  width: number;
}) {
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const columns = mobile ? 2 : width < 760 ? 3 : width < 1120 ? 4 : 5;
  const label = ({ watch_history: "观看历史", liked_videos: "喜欢", favorite_videos: "收藏" })[activeType];
  const sortedRecords = useMemo(() => records, [records]);

  return (
    <FlatList
      testID="record-grid"
      key={`${layout}:${columns}`}
      columnWrapperStyle={layout === "grid" ? styles.gridRow : undefined}
      contentContainerStyle={[styles.galleryContent, mobile && styles.galleryContentMobile, records.length === 0 && styles.galleryContentEmpty]}
      data={sortedRecords}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={(
        <View style={styles.galleryHeader}>
          <View style={styles.galleryHeaderCopy}>
            <Text style={styles.galleryTitle}>{label}</Text>
            <Text style={styles.galleryMeta}>{sourceLabel} · {status?.message ?? `${records.length} 条本地记录`}</Text>
          </View>
          <View accessibilityRole="tablist" style={styles.layoutSwitch}>
            <Pressable
              accessibilityLabel="网格视图"
              accessibilityRole="tab"
              accessibilityState={{ selected: layout === "grid" }}
              onPress={() => setLayout("grid")}
              style={({ pressed }) => [styles.layoutButton, layout === "grid" && styles.layoutButtonSelected, pressed && styles.buttonPressed, webPointer]}
            >
              <LayoutGrid color={layout === "grid" ? color.text : color.textMuted} size={18} />
            </Pressable>
            <Pressable
              accessibilityLabel="列表视图"
              accessibilityRole="tab"
              accessibilityState={{ selected: layout === "list" }}
              onPress={() => setLayout("list")}
              style={({ pressed }) => [styles.layoutButton, layout === "list" && styles.layoutButtonSelected, pressed && styles.buttonPressed, webPointer]}
            >
              <List color={layout === "list" ? color.text : color.textMuted} size={18} />
            </Pressable>
          </View>
        </View>
      )}
      ListEmptyComponent={(
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}><Play color={color.cyan} fill={color.cyan} size={24} /></View>
          <Text style={styles.emptyTitle}>{label}还没有内容</Text>
          <Text style={styles.emptyDetail}>返回连接与采集页面读取本地记录。</Text>
          <Pressable
            accessibilityRole="button"
            onPress={onOpenSettings}
            style={({ pressed }) => [styles.emptyButton, pressed && styles.buttonPressed, webPointer]}
          >
            <Settings2 color={color.black} size={18} />
            <Text style={styles.emptyButtonText}>连接与采集</Text>
          </Pressable>
        </View>
      )}
      numColumns={layout === "grid" ? columns : 1}
      renderItem={({ item }) => layout === "grid"
        ? <RecordTile onOpenRecord={onOpenRecord} privacy={privacy} record={item} type={activeType} />
        : <RecordRow onOpenRecord={onOpenRecord} privacy={privacy} record={item} type={activeType} />}
      showsVerticalScrollIndicator={false}
    />
  );
}

function RecordTile({ record, type, privacy, onOpenRecord }: { record: PersonalVideoRecord; type: PersonalRecordType; privacy: boolean; onOpenRecord: (url: string) => Promise<void> }) {
  const [imageFailed, setImageFailed] = useState(false);
  const accent = type === "liked_videos" ? color.accent : type === "favorite_videos" ? color.amber : color.cyan;
  const imageAvailable = Boolean(record.coverUrl && !privacy && !imageFailed);
  return (
    <Pressable
      accessibilityLabel={`${privacy ? "已隐藏内容" : record.title}${record.url ? "，打开抖音视频" : ""}`}
      accessibilityRole={record.url ? "link" : undefined}
      disabled={!record.url}
      onPress={() => record.url && void onOpenRecord(record.url)}
      style={({ pressed }) => [styles.tile, pressed && styles.tilePressed, record.url && webPointer]}
    >
      <View style={[styles.tileVisual, { backgroundColor: fallbackColor(record.id) }]}>
        {imageAvailable ? (
          <ImageBackground
            accessibilityLabel={privacy ? "已隐藏的视频封面" : `${record.title}的视频封面`}
            imageStyle={styles.tileImage}
            onError={() => setImageFailed(true)}
            resizeMode="cover"
            source={{ uri: record.coverUrl! }}
            style={styles.tileImage}
          />
        ) : (
          <View style={styles.fallbackVisual}>
            <View style={[styles.fallbackDisc, { borderColor: accent }]}><Music2 color={accent} size={26} strokeWidth={1.8} /></View>
            <Text style={styles.fallbackIndex}>{String(hashString(record.id) % 99 + 1).padStart(2, "0")}</Text>
          </View>
        )}
        <View style={styles.tileTopMeta}>
          <View style={[styles.typeBadge, { backgroundColor: accent }]} />
          {record.durationSeconds ? <Text style={styles.durationBadge}>{formatDuration(record.durationSeconds)}</Text> : null}
        </View>
        <View style={styles.tileBottomMeta}>
          {record.watchProgress?.percent !== undefined && record.watchProgress.percent !== null ? (
            <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.max(2, Math.min(100, record.watchProgress.percent))}%`, backgroundColor: accent }]} /></View>
          ) : null}
          <View style={styles.tilePlayMeta}>
            <Play color={color.white} fill={color.white} size={12} />
            <Text style={styles.tilePlayText}>{record.stats?.playCount ? formatCompactNumber(record.stats.playCount) : "记录"}</Text>
          </View>
        </View>
      </View>
      <Text numberOfLines={2} style={styles.tileTitle}>{privacy ? "内容标题已隐藏" : record.title}</Text>
      <View style={styles.tileMetaRow}>
        <Text numberOfLines={1} style={styles.tileAuthor}>{privacy ? "创作者已隐藏" : record.author ?? "未知创作者"}</Text>
        <Text style={styles.tileDate}>{formatShortDate(record.occurredAt)}</Text>
      </View>
    </Pressable>
  );
}

function RecordRow({ record, type, privacy, onOpenRecord }: { record: PersonalVideoRecord; type: PersonalRecordType; privacy: boolean; onOpenRecord: (url: string) => Promise<void> }) {
  const [imageFailed, setImageFailed] = useState(false);
  const accent = type === "liked_videos" ? color.accent : type === "favorite_videos" ? color.amber : color.cyan;
  const imageAvailable = Boolean(record.coverUrl && !privacy && !imageFailed);
  return (
    <Pressable
      accessibilityLabel={`${privacy ? "已隐藏内容" : record.title}${record.url ? "，打开抖音视频" : ""}`}
      accessibilityRole={record.url ? "link" : undefined}
      disabled={!record.url}
      onPress={() => record.url && void onOpenRecord(record.url)}
      style={({ pressed }) => [styles.recordRow, pressed && styles.recordRowPressed, record.url && webPointer]}
    >
      <View style={[styles.rowThumb, { backgroundColor: fallbackColor(record.id) }]}>
        {imageAvailable ? (
          <ImageBackground onError={() => setImageFailed(true)} resizeMode="cover" source={{ uri: record.coverUrl! }} style={styles.rowThumbImage} />
        ) : <Music2 color={accent} size={22} />}
      </View>
      <View style={styles.rowCopy}>
        <Text numberOfLines={2} style={styles.rowTitle}>{privacy ? "内容标题已隐藏" : record.title}</Text>
        <Text numberOfLines={1} style={styles.rowAuthor}>{privacy ? "创作者已隐藏" : record.author ?? "未知创作者"}</Text>
        <View style={styles.rowMeta}>
          <Text style={styles.rowMetaText}>{formatShortDate(record.occurredAt)}</Text>
          {record.durationSeconds ? <Text style={styles.rowMetaText}>{formatDuration(record.durationSeconds)}</Text> : null}
          {record.topics?.[0] ? <Text style={[styles.rowTopic, { color: accent }]}>#{privacy ? "话题" : record.topics[0]}</Text> : null}
        </View>
      </View>
      {record.url ? <ArrowUpRight color={color.textMuted} size={19} /> : null}
    </Pressable>
  );
}

const highlightDefinitions: Array<{
  key: keyof AnnualHighlightsData;
  label: string;
  rule: string;
  accent: string;
}> = [
  { key: "first", label: "首条记录", rule: "按可靠行为时间排序", accent: color.cyan },
  { key: "last", label: "末条记录", rule: "按可靠行为时间排序", accent: color.green },
  { key: "peakDay", label: "峰值日代表", rule: "活跃峰值日中的代表内容", accent: color.accent },
  { key: "longest", label: "最长内容", rule: "按可用时长字段排序", accent: color.amber },
  { key: "mostEngaged", label: "互动快照最高", rule: "按平台互动统计快照合计", accent: color.cyan },
];

function SummaryView({ report, privacy, mobile }: { report: AnnualReport | null; privacy: boolean; mobile: boolean }) {
  if (!report || report.status === "empty") return <SummaryEmpty />;

  const overview = report.overview.data as AnnualOverviewData;
  const monthly = report.monthly.data as AnnualMonthlyData;
  const creators = report.creators.data as AnnualCreatorsData;
  const interests = report.interests.data as AnnualInterestsData;
  const kept = report.kept.data as AnnualKeptData;
  const rhythm = report.rhythm.data as AnnualRhythmData;
  const maxMonth = Math.max(1, ...monthly.months.map((month) => (month.liked ?? 0) + (month.favorite ?? 0)));
  const maxCreator = Math.max(1, ...creators.top.map((creator) => creator.count));
  const hourlyTotals = Array.from({ length: 24 }, (_, hour) => rhythm.heatmap.reduce((sum, cell) => sum + (cell.hour === hour ? cell.count : 0), 0));
  const maxHour = Math.max(1, ...hourlyTotals);
  const rhythmReliable = report.rhythm.status === "ok";
  const weekday = rhythmReliable && rhythm.mostActiveWeekday
    ? ["周一", "周二", "周三", "周四", "周五", "周六", "周日"][rhythm.mostActiveWeekday.weekday]
    : null;
  const activeHour = rhythmReliable && rhythm.mostActiveHour
    ? `${String(rhythm.mostActiveHour.hour).padStart(2, "0")}:00`
    : "不可判断";
  const averageDuration = interests.durationStats.averageSeconds === null
    ? "不可判断"
    : formatDuration(interests.durationStats.averageSeconds);
  const medianDuration = interests.durationStats.medianSeconds === null
    ? "不可判断"
    : formatDuration(interests.durationStats.medianSeconds);
  const unavailableMonthlyLabels = monthly.unavailableSeries.map((series) => series === "liked" ? "喜欢" : "收藏");
  const monthlyNotice = report.monthly.status !== "ok"
    ? report.monthly.reason ?? "可靠时间不足，未绘制月份趋势。"
    : unavailableMonthlyLabels.length > 0
      ? `${unavailableMonthlyLabels.join("、")}缺少可靠行为时间，未绘制该系列。`
      : report.monthly.notices[0] ?? null;
  const keptComparable = report.kept.status === "ok";
  const keptNotice = keptComparable
    ? kept.unknownIdRecordCount > 0
      ? `可比较 videoId 覆盖 ${formatCompactNumber(kept.comparableVideoCount)} 个视频；另有 ${formatCompactNumber(kept.unknownIdRecordCount)} 条记录未进入交集。`
      : null
    : report.kept.reason ?? "当前列表没有可比较的 videoId。";
  const keptPanelNotice = [monthlyNotice, keptNotice].filter(Boolean).join(" ");

  return (
    <ScrollView
      testID="summary-view"
      contentContainerStyle={[styles.summaryContent, mobile && styles.summaryContentMobile]}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.dashboardHeader, mobile && styles.dashboardHeaderMobile]}>
        <View style={styles.dashboardHeaderCopy}>
          <Text style={styles.summaryEyebrow}>CONTENT OVERVIEW · {report.periodLabel.toUpperCase()}</Text>
          <Text style={[styles.summaryTitle, mobile && styles.summaryTitleMobile]}>四类内容信号，一张大屏。</Text>
          <Text style={styles.summaryLead}>使用节奏、内容偏好、创作者与点赞收藏，均来自当前本地样本。</Text>
        </View>
        <View style={[styles.dashboardPeriod, mobile && styles.dashboardPeriodMobile]}>
          <Text numberOfLines={1} style={styles.dashboardPeriodValue}>{report.periodLabel}</Text>
          <Text style={styles.dashboardPeriodMeta}>{overview.activeDays} 个活跃日 · {report.timezone}</Text>
        </View>
      </View>

      {report.snapshotCoverage.partial || report.snapshotCoverage.warnings.length > 0 ? (
        <View style={styles.coverageNotice}>
          <Text style={styles.coverageNoticeLabel}>样本覆盖</Text>
          <Text style={styles.coverageNoticeText}>{report.snapshotCoverage.reliableRecordCount} / {report.snapshotCoverage.recordCount} 条记录带可靠行为时间</Text>
        </View>
      ) : null}

      <View style={[styles.metricStrip, mobile && styles.metricStripMobile]}>
        <SummaryMetric accent={color.cyan} icon={History} label="观看" value={overview.counts.watch} />
        <SummaryMetric accent={color.accent} icon={Heart} label="喜欢" value={overview.counts.liked} />
        <SummaryMetric accent={color.amber} icon={Bookmark} label="收藏" value={overview.counts.favorite} />
        <SummaryMetric accent={color.green} icon={CalendarDays} label="去重内容" value={overview.counts.total} last />
      </View>

      <View style={[styles.analyticsGrid, mobile && styles.analyticsGridMobile]}>
        <View testID="dashboard-panel-rhythm" style={[styles.analyticsPanel, mobile && styles.analyticsPanelMobile]}>
          <PanelHeader icon={Clock3} label="使用节奏" meta={rhythmReliable ? `${activeHour} 最活跃` : "可靠时间不足"} />
          <View
            accessible
            accessibilityLabel={`24 小时可靠记录分布。${rhythmReliable ? `最活跃时段 ${activeHour}` : "样本不足，不生成时段结论"}`}
            style={styles.hourChart}
          >
            {hourlyTotals.map((count, hour) => (
              <View key={hour} style={styles.hourColumn}>
                <View style={[styles.hourBar, { height: Math.max(count > 0 ? 3 : 0, count / maxHour * 82), backgroundColor: hour === rhythm.mostActiveHour?.hour && rhythmReliable ? color.accent : color.cyan }]} />
              </View>
            ))}
          </View>
          <View style={styles.hourAxis}><Text style={styles.hourAxisText}>00</Text><Text style={styles.hourAxisText}>06</Text><Text style={styles.hourAxisText}>12</Text><Text style={styles.hourAxisText}>18</Text><Text style={styles.hourAxisText}>23</Text></View>
          <View style={styles.dashboardFactRow}>
            <DashboardFact label="活跃小时" value={activeHour} />
            <DashboardFact label="活跃星期" value={weekday ?? "不可判断"} />
            <DashboardFact label="可靠记录" value={formatCompactNumber(rhythm.watchRecordCount)} />
          </View>
          {!rhythmReliable ? <PanelNotice text={report.rhythm.reason ?? "可靠行为时间不足，不生成具体时段结论。"} /> : null}
        </View>

        <View testID="dashboard-panel-interests" style={[styles.analyticsPanel, mobile && styles.analyticsPanelMobile]}>
          <PanelHeader icon={Sparkles} label="内容偏好" meta={`${interests.signalCount} 个显式信号`} />
          <View style={styles.topicWrap}>
            {interests.topics.slice(0, 8).map((topic, index) => (
              <View key={topic.name} style={styles.topicChip}>
                <Text style={styles.topicName}>#{privacy ? `话题${index + 1}` : topic.name}</Text>
                <Text style={styles.topicCount}>{topic.count}</Text>
              </View>
            ))}
            {interests.topics.length === 0 ? <Text style={styles.panelEmpty}>喜欢与收藏中没有可识别话题</Text> : null}
          </View>
          <View style={styles.panelRule} />
          <View style={styles.signalRows}>
            <SignalRow icon={Music2} label="常用音乐" value={privacy ? (interests.music[0] ? "已隐藏" : "暂无") : interests.music[0]?.title ?? "暂无"} />
            <SignalRow icon={Clock3} label="平均时长" value={averageDuration} />
            <SignalRow icon={BarChart3} label="中位时长" value={medianDuration} />
          </View>
          {report.interests.status !== "ok" ? <PanelNotice text={report.interests.reason ?? "显式偏好信号不足。"} /> : null}
        </View>

        <View testID="dashboard-panel-creators" style={[styles.analyticsPanel, mobile && styles.analyticsPanelMobile]}>
          <PanelHeader icon={Users} label="创作者" meta={`${creators.creatorCount} 位可识别`} />
          <View style={styles.creatorList}>
            {creators.top.slice(0, 5).map((creator, index) => (
              <View key={`${creator.authorId ?? creator.name}:${index}`} style={styles.creatorRow}>
                <Text style={styles.creatorRank}>{String(index + 1).padStart(2, "0")}</Text>
                <View style={styles.creatorCopy}>
                  <View style={styles.creatorTitleRow}>
                    <Text numberOfLines={1} style={styles.creatorName}>{privacy ? `创作者 ${index + 1}` : creator.name}</Text>
                    <Text style={styles.creatorValue}>{creator.count}</Text>
                  </View>
                  <View style={styles.creatorTrack}><View style={[styles.creatorFill, { width: `${Math.max(4, creator.count / maxCreator * 100)}%` }]} /></View>
                </View>
              </View>
            ))}
            {creators.top.length === 0 ? <Text style={styles.panelEmpty}>暂无可识别创作者</Text> : null}
          </View>
          <View style={styles.dashboardFactRow}>
            <DashboardFact label="头部占比" value={`${Math.round(creators.headShare * 100)}%`} />
            <DashboardFact label="探索范围" value={`${Math.round(creators.exploration * 100)}%`} />
          </View>
        </View>

        <View testID="dashboard-panel-kept" style={[styles.analyticsPanel, mobile && styles.analyticsPanelMobile]}>
          <PanelHeader icon={Heart} label="点赞与收藏" meta={monthly.peakMonth ? `峰值 ${monthly.peakMonth.label}` : "月份趋势不可用"} />
          <View style={styles.monthChart}>
            {monthly.months.map((month) => {
              const likedHeight = ((month.liked ?? 0) / maxMonth) * 84;
              const favoriteHeight = ((month.favorite ?? 0) / maxMonth) * 84;
              return (
                <View key={month.month} style={styles.monthColumn}>
                  <View style={styles.monthBars}>
                    <View style={[styles.monthBar, { height: Math.max(month.liked ? 3 : 0, likedHeight), backgroundColor: monthly.seriesAvailability.liked ? color.accent : "transparent" }]} />
                    <View style={[styles.monthBar, { height: Math.max(month.favorite ? 3 : 0, favoriteHeight), backgroundColor: monthly.seriesAvailability.favorite ? color.amber : "transparent" }]} />
                  </View>
                  <Text style={styles.monthLabel}>{month.month}</Text>
                </View>
              );
            })}
          </View>
          <View style={styles.legendRow}>
            {monthly.seriesAvailability.liked ? <Legend color={color.accent} label="喜欢" /> : null}
            {monthly.seriesAvailability.favorite ? <Legend color={color.amber} label="收藏" /> : null}
            {!monthly.seriesAvailability.liked && !monthly.seriesAvailability.favorite ? <Text style={styles.legendLabel}>月份趋势不可分析</Text> : null}
          </View>
          <View style={styles.intersectionGrid}>
            <IntersectionMetric accent={color.accent} label="喜欢 ∩ 收藏" value={keptComparable ? kept.pairwise.likedFavorite : null} />
            <IntersectionMetric accent={color.cyan} label="观看 ∩ 喜欢" value={keptComparable ? kept.pairwise.watchLiked : null} />
            <IntersectionMetric accent={color.amber} label="观看 ∩ 收藏" value={keptComparable ? kept.pairwise.watchFavorite : null} />
            <IntersectionMetric accent={color.green} label="三类列表都有" value={keptComparable ? kept.allThree : null} />
          </View>
          <Text style={styles.snapshotNote}>当前列表快照，不代表行为转化</Text>
          {keptPanelNotice ? <PanelNotice text={keptPanelNotice} /> : null}
        </View>
      </View>
    </ScrollView>
  );
}

function HighlightsView({
  report,
  privacy,
  mobile,
  onOpenRecord,
}: {
  report: AnnualReport | null;
  privacy: boolean;
  mobile: boolean;
  onOpenRecord: (url: string) => Promise<void>;
}) {
  if (!report || report.status === "empty") return <SummaryEmpty />;
  const highlights = report.highlights.data as AnnualHighlightsData;
  const availableCount = highlightDefinitions.filter(({ key }) => Boolean(highlights[key])).length;
  const highlightNotice = [
    report.highlights.status !== "ok" ? report.highlights.reason : null,
    ...report.highlights.notices,
  ].filter((notice, index, notices): notice is string => Boolean(notice) && notices.indexOf(notice) === index).join(" ");

  return (
    <ScrollView
      testID="highlights-view"
      contentContainerStyle={[styles.highlightsContent, mobile && styles.summaryContentMobile]}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.highlightsHeader, mobile && styles.highlightsHeaderMobile]}>
        <View style={styles.dashboardHeaderCopy}>
          <Text style={styles.summaryEyebrow}>HIGHLIGHTS · {report.periodLabel.toUpperCase()}</Text>
          <Text style={[styles.summaryTitle, mobile && styles.summaryTitleMobile]}>年度高光</Text>
          <Text style={styles.summaryLead}>五个规则坐标来自当前本地样本；缺少可靠字段时保留为空，不补写结论。</Text>
        </View>
        <View style={[styles.highlightCountBlock, mobile && styles.dashboardPeriodMobile]}>
          <Text style={styles.highlightCountValue}>{availableCount}</Text>
          <Text style={styles.dashboardPeriodMeta}>项可确定高光</Text>
        </View>
      </View>
      {highlightNotice ? <PanelNotice text={highlightNotice} /> : null}

      <View style={[styles.highlightsGrid, mobile && styles.highlightsGridMobile]}>
        {highlightDefinitions.map((definition, index) => (
          <HighlightCard
            key={definition.key}
            accent={definition.accent}
            index={index}
            item={highlights[definition.key]}
            label={definition.label}
            mobile={mobile}
            onOpenRecord={onOpenRecord}
            privacy={privacy}
            rule={definition.rule}
          />
        ))}
      </View>
      <View style={styles.highlightsFootnote}>
        <Star color={color.amber} size={16} />
        <Text style={styles.highlightsFootnoteText}>互动最高仅表示平台统计快照；首条、末条与峰值日仅使用可靠行为时间。</Text>
      </View>
    </ScrollView>
  );
}

function HighlightCard({
  accent,
  index,
  item,
  label,
  mobile,
  onOpenRecord,
  privacy,
  rule,
}: {
  accent: string;
  index: number;
  item: AnnualContentRef | null;
  label: string;
  mobile: boolean;
  onOpenRecord: (url: string) => Promise<void>;
  privacy: boolean;
  rule: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [item?.coverUrl]);
  const imageAvailable = Boolean(item?.coverUrl && !privacy && !imageFailed);
  const canOpen = Boolean(item?.url && !privacy);
  const title = item ? (privacy ? "内容标题已隐藏" : item.title) : "暂无可确定内容";
  const author = item ? (privacy ? "创作者已隐藏" : item.author ?? "未知创作者") : "当前样本缺少对应记录";
  const detail = item ? (privacy ? "详情已替换" : formatHighlightDetail(item)) : "等待更多可靠数据";

  return (
    <Pressable
      accessibilityLabel={`${label}：${title}${canOpen ? "，打开抖音视频" : ""}`}
      accessibilityRole={canOpen ? "link" : undefined}
      disabled={!canOpen}
      onPress={() => item?.url && void onOpenRecord(item.url)}
      style={({ pressed }) => [
        styles.highlightCard,
        mobile && styles.highlightCardMobile,
        { borderTopColor: accent },
        !item && styles.highlightCardEmpty,
        pressed && styles.tilePressed,
        canOpen && webPointer,
      ]}
    >
      <View style={[styles.highlightVisual, { backgroundColor: fallbackColor(`${label}:${index}`) }]}>
        {imageAvailable ? (
          <ImageBackground
            accessibilityLabel={`${title}的视频封面`}
            onError={() => setImageFailed(true)}
            resizeMode="cover"
            source={{ uri: item!.coverUrl! }}
            style={styles.highlightImage}
          />
        ) : (
          <View style={styles.highlightFallback}>
            <Star color={accent} size={38} strokeWidth={1.7} />
            <Text style={styles.highlightIndex}>{String(index + 1).padStart(2, "0")}</Text>
          </View>
        )}
        <View style={[styles.highlightLabel, { borderColor: accent }]}><Text style={styles.highlightLabelText}>{label}</Text></View>
      </View>
      <View style={styles.highlightBody}>
        <Text numberOfLines={2} style={styles.highlightTitle}>{title}</Text>
        <Text numberOfLines={1} style={styles.highlightAuthor}>{author}</Text>
        <Text style={styles.highlightDetail}>{detail}</Text>
        <View style={styles.highlightRuleRow}>
          <Text style={styles.highlightRule}>{rule}</Text>
          {canOpen ? <ArrowUpRight color={color.textMuted} size={17} /> : null}
        </View>
      </View>
    </Pressable>
  );
}

function SummaryEmpty() {
  return (
    <View style={styles.summaryEmpty}>
      <Sparkles color={color.green} size={30} />
      <Text style={styles.emptyTitle}>还没有可以总结的记录</Text>
      <Text style={styles.emptyDetail}>完成一次读取后，数据大屏和年度高光会自动生成。</Text>
    </View>
  );
}

function SummaryMetric({ accent, icon: Icon, label, value, last = false }: { accent: string; icon: IconComponent; label: string; value: number; last?: boolean }) {
  return (
    <View style={[styles.summaryMetric, last && styles.summaryMetricLast]}>
      <Icon color={accent} size={19} strokeWidth={2} />
      <View style={styles.summaryMetricCopy}>
        <Text style={styles.summaryMetricValue}>{formatCompactNumber(value)}</Text>
        <Text style={styles.summaryMetricLabel}>{label}</Text>
      </View>
    </View>
  );
}

function PanelHeader({ icon: Icon, label, meta }: { icon: IconComponent; label: string; meta: string }) {
  return (
    <View style={styles.panelHeader}>
      <View style={styles.panelHeaderIcon}><Icon color={color.cyan} size={18} strokeWidth={2} /></View>
      <Text style={styles.panelTitle}>{label}</Text>
      <Text style={styles.panelMeta}>{meta}</Text>
    </View>
  );
}

function Legend({ color: accent, label }: { color: string; label: string }) {
  return <View style={styles.legend}><View style={[styles.legendSwatch, { backgroundColor: accent }]} /><Text style={styles.legendLabel}>{label}</Text></View>;
}

function SignalRow({ icon: Icon, label, value }: { icon: IconComponent; label: string; value: string }) {
  return (
    <View style={styles.signalRow}>
      <Icon color={color.textMuted} size={16} />
      <Text style={styles.signalLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.signalValue}>{value}</Text>
    </View>
  );
}

function DashboardFact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.dashboardFact}>
      <Text style={styles.dashboardFactLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.dashboardFactValue}>{value}</Text>
    </View>
  );
}

function IntersectionMetric({ accent, label, value }: { accent: string; label: string; value: number | null }) {
  return (
    <View style={styles.intersectionMetric}>
      <View style={[styles.intersectionMark, { backgroundColor: accent }]} />
      <View style={styles.intersectionCopy}>
        <Text style={styles.intersectionLabel}>{label}</Text>
        <Text style={styles.intersectionValue}>{value === null ? "不可比较" : formatCompactNumber(value)}</Text>
      </View>
    </View>
  );
}

function PanelNotice({ text }: { text: string }) {
  return <Text style={styles.panelNotice}>{text}</Text>;
}

function formatCompactNumber(value: number): string {
  if (value >= 10_000) return `${(value / 10_000).toFixed(value >= 100_000 ? 0 : 1)}万`;
  return value.toLocaleString("zh-CN");
}

function formatShortDate(value: string | null): string {
  if (!value) return "时间未知";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "时间未知";
  return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

function formatDuration(seconds: number): string {
  const rounded = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  return `${minutes}:${String(rounded % 60).padStart(2, "0")}`;
}

function formatHighlightDetail(item: AnnualContentRef): string {
  const parts: string[] = [];
  if (item.occurredAt) {
    const date = new Date(item.occurredAt);
    if (Number.isFinite(date.getTime())) {
      parts.push(date.toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }));
    }
  }
  if (item.durationSeconds !== null) parts.push(formatDuration(item.durationSeconds));
  if (item.interactionScore !== null) parts.push(`互动快照 ${formatCompactNumber(item.interactionScore)}`);
  return parts.join(" · ") || "时间与辅助字段不可确定";
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  return Math.abs(hash);
}

function fallbackColor(value: string): string {
  const palette = ["#172B35", "#2C1E31", "#252A1B", "#1D2638", "#33211D", "#24232E"];
  return palette[hashString(value) % palette.length]!;
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: "100%", flexDirection: "row", backgroundColor: color.canvas },
  sidebar: { width: 224, flexShrink: 0, paddingHorizontal: 14, paddingBottom: 16, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: color.border, backgroundColor: color.sidebar },
  sidebarCompact: { width: 82, paddingHorizontal: 9 },
  brand: { height: 72, flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 10 },
  brandCompact: { justifyContent: "center", paddingHorizontal: 0 },
  brandMarkWrap: { width: 38, height: 38, position: "relative", alignItems: "center", justifyContent: "center" },
  brandMarkCyan: { position: "absolute", width: 26, height: 26, left: 3, top: 4, borderRadius: 7, backgroundColor: color.cyan },
  brandMarkRed: { position: "absolute", width: 26, height: 26, right: 3, bottom: 4, borderRadius: 7, backgroundColor: color.accent },
  brandMarkCore: { width: 26, height: 26, zIndex: 2, alignItems: "center", justifyContent: "center", borderRadius: 7, backgroundColor: color.black },
  brandName: { color: color.text, fontSize: 17, fontWeight: "900" },
  brandMeta: { color: color.textMuted, fontSize: 10, marginTop: 1 },
  sidebarNav: { flex: 1, gap: 4, paddingTop: 20 },
  sidebarSectionLabel: { color: color.textMuted, fontSize: 9, fontWeight: "900", paddingHorizontal: 8, paddingBottom: 5 },
  sidebarSectionLabelAnnual: { marginTop: 15 },
  sidebarCompactDivider: { height: 1, marginHorizontal: 8, marginVertical: 10, backgroundColor: color.border },
  navButton: { position: "relative", minHeight: 52, flexDirection: "row", alignItems: "center", paddingHorizontal: 8, borderRadius: radius.medium },
  navButtonCompact: { justifyContent: "center", paddingHorizontal: 0 },
  navButtonSelected: { backgroundColor: color.surfaceRaised },
  navIconWrap: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: radius.medium },
  navLabel: { flex: 1, color: color.textSecondary, fontSize: 13, fontWeight: "700", marginLeft: 7 },
  navLabelSelected: { color: color.text, fontWeight: "900" },
  navCount: { color: color.textMuted, fontSize: 10, fontWeight: "700", marginRight: 6 },
  navIndicator: { position: "absolute", left: -14, top: 14, bottom: 14, width: 3, borderTopRightRadius: 2, borderBottomRightRadius: 2 },
  sidebarFooter: { gap: 8 },
  localBadge: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border },
  localBadgeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.green },
  localBadgeCopy: { flex: 1, minWidth: 0 },
  localBadgeTitle: { color: color.textSecondary, fontSize: 11, fontWeight: "800" },
  localBadgeMeta: { color: color.textMuted, fontSize: 9, marginTop: 3 },
  settingsButton: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 17, borderWidth: 1, borderColor: color.border, borderRadius: radius.medium, backgroundColor: color.surface },
  settingsButtonCompact: { justifyContent: "center", paddingHorizontal: 0 },
  settingsButtonText: { color: color.textSecondary, fontSize: 12, fontWeight: "800" },
  main: { flex: 1, minWidth: 0, backgroundColor: color.canvas },
  mainMobile: { paddingBottom: 68 },
  topbar: { height: 72, flexDirection: "row", alignItems: "center", paddingHorizontal: 28, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.border, backgroundColor: color.canvas },
  topbarMobile: { height: 64, paddingHorizontal: 16 },
  topbarHeading: { flex: 1, minWidth: 0 },
  topbarEyebrow: { color: color.textMuted, fontSize: 9, fontWeight: "900" },
  topbarTitleRow: { flexDirection: "row", alignItems: "baseline", gap: 9, marginTop: 3 },
  topbarTitle: { maxWidth: "80%", color: color.text, fontSize: 19, fontWeight: "900" },
  topbarTitleMobile: { fontSize: 17 },
  topbarCount: { color: color.textMuted, fontSize: 11, fontWeight: "800", fontVariant: ["tabular-nums"] },
  topbarActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  toolbarButton: { width: 46, height: 46, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: color.borderSoft, borderRadius: radius.medium, backgroundColor: color.surface },
  toolbarButtonActive: { borderColor: color.cyan, backgroundColor: color.cyanSoft },
  galleryContent: { paddingHorizontal: 28, paddingTop: 18, paddingBottom: 42 },
  galleryContentMobile: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 28 },
  galleryContentEmpty: { flexGrow: 1 },
  galleryHeader: { minHeight: 60, flexDirection: "row", alignItems: "center", marginBottom: 14 },
  galleryHeaderCopy: { flex: 1, minWidth: 0 },
  galleryTitle: { color: color.text, fontSize: 16, fontWeight: "900" },
  galleryMeta: { color: color.textMuted, fontSize: 10, marginTop: 5 },
  layoutSwitch: { height: 42, flexDirection: "row", padding: 3, borderWidth: 1, borderColor: color.border, borderRadius: radius.medium, backgroundColor: color.sidebar },
  layoutButton: { width: 40, height: 34, alignItems: "center", justifyContent: "center", borderRadius: radius.small },
  layoutButtonSelected: { backgroundColor: color.surfaceMuted },
  gridRow: { gap: 12 },
  tile: { flex: 1, minWidth: 0, marginBottom: 22 },
  tilePressed: { opacity: 0.74 },
  tileVisual: { position: "relative", width: "100%", aspectRatio: 0.76, overflow: "hidden", borderRadius: radius.small, backgroundColor: color.surface },
  tileImage: { width: "100%", height: "100%" },
  fallbackVisual: { flex: 1, alignItems: "center", justifyContent: "center" },
  fallbackDisc: { width: 62, height: 62, alignItems: "center", justifyContent: "center", borderWidth: 1, borderRadius: 31, backgroundColor: color.scrim },
  fallbackIndex: { position: "absolute", right: 10, bottom: 8, color: "rgba(255,255,255,0.24)", fontSize: 30, fontWeight: "900" },
  tileTopMeta: { position: "absolute", top: 9, right: 9, left: 9, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  typeBadge: { width: 8, height: 8, borderRadius: 4 },
  durationBadge: { color: color.white, fontSize: 10, fontWeight: "800", paddingHorizontal: 6, paddingVertical: 3, borderRadius: radius.small, backgroundColor: color.scrim },
  tileBottomMeta: { position: "absolute", right: 0, bottom: 0, left: 0, padding: 9, backgroundColor: color.scrim },
  progressTrack: { height: 2, overflow: "hidden", marginBottom: 7, backgroundColor: "rgba(255,255,255,0.22)" },
  progressFill: { height: 2 },
  tilePlayMeta: { flexDirection: "row", alignItems: "center", gap: 5 },
  tilePlayText: { color: color.white, fontSize: 10, fontWeight: "700" },
  tileTitle: { minHeight: 39, color: color.text, fontSize: 13, lineHeight: 19, fontWeight: "700", marginTop: 9 },
  tileMetaRow: { minHeight: 20, flexDirection: "row", alignItems: "center", gap: 8, marginTop: 3 },
  tileAuthor: { flex: 1, color: color.textMuted, fontSize: 10 },
  tileDate: { color: color.textMuted, fontSize: 9 },
  recordRow: { minHeight: 112, flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.border },
  recordRowPressed: { backgroundColor: color.surface },
  rowThumb: { width: 72, height: 92, flexShrink: 0, alignItems: "center", justifyContent: "center", overflow: "hidden", borderRadius: radius.small },
  rowThumbImage: { width: "100%", height: "100%" },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: { color: color.text, fontSize: 14, lineHeight: 20, fontWeight: "800" },
  rowAuthor: { color: color.textSecondary, fontSize: 11, marginTop: 6 },
  rowMeta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10, marginTop: 8 },
  rowMetaText: { color: color.textMuted, fontSize: 10 },
  rowTopic: { fontSize: 10, fontWeight: "700" },
  emptyState: { flex: 1, minHeight: 360, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  emptyIcon: { width: 58, height: 58, alignItems: "center", justifyContent: "center", borderRadius: 29, backgroundColor: color.cyanSoft },
  emptyTitle: { color: color.text, fontSize: 16, fontWeight: "900", marginTop: 16 },
  emptyDetail: { color: color.textMuted, fontSize: 12, lineHeight: 19, textAlign: "center", marginTop: 7 },
  emptyButton: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 8, marginTop: 20, paddingHorizontal: 16, borderRadius: radius.medium, backgroundColor: color.cyan },
  emptyButtonText: { color: color.black, fontSize: 12, fontWeight: "900" },
  bottomNav: { position: "absolute", right: 0, bottom: 0, left: 0, height: 68, flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border, backgroundColor: color.sidebar, zIndex: 20 },
  bottomNavItem: { position: "relative", flex: 1, minWidth: 0, alignItems: "center", justifyContent: "center", gap: 4 },
  bottomNavLabel: { color: color.textMuted, fontSize: 10, fontWeight: "700" },
  bottomNavIndicator: { position: "absolute", top: 0, width: 28, height: 2 },
  summaryContent: { padding: 28, paddingBottom: 44 },
  summaryContentMobile: { padding: 12, paddingBottom: 86 },
  dashboardHeader: { minHeight: 128, flexDirection: "row", alignItems: "center", gap: 28, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: color.border },
  dashboardHeaderMobile: { minHeight: 0, flexDirection: "column", alignItems: "stretch", gap: 16, paddingVertical: 16 },
  dashboardHeaderCopy: { flex: 1, minWidth: 0 },
  dashboardPeriod: { width: 240, alignItems: "flex-end", paddingLeft: 20, borderLeftWidth: 1, borderLeftColor: color.border },
  dashboardPeriodMobile: { width: "100%", alignItems: "flex-start", paddingLeft: 0, paddingTop: 14, borderTopWidth: 1, borderTopColor: color.border, borderLeftWidth: 0 },
  dashboardPeriodValue: { maxWidth: "100%", color: color.text, fontSize: 22, lineHeight: 28, fontWeight: "900" },
  dashboardPeriodMeta: { color: color.textMuted, fontSize: 10, lineHeight: 16, marginTop: 5 },
  summaryEyebrow: { color: color.cyan, fontSize: 10, fontWeight: "900" },
  summaryTitle: { maxWidth: 720, color: color.text, fontSize: 30, lineHeight: 38, fontWeight: "900", marginTop: 7 },
  summaryTitleMobile: { fontSize: 24, lineHeight: 32 },
  summaryLead: { color: color.textSecondary, fontSize: 12, lineHeight: 20, marginTop: 12 },
  coverageNotice: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 12, marginTop: 14, paddingHorizontal: 14, borderLeftWidth: 3, borderLeftColor: color.amber, backgroundColor: color.amberSoft },
  coverageNoticeLabel: { color: color.amber, fontSize: 10, fontWeight: "900" },
  coverageNoticeText: { flex: 1, color: color.textSecondary, fontSize: 10 },
  metricStrip: { minHeight: 78, flexDirection: "row", marginTop: 14, borderTopWidth: 1, borderBottomWidth: 1, borderColor: color.border },
  metricStripMobile: { flexWrap: "wrap" },
  summaryMetric: { flex: 1, minWidth: 140, flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 18, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: color.border },
  summaryMetricLast: { borderRightWidth: 0 },
  summaryMetricCopy: { minWidth: 0 },
  summaryMetricValue: { color: color.text, fontSize: 20, fontWeight: "900" },
  summaryMetricLabel: { color: color.textMuted, fontSize: 10, marginTop: 3 },
  analyticsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 14 },
  analyticsGridMobile: { flexDirection: "column" },
  analyticsPanel: { flexGrow: 1, width: "49%", minHeight: 320, padding: 18, borderWidth: 1, borderColor: color.border, borderRadius: radius.large, backgroundColor: color.surface },
  analyticsPanelMobile: { width: "100%" },
  panelHeader: { minHeight: 36, flexDirection: "row", alignItems: "center", gap: 9 },
  panelHeaderIcon: { width: 30, height: 30, alignItems: "center", justifyContent: "center", borderRadius: radius.small, backgroundColor: color.cyanSoft },
  panelTitle: { flex: 1, color: color.text, fontSize: 13, fontWeight: "900" },
  panelMeta: { color: color.textMuted, fontSize: 9, fontWeight: "700" },
  hourChart: { height: 92, flexDirection: "row", alignItems: "flex-end", gap: 3, marginTop: 18, paddingTop: 6, borderBottomWidth: 1, borderBottomColor: color.border },
  hourColumn: { flex: 1, minWidth: 0, height: 84, justifyContent: "flex-end" },
  hourBar: { width: "100%", minHeight: 0, opacity: 0.9 },
  hourAxis: { flexDirection: "row", justifyContent: "space-between", marginTop: 5 },
  hourAxisText: { color: color.textMuted, fontSize: 8, fontVariant: ["tabular-nums"] },
  dashboardFactRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 16 },
  dashboardFact: { flex: 1, minWidth: 90, minHeight: 54, justifyContent: "center", paddingHorizontal: 10, borderLeftWidth: 2, borderLeftColor: color.border, backgroundColor: color.surfaceRaised },
  dashboardFactLabel: { color: color.textMuted, fontSize: 9 },
  dashboardFactValue: { color: color.text, fontSize: 13, fontWeight: "900", marginTop: 4 },
  panelNotice: { color: color.amber, fontSize: 9, lineHeight: 15, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: color.border },
  monthChart: { height: 112, flexDirection: "row", alignItems: "flex-end", gap: 4, marginTop: 14 },
  monthColumn: { flex: 1, minWidth: 0, height: 104, alignItems: "center", justifyContent: "flex-end" },
  monthBars: { height: 86, flexDirection: "row", alignItems: "flex-end", gap: 2 },
  monthBar: { width: 5, minHeight: 0, borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  monthLabel: { color: color.textMuted, fontSize: 8, marginTop: 5 },
  legendRow: { flexDirection: "row", gap: 16, marginTop: 6 },
  legend: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendSwatch: { width: 14, height: 4, borderRadius: 2 },
  legendLabel: { color: color.textMuted, fontSize: 9 },
  creatorList: { marginTop: 15 },
  creatorRow: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: 10 },
  creatorRank: { width: 20, color: color.textMuted, fontSize: 9, fontWeight: "900" },
  creatorCopy: { flex: 1, minWidth: 0 },
  creatorTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  creatorName: { flex: 1, color: color.textSecondary, fontSize: 11, fontWeight: "700" },
  creatorValue: { color: color.text, fontSize: 10, fontWeight: "900" },
  creatorTrack: { height: 3, overflow: "hidden", marginTop: 6, backgroundColor: color.surfaceMuted },
  creatorFill: { height: 3, backgroundColor: color.cyan },
  panelEmpty: { color: color.textMuted, fontSize: 11, lineHeight: 18, paddingVertical: 24 },
  topicWrap: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 17 },
  topicChip: { minHeight: 30, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 9, borderWidth: 1, borderColor: color.border, borderRadius: radius.small, backgroundColor: color.surfaceRaised },
  topicName: { color: color.textSecondary, fontSize: 10, fontWeight: "700" },
  topicCount: { color: color.accent, fontSize: 9, fontWeight: "900" },
  panelRule: { height: 1, marginVertical: 15, backgroundColor: color.border },
  signalRows: { gap: 2 },
  signalRow: { minHeight: 34, flexDirection: "row", alignItems: "center", gap: 8 },
  signalLabel: { width: 66, color: color.textMuted, fontSize: 9 },
  signalValue: { flex: 1, color: color.textSecondary, fontSize: 10, fontWeight: "700", textAlign: "right" },
  intersectionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 12 },
  intersectionMetric: { width: "48.8%", minHeight: 48, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 9, backgroundColor: color.surfaceRaised },
  intersectionMark: { width: 3, height: 20 },
  intersectionCopy: { flex: 1, minWidth: 0 },
  intersectionLabel: { color: color.textMuted, fontSize: 8 },
  intersectionValue: { color: color.text, fontSize: 13, fontWeight: "900", marginTop: 2 },
  snapshotNote: { color: color.textMuted, fontSize: 9, lineHeight: 15, marginTop: 10 },
  highlightsContent: { padding: 28, paddingBottom: 44 },
  highlightsHeader: { minHeight: 128, flexDirection: "row", alignItems: "center", gap: 28, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: color.border },
  highlightsHeaderMobile: { minHeight: 0, flexDirection: "column", alignItems: "stretch", gap: 16, paddingVertical: 16 },
  highlightCountBlock: { width: 180, alignItems: "flex-end", paddingLeft: 20, borderLeftWidth: 1, borderLeftColor: color.border },
  highlightCountValue: { color: color.text, fontSize: 38, lineHeight: 42, fontWeight: "900", fontVariant: ["tabular-nums"] },
  highlightsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 18 },
  highlightsGridMobile: { flexDirection: "column" },
  highlightCard: { width: "32%", minWidth: 260, minHeight: 338, overflow: "hidden", borderWidth: 1, borderTopWidth: 4, borderColor: color.border, borderRadius: radius.large, backgroundColor: color.surface },
  highlightCardMobile: { width: "100%", minWidth: 0 },
  highlightCardEmpty: { opacity: 0.72 },
  highlightVisual: { position: "relative", height: 190, overflow: "hidden" },
  highlightImage: { width: "100%", height: "100%" },
  highlightFallback: { flex: 1, alignItems: "center", justifyContent: "center" },
  highlightIndex: { position: "absolute", right: 14, bottom: 8, color: "rgba(255,255,255,0.24)", fontSize: 34, fontWeight: "900" },
  highlightLabel: { position: "absolute", top: 12, left: 12, minHeight: 28, justifyContent: "center", paddingHorizontal: 9, borderWidth: 1, borderRadius: radius.small, backgroundColor: color.scrim },
  highlightLabelText: { color: color.white, fontSize: 9, fontWeight: "900" },
  highlightBody: { flex: 1, padding: 15 },
  highlightTitle: { minHeight: 42, color: color.text, fontSize: 14, lineHeight: 20, fontWeight: "900" },
  highlightAuthor: { color: color.textSecondary, fontSize: 10, marginTop: 7 },
  highlightDetail: { color: color.textMuted, fontSize: 9, marginTop: 5 },
  highlightRuleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: "auto", paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border },
  highlightRule: { flex: 1, color: color.textMuted, fontSize: 9, lineHeight: 14 },
  highlightsFootnote: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16, paddingHorizontal: 14, borderLeftWidth: 3, borderLeftColor: color.amber, backgroundColor: color.amberSoft },
  highlightsFootnoteText: { flex: 1, color: color.textSecondary, fontSize: 10, lineHeight: 16 },
  summaryEmpty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  buttonPressed: { opacity: 0.7 },
  buttonDisabled: { opacity: 0.38 },
});
