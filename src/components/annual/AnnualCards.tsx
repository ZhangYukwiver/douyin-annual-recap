import React from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  CalendarDays,
  Clock3,
  Disc3,
  Eye,
  Heart,
  Library,
  Music2,
  Sparkles,
  Star,
  Users,
} from "lucide-react-native";

import type {
  AnnualCard,
  AnnualCreatorsData,
  AnnualHighlightsData,
  AnnualInterestsData,
  AnnualKeptData,
  AnnualMonthlyData,
  AnnualOverviewData,
  AnnualReport,
  AnnualRhythmData,
  AnnualSummaryData,
  DataCoverage,
} from "../../domain/annualReport";
import {
  annualColors,
  CalendarHeatmap,
  ContentPreview,
  CoverImage,
  formatCount,
  formatDate,
  formatPercent,
  MetricBlock,
  MiniBars,
  MonthlyChart,
  RankBar,
  RhythmHeatmap,
  StatusPill,
} from "./annualVisuals";

export interface AnnualPageContentProps {
  report: AnnualReport;
  privacy: boolean;
  pageNumber: number;
  totalPages: number;
}

export function AnnualCoverPage({ report, privacy, pageNumber, totalPages }: AnnualPageContentProps) {
  const overview = report.overview.data as AnnualOverviewData;
  const highlights = report.highlights.data as AnnualHighlightsData;
  const hero = highlights.first ?? highlights.peakDay ?? highlights.last;
  const reportStatus = report.status === "ok" ? "ok" : "insufficient";
  return (
    <PageCanvas pageNumber={pageNumber} totalPages={totalPages} label={`${report.periodLabel}年度回顾封面`}>
      <View style={styles.coverLayout}>
        <View style={styles.coverCopy}>
          <View style={styles.coverMetaRow}>
            <Text style={styles.eyebrow}>DOUYIN / ANNUAL RECAP</Text>
            <StatusPill status={reportStatus} />
          </View>
          <Text style={styles.coverYear}>{report.year}</Text>
          <Text style={styles.coverTitle}>这一年，内容留下了形状。</Text>
          <Text style={styles.coverLead}>
            {overview.counts.total > 0
              ? `${formatCount(overview.counts.total)} 个有可靠行为时间的独立视频，组成一份只在本地生成的年度回顾。`
              : "当前数据还不足以描出年度轨迹。报告会保留边界，也不会拿发布时间代替你的行为时间。"}
          </Text>
          <View style={styles.coverMetrics}>
            <MetricBlock label="独立视频" value={formatCount(overview.counts.total)} detail="三类行为去重后" accent={annualColors.ink} large />
            <MetricBlock label="活跃日期" value={formatCount(overview.activeDays)} detail="上海时区" accent={annualColors.cyan} large />
            <MetricBlock label="时间覆盖" value={`${formatCount(report.snapshotCoverage.reliableRecordCount)}/${formatCount(report.snapshotCoverage.recordCount)}`} detail="全快照可分析 / 总记录" accent={annualColors.gold} large />
          </View>
        </View>
        <View style={styles.coverVisual}>
          <View style={styles.coverFrame}>
            <CoverImage uri={hero?.coverUrl} title={hero?.title} privacy={privacy} size="large" />
            <View style={styles.coverFrameCopy}>
              <Text style={styles.coverFrameLabel}>{privacy ? "年度内容已隐藏" : hero ? "从第一条可靠记录开始" : "等待第一条可靠记录"}</Text>
              <Text style={styles.coverFrameTitle} numberOfLines={2}>{privacy ? "隐私模式已开启" : hero?.title ?? "你的年度封面将在这里出现"}</Text>
              <Text style={styles.coverFrameMeta}>{privacy ? "标题、作者与图片节点均已替换" : hero?.author ?? "作者未知"}</Text>
            </View>
          </View>
          <CoverageStrip coverage={report.snapshotCoverage} compact />
        </View>
      </View>
    </PageCanvas>
  );
}

export function AnnualReportCardPage({ report, privacy, pageNumber, totalPages, card }: AnnualPageContentProps & { card: AnnualCard }) {
  return (
    <PageCanvas pageNumber={pageNumber} totalPages={totalPages} label={`${card.title}，${card.status === "ok" ? "可分析" : "数据不足"}`}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeadingCopy}>
          <Text style={styles.eyebrow}>{card.eyebrow}</Text>
          <Text style={styles.cardTitle}>{card.title}</Text>
          <Text style={styles.cardDescription}>{card.description}</Text>
        </View>
        <StatusPill status={card.status} />
      </View>
      <CardNotice card={card} coverage={card.id === "kept" ? report.snapshotCoverage : report.coverage} />
      <View style={styles.cardContent}>{renderCard(card, report, privacy)}</View>
    </PageCanvas>
  );
}

