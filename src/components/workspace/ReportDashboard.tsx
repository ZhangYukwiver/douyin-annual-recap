import React from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  type TextProps,
  View,
} from "react-native";
import Svg, { Circle, Path, Text as SvgText } from "react-native-svg";

import {
  attentionLabel,
  attentionPattern,
  contentPattern,
  creatorsPattern,
  heatColors,
  pctLabel,
  rhythmPattern,
  smoothPath,
  type ReportModel,
} from "./ReportWorkspace";
import { workspaceColors as color, workspaceFonts as font } from "./workspaceTheme";

export interface ReportDashboardProps {
  mobile: boolean;
  model: ReportModel;
  onOpenRecord: (url: string) => Promise<void>;
  privacy: boolean;
}

const weekLetters = ["M", "T", "W", "T", "F", "S", "S"];
const weekdayNames = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const monthNames = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
const TEAL = color.cyan;
const GOLD = color.accent;
const sliceColors = ["#6E8C8F", "#C59861", "#4E787C", "#A8804F", "#8FA9AB", "#8A6238"];

/**
 * 持续报告：与故事页（ReportWorkspace 十二章）同源的一屏读数。
 * 版式是错位便当盒——每格只做一件事、只用一种图形，格子高度不齐才排得出层次。
 */
export function ReportDashboard({ mobile, model, onOpenRecord, privacy }: ReportDashboardProps) {
  const observed = model.total + model.chat;
  const partial = model.status === "partial" || model.reliableRatio < 1;
  const pcts = model.progressPercents;
  const share = (test: (value: number) => boolean) => (pcts.length ? pcts.filter(test).length / pcts.length * 100 : null);
  const recent = [...new Map(model.recent.map((item) => [`${item.title}:${item.time}`, item])).values()].slice(0, 6);

  return (
    <ScrollView
      testID="report-dashboard"
      contentContainerStyle={[styles.content, mobile && styles.contentMobile]}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.masthead, mobile && styles.mastheadMobile]}>
        <View style={styles.mastheadCopy}>
          <Text style={styles.eyebrow}>LIVING REPORT · {model.period}</Text>
          <Text style={[styles.title, mobile && styles.titleMobile]}>十二章报告，一格一图。</Text>
          <Text style={styles.lead}>节拍、停留、内容、创作者、聊天、交叉与习惯，全部来自当前本地样本，与内容故事同源同口径。</Text>
        </View>
        <View style={[styles.mastheadSide, mobile && styles.mastheadSideMobile]}>
          <Text numberOfLines={1} style={styles.mastheadValue}>{model.period}</Text>
          <Text style={styles.mastheadMeta}>{model.activeDays} 个活跃日 · {model.year}</Text>
          <Text style={styles.mastheadMeta}>{model.status === "empty" ? "样本为空" : partial ? "部分样本" : "完整样本"}</Text>
        </View>
      </View>

      {partial ? (
        <View style={styles.coverage}>
          <Text style={styles.coverageLabel}>样本覆盖</Text>
          <Text style={styles.coverageText}>
            {model.dated.toLocaleString("zh-CN")} / {model.total.toLocaleString("zh-CN")} 条记录带可靠行为时间
            {model.warnings[0] ? ` · ${model.warnings[0]}` : ""}
          </Text>
        </View>
      ) : null}

      <Row mobile={mobile}>
        <Tile en="ACTIVE DAYS" flex={1} minHeight={124} mobile={mobile} title="活跃天数">
          <Figure sub="/ 365" value={model.activeDays ? String(model.activeDays) : "—"} />
        </Tile>
        <Tile en="EVENTS" flex={1} minHeight={124} mobile={mobile} title="观测事件">
          <Figure sub="observed" value={observed ? observed.toLocaleString("en-US") : "—"} />
        </Tile>
        <Tile en="UNIQUE" flex={1} minHeight={124} mobile={mobile} title="去重内容">
          <Figure sub="unique" value={model.unique ? model.unique.toLocaleString("en-US") : "—"} />
        </Tile>
        <Tile en="ATTENTION" flex={1} minHeight={124} mobile={mobile} title="总注意力">
          <Figure sub={model.watch ? `${model.watch.toLocaleString("zh-CN")} 条观看` : "observed"} value={attentionLabel(model.attentionSeconds)} />
        </Tile>
      </Row>

      <Row mobile={mobile}>
        <Tile
          en="WEEK × HOUR"
          flex={2.3}
          foot={rhythmPattern(model)}
          meta={model.peakDay === null ? "时间证据不足" : `${weekdayNames[model.peakDay]} 最密`}
          minHeight={278}
          mobile={mobile}
          title="一周热力"
        >
          <HeatGrid heatmap={model.heatmap} />
        </Tile>
        <Tile en="HOURS" flex={1.5} meta={model.peakHour === null ? "—" : `${pad(model.peakHour)}:00 峰值`} minHeight={228} mobile={mobile} title="一天的曲线">
          <HourCurve peak={model.peakHour} values={model.hours} />
        </Tile>
        <Tile en="COMPLETION" flex={1} meta={`${pcts.length.toLocaleString("zh-CN")} 条进度`} minHeight={278} mobile={mobile} title="平均完成度">
          <Ring caption={model.watch ? `重播 ${Math.round(model.replays / model.watch * 100)}%` : "等待进度"} label={pctLabel(model.completion)} value={model.completion} />
        </Tile>
      </Row>

      <Row mobile={mobile}>
        <Tile en="TOPICS" flex={2} foot={contentPattern(model.topics)} meta={`${model.topics.length} 个主题信号`} minHeight={252} mobile={mobile} title="主题色块">
          <Mosaic items={model.topics.slice(0, 8).map((topic, index) => ({ label: privacy ? `话题${index + 1}` : topic.name, value: topic.count }))} />
        </Tile>
        <Tile en="LENGTH" flex={1.2} meta="按内容时长" minHeight={248} mobile={mobile} title="时长构成">
          <Pie slices={model.durationBands.map((band) => ({ label: band.label, sub: band.en, value: band.share ?? 0 }))} />
        </Tile>
        <Tile en="FORMAT" flex={1} meta={`${model.formats.length} 种形态`} minHeight={226} mobile={mobile} title="内容形态">
          <Pie donut slices={model.formats.slice(0, 4).map((format) => ({ label: format.name, sub: String(format.count), value: format.share }))} />
        </Tile>
      </Row>

      <Row mobile={mobile}>
        <Tile en="FUNNEL" flex={1.3} foot={attentionPattern(model.completion)} meta="观看进度分档" minHeight={262} mobile={mobile} title="停留漏斗">
          <Funnel steps={[
            { label: "开始浏览", value: pcts.length ? 100 : null },
            { label: "继续观看", value: share((value) => value >= 25) },
            { label: "深度观看", value: share((value) => value >= 60) },
            { label: "完成观看", value: share((value) => value >= 90) },
          ]} />
        </Tile>
        <Tile en="LONG TAIL" flex={2} foot={creatorsPattern(model)} meta={`${model.creatorsCount.toLocaleString("zh-CN")} 位可识别`} minHeight={228} mobile={mobile} title="创作者长尾">
          <TailCurve head={model.creators.slice(0, 3).map((creator, index) => ({ label: privacy ? `创作者 ${index + 1}` : creator.name, value: creator.count }))} tail={model.creatorFocus.tail} />
        </Tile>
        <Tile en="CONCENTRATION" flex={1} meta="前三位占比" minHeight={262} mobile={mobile} title="创作者集中度">
          <Ring caption={`新面孔 ${pctLabel(model.creatorFocus.discovery)}`} label={pctLabel(model.creatorFocus.concentration)} tone={GOLD} value={model.creatorFocus.concentration} />
        </Tile>
      </Row>

      <Row mobile={mobile}>
        <Tile en="DAY & NIGHT" flex={2} meta={`昼夜重合 ${pctLabel(model.overlap)}`} minHeight={236} mobile={mobile} title="内容与对话">
          <DualCurve chat={model.chatHours} watch={model.hours} />
        </Tile>
        <Tile en="CHAT MIX" flex={1} meta={`${model.chat.toLocaleString("zh-CN")} 条消息`} minHeight={268} mobile={mobile} title="消息类型">
          <Pie donut slices={model.chatKinds.slice(0, 5).map((kind) => ({ label: kind.name, sub: String(kind.count), value: kind.share }))} />
        </Tile>
        <Tile en="MONTHS" flex={1.8} meta={model.peakMonth === null ? "月份趋势不可用" : `峰值 ${monthNames[model.peakMonth]}`} minHeight={210} mobile={mobile} title="全年起伏">
          <MonthCurve months={model.months} peak={model.peakMonth} />
        </Tile>
      </Row>

      <Row mobile={mobile}>
        <Tile en="OVERLAP" flex={1.1} meta="三类列表交集" minHeight={272} mobile={mobile} title="留下的内容">
          <Venn intersection={model.intersection} totals={{ favorite: model.favorite, liked: model.liked, watch: model.watch }} />
        </Tile>
        <Tile en="CORRELATION" flex={1.2} meta={`${model.cross.days} 个观测日`} minHeight={302} mobile={mobile} title="交叉矩阵">
          <Matrix labels={model.cross.labels} matrix={model.cross.matrix} />
        </Tile>
        <Tile en="HABIT PROFILE" flex={1.3} meta={model.profile} minHeight={272} mobile={mobile} title="习惯雷达">
          <Radar axes={model.axes} />
        </Tile>
      </Row>

      <Row mobile={mobile}>
        <Tile en="CROSS PATTERNS" flex={1.4} meta="按相关性排序" minHeight={212} mobile={mobile} title="交叉洞察">
          <InsightList items={model.cross.patterns.map((pattern) => ({ text: pattern.text, title: pattern.title }))} />
        </Tile>
        <Tile
          en="SURPRISES"
          flex={1.4}
          meta={`${model.surprises.filter((insight) => insight.status === "observed").length} / ${model.surprises.length} 已点亮`}
          minHeight={252}
          mobile={mobile}
          title="意外发现"
        >
          <InsightList items={model.surprises.map((insight) => ({ badge: insight.status, text: insight.text, title: insight.title }))} />
        </Tile>
        <Tile en="RECENT" flex={1.5} meta={`${model.events.length.toLocaleString("zh-CN")} 条事件`} minHeight={212} mobile={mobile} title="近期事件">
          <EventList items={recent} onOpenRecord={onOpenRecord} privacy={privacy} />
        </Tile>
      </Row>

      <View style={styles.boundary}>
        <Text style={styles.boundaryTitle}>数据边界 / BOUNDARY</Text>
        <Text style={styles.boundaryText}>
          {model.total.toLocaleString("zh-CN")} 条内容记录中 {model.dated.toLocaleString("zh-CN")} 条带可靠行为时间（{Math.round(model.reliableRatio * 100)}%）；
          无时间记录仍计入总量，但不参与时段、月份与交叉结论。聊天只统计时间与类型，群聊只计总量。
        </Text>
        {model.warnings.slice(0, 3).map((warning) => <Text key={warning} style={styles.boundaryNotice}>{warning}</Text>)}
      </View>
    </ScrollView>
  );
}

