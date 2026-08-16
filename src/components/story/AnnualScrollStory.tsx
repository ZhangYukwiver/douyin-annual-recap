import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  ImageBackground,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewStyle,
} from "react-native";
import {
  ArrowRight,
  Bookmark,
  Clock3,
  Heart,
  History,
  LayoutDashboard,
  Music2,
  Play,
  Sparkles,
  Star,
  Users,
  X,
} from "lucide-react-native";
import Svg, { Path } from "react-native-svg";

import type {
  AnnualContentRef,
  AnnualHighlightsData,
  AnnualKeptData,
  AnnualOverviewData,
  AnnualReport,
} from "../../domain/annualReport";
import type {
  PersonalRecordCollection,
  PersonalRecordType,
} from "../../domain/personalRecords";
import { workspaceColors as color, workspaceRadii as radius } from "../workspace/workspaceTheme";
import {
  buildStoryModel,
  type StoryContentItem,
  type StoryHour,
  type StoryModel,
  type StoryOpeningTag,
  type StoryOverlap,
  type StoryOverlapKey,
  type StoryStream as StoryStreamData,
  type StoryTopic,
} from "./storyModel";

const MIN_STORY_WIDTH = 1024;
const CHAPTER_COUNT = 6;
const WEB_POINTER = Platform.OS === "web" ? ({ cursor: "pointer" } as object) : null;
const LIST_LABELS: Record<PersonalRecordType, string> = {
  watch_history: "观看历史",
  liked_videos: "喜欢列表",
  favorite_videos: "收藏列表",
};
const OVERLAP_LABELS: Record<StoryOverlapKey, string> = {
  watchLiked: "观看 ∩ 喜欢",
  watchFavorite: "观看 ∩ 收藏",
  likedFavorite: "喜欢 ∩ 收藏",
  allThree: "三类列表都有",
};

export interface NarrativeCopyProvider {
  hourStory: (hour: StoryHour) => string;
  topicStory: (topic: StoryTopic) => string;
}

export interface AnnualScrollStoryProps {
  report: AnnualReport | null;
  records: PersonalRecordCollection;
  sourceLabel: string;
  privacy: boolean;
  onEnterDashboard: () => void;
  copyProvider?: NarrativeCopyProvider;
}

interface StoryDetail {
  title: string;
  author: string;
  occurredAt: string | null;
  durationSeconds: number | null;
  lists: PersonalRecordType[];
  topics: string[];
  music: string | null;
}

const localCopyProvider: NarrativeCopyProvider = {
  hourStory: (hour) => {
    if (hour.count === 0) return "这个小时没有可靠行为时间记录，不生成具体结论。";
    if (hour.topTopic && /童年|怀旧/u.test(hour.topTopic)) return `${padHour(hour.hour)} 是你遇见 #${hour.topTopic} 最多的时刻。找到你的童年了吗？`;
    return hour.topTopic
      ? `${padHour(hour.hour)} 的可靠记录里，#${hour.topTopic} 出现得最多。`
      : `${padHour(hour.hour)} 有 ${hour.count} 条可靠记录，显式标签仍不足。`;
  },
  topicStory: (topic) => topic.records[0]
    ? `#${topic.name} 关联 ${topic.count} 条内容，代表内容来自 ${topic.records[0].record.author ?? "未知创作者"}。`
    : `#${topic.name} 有明确计数，但当前样本没有可展示的代表内容。`,
};

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

