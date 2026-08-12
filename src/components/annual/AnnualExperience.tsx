import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import {
  ArrowLeft,
  ArrowRight,
  CalendarRange,
  ChevronDown,
  Clock3,
  Database,
  Eye,
  EyeOff,
  FileText,
  Home,
  Library,
  LockKeyhole,
  PanelLeft,
  Sparkles,
  Star,
  Users,
} from "lucide-react-native";

import type { AnnualCardId, AnnualReport } from "../../domain/annualReport";
import { ANNUAL_CARD_MANIFEST } from "../../domain/annualReport";
import { AnnualCoverPage, AnnualReportCardPage } from "./AnnualCards";
import { annualColors } from "./annualVisuals";

export interface AnnualExperienceProps {
  /** The already-built local report. The component never fetches or scans data. */
  report: AnnualReport | null;
  /** Available years from the one-pass index, preferably sorted ascending. */
  years?: readonly number[];
  /** The parent can rebuild `report` after this callback. */
  selectedYear?: number | null;
  onSelectYear?: (year: number) => void;
  onOpenRecords?: () => void;
  onOpenSources?: () => void;
  privacyMode?: boolean;
  onPrivacyModeChange?: (enabled: boolean) => void;
  loading?: boolean;
}

type IconComponent = React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;

const PAGE_COUNT = 9;
const MIN_DESKTOP_WIDTH = 1024;
const MOTION_DURATION = 280;

const railItems: Array<{ id: "cover" | AnnualCardId; label: string; icon: IconComponent }> = [
  { id: "cover", label: "年度", icon: Home },
  ...ANNUAL_CARD_MANIFEST.map((item) => ({ id: item.id, label: item.title, icon: iconForCard(item.id) })),
];