/* ---------- 便当格外壳 ---------- */

function Row({ children, mobile }: { children: React.ReactNode; mobile: boolean }) {
  return <View style={[styles.row, mobile && styles.rowMobile]}>{children}</View>;
}

function Tile({ children, en, flex, foot, meta, minHeight, mobile, title }: {
  children: React.ReactNode;
  en: string;
  flex: number;
  foot?: string;
  meta?: string;
  minHeight: number;
  mobile: boolean;
  title: string;
}) {
  return (
    <View style={[styles.tile, { flexGrow: flex, minHeight }, mobile && styles.tileMobile]}>
      <View style={styles.tileHead}>
        <Text style={styles.tileTitle}>{title}</Text>
        <Text style={styles.tileEn}>/ {en}</Text>
        {meta ? <Text numberOfLines={1} style={styles.tileMeta}>{meta}</Text> : null}
      </View>
      <View style={styles.tileBody}>{children}</View>
      {foot ? (
        <View style={styles.tileFoot}>
          <Text style={styles.tileFootMark}>✦</Text>
          <Text style={styles.tileFootText}>{foot}</Text>
        </View>
      ) : null}
    </View>
  );
}

/* ---------- 单一职责的图形组件 ---------- */

function Figure({ sub, value }: { sub: string; value: string }) {
  return (
    <View style={styles.figure}>
      <Text style={styles.figureValue}>{value}</Text>
      <Text style={styles.figureSub}>{sub}</Text>
    </View>
  );
}