export function AnnualScrollStory({
  report,
  records,
  sourceLabel,
  privacy,
  onEnterDashboard,
  copyProvider = localCopyProvider,
}: AnnualScrollStoryProps) {
  const { width, height } = useWindowDimensions();
  const compact = width < 1180;
  const sceneHeight = Math.max(650, height - 68);
  const model = useMemo(() => buildStoryModel(records), [records]);
  const storyContent = useMemo(() => collectStoryContent(model), [model]);
  const overview = report?.overview.data as AnnualOverviewData | undefined;
  const highlights = report?.highlights.data as AnnualHighlightsData | undefined;
  const kept = report?.kept.data as AnnualKeptData | undefined;
  const overlapsAvailable = Boolean(kept && kept.comparableVideoCount > 0);
  const [activeChapter, setActiveChapter] = useState(1);
  const [selectedHour, setSelectedHour] = useState(() => {
    const rhythm = report?.rhythm.data as { mostActiveHour?: { hour: number } | null } | undefined;
    return rhythm?.mostActiveHour?.hour ?? model.hours.find((hour) => hour.count > 0)?.hour ?? 0;
  });
  const [selectedTopic, setSelectedTopic] = useState(model.topics[0]?.name ?? null);
  const [selectedOverlap, setSelectedOverlap] = useState<StoryOverlapKey>("allThree");
  const [detail, setDetail] = useState<StoryDetail | null>(null);
  const [reducedMotion, setReducedMotion] = useState(() => (
    Platform.OS === "web"
    && typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ));
  const spray = useRef(new Animated.Value(0)).current;
  const hourRotation = useRef(new Animated.Value(selectedHour)).current;
  const rootRef = useRef<View | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);
  const sectionOffsets = useRef<number[]>([]);

  const selectedHourData = model.hours[selectedHour] ?? model.hours[0]!;
  const selectedTopicData = model.topics.find((topic) => topic.name === selectedTopic) ?? model.topics[0] ?? null;
  const selectedTopicIndex = selectedTopicData ? model.topics.findIndex((topic) => topic.name === selectedTopicData.name) : -1;
  const selectedOverlapData = model.overlaps[selectedOverlap];
  const stickyStyle = Platform.OS === "web" && !reducedMotion
    ? ({ position: "sticky", top: 0 } as unknown as ViewStyle)
    : null;
  const tagPositions = useMemo(
    () => storyTagPositions(model.openingTags.map((tag) => tag.key), width),
    [model.openingTags, width],
  );

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    if (reducedMotion) spray.setValue(1);
  }, [reducedMotion, spray]);

  useEffect(() => {
    if (Platform.OS !== "web" || width < MIN_STORY_WIDTH || reducedMotion) return undefined;
    let disposed = false;
    let revert: () => void = () => undefined;
    void (async () => {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);
      if (disposed) return;
      gsap.registerPlugin(ScrollTrigger);
      const root = rootRef.current as unknown as HTMLElement | null;
      const scroller = scrollRef.current?.getScrollableNode?.() as HTMLElement | undefined;
      if (!root || !scroller) return;
      const context = gsap.context(() => {
        root.querySelectorAll<HTMLElement>("[data-story-reveal]").forEach((element, index) => {
          gsap.fromTo(element, { opacity: 0, y: 24 }, {
            opacity: 1,
            y: 0,
            duration: 0.5,
            delay: Math.min(index % 3, 2) * 0.04,
            ease: "power2.out",
            scrollTrigger: { trigger: element, scroller, start: "top 86%", once: true },
          });
        });
      }, root);
      ScrollTrigger.refresh();
      revert = () => context.revert();
    })();
    return () => {
      disposed = true;
      revert();
    };
  }, [reducedMotion, width]);

  useEffect(() => {
    hourRotation.stopAnimation();
    if (reducedMotion) {
      hourRotation.setValue(selectedHour);
      return;
    }
    Animated.timing(hourRotation, {
      toValue: selectedHour,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }, [hourRotation, reducedMotion, selectedHour]);

  const replaySpray = useCallback(() => {
    spray.stopAnimation();
    if (reducedMotion) {
      spray.setValue(1);
      return;
    }
    spray.setValue(0);
    Animated.timing(spray, {
      toValue: 1,
      duration: 560,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }, [reducedMotion, spray]);

  const registerChapter = useCallback((index: number) => (event: LayoutChangeEvent) => {
    sectionOffsets.current[index - 1] = event.nativeEvent.layout.y;
  }, []);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const marker = event.nativeEvent.contentOffset.y + event.nativeEvent.layoutMeasurement.height * 0.38;
    let next = 1;
    sectionOffsets.current.forEach((offset, index) => {
      if (Number.isFinite(offset) && marker >= offset) next = index + 1;
    });
    setActiveChapter((current) => current === next ? current : next);
  }, []);

  const openStoryRecord = useCallback((item: StoryContentItem | null) => {
    if (!item) return;
    setDetail(detailFromStoryRecord(item));
  }, []);

  const openHighlight = useCallback((item: AnnualContentRef | null) => {
    if (!item) return;
    const match = storyContent.find((candidate) =>
      (item.videoId && candidate.videoId === item.videoId)
      || (item.url && candidate.record.url === item.url)
      || candidate.record.title === item.title,
    );
    setDetail(match ? detailFromStoryRecord(match) : detailFromHighlight(item));
  }, [storyContent]);

  const handleHourKey = useCallback((event: unknown, hour: number) => {
    const key = (event as { nativeEvent?: { key?: string }; preventDefault?: () => void }).nativeEvent?.key;
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(key ?? "")) return;
    (event as { preventDefault?: () => void }).preventDefault?.();
    const delta = key === "ArrowLeft" || key === "ArrowUp" ? -1 : 1;
    const next = (hour + delta + 24) % 24;
    setSelectedHour(next);
    if (Platform.OS === "web") {
      requestAnimationFrame(() => {
        const root = rootRef.current as unknown as HTMLElement | null;
        root?.querySelector<HTMLElement>(`[data-story-hour="${next}"]`)?.focus();
      });
    }
  }, []);

  if (width < MIN_STORY_WIDTH) {
    return <StoryWidthGate onEnterDashboard={onEnterDashboard} />;
  }

  if (!report || report.status === "empty" || !overview || !highlights) {
    return <StoryEmpty onEnterDashboard={onEnterDashboard} />;
  }

  return (
    <View ref={rootRef} style={styles.root} testID="annual-scroll-story">
      <View style={styles.topbar}>
        <View style={styles.brand}>
          <View style={styles.brandMark}>
            <View style={styles.brandMarkCyan} />
            <View style={styles.brandMarkRed} />
            <View style={styles.brandMarkCore}><Play color={color.white} fill={color.white} size={13} /></View>
          </View>
          <View>
            <Text style={styles.brandTitle}>年度故事</Text>
            <Text style={styles.brandMeta}>{sourceLabel} · {report.periodLabel}</Text>
          </View>
        </View>
        <View accessibilityLabel={`年度故事第 ${activeChapter} 章，共 ${CHAPTER_COUNT} 章`} accessibilityRole="progressbar" style={styles.progressWrap}>
          <View style={styles.progressBars}>
            {Array.from({ length: CHAPTER_COUNT }, (_, index) => (
              <View key={index} style={[styles.progressBar, index + 1 <= activeChapter && styles.progressBarActive]} />
            ))}
          </View>
          <Text style={styles.progressText}>{String(activeChapter).padStart(2, "0")} / 06</Text>
        </View>
        <Pressable
          accessibilityLabel="直接看数据大屏"
          accessibilityRole="button"
          onPress={onEnterDashboard}
          style={({ pressed }) => [styles.skipButton, pressed && styles.buttonPressed, WEB_POINTER]}
        >
          <LayoutDashboard color={color.text} size={18} />
          <Text style={styles.skipButtonText}>直接看数据</Text>
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={32}
        showsVerticalScrollIndicator={false}
        testID="story-scroll-view"
      >
        <View onLayout={registerChapter(1)} style={[styles.stickyChapter, { minHeight: sceneHeight + 460 }]}>
          <View style={[styles.scene, { minHeight: sceneHeight }, stickyStyle]}>
            <View style={[styles.sceneInner, compact && styles.sceneInnerCompact]}>
              <View style={styles.openingCopy} {...revealDataSet()}>
                <Text style={styles.chapterNo}>CHAPTER 01 · 你的内容世界</Text>
                <Text style={styles.openingTitle}>你的内容世界，{`\n`}已经有了形状。</Text>
                <Text style={styles.lead}>点一下音符，让当前样本中的高频标签散开。</Text>
              </View>

              <View
                accessible
                accessibilityLabel={`高频标签：${model.openingTags.map((tag, index) => openingTagLabel(tag, privacy, index)).join("、") || "暂无可识别标签"}`}
                style={[styles.tagStage, { height: Math.min(500, sceneHeight * 0.52) }]}
              >
                {model.openingTags.map((tag, index) => {
                  const position = tagPositions[index] ?? { x: 0, y: 0 };
                  return (
                    <Animated.View
                      key={tag.key}
                      style={[
                        styles.sprayTag,
                        index % 3 === 0 ? styles.sprayTagCyan : index % 3 === 1 ? styles.sprayTagRed : styles.sprayTagAmber,
                        {
                          opacity: spray,
                          transform: [
                            { translateX: spray.interpolate({ inputRange: [0, 1], outputRange: [0, position.x] }) },
                            { translateY: spray.interpolate({ inputRange: [0, 1], outputRange: [0, position.y] }) },
                            { scale: spray.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] }) },
                          ],
                        },
                      ]}
                    >
                      <Text style={styles.sprayTagText}>{openingTagLabel(tag, privacy, index)}</Text>
                      <Text style={styles.sprayTagCount}>{tag.count}</Text>
                    </Animated.View>
                  );
                })}
                <Pressable
                  accessibilityHint="展开或重新播放高频标签"
                  accessibilityLabel="播放标签喷发动画"
                  accessibilityRole="button"
                  onPress={replaySpray}
                  style={({ pressed }) => [styles.noteButton, pressed && styles.noteButtonPressed, WEB_POINTER]}
                >
                  <Music2 color={color.white} size={48} strokeWidth={1.7} />
                </Pressable>
              </View>

              <View style={styles.openingStats} {...revealDataSet()}>
                <View>
                  <Text style={styles.openingNumber}>{formatNumber(overview.counts.total)}</Text>
                  <Text style={styles.openingStatLabel}>条去重内容，构成这份故事</Text>
                </View>
                <View style={styles.openingRange}>
                  <Text style={styles.openingRangeValue}>{formatDateRange(overview.dateRange)}</Text>
                  <Text style={styles.openingRangeLabel}>{overview.activeDays} 个活跃日 · {report.timezone}</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        <View onLayout={registerChapter(2)} style={styles.chapter}>
          <View style={styles.sectionInner}>
            <SectionHeading
              chapter="02"
              eyebrow="内容足迹"
              title="三条内容流，汇成同一段足迹。"
              copy="观看、喜欢和收藏分别保留原始列表口径，再汇聚为去重内容总量。"
            />
            <View style={[styles.streamGrid, compact && styles.streamGridCompact]} {...revealDataSet()}>
              <StoryStream
                accent={color.cyan}
                icon={History}
                label="观看"
                onOpen={openStoryRecord}
                privacy={privacy}
                stream={model.streams.watch_history}
              />
              <StoryStream
                accent={color.accent}
                icon={Heart}
                label="喜欢"
                onOpen={openStoryRecord}
                privacy={privacy}
                stream={model.streams.liked_videos}
              />
              <StoryStream
                accent={color.amber}
                icon={Bookmark}
                label="收藏"
                onOpen={openStoryRecord}
                privacy={privacy}
                stream={model.streams.favorite_videos}
              />
            </View>
            <View style={styles.totalKnot} {...revealDataSet()}>
              <Text style={styles.totalKnotLabel}>三类记录去重后</Text>
              <Text style={styles.totalKnotValue}>{formatNumber(overview.counts.total)}</Text>
              <Text style={styles.totalKnotMeta}>数字来自统计，叙事不会改变它。</Text>
            </View>
          </View>
        </View>

        <View onLayout={registerChapter(3)} style={[styles.stickyChapter, { minHeight: sceneHeight + 380 }]}>
          <View style={[styles.scene, styles.rhythmScene, { minHeight: sceneHeight }, stickyStyle]}>
            <View style={[styles.rhythmLayout, compact && styles.rhythmLayoutCompact]}>
              <View style={styles.rhythmCopy} {...revealDataSet()}>
                <Text style={styles.chapterNo}>CHAPTER 03 · 使用节奏</Text>
                <Text style={styles.sectionTitle}>一天里的哪一刻，{`\n`}内容最常出现？</Text>
                <Text style={styles.lead}>只使用可靠行为时间。方向键也可以切换小时。</Text>
                <View style={styles.hourStory}>
                  <Text style={styles.hourStoryLabel}>{padHour(selectedHourData.hour)} · {selectedHourData.count} 条可靠记录</Text>
                  <Text style={styles.hourStoryText}>{privacy ? privateHourStory(selectedHourData) : copyProvider.hourStory(selectedHourData)}</Text>
                  {selectedHourData.representative ? (
                    <StoryRecordButton compact item={selectedHourData.representative} onOpen={openStoryRecord} privacy={privacy} />
                  ) : <Text style={styles.emptyText}>这个小时没有可展示的代表内容</Text>}
                </View>
              </View>
              <HourDial
                hourRotation={hourRotation}
                hours={model.hours}
                onHourKey={handleHourKey}
                onSelectHour={setSelectedHour}
                selectedHour={selectedHour}
              />
            </View>
          </View>
        </View>

        <View onLayout={registerChapter(4)} style={styles.chapter}>
          <View style={styles.sectionInner}>
            <SectionHeading
              chapter="04"
              eyebrow="偏好与创作者"
              title="显式标签，连接起内容与创作者。"
              copy="点击标签，只展示真实命中的代表内容与对应创作者。音乐和时长只作为辅助字段。"
            />
            <View style={[styles.preferenceLayout, compact && styles.preferenceLayoutCompact]}>
              <View style={styles.topicField} {...revealDataSet()}>
                {model.topics.length ? model.topics.slice(0, 12).map((topic, index) => {
                  const selected = topic.name === selectedTopicData?.name;
                  return (
                    <Pressable
                      key={topic.name}
                      accessibilityLabel={`${privacy ? `话题 ${index + 1}` : `话题 ${topic.name}`}，${topic.count} 条内容`}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => setSelectedTopic(topic.name)}
                      style={({ pressed }) => [styles.topicButton, selected && styles.topicButtonSelected, pressed && styles.buttonPressed, WEB_POINTER]}
                    >
                      <Text style={[styles.topicButtonText, selected && styles.topicButtonTextSelected]}>{privacy ? `话题 ${index + 1}` : `#${topic.name}`}</Text>
                      <Text style={styles.topicButtonCount}>{topic.count}</Text>
                    </Pressable>
                  );
                }) : <Text style={styles.emptyText}>当前样本没有可识别的显式标签</Text>}
              </View>
              <View style={styles.preferenceResult} {...revealDataSet()}>
                {selectedTopicData ? (
                  <>
                    <Text style={styles.resultEyebrow}>SELECTED TOPIC</Text>
                    <Text style={styles.resultTitle}>{privacy ? `话题 ${selectedTopicIndex + 1}` : `#${selectedTopicData.name}`}</Text>
                    <Text style={styles.resultCopy}>{privacy ? `该标签关联 ${selectedTopicData.count} 条内容，标签与创作者已隐藏。` : copyProvider.topicStory(selectedTopicData)}</Text>
                    {selectedTopicData.records[0] ? <StoryRecordButton item={selectedTopicData.records[0]} onOpen={openStoryRecord} privacy={privacy} /> : null}
                    <View style={styles.creatorFilmstrip}>
                      {selectedTopicData.creators.length ? selectedTopicData.creators.slice(0, 5).map((creator, index) => (
                        <View key={creator.key} style={styles.creatorFrame}>
                          <Text style={styles.creatorIndex}>{String(index + 1).padStart(2, "0")}</Text>
                          <Text numberOfLines={1} style={styles.creatorName}>{privacy ? `创作者 ${index + 1}` : creator.name} · {creator.count}</Text>
                        </View>
                      )) : <Text style={styles.emptyText}>没有可归属的创作者</Text>}
                    </View>
                  </>
                ) : null}
              </View>
            </View>
          </View>
        </View>

        <View onLayout={registerChapter(5)} style={styles.chapter}>
          <View style={styles.sectionInner}>
            <SectionHeading
              chapter="05"
              eyebrow="真正留下的内容"
              title="列表相遇的位置，才是可比较的交集。"
              copy="交集只使用可比较 videoId；缺失标识的记录不会被猜测为同一内容。"
            />
            <View style={[styles.keptLayout, compact && styles.keptLayoutCompact]}>
              <View style={styles.confluence} {...revealDataSet()}>
                <Svg accessibilityLabel="观看、喜欢和收藏三条轨道汇流图" height="100%" viewBox="0 0 700 390" width="100%">
                  <Path d="M 20 88 C 245 88, 350 190, 665 194" fill="none" stroke={color.cyan} strokeLinecap="round" strokeWidth="6" />
                  <Path d="M 20 195 C 250 195, 390 195, 665 194" fill="none" stroke={color.accent} strokeLinecap="round" strokeWidth="6" />
                  <Path d="M 20 302 C 245 302, 350 200, 665 194" fill="none" stroke={color.amber} strokeLinecap="round" strokeWidth="6" />
                </Svg>
                <Text style={[styles.trackLabel, styles.trackWatch]}>观看</Text>
                <Text style={[styles.trackLabel, styles.trackLiked]}>喜欢</Text>
                <Text style={[styles.trackLabel, styles.trackFavorite]}>收藏</Text>
                <OverlapButton available={overlapsAvailable} data={model.overlaps.watchLiked} id="watchLiked" onSelect={setSelectedOverlap} selected={selectedOverlap === "watchLiked"} style={styles.overlapWatchLiked} />
                <OverlapButton available={overlapsAvailable} data={model.overlaps.watchFavorite} id="watchFavorite" onSelect={setSelectedOverlap} selected={selectedOverlap === "watchFavorite"} style={styles.overlapWatchFavorite} />
                <OverlapButton available={overlapsAvailable} data={model.overlaps.likedFavorite} id="likedFavorite" onSelect={setSelectedOverlap} selected={selectedOverlap === "likedFavorite"} style={styles.overlapLikedFavorite} />
                <OverlapButton available={overlapsAvailable} data={model.overlaps.allThree} id="allThree" onSelect={setSelectedOverlap} selected={selectedOverlap === "allThree"} style={styles.overlapAll} />
              </View>
              <View style={styles.overlapResult} {...revealDataSet()}>
                <Text style={styles.resultEyebrow}>LIST INTERSECTION</Text>
                <Text style={styles.resultTitle}>{OVERLAP_LABELS[selectedOverlap]}</Text>
                <Text style={styles.resultCopy}>{overlapsAvailable ? `${selectedOverlapData.count} 个可比较视频` : "缺少可比较 videoId，无法判断"}</Text>
                <View style={styles.overlapItems}>
                  {selectedOverlapData.records.length ? selectedOverlapData.records.map((item) => (
                    <StoryRecordButton compact item={item} key={item.key} onOpen={openStoryRecord} privacy={privacy} />
                  )) : <Text style={styles.emptyText}>当前交集没有可展示内容</Text>}
                </View>
                <View style={styles.snapshotNotice}><View style={styles.snapshotMark} /><Text style={styles.snapshotNoticeText}>当前列表快照，不代表行为转化</Text></View>
              </View>
            </View>
          </View>
        </View>

        <View onLayout={registerChapter(6)} style={[styles.chapter, styles.highlightsChapter]}>
          <View style={styles.sectionInner}>
            <SectionHeading
              chapter="06"
              eyebrow="年度高光与收束"
              title="五个规则坐标，把故事落回真实内容。"
              copy="横向浏览首条、末条、峰值日、最长内容和互动快照最高内容。"
            />
            <ScrollView
              contentContainerStyle={styles.highlightStrip}
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.highlightScroller}
              {...revealDataSet()}
            >
              {highlightDefinitions.map((definition, index) => (
                <StoryHighlightCard
                  accent={definition.accent}
                  index={index}
                  item={highlights[definition.key]}
                  key={definition.key}
                  label={definition.label}
                  onOpen={openHighlight}
                  privacy={privacy}
                  rule={definition.rule}
                />
              ))}
            </ScrollView>
          </View>
          <View style={styles.finale}>
            <View style={styles.finaleMark} />
            <Text style={styles.finaleEyebrow}>YOUR CONTENT, YOUR YEAR</Text>
            <Text style={styles.finaleTitle}>这些内容不是答案，{`\n`}是你留下的坐标。</Text>
            <Text style={styles.finaleCopy}>完整数字、数据口径与独立年度高光，已经整理在数据大屏中。</Text>
            <Pressable
              accessibilityLabel="进入数据大屏"
              accessibilityRole="button"
              onPress={onEnterDashboard}
              style={({ pressed }) => [styles.dashboardButton, pressed && styles.buttonPressed, WEB_POINTER]}
            >
              <Text style={styles.dashboardButtonText}>进入数据大屏</Text>
              <ArrowRight color={color.white} size={20} />
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <StoryDetailModal detail={detail} onClose={() => setDetail(null)} privacy={privacy} />
    </View>
  );
}

