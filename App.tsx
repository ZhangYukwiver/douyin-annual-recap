import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import {
  Activity,
  AlertTriangle,
  Bookmark,
  Eye,
  ExternalLink,
  FileArchive,
  Heart,
  History,
  Link2,
  LockKeyhole,
  Pause,
  Play,
  RefreshCw,
  Server,
  Sparkles,
  Trash2,
  Unplug,
} from "lucide-react-native";

import { StatusBadge } from "./src/components/StatusBadge";
import {
  ContentWorkspace,
  SetupWorkspace,
  type WorkspaceViewKey,
  workspaceColors,
} from "./src/components/workspace";
import { AnnualScrollStory } from "./src/components/story/AnnualScrollStory";
import { buildPersonalSummary } from "./src/domain/annualReport";
import {
  describeArchiveInspection,
  type PersonalArchiveInspection,
} from "./src/domain/fileFormat";
import {
  countPersonalRecords,
  createEmptyPersonalRecords,
  PERSONAL_RECORD_TYPES,
  type PersonalArchiveData,
  type PersonalRecordCollection,
  type PersonalRecordType,
  type PersonalVideoRecord,
} from "./src/domain/personalRecords";
import {
  checkCollectorHealth,
  clearCollectorRecords,
  getCollectorPairingCode,
  getCollectorRecords,
  getCollectorStatus,
  getDefaultCollectorBaseUrl,
  LocalCollectorError,
  normalizeCollectorBaseUrl,
  parseLaunchPairingCode,
  pairCollector,
  startCollectorSync,
  startDirectRecordsSync,
  startCollectorObservation,
  stopCollectorSync,
  stopCollectorObservation,
  switchCollectorAccount,
  type CollectorSnapshot,
  type CollectorStatus,
} from "./src/services/localCollector";
import {
  describePersonalArchiveError,
  importPersonalArchive,
} from "./src/services/importPersonalArchive";
import { getDesktopCollectorConfig } from "./src/desktopRuntime";
import { colors } from "./src/theme";

type ViewKey = "summary" | "highlights" | "records" | "sources";
type BadgeState = "ready" | "not_configured" | "invalid" | "manual_action";

interface SelectedArchive {
  name: string;
  size: number | null;
  mimeType: string | null;
  inspection: PersonalArchiveInspection;
  data: PersonalArchiveData | null;
}

interface DisplaySnapshot {
  source: "collector" | "archive";
  records: PersonalRecordCollection;
  warnings: string[];
  updatedAt: string | null;
}

function getStoryDataVersion(snapshot: DisplaySnapshot | null): string | null {
  if (!snapshot || countPersonalRecords(snapshot.records) === 0) return null;
  if (snapshot.source === "collector" && snapshot.updatedAt) {
    return `collector:${snapshot.updatedAt}`;
  }

  let hash = 2_166_136_261;
  for (const type of PERSONAL_RECORD_TYPES) {
    for (const character of type.id) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16_777_619);
    }
    const records = snapshot.records[type.id];
    for (const record of records) {
      for (const character of record.id) {
        hash ^= character.charCodeAt(0);
        hash = Math.imul(hash, 16_777_619);
      }
    }
  }
  return `${snapshot.source}:${hash >>> 0}`;
}

interface CollectorConnectionOptions {
  baseUrl?: string;
  pairingCode?: string;
  revealSources?: boolean;
  automaticPairing?: boolean;
}

const recordIcons = {
  watch_history: History,
  liked_videos: Heart,
  favorite_videos: Bookmark,
} satisfies Record<PersonalRecordType, typeof History>;

const navigationItems = [
  { id: "summary", label: "总结", icon: Sparkles },
  { id: "records", label: "记录", icon: History },
  { id: "sources", label: "数据源", icon: Link2 },
] as const;

