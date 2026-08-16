import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  Activity,
  BarChart3,
  Bookmark,
  CalendarDays,
  Clock3,
  Heart,
  History,
  Music2,
  Sparkles,
  Users,
} from "lucide-react-native";

import type {
  AnnualCalendarDay,
  AnnualContentRef,
  AnnualCreatorsData,
  AnnualInterestsData,
  AnnualKeptData,
  AnnualMonthlyData,
  AnnualOverviewData,
  AnnualReport,
  AnnualRhythmData,
} from "../../domain/annualReport";
import { workspaceColors as color, workspaceRadii as radius } from "./workspaceTheme";

type IconComponent = React.ComponentType<{
  color?: string;
  size?: number;
  strokeWidth?: number;
}>;

export interface DenseSummaryDashboardProps {
  report: AnnualReport;
  privacy: boolean;
  mobile: boolean;
}

const WEEKDAY_LABELS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const CALENDAR_COLORS = [color.surfaceRaised, "#14393A", "#17615F", "#1B9A95", color.cyan];
const LIST_LABELS = {
  watch_history: "观看",
  liked_videos: "喜欢",
  favorite_videos: "收藏",
} as const;

export function DenseSummaryDashboard({ report, privacy, mobile }: DenseSummaryDashboardProps) {
  const overview = report.overview.data as AnnualOverviewData;
  const monthly = report.monthly.data as AnnualMonthlyData;
  const creators = report.creators.data as AnnualCreatorsData;
  const interests = report.interests.data as AnnualInterestsData;
  const kept = report.kept.data as AnnualKeptData;
  const rhythm = report.rhythm.data as AnnualRhythmData;
  const coverage = overview.coverage;
  const totalEvents = overview.counts.watchEvents + overview.counts.likedEvents + overview.counts.favoriteEvents;
  const reliablePercent = Math.round(coverage.reliableDateRatio * 100);
  const activeHour = report.rhythm.status === "ok" && rhythm.mostActiveHour
    ? `${String(rhythm.mostActiveHour.hour).padStart(2, "0")}:00`
    : "不可判断";
  const activeWeekday = report.rhythm.status === "ok" && rhythm.mostActiveWeekday
    ? WEEKDAY_LABELS[rhythm.mostActiveWeekday.weekday] ?? "不可判断"
    : "不可判断";
  const maxCreator = Math.max(1, ...creators.top.map((creator) => creator.count));
  const maxMonth = Math.max(1, ...monthly.months.map((month) => (month.liked ?? 0) + (month.favorite ?? 0)));
  const maxTopic = Math.max(1, ...interests.topics.map((topic) => topic.count));
  const maxDuration = Math.max(1, ...interests.durations.map((bucket) => bucket.count));
  const maxHeat = Math.max(1, ...rhythm.heatmap.map((cell) => cell.count));
  const nightCount = rhythm.heatmap.reduce((sum, cell) => sum + (cell.hour <= 5 ? cell.count : 0), 0);
  const nightShare = rhythm.watchRecordCount > 0 ? nightCount / rhythm.watchRecordCount : 0;
  const overlapComparable = report.kept.status === "ok";
  const monthlyNotice = monthlyNoticeFor(report, monthly);

  return (
    <ScrollView
      testID="summary-view"
      contentContainerStyle={[styles.content, mobile && styles.contentMobile]}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.header, mobile && styles.headerMobile]}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>CONTENT OVERVIEW · {report.periodLabel.toUpperCase()}</Text>
          <Text style={[styles.title, mobile && styles.titleMobile]}>你的内容样本，集中看完整。</Text>
          <Text style={styles.lead}>总量、时间、偏好、创作者与列表交集均来自当前本地数据。</Text>
        </View>
        <View style={[styles.headerStatus, mobile && styles.headerStatusMobile]}>
          <Text style={styles.headerStatusValue}>{reliablePercent}%</Text>
          <Text style={styles.headerStatusLabel}>可靠时间覆盖</Text>
          <Text style={styles.headerStatusMeta}>{overview.activeDays} 个活跃日 · {report.timezone}</Text>
        </View>
      </View>

      <View style={[styles.row, mobile && styles.rowMobile]}>
        <Panel style={styles.overviewPanel}>
          <PanelHeader accent={color.green} icon={Activity} label="样本总览" meta={`${totalEvents} 条列表记录`} />
          <View style={styles.heroMetricRow}>
            <Text style={styles.heroMetric}>{formatNumber(overview.counts.total)}</Text>
            <Text style={styles.heroUnit}>条去重内容</Text>
          </View>
          <View style={styles.miniGrid}>
            <MiniMetric accent={color.cyan} label="观看" value={overview.counts.watch} />
            <MiniMetric accent={color.accent} label="喜欢" value={overview.counts.liked} />
            <MiniMetric accent={color.amber} label="收藏" value={overview.counts.favorite} />
            <MiniMetric accent={color.green} label="活跃日" value={overview.activeDays} />
          </View>
          <Text style={styles.footerText}>{formatDateRange(overview.dateRange)}</Text>
        </Panel>

        <Panel style={styles.calendarPanel}>
          <PanelHeader
            accent={color.green}
            icon={CalendarDays}
            label="全年内容足迹"
            meta={overview.calendar.length ? `${overview.activeDays} 天有记录` : overview.dateRange ? "跨年样本" : "可靠时间不足"}
          />
          <CalendarHeatmap
            days={overview.calendar}
            emptyText={overview.dateRange ? "当前样本跨越多个年份，全年日历不生成合并结论。" : "可靠时间不足，未生成全年日历。"}
          />
        </Panel>

        <Panel style={styles.peakPanel}>
          <PanelHeader accent={color.accent} icon={BarChart3} label="峰值日" meta={overview.peakDay ? formatPlainDate(overview.peakDay.date) : "可靠时间不足"} />
          {overview.peakDay ? (
            <>
              <View style={styles.heroMetricRow}>
                <Text style={[styles.heroMetric, { color: color.accent }]}>{formatNumber(overview.peakDay.count)}</Text>
                <Text style={styles.heroUnit}>条记录</Text>
              </View>
              <Text style={styles.peakCopy}>{overview.peakDay.uniqueVideos} 条去重内容，{formatPeakComparison(overview.peakDay.count, overview.activeDays ? coverage.reliableRecordCount / overview.activeDays : 0)}。</Text>
              <StackedBar values={overview.peakDay.byType} />
              <View style={styles.legendRow}>
                <Legend accent={color.cyan} label={`观看 ${overview.peakDay.byType.watch}`} />
                <Legend accent={color.accent} label={`喜欢 ${overview.peakDay.byType.liked}`} />
                <Legend accent={color.amber} label={`收藏 ${overview.peakDay.byType.favorite}`} />
              </View>
            </>
          ) : <PanelEmpty text="没有足够的可靠时间生成峰值日。" />}
        </Panel>
      </View>

      <View style={[styles.row, mobile && styles.rowMobile]}>
        <Panel style={styles.creatorPanel}>
          <PanelHeader accent={color.cyan} icon={Users} label="创作者排行" meta={`${creators.creatorCount} 位可识别`} />
          <View style={styles.rankList}>
            {creators.top.slice(0, 5).map((creator, index) => (
              <RankRow
                key={`${creator.authorId ?? creator.name}:${index}`}
                accent={index === 0 ? color.cyan : color.green}
                label={privacy ? `创作者 ${index + 1}` : creator.name}
                max={maxCreator}
                rank={index + 1}
                value={creator.count}
              />
            ))}
            {!creators.top.length ? <PanelEmpty text="当前样本没有可识别创作者。" /> : null}
          </View>
          <View style={styles.factLine}>
            <InlineFact label="头部占比" value={`${Math.round(creators.headShare * 100)}%`} />
            <InlineFact label="探索范围" value={`${Math.round(creators.exploration * 100)}%`} />
          </View>
        </Panel>

        <Panel style={styles.monthlyPanel}>
          <PanelHeader accent={color.accent} icon={Heart} label="十二个月的偏好" meta={monthly.peakMonth ? `行为峰值 ${monthly.peakMonth.label} · ${monthly.peakMonth.count}` : "趋势不可用"} />
          <View accessible accessibilityLabel={monthlyAccessibilityLabel(monthly)} style={styles.monthChart}>
            {monthly.months.map((month) => (
              <View key={month.month} style={styles.monthColumn}>
                <View style={styles.monthBars}>
                  <View style={[styles.monthBar, { height: monthly.seriesAvailability.liked ? Math.max(month.liked ? 3 : 0, (month.liked ?? 0) / maxMonth * 74) : 0, backgroundColor: color.accent }]} />
                  <View style={[styles.monthBar, { height: monthly.seriesAvailability.favorite ? Math.max(month.favorite ? 3 : 0, (month.favorite ?? 0) / maxMonth * 74) : 0, backgroundColor: color.amber }]} />
                </View>
                <Text style={styles.axisLabel}>{month.month}月</Text>
              </View>
            ))}
          </View>
          <View style={styles.legendRow}>
            {monthly.seriesAvailability.liked ? <Legend accent={color.accent} label="喜欢" /> : null}
            {monthly.seriesAvailability.favorite ? <Legend accent={color.amber} label="收藏" /> : null}
          </View>
          {monthlyNotice ? <PanelNotice text={monthlyNotice} /> : null}
        </Panel>

        <Panel style={styles.rhythmPanel}>
          <PanelHeader accent={color.amber} icon={Clock3} label="观看节奏" meta={`${rhythm.watchRecordCount} 条可靠观看`} />
          <Text style={styles.rhythmKicker}>{rhythmLabel(report, rhythm, nightShare)}</Text>
          <View style={styles.heroMetricRow}>
            <Text style={[styles.heroMetric, { color: color.amber }]}>{activeHour}</Text>
          </View>
          <View style={styles.miniGrid}>
            <MiniText label="活跃星期" value={activeWeekday} />
            <MiniText label="0-5 点占比" value={report.rhythm.status === "ok" ? `${Math.round(nightShare * 100)}%` : "不可判断"} />
          </View>
          <View style={styles.timeRange}>
            <Text style={styles.timeRangeText}>首条 {formatActionTime(rhythm.earliest)}</Text>
            <View style={styles.timeRangeLine} />
            <Text style={styles.timeRangeText}>末条 {formatActionTime(rhythm.latest)}</Text>
          </View>
        </Panel>
      </View>

      <View style={[styles.row, mobile && styles.rowMobile]}>
        <Panel style={styles.weeklyPanel}>
          <PanelHeader accent={color.cyan} icon={Clock3} label="一周 × 24 小时" meta={report.rhythm.status === "ok" ? `${activeWeekday} ${activeHour} 最活跃` : "仅展示可靠记录"} />
          <WeekHourHeatmap heatmap={rhythm.heatmap} max={maxHeat} />
          <View style={styles.heatFooter}>
            <Text style={styles.footerText}>00</Text><Text style={styles.footerText}>06</Text><Text style={styles.footerText}>12</Text><Text style={styles.footerText}>18</Text><Text style={styles.footerText}>23</Text>
          </View>
        </Panel>

        <Panel style={styles.topicPanel}>
          <PanelHeader accent={color.accent} icon={Sparkles} label="显式话题" meta={`${interests.topics.length} 个可识别`} />
          <View style={styles.rankList}>
            {interests.topics.slice(0, 6).map((topic, index) => (
              <TopicRow
                key={topic.name}
                label={privacy ? `话题 ${index + 1}` : `#${topic.name}`}
                max={maxTopic}
                value={topic.count}
              />
            ))}
            {!interests.topics.length ? <PanelEmpty text="喜欢与收藏中没有可识别话题。" /> : null}
          </View>
        </Panel>

        <Panel style={styles.mediaPanel}>
          <PanelHeader accent={color.green} icon={Music2} label="时长与音乐" meta={`${interests.durationStats.count} 条有时长`} />
          <View style={styles.durationList}>
            {interests.durations.map((bucket) => (
              <CompactBar key={bucket.id} accent={color.green} label={bucket.label} max={maxDuration} value={bucket.count} />
            ))}
          </View>
          <View style={styles.panelDivider} />
          <View style={styles.musicList}>
            {interests.music.slice(0, 3).map((music, index) => (
              <View key={`${music.id ?? music.title}:${index}`} style={styles.musicRow}>
                <Text style={styles.musicRank}>{String(index + 1).padStart(2, "0")}</Text>
                <Text numberOfLines={1} style={styles.musicTitle}>{privacy ? `音乐 ${index + 1}` : music.title}</Text>
                <Text style={styles.musicValue}>{music.count}</Text>
              </View>
            ))}
            {!interests.music.length ? <Text style={styles.footerText}>暂无可识别音乐</Text> : null}
          </View>
        </Panel>
      </View>

      <View style={[styles.row, mobile && styles.rowMobile]}>
        <Panel style={styles.intersectionPanel}>
          <PanelHeader accent={color.amber} icon={Bookmark} label="列表交集" meta={`${kept.comparableVideoCount} 个可比较视频`} />
          <View style={styles.intersectionGrid}>
            <IntersectionCell accent={color.cyan} label="观看 ∩ 喜欢" value={overlapComparable ? kept.pairwise.watchLiked : null} />
            <IntersectionCell accent={color.amber} label="观看 ∩ 收藏" value={overlapComparable ? kept.pairwise.watchFavorite : null} />
            <IntersectionCell accent={color.accent} label="喜欢 ∩ 收藏" value={overlapComparable ? kept.pairwise.likedFavorite : null} />
            <IntersectionCell accent={color.green} label="三类都有" value={overlapComparable ? kept.allThree : null} />
          </View>
          <Text style={styles.footerText}>当前列表快照，不代表行为转化</Text>
        </Panel>

        <Panel style={styles.qualityPanel}>
          <PanelHeader accent={color.green} icon={Activity} label="数据质量" meta={coverage.partial ? "当前为部分样本" : "当前样本"} />
          <View style={styles.qualityHero}>
            <Text style={styles.qualityValue}>{reliablePercent}%</Text>
            <Text style={styles.qualityLabel}>记录具备可靠行为时间</Text>
          </View>
          {Object.entries(coverage.byType).map(([type, item]) => (
            <QualityRow
              key={type}
              label={LIST_LABELS[type as keyof typeof LIST_LABELS]}
              ratio={item.reliableDateRatio}
              value={`${item.reliableRecordCount}/${item.recordCount}`}
            />
          ))}
          <Text style={styles.footerText}>{coverage.undatedRecordCount + coverage.unknownSourceRecordCount} 条记录未进入时间结论</Text>
        </Panel>

        <Panel style={styles.timelinePanel}>
          <PanelHeader accent={color.accent} icon={History} label="观看时间线" meta={report.periodLabel} />
          <TimelinePoint
            accent={color.green}
            item={rhythm.earliest}
            label="最早可靠观看"
            privacy={privacy}
          />
          <View style={styles.timelineConnector} />
          <TimelinePoint
            accent={color.accent}
            item={rhythm.latest}
            label="最晚可靠观看"
            privacy={privacy}
          />
          <View style={styles.factLine}>
            <InlineFact label="观看活跃日" value={`${overview.watchActiveDays} 天`} />
            <InlineFact label="可靠去重内容" value={formatNumber(overview.coverage.reliableUniqueVideoCount)} />
          </View>
        </Panel>
      </View>
    </ScrollView>
  );
}