function SectionHeading({ chapter, eyebrow, title, copy }: { chapter: string; eyebrow: string; title: string; copy: string }) {
  return (
    <View style={styles.sectionHeading} {...revealDataSet()}>
      <Text style={styles.sectionChapter}>{chapter}</Text>
      <View style={styles.sectionHeadingCopy}>
        <Text style={styles.chapterNo}>CHAPTER {chapter} · {eyebrow}</Text>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionLead}>{copy}</Text>
      </View>
    </View>
  );
}

function StoryStream({
  accent,
  icon: Icon,
  label,
  onOpen,
  privacy,
  stream,
}: {
  accent: string;
  icon: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
  label: string;
  onOpen: (item: StoryContentItem | null) => void;
  privacy: boolean;
  stream: StoryStreamData;
}) {
  return (
    <View style={[styles.stream, { borderTopColor: accent }]}>
      <View style={styles.streamHeader}>
        <View style={styles.streamTitle}><Icon color={accent} size={19} /><Text style={styles.streamLabel}>{label}</Text></View>
        <Text style={styles.streamCount}>{formatNumber(stream.uniqueCount)}</Text>
      </View>
      <View style={styles.streamLine} />
      <View style={styles.streamItems}>
        {stream.representative ? <StoryRecordButton compact item={stream.representative} onOpen={onOpen} privacy={privacy} /> : null}
        {!stream.representative ? <Text style={styles.emptyText}>暂无代表内容</Text> : null}
      </View>
    </View>
  );
}