const TERMINAL_COLLECTOR_STATES = new Set(["idle", "complete", "partial", "error"]);

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function showAlert(title: string, message: string) {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

function confirmAlert(
  title: string,
  message: string,
  confirmText: string,
  onDecision: (confirmed: boolean) => void,
  destructive = false,
) {
  let settled = false;
  const settle = (confirmed: boolean) => {
    if (settled) return;
    settled = true;
    onDecision(confirmed);
  };
  if (Platform.OS === "web" && typeof window !== "undefined") {
    settle(window.confirm(`${title}\n\n${message}`));
    return;
  }
  Alert.alert(title, message, [
    { text: "取消", style: "cancel", onPress: () => settle(false) },
    { text: confirmText, style: destructive ? "destructive" : "default", onPress: () => settle(true) },
  ], { cancelable: true, onDismiss: () => settle(false) });
}

function formatBytes(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "大小未知";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

function describeRecord(record: PersonalVideoRecord): string {
  return [record.author, formatDate(record.occurredAt)].filter(Boolean).join(" | ") || "抖音视频";
}

function collectorBadgeState(status: CollectorStatus | null, connected: boolean): BadgeState {
  if (!connected) return "not_configured";
  if (status?.state === "complete") return "ready";
  if (status?.state === "error") return "invalid";
  return "manual_action";
}

function collectorErrorMessage(error: unknown): string {
  return error instanceof LocalCollectorError ? error.message : "本地采集服务暂时不可用。";
}

interface RecordsViewProps {
  activeRecord: PersonalRecordType;
  onChangeRecord: (record: PersonalRecordType) => void;
  snapshot: DisplaySnapshot | null;
  collectorConnected: boolean;
  collectorBusy: boolean;
  collectorStatus: CollectorStatus | null;
  onOpenRecord: (url: string) => Promise<void>;
  onOpenSources: () => void;
  onSync: () => Promise<void>;
  onClear: () => void;
}

function RecordsView({
  activeRecord,
  onChangeRecord,
  snapshot,
  collectorConnected,
  collectorBusy,
  collectorStatus,
  onOpenRecord,
  onOpenSources,
  onSync,
  onClear,
}: RecordsViewProps) {
  const selectedRecord = PERSONAL_RECORD_TYPES.find((record) => record.id === activeRecord) ?? PERSONAL_RECORD_TYPES[0];
  const RecordIcon = recordIcons[selectedRecord.id];
  const records = snapshot?.records[selectedRecord.id] ?? [];
  const allRecords = snapshot?.records ?? createEmptyPersonalRecords();
  const totalRecords = countPersonalRecords(allRecords);
  const sourceLabel = snapshot?.source === "collector" ? "本地浏览器采集" : snapshot?.source === "archive" ? "备用文件导入" : "尚未连接";
  const meta = collectorStatus?.message ?? (snapshot ? `${totalRecords} 条记录` : "等待本地采集器");
  const currentCategoryVerifiedEmpty = snapshot?.source === "archive"
    || (snapshot?.source === "collector" && collectorStatus?.state === "complete");
  const warningText = snapshot?.warnings.length
    ? [
        ...snapshot.warnings.slice(0, 3),
        ...(snapshot.warnings.length > 3 ? [`另有 ${snapshot.warnings.length - 3} 条提示`] : []),
      ].join("\n")
    : null;

  const listHeader = (
    <View>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderCopy}>
          <Text style={styles.sectionTitle}>个人记录</Text>
          <Text numberOfLines={1} style={styles.sectionMeta}>{meta}</Text>
        </View>
        <StatusBadge state={collectorBadgeState(collectorStatus, collectorConnected || snapshot !== null)} />
      </View>

      <View accessibilityRole="tablist" style={styles.recordTabs}>
        {PERSONAL_RECORD_TYPES.map((record) => {
          const TabIcon = recordIcons[record.id];
          const selected = record.id === activeRecord;
          return (
            <Pressable
              key={record.id}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={`${record.label}，${allRecords[record.id].length} 条`}
              onPress={() => onChangeRecord(record.id)}
              style={({ pressed }) => [
                styles.recordTab,
                selected && styles.recordTabActive,
                pressed && styles.pressed,
              ]}
            >
              <TabIcon color={selected ? colors.accent : colors.secondaryText} size={16} />
              <Text numberOfLines={1} style={[styles.recordTabLabel, selected && styles.recordTabLabelActive]}>
                {record.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {snapshot ? (
        <View style={styles.sourceBand}>
          {snapshot.source === "collector"
            ? <Server color={colors.cyan} size={20} />
            : <FileArchive color={colors.accent} size={20} />}
          <View style={styles.sourceBandCopy}>
            <Text style={styles.sourceBandTitle}>{sourceLabel}</Text>
            <Text style={styles.sourceBandDetail}>
              {snapshot.updatedAt ? `更新于 ${formatDate(snapshot.updatedAt)}` : `${totalRecords} 条记录`}
            </Text>
          </View>
          {collectorConnected ? (
            <Pressable
              accessibilityLabel="重新增量读取记录"
              accessibilityRole="button"
              disabled={collectorBusy}
              onPress={() => void onSync()}
              style={({ pressed }) => [styles.iconButton, collectorBusy && styles.disabled, pressed && styles.pressed]}
            >
              {collectorBusy
                ? <ActivityIndicator color={colors.accent} size="small" />
                : <RefreshCw color={colors.accent} size={18} />}
            </Pressable>
          ) : null}
          <Pressable
            accessibilityLabel="清除本地记录缓存"
            accessibilityRole="button"
            disabled={collectorBusy}
            onPress={onClear}
            style={({ pressed }) => [styles.iconButton, collectorBusy && styles.disabled, pressed && styles.pressed]}
          >
            <Trash2 color={colors.secondaryText} size={18} />
          </Pressable>
        </View>
      ) : null}

      {snapshot ? (
        <View style={styles.recordSummary}>
          {PERSONAL_RECORD_TYPES.map((record, index) => (
            <View key={record.id} style={[styles.recordStat, index < 2 && styles.recordStatBorder]}>
              <Text style={styles.recordStatValue}>{allRecords[record.id].length}</Text>
              <Text numberOfLines={1} style={styles.recordStatLabel}>{record.label}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {warningText ? (
        <View accessibilityLiveRegion="polite" style={styles.warningBand}>
          <AlertTriangle color={colors.amber} size={18} />
          <Text style={styles.warningText} numberOfLines={7}>{warningText}</Text>
        </View>
      ) : null}

      {records.length > 0 ? <Text style={styles.groupLabel}>{selectedRecord.label}</Text> : null}
    </View>
  );

  return (
    <FlatList
      contentContainerStyle={styles.recordsContent}
      data={records}
      keyExtractor={(record) => record.id}
      ListHeaderComponent={listHeader}
      ListEmptyComponent={(
        <View style={styles.emptyState}>
          <RecordIcon color={colors.mutedText} size={31} />
          <Text style={styles.emptyTitle}>
            {snapshot
              ? currentCategoryVerifiedEmpty
                ? `${selectedRecord.label}暂无记录`
                : `${selectedRecord.label}尚未确认`
              : `等待${selectedRecord.label}`}
          </Text>
          <Text accessibilityLiveRegion="polite" style={styles.emptyDetail}>
            {collectorStatus?.message ?? "连接电脑上的本地采集服务"}
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={collectorBusy}
            onPress={collectorConnected ? () => void onSync() : onOpenSources}
            style={({ pressed }) => [styles.primaryButton, collectorBusy && styles.primaryButtonDisabled, pressed && styles.pressed]}
          >
            {collectorBusy ? (
              <ActivityIndicator color={colors.surface} size="small" />
            ) : (
              <>
                {collectorConnected
                  ? <RefreshCw color={colors.surface} size={17} />
                  : <Link2 color={colors.surface} size={17} />}
                <Text style={styles.primaryButtonText}>{collectorConnected ? "增量读取" : "连接采集器"}</Text>
              </>
            )}
          </Pressable>
        </View>
      )}
      renderItem={({ item }) => (
        <Pressable
          accessibilityLabel={`${item.title}，${describeRecord(item)}${item.url ? "，打开视频" : ""}`}
          accessibilityRole={item.url ? "link" : undefined}
          disabled={!item.url}
          onPress={() => item.url && void onOpenRecord(item.url)}
          style={({ pressed }) => [styles.recordRow, pressed && item.url && styles.recordRowPressed]}
        >
          <View style={styles.recordRowIcon}>
            <RecordIcon color={colors.accent} size={18} />
          </View>
          <View style={styles.recordRowCopy}>
            <Text numberOfLines={2} style={styles.recordRowTitle}>{item.title}</Text>
            <Text numberOfLines={1} style={styles.recordRowMeta}>{describeRecord(item)}</Text>
          </View>
          {item.url ? <ExternalLink color={colors.mutedText} size={18} /> : null}
        </Pressable>
      )}
      showsVerticalScrollIndicator={false}
      style={styles.recordsList}
    />
  );
}

interface SourcesViewProps {
  collectorUrl: string;
  pairingCode: string;
  connected: boolean;
  busy: boolean;
  observing: boolean;
  switchingAccount: boolean;
  status: CollectorStatus | null;
  error: string | null;
  archive: SelectedArchive | null;
  pickingArchive: boolean;
  onChangeCollectorUrl: (value: string) => void;
  onChangePairingCode: (value: string) => void;
  onClearCache: () => void;
  onConnect: () => Promise<void>;
  onDisconnect: () => Promise<void>;
  onStartObservation: () => Promise<void>;
  onStopObservation: () => Promise<void>;
  onStartIncrementalSync: () => void;
  onStartFullSync: () => void;
  onSwitchAccount: () => void;
  onPickArchive: () => Promise<void>;
}

function SourcesView({
  collectorUrl,
  pairingCode,
  connected,
  busy,
  observing,
  switchingAccount,
  status,
  error,
  archive,
  pickingArchive,
  onChangeCollectorUrl,
  onChangePairingCode,
  onClearCache,
  onConnect,
  onDisconnect,
  onStartObservation,
  onStopObservation,
  onStartIncrementalSync,
  onStartFullSync,
  onSwitchAccount,
  onPickArchive,
}: SourcesViewProps) {
  return (
    <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderCopy}>
          <Text style={styles.sectionTitle}>数据源</Text>
          <Text style={styles.sectionMeta}>{status?.message ?? "本地浏览器采集"}</Text>
        </View>
        <StatusBadge state={collectorBadgeState(status, connected)} />
      </View>

      <View style={styles.collectorBand}>
        <View style={styles.bandHeading}>
          <View style={styles.bandIcon}><Server color={colors.cyan} size={21} /></View>
          <View style={styles.bandHeadingCopy}>
            <Text style={styles.bandTitle}>本地采集器</Text>
            <Text style={styles.bandDetail}>独立 Chrome 会话</Text>
          </View>
        </View>

        <Text style={styles.inputLabel}>服务地址</Text>
        <TextInput
          accessibilityLabel="服务地址"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!connected && !busy}
          onChangeText={onChangeCollectorUrl}
          placeholder="http://127.0.0.1:4765"
          placeholderTextColor={colors.mutedText}
          selectTextOnFocus
          style={[styles.textInput, connected && styles.inputDisabled]}
          value={collectorUrl}
        />

        {!connected ? (
          <>
            <Text style={styles.inputLabel}>配对码</Text>
            <View style={styles.codeInputWrap}>
              <LockKeyhole color={colors.secondaryText} size={18} />
              <TextInput
                accessibilityLabel="配对码"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!busy}
                keyboardType="number-pad"
                maxLength={8}
                onChangeText={(value) => onChangePairingCode(value.replace(/\D/gu, ""))}
                placeholder="8 位数字"
                placeholderTextColor={colors.mutedText}
                style={styles.codeInput}
                value={pairingCode}
              />
            </View>
          </>
        ) : null}

        <View style={styles.actionRow}>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void (connected
              ? (observing ? onStopObservation() : onStartObservation())
              : onConnect())}
            style={({ pressed }) => [styles.primaryButton, styles.flexButton, busy && styles.primaryButtonDisabled, pressed && styles.pressed]}
          >
            {busy
              ? <ActivityIndicator color={colors.surface} size="small" />
              : connected
                ? observing
                  ? <Pause color={colors.surface} size={17} />
                  : <Eye color={colors.surface} size={17} />
                : <Link2 color={colors.surface} size={17} />}
            <Text style={styles.primaryButtonText}>
              {connected ? (observing ? "停止监听" : "手动监听") : "连接采集器"}
            </Text>
          </Pressable>
          {connected ? (
            <>
              <Pressable
                accessibilityLabel="增量读取记录"
                accessibilityRole="button"
                disabled={busy || observing}
                onPress={onStartIncrementalSync}
                style={({ pressed }) => [styles.sampleButton, (busy || observing) && styles.disabled, pressed && styles.pressed]}
              >
                <Play color={colors.secondaryText} size={18} />
                <Text style={styles.sampleButtonText}>增量读取</Text>
              </Pressable>
              <Pressable
                accessibilityLabel="断开采集器"
                accessibilityRole="button"
                disabled={busy}
                onPress={() => void onDisconnect()}
                style={({ pressed }) => [styles.secondaryIconButton, pressed && styles.pressed]}
              >
                <Unplug color={colors.secondaryText} size={19} />
              </Pressable>
            </>
          ) : null}
        </View>

        {connected ? (
          <Pressable
            accessibilityLabel="完整读取记录"
            accessibilityRole="button"
            disabled={busy || observing}
            onPress={onStartFullSync}
            style={({ pressed }) => [
              styles.accountSwitchButton,
              (busy || observing) && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <History color={colors.secondaryText} size={18} />
            <Text style={styles.accountSwitchText}>完整读取</Text>
          </Pressable>
        ) : null}

        {connected ? (
          <Pressable
            accessibilityLabel="清除本地记录缓存"
            accessibilityRole="button"
            disabled={busy || observing}
            onPress={onClearCache}
            style={({ pressed }) => [
              styles.accountSwitchButton,
              (busy || observing) && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <Trash2 color={colors.secondaryText} size={18} />
            <Text style={styles.accountSwitchText}>清除本地缓存</Text>
          </Pressable>
        ) : null}

        {connected ? (
          <Pressable
            accessibilityRole="button"
            disabled={switchingAccount || busy}
            onPress={onSwitchAccount}
            style={({ pressed }) => [
              styles.accountSwitchButton,
              (switchingAccount || busy) && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            {switchingAccount
              ? <ActivityIndicator color={colors.secondaryText} size="small" />
              : <Unplug color={colors.secondaryText} size={18} />}
            <Text style={styles.accountSwitchText}>切换账号</Text>
          </Pressable>
        ) : null}

        {error ? (
          <View accessibilityLiveRegion="assertive" style={styles.inlineError}>
            <AlertTriangle color={colors.accentPressed} size={17} />
            <Text style={styles.inlineErrorText}>{error}</Text>
          </View>
        ) : null}

        <Text style={styles.privacyNote}>Cookie 仅保留在本机专用浏览器配置</Text>
      </View>

      <Text style={styles.groupLabel}>备用导入</Text>
      <View style={styles.archiveBand}>
        <FileArchive color={colors.accent} size={22} />
        <View style={styles.archiveCopy}>
          <Text numberOfLines={1} style={styles.bandTitle}>{archive?.name ?? "JSON / ZIP"}</Text>
          <Text numberOfLines={2} style={styles.bandDetail}>
            {archive
              ? archive.data
                ? `${countPersonalRecords(archive.data.records)} 条 | ${formatBytes(archive.size)}`
                : describeArchiveInspection(archive.inspection)
              : "仅在当前会话读取"}
          </Text>
        </View>
        <Pressable
          accessibilityLabel={archive ? "重新选择备用文件" : "选择备用文件"}
          accessibilityRole="button"
          disabled={pickingArchive}
          onPress={() => void onPickArchive()}
          style={({ pressed }) => [styles.secondaryIconButton, pickingArchive && styles.disabled, pressed && styles.pressed]}
        >
          {pickingArchive
            ? <ActivityIndicator color={colors.accent} size="small" />
            : <FileArchive color={colors.accent} size={18} />}
        </Pressable>
      </View>
    </ScrollView>
  );
}

function AppContent() {
  const [activeView, setActiveView] = useState<ViewKey>("sources");
  const [activeRecord, setActiveRecord] = useState<PersonalRecordType>("watch_history");
  const [storyOpen, setStoryOpen] = useState(false);
  const [storyMountKey, setStoryMountKey] = useState(0);
  const [privacy, setPrivacy] = useState(false);
  const [selectedArchive, setSelectedArchive] = useState<SelectedArchive | null>(null);
  const [pickingArchive, setPickingArchive] = useState(false);
  const [collectorUrl, setCollectorUrl] = useState(getDefaultCollectorBaseUrl());
  const [pairingCode, setPairingCode] = useState("");
  const [collectorToken, setCollectorToken] = useState<string | null>(null);
  const [collectorStatus, setCollectorStatus] = useState<CollectorStatus | null>(null);
  const [collectorSnapshot, setCollectorSnapshot] = useState<CollectorSnapshot | null>(null);
  const [collectorBusy, setCollectorBusy] = useState(false);
  const [stoppingSync, setStoppingSync] = useState(false);
  const [switchingAccount, setSwitchingAccount] = useState(false);
  const [collectorError, setCollectorError] = useState<string | null>(null);
  const importRequest = useRef(0);
  const pollRequest = useRef(0);
  const connectingRef = useRef(false);
  const syncConfirmationOpenRef = useRef(false);
  const accountSwitchConfirmationOpenRef = useRef(false);
  const lastAutoStoryVersionRef = useRef<string | null>(null);

  useEffect(() => () => {
    pollRequest.current += 1;
    importRequest.current += 1;
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return undefined;
    const styleId = "content-workspace-focus-styles";
    if (document.getElementById(styleId)) return undefined;
    const focusStyles = document.createElement("style");
    focusStyles.id = styleId;
    focusStyles.textContent = `
      button:focus-visible,
      input:focus-visible,
      [role="button"]:focus-visible,
      [role="tab"]:focus-visible,
      [role="switch"]:focus-visible,
      [role="link"]:focus-visible {
        outline: 2px solid ${workspaceColors.cyan} !important;
        outline-offset: 2px !important;
      }
    `;
    document.head.appendChild(focusStyles);
    return () => focusStyles.remove();
  }, []);

  const displaySnapshot: DisplaySnapshot | null = collectorSnapshot
    ? {
        source: "collector",
        records: collectorSnapshot.records,
        warnings: collectorSnapshot.warnings,
        updatedAt: collectorSnapshot.updatedAt,
      }
    : selectedArchive?.data
      ? {
          source: "archive",
          records: selectedArchive.data.records,
          warnings: selectedArchive.data.warnings,
          updatedAt: null,
        }
      : null;

  const personalSummary = useMemo(() => {
    if (!displaySnapshot) return null;
    const collectionState = displaySnapshot?.source === "collector"
      ? collectorStatus?.state === "complete"
        ? "complete"
        : collectorStatus
          ? "partial"
          : "unknown"
      : "unknown";
    return buildPersonalSummary(displaySnapshot.records, {
      source: displaySnapshot?.source,
      collectionState,
      warnings: displaySnapshot?.warnings ?? [],
    });
  }, [collectorStatus?.state, displaySnapshot?.records, displaySnapshot?.source, displaySnapshot?.warnings]);

  useEffect(() => {
    if (storyOpen && (!personalSummary || personalSummary.status === "empty")) {
      setStoryOpen(false);
    }
  }, [personalSummary, storyOpen]);

  async function refreshCollectorSnapshot(baseUrl: string, token: string, requestId?: number): Promise<boolean> {
    const snapshot = await getCollectorRecords(baseUrl, token);
    if (requestId !== undefined && pollRequest.current !== requestId) return false;
    setCollectorSnapshot(snapshot);
    return true;
  }

  async function pollCollector(baseUrl: string, token: string, requestId: number) {
    try {
      while (pollRequest.current === requestId) {
        await delay(1_500);
        if (pollRequest.current !== requestId) return;
        const status = await getCollectorStatus(baseUrl, token);
        if (pollRequest.current !== requestId) return;
        setCollectorStatus(status);
        if (status.state === "observing") {
          await refreshCollectorSnapshot(baseUrl, token, requestId);
          if (pollRequest.current !== requestId) return;
          setCollectorBusy(false);
          continue;
        }
        if (TERMINAL_COLLECTOR_STATES.has(status.state)) {
          if (!await refreshCollectorSnapshot(baseUrl, token, requestId)) return;
          if (pollRequest.current !== requestId) return;
          setCollectorBusy(false);
          return;
        }
      }
    } catch (error) {
      if (pollRequest.current !== requestId) return;
      setCollectorBusy(false);
      const message = collectorErrorMessage(error);
      setCollectorError(message);
      showAlert("无法读取同步状态", message);
    }
  }

  async function beginSync(baseUrl: string, token: string, incremental = false) {
    const requestId = pollRequest.current + 1;
    pollRequest.current = requestId;
    setCollectorBusy(true);
    setStoppingSync(false);
    setCollectorError(null);
    try {
      const status = incremental
        ? await startDirectRecordsSync(baseUrl, token)
        : await startCollectorSync(baseUrl, token);
      if (pollRequest.current !== requestId) return;
      setCollectorStatus(status);
      void pollCollector(baseUrl, token, requestId);
    } catch (error) {
      if (pollRequest.current !== requestId) return;
      setCollectorBusy(false);
      const message = collectorErrorMessage(error);
      setCollectorError(message);
      showAlert(incremental ? "无法增量读取记录" : "无法完整读取记录", message);
    }
  }

  async function endSync(baseUrl: string, token: string) {
    const requestId = pollRequest.current + 1;
    pollRequest.current = requestId;
    setCollectorBusy(true);
    setStoppingSync(true);
    setCollectorError(null);
    try {
      const status = await stopCollectorSync(baseUrl, token);
      if (pollRequest.current !== requestId) return;
      setCollectorStatus(status);
      if (TERMINAL_COLLECTOR_STATES.has(status.state)) {
        await refreshCollectorSnapshot(baseUrl, token, requestId);
        if (pollRequest.current !== requestId) return;
        setCollectorBusy(false);
      } else {
        await pollCollector(baseUrl, token, requestId);
      }
    } catch (error) {
      if (pollRequest.current !== requestId) return;
      setCollectorBusy(false);
      const message = collectorErrorMessage(error);
      setCollectorError(message);
      showAlert("无法停止读取", message);
    } finally {
      if (pollRequest.current === requestId) setStoppingSync(false);
    }
  }

  async function beginObservation(baseUrl: string, token: string) {
    const requestId = pollRequest.current + 1;
    pollRequest.current = requestId;
    setCollectorBusy(true);
    setCollectorError(null);
    try {
      const status = await startCollectorObservation(baseUrl, token);
      if (pollRequest.current !== requestId) return;
      setCollectorStatus(status);
      void pollCollector(baseUrl, token, requestId);
    } catch (error) {
      if (pollRequest.current !== requestId) return;
      setCollectorBusy(false);
      const message = collectorErrorMessage(error);
      setCollectorError(message);
      showAlert("无法启动手动监听", message);
    }
  }

  async function endObservation(baseUrl: string, token: string) {
    const requestId = pollRequest.current + 1;
    pollRequest.current = requestId;
    setCollectorBusy(true);
    setCollectorError(null);
    try {
      const status = await stopCollectorObservation(baseUrl, token);
      if (pollRequest.current !== requestId) return;
      setCollectorStatus(status);
      await refreshCollectorSnapshot(baseUrl, token, requestId);
      if (pollRequest.current !== requestId) return;
      setCollectorBusy(false);
    } catch (error) {
      if (pollRequest.current !== requestId) return;
      setCollectorBusy(false);
      const message = collectorErrorMessage(error);
      setCollectorError(message);
      showAlert("无法停止手动监听", message);
    }
  }

  async function connectCollector(options: CollectorConnectionOptions = {}) {
    if (collectorToken || connectingRef.current) return;
    connectingRef.current = true;
    let requestedUrl = options.baseUrl ?? collectorUrl;
    let requestedPairingCode = options.pairingCode ?? pairingCode;
    const revealSources = options.revealSources ?? true;
    const requestId = pollRequest.current + 1;
    pollRequest.current = requestId;
    let normalizedUrl: string | null = null;
    let pairedToken: string | null = null;
    let healthChecked = false;
    setCollectorBusy(true);
    setCollectorError(null);
    try {
      if (options.automaticPairing) {
        const desktopConfig = await getDesktopCollectorConfig();
        if (desktopConfig) {
          requestedUrl = desktopConfig.baseUrl;
          requestedPairingCode = desktopConfig.pairingCode;
        } else {
          let launchCode: string | null = null;
          if (Platform.OS === "web" && typeof window !== "undefined") {
            const hostname = window.location.hostname.replace(/^\[|\]$/gu, "");
            launchCode = ["localhost", "127.0.0.1", "::1"].includes(hostname)
              ? parseLaunchPairingCode(window.location.hash)
              : null;
            if (launchCode) {
              window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
            }
          }

          normalizedUrl = normalizeCollectorBaseUrl(requestedUrl);
          await checkCollectorHealth(normalizedUrl);
          healthChecked = true;
          if (launchCode) {
            requestedPairingCode = launchCode;
          } else {
            try {
              requestedPairingCode = await getCollectorPairingCode(normalizedUrl);
            } catch (error) {
              if (!/^\d{8}$/u.test(pairingCode.trim())) throw error;
              requestedPairingCode = pairingCode.trim();
            }
          }
        }
        if (pollRequest.current !== requestId) return;
        setCollectorUrl(requestedUrl);
        setPairingCode(requestedPairingCode);
      }

      normalizedUrl ??= normalizeCollectorBaseUrl(requestedUrl);
      if (!healthChecked) await checkCollectorHealth(normalizedUrl);
      pairedToken = await pairCollector(normalizedUrl, requestedPairingCode);
      if (pollRequest.current !== requestId) return;
      setCollectorUrl(normalizedUrl);
      setCollectorToken(pairedToken);
      setPairingCode("");
      const [status, snapshot] = await Promise.all([
        getCollectorStatus(normalizedUrl, pairedToken),
        getCollectorRecords(normalizedUrl, pairedToken),
      ]);
      if (pollRequest.current !== requestId) return;
      setCollectorUrl(normalizedUrl);
      setCollectorStatus(status);
      setCollectorSnapshot(snapshot);
      if (revealSources) setActiveView("sources");
      if (TERMINAL_COLLECTOR_STATES.has(status.state)) {
        setCollectorBusy(false);
      } else {
        void pollCollector(normalizedUrl, pairedToken, requestId);
      }
    } catch (error) {
      if (pollRequest.current !== requestId) return;
      setCollectorBusy(false);
      const message = collectorErrorMessage(error);
      setCollectorError(pairedToken
        ? `${message} 配对已完成，稍后可从此页面继续操作。`
        : message);
      setActiveView("sources");
    } finally {
      connectingRef.current = false;
    }
  }

  function confirmFullSync() {
    if (!collectorToken || collectorBusy || collectorStatus?.state === "observing" || syncConfirmationOpenRef.current) return;
    syncConfirmationOpenRef.current = true;
    confirmAlert(
      "开始读取全部可见记录",
      "将由专用浏览器依次打开观看、点赞和收藏列表，并持续滚动到各列表当前可见的末页。",
      "开始",
      (confirmed) => {
        syncConfirmationOpenRef.current = false;
        if (confirmed) void beginSync(collectorUrl, collectorToken);
      },
    );
  }

  function confirmIncrementalSync() {
    if (!collectorToken || collectorBusy || collectorStatus?.state === "observing" || syncConfirmationOpenRef.current) return;
    syncConfirmationOpenRef.current = true;
    confirmAlert(
      "增量读取",
      "尚未建立边界的分类会读取全部可见记录；已有边界的分类只读取到本地已知记录为止。每个分类完成后立即合并保存，全程不会弹出浏览器。",
      "读取新记录",
      (confirmed) => {
        syncConfirmationOpenRef.current = false;
        if (confirmed) void beginSync(collectorUrl, collectorToken, true);
      },
    );
  }

  async function disconnectCollector() {
    const token = collectorToken;
    if (!token) return;
    pollRequest.current += 1;
    setCollectorBusy(true);
    let stopError: string | null = null;
    try {
      await stopCollectorObservation(collectorUrl, token);
    } catch (error) {
      stopError = collectorErrorMessage(error);
    } finally {
      setStoryOpen(false);
      setCollectorToken(null);
      setCollectorStatus(null);
      setCollectorSnapshot(null);
      setStoppingSync(false);
      setCollectorBusy(false);
      setCollectorError(stopError
        ? `已断开应用，但无法确认手动监听已停止：${stopError}`
        : null);
    }
  }

  async function performAccountSwitch() {
    if (!collectorToken || switchingAccount || collectorBusy) return;
    const requestId = pollRequest.current + 1;
    pollRequest.current = requestId;
    setSwitchingAccount(true);
    setCollectorBusy(true);
    setCollectorError(null);
    setStoryOpen(false);
    setCollectorSnapshot(null);
    try {
      const status = await switchCollectorAccount(collectorUrl, collectorToken);
      if (pollRequest.current !== requestId) return;
      setCollectorStatus(status);
      if (!await refreshCollectorSnapshot(collectorUrl, collectorToken, requestId)) return;
      setActiveView("records");
      void pollCollector(collectorUrl, collectorToken, requestId);
    } catch (error) {
      if (pollRequest.current !== requestId) return;
      const message = collectorErrorMessage(error);
      setCollectorBusy(false);
      setCollectorError(message);
      showAlert("无法切换账号", message);
    } finally {
      setSwitchingAccount(false);
    }
  }

  function confirmAccountSwitch() {
    if (accountSwitchConfirmationOpenRef.current) return;
    accountSwitchConfirmationOpenRef.current = true;
    confirmAlert(
      "切换抖音账号",
      "将清除专用浏览器的登录会话和本地采集结果，随后打开专用浏览器进入手动监听，等待你登录新账号。不会影响抖音账号中的记录。",
      "切换",
      (confirmed) => {
        accountSwitchConfirmationOpenRef.current = false;
        if (confirmed) void performAccountSwitch();
      },
    );
  }

  async function pickArchive() {
    const requestId = importRequest.current + 1;
    importRequest.current = requestId;
    setPickingArchive(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
        multiple: false,
        base64: false,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const archive: SelectedArchive = {
          name: asset.name,
          size: asset.size ?? null,
          mimeType: asset.mimeType ?? null,
          inspection: { status: "inspecting" },
          data: null,
        };
        setSelectedArchive(archive);
        try {
          const data = await importPersonalArchive(asset);
          if (importRequest.current !== requestId) return;
          setSelectedArchive({ ...archive, inspection: { status: "complete", format: data.format }, data });
        } catch (error) {
          if (importRequest.current !== requestId) return;
          setSelectedArchive({ ...archive, inspection: { status: "failed" } });
          showAlert("无法读取备用文件", describePersonalArchiveError(error));
        }
      }
    } catch {
      showAlert("无法选择文件", "请检查文件访问权限后重试。");
    } finally {
      if (importRequest.current === requestId) setPickingArchive(false);
    }
  }

  function clearCurrentRecords() {
    confirmAlert(
      "清除本地缓存",
      "将清除本地保存的观看、喜欢和收藏记录。抖音登录状态、Cookie 和账号中的记录不会受影响；下一次读取将重新获取全部可见记录。",
      "清除缓存",
      (confirmed) => {
        if (!confirmed) return;
        setStoryOpen(false);
        if (collectorToken) {
          const requestId = pollRequest.current + 1;
          const token = collectorToken;
          pollRequest.current = requestId;
          setCollectorBusy(true);
          setCollectorError(null);
          void (async () => {
            try {
              const snapshot = await clearCollectorRecords(collectorUrl, token);
              if (pollRequest.current !== requestId) return;
              setCollectorSnapshot(snapshot);
              const status = await getCollectorStatus(collectorUrl, token);
              if (pollRequest.current !== requestId) return;
              setCollectorStatus(status);
            } catch (error) {
              if (pollRequest.current !== requestId) return;
              const message = collectorErrorMessage(error);
              setCollectorError(message);
              showAlert("无法清除记录", message);
            } finally {
              if (pollRequest.current === requestId) setCollectorBusy(false);
            }
          })();
        } else {
          importRequest.current += 1;
          setSelectedArchive(null);
        }
      },
      true,
    );
  }

  async function openRecord(url: string) {
    try {
      if (!(await Linking.canOpenURL(url))) throw new Error("unsupported_url");
      await Linking.openURL(url);
    } catch {
      showAlert("无法打开视频", "该记录中的链接当前不可用。");
    }
  }

  const workspaceRecords = displaySnapshot?.records ?? createEmptyPersonalRecords();
  const workspaceView: WorkspaceViewKey = activeView === "summary" || activeView === "highlights" ? activeView : activeRecord;
  const sourceLabel = displaySnapshot?.source === "collector"
    ? "本地浏览器采集"
    : displaySnapshot?.source === "archive"
      ? "备用文件导入"
      : "本地内容";
  const archiveInfo = selectedArchive
    ? {
        name: selectedArchive.name,
        detail: selectedArchive.data
          ? `${countPersonalRecords(selectedArchive.data.records)} 条记录 | ${formatBytes(selectedArchive.size)}`
          : describeArchiveInspection(selectedArchive.inspection),
      }
    : null;

  function enterDashboard() {
    setStoryOpen(false);
    setActiveView("summary");
  }

  function enterWorkspace() {
    const storyVersion = getStoryDataVersion(displaySnapshot);
    setActiveView("summary");
    if (
      storyVersion
      && personalSummary
      && personalSummary.status !== "empty"
      && lastAutoStoryVersionRef.current !== storyVersion
    ) {
      lastAutoStoryVersionRef.current = storyVersion;
      setStoryMountKey((key) => key + 1);
      setStoryOpen(true);
      return;
    }
    setStoryOpen(false);
  }

  function replayStory() {
    if (!personalSummary || personalSummary.status === "empty") return;
    const storyVersion = getStoryDataVersion(displaySnapshot);
    if (storyVersion) lastAutoStoryVersionRef.current = storyVersion;
    setActiveView("summary");
    setStoryMountKey((key) => key + 1);
    setStoryOpen(true);
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <StatusBar style="light" />
      {storyOpen && personalSummary && personalSummary.status !== "empty" ? (
        <AnnualScrollStory
          key={`annual-story-${storyMountKey}`}
          onEnterDashboard={enterDashboard}
          privacy={privacy}
          records={workspaceRecords}
          report={personalSummary}
          sourceLabel={sourceLabel}
        />
      ) : activeView === "sources" ? (
        <SetupWorkspace
          archive={archiveInfo}
          busy={collectorBusy}
          collectorUrl={collectorUrl}
          connected={collectorToken !== null}
          error={collectorError}
          onChangeCollectorUrl={(value) => {
            setCollectorUrl(value);
            setCollectorError(null);
          }}
          onChangePairingCode={(value) => {
            setPairingCode(value);
            setCollectorError(null);
          }}
          onClearCache={clearCurrentRecords}
          onConnect={() => connectCollector({ automaticPairing: true })}
          onDisconnect={disconnectCollector}
          onEnterWorkspace={enterWorkspace}
          onPickArchive={pickArchive}
          onStartIncrementalSync={confirmIncrementalSync}
          onStartObservation={() => collectorToken ? beginObservation(collectorUrl, collectorToken) : Promise.resolve()}
          onStartFullSync={confirmFullSync}
          onStopSync={() => collectorToken ? endSync(collectorUrl, collectorToken) : Promise.resolve()}
          onStopObservation={() => collectorToken ? endObservation(collectorUrl, collectorToken) : Promise.resolve()}
          onSwitchAccount={confirmAccountSwitch}
          observing={collectorStatus?.state === "observing"}
          pairingCode={pairingCode}
          pickingArchive={pickingArchive}
          records={workspaceRecords}
          snapshotSource={displaySnapshot?.source ?? null}
          snapshotUpdatedAt={displaySnapshot?.updatedAt ?? null}
          status={collectorStatus}
          stoppingSync={stoppingSync}
          switchingAccount={switchingAccount}
        />
      ) : (
        <ContentWorkspace
          activeView={workspaceView}
          busy={collectorBusy}
          onChangeView={(view) => {
            if (view === "summary" || view === "highlights") {
              setActiveView(view);
              return;
            }
            setActiveRecord(view);
            setActiveView("records");
          }}
          onOpenRecord={openRecord}
          onOpenSettings={() => setActiveView("sources")}
          onReplayStory={replayStory}
          onSync={() => collectorToken ? confirmIncrementalSync() : setActiveView("sources")}
          onTogglePrivacy={() => setPrivacy((value) => !value)}
          privacy={privacy}
          records={workspaceRecords}
          report={personalSummary}
          sourceLabel={sourceLabel}
          status={collectorStatus}
          updatedAt={displaySnapshot?.updatedAt ?? null}
        />
      )}
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: workspaceColors.canvas },
  appFrame: {
    flex: 1,
    width: "100%",
    maxWidth: Platform.OS === "web" ? 520 : undefined,
    alignSelf: "center",
    backgroundColor: colors.background,
  },
  header: {
    height: 64,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  brandMark: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.text,
  },
  headerCopy: { flex: 1, marginLeft: 11 },
  title: { color: colors.text, fontSize: 17, fontWeight: "800" },
  subtitle: { color: colors.secondaryText, fontSize: 12, marginTop: 2 },
  pressed: { opacity: 0.68 },
  disabled: { opacity: 0.48 },
  recordsList: { flex: 1 },
  recordsContent: { padding: 18, paddingBottom: 30 },
  scrollContent: { padding: 18, paddingBottom: 30 },
  sectionHeader: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  sectionHeaderCopy: { flex: 1, minWidth: 0, paddingRight: 12 },
  sectionTitle: { color: colors.text, fontSize: 22, fontWeight: "800" },
  sectionMeta: { color: colors.secondaryText, fontSize: 13, marginTop: 4 },
  recordTabs: {
    height: 54,
    flexDirection: "row",
    gap: 3,
    padding: 3,
    borderRadius: 8,
    backgroundColor: colors.inkSoft,
  },
  recordTab: {
    flex: 1,
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: 6,
  },
  recordTabActive: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  recordTabLabel: { color: colors.secondaryText, fontSize: 12, fontWeight: "700" },
  recordTabLabelActive: { color: colors.accent },
  sourceBand: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
    paddingLeft: 14,
    paddingRight: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  sourceBandCopy: { flex: 1, minWidth: 0, marginHorizontal: 11 },
  sourceBandTitle: { color: colors.text, fontSize: 14, fontWeight: "700" },
  sourceBandDetail: { color: colors.secondaryText, fontSize: 12, marginTop: 4 },
  iconButton: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 8 },
  recordSummary: {
    minHeight: 76,
    flexDirection: "row",
    marginTop: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  recordStat: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  recordStatBorder: { borderRightWidth: 1, borderRightColor: colors.border },
  recordStatValue: { color: colors.text, fontSize: 20, fontWeight: "800" },
  recordStatLabel: { color: colors.secondaryText, fontSize: 11, fontWeight: "700", marginTop: 3 },
  warningBand: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginTop: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.amberSoft,
  },
  warningText: { flex: 1, color: colors.amber, fontSize: 12, lineHeight: 18 },
  groupLabel: { color: colors.text, fontSize: 14, fontWeight: "800", marginTop: 24, marginBottom: 10 },
  emptyState: {
    minHeight: 230,
    marginTop: 14,
    paddingHorizontal: 22,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  emptyTitle: { color: colors.text, fontSize: 14, fontWeight: "700", marginTop: 12 },
  emptyDetail: { color: colors.secondaryText, fontSize: 12, lineHeight: 18, marginTop: 5, textAlign: "center" },
  primaryButton: {
    minWidth: 112,
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 20,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: colors.accent,
  },
  primaryButtonDisabled: { backgroundColor: colors.secondaryText },
  primaryButtonText: { color: colors.surface, fontSize: 13, fontWeight: "700" },
  recordRow: {
    minHeight: 78,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  recordRowPressed: { backgroundColor: colors.inkSoft },
  recordRowIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: colors.redSoft,
  },
  recordRowCopy: { flex: 1, minWidth: 0, marginHorizontal: 11 },
  recordRowTitle: { color: colors.text, fontSize: 14, fontWeight: "700", lineHeight: 19 },
  recordRowMeta: { color: colors.secondaryText, fontSize: 12, marginTop: 4 },
  collectorBand: {
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  bandHeading: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  bandIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E8F6F8",
  },
  bandHeadingCopy: { flex: 1, minWidth: 0, marginLeft: 11 },
  bandTitle: { color: colors.text, fontSize: 14, fontWeight: "700" },
  bandDetail: { color: colors.secondaryText, fontSize: 12, marginTop: 4 },
  inputLabel: { color: colors.secondaryText, fontSize: 12, fontWeight: "700", marginBottom: 6, marginTop: 10 },
  textInput: {
    width: "100%",
    height: 48,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    backgroundColor: colors.surface,
    fontSize: 16,
  },
  inputDisabled: { color: colors.secondaryText, backgroundColor: colors.inkSoft },
  codeInputWrap: {
    width: "100%",
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  codeInput: { flex: 1, height: 46, color: colors.text, fontSize: 16 },
  actionRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  flexButton: { flex: 1 },
  secondaryIconButton: {
    width: 48,
    height: 48,
    marginTop: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  sampleButton: {
    minWidth: 102,
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 20,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  sampleButtonText: { color: colors.secondaryText, fontSize: 12, fontWeight: "700" },
  accountSwitchButton: {
    width: "100%",
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  accountSwitchText: { color: colors.secondaryText, fontSize: 13, fontWeight: "700" },
  privacyNote: { color: colors.green, fontSize: 12, lineHeight: 18, marginTop: 12 },
  inlineError: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
    paddingHorizontal: 11,
    borderRadius: 8,
    backgroundColor: colors.redSoft,
  },
  inlineErrorText: { flex: 1, color: colors.accentPressed, fontSize: 12, lineHeight: 18 },
  archiveBand: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 14,
    paddingRight: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  archiveCopy: { flex: 1, minWidth: 0, marginHorizontal: 11 },
  tabBar: {
    height: 68,
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4 },
  tabLabel: { color: colors.mutedText, fontSize: 11, fontWeight: "700" },
  tabLabelActive: { color: colors.accent },
});