/** 周 × 小时的观看密度色块。 */
function HeatGrid({ heatmap }: { heatmap: number[] }) {
  const max = Math.max(1, ...heatmap);
  return (
    <View style={styles.heatWrap}>
      {weekLetters.map((letter, day) => (
        <View key={`${letter}:${day}`} style={styles.heatRow}>
          <Text style={styles.heatLetter}>{letter}</Text>
          <View style={styles.heatCells}>
            {Array.from({ length: 24 }, (_, hour) => {
              const value = heatmap[day * 24 + hour] ?? 0;
              const step = value === 0 ? 0 : Math.min(heatColors.length - 1, 1 + Math.floor(value / max * (heatColors.length - 1.001)));
              return <View key={hour} style={[styles.heatCell, { backgroundColor: heatColors[step] }]} />;
            })}
          </View>
        </View>
      ))}
      <View style={styles.heatAxis}>
        <Text style={styles.axisText}>00</Text>
        <Text style={styles.axisText}>06</Text>
        <Text style={styles.axisText}>12</Text>
        <Text style={styles.axisText}>18</Text>
        <Text style={styles.axisText}>23</Text>
      </View>
    </View>
  );
}

/** 24 小时观看量的面积曲线。 */
function HourCurve({ peak, values }: { peak: number | null; values: number[] }) {
  const max = Math.max(1, ...values);
  const points = values.map((value, index) => [index / 23 * 300, 96 - value / max * 82] as [number, number]);
  const line = smoothPath(points);
  const peakPoint = peak === null ? null : points[peak];
  return (
    <View>
      <Svg height={104} preserveAspectRatio="none" viewBox="0 0 300 104" width="100%">
        <Path d={`${line} L 300 104 L 0 104 Z`} fill={TEAL} fillOpacity={0.16} />
        <Path d={line} fill="none" stroke={TEAL} strokeWidth={1.4} />
        {peakPoint ? <Circle cx={peakPoint[0]} cy={peakPoint[1]} fill={GOLD} r={3} /> : null}
      </Svg>
      <View style={styles.axisRow}>
        <Text style={styles.axisText}>00</Text>
        <Text style={styles.axisText}>06</Text>
        <Text style={styles.axisText}>12</Text>
        <Text style={styles.axisText}>18</Text>
        <Text style={styles.axisText}>23</Text>
      </View>
    </View>
  );
}