function StoryRecordButton({ item, onOpen, privacy, compact = false }: { item: StoryContentItem; onOpen: (item: StoryContentItem | null) => void; privacy: boolean; compact?: boolean }) {
  return (
    <Pressable
      accessibilityLabel={`${privacy ? "内容标题已隐藏" : item.record.title}，打开内容详情`}
      accessibilityRole="button"
      onPress={() => onOpen(item)}
      style={({ pressed }) => [styles.recordButton, compact && styles.recordButtonCompact, pressed && styles.buttonPressed, WEB_POINTER]}
    >
      <StoryCover item={item.record} privacy={privacy} />
      <View style={styles.recordCopy}>
        <Text numberOfLines={2} style={styles.recordTitle}>{privacy ? "内容标题已隐藏" : item.record.title}</Text>
        <Text numberOfLines={1} style={styles.recordMeta}>{privacy ? "创作者已隐藏" : item.record.author ?? "未知创作者"} · {formatShortDate(item.record.occurredAt)}</Text>
      </View>
      <ArrowRight color={color.textMuted} size={16} />
    </Pressable>
  );
}

function StoryCover({ item, privacy }: { item: StoryContentItem["record"]; privacy: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [item.coverUrl]);
  if (item.coverUrl && !privacy && !failed) {
    return <ImageBackground onError={() => setFailed(true)} resizeMode="cover" source={{ uri: item.coverUrl }} style={styles.recordCover} />;
  }
  return <View style={[styles.recordCover, styles.recordCoverFallback]}><Play color={color.cyan} size={15} /></View>;
}

function HourDial({
  hourRotation,
  hours,
  selectedHour,
  onSelectHour,
  onHourKey,
}: {
  hourRotation: Animated.Value;
  hours: StoryHour[];
  selectedHour: number;
  onSelectHour: (hour: number) => void;
  onHourKey: (event: unknown, hour: number) => void;
}) {
  const rotation = hourRotation.interpolate({ inputRange: [0, 24], outputRange: ["0deg", "360deg"] });
  const maxCount = Math.max(1, ...hours.map((hour) => hour.count));
  return (
    <View accessibilityLabel="24 小时可靠记录拨盘" style={styles.dialWrap} {...revealDataSet()}>
      <View style={styles.dialTrack} />
      <Animated.View style={[styles.dialHand, { transform: [{ rotate: rotation }] }]}><View style={styles.dialHandLine} /></Animated.View>
      {hours.map((hour) => {
        const angle = hour.hour / 24 * Math.PI * 2 - Math.PI / 2;
        const left = 50 + Math.cos(angle) * 43;
        const top = 50 + Math.sin(angle) * 43;
        const selected = hour.hour === selectedHour;
        return (
          <Pressable
            key={hour.hour}
            accessibilityLabel={`${padHour(hour.hour)}，${hour.count} 条可靠记录`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onSelectHour(hour.hour)}
            style={({ pressed }) => [
              styles.hourButton,
              { left: `${left}%`, top: `${top}%` },
              selected && styles.hourButtonSelected,
              pressed && styles.buttonPressed,
              WEB_POINTER,
            ]}
            {...({
              dataSet: { storyHour: String(hour.hour) },
              onKeyDown: (event: unknown) => onHourKey(event, hour.hour),
              tabIndex: selected ? 0 : -1,
            } as Record<string, unknown>)}
          >
            <View style={[styles.hourDot, { opacity: 0.28 + hour.count / maxCount * 0.72 }, selected && styles.hourDotSelected]} />
            <Text style={[styles.hourText, selected && styles.hourTextSelected]}>{String(hour.hour).padStart(2, "0")}</Text>
          </Pressable>
        );
      })}
      <View style={styles.dialCenter}>
        <Clock3 color={color.cyan} size={22} />
        <Text style={styles.dialTime}>{padHour(selectedHour)}</Text>
        <Text style={styles.dialCount}>{hours[selectedHour]?.count ?? 0} 条可靠记录</Text>
      </View>
    </View>
  );
}