function renderCard(card: AnnualCard, report: AnnualReport, privacy: boolean) {
  switch (card.id) {
    case "overview": return <OverviewCard data={card.data as AnnualOverviewData} coverage={report.snapshotCoverage} />;
    case "rhythm": return <RhythmCard data={card.data as AnnualRhythmData} privacy={privacy} />;
    case "monthly": return <MonthlyCard data={card.data as AnnualMonthlyData} />;
    case "creators": return <CreatorsCard data={card.data as AnnualCreatorsData} privacy={privacy} />;
    case "interests": return <InterestsCard data={card.data as AnnualInterestsData} privacy={privacy} />;
    case "kept": return <KeptCard data={card.data as AnnualKeptData} />;
    case "highlights": return <HighlightsCard data={card.data as AnnualHighlightsData} privacy={privacy} />;
    case "summary": return <SummaryCard data={card.data as AnnualSummaryData} privacy={privacy} periodLabel={report.periodLabel} />;
  }
}

function OverviewCard({ data, coverage }: { data: AnnualOverviewData; coverage: DataCoverage }) {
  return (
    <View style={styles.splitWide}>
      <View style={styles.primaryColumn}>
        <Text style={styles.statement}>
          {data.counts.total > 0 ? `${formatCount(data.counts.total)} 个独立视频，把这一年点亮了 ${formatCount(data.activeDays)} 天。` : "没有可靠时间，就不替这一年下结论。"}
        </Text>
        <View style={styles.metricRow}>
          <MetricBlock label="观看" value={formatCount(data.counts.watch)} detail="独立视频" accent={annualColors.cyan} />
          <MetricBlock label="喜欢" value={formatCount(data.counts.liked)} detail="独立视频" accent={annualColors.red} />
          <MetricBlock label="收藏" value={formatCount(data.counts.favorite)} detail="独立视频" accent={annualColors.gold} />
          <MetricBlock label="活跃日" value={formatCount(data.activeDays)} detail="至少一条可靠记录" accent={annualColors.ink} />
        </View>
        <View style={styles.sectionDivider} />
        <View style={styles.sectionHeadingRow}><CalendarDays color={annualColors.cyan} size={18} strokeWidth={2} /><Text style={styles.sectionHeading}>全年日历热力图</Text></View>
        <CalendarHeatmap days={data.calendar} />
      </View>
      <View style={styles.secondaryColumn}>
        <Text style={styles.sideLabel}>峰值日</Text>
        <Text style={styles.sideBig}>{data.peakDay ? formatDate(data.peakDay.date) : "尚未出现"}</Text>
        <Text style={styles.sideDetail}>{data.peakDay ? `${formatCount(data.peakDay.uniqueVideos)} 个独立视频，${formatCount(data.peakDay.count)} 条可靠记录` : "需要带可靠行为时间的记录"}</Text>
        <View style={styles.sideRule} />
        <Text style={styles.sideLabel}>实际日期范围</Text>
        <Text style={styles.sideMedium}>{data.dateRange ? `${formatDate(data.dateRange.start)} 至 ${formatDate(data.dateRange.end)}` : "无可用范围"}</Text>
        <Text style={styles.sideDetail}>观看活跃日 {formatCount(data.watchActiveDays)} 天 · 时间覆盖 {formatPercent(coverage.reliableDateRatio)}</Text>
      </View>
    </View>
  );
}

function RhythmCard({ data, privacy }: { data: AnnualRhythmData; privacy: boolean }) {
  const weekdays = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  return (
    <View style={styles.splitWide}>
      <View style={styles.primaryColumn}>
        <Text style={styles.statement}>{data.personality ?? `已有 ${formatCount(data.watchRecordCount)} 条可靠观看记录，尚不足以判断稳定作息。`}</Text>
        <RhythmHeatmap cells={data.heatmap} />
        <View style={styles.inlineFacts}>
          <Fact icon={<CalendarDays size={18} color={annualColors.cyan} />} label="最活跃星期" value={data.mostActiveWeekday ? weekdays[data.mostActiveWeekday.weekday] ?? "未知" : "不可判断"} />
          <Fact icon={<Clock3 size={18} color={annualColors.cyan} />} label="最活跃小时" value={data.mostActiveHour ? `${String(data.mostActiveHour.hour).padStart(2, "0")}:00` : "不可判断"} />
          <Fact icon={<Eye size={18} color={annualColors.cyan} />} label="覆盖" value={`${formatCount(data.activeDays)} 个活跃日`} />
        </View>
      </View>
      <View style={styles.secondaryColumn}>
        <Text style={styles.sideLabel}>时间边界</Text>
        <Text style={styles.listEyebrow}>最早记录</Text>
        <ContentPreview item={data.earliest} privacy={privacy} compact />
        <Text style={styles.listEyebrow}>最晚记录</Text>
        <ContentPreview item={data.latest} privacy={privacy} compact />
        <Text style={styles.thresholdText}>作息人格门槛：至少 {data.threshold.minimumRecords} 条记录、{data.threshold.minimumActiveDays} 个活跃日。</Text>
      </View>
    </View>
  );
}

