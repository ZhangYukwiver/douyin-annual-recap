import React from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import {
  ArrowRight,
  Bookmark,
  Check,
  Database,
  Eye,
  FileArchive,
  Heart,
  History,
  Link2,
  LockKeyhole,
  Pause,
  Play,
  RefreshCw,
  Server,
  ShieldCheck,
  Trash2,
  Unplug,
  UserRoundCog,
} from "lucide-react-native";

import type { PersonalRecordCollection } from "../../domain/personalRecords";
import type { CollectorStatus } from "../../services/localCollector";
import { workspaceColors as color, workspaceRadii as radius } from "./workspaceTheme";

export interface SetupArchiveInfo {
  name: string;
  detail: string;
}

export interface SetupWorkspaceProps {
  collectorUrl: string;
  pairingCode: string;
  connected: boolean;
  busy: boolean;
  observing: boolean;
  stoppingSync: boolean;
  switchingAccount: boolean;
  status: CollectorStatus | null;
  error: string | null;
  records: PersonalRecordCollection;
  snapshotSource: "collector" | "archive" | null;
  snapshotUpdatedAt: string | null;
  archive: SetupArchiveInfo | null;
  pickingArchive: boolean;
  onChangeCollectorUrl: (value: string) => void;
  onChangePairingCode: (value: string) => void;
  onConnect: () => Promise<void>;
  onDisconnect: () => Promise<void>;
  onStartObservation: () => Promise<void>;
  onStopObservation: () => Promise<void>;
  onStartIncrementalSync: () => void;
  onStartFullSync: () => void;
  onStopSync: () => Promise<void>;
  onSwitchAccount: () => void;
  onClearCache: () => void;
  onPickArchive: () => Promise<void>;
  onEnterWorkspace: () => void;
  autoSyncEnabled: boolean;
  onToggleAutoSync: () => void;
}

const webPointer = Platform.OS === "web" ? ({ cursor: "pointer" } as object) : null;