/** 单值圆环。 */
function Ring({ caption, label, tone = TEAL, value }: { caption: string; label: string; tone?: string; value: number | null }) {
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const pct = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <View style={styles.ringWrap}>
      <Svg height={124} viewBox="0 0 124 124" width={124}>
        <Circle cx={62} cy={62} fill="none" r={radius} stroke={color.surfaceMuted} strokeWidth={9} />
        {value !== null ? (
          <Circle
            cx={62}
            cy={62}
            fill="none"
            r={radius}
            stroke={tone}
            strokeDasharray={`${circumference * pct / 100} ${circumference}`}
            strokeWidth={9}
            transform="rotate(-90 62 62)"
          />
        ) : null}
      </Svg>
      <View pointerEvents="none" style={styles.ringCenter}><Text style={styles.ringValue}>{label}</Text></View>
      <Text style={styles.ringCaption}>{caption}</Text>
    </View>
  );
}

/** 饼图 / 环形图，附带图例。 */
function Pie({ donut = false, slices }: { donut?: boolean; slices: Array<{ label: string; sub: string; value: number }> }) {
  const total = slices.reduce((sum, slice) => sum + Math.max(0, slice.value), 0);
  if (!total) return <Empty text="等待样本" />;
  const inner = donut ? 30 : 0;
  let angle = -Math.PI / 2;
  const drawn = slices.filter((slice) => slice.value > 0).map((slice, index) => {
    const sweep = slice.value / total * Math.PI * 2;
    const path = arcPath(56, 56, 52, inner, angle, angle + Math.min(sweep, Math.PI * 2 - 0.0001));
    angle += sweep;
    return { path, slice, tone: sliceColors[index % sliceColors.length]! };
  });
  const single = drawn.length === 1;
  return (
    <View style={styles.pieWrap}>
      <Svg height={112} viewBox="0 0 112 112" width={112}>
        {single ? (
          <Circle cx={56} cy={56} fill={drawn[0]!.tone} r={52} />
        ) : drawn.map(({ path, tone }, index) => <Path d={path} fill={tone} key={index} />)}
        {donut ? <Circle cx={56} cy={56} fill={color.surface} r={inner} /> : null}
      </Svg>
      <View style={styles.legend}>
        {drawn.map(({ slice, tone }, index) => (
          <View key={`${slice.label}:${index}`} style={styles.legendRow}>
            <View style={[styles.legendSwatch, { backgroundColor: tone }]} />
            <Text numberOfLines={1} style={styles.legendLabel}>{slice.label}</Text>
            <Text style={styles.legendValue}>{Math.round(slice.value / total * 100)}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** 按占比铺开的色块（面积＝权重）。 */
function Mosaic({ items }: { items: Array<{ label: string; value: number }> }) {
  if (!items.length) return <Empty text="等待主题证据" />;
  const rows = [items.slice(0, Math.ceil(items.length / 2)), items.slice(Math.ceil(items.length / 2))].filter((row) => row.length);
  const values = items.map((item) => item.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  return (
    <View style={styles.mosaic}>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.mosaicRow}>
          {row.map((item, index) => {
            const weight = item.value / max;
            const step = max === min ? 3 : 1 + Math.round((item.value - min) / (max - min) * (heatColors.length - 2));
            return (
              <View
                key={`${item.label}:${index}`}
                style={[styles.mosaicCell, {
                  flexGrow: Math.max(0.4, weight),
                  backgroundColor: heatColors[step],
                  borderColor: item.value === max ? GOLD : color.border,
                }]}
              >
                <Text numberOfLines={1} style={styles.mosaicLabel}>{item.label}</Text>
                <Text style={styles.mosaicValue}>{item.value}</Text>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** 逐级收窄的漏斗色块。 */
function Funnel({ steps }: { steps: Array<{ label: string; value: number | null }> }) {
  return (
    <View style={styles.funnel}>
      {steps.map((step, index) => (
        <View key={step.label} style={styles.funnelRow}>
          <Text style={styles.funnelLabel}>{step.label}</Text>
          <View style={styles.funnelTrack}>
            <View style={[styles.funnelBlock, {
              width: `${step.value === null ? 0 : Math.max(3, step.value)}%`,
              backgroundColor: index === 0 ? "#3F5C5E" : index === 1 ? "#4E787C" : index === 2 ? TEAL : GOLD,
            }]} />
          </View>
          <Text style={styles.funnelValue}>{pctLabel(step.value)}</Text>
        </View>
      ))}
    </View>
  );
}

/** 创作者长尾：前三位标注 + 尾部衰减曲线。 */
function TailCurve({ head, tail }: { head: Array<{ label: string; value: number }>; tail: number[] }) {
  const series = [...head.map((item) => item.value), ...tail];
  if (series.length < 2) return <Empty text="等待创作者证据" />;
  const max = Math.max(1, ...series);
  const scale = (value: number) => Math.log1p(Math.max(0, value)) / Math.log1p(max);
  const points = series.map((value, index) => [index / (series.length - 1) * 300, 86 - scale(value) * 72] as [number, number]);
  const line = smoothPath(points, 86);
  return (
    <View>
      <Svg height={92} preserveAspectRatio="none" viewBox="0 0 300 92" width="100%">
        <Path d={`${line} L 300 92 L 0 92 Z`} fill={GOLD} fillOpacity={0.14} />
        <Path d={line} fill="none" stroke={GOLD} strokeWidth={1.4} />
      </Svg>
      <View style={styles.headList}>
        {head.map((item, index) => (
          <View key={`${item.label}:${index}`} style={styles.headRow}>
            <Text style={styles.headRank}>{pad(index + 1)}</Text>
            <Text numberOfLines={1} style={styles.headName}>{item.label}</Text>
            <Text style={styles.headValue}>{item.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** 内容与对话的两条昼夜曲线。 */
function DualCurve({ chat, watch }: { chat: number[]; watch: number[] }) {
  const line = (values: number[]) => {
    const max = Math.max(1, ...values);
    return smoothPath(values.map((value, index) => [index / 23 * 300, 96 - value / max * 78] as [number, number]));
  };
  const watchLine = line(watch);
  const chatLine = line(chat);
  const hasChat = chat.some((value) => value > 0);
  return (
    <View>
      <Svg height={104} preserveAspectRatio="none" viewBox="0 0 300 104" width="100%">
        <Path d={`${watchLine} L 300 104 L 0 104 Z`} fill={TEAL} fillOpacity={0.14} />
        <Path d={watchLine} fill="none" stroke={TEAL} strokeWidth={1.4} />
        {hasChat ? <Path d={chatLine} fill="none" stroke={GOLD} strokeDasharray="4 3" strokeWidth={1.4} /> : null}
      </Svg>
      <View style={styles.axisRow}>
        <Text style={styles.axisText}>00</Text>
        <Text style={styles.axisText}>06</Text>
        <Text style={styles.axisText}>12</Text>
        <Text style={styles.axisText}>18</Text>
        <Text style={styles.axisText}>23</Text>
      </View>
      <View style={styles.legendInline}>
        <View style={[styles.legendSwatch, { backgroundColor: TEAL }]} /><Text style={styles.legendLabel}>内容</Text>
        <View style={[styles.legendSwatch, { backgroundColor: GOLD }]} /><Text style={styles.legendLabel}>{hasChat ? "对话" : "对话待观测"}</Text>
      </View>
    </View>
  );
}

/** 十二个月的起伏曲线。 */
function MonthCurve({ months, peak }: { months: number[]; peak: number | null }) {
  const max = Math.max(1, ...months);
  const points = months.map((value, index) => [index / 11 * 300, 78 - value / max * 64] as [number, number]);
  const line = smoothPath(points, 78);
  const peakPoint = peak === null ? null : points[peak];
  return (
    <View>
      <Svg height={86} preserveAspectRatio="none" viewBox="0 0 300 86" width="100%">
        <Path d={`${line} L 300 86 L 0 86 Z`} fill={TEAL} fillOpacity={0.14} />
        <Path d={line} fill="none" stroke={TEAL} strokeWidth={1.4} />
        {peakPoint ? <Circle cx={peakPoint[0]} cy={peakPoint[1]} fill={GOLD} r={3} /> : null}
      </Svg>
      <View style={styles.axisRow}>
        {monthNames.filter((_, index) => index % 3 === 0).map((name) => <Text key={name} style={styles.axisText}>{name}</Text>)}
        <Text style={styles.axisText}>12月</Text>
      </View>
    </View>
  );
}

/** 三类列表的交集韦恩图。 */
function Venn({ intersection, totals }: { intersection: ReportModel["intersection"]; totals: { favorite: number; liked: number; watch: number } }) {
  const circles = [
    { cx: 100, cy: 52, label: "观看", tone: "#7FB0B4", total: totals.watch, tx: 100, ty: 18 },
    { cx: 74, cy: 96, label: "喜欢", tone: GOLD, total: totals.liked, tx: 34, ty: 126 },
    { cx: 126, cy: 96, label: "收藏", tone: "#A8804F", total: totals.favorite, tx: 166, ty: 126 },
  ];
  return (
    <View>
      <Svg height={150} viewBox="0 0 200 150" width="100%">
        {circles.map((circle) => (
          <Circle cx={circle.cx} cy={circle.cy} fill={circle.tone} fillOpacity={0.13} key={circle.label} r={42} stroke={circle.tone} strokeOpacity={0.75} strokeWidth={1} />
        ))}
        {circles.map((circle) => (
          <SvgText fill={color.textMuted} fontSize={9} key={`${circle.label}-label`} textAnchor="middle" x={circle.tx} y={circle.ty}>{circle.label}</SvgText>
        ))}
        <SvgText fill={color.figure} fontSize={13} textAnchor="middle" x={100} y={92}>{intersection.allThree.toLocaleString("zh-CN")}</SvgText>
      </Svg>
      <View style={styles.cellGrid}>
        <Cell label="喜欢 ∩ 收藏" value={intersection.likedFavorite} />
        <Cell label="观看 ∩ 喜欢" value={intersection.watchLiked} />
        <Cell label="观看 ∩ 收藏" value={intersection.watchFavorite} />
        <Cell label="三类都有" value={intersection.allThree} />
      </View>
    </View>
  );
}

/** 五个日度指标的相关性色块矩阵。 */
function Matrix({ labels, matrix }: { labels: string[]; matrix: Array<Array<number | null>> }) {
  return (
    <View style={styles.matrix}>
      {matrix.map((row, rowIndex) => (
        <View key={labels[rowIndex] ?? rowIndex} style={styles.matrixRow}>
          <Text numberOfLines={1} style={styles.matrixLabel}>{labels[rowIndex]}</Text>
          {row.map((value, columnIndex) => (
            <View
              key={columnIndex}
              style={[styles.matrixCell, rowIndex === columnIndex && styles.matrixCellSelf, {
                backgroundColor: rowIndex === columnIndex
                  ? color.surfaceRaised
                  : value === null
                    ? color.surfaceMuted
                    : value >= 0
                      ? `rgba(197,152,97,${(0.12 + Math.abs(value) * 0.72).toFixed(2)})`
                      : `rgba(110,140,143,${(0.12 + Math.abs(value) * 0.72).toFixed(2)})`,
              }]}
            />
          ))}
        </View>
      ))}
      <View style={styles.matrixFootRow}>
        <View style={styles.matrixLabelSpacer} />
        {labels.map((label) => <Text key={label} numberOfLines={1} style={styles.matrixTick}>{label.slice(0, 2)}</Text>)}
      </View>
      <View style={styles.legendInline}>
        <View style={[styles.legendSwatch, { backgroundColor: "rgba(197,152,97,0.8)" }]} /><Text style={styles.legendLabel}>正相关</Text>
        <View style={[styles.legendSwatch, { backgroundColor: "rgba(110,140,143,0.8)" }]} /><Text style={styles.legendLabel}>负相关</Text>
      </View>
    </View>
  );
}

/** 五轴习惯雷达。 */
function Radar({ axes }: { axes: ReportModel["axes"] }) {
  const cx = 100;
  const cy = 96;
  const radius = 66;
  const angle = (index: number) => (-90 + index * 72) * Math.PI / 180;
  const point = (index: number, r: number): [number, number] => [cx + Math.cos(angle(index)) * r, cy + Math.sin(angle(index)) * r];
  const ring = (r: number) => `M ${axes.map((_, index) => point(index, r).join(" ")).join(" L ")} Z`;
  const shape = `M ${axes.map((axis, index) => point(index, radius * Math.max(0.1, Math.min(1, (axis.value ?? 10) / 100))).join(" ")).join(" L ")} Z`;
  return (
    <View>
      <Svg height={186} viewBox="0 0 200 186" width="100%">
        {[0.35, 0.7, 1].map((scale) => <Path d={ring(radius * scale)} fill="none" key={scale} stroke={color.border} strokeWidth={0.8} />)}
        {axes.map((axis, index) => (
          <Path d={`M ${cx} ${cy} L ${point(index, radius).join(" ")}`} key={axis.label} stroke={color.border} strokeWidth={0.6} />
        ))}
        <Path d={shape} fill={GOLD} fillOpacity={0.2} stroke={GOLD} strokeWidth={1.3} />
        {axes.map((axis, index) => {
          const [x, y] = point(index, radius + 16);
          return (
            <SvgText fill={color.textMuted} fontSize={9} key={`${axis.label}-tag`} textAnchor="middle" x={x} y={y + 3}>
              {axis.label}
            </SvgText>
          );
        })}
      </Svg>
      <View style={styles.radarLegend}>
        {axes.map((axis) => (
          <Text key={axis.label} style={styles.radarValue}>{axis.label} {pctLabel(axis.value)}</Text>
        ))}
      </View>
    </View>
  );
}

function InsightList({ items }: { items: Array<{ badge?: string; text: string; title: string }> }) {
  return (
    <View style={styles.insightList}>
      {items.map((item, index) => (
        <View key={`${item.title}:${index}`} style={styles.insight}>
          <Text style={[styles.insightMark, item.badge === "pending" && styles.insightMarkMuted]}>✦</Text>
          <View style={styles.insightCopy}>
            <View style={styles.insightTitleRow}>
              <Text style={styles.insightTitle}>{item.title}</Text>
              {item.badge ? <Text style={[styles.badge, item.badge === "pending" && styles.badgeMuted]}>{item.badge}</Text> : null}
            </View>
            <Text style={styles.insightText}>{item.text}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function EventList({ items, onOpenRecord, privacy }: {
  items: ReportModel["recent"];
  onOpenRecord: (url: string) => Promise<void>;
  privacy: boolean;
}) {
  if (!items.length) return <Empty text="等待带时间的记录" />;
  return (
    <View style={styles.eventList}>
      {items.map((item, index) => {
        const canOpen = Boolean(item.url && !privacy);
        return (
          <Pressable
            key={`${item.title}:${index}`}
            accessibilityLabel={`${privacy ? `内容 ${index + 1}` : item.title}${canOpen ? "，打开记录" : ""}`}
            accessibilityRole={canOpen ? "link" : undefined}
            disabled={!canOpen}
            onPress={() => item.url && void onOpenRecord(item.url)}
            style={({ pressed }) => [styles.event, pressed && styles.pressed]}
          >
            <Text style={styles.eventRank}>{pad(index + 1)}</Text>
            <Text numberOfLines={1} style={styles.eventTitle}>{privacy ? `内容 ${index + 1}` : item.title}</Text>
            <Text style={styles.eventTime}>{formatTime(item.time)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Cell({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.cell}>
      <Text style={styles.cellLabel}>{label}</Text>
      <Text style={styles.cellValue}>{value.toLocaleString("zh-CN")}</Text>
    </View>
  );
}

function Empty({ text }: { text: string }) {
  return <Text style={styles.empty}>{text}</Text>;
}

function arcPath(cx: number, cy: number, radius: number, inner: number, from: number, to: number): string {
  const at = (r: number, angle: number) => `${cx + r * Math.cos(angle)} ${cy + r * Math.sin(angle)}`;
  const large = to - from > Math.PI ? 1 : 0;
  return inner > 0
    ? `M ${at(radius, from)} A ${radius} ${radius} 0 ${large} 1 ${at(radius, to)} L ${at(inner, to)} A ${inner} ${inner} 0 ${large} 0 ${at(inner, from)} Z`
    : `M ${cx} ${cy} L ${at(radius, from)} A ${radius} ${radius} 0 ${large} 1 ${at(radius, to)} Z`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function formatTime(value: string | null): string {
  if (!value) return "时间未知";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "时间未知";
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

// ponytail: 与档案风一致的默认衬线字体，见 workspaceTheme
const archiveType = { fontFamily: font.serif } as const;
function Text({ style, ...rest }: TextProps) {
  return <RNText {...rest} style={[archiveType, style]} />;
}

const styles = StyleSheet.create({
  content: { padding: 28, paddingBottom: 48 },
  contentMobile: { padding: 14, paddingBottom: 88 },

  masthead: { minHeight: 128, flexDirection: "row", alignItems: "center", gap: 28, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: color.border },
  mastheadMobile: { minHeight: 0, flexDirection: "column", alignItems: "stretch", gap: 16 },
  mastheadCopy: { flex: 1, minWidth: 0 },
  eyebrow: { color: color.accent, fontSize: 10, fontWeight: "600", letterSpacing: 3.5 },
  title: { maxWidth: 760, color: color.text, fontSize: 30, lineHeight: 40, fontWeight: "600", letterSpacing: 3, marginTop: 10 },
  titleMobile: { fontSize: 24, lineHeight: 34 },
  lead: { maxWidth: 760, color: color.textSecondary, fontSize: 12.5, lineHeight: 21, letterSpacing: 0.8, marginTop: 12 },
  mastheadSide: { width: 240, alignItems: "flex-end", paddingLeft: 20, borderLeftWidth: 1, borderLeftColor: color.border },
  mastheadSideMobile: { width: "100%", alignItems: "flex-start", paddingLeft: 0, paddingTop: 14, borderLeftWidth: 0, borderTopWidth: 1, borderTopColor: color.border },
  mastheadValue: { maxWidth: "100%", color: color.text, fontSize: 22, lineHeight: 30, fontWeight: "600", letterSpacing: 3 },
  mastheadMeta: { color: color.textMuted, fontSize: 10, lineHeight: 16, letterSpacing: 0.8, marginTop: 6 },

  coverage: { minHeight: 46, flexDirection: "row", alignItems: "center", gap: 12, marginTop: 14, paddingHorizontal: 14, paddingVertical: 10, borderLeftWidth: 3, borderLeftColor: color.amber, backgroundColor: color.amberSoft },
  coverageLabel: { color: color.amber, fontSize: 10, fontWeight: "600", letterSpacing: 2 },
  coverageText: { flex: 1, color: color.textSecondary, fontSize: 10.5, lineHeight: 17 },

  row: { flexDirection: "row", alignItems: "flex-start", gap: 14, marginTop: 14 },
  rowMobile: { flexDirection: "column", alignItems: "stretch" },
  tile: { flexBasis: 0, flexShrink: 1, minWidth: 0, padding: 18, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface },
  tileMobile: { flexBasis: "auto", width: "100%", padding: 15 },
  tileHead: { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", gap: 8 },
  tileTitle: { flexShrink: 0, color: color.text, fontSize: 15, fontWeight: "600", letterSpacing: 2.5 },
  tileEn: { flexGrow: 1, flexShrink: 1, color: color.textMuted, fontSize: 10, letterSpacing: 1.5 },
  tileMeta: { flexShrink: 0, maxWidth: "100%", color: color.textMuted, fontSize: 9.5, letterSpacing: 1 },
  tileBody: { marginTop: 14 },
  tileFoot: { flexDirection: "row", gap: 8, marginTop: "auto", paddingTop: 14 },
  tileFootMark: { color: color.accent, fontSize: 10, paddingTop: 3 },
  tileFootText: { flex: 1, color: color.textMuted, fontSize: 10.5, lineHeight: 17, letterSpacing: 0.4 },

  figure: { alignItems: "flex-start", gap: 3 },
  figureValue: { color: color.figure, fontSize: 38, lineHeight: 46, fontFamily: font.didot, letterSpacing: 1 },
  figureSub: { color: color.textMuted, fontSize: 10.5, letterSpacing: 1.5 },

  heatWrap: { gap: 3 },
  heatRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  heatLetter: { width: 10, color: color.textMuted, fontSize: 9.5, letterSpacing: 0.5 },
  heatCells: { flex: 1, flexDirection: "row", gap: 2 },
  heatCell: { flex: 1, height: 15 },
  heatAxis: { flexDirection: "row", justifyContent: "space-between", marginLeft: 18, marginTop: 5 },

  axisRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 5 },
  axisText: { color: color.textMuted, fontSize: 9, fontFamily: font.didot, letterSpacing: 0.5 },

  ringWrap: { alignItems: "center", justifyContent: "center", paddingTop: 4 },
  ringCenter: { position: "absolute", top: 46, alignItems: "center" },
  ringValue: { color: color.figure, fontSize: 24, fontFamily: font.didot },
  ringCaption: { color: color.textMuted, fontSize: 10, letterSpacing: 1.4, marginTop: 12 },

  pieWrap: { alignItems: "center", gap: 12 },
  legend: { alignSelf: "stretch", gap: 6 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  legendSwatch: { width: 10, height: 10 },
  legendLabel: { flex: 1, color: color.textSecondary, fontSize: 10.5, letterSpacing: 0.5 },
  legendValue: { color: color.textMuted, fontSize: 10.5, fontFamily: font.didot },
  legendInline: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },

  mosaic: { gap: 6 },
  mosaicRow: { flexDirection: "row", gap: 6 },
  mosaicCell: { flexBasis: 0, minWidth: 0, minHeight: 74, justifyContent: "flex-end", padding: 8, borderWidth: 1 },
  mosaicLabel: { color: color.text, fontSize: 11, letterSpacing: 0.5 },
  mosaicValue: { color: color.figure, fontSize: 13, fontFamily: font.didot, marginTop: 2 },

  funnel: { gap: 12 },
  funnelRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  funnelLabel: { width: 62, color: color.textSecondary, fontSize: 11, letterSpacing: 1 },
  funnelTrack: { flex: 1, height: 20, backgroundColor: color.surfaceMuted },
  funnelBlock: { height: 20 },
  funnelValue: { width: 42, color: color.textMuted, fontSize: 11, fontFamily: font.didot, textAlign: "right" },

  headList: { gap: 7, marginTop: 12 },
  headRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  headRank: { width: 18, color: color.accent, fontSize: 10.5, fontFamily: font.didot },
  headName: { flex: 1, color: color.textSecondary, fontSize: 11, letterSpacing: 0.5 },
  headValue: { color: color.text, fontSize: 11, fontFamily: font.didot },

  cellGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 },
  cell: { width: "48%", flexGrow: 1, minHeight: 46, justifyContent: "center", paddingHorizontal: 9, backgroundColor: color.surfaceRaised },
  cellLabel: { color: color.textMuted, fontSize: 9, letterSpacing: 1.2 },
  cellValue: { color: color.text, fontSize: 14, fontFamily: font.didot, marginTop: 2 },

  matrix: { gap: 3 },
  matrixRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  matrixLabel: { width: 52, color: color.textMuted, fontSize: 9.5, letterSpacing: 0.4 },
  matrixCell: { flex: 1, height: 26 },
  matrixCellSelf: { borderWidth: 1, borderColor: color.borderSoft },
  matrixFootRow: { flexDirection: "row", gap: 3, marginTop: 4 },
  matrixLabelSpacer: { width: 52 },
  matrixTick: { flex: 1, color: color.textMuted, fontSize: 8.5, textAlign: "center" },

  radarLegend: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 8 },
  radarValue: { color: color.textMuted, fontSize: 10, letterSpacing: 0.6 },

  insightList: { gap: 13 },
  insight: { flexDirection: "row", gap: 9 },
  insightMark: { color: color.accent, fontSize: 11, paddingTop: 2 },
  insightMarkMuted: { color: color.textMuted },
  insightCopy: { flex: 1, minWidth: 0 },
  insightTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  insightTitle: { flex: 1, color: color.text, fontSize: 12.5, letterSpacing: 1.2 },
  insightText: { color: color.textSecondary, fontSize: 11, lineHeight: 18, letterSpacing: 0.4, marginTop: 4 },
  badge: { color: color.cyan, fontSize: 9, letterSpacing: 1.4 },
  badgeMuted: { color: color.textMuted },

  eventList: { marginTop: -4 },
  event: { minHeight: 34, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.borderSoft },
  eventRank: { width: 20, color: color.accent, fontSize: 10.5, fontFamily: font.didot },
  eventTitle: { flex: 1, color: color.textSecondary, fontSize: 11.5, letterSpacing: 0.5 },
  eventTime: { color: color.textMuted, fontSize: 10.5, fontFamily: font.didot },

  boundary: { marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: color.border },
  boundaryTitle: { color: color.textSecondary, fontSize: 11, letterSpacing: 3 },
  boundaryText: { maxWidth: 900, color: color.textMuted, fontSize: 10.5, lineHeight: 18, marginTop: 8 },
  boundaryNotice: { color: color.amber, fontSize: 10, lineHeight: 16, marginTop: 6 },

  empty: { color: color.textMuted, fontSize: 11, lineHeight: 18, paddingVertical: 16 },
  pressed: { opacity: 0.72 },
});