function OverlapButton({
  available,
  data,
  id,
  selected,
  onSelect,
  style,
}: {
  available: boolean;
  data: StoryOverlap;
  id: StoryOverlapKey;
  selected: boolean;
  onSelect: (id: StoryOverlapKey) => void;
  style: ViewStyle;
}) {
  return (
    <Pressable
      accessibilityLabel={`${OVERLAP_LABELS[id]}，${available ? `${data.count} 个视频` : "不可判断"}`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={() => onSelect(id)}
      style={({ pressed }) => [styles.overlapButton, style, selected && styles.overlapButtonSelected, pressed && styles.buttonPressed, WEB_POINTER]}
    >
      <Text style={styles.overlapButtonLabel}>{OVERLAP_LABELS[id]}</Text>
      <Text style={styles.overlapButtonValue}>{available ? data.count : "--"}</Text>
    </Pressable>
  );
}

function StoryHighlightCard({
  accent,
  index,
  item,
  label,
  rule,
  onOpen,
  privacy,
}: {
  accent: string;
  index: number;
  item: AnnualContentRef | null;
  label: string;
  rule: string;
  onOpen: (item: AnnualContentRef | null) => void;
  privacy: boolean;
}) {
  const title = item ? (privacy ? "内容标题已隐藏" : item.title) : "暂无可确定内容";
  const author = item ? (privacy ? "创作者已隐藏" : item.author ?? "未知创作者") : "当前样本缺少对应记录";
  return (
    <Pressable
      accessibilityLabel={`${label}：${title}${item ? "，打开详情" : ""}`}
      accessibilityRole={item ? "button" : undefined}
      disabled={!item}
      onPress={() => onOpen(item)}
      style={({ pressed }) => [styles.highlightCard, { borderTopColor: accent }, !item && styles.disabled, pressed && styles.buttonPressed, item && WEB_POINTER]}
    >
      <View style={[styles.highlightVisual, { backgroundColor: fallbackColor(`${label}:${index}`) }]}>
        <Star color={accent} size={48} strokeWidth={1.5} />
        <Text style={styles.highlightIndex}>{String(index + 1).padStart(2, "0")}</Text>
      </View>
      <View style={styles.highlightCopy}>
        <Text style={[styles.highlightLabel, { color: accent }]}>{label}</Text>
        <Text numberOfLines={2} style={styles.highlightTitle}>{title}</Text>
        <Text numberOfLines={1} style={styles.highlightMeta}>{author}</Text>
        <Text style={styles.highlightRule}>{rule}</Text>
      </View>
    </Pressable>
  );
}

function StoryDetailModal({ detail, onClose, privacy }: { detail: StoryDetail | null; onClose: () => void; privacy: boolean }) {
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={detail !== null}>
      <View style={styles.modalScrim}>
        <View accessibilityViewIsModal style={styles.modalPanel}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.resultEyebrow}>CONTENT DETAIL</Text>
              <Text style={styles.modalKicker}>当前页详情</Text>
            </View>
            <Pressable accessibilityLabel="关闭内容详情" accessibilityRole="button" onPress={onClose} style={({ pressed }) => [styles.modalClose, pressed && styles.buttonPressed, WEB_POINTER]}>
              <X color={color.text} size={20} />
            </Pressable>
          </View>
          {detail ? (
            <ScrollView contentContainerStyle={styles.modalBody} showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>{privacy ? "内容标题已隐藏" : detail.title}</Text>
              <Text style={styles.modalAuthor}>{privacy ? "创作者已隐藏" : detail.author}</Text>
              <View style={styles.detailFacts}>
                <DetailFact label="观看时间" value={formatDateTime(detail.occurredAt)} />
                <DetailFact label="列表归属" value={detail.lists.map((list) => LIST_LABELS[list]).join("、") || "未识别"} />
                <DetailFact label="时长" value={detail.durationSeconds === null ? "暂无" : formatDuration(detail.durationSeconds)} />
                <DetailFact label="音乐" value={privacy && detail.music ? "已隐藏" : detail.music ?? "暂无"} />
              </View>
              <View style={styles.detailTags}>
                {detail.topics.length
                  ? privacy
                    ? <Text style={styles.emptyText}>标签已隐藏</Text>
                    : detail.topics.map((topic) => <Text key={topic} style={styles.detailTag}>#{topic}</Text>)
                  : <Text style={styles.emptyText}>没有显式标签</Text>}
              </View>
              <View style={styles.detailNote}>
                <Text style={styles.detailNoteText}>当前记录没有独立描述字段，因此不补写事实性描述。</Text>
              </View>
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function DetailFact({ label, value }: { label: string; value: string }) {
  return <View style={styles.detailFact}><Text style={styles.detailFactLabel}>{label}</Text><Text style={styles.detailFactValue}>{value}</Text></View>;
}

function StoryWidthGate({ onEnterDashboard }: { onEnterDashboard: () => void }) {
  return (
    <View style={styles.gateRoot} testID="story-width-gate">
      <View style={styles.gateMark}><Sparkles color={color.cyan} size={28} /></View>
      <Text style={styles.chapterNo}>ANNUAL STORY / DESKTOP</Text>
      <Text style={styles.gateTitle}>滚动故事需要至少 1024px 的窗口宽度。</Text>
      <Text style={styles.gateCopy}>当前设备直接进入数据大屏，完整数字和年度高光仍然可用。</Text>
      <Pressable accessibilityRole="button" onPress={onEnterDashboard} style={({ pressed }) => [styles.dashboardButton, pressed && styles.buttonPressed, WEB_POINTER]}>
        <Text style={styles.dashboardButtonText}>直接看数据</Text><ArrowRight color={color.white} size={20} />
      </Pressable>
    </View>
  );
}

function StoryEmpty({ onEnterDashboard }: { onEnterDashboard: () => void }) {
  return (
    <View style={styles.gateRoot} testID="story-empty-state">
      <View style={styles.gateMark}><Sparkles color={color.cyan} size={28} /></View>
      <Text style={styles.chapterNo}>ANNUAL STORY / LOCAL ONLY</Text>
      <Text style={styles.gateTitle}>还没有可以讲述的内容。</Text>
      <Text style={styles.gateCopy}>完成一次读取后，滚动故事会在进入内容库时出现。</Text>
      <Pressable accessibilityRole="button" onPress={onEnterDashboard} style={({ pressed }) => [styles.dashboardButton, pressed && styles.buttonPressed, WEB_POINTER]}>
        <Text style={styles.dashboardButtonText}>返回数据大屏</Text><ArrowRight color={color.white} size={20} />
      </Pressable>
    </View>
  );
}

function detailFromStoryRecord(item: StoryContentItem): StoryDetail {
  return {
    title: item.record.title,
    author: item.record.author ?? "未知创作者",
    occurredAt: item.occurredAt,
    durationSeconds: item.record.durationSeconds ?? null,
    lists: item.lists,
    topics: item.topics,
    music: item.record.music?.title ?? null,
  };
}

function detailFromHighlight(item: AnnualContentRef): StoryDetail {
  return {
    title: item.title,
    author: item.author ?? "未知创作者",
    occurredAt: item.occurredAt,
    durationSeconds: item.durationSeconds,
    lists: [item.type],
    topics: [],
    music: null,
  };
}

function revealDataSet(): Record<string, unknown> {
  return Platform.OS === "web" ? { dataSet: { storyReveal: "true" } } : {};
}

function openingTagLabel(tag: StoryOpeningTag, privacy: boolean, index: number): string {
  if (privacy) return tag.source === "topic" ? `话题 ${index + 1}` : `创作者 ${index + 1}`;
  return tag.source === "topic" ? `#${tag.name}` : tag.name;
}

function privateHourStory(hour: StoryHour): string {
  if (hour.count === 0) return "这个小时没有可靠行为时间记录，不生成具体结论。";
  return `${padHour(hour.hour)} 有 ${hour.count} 条可靠记录，相关标签已隐藏。`;
}

function collectStoryContent(model: StoryModel): StoryContentItem[] {
  const items = new Map<string, StoryContentItem>();
  const add = (item: StoryContentItem | null | undefined) => {
    if (item && !items.has(item.key)) items.set(item.key, item);
  };

  Object.values(model.streams).forEach((stream) => add(stream.representative));
  model.hours.forEach((hour) => add(hour.representative));
  model.topics.forEach((topic) => {
    topic.records.forEach(add);
    topic.creators.forEach((creator) => add(creator.representative));
  });
  Object.values(model.overlaps).forEach((overlap) => overlap.records.forEach(add));
  return [...items.values()];
}

function storyTagPositions(tags: string[], width: number): Array<{ x: number; y: number }> {
  const radiusX = Math.min(350, Math.max(250, (width - 160) * 0.34));
  const radiusY = 170;
  const slots = [
    { x: -0.88, y: -0.9 }, { x: -0.3, y: -1.04 }, { x: 0.3, y: -1.04 }, { x: 0.78, y: -0.9 },
    { x: -1.06, y: -0.28 }, { x: 0.78, y: -0.28 },
    { x: -1.06, y: 0.36 }, { x: 0.78, y: 0.36 },
    { x: -0.88, y: 0.92 }, { x: -0.3, y: 1.02 }, { x: 0.3, y: 1.02 }, { x: 0.78, y: 0.92 },
  ];
  const availableSlots = slots.map((_, index) => index);

  return tags.map((tag) => {
    const availableIndex = hashString(tag) % availableSlots.length;
    const slotIndex = availableSlots.splice(availableIndex, 1)[0] ?? 0;
    const slot = slots[slotIndex]!;
    return { x: slot.x * radiusX, y: slot.y * radiusY };
  });
}

function padHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

function formatNumber(value: number): string {
  return value.toLocaleString("zh-CN");
}

function formatShortDate(value: string | null): string {
  if (!value) return "时间未知";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "时间未知";
  return date.toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit" });
}

function formatDateTime(value: string | null): string {
  if (!value) return "时间未知";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "时间未知";
  return date.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDateRange(range: AnnualOverviewData["dateRange"]): string {
  if (!range) return "可靠时间范围不足";
  return `${range.start.replaceAll("-", ".")} — ${range.end.replaceAll("-", ".")}`;
}

function formatDuration(seconds: number): string {
  const rounded = Math.max(0, Math.round(seconds));
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
}

function hashString(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function fallbackColor(value: string): string {
  const palette = [color.cyanSoft, color.accentSoft, color.amberSoft, color.greenSoft, color.surfaceMuted];
  return palette[hashString(value) % palette.length]!;
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: "100%", backgroundColor: color.canvas },
  topbar: { height: 68, flexDirection: "row", alignItems: "center", gap: 24, paddingHorizontal: 28, borderBottomWidth: 1, borderBottomColor: color.border, backgroundColor: color.sidebar, zIndex: 30 },
  brand: { width: 280, flexDirection: "row", alignItems: "center", gap: 11 },
  brandMark: { width: 38, height: 38, position: "relative", alignItems: "center", justifyContent: "center" },
  brandMarkCyan: { position: "absolute", width: 27, height: 27, left: 2, top: 3, borderRadius: radius.medium, backgroundColor: color.cyan },
  brandMarkRed: { position: "absolute", width: 27, height: 27, right: 2, bottom: 3, borderRadius: radius.medium, backgroundColor: color.accent },
  brandMarkCore: { width: 27, height: 27, alignItems: "center", justifyContent: "center", borderRadius: radius.medium, backgroundColor: color.black },
  brandTitle: { color: color.text, fontSize: 13, fontWeight: "900" },
  brandMeta: { color: color.textMuted, fontSize: 9, marginTop: 2 },
  progressWrap: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12 },
  progressBars: { flexDirection: "row", alignItems: "center", gap: 5 },
  progressBar: { width: 28, height: 3, backgroundColor: color.border },
  progressBarActive: { backgroundColor: color.cyan },
  progressText: { width: 44, color: color.textMuted, fontSize: 10, fontWeight: "800", fontVariant: ["tabular-nums"] },
  skipButton: { minWidth: 140, minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 15, borderWidth: 1, borderColor: color.border, borderRadius: radius.medium, backgroundColor: color.surface },
  skipButtonText: { color: color.text, fontSize: 12, fontWeight: "900" },
  buttonPressed: { opacity: 0.72 },
  scrollContent: { backgroundColor: color.canvas },
  stickyChapter: { position: "relative", backgroundColor: color.canvas },
  scene: { position: "relative", justifyContent: "center", overflow: "hidden", backgroundColor: color.canvas },
  sceneInner: { width: "100%", maxWidth: 1240, minHeight: "100%", alignSelf: "center", justifyContent: "space-between", paddingHorizontal: 68, paddingVertical: 56 },
  sceneInnerCompact: { paddingHorizontal: 44 },
  openingCopy: { zIndex: 5, maxWidth: 760 },
  chapterNo: { color: color.cyan, fontSize: 10, fontWeight: "900" },
  openingTitle: { color: color.text, fontSize: 58, lineHeight: 68, fontWeight: "900", marginTop: 12 },
  lead: { maxWidth: 640, color: color.textSecondary, fontSize: 16, lineHeight: 26, marginTop: 18 },
  tagStage: { position: "relative", width: "100%", minHeight: 390, alignItems: "center", justifyContent: "center", marginVertical: 8 },
  noteButton: { zIndex: 10, width: 142, height: 142, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: color.border, borderRadius: 71, backgroundColor: color.surfaceRaised },
  noteButtonPressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  sprayTag: { position: "absolute", zIndex: 4, left: "50%", top: "50%", minHeight: 34, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 12, borderWidth: 1, borderRadius: 17, backgroundColor: color.surface },
  sprayTagCyan: { borderColor: color.cyan, backgroundColor: color.cyanSoft },
  sprayTagRed: { borderColor: color.accent, backgroundColor: color.accentSoft },
  sprayTagAmber: { borderColor: color.amber, backgroundColor: color.amberSoft },
  sprayTagText: { color: color.text, fontSize: 12, fontWeight: "800" },
  sprayTagCount: { color: color.textMuted, fontSize: 9, fontWeight: "900" },
  openingStats: { minHeight: 92, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 28, paddingTop: 22, borderTopWidth: 1, borderTopColor: color.border },
  openingNumber: { color: color.text, fontSize: 48, lineHeight: 52, fontWeight: "900", fontVariant: ["tabular-nums"] },
  openingStatLabel: { color: color.textSecondary, fontSize: 13, marginTop: 7 },
  openingRange: { alignItems: "flex-end" },
  openingRangeValue: { color: color.text, fontSize: 16, fontWeight: "900" },
  openingRangeLabel: { color: color.textMuted, fontSize: 11, marginTop: 7 },
  chapter: { minHeight: 820, justifyContent: "center", paddingHorizontal: 52, paddingVertical: 92, borderTopWidth: 1, borderTopColor: color.borderSoft, backgroundColor: color.canvas },
  sectionInner: { width: "100%", maxWidth: 1180, alignSelf: "center" },
  sectionHeading: { flexDirection: "row", alignItems: "flex-start", gap: 38, marginBottom: 48 },
  sectionChapter: { width: 84, color: color.textMuted, fontSize: 44, lineHeight: 50, fontWeight: "900", fontVariant: ["tabular-nums"] },
  sectionHeadingCopy: { flex: 1, minWidth: 0 },
  sectionTitle: { maxWidth: 820, color: color.text, fontSize: 44, lineHeight: 54, fontWeight: "900", marginTop: 10 },
  sectionLead: { maxWidth: 740, color: color.textSecondary, fontSize: 15, lineHeight: 25, marginTop: 16 },
  streamGrid: { flexDirection: "row", alignItems: "stretch", gap: 16 },
  streamGridCompact: { gap: 10 },
  stream: { flex: 1, minWidth: 0, minHeight: 340, padding: 18, borderWidth: 1, borderTopWidth: 4, borderColor: color.border, borderRadius: radius.large, backgroundColor: color.surface },
  streamHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  streamTitle: { flexDirection: "row", alignItems: "center", gap: 8 },
  streamLabel: { color: color.text, fontSize: 13, fontWeight: "900" },
  streamCount: { color: color.text, fontSize: 23, fontWeight: "900", fontVariant: ["tabular-nums"] },
  streamLine: { height: 2, marginVertical: 16, backgroundColor: color.border },
  streamItems: { gap: 8 },
  recordButton: { minHeight: 78, flexDirection: "row", alignItems: "center", gap: 12, padding: 10, borderWidth: 1, borderColor: color.border, borderRadius: radius.medium, backgroundColor: color.surfaceRaised },
  recordButtonCompact: { minHeight: 66 },
  recordCover: { width: 42, height: 52, flexShrink: 0, overflow: "hidden", borderRadius: radius.small, backgroundColor: color.surfaceMuted },
  recordCoverFallback: { alignItems: "center", justifyContent: "center" },
  recordCopy: { flex: 1, minWidth: 0 },
  recordTitle: { color: color.text, fontSize: 12, lineHeight: 18, fontWeight: "800" },
  recordMeta: { color: color.textMuted, fontSize: 9, marginTop: 5 },
  emptyText: { color: color.textMuted, fontSize: 11, lineHeight: 18 },
  totalKnot: { width: 260, alignSelf: "center", alignItems: "center", marginTop: 34, paddingTop: 24, borderTopWidth: 3, borderTopColor: color.cyan },
  totalKnotLabel: { color: color.textMuted, fontSize: 10 },
  totalKnotValue: { color: color.text, fontSize: 46, lineHeight: 52, fontWeight: "900", marginTop: 6 },
  totalKnotMeta: { color: color.textSecondary, fontSize: 11, marginTop: 6, textAlign: "center" },
  rhythmScene: { borderTopWidth: 1, borderTopColor: color.border, backgroundColor: color.sidebar },
  rhythmLayout: { width: "100%", maxWidth: 1180, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 64, paddingHorizontal: 52, paddingVertical: 64 },
  rhythmLayoutCompact: { gap: 28, paddingHorizontal: 40 },
  rhythmCopy: { flex: 1, minWidth: 0 },
  hourStory: { maxWidth: 500, minHeight: 198, marginTop: 34, padding: 20, borderLeftWidth: 3, borderLeftColor: color.accent, backgroundColor: color.surface },
  hourStoryLabel: { color: color.cyan, fontSize: 11, fontWeight: "900" },
  hourStoryText: { color: color.text, fontSize: 17, lineHeight: 26, fontWeight: "800", marginVertical: 12 },
  dialWrap: { position: "relative", width: 480, height: 480, flexShrink: 0, alignItems: "center", justifyContent: "center" },
  dialTrack: { position: "absolute", top: 34, right: 34, bottom: 34, left: 34, borderWidth: 2, borderColor: color.border, borderRadius: 206 },
  dialHand: { position: "absolute", width: 4, height: 170, left: 238, top: 70, alignItems: "center", justifyContent: "flex-start", transformOrigin: "50% 100%" },
  dialHandLine: { width: 4, height: 150, borderRadius: 2, backgroundColor: color.cyan },
  hourButton: { position: "absolute", width: 44, height: 44, marginLeft: -22, marginTop: -22, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "transparent", borderRadius: 22 },
  hourButtonSelected: { borderColor: color.cyan, backgroundColor: color.cyanSoft },
  hourDot: { position: "absolute", top: 5, width: 5, height: 5, borderRadius: 3, backgroundColor: color.accent },
  hourDotSelected: { backgroundColor: color.cyan },
  hourText: { color: color.textMuted, fontSize: 9, fontWeight: "700" },
  hourTextSelected: { color: color.text, fontWeight: "900" },
  dialCenter: { width: 190, height: 190, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: color.border, borderRadius: 95, backgroundColor: color.canvas },
  dialTime: { color: color.text, fontSize: 38, lineHeight: 44, fontWeight: "900", marginTop: 8, fontVariant: ["tabular-nums"] },
  dialCount: { color: color.textMuted, fontSize: 10, marginTop: 5 },
  preferenceLayout: { flexDirection: "row", alignItems: "stretch", gap: 34 },
  preferenceLayoutCompact: { gap: 20 },
  topicField: { width: "36%", flexDirection: "row", flexWrap: "wrap", alignContent: "flex-start", gap: 9 },
  topicButton: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 13, borderWidth: 1, borderColor: color.border, borderRadius: radius.medium, backgroundColor: color.surface },
  topicButtonSelected: { borderColor: color.cyan, backgroundColor: color.cyanSoft },
  topicButtonText: { color: color.textSecondary, fontSize: 12, fontWeight: "800" },
  topicButtonTextSelected: { color: color.cyan },
  topicButtonCount: { color: color.accent, fontSize: 9, fontWeight: "900" },
  preferenceResult: { flex: 1, minWidth: 0, minHeight: 410, padding: 26, borderWidth: 1, borderColor: color.border, borderRadius: radius.large, backgroundColor: color.surface },
  resultEyebrow: { color: color.cyan, fontSize: 9, fontWeight: "900" },
  resultTitle: { color: color.text, fontSize: 26, lineHeight: 34, fontWeight: "900", marginTop: 7 },
  resultCopy: { color: color.textSecondary, fontSize: 13, lineHeight: 21, marginVertical: 14 },
  creatorFilmstrip: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 18, paddingTop: 16, borderTopWidth: 1, borderTopColor: color.border },
  creatorFrame: { flex: 1, minWidth: 120, minHeight: 68, justifyContent: "center", paddingHorizontal: 12, borderLeftWidth: 3, borderLeftColor: color.accent, backgroundColor: color.surfaceRaised },
  creatorIndex: { color: color.textMuted, fontSize: 9, fontWeight: "900" },
  creatorName: { color: color.text, fontSize: 11, fontWeight: "800", marginTop: 5 },
  keptLayout: { flexDirection: "row", alignItems: "stretch", gap: 24 },
  keptLayoutCompact: { gap: 14 },
  confluence: { position: "relative", flex: 1.35, minWidth: 0, minHeight: 430 },
  trackLabel: { position: "absolute", left: 16, color: color.textSecondary, fontSize: 11, fontWeight: "800" },
  trackWatch: { top: 76 },
  trackLiked: { top: 183 },
  trackFavorite: { top: 290 },
  overlapButton: { position: "absolute", minWidth: 126, minHeight: 58, alignItems: "center", justifyContent: "center", paddingHorizontal: 10, borderWidth: 1, borderColor: color.border, borderRadius: radius.medium, backgroundColor: color.surface },
  overlapButtonSelected: { borderColor: color.cyan, backgroundColor: color.cyanSoft },
  overlapButtonLabel: { color: color.textSecondary, fontSize: 9, fontWeight: "800" },
  overlapButtonValue: { color: color.cyan, fontSize: 17, fontWeight: "900", marginTop: 4 },
  overlapWatchLiked: { left: "38%", top: 118 },
  overlapWatchFavorite: { left: "50%", top: 238 },
  overlapLikedFavorite: { left: "24%", top: 256 },
  overlapAll: { right: 10, top: 166 },
  overlapResult: { flex: 0.78, minWidth: 300, padding: 24, borderWidth: 1, borderColor: color.border, borderRadius: radius.large, backgroundColor: color.surface },
  overlapItems: { gap: 8 },
  snapshotNotice: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: 9, marginTop: 18, paddingHorizontal: 12, backgroundColor: color.amberSoft },
  snapshotMark: { width: 16, height: 3, backgroundColor: color.amber },
  snapshotNoticeText: { flex: 1, color: color.textSecondary, fontSize: 9 },
  highlightsChapter: { paddingHorizontal: 0, paddingBottom: 0 },
  highlightScroller: { width: "100%" },
  highlightStrip: { gap: 14, paddingBottom: 20 },
  highlightCard: { width: 300, minHeight: 410, overflow: "hidden", borderWidth: 1, borderTopWidth: 4, borderColor: color.border, borderRadius: radius.large, backgroundColor: color.surface },
  highlightVisual: { position: "relative", height: 220, alignItems: "center", justifyContent: "center" },
  highlightIndex: { position: "absolute", right: 14, bottom: 8, color: "rgba(255,255,255,0.22)", fontSize: 38, fontWeight: "900" },
  highlightCopy: { flex: 1, padding: 18 },
  highlightLabel: { fontSize: 9, fontWeight: "900" },
  highlightTitle: { minHeight: 46, color: color.text, fontSize: 15, lineHeight: 22, fontWeight: "900", marginTop: 8 },
  highlightMeta: { color: color.textMuted, fontSize: 10, marginTop: 8 },
  highlightRule: { color: color.textSecondary, fontSize: 9, lineHeight: 15, marginTop: "auto", paddingTop: 14, borderTopWidth: 1, borderTopColor: color.border },
  disabled: { opacity: 0.52 },
  finale: { width: "100%", minHeight: 560, alignItems: "center", justifyContent: "center", marginTop: 88, paddingHorizontal: 40, borderTopWidth: 1, borderTopColor: color.border, backgroundColor: color.sidebar },
  finaleMark: { width: 72, height: 5, backgroundColor: color.accent },
  finaleEyebrow: { color: color.cyan, fontSize: 10, fontWeight: "900", marginTop: 34 },
  finaleTitle: { color: color.text, fontSize: 46, lineHeight: 58, fontWeight: "900", textAlign: "center", marginTop: 12 },
  finaleCopy: { maxWidth: 680, color: color.textSecondary, fontSize: 15, lineHeight: 25, textAlign: "center", marginTop: 20 },
  dashboardButton: { minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 28, paddingHorizontal: 20, borderRadius: radius.medium, backgroundColor: color.accentAction },
  dashboardButtonText: { color: color.white, fontSize: 13, fontWeight: "900" },
  modalScrim: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, backgroundColor: "rgba(0,0,0,0.72)" },
  modalPanel: { width: "100%", maxWidth: 720, maxHeight: "88%", overflow: "hidden", borderWidth: 1, borderColor: color.border, borderRadius: radius.large, backgroundColor: color.surface },
  modalHeader: { minHeight: 70, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 20, paddingHorizontal: 24, borderBottomWidth: 1, borderBottomColor: color.border },
  modalKicker: { color: color.textSecondary, fontSize: 12, fontWeight: "800", marginTop: 4 },
  modalClose: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: color.border, borderRadius: radius.medium, backgroundColor: color.surfaceRaised },
  modalBody: { padding: 28, paddingBottom: 34 },
  modalTitle: { color: color.text, fontSize: 28, lineHeight: 38, fontWeight: "900" },
  modalAuthor: { color: color.textSecondary, fontSize: 13, marginTop: 8 },
  detailFacts: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 24 },
  detailFact: { width: "48.8%", minHeight: 78, justifyContent: "center", paddingHorizontal: 14, borderLeftWidth: 3, borderLeftColor: color.cyan, backgroundColor: color.surfaceRaised },
  detailFactLabel: { color: color.textMuted, fontSize: 9 },
  detailFactValue: { color: color.text, fontSize: 12, fontWeight: "800", marginTop: 6 },
  detailTags: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 22 },
  detailTag: { minHeight: 30, paddingHorizontal: 10, paddingTop: 7, borderRadius: 15, color: color.cyan, fontSize: 10, fontWeight: "800", backgroundColor: color.cyanSoft },
  detailNote: { marginTop: 24, padding: 16, borderLeftWidth: 3, borderLeftColor: color.accent, backgroundColor: color.surfaceRaised },
  detailNoteText: { color: color.textSecondary, fontSize: 11, lineHeight: 18 },
  gateRoot: { flex: 1, minHeight: "100%", alignItems: "center", justifyContent: "center", padding: 32, backgroundColor: color.canvas },
  gateMark: { width: 56, height: 56, alignItems: "center", justifyContent: "center", marginBottom: 22, borderWidth: 1, borderColor: color.border, borderRadius: radius.large, backgroundColor: color.surface },
  gateTitle: { maxWidth: 620, color: color.text, fontSize: 30, lineHeight: 40, fontWeight: "900", textAlign: "center", marginTop: 10 },
  gateCopy: { maxWidth: 560, color: color.textSecondary, fontSize: 14, lineHeight: 23, textAlign: "center", marginTop: 14 },
});