function Panel({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

function PanelHeader({ accent, icon: Icon, label, meta }: { accent: string; icon: IconComponent; label: string; meta: string }) {
  return (
    <View style={styles.panelHeader}>
      <View style={[styles.panelIcon, { backgroundColor: `${accent}18` }]}><Icon color={accent} size={16} strokeWidth={2} /></View>
      <Text style={styles.panelTitle}>{label}</Text>
      <Text numberOfLines={1} style={styles.panelMeta}>{meta}</Text>
    </View>
  );
}

function MiniMetric({ accent, label, value }: { accent: string; label: string; value: number }) {
  return (
    <View style={[styles.miniMetric, { borderLeftColor: accent }]}>
      <Text style={styles.miniLabel}>{label}</Text>
      <Text style={styles.miniValue}>{formatNumber(value)}</Text>
    </View>
  );
}

function MiniText({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.miniMetric}>
      <Text style={styles.miniLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.miniValue}>{value}</Text>
    </View>
  );
}

function InlineFact({ label, value }: { label: string; value: string }) {
  return <View style={styles.inlineFact}><Text style={styles.inlineFactLabel}>{label}</Text><Text style={styles.inlineFactValue}>{value}</Text></View>;
}

function CalendarHeatmap({ days, emptyText }: { days: AnnualCalendarDay[]; emptyText: string }) {
  if (!days.length) return <PanelEmpty text={emptyText} />;
  const weeks = calendarWeeks(days);
  const activeDays = days.filter((day) => day.count > 0);
  const peak = activeDays.reduce<AnnualCalendarDay | null>((best, day) => !best || day.count > best.count ? day : best, null);
  return (
    <View
      accessible
      accessibilityLabel={`全年活跃日历，共 ${activeDays.length} 个活跃日${peak ? `；最活跃日期 ${formatPlainDate(peak.date)}，${peak.count} 条记录` : ""}`}
      style={styles.calendarWrap}
    >
      <View style={styles.monthLabels}>{Array.from({ length: 12 }, (_, index) => <Text key={index} style={styles.monthLabel}>{index + 1}月</Text>)}</View>
      <View style={styles.calendarBody}>
        <View style={styles.calendarWeekdayLabels}><Text style={styles.calendarWeekday}>一</Text><Text style={styles.calendarWeekday}>三</Text><Text style={styles.calendarWeekday}>五</Text><Text style={styles.calendarWeekday}>日</Text></View>
        <View style={styles.calendarWeeks}>
          {weeks.map((week, weekIndex) => (
            <View key={weekIndex} style={styles.calendarWeek}>
              {week.map((day, dayIndex) => (
                <View key={`${weekIndex}:${dayIndex}`} style={[styles.calendarCell, { backgroundColor: day ? CALENDAR_COLORS[day.level] : "transparent" }]} />
              ))}
            </View>
          ))}
        </View>
      </View>
      <View style={styles.calendarLegend}><Text style={styles.footerText}>少</Text>{CALENDAR_COLORS.map((accent, index) => <View key={index} style={[styles.legendCell, { backgroundColor: accent }]} />)}<Text style={styles.footerText}>多</Text></View>
    </View>
  );
}

function WeekHourHeatmap({ heatmap, max }: { heatmap: AnnualRhythmData["heatmap"]; max: number }) {
  const total = heatmap.reduce((sum, cell) => sum + cell.count, 0);
  const peak = heatmap.reduce<AnnualRhythmData["heatmap"][number] | null>((best, cell) => !best || cell.count > best.count ? cell : best, null);
  return (
    <View
      accessible
      accessibilityLabel={`星期与小时的可靠观看记录热力图，共 ${total} 条记录${peak && peak.count > 0 ? `；${WEEKDAY_LABELS[peak.weekday]} ${String(peak.hour).padStart(2, "0")}:00 最多，共 ${peak.count} 条` : ""}`}
      style={styles.weekHeatmap}
    >
      {WEEKDAY_LABELS.map((label, weekday) => (
        <View key={label} style={styles.weekHeatRow}>
          <Text style={styles.weekHeatLabel}>{label.replace("周", "")}</Text>
          <View style={styles.weekHeatCells}>
            {Array.from({ length: 24 }, (_, hour) => {
              const count = heatmap.find((cell) => cell.weekday === weekday && cell.hour === hour)?.count ?? 0;
              const level = count === 0 ? 0 : Math.max(1, Math.ceil(count / max * 4));
              return <View key={hour} style={[styles.weekHeatCell, { backgroundColor: CALENDAR_COLORS[level] }]} />;
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

function RankRow({ accent, label, max, rank, value }: { accent: string; label: string; max: number; rank: number; value: number }) {
  return (
    <View style={styles.rankRow}>
      <Text style={styles.rankNumber}>{String(rank).padStart(2, "0")}</Text>
      <View style={styles.rankBody}>
        <View style={styles.rankTitleRow}><Text numberOfLines={1} style={styles.rankLabel}>{label}</Text><Text style={styles.rankValue}>{value}</Text></View>
        <View style={styles.track}><View style={[styles.trackFill, { width: `${Math.max(4, value / max * 100)}%`, backgroundColor: accent }]} /></View>
      </View>
    </View>
  );
}

function TopicRow({ label, max, value }: { label: string; max: number; value: number }) {
  return (
    <View style={styles.topicRow}>
      <Text numberOfLines={1} style={styles.topicLabel}>{label}</Text>
      <View style={styles.topicTrack}><View style={[styles.topicFill, { width: `${Math.max(5, value / max * 100)}%` }]} /></View>
      <Text style={styles.topicValue}>{value}</Text>
    </View>
  );
}

function CompactBar({ accent, label, max, value }: { accent: string; label: string; max: number; value: number }) {
  return (
    <View style={styles.compactBarRow}>
      <Text style={styles.compactBarLabel}>{label}</Text>
      <View style={styles.compactBarTrack}><View style={[styles.compactBarFill, { width: `${Math.max(value ? 4 : 0, value / max * 100)}%`, backgroundColor: accent }]} /></View>
      <Text style={styles.compactBarValue}>{value}</Text>
    </View>
  );
}

function Legend({ accent, label }: { accent: string; label: string }) {
  return <View style={styles.legend}><View style={[styles.legendMark, { backgroundColor: accent }]} /><Text style={styles.legendText}>{label}</Text></View>;
}

function StackedBar({ values }: { values: Record<"watch" | "liked" | "favorite", number> }) {
  return (
    <View style={styles.stackedBar}>
      {values.watch ? <View style={{ flex: values.watch, backgroundColor: color.cyan }} /> : null}
      {values.liked ? <View style={{ flex: values.liked, backgroundColor: color.accent }} /> : null}
      {values.favorite ? <View style={{ flex: values.favorite, backgroundColor: color.amber }} /> : null}
    </View>
  );
}

function IntersectionCell({ accent, label, value }: { accent: string; label: string; value: number | null }) {
  return (
    <View style={[styles.intersectionCell, { borderLeftColor: accent }]}>
      <Text style={styles.intersectionLabel}>{label}</Text>
      <Text style={styles.intersectionValue}>{value === null ? "--" : formatNumber(value)}</Text>
    </View>
  );
}

function QualityRow({ label, ratio, value }: { label: string; ratio: number; value: string }) {
  return (
    <View style={styles.qualityRow}>
      <Text style={styles.qualityRowLabel}>{label}</Text>
      <View style={styles.qualityTrack}><View style={[styles.qualityFill, { width: `${Math.round(ratio * 100)}%` }]} /></View>
      <Text style={styles.qualityRowValue}>{value}</Text>
    </View>
  );
}

function TimelinePoint({ accent, item, label, privacy }: { accent: string; item: AnnualContentRef | null; label: string; privacy: boolean }) {
  return (
    <View style={styles.timelinePoint}>
      <View style={[styles.timelineDot, { backgroundColor: accent }]} />
      <View style={styles.timelineCopy}>
        <Text style={styles.timelineLabel}>{label} · {formatActionDateTime(item)}</Text>
        <Text numberOfLines={1} style={styles.timelineTitle}>{item ? (privacy ? "内容标题已隐藏" : item.title) : "暂无可靠记录"}</Text>
      </View>
    </View>
  );
}

function PanelEmpty({ text }: { text: string }) {
  return <Text style={styles.emptyText}>{text}</Text>;
}

function PanelNotice({ text }: { text: string }) {
  return <Text style={styles.noticeText}>{text}</Text>;
}

function calendarWeeks(days: AnnualCalendarDay[]): Array<Array<AnnualCalendarDay | null>> {
  const first = days[0];
  const leading = first ? mondayIndex(first.date) : 0;
  const cells: Array<AnnualCalendarDay | null> = [...Array.from({ length: leading }, () => null), ...days];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: Array<Array<AnnualCalendarDay | null>> = [];
  for (let index = 0; index < cells.length; index += 7) weeks.push(cells.slice(index, index + 7));
  return weeks;
}

function mondayIndex(value: string): number {
  const day = new Date(`${value}T00:00:00Z`).getUTCDay();
  return (day + 6) % 7;
}

function monthlyNoticeFor(report: AnnualReport, monthly: AnnualMonthlyData): string | null {
  if (report.monthly.status !== "ok") return report.monthly.reason ?? "可靠时间不足，未生成月份趋势。";
  if (!monthly.unavailableSeries.length) return report.monthly.notices[0] ?? null;
  return `${monthly.unavailableSeries.map((series) => series === "liked" ? "喜欢" : "收藏").join("、")}缺少可靠时间。`;
}

function monthlyAccessibilityLabel(monthly: AnnualMonthlyData): string {
  const points = monthly.months.map((month) => `${month.label}：喜欢 ${month.liked ?? "不可用"}，收藏 ${month.favorite ?? "不可用"}`).join("；");
  return `十二个月喜欢和收藏去重内容趋势。${points}`;
}

function rhythmLabel(report: AnnualReport, rhythm: AnnualRhythmData, nightShare: number): string {
  if (report.rhythm.status !== "ok") return "可靠时间尚不足以形成稳定结论";
  if (nightShare >= 0.35) return "深夜时段在可靠观看中更突出";
  if ((rhythm.mostActiveHour?.hour ?? 0) >= 20) return "夜间是当前样本更活跃的时段";
  return "白天是当前样本更活跃的时段";
}

function formatNumber(value: number): string {
  return value.toLocaleString("zh-CN");
}

function formatDateRange(range: AnnualOverviewData["dateRange"]): string {
  if (!range) return "可靠时间范围不足";
  const [startYear] = range.start.split("-");
  const [endYear] = range.end.split("-");
  if (startYear && endYear && startYear !== endYear) {
    return `${formatYearDate(range.start)} — ${formatYearDate(range.end)}`;
  }
  return `${formatPlainDate(range.start)} — ${formatPlainDate(range.end)}`;
}

function formatYearDate(value: string): string {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${year}年${Number(month)}月${Number(day)}日` : value;
}

function formatPlainDate(value: string): string {
  const [, month, day] = value.split("-");
  return month && day ? `${Number(month)}月${Number(day)}日` : value;
}

function formatPeakComparison(value: number, baseline: number): string {
  if (!Number.isFinite(baseline) || baseline <= 0) return "日均对比不可判断";
  return `约为日均 ${Math.max(0, value / baseline).toFixed(1)} 倍`;
}

function formatActionTime(item: AnnualContentRef | null): string {
  if (!item?.occurredAt) return "未知";
  const date = new Date(item.occurredAt);
  if (!Number.isFinite(date.getTime())) return "未知";
  return date.toLocaleTimeString("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatActionDateTime(item: AnnualContentRef | null): string {
  if (!item?.occurredAt) return "时间未知";
  const date = new Date(item.occurredAt);
  if (!Number.isFinite(date.getTime())) return "时间未知";
  return date.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

const styles = StyleSheet.create({
  content: { padding: 14, paddingBottom: 32, backgroundColor: color.canvas },
  contentMobile: { padding: 10, paddingBottom: 82 },
  header: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 24, paddingHorizontal: 4, paddingBottom: 10 },
  headerMobile: { flexDirection: "column", alignItems: "stretch", gap: 10 },
  headerCopy: { flex: 1, minWidth: 0 },
  eyebrow: { color: color.cyan, fontSize: 10, fontWeight: "900" },
  title: { color: color.text, fontSize: 24, lineHeight: 30, fontWeight: "900", marginTop: 4 },
  titleMobile: { fontSize: 21, lineHeight: 28 },
  lead: { color: color.textSecondary, fontSize: 11, lineHeight: 17, marginTop: 5 },
  headerStatus: { minWidth: 210, alignItems: "flex-end", paddingLeft: 18, borderLeftWidth: 1, borderLeftColor: color.border },
  headerStatusMobile: { alignItems: "flex-start", paddingLeft: 0, paddingTop: 10, borderTopWidth: 1, borderLeftWidth: 0, borderTopColor: color.border },
  headerStatusValue: { color: color.green, fontSize: 24, lineHeight: 28, fontWeight: "900", fontVariant: ["tabular-nums"] },
  headerStatusLabel: { color: color.textSecondary, fontSize: 10, fontWeight: "800", marginTop: 2 },
  headerStatusMeta: { color: color.textMuted, fontSize: 9, marginTop: 4 },
  row: { width: "100%", flexDirection: "row", alignItems: "stretch", gap: 10, marginTop: 10 },
  rowMobile: { flexDirection: "column" },
  panel: { minWidth: 0, minHeight: 184, padding: 13, overflow: "hidden", borderWidth: 1, borderColor: color.border, borderRadius: radius.large, backgroundColor: color.surface },
  overviewPanel: { flex: 0.9 },
  calendarPanel: { flex: 1.85 },
  peakPanel: { flex: 1.08 },
  creatorPanel: { flex: 1.06, minHeight: 200 },
  monthlyPanel: { flex: 1.76, minHeight: 200 },
  rhythmPanel: { flex: 1.02, minHeight: 200 },
  weeklyPanel: { flex: 1.58, minHeight: 210 },
  topicPanel: { flex: 1.12, minHeight: 210 },
  mediaPanel: { flex: 1.08, minHeight: 210 },
  intersectionPanel: { flex: 1.15, minHeight: 168 },
  qualityPanel: { flex: 1.05, minHeight: 168 },
  timelinePanel: { flex: 1.45, minHeight: 168 },
  panelHeader: { minHeight: 28, flexDirection: "row", alignItems: "center", gap: 7 },
  panelIcon: { width: 26, height: 26, alignItems: "center", justifyContent: "center", borderRadius: radius.small },
  panelTitle: { flex: 1, color: color.text, fontSize: 12, fontWeight: "900" },
  panelMeta: { maxWidth: "48%", color: color.textMuted, fontSize: 9, fontWeight: "700", textAlign: "right" },
  heroMetricRow: { minHeight: 42, flexDirection: "row", alignItems: "baseline", gap: 7, marginTop: 8 },
  heroMetric: { color: color.green, fontSize: 32, lineHeight: 38, fontWeight: "900", fontVariant: ["tabular-nums"] },
  heroUnit: { color: color.textSecondary, fontSize: 10, fontWeight: "700" },
  miniGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  miniMetric: { width: "48%", minHeight: 34, justifyContent: "center", paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: color.border },
  miniLabel: { color: color.textMuted, fontSize: 9 },
  miniValue: { color: color.text, fontSize: 12, fontWeight: "900", marginTop: 2 },
  footerText: { color: color.textMuted, fontSize: 9, lineHeight: 14, marginTop: "auto", paddingTop: 7 },
  calendarWrap: { flex: 1, minHeight: 0, marginTop: 10 },
  monthLabels: { flexDirection: "row", justifyContent: "space-between", paddingLeft: 24 },
  monthLabel: { color: color.textMuted, fontSize: 8 },
  calendarBody: { flex: 1, minHeight: 0, flexDirection: "row", gap: 6, marginTop: 6 },
  calendarWeekdayLabels: { width: 18, justifyContent: "space-between", paddingVertical: 1 },
  calendarWeekday: { color: color.textMuted, fontSize: 8 },
  calendarWeeks: { flex: 1, minWidth: 0, flexDirection: "row", gap: 2 },
  calendarWeek: { flex: 1, minWidth: 0, gap: 2 },
  calendarCell: { width: "100%", aspectRatio: 1, minHeight: 2, borderRadius: 1 },
  calendarLegend: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 3, marginTop: 6 },
  legendCell: { width: 8, height: 8, borderRadius: 1 },
  peakCopy: { color: color.textSecondary, fontSize: 10, lineHeight: 15, marginTop: 2 },
  stackedBar: { height: 7, flexDirection: "row", overflow: "hidden", marginTop: 12, borderRadius: 2, backgroundColor: color.surfaceRaised },
  legendRow: { minHeight: 20, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 9, marginTop: 7 },
  legend: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendMark: { width: 9, height: 3, borderRadius: 2 },
  legendText: { color: color.textMuted, fontSize: 9 },
  rankList: { gap: 2, marginTop: 8 },
  rankRow: { minHeight: 27, flexDirection: "row", alignItems: "center", gap: 7 },
  rankNumber: { width: 17, color: color.textMuted, fontSize: 8, fontWeight: "900" },
  rankBody: { flex: 1, minWidth: 0 },
  rankTitleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  rankLabel: { flex: 1, color: color.textSecondary, fontSize: 10, fontWeight: "700" },
  rankValue: { color: color.text, fontSize: 9, fontWeight: "900" },
  track: { height: 2, overflow: "hidden", marginTop: 4, backgroundColor: color.surfaceMuted },
  trackFill: { height: 2 },
  factLine: { flexDirection: "row", gap: 8, marginTop: "auto", paddingTop: 7, borderTopWidth: 1, borderTopColor: color.borderSoft },
  inlineFact: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 5 },
  inlineFactLabel: { color: color.textMuted, fontSize: 9 },
  inlineFactValue: { color: color.text, fontSize: 10, fontWeight: "900" },
  monthChart: { height: 100, flexDirection: "row", alignItems: "flex-end", gap: 3, marginTop: 8 },
  monthColumn: { flex: 1, minWidth: 0, height: 96, alignItems: "center", justifyContent: "flex-end" },
  monthBars: { height: 76, flexDirection: "row", alignItems: "flex-end", gap: 2 },
  monthBar: { width: 4, minHeight: 0, borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  axisLabel: { color: color.textMuted, fontSize: 8, marginTop: 4 },
  noticeText: { color: color.amber, fontSize: 9, lineHeight: 13, marginTop: 4 },
  rhythmKicker: { color: color.textSecondary, fontSize: 10, lineHeight: 15, marginTop: 10 },
  timeRange: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: "auto", paddingTop: 8 },
  timeRangeText: { color: color.textMuted, fontSize: 8, fontVariant: ["tabular-nums"] },
  timeRangeLine: { flex: 1, height: 1, backgroundColor: color.border },
  weekHeatmap: { gap: 3, marginTop: 10 },
  weekHeatRow: { minHeight: 16, flexDirection: "row", alignItems: "center", gap: 5 },
  weekHeatLabel: { width: 10, color: color.textMuted, fontSize: 8 },
  weekHeatCells: { flex: 1, minWidth: 0, flexDirection: "row", gap: 2 },
  weekHeatCell: { flex: 1, minWidth: 1, height: 14, borderRadius: 1 },
  heatFooter: { flexDirection: "row", justifyContent: "space-between", paddingLeft: 15 },
  topicRow: { minHeight: 25, flexDirection: "row", alignItems: "center", gap: 7 },
  topicLabel: { width: 72, color: color.textSecondary, fontSize: 10, fontWeight: "700" },
  topicTrack: { flex: 1, height: 3, overflow: "hidden", backgroundColor: color.surfaceMuted },
  topicFill: { height: 3, backgroundColor: color.accent },
  topicValue: { width: 18, color: color.text, fontSize: 9, fontWeight: "900", textAlign: "right" },
  durationList: { gap: 5, marginTop: 10 },
  compactBarRow: { minHeight: 18, flexDirection: "row", alignItems: "center", gap: 6 },
  compactBarLabel: { width: 52, color: color.textMuted, fontSize: 9 },
  compactBarTrack: { flex: 1, height: 3, overflow: "hidden", backgroundColor: color.surfaceMuted },
  compactBarFill: { height: 3 },
  compactBarValue: { width: 18, color: color.text, fontSize: 9, fontWeight: "900", textAlign: "right" },
  panelDivider: { height: 1, marginVertical: 8, backgroundColor: color.borderSoft },
  musicList: { gap: 2 },
  musicRow: { minHeight: 21, flexDirection: "row", alignItems: "center", gap: 6 },
  musicRank: { width: 16, color: color.textMuted, fontSize: 8, fontWeight: "900" },
  musicTitle: { flex: 1, color: color.textSecondary, fontSize: 9 },
  musicValue: { color: color.green, fontSize: 9, fontWeight: "900" },
  intersectionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  intersectionCell: { width: "48%", minHeight: 43, justifyContent: "center", paddingLeft: 8, borderLeftWidth: 2 },
  intersectionLabel: { color: color.textMuted, fontSize: 9 },
  intersectionValue: { color: color.text, fontSize: 14, fontWeight: "900", marginTop: 3 },
  qualityHero: { flexDirection: "row", alignItems: "baseline", gap: 7, marginTop: 8 },
  qualityValue: { color: color.green, fontSize: 25, fontWeight: "900" },
  qualityLabel: { flex: 1, color: color.textSecondary, fontSize: 9 },
  qualityRow: { minHeight: 19, flexDirection: "row", alignItems: "center", gap: 6 },
  qualityRowLabel: { width: 28, color: color.textMuted, fontSize: 8 },
  qualityTrack: { flex: 1, height: 3, overflow: "hidden", backgroundColor: color.surfaceMuted },
  qualityFill: { height: 3, backgroundColor: color.green },
  qualityRowValue: { width: 42, color: color.textSecondary, fontSize: 8, textAlign: "right" },
  timelinePoint: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: 8, marginTop: 7 },
  timelineDot: { width: 8, height: 8, borderRadius: 4 },
  timelineCopy: { flex: 1, minWidth: 0 },
  timelineLabel: { color: color.textMuted, fontSize: 8 },
  timelineTitle: { color: color.text, fontSize: 10, lineHeight: 14, fontWeight: "800", marginTop: 3 },
  timelineConnector: { width: 1, height: 12, marginLeft: 4, backgroundColor: color.border },
  emptyText: { color: color.textMuted, fontSize: 10, lineHeight: 15, marginTop: 18 },
});