function MonthlyCard({ data }: { data: AnnualMonthlyData }) {
  const unavailableLabels = data.unavailableSeries.map((item) => ({ watch: "观看", liked: "喜欢", favorite: "收藏" })[item]);
  return (
    <View style={styles.splitWide}>
      <View style={styles.primaryColumn}>
        <Text style={styles.statement}>{data.peakMonth ? `${data.peakMonth.label}冲到了年度峰值，留下 ${formatCount(data.peakMonth.count)} 个独立视频。` : "十二个月都在等一条可按月归档的可靠记录。"}</Text>
        <MonthlyChart months={data.months} />
      </View>
      <View style={styles.secondaryColumn}>
        <Text style={styles.sideLabel}>系列时间覆盖</Text>
        <AvailabilityRow label="观看" available={data.seriesAvailability.watch} color={annualColors.cyan} />
        <AvailabilityRow label="喜欢" available={data.seriesAvailability.liked} color={annualColors.red} />
        <AvailabilityRow label="收藏" available={data.seriesAvailability.favorite} color={annualColors.gold} />
        <View style={styles.sideRule} />
        <Text style={styles.sideLabel}>峰值月份</Text>
        <Text style={styles.sideBig}>{data.peakMonth?.label ?? "不可分析"}</Text>
        <Text style={styles.sideDetail}>{unavailableLabels.length ? `${unavailableLabels.join("、")}缺少可靠行为时间，未绘制该系列。` : "三类行为都已进入月度比较。"}</Text>
      </View>
    </View>
  );
}

function CreatorsCard({ data, privacy }: { data: AnnualCreatorsData; privacy: boolean }) {
  const top = data.top.slice(0, 6);
  const max = top[0]?.count ?? 1;
  return (
    <View style={styles.splitWide}>
      <View style={styles.primaryColumn}>
        <Text style={styles.statement}>{top[0] ? `${privacy ? "一位已隐藏的创作者" : top[0].name}，成为这一年出现最多的名字。` : "创作者信息还没有形成可比较的年度排行。"}</Text>
        <View style={styles.rankList}>
          {top.length ? top.map((creator) => <RankBar key={`${creator.authorId ?? creator.name}:${creator.rank}`} rank={creator.rank} label={privacy ? `创作者 ${String(creator.rank).padStart(2, "0")}` : creator.name} value={creator.count} share={creator.share} max={max} />) : <Text style={styles.emptyInline}>暂无可识别创作者</Text>}
        </View>
      </View>
      <View style={styles.secondaryColumn}>
        <View style={styles.iconHeading}><Users size={20} color={annualColors.cyan} /><Text style={styles.sideLabel}>你的创作者宇宙</Text></View>
        <MetricBlock label="不同创作者" value={formatCount(data.creatorCount)} detail="未知作者不进入排行" accent={annualColors.cyan} large />
        <MetricBlock label="头部占比" value={formatPercent(data.headShare)} detail="Top 1 的独立视频占比" accent={annualColors.red} />
        <MetricBlock label="作者探索度" value={formatPercent(data.exploration)} detail="作者数 / 可归属视频数" accent={annualColors.gold} />
        <Text style={styles.thresholdText}>另有 {formatCount(data.unknownCount)} 条记录无法识别作者，已单独计数。</Text>
      </View>
    </View>
  );
}