export function SetupWorkspace({
  collectorUrl,
  pairingCode,
  connected,
  busy,
  observing,
  stoppingSync,
  switchingAccount,
  status,
  error,
  records,
  snapshotSource,
  snapshotUpdatedAt,
  archive,
  pickingArchive,
  onChangeCollectorUrl,
  onChangePairingCode,
  onConnect,
  onDisconnect,
  onStartObservation,
  onStopObservation,
  onStartIncrementalSync,
  onStartFullSync,
  onStopSync,
  onSwitchAccount,
  onClearCache,
  onPickArchive,
  onEnterWorkspace,
  autoSyncEnabled,
  onToggleAutoSync,
}: SetupWorkspaceProps) {
  const { width } = useWindowDimensions();
  const compact = width < 860;
  const phone = width < 560;
  const counts = {
    watch: records.watch_history.length,
    liked: records.liked_videos.length,
    favorite: records.favorite_videos.length,
  };
  const totalRecords = counts.watch + counts.liked + counts.favorite;
  const collectionReady = totalRecords > 0 || status?.state === "complete" || snapshotSource === "archive";
  const collectionActive = busy || status?.state === "collecting" || status?.state === "launching_browser";
  const syncActive = connected && !observing && (
    status?.state === "launching_browser"
    || status?.state === "awaiting_login"
    || status?.state === "collecting"
  );
  const sourceLabel = snapshotSource === "archive" ? "文件记录" : connected ? "本地采集器" : "尚未连接";
  const connectionDetail = connected
    ? status?.browserOpen
      ? "采集浏览器已打开"
      : "本地服务已连接"
    : "点击连接后自动获取配对码";

  return (
    <View testID="setup-workspace" style={styles.root}>
      <View style={[styles.topbar, phone && styles.topbarPhone]}>
        <Brand compact={phone} />
        <View style={styles.topbarStatus}>
          <View style={[styles.statusDot, connected && styles.statusDotReady]} />
          <Text numberOfLines={1} style={styles.topbarStatusText}>{sourceLabel}</Text>
        </View>
        <Pressable
          testID="enter-workspace"
          accessibilityRole="button"
          accessibilityLabel={collectionReady ? `进入内容库，共 ${totalRecords} 条记录` : "完成读取后进入内容库"}
          disabled={!collectionReady || busy}
          onPress={onEnterWorkspace}
          style={({ pressed }) => [
            styles.enterButton,
            (!collectionReady || busy) && styles.buttonDisabled,
            pressed && styles.buttonPressed,
            webPointer,
          ]}
        >
          <Text numberOfLines={1} style={styles.enterButtonText}>{phone ? "进入" : `进入内容库${totalRecords ? `  ${totalRecords}` : ""}`}</Text>
          <ArrowRight color={color.white} size={18} strokeWidth={2.2} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, compact && styles.scrollContentCompact]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.setupLayout, compact && styles.setupLayoutCompact]}>
          <View style={[styles.intro, compact && styles.introCompact]}>
            <View style={styles.introMark}>
              <Database color={color.black} size={23} strokeWidth={2.4} />
            </View>
            <Text style={styles.eyebrow}>LOCAL CONTENT ARCHIVE</Text>
            <Text style={[styles.introTitle, phone && styles.introTitlePhone]}>连接账号记录，建立你的内容档案。</Text>
            <Text style={styles.introMeta}>数据留在本机。连接由你主动触发，前台增量读取可随时暂停。</Text>

            <View style={[styles.steps, compact && styles.stepsCompact]}>
              <Step
                complete={connected || snapshotSource === "archive"}
                current={!connected && snapshotSource !== "archive"}
                index="01"
                label="连接数据源"
                detail={snapshotSource === "archive" ? "已选择备用文件" : connectionDetail}
              />
              <View style={[styles.stepLine, compact && styles.stepLineCompact]} />
              <Step
                complete={collectionReady}
                current={(connected || snapshotSource === "archive") && !collectionReady}
                index="02"
                label="读取内容记录"
                detail={collectionReady ? `已准备 ${totalRecords} 条记录` : "观看、喜欢与收藏"}
              />
            </View>

            <View style={styles.privacySeal}>
              <ShieldCheck color={color.green} size={18} strokeWidth={2} />
              <Text style={styles.privacySealText}>Cookie 与内容记录仅保存在当前设备</Text>
            </View>
          </View>

          <View style={styles.operations}>
            <OperationHeader
              index="01"
              title="连接数据源"
              meta={connected ? "已连接" : "本地采集器"}
              ready={connected}
            />

            <View style={[styles.connectionGrid, compact && styles.connectionGridCompact]}>
              <View style={styles.connectionCopy}>
                <View style={styles.iconTitleRow}>
                  <View style={[styles.sectionIcon, connected && styles.sectionIconReady]}>
                    <Server color={connected ? color.green : color.cyan} size={21} strokeWidth={2} />
                  </View>
                  <View style={styles.sectionIconCopy}>
                    <Text style={styles.operationTitle}>本地浏览器采集器</Text>
                    <Text style={styles.operationDetail}>{connectionDetail}</Text>
                  </View>
                </View>

                <Text style={styles.inputLabel}>服务地址</Text>
                <TextInput
                  accessibilityLabel="采集服务地址"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!connected && !busy}
                  onChangeText={onChangeCollectorUrl}
                  placeholder="http://127.0.0.1:4765"
                  placeholderTextColor={color.textMuted}
                  selectTextOnFocus
                  style={[styles.textInput, connected && styles.inputDisabled]}
                  value={collectorUrl}
                />

                {!connected ? (
                  <>
                    <Text style={styles.inputLabel}>配对码（自动获取）</Text>
                    <View style={styles.codeInputWrap}>
                      <LockKeyhole color={color.textMuted} size={18} strokeWidth={2} />
                      <TextInput
                        accessibilityLabel="8 位配对码"
                        autoCapitalize="none"
                        autoCorrect={false}
                        editable={!busy}
                        keyboardType="number-pad"
                        maxLength={8}
                        onChangeText={(value) => onChangePairingCode(value.replace(/\D/gu, ""))}
                        placeholder="点击连接后自动获取"
                        placeholderTextColor={color.textMuted}
                        style={styles.codeInput}
                        value={pairingCode}
                      />
                    </View>
                  </>
                ) : null}
              </View>

              <View style={styles.connectionAction}>
                <Text style={styles.actionKicker}>{connected ? "CONNECTION READY" : "AUTO PAIR LOCAL SERVICE"}</Text>
                <Text style={styles.actionValue}>{connected ? "连接正常" : "等待连接"}</Text>
                <Text style={styles.actionDetail}>{connected ? collectorUrl : "点击下方按钮，从当前电脑的采集器获取配对码并连接"}</Text>
                {connected ? (
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => void onDisconnect()}
                    style={({ pressed }) => [styles.outlineButton, busy && styles.buttonDisabled, pressed && styles.buttonPressed, webPointer]}
                  >
                    <Unplug color={color.textSecondary} size={18} strokeWidth={2} />
                    <Text style={styles.outlineButtonText}>断开连接</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => void onConnect()}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      busy && styles.buttonDisabled,
                      pressed && styles.buttonPressed,
                      webPointer,
                    ]}
                  >
                    {busy ? <ActivityIndicator color={color.white} size="small" /> : <Link2 color={color.white} size={18} strokeWidth={2.2} />}
                    <Text style={styles.primaryButtonText}>{busy ? "正在获取并连接" : "连接采集器"}</Text>
                  </Pressable>
                )}
              </View>
            </View>

            <View style={styles.sectionDivider} />

            <OperationHeader
              index="02"
              title="读取内容记录"
              meta={status?.message ?? (snapshotSource === "archive" ? "文件已就绪" : "等待连接")}
              ready={collectionReady}
            />

            <View style={styles.countBand}>
              <CountItem color={color.cyan} icon={History} label="观看历史" value={counts.watch} />
              <CountItem color={color.accent} icon={Heart} label="喜欢" value={counts.liked} />
              <CountItem color={color.amber} icon={Bookmark} label="收藏" value={counts.favorite} last />
            </View>

            {collectionActive || status?.state === "partial" || status?.state === "error" ? (
              <View
                accessibilityLiveRegion="polite"
                style={[
                  styles.progressBand,
                  status?.state === "error" && styles.progressBandError,
                ]}
              >
                {collectionActive ? <ActivityIndicator color={color.cyan} size="small" /> : <RefreshCw color={status?.state === "error" ? color.danger : color.amber} size={18} />}
                <View style={styles.progressCopy}>
                  <Text style={styles.progressTitle}>{status?.message ?? "正在准备采集"}</Text>
                  <Text style={styles.progressDetail}>{phaseLabel(status)}</Text>
                </View>
              </View>
            ) : null}

            <View style={[styles.collectionActions, phone && styles.collectionActionsPhone]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={syncActive ? "停止读取记录" : "增量读取记录"}
                disabled={syncActive ? stoppingSync : !connected || busy || observing}
                onPress={() => void (syncActive ? onStopSync() : onStartIncrementalSync())}
                style={({ pressed }) => [
                  styles.primaryButton,
                  styles.collectionPrimary,
                  syncActive && styles.stopButton,
                  (syncActive ? stoppingSync : !connected || busy || observing) && styles.buttonDisabled,
                  pressed && styles.buttonPressed,
                  webPointer,
                ]}
              >
                {stoppingSync ? (
                  <ActivityIndicator color={color.white} size="small" />
                ) : syncActive ? (
                  <Pause color={color.white} size={18} fill={color.white} />
                ) : busy ? (
                  <ActivityIndicator color={color.white} size="small" />
                ) : (
                  <Play color={color.white} size={18} fill={color.white} strokeWidth={2} />
                )}
                <Text style={styles.primaryButtonText}>
                  {stoppingSync ? "正在停止" : syncActive ? "停止读取" : busy ? "正在读取" : "增量读取"}
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                disabled={!connected || busy || observing}
                onPress={onStartFullSync}
                style={({ pressed }) => [styles.secondaryButton, (!connected || busy || observing) && styles.buttonDisabled, pressed && styles.buttonPressed, webPointer]}
              >
                <RefreshCw color={color.textSecondary} size={18} strokeWidth={2} />
                <Text style={styles.secondaryButtonText}>完整读取</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                disabled={!connected || busy}
                onPress={() => void (observing ? onStopObservation() : onStartObservation())}
                style={({ pressed }) => [styles.secondaryButton, (!connected || busy) && styles.buttonDisabled, pressed && styles.buttonPressed, webPointer]}
              >
                {observing ? <Pause color={color.textSecondary} size={18} fill={color.textSecondary} /> : <Eye color={color.textSecondary} size={18} />}
                <Text style={styles.secondaryButtonText}>{observing ? "停止监听" : "手动监听"}</Text>
              </Pressable>
            </View>

            {connected && snapshotSource !== "archive" ? (
              <Pressable
                accessibilityLabel={autoSyncEnabled ? "关闭前台自动增量读取" : "开启前台自动增量读取"}
                accessibilityRole="switch"
                accessibilityState={{ checked: autoSyncEnabled }}
                onPress={onToggleAutoSync}
                style={({ pressed }) => [styles.autoSyncRow, pressed && styles.buttonPressed, webPointer]}
              >
                <View style={[styles.autoSyncSwitch, autoSyncEnabled && styles.autoSyncSwitchActive]}>
                  <View style={[styles.autoSyncThumb, autoSyncEnabled && styles.autoSyncThumbActive]} />
                </View>
                <View style={styles.autoSyncCopy}>
                  <Text style={styles.autoSyncTitle}>前台自动增量读取</Text>
                  <Text style={styles.autoSyncDetail}>打开应用或回到前台时读取新记录；应用关闭后不会后台运行。</Text>
                </View>
                <Text style={[styles.autoSyncState, autoSyncEnabled && styles.autoSyncStateActive]}>{autoSyncEnabled ? "已开启" : "已暂停"}</Text>
              </Pressable>
            ) : null}

            <View style={styles.utilityRow}>
              <Pressable
                accessibilityRole="button"
                disabled={!connected || busy || switchingAccount}
                onPress={onSwitchAccount}
                style={({ pressed }) => [styles.utilityButton, (!connected || busy || switchingAccount) && styles.buttonDisabled, pressed && styles.buttonPressed, webPointer]}
              >
                {switchingAccount ? <ActivityIndicator color={color.textMuted} size="small" /> : <UserRoundCog color={color.textMuted} size={17} />}
                <Text style={styles.utilityButtonText}>切换账号</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={busy || totalRecords === 0}
                onPress={onClearCache}
                style={({ pressed }) => [styles.utilityButton, (busy || totalRecords === 0) && styles.buttonDisabled, pressed && styles.buttonPressed, webPointer]}
              >
                <Trash2 color={color.textMuted} size={17} />
                <Text style={styles.utilityButtonText}>清除本地记录</Text>
              </Pressable>
              <Text numberOfLines={1} style={styles.updatedText}>
                {snapshotUpdatedAt ? `更新于 ${formatDate(snapshotUpdatedAt)}` : "尚未生成本地快照"}
              </Text>
            </View>

            {error ? (
              <View accessibilityLiveRegion="assertive" style={styles.errorBand}>
                <Text style={styles.errorTitle}>连接失败</Text>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.sectionDivider} />

            <View style={[styles.archiveRow, phone && styles.archiveRowPhone]}>
              <View style={styles.archiveIcon}><FileArchive color={color.amber} size={20} /></View>
              <View style={styles.archiveCopy}>
                <Text style={styles.archiveTitle}>{archive?.name ?? "从 JSON / ZIP 导入"}</Text>
                <Text numberOfLines={2} style={styles.archiveDetail}>{archive?.detail ?? "本地采集暂不可用时，可读取已有个人档案"}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={archive ? "重新选择个人档案" : "选择个人档案"}
                disabled={pickingArchive}
                onPress={() => void onPickArchive()}
                style={({ pressed }) => [styles.archiveButton, pickingArchive && styles.buttonDisabled, pressed && styles.buttonPressed, webPointer]}
              >
                {pickingArchive ? <ActivityIndicator color={color.amber} size="small" /> : <FileArchive color={color.amber} size={18} />}
                <Text style={styles.archiveButtonText}>{archive ? "重新选择" : "选择文件"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function Brand({ compact }: { compact: boolean }) {
  return (
    <View style={styles.brand}>
      <View style={styles.brandMarkWrap}>
        <View style={styles.brandMarkCyan} />
        <View style={styles.brandMarkRed} />
        <View style={styles.brandMarkCore}><Play color={color.white} fill={color.white} size={12} /></View>
      </View>
      {!compact ? (
        <View>
          <Text style={styles.brandName}>足迹</Text>
          <Text style={styles.brandMeta}>内容档案</Text>
        </View>
      ) : null}
    </View>
  );
}

function Step({ complete, current, index, label, detail }: { complete: boolean; current: boolean; index: string; label: string; detail: string }) {
  return (
    <View style={styles.step}>
      <View style={[styles.stepIndex, complete && styles.stepIndexComplete, current && styles.stepIndexCurrent]}>
        {complete ? <Check color={color.black} size={16} strokeWidth={3} /> : <Text style={[styles.stepIndexText, current && styles.stepIndexTextCurrent]}>{index}</Text>}
      </View>
      <View style={styles.stepCopy}>
        <Text style={[styles.stepLabel, (complete || current) && styles.stepLabelActive]}>{label}</Text>
        <Text numberOfLines={2} style={styles.stepDetail}>{detail}</Text>
      </View>
    </View>
  );
}

function OperationHeader({ index, title, meta, ready }: { index: string; title: string; meta: string; ready: boolean }) {
  return (
    <View style={styles.operationHeader}>
      <Text style={styles.operationIndex}>{index}</Text>
      <View style={styles.operationHeaderCopy}>
        <Text style={styles.operationHeaderTitle}>{title}</Text>
        <Text numberOfLines={1} style={styles.operationHeaderMeta}>{meta}</Text>
      </View>
      <View style={[styles.readyBadge, ready && styles.readyBadgeActive]}>
        {ready ? <Check color={color.green} size={14} strokeWidth={2.6} /> : null}
        <Text style={[styles.readyBadgeText, ready && styles.readyBadgeTextActive]}>{ready ? "已就绪" : "待完成"}</Text>
      </View>
    </View>
  );
}

function CountItem({ color: accent, icon: Icon, label, value, last = false }: { color: string; icon: typeof History; label: string; value: number; last?: boolean }) {
  return (
    <View style={[styles.countItem, last && styles.countItemLast]}>
      <Icon color={accent} size={19} strokeWidth={2} />
      <View style={styles.countCopy}>
        <Text style={styles.countValue}>{value.toLocaleString("zh-CN")}</Text>
        <Text style={styles.countLabel}>{label}</Text>
      </View>
    </View>
  );
}

function phaseLabel(status: CollectorStatus | null): string {
  if (!status?.phase) return "采集状态会在这里更新";
  return ({ watch_history: "正在读取观看历史", liked_videos: "正在读取喜欢", favorite_videos: "正在读取收藏" })[status.phase];
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: "100%", backgroundColor: color.canvas },
  topbar: {
    height: 72,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 28,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border,
    backgroundColor: color.sidebar,
  },
  topbarPhone: { height: 64, paddingHorizontal: 16 },
  brand: { flexDirection: "row", alignItems: "center", minWidth: 140, gap: 11 },
  brandMarkWrap: { width: 38, height: 38, position: "relative", alignItems: "center", justifyContent: "center" },
  brandMarkCyan: { position: "absolute", width: 26, height: 26, left: 3, top: 4, borderRadius: 7, backgroundColor: color.cyan },
  brandMarkRed: { position: "absolute", width: 26, height: 26, right: 3, bottom: 4, borderRadius: 7, backgroundColor: color.accent },
  brandMarkCore: { width: 26, height: 26, zIndex: 2, alignItems: "center", justifyContent: "center", borderRadius: 7, backgroundColor: color.black },
  brandName: { color: color.text, fontSize: 16, fontWeight: "900" },
  brandMeta: { color: color.textMuted, fontSize: 10, marginTop: 1 },
  topbarStatus: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, minWidth: 0, paddingHorizontal: 8 },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: color.textMuted },
  statusDotReady: { backgroundColor: color.green },
  topbarStatusText: { color: color.textSecondary, fontSize: 12, fontWeight: "700" },
  enterButton: { minWidth: 132, height: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 16, borderRadius: radius.medium, backgroundColor: color.accentAction },
  enterButtonText: { color: color.white, fontSize: 13, fontWeight: "800" },
  scrollContent: { flexGrow: 1, padding: 32 },
  scrollContentCompact: { padding: 0 },
  setupLayout: { width: "100%", maxWidth: 1320, alignSelf: "center", flexDirection: "row", borderWidth: 1, borderColor: color.borderSoft, backgroundColor: color.sidebar },
  setupLayoutCompact: { flexDirection: "column", borderWidth: 0 },
  intro: { width: 334, paddingHorizontal: 36, paddingVertical: 42, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: color.border },
  introCompact: { width: "100%", paddingHorizontal: 24, paddingVertical: 32, borderRightWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.border },
  introMark: { width: 46, height: 46, alignItems: "center", justifyContent: "center", borderRadius: radius.large, backgroundColor: color.cyan },
  eyebrow: { color: color.cyan, fontSize: 10, fontWeight: "900", marginTop: 24 },
  introTitle: { color: color.text, fontSize: 30, lineHeight: 40, fontWeight: "900", marginTop: 9 },
  introTitlePhone: { fontSize: 25, lineHeight: 34 },
  introMeta: { color: color.textSecondary, fontSize: 13, lineHeight: 21, marginTop: 15 },
  steps: { marginTop: 42 },
  stepsCompact: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginTop: 28 },
  step: { minHeight: 48, flexDirection: "row", alignItems: "flex-start", gap: 12, flex: 1 },
  stepIndex: { width: 34, height: 34, flexShrink: 0, alignItems: "center", justifyContent: "center", borderRadius: 17, borderWidth: 1, borderColor: color.border, backgroundColor: color.surface },
  stepIndexCurrent: { borderColor: color.cyan, backgroundColor: color.cyanSoft },
  stepIndexComplete: { borderColor: color.green, backgroundColor: color.green },
  stepIndexText: { color: color.textMuted, fontSize: 10, fontWeight: "900" },
  stepIndexTextCurrent: { color: color.cyan },
  stepCopy: { flex: 1, minWidth: 0, paddingTop: 1 },
  stepLabel: { color: color.textMuted, fontSize: 13, fontWeight: "800" },
  stepLabelActive: { color: color.text },
  stepDetail: { color: color.textMuted, fontSize: 11, lineHeight: 16, marginTop: 4 },
  stepLine: { width: 1, height: 24, marginLeft: 16, marginVertical: 7, backgroundColor: color.border },
  stepLineCompact: { width: 22, height: 1, marginLeft: 0, marginTop: 17, marginVertical: 0 },
  privacySeal: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 44, paddingTop: 18, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border },
  privacySealText: { flex: 1, color: color.textMuted, fontSize: 11, lineHeight: 17 },
  operations: { flex: 1, minWidth: 0, paddingHorizontal: 36, paddingVertical: 34 },
  operationHeader: { minHeight: 44, flexDirection: "row", alignItems: "flex-start" },
  operationIndex: { width: 38, color: color.cyan, fontSize: 11, lineHeight: 20, fontWeight: "900" },
  operationHeaderCopy: { flex: 1, minWidth: 0 },
  operationHeaderTitle: { color: color.text, fontSize: 18, lineHeight: 24, fontWeight: "900" },
  operationHeaderMeta: { color: color.textMuted, fontSize: 11, marginTop: 3 },
  readyBadge: { minHeight: 28, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, borderWidth: 1, borderColor: color.border, borderRadius: radius.small, backgroundColor: color.surface },
  readyBadgeActive: { borderColor: color.green, backgroundColor: color.greenSoft },
  readyBadgeText: { color: color.textMuted, fontSize: 10, fontWeight: "800" },
  readyBadgeTextActive: { color: color.green },
  connectionGrid: { flexDirection: "row", gap: 22, marginTop: 18 },
  connectionGridCompact: { flexDirection: "column" },
  connectionCopy: { flex: 1.25, minWidth: 0 },
  connectionAction: { flex: 0.75, minWidth: 230, justifyContent: "flex-end", padding: 18, borderLeftWidth: 3, borderLeftColor: color.cyan, backgroundColor: color.surface },
  iconTitleRow: { minHeight: 46, flexDirection: "row", alignItems: "center", marginBottom: 16 },
  sectionIcon: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: radius.medium, backgroundColor: color.cyanSoft },
  sectionIconReady: { backgroundColor: color.greenSoft },
  sectionIconCopy: { flex: 1, minWidth: 0, marginLeft: 12 },
  operationTitle: { color: color.text, fontSize: 14, fontWeight: "800" },
  operationDetail: { color: color.textMuted, fontSize: 11, marginTop: 4 },
  inputLabel: { color: color.textSecondary, fontSize: 11, fontWeight: "700", marginTop: 11, marginBottom: 7 },
  textInput: { width: "100%", height: 48, paddingHorizontal: 13, borderWidth: 1, borderColor: color.border, borderRadius: radius.medium, color: color.text, backgroundColor: color.canvas, fontSize: 16, fontFamily: Platform.OS === "web" ? "Arial, 'Microsoft YaHei', sans-serif" : undefined },
  inputDisabled: { color: color.textMuted, backgroundColor: color.surfaceMuted },
  codeInputWrap: { width: "100%", height: 48, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 13, borderWidth: 1, borderColor: color.border, borderRadius: radius.medium, backgroundColor: color.canvas },
  codeInput: { flex: 1, height: 46, color: color.text, fontSize: 17, fontWeight: "700", letterSpacing: 0, fontFamily: Platform.OS === "web" ? "Arial, 'Microsoft YaHei', sans-serif" : undefined },
  actionKicker: { color: color.cyan, fontSize: 9, fontWeight: "900" },
  actionValue: { color: color.text, fontSize: 23, fontWeight: "900", marginTop: 6 },
  actionDetail: { color: color.textMuted, fontSize: 11, lineHeight: 17, marginTop: 7, marginBottom: 18 },
  primaryButton: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 16, borderRadius: radius.medium, backgroundColor: color.accentAction },
  primaryButtonText: { color: color.white, fontSize: 13, fontWeight: "800" },
  outlineButton: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 16, borderWidth: 1, borderColor: color.border, borderRadius: radius.medium },
  outlineButtonText: { color: color.textSecondary, fontSize: 13, fontWeight: "800" },
  sectionDivider: { height: 1, marginVertical: 32, backgroundColor: color.border },
  countBand: { minHeight: 82, flexDirection: "row", marginTop: 18, borderTopWidth: 1, borderBottomWidth: 1, borderColor: color.border },
  countItem: { flex: 1, flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 14, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: color.border },
  countItemLast: { borderRightWidth: 0 },
  countCopy: { minWidth: 0 },
  countValue: { color: color.text, fontSize: 20, fontWeight: "900", fontVariant: ["tabular-nums"] },
  countLabel: { color: color.textMuted, fontSize: 10, fontWeight: "700", marginTop: 3 },
  progressBand: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: 12, marginTop: 16, paddingHorizontal: 15, borderLeftWidth: 3, borderLeftColor: color.cyan, backgroundColor: color.cyanSoft },
  progressBandError: { borderLeftColor: color.danger, backgroundColor: color.accentSoft },
  progressCopy: { flex: 1, minWidth: 0 },
  progressTitle: { color: color.text, fontSize: 12, fontWeight: "800" },
  progressDetail: { color: color.textMuted, fontSize: 10, marginTop: 4 },
  collectionActions: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginTop: 18 },
  collectionActionsPhone: { flexDirection: "column" },
  collectionPrimary: { minWidth: 174 },
  autoSyncRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: color.border, borderRadius: radius.medium, backgroundColor: color.surface },
  autoSyncSwitch: { width: 34, height: 20, justifyContent: "center", paddingHorizontal: 2, borderRadius: 10, backgroundColor: color.surfaceMuted },
  autoSyncSwitchActive: { backgroundColor: color.green },
  autoSyncThumb: { width: 16, height: 16, borderRadius: 8, backgroundColor: color.textMuted },
  autoSyncThumbActive: { alignSelf: "flex-end", backgroundColor: color.white },
  autoSyncCopy: { flex: 1, minWidth: 0 },
  autoSyncTitle: { color: color.textSecondary, fontSize: 11, fontWeight: "800" },
  autoSyncDetail: { color: color.textMuted, fontSize: 9, lineHeight: 14, marginTop: 3 },
  autoSyncState: { color: color.textMuted, fontSize: 9, fontWeight: "900" },
  autoSyncStateActive: { color: color.green },
  stopButton: { backgroundColor: color.danger },
  secondaryButton: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingHorizontal: 14, borderWidth: 1, borderColor: color.border, borderRadius: radius.medium, backgroundColor: color.surface },
  secondaryButtonText: { color: color.textSecondary, fontSize: 12, fontWeight: "800" },
  utilityRow: { minHeight: 48, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4, marginTop: 10 },
  utilityButton: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, borderRadius: radius.small },
  utilityButtonText: { color: color.textMuted, fontSize: 11, fontWeight: "700" },
  updatedText: { flex: 1, minWidth: 150, color: color.textMuted, fontSize: 10, textAlign: "right" },
  errorBand: { marginTop: 12, padding: 13, borderLeftWidth: 3, borderLeftColor: color.danger, backgroundColor: color.accentSoft },
  errorTitle: { color: color.danger, fontSize: 11, fontWeight: "900" },
  errorText: { color: color.textSecondary, fontSize: 11, lineHeight: 17, marginTop: 4 },
  archiveRow: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: 12 },
  archiveRowPhone: { flexWrap: "wrap" },
  archiveIcon: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: radius.medium, backgroundColor: color.amberSoft },
  archiveCopy: { flex: 1, minWidth: 190 },
  archiveTitle: { color: color.text, fontSize: 13, fontWeight: "800" },
  archiveDetail: { color: color.textMuted, fontSize: 10, lineHeight: 16, marginTop: 4 },
  archiveButton: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingHorizontal: 13, borderWidth: 1, borderColor: color.border, borderRadius: radius.medium, backgroundColor: color.surface },
  archiveButtonText: { color: color.amber, fontSize: 11, fontWeight: "800" },
  buttonPressed: { opacity: 0.72 },
  buttonDisabled: { opacity: 0.38 },
});