export function AnnualExperience({
  report,
  years,
  selectedYear,
  onSelectYear,
  onOpenRecords,
  onOpenSources,
  privacyMode,
  onPrivacyModeChange,
  loading = false,
}: AnnualExperienceProps) {
  const { width, height } = useWindowDimensions();
  const [localPrivacy, setLocalPrivacy] = useState(false);
  const privacy = privacyMode ?? localPrivacy;
  const [yearMenuOpen, setYearMenuOpen] = useState(false);
  const [localYear, setLocalYear] = useState<number | null>(selectedYear ?? report?.year ?? null);
  const [activePage, setActivePage] = useState(0);
  const activePageRef = useRef(0);
  const animatedPage = useRef(new Animated.Value(0)).current;
  const lastWheelAt = useRef(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  const yearOptions = useMemo(() => {
    const values = [...(years ?? []), ...(report ? [report.year] : []), ...(selectedYear ? [selectedYear] : [])]
      .filter((value): value is number => Number.isFinite(value))
      .map((value) => Math.trunc(value));
    return [...new Set(values)].sort((left, right) => right - left);
  }, [report, selectedYear, years]);
  const currentYear = selectedYear ?? localYear ?? report?.year ?? null;
  const viewportHeight = Math.max(500, height > 0 ? height - 136 : 632);
  const isDesktop = Platform.OS === "web" && width >= MIN_DESKTOP_WIDTH;

  useEffect(() => {
    if (selectedYear !== undefined) setLocalYear(selectedYear ?? report?.year ?? null);
  }, [report?.year, selectedYear]);

  useEffect(() => {
    activePageRef.current = 0;
    setActivePage(0);
    animatedPage.stopAnimation();
    animatedPage.setValue(0);
    setYearMenuOpen(false);
  }, [report?.year, animatedPage]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);

  const navigateTo = useCallback((target: number) => {
    if (!report) return;
    const next = Math.max(0, Math.min(PAGE_COUNT - 1, Math.trunc(target)));
    const previous = activePageRef.current;
    if (next === previous) return;
    activePageRef.current = next;
    setActivePage(next);
    animatedPage.stopAnimation();
    if (reducedMotion || Math.abs(next - previous) > 1) {
      animatedPage.setValue(next);
      return;
    }
    animatedPage.setValue(previous);
    Animated.timing(animatedPage, {
      toValue: next,
      duration: MOTION_DURATION,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [animatedPage, reducedMotion, report]);

  const navigateBy = useCallback((delta: number) => navigateTo(activePageRef.current + delta), [navigateTo]);

  const handleWheel = useCallback((event: unknown) => {
    const nativeEvent = (event as { nativeEvent?: { deltaY?: number; wheelDelta?: number } }).nativeEvent;
    const delta = nativeEvent?.deltaY ?? nativeEvent?.wheelDelta ?? 0;
    if (Math.abs(delta) < 12) return;
    const now = Date.now();
    if (now - lastWheelAt.current < 360) return;
    lastWheelAt.current = now;
    (event as { preventDefault?: () => void }).preventDefault?.();
    navigateBy(delta > 0 ? 1 : -1);
  }, [navigateBy]);

  useEffect(() => {
    if (!isDesktop || !report || typeof document === "undefined") return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();
      if (tagName === "input" || tagName === "textarea" || tagName === "select") return;
      if (event.key === "ArrowDown" || event.key === "PageDown" || event.key === " ") {
        event.preventDefault();
        navigateBy(1);
      } else if (event.key === "ArrowUp" || event.key === "PageUp") {
        event.preventDefault();
        navigateBy(-1);
      } else if (event.key === "Home") {
        event.preventDefault();
        navigateTo(0);
      } else if (event.key === "End") {
        event.preventDefault();
        navigateTo(PAGE_COUNT - 1);
      } else if (event.key === "Escape") {
        setYearMenuOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isDesktop, navigateBy, navigateTo, report]);

  const togglePrivacy = useCallback(() => {
    const next = !privacy;
    setLocalPrivacy(next);
    onPrivacyModeChange?.(next);
  }, [onPrivacyModeChange, privacy]);

  const chooseYear = useCallback((year: number) => {
    setLocalYear(year);
    setYearMenuOpen(false);
    onSelectYear?.(year);
  }, [onSelectYear]);

  if (!isDesktop) {
    return <WidthGate onOpenRecords={onOpenRecords} onOpenSources={onOpenSources} />;
  }

  if (!report || report.status === "empty") {
    return <EmptyAnnualState loading={loading} onOpenRecords={onOpenRecords} onOpenSources={onOpenSources} />;
  }

  const mountedIndexes = [activePage - 1, activePage, activePage + 1].filter((index) => index >= 0 && index < PAGE_COUNT);
  return (
    <View testID="annual-experience" style={styles.root} {...({ onWheel: handleWheel } as Record<string, unknown>)}>
      <View style={styles.rail}>
        <View style={styles.railBrand}><PanelLeft color={annualColors.white} size={19} strokeWidth={2.2} /></View>
        <Text style={styles.railBrandLabel}>年报</Text>
        <View style={styles.railItems}>
          {railItems.map((item, index) => {
            const selected = index === activePage;
            const Icon = item.icon;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`前往${item.label}`}
                onPress={() => navigateTo(index)}
                style={({ pressed }) => [styles.railButton, selected && styles.railButtonSelected, pressed && styles.pressed, webPointer]}
              >
                <Icon color={selected ? annualColors.cyan : "#AAB3B9"} size={17} strokeWidth={2} />
                <Text style={[styles.railLabel, selected && styles.railLabelSelected]} numberOfLines={1}>{index === 0 ? "年度" : String(index).padStart(2, "0")}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.railBottom}>
          <Pressable accessibilityRole="button" accessibilityLabel="前往记录" onPress={onOpenRecords} style={({ pressed }) => [styles.railUtility, pressed && styles.pressed, webPointer]}>
            <FileText color="#AAB3B9" size={17} /><Text style={styles.railUtilityLabel}>记录</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="前往数据源" onPress={onOpenSources} style={({ pressed }) => [styles.railUtility, pressed && styles.pressed, webPointer]}>
            <Database color="#AAB3B9" size={17} /><Text style={styles.railUtilityLabel}>数据源</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.mainColumn}>
        <View style={styles.topbar}>
          <View style={styles.topbarContext}><CalendarRange color={annualColors.cyan} size={18} /><Text style={styles.topbarContextText}>本地年度回顾</Text><Text style={styles.topbarContextHint}>· {report.timezone}</Text></View>
          <View style={styles.topbarActions}>
            <View style={styles.yearChooser}>
              <Pressable
                testID="annual-year-select"
                accessibilityRole="button"
                accessibilityLabel="选择报告年份"
                accessibilityState={{ expanded: yearMenuOpen }}
                onPress={() => setYearMenuOpen((open) => !open)}
                style={({ pressed }) => [styles.yearButton, pressed && styles.buttonPressed, webPointer]}
              >
                <Text style={styles.yearButtonText}>{report.periodLabel}</Text><ChevronDown color={annualColors.ink} size={16} />
              </Pressable>
              {yearMenuOpen ? (
                <View style={styles.yearMenu} accessibilityRole="menu">
                  {yearOptions.length ? yearOptions.map((year) => <Pressable key={year} accessibilityRole="menuitem" onPress={() => chooseYear(year)} style={({ pressed }) => [styles.yearMenuItem, year === currentYear && styles.yearMenuItemSelected, pressed && styles.buttonPressed, webPointer]}><Text style={styles.yearMenuText}>{year}</Text>{year === currentYear ? <Text style={styles.yearMenuCheck}>当前</Text> : null}</Pressable>) : <Text style={styles.yearMenuEmpty}>暂无可用年份</Text>}
                </View>
              ) : null}
            </View>
            <Pressable
              testID="annual-privacy-toggle"
              accessibilityRole="switch"
              accessibilityState={{ checked: privacy }}
              accessibilityLabel={privacy ? "关闭隐私模式" : "开启隐私模式"}
              onPress={togglePrivacy}
              style={({ pressed }) => [styles.privacyButton, privacy && styles.privacyButtonActive, pressed && styles.buttonPressed, webPointer]}
            >
              {privacy ? <EyeOff color={annualColors.ink} size={17} /> : <Eye color={annualColors.ink} size={17} />}
              <Text style={styles.privacyButtonText}>{privacy ? "隐私已开" : "隐私"}</Text>
            </Pressable>
          </View>
        </View>
        <View style={[styles.viewport, { height: viewportHeight }]}>
          {mountedIndexes.map((index) => {
            const translateY = animatedPage.interpolate({ inputRange: [index - 1, index, index + 1], outputRange: [viewportHeight, 0, -viewportHeight], extrapolate: "clamp" });
            const isCurrent = index === activePage;
            const page = index === 0
              ? <AnnualCoverPage report={report} privacy={privacy} pageNumber={0} totalPages={PAGE_COUNT} />
              : <AnnualReportCardPage report={report} privacy={privacy} pageNumber={index} totalPages={PAGE_COUNT} card={report.cards[index - 1]!} />;
            return (
              <Animated.View
                testID={`annual-page-${index}`}
                key={`${report.year}:${index}`}
                accessibilityElementsHidden={!isCurrent}
                importantForAccessibility={isCurrent ? "yes" : "no-hide-descendants"}
                style={[styles.pageLayer, { pointerEvents: isCurrent ? "auto" : "none", transform: [{ translateY }], zIndex: isCurrent ? 2 : 1 }]}
              >
                {page}
              </Animated.View>
            );
          })}
        </View>
        <View style={styles.footerNav}>
          <Pressable accessibilityRole="button" accessibilityLabel="上一页" accessibilityHint="使用上一张年度卡片" disabled={activePage === 0} onPress={() => navigateBy(-1)} style={({ pressed }) => [styles.pageButton, activePage === 0 && styles.pageButtonDisabled, pressed && styles.buttonPressed, webPointer]}>
            <ArrowLeft color={activePage === 0 ? annualColors.inkFaint : annualColors.ink} size={17} /><Text style={styles.pageButtonText}>上一页</Text>
          </Pressable>
          <View style={styles.dots} accessibilityRole="tablist">
            {railItems.map((item, index) => <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{ selected: index === activePage }} accessibilityLabel={`${index === 0 ? "封面" : item.label}，第 ${index + 1} 页`} onPress={() => navigateTo(index)} style={({ pressed }) => [styles.dotButton, pressed && styles.buttonPressed, webPointer]}><View style={[styles.dot, index === activePage && styles.dotActive]} /></Pressable>)}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="下一页" accessibilityHint="使用下一张年度卡片" disabled={activePage === PAGE_COUNT - 1} onPress={() => navigateBy(1)} style={({ pressed }) => [styles.pageButton, activePage === PAGE_COUNT - 1 && styles.pageButtonDisabled, pressed && styles.buttonPressed, webPointer]}>
            <Text style={styles.pageButtonText}>下一页</Text><ArrowRight color={activePage === PAGE_COUNT - 1 ? annualColors.inkFaint : annualColors.ink} size={17} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function WidthGate({ onOpenRecords, onOpenSources }: { onOpenRecords?: () => void; onOpenSources?: () => void }) {
  return (
    <View testID="annual-width-gate" style={styles.gateRoot}>
      <View style={styles.gateContent}>
        <View style={styles.gateMark}><PanelLeft color={annualColors.white} size={25} /></View>
        <Text style={styles.gateEyebrow}>ANNUAL RECAP / DESKTOP</Text>
        <Text style={styles.gateTitle}>把窗口打开到 1024px，年度回顾才会展开。</Text>
        <Text style={styles.gateBody}>年度报告使用全屏卡片和时间图表。当前窗口太窄，先去记录或数据源查看内容，数据仍然只保存在本地。</Text>
        <View style={styles.gateActions}>
          <Pressable accessibilityRole="button" onPress={onOpenRecords} style={({ pressed }) => [styles.gateButton, styles.gateButtonPrimary, pressed && styles.buttonPressed, webPointer]}><FileText color={annualColors.white} size={17} /><Text style={styles.gateButtonPrimaryText}>前往记录</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={onOpenSources} style={({ pressed }) => [styles.gateButton, styles.gateButtonSecondary, pressed && styles.buttonPressed, webPointer]}><Database color={annualColors.ink} size={17} /><Text style={styles.gateButtonSecondaryText}>前往数据源</Text></Pressable>
        </View>
      </View>
    </View>
  );
}

function EmptyAnnualState({ loading, onOpenRecords, onOpenSources }: { loading: boolean; onOpenRecords?: () => void; onOpenSources?: () => void }) {
  return (
    <View testID="annual-empty-state" style={styles.emptyRoot}>
      <View style={styles.emptyContent}>
        <View style={styles.emptyIcon}><LockKeyhole color={annualColors.cyan} size={25} /></View>
        <Text style={styles.gateEyebrow}>ANNUAL RECAP / LOCAL ONLY</Text>
        <Text style={styles.emptyTitle}>{loading ? "正在准备年度索引…" : "还没有可生成的年度回顾。"}</Text>
        <Text style={styles.gateBody}>{loading ? "当前页面不会访问外部 AI 或私有接口。" : "先从数据源连接采集器，或导入 JSON / ZIP 归档。拿到可靠行为时间后，这里会自动出现封面和八张卡片。"}</Text>
        <View style={styles.gateActions}>
          <Pressable accessibilityRole="button" onPress={onOpenSources} style={({ pressed }) => [styles.gateButton, styles.gateButtonPrimary, pressed && styles.buttonPressed, webPointer]}><Database color={annualColors.white} size={17} /><Text style={styles.gateButtonPrimaryText}>打开数据源</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={onOpenRecords} style={({ pressed }) => [styles.gateButton, styles.gateButtonSecondary, pressed && styles.buttonPressed, webPointer]}><FileText color={annualColors.ink} size={17} /><Text style={styles.gateButtonSecondaryText}>查看记录</Text></Pressable>
        </View>
      </View>
    </View>
  );
}

function iconForCard(id: AnnualCardId): IconComponent {
  switch (id) {
    case "overview": return Home;
    case "rhythm": return Clock3;
    case "monthly": return CalendarRange;
    case "creators": return Users;
    case "interests": return Sparkles;
    case "kept": return Library;
    case "highlights": return Star;
    case "summary": return PanelLeft;
  }
}

const webPointer = Platform.OS === "web" ? ({ cursor: "pointer" } as object) : null;

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: "row", width: "100%", minHeight: "100%", backgroundColor: annualColors.paper },
  rail: { width: 88, flexShrink: 0, alignItems: "center", paddingTop: 18, paddingBottom: 14, backgroundColor: annualColors.carbon },
  railBrand: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: annualColors.cyan },
  railBrandLabel: { color: "#D8E1E5", fontSize: 10, fontWeight: "900", marginTop: 7 },
  railItems: { flex: 1, width: "100%", alignItems: "center", gap: 5, marginTop: 24 },
  railButton: { width: 66, minHeight: 48, alignItems: "center", justifyContent: "center", gap: 4, borderRadius: 7 },
  railButtonSelected: { backgroundColor: annualColors.carbonSoft },
  railLabel: { maxWidth: 58, color: "#AAB3B9", fontSize: 10, fontWeight: "800", textAlign: "center" },
  railLabelSelected: { color: annualColors.white },
  railBottom: { width: "100%", alignItems: "center", gap: 4 },
  railUtility: { width: 68, minHeight: 44, alignItems: "center", justifyContent: "center", gap: 3, borderRadius: 7 },
  railUtilityLabel: { color: "#AAB3B9", fontSize: 10, fontWeight: "800" },
  mainColumn: { flex: 1, minWidth: 0, backgroundColor: annualColors.paper },
  topbar: { height: 74, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 30, borderBottomWidth: 1, borderBottomColor: annualColors.line, backgroundColor: "rgba(255,255,255,0.94)", zIndex: 20 },
  topbarContext: { flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0 },
  topbarContextText: { color: annualColors.ink, fontSize: 13, fontWeight: "900" },
  topbarContextHint: { color: annualColors.inkFaint, fontSize: 11 },
  topbarActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  yearChooser: { position: "relative", zIndex: 30 },
  yearButton: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 13, borderWidth: 1, borderColor: annualColors.lineStrong, borderRadius: 7, backgroundColor: annualColors.surface },
  yearButtonText: { color: annualColors.ink, fontSize: 13, fontWeight: "900" },
  yearMenu: { position: "absolute", top: 49, right: 0, minWidth: 148, padding: 5, borderWidth: 1, borderColor: annualColors.lineStrong, borderRadius: 7, backgroundColor: annualColors.surface, boxShadow: "0 7px 14px rgba(17,17,17,0.13)" },
  yearMenuItem: { minHeight: 38, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 10, borderRadius: 5 },
  yearMenuItemSelected: { backgroundColor: annualColors.cyanSoft },
  yearMenuText: { color: annualColors.ink, fontSize: 13, fontWeight: "800" },
  yearMenuCheck: { color: "#08777D", fontSize: 10, fontWeight: "900" },
  yearMenuEmpty: { color: annualColors.inkMuted, fontSize: 12, padding: 10 },
  privacyButton: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 13, borderWidth: 1, borderColor: annualColors.lineStrong, borderRadius: 7, backgroundColor: annualColors.surface },
  privacyButtonActive: { borderColor: annualColors.cyan, backgroundColor: annualColors.cyanSoft },
  privacyButtonText: { color: annualColors.ink, fontSize: 12, fontWeight: "900" },
  viewport: { position: "relative", overflow: "hidden", flex: 1 },
  pageLayer: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, overflow: "hidden" },
  footerNav: { height: 62, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 30, borderTopWidth: 1, borderTopColor: annualColors.line, backgroundColor: annualColors.paper },
  pageButton: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 10, borderRadius: 6 },
  pageButtonDisabled: { opacity: 0.38 },
  pageButtonText: { color: annualColors.ink, fontSize: 12, fontWeight: "900" },
  dots: { flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 4 },
  dotButton: { width: 24, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: annualColors.lineStrong },
  dotActive: { width: 22, borderRadius: 3, backgroundColor: annualColors.cyan },
  pressed: { opacity: 0.7 },
  buttonPressed: { opacity: 0.68 },
  gateRoot: { flex: 1, minHeight: "100%", alignItems: "center", justifyContent: "center", padding: 28, backgroundColor: annualColors.paper },
  gateContent: { width: "100%", maxWidth: 620, padding: 36, borderLeftWidth: 5, borderLeftColor: annualColors.cyan, backgroundColor: annualColors.surface },
  gateMark: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: annualColors.carbon },
  gateEyebrow: { color: annualColors.cyan, fontSize: 11, fontWeight: "900", marginTop: 18 },
  gateTitle: { color: annualColors.ink, fontSize: 28, lineHeight: 36, fontWeight: "900", marginTop: 8 },
  gateBody: { color: annualColors.inkMuted, fontSize: 14, lineHeight: 23, marginTop: 14 },
  gateActions: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 24 },
  gateButton: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 16, borderRadius: 7 },
  gateButtonPrimary: { backgroundColor: annualColors.carbon },
  gateButtonSecondary: { borderWidth: 1, borderColor: annualColors.lineStrong, backgroundColor: annualColors.surface },
  gateButtonPrimaryText: { color: annualColors.white, fontSize: 13, fontWeight: "900" },
  gateButtonSecondaryText: { color: annualColors.ink, fontSize: 13, fontWeight: "900" },
  emptyRoot: { flex: 1, minHeight: "100%", alignItems: "center", justifyContent: "center", padding: 28, backgroundColor: annualColors.paper },
  emptyContent: { width: "100%", maxWidth: 620, padding: 36, borderTopWidth: 5, borderTopColor: annualColors.cyan, backgroundColor: annualColors.surface },
  emptyIcon: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: annualColors.cyanSoft },
  emptyTitle: { color: annualColors.ink, fontSize: 28, lineHeight: 36, fontWeight: "900", marginTop: 8 },
});