function InterestsCard({ data, privacy }: { data: AnnualInterestsData; privacy: boolean }) {
  const topTopic = data.topics[0];
  const topicLabels = data.topics.slice(0, 8);
  const durationValues = data.durations.map((item) => item.count);
  return (
    <View style={styles.interestLayout}>
      <View style={styles.interestLead}>
        <Text style={styles.statement}>{topTopic ? `${privacy ? "一个已隐藏话题" : `#${topTopic.name}`}，是这一年最清晰的显式兴趣信号。` : "没有足够字段，就不拼出一朵想象中的词云。"}</Text>
        <Text style={styles.sectionNote}>仅统计平台话题、标题中的显式 #话题、音乐和视频时长。</Text>
      </View>
      <View style={styles.interestColumns}>
        <View style={styles.interestColumn}>
          <View style={styles.sectionHeadingRow}><Sparkles size={18} color={annualColors.red} /><Text style={styles.sectionHeading}>显式话题</Text></View>
          <View style={styles.topicWrap}>{topicLabels.length ? topicLabels.map((topic, index) => <View key={`${topic.name}:${index}`} style={styles.topicChip}><Text style={styles.topicName}>{privacy ? `话题 ${index + 1}` : `#${topic.name}`}</Text><Text style={styles.topicCount}>{formatCount(topic.count)}</Text></View>) : <Text style={styles.emptyInline}>话题字段不足</Text>}</View>
        </View>
        <View style={styles.interestColumn}>
          <View style={styles.sectionHeadingRow}><Music2 size={18} color={annualColors.gold} /><Text style={styles.sectionHeading}>年度声音</Text></View>
          {data.music.slice(0, 4).map((music, index) => <View style={styles.musicRow} key={`${music.id ?? music.title}:${index}`}><Disc3 size={16} color={annualColors.gold} /><View style={styles.musicCopy}><Text style={styles.musicTitle} numberOfLines={1}>{privacy ? `音乐 ${index + 1}` : music.title}</Text><Text style={styles.musicMeta}>{privacy ? "来源已隐藏" : music.author ?? "作者未知"}</Text></View><Text style={styles.musicCount}>{formatCount(music.count)}</Text></View>)}
          {!data.music.length ? <Text style={styles.emptyInline}>音乐字段不足</Text> : null}
        </View>
        <View style={styles.interestColumn}>
          <View style={styles.sectionHeadingRow}><Clock3 size={18} color={annualColors.cyan} /><Text style={styles.sectionHeading}>视频时长</Text></View>
          <MiniBars values={durationValues} colors={[annualColors.cyanMid, annualColors.cyan, annualColors.gold, annualColors.red]} labels={data.durations.map((item) => item.label.replace("秒以内", "秒").replace("秒至 1 分钟", "秒–1分").replace("1 至 5 分钟", "1–5分").replace("5 分钟以上", "5分+"))} />
          <Text style={styles.sectionNote}>中位数 {data.durationStats.medianSeconds === null ? "—" : `${Math.round(data.durationStats.medianSeconds)} 秒`} · 有效时长 {formatCount(data.durationStats.count)} 条</Text>
        </View>
      </View>
    </View>
  );
}

function KeptCard({ data }: { data: AnnualKeptData }) {
  return (
    <View>
      <View style={styles.snapshotTitleRow}><Library size={22} color={annualColors.ink} /><View><Text style={styles.statement}>{data.allThree > 0 ? `${formatCount(data.allThree)} 个视频，同时出现在观看、喜欢与收藏中。` : "三份列表已经就位，但三者交集暂时为空。"}</Text><Text style={styles.sectionNote}>这是全部已采集列表的内容快照，不是年度转化漏斗。</Text></View></View>
      <View style={styles.setRow}>
        <SetBlock label="观看历史" value={data.sets.watch.videoIds.length} records={data.sets.watch.recordCount} color={annualColors.cyan} icon={<Eye size={21} color={annualColors.cyan} />} />
        <SetBlock label="喜欢列表" value={data.sets.liked.videoIds.length} records={data.sets.liked.recordCount} color={annualColors.red} icon={<Heart size={21} color={annualColors.red} />} />
        <SetBlock label="收藏列表" value={data.sets.favorite.videoIds.length} records={data.sets.favorite.recordCount} color={annualColors.gold} icon={<Star size={21} color={annualColors.gold} />} />
      </View>
      <View style={styles.intersectionBand}>
        <Intersection label="观看 ∩ 喜欢" value={data.pairwise.watchLiked} color={annualColors.red} />
        <Intersection label="观看 ∩ 收藏" value={data.pairwise.watchFavorite} color={annualColors.gold} />
        <Intersection label="喜欢 ∩ 收藏" value={data.pairwise.likedFavorite} color={annualColors.ink} />
        <Intersection label="三者交集" value={data.allThree} color={annualColors.cyan} emphasized />
      </View>
      <Text style={styles.thresholdText}>可比较 videoId 覆盖 {formatCount(data.comparableVideoCount)} 个视频；另有 {formatCount(data.unknownIdRecordCount)} 条记录因缺少 videoId 未进入交集。</Text>
    </View>
  );
}

function HighlightsCard({ data, privacy }: { data: AnnualHighlightsData; privacy: boolean }) {
  const items = [
    { label: "第一条", item: data.first, detail: data.first?.occurredAt ? formatDate(data.first.occurredAt) : "可靠时间不足" },
    { label: "最后一条", item: data.last, detail: data.last?.occurredAt ? formatDate(data.last.occurredAt) : "可靠时间不足" },
    { label: "峰值日代表", item: data.peakDay, detail: data.peakDay?.occurredAt ? formatDate(data.peakDay.occurredAt) : "峰值日不足" },
    { label: "最长视频", item: data.longest, detail: data.longest?.durationSeconds === null || data.longest?.durationSeconds === undefined ? "时长字段不足" : `${Math.round(data.longest.durationSeconds)} 秒` },
    { label: "平台互动最高", item: data.mostEngaged, detail: data.mostEngaged?.interactionScore === null || data.mostEngaged?.interactionScore === undefined ? "互动字段不足" : `确定性展示分 ${formatCount(data.mostEngaged.interactionScore)}` },
  ];
  return (
    <View>
      <Text style={styles.statement}>五个确定性坐标，把年度高光落回真实内容。</Text>
      <Text style={styles.sectionNote}>并列时按稳定规则排序；互动项只是平台统计快照之和，不代表官方排名。</Text>
      <View style={styles.highlightGrid}>{items.map((entry) => <HighlightTile key={entry.label} label={entry.label} item={entry.item} detail={entry.detail} privacy={privacy} />)}</View>
    </View>
  );
}

function SummaryCard({ data, privacy, periodLabel }: { data: AnnualSummaryData; privacy: boolean; periodLabel: string }) {
  const topCreator = privacy ? "创作者已隐藏" : data.metrics.topCreator?.name ?? "暂无";
  const topTopic = privacy ? "话题已隐藏" : data.metrics.topTopic ? `#${data.metrics.topTopic.name}` : "暂无";
  return (
    <View>
      <Text style={styles.summaryKicker}>{periodLabel} / ALL SIGNALS</Text>
      <Text style={styles.summaryTitle}>这是你的年度内容坐标。</Text>
      <View style={styles.bentoGrid}>
        <BentoBlock label="可靠年度内容" value={formatCount(data.metrics.totalUniqueVideos)} detail="独立视频" color={annualColors.cyan} wide />
        <BentoBlock label="活跃日期" value={formatCount(data.metrics.activeDays)} detail="上海时区" color={annualColors.ink} />
        <BentoBlock label="不同创作者" value={formatCount(data.metrics.creatorCount)} detail="未知作者未进入排行" color={annualColors.red} />
        <BentoBlock label="年度创作者" value={topCreator} detail={data.metrics.topCreator ? `${formatCount(data.metrics.topCreator.count)} 个独立视频` : "数据不足"} color={annualColors.red} text />
        <BentoBlock label="显式话题" value={topTopic} detail={data.metrics.topTopic ? `${formatCount(data.metrics.topTopic.count)} 次信号` : "字段不足"} color={annualColors.gold} text />
        <BentoBlock label="三份列表都留下" value={formatCount(data.metrics.allThree)} detail="全部已采集内容快照" color={annualColors.cyan} />
      </View>
      <CoverageStrip coverage={data.coverage} />
      <Text style={styles.summaryFootnote}>本页只复用前七页结果，没有重新扫描或重算原始记录。</Text>
    </View>
  );
}

function PageCanvas({ children, pageNumber, totalPages, label }: { children: React.ReactNode; pageNumber: number; totalPages: number; label: string }) {
  return (
    <View style={styles.pageCanvas} accessibilityRole="summary" accessibilityLabel={label}>
      <View style={styles.pageContent}>{children}</View>
      <Text style={styles.pageCounter}>{String(pageNumber + 1).padStart(2, "0")} / {String(totalPages).padStart(2, "0")}</Text>
    </View>
  );
}

function CardNotice({ card, coverage }: { card: AnnualCard; coverage: DataCoverage }) {
  const notes: string[] = [];
  if (card.reason) notes.push(card.reason);
  notes.push(...card.notices);
  if (coverage.partial) notes.push("采集状态为 partial，结论只代表当前已采集范围");
  if (coverage.undatedRecordCount > 0) notes.push(`${formatCount(coverage.undatedRecordCount)} 条记录没有可用行为时间`);
  if (coverage.unknownSourceRecordCount > 0) notes.push(`${formatCount(coverage.unknownSourceRecordCount)} 条时间来源不可靠`);
  notes.push(...coverage.warnings);
  const unique = [...new Set(notes)];
  if (!unique.length) return null;
  const visible = [...unique.slice(0, 3), ...(unique.length > 3 ? [`另有 ${unique.length - 3} 条提示`] : [])];
  return <View style={styles.noticeBand} accessibilityRole="alert"><Text style={styles.noticeText}>{visible.join(" · ")}</Text></View>;
}

function CoverageStrip({ coverage, compact = false }: { coverage: DataCoverage; compact?: boolean }) {
  return (
    <View style={[styles.coverageStrip, compact && styles.coverageStripCompact]} accessibilityRole="text">
      <View><Text style={styles.coverageValue}>{formatCount(coverage.reliableRecordCount)}</Text><Text style={styles.coverageLabel}>可分析记录</Text></View>
      <View style={styles.coverageDivider} />
      <View><Text style={styles.coverageValue}>{formatCount(coverage.recordCount)}</Text><Text style={styles.coverageLabel}>总记录</Text></View>
      <View style={styles.coverageDivider} />
      <View><Text style={styles.coverageValue}>{formatCount(coverage.recordCount - coverage.reliableRecordCount)}</Text><Text style={styles.coverageLabel}>时间不可用</Text></View>
    </View>
  );
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <View style={styles.fact}><View style={styles.factIcon}>{icon}</View><Text style={styles.factLabel}>{label}</Text><Text style={styles.factValue}>{value}</Text></View>;
}

function AvailabilityRow({ label, available, color }: { label: string; available: boolean; color: string }) {
  return <View style={styles.availabilityRow}><View style={[styles.availabilitySwatch, { backgroundColor: color }]} /><Text style={styles.availabilityLabel}>{label}</Text><Text style={[styles.availabilityState, { color: available ? "#08777D" : annualColors.warning }]}>{available ? "可分析" : "不可分析"}</Text></View>;
}

function SetBlock({ label, value, records, color, icon }: { label: string; value: number; records: number; color: string; icon: React.ReactNode }) {
  return <View style={[styles.setBlock, { borderTopColor: color }]}>{icon}<Text style={styles.setLabel}>{label}</Text><Text style={styles.setValue}>{formatCount(value)}</Text><Text style={styles.setDetail}>可比较 videoId · 原始列表 {formatCount(records)} 条</Text></View>;
}

function Intersection({ label, value, color, emphasized = false }: { label: string; value: number; color: string; emphasized?: boolean }) {
  return <View style={[styles.intersectionItem, emphasized && styles.intersectionEmphasis]}><View style={[styles.intersectionMark, { backgroundColor: color }]} /><Text style={styles.intersectionLabel}>{label}</Text><Text style={[styles.intersectionValue, emphasized && { color }]}>{formatCount(value)}</Text></View>;
}

function HighlightTile({ label, item, detail, privacy }: { label: string; item: AnnualHighlightsData["first"]; detail: string; privacy: boolean }) {
  return (
    <View style={styles.highlightTile}>
      <CoverImage uri={item?.coverUrl} title={item?.title} privacy={privacy} size="small" />
      <View style={styles.highlightCopy}>
        <Text style={styles.highlightLabel}>{label}</Text>
        <Text style={styles.highlightTitle} numberOfLines={2}>{privacy ? "内容已隐藏" : item?.title ?? "暂无可确定内容"}</Text>
        <Text style={styles.highlightDetail} numberOfLines={1}>{privacy ? "详情已替换" : detail}</Text>
      </View>
    </View>
  );
}

function BentoBlock({ label, value, detail, color, wide = false, text = false }: { label: string; value: string; detail: string; color: string; wide?: boolean; text?: boolean }) {
  return <View style={[styles.bentoBlock, wide && styles.bentoWide, { borderTopColor: color }]}><Text style={styles.bentoLabel}>{label}</Text><Text style={[styles.bentoValue, text && styles.bentoValueText]} numberOfLines={text ? 2 : 1}>{value}</Text><Text style={styles.bentoDetail}>{detail}</Text></View>;
}

const styles = StyleSheet.create({
  pageCanvas: { flex: 1, width: "100%", maxWidth: 1420, alignSelf: "center", paddingHorizontal: 44, paddingTop: 28, paddingBottom: 30 },
  pageContent: { flex: 1, minHeight: 0, justifyContent: "center" },
  pageCounter: { position: "absolute", right: 44, bottom: 14, color: annualColors.inkFaint, fontSize: 11, fontWeight: "800", fontVariant: ["tabular-nums"] },
  eyebrow: { color: annualColors.cyan, fontSize: 11, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0 },
  coverLayout: { flexDirection: "row", alignItems: "center", gap: 52 },
  coverCopy: { flex: 1, minWidth: 0 },
  coverVisual: { width: 350, alignItems: "stretch" },
  coverMetaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  coverYear: { color: annualColors.ink, fontSize: 80, lineHeight: 86, fontWeight: "900", marginTop: 18, fontVariant: ["tabular-nums"], letterSpacing: 0 },
  coverTitle: { color: annualColors.ink, fontSize: 34, lineHeight: 42, fontWeight: "900", marginTop: 4, letterSpacing: 0 },
  coverLead: { maxWidth: 620, color: annualColors.inkMuted, fontSize: 15, lineHeight: 24, marginTop: 18 },
  coverMetrics: { flexDirection: "row", flexWrap: "wrap", gap: 16, marginTop: 28 },
  coverFrame: { padding: 24, backgroundColor: annualColors.carbon, borderRadius: 8 },
  coverFrameCopy: { marginTop: 18 },
  coverFrameLabel: { color: "#8FD6D5", fontSize: 11, fontWeight: "800" },
  coverFrameTitle: { color: annualColors.white, fontSize: 19, lineHeight: 27, fontWeight: "900", marginTop: 7 },
  coverFrameMeta: { color: "#B8C0C6", fontSize: 12, marginTop: 8 },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 24 },
  cardHeadingCopy: { flex: 1, minWidth: 0 },
  cardTitle: { color: annualColors.ink, fontSize: 30, lineHeight: 38, fontWeight: "900", marginTop: 7, letterSpacing: 0 },
  cardDescription: { color: annualColors.inkMuted, fontSize: 13, lineHeight: 20, marginTop: 4 },
  noticeBand: { minHeight: 36, justifyContent: "center", marginTop: 12, paddingHorizontal: 12, borderLeftWidth: 3, borderLeftColor: annualColors.warning, backgroundColor: annualColors.warningSoft },
  noticeText: { color: annualColors.warning, fontSize: 11, lineHeight: 17, fontWeight: "700" },
  cardContent: { flex: 1, minHeight: 0, justifyContent: "center", marginTop: 18 },
  statement: { color: annualColors.ink, fontSize: 22, lineHeight: 31, fontWeight: "900", maxWidth: 760, letterSpacing: 0 },
  sectionNote: { color: annualColors.inkMuted, fontSize: 11, lineHeight: 17, marginTop: 5 },
  splitWide: { flexDirection: "row", gap: 36, alignItems: "stretch" },
  primaryColumn: { flex: 1.75, minWidth: 0 },
  secondaryColumn: { flex: 0.75, minWidth: 260, paddingLeft: 26, borderLeftWidth: 1, borderLeftColor: annualColors.line, justifyContent: "center" },
  metricRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 16 },
  sectionDivider: { height: 1, backgroundColor: annualColors.line, marginVertical: 14 },
  sectionHeadingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionHeading: { color: annualColors.ink, fontSize: 13, fontWeight: "900" },
  sideLabel: { color: annualColors.inkMuted, fontSize: 11, lineHeight: 16, fontWeight: "900", textTransform: "uppercase" },
  sideBig: { color: annualColors.ink, fontSize: 25, lineHeight: 32, fontWeight: "900", marginTop: 8 },
  sideMedium: { color: annualColors.ink, fontSize: 15, lineHeight: 23, fontWeight: "800", marginTop: 8 },
  sideDetail: { color: annualColors.inkMuted, fontSize: 11, lineHeight: 17, marginTop: 6 },
  sideRule: { width: 38, height: 4, borderRadius: 2, backgroundColor: annualColors.cyan, marginVertical: 22 },
  inlineFacts: { flexDirection: "row", gap: 12, marginTop: 16 },
  fact: { flex: 1, minWidth: 0, minHeight: 80, paddingTop: 10, borderTopWidth: 1, borderTopColor: annualColors.line },
  factIcon: { marginBottom: 6 },
  factLabel: { color: annualColors.inkMuted, fontSize: 10, fontWeight: "700" },
  factValue: { color: annualColors.ink, fontSize: 15, fontWeight: "900", marginTop: 4 },
  listEyebrow: { color: annualColors.inkFaint, fontSize: 10, fontWeight: "900", marginTop: 10 },
  thresholdText: { color: annualColors.inkMuted, fontSize: 11, lineHeight: 17, marginTop: 14 },
  availabilityRow: { minHeight: 42, flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: annualColors.line },
  availabilitySwatch: { width: 18, height: 5, borderRadius: 3 },
  availabilityLabel: { flex: 1, color: annualColors.ink, fontSize: 13, fontWeight: "800", marginLeft: 9 },
  availabilityState: { fontSize: 11, fontWeight: "900" },
  rankList: { marginTop: 14 },
  emptyInline: { color: annualColors.inkMuted, fontSize: 13, lineHeight: 20, paddingVertical: 18 },
  iconHeading: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  interestLayout: { gap: 20 },
  interestLead: { maxWidth: 850 },
  interestColumns: { flexDirection: "row", gap: 26 },
  interestColumn: { flex: 1, minWidth: 0, paddingRight: 20, borderRightWidth: 1, borderRightColor: annualColors.line },
  topicWrap: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 14 },
  topicChip: { minHeight: 32, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 10, borderRadius: 6, backgroundColor: annualColors.redSoft },
  topicName: { color: "#9D2F42", fontSize: 11, fontWeight: "800" },
  topicCount: { color: annualColors.red, fontSize: 11, fontWeight: "900" },
  musicRow: { minHeight: 46, flexDirection: "row", alignItems: "center", gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: annualColors.line },
  musicCopy: { flex: 1, minWidth: 0 },
  musicTitle: { color: annualColors.ink, fontSize: 11, fontWeight: "800" },
  musicMeta: { color: annualColors.inkFaint, fontSize: 10, marginTop: 2 },
  musicCount: { color: annualColors.ink, fontSize: 12, fontWeight: "900" },
  snapshotTitleRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  setRow: { flexDirection: "row", gap: 16, marginTop: 24 },
  setBlock: { flex: 1, minHeight: 138, padding: 16, borderTopWidth: 4, backgroundColor: annualColors.surface, borderBottomWidth: 1, borderBottomColor: annualColors.line },
  setLabel: { color: annualColors.inkMuted, fontSize: 11, fontWeight: "800", marginTop: 10 },
  setValue: { color: annualColors.ink, fontSize: 30, lineHeight: 36, fontWeight: "900", marginTop: 3 },
  setDetail: { color: annualColors.inkFaint, fontSize: 10, lineHeight: 15, marginTop: 4 },
  intersectionBand: { minHeight: 96, flexDirection: "row", alignItems: "center", marginTop: 18, borderTopWidth: 1, borderBottomWidth: 1, borderColor: annualColors.line },
  intersectionItem: { flex: 1, alignItems: "center", justifyContent: "center", borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: annualColors.line },
  intersectionEmphasis: { backgroundColor: "#E8F6F5", alignSelf: "stretch" },
  intersectionMark: { width: 22, height: 4, borderRadius: 2, marginBottom: 7 },
  intersectionLabel: { color: annualColors.inkMuted, fontSize: 10, fontWeight: "800" },
  intersectionValue: { color: annualColors.ink, fontSize: 21, fontWeight: "900", marginTop: 4 },
  highlightGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 18 },
  highlightTile: { width: "32%", minWidth: 260, minHeight: 82, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingRight: 10, borderTopWidth: 1, borderTopColor: annualColors.lineStrong },
  highlightCopy: { flex: 1, minWidth: 0 },
  highlightLabel: { color: annualColors.cyan, fontSize: 10, fontWeight: "900" },
  highlightTitle: { color: annualColors.ink, fontSize: 12, lineHeight: 17, fontWeight: "800", marginTop: 4 },
  highlightDetail: { color: annualColors.inkMuted, fontSize: 10, marginTop: 4 },
  summaryKicker: { color: annualColors.cyan, fontSize: 11, fontWeight: "900" },
  summaryTitle: { color: annualColors.ink, fontSize: 34, lineHeight: 42, fontWeight: "900", marginTop: 7, letterSpacing: 0 },
  bentoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 20 },
  bentoBlock: { width: "31.8%", minHeight: 108, padding: 14, borderTopWidth: 4, borderBottomWidth: 1, borderBottomColor: annualColors.line, backgroundColor: annualColors.surface },
  bentoWide: { width: "31.8%" },
  bentoLabel: { color: annualColors.inkMuted, fontSize: 10, fontWeight: "800" },
  bentoValue: { color: annualColors.ink, fontSize: 28, lineHeight: 34, fontWeight: "900", marginTop: 6 },
  bentoValueText: { fontSize: 17, lineHeight: 22 },
  bentoDetail: { color: annualColors.inkFaint, fontSize: 10, lineHeight: 15, marginTop: 3 },
  summaryFootnote: { color: annualColors.inkFaint, fontSize: 10, marginTop: 10 },
  coverageStrip: { minHeight: 66, flexDirection: "row", alignItems: "center", gap: 20, marginTop: 16, paddingHorizontal: 16, borderWidth: 1, borderColor: annualColors.line, backgroundColor: annualColors.surface },
  coverageStripCompact: { marginTop: 12, backgroundColor: "transparent", borderColor: annualColors.lineStrong },
  coverageValue: { color: annualColors.ink, fontSize: 16, fontWeight: "900", fontVariant: ["tabular-nums"] },
  coverageLabel: { color: annualColors.inkMuted, fontSize: 9, fontWeight: "700", marginTop: 3 },
  coverageDivider: { width: 1, height: 30, backgroundColor: annualColors.line },
});
