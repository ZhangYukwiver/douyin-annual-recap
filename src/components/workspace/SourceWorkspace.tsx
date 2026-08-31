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
  History,
  Link2,
  LockKeyhole,
  MessageCircle,
  Pause,
  Play,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Trash2,
  Unplug,
  UserRoundCog,
} from "lucide-react-native";

import type { PersonalRecordCollection } from "../../domain/personalRecords";
import type { CollectorStatus } from "../../services/localCollector";
import { workspaceColors as color } from "./workspaceTheme";

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
  onStartChatObservation: () => Promise<void>;
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

const pointer = Platform.OS === "web" ? ({ cursor: "pointer" } as object) : null;
const serif = Platform.OS === "web" ? "Georgia, 'Songti SC', serif" : undefined;

export function SetupWorkspace({
  archive,
  autoSyncEnabled,
  busy,
  collectorUrl,
  connected,
  error,
  onChangeCollectorUrl,
  onChangePairingCode,
  onClearCache,
  onConnect,
  onDisconnect,
  onEnterWorkspace,
  onPickArchive,
  onStartChatObservation,
  onStartFullSync,
  onStartIncrementalSync,
  onStartObservation,
  onStopObservation,
  onStopSync,
  onSwitchAccount,
  onToggleAutoSync,
  observing,
  pairingCode,
  pickingArchive,
  records,
  snapshotSource,
  snapshotUpdatedAt,
  status,
  stoppingSync,
  switchingAccount,
}: SetupWorkspaceProps) {
  const { width } = useWindowDimensions();
  const mobile = width < 900;
  const phone = width < 560;
  const counts = { watch: records.watch_history.length, liked: records.liked_videos.length, favorite: records.favorite_videos.length, chat: status?.counts.chat_messages ?? 0 };
  const total = counts.watch + counts.liked + counts.favorite + counts.chat;
  const ready = total > 0 || status?.state === "complete" || snapshotSource === "archive";
  const syncing = connected && !observing && ["launching_browser", "awaiting_login", "collecting"].includes(status?.state ?? "");
  const chatCollecting = status?.phase === "chat_messages"
    && ["launching_browser", "observing", "collecting"].includes(status.state);
  const chatProgress = chatCollecting ? status?.progress : null;
  const source = snapshotSource === "archive" ? "备用文件导入" : connected ? "本地采集器" : "尚未连接";

  return (
    <View testID="setup-workspace" style={styles.root}>
      <View style={[styles.topbar, phone && styles.topbarPhone]}>
        <View style={styles.brand}><View style={styles.brandSeal}><Database color="#C5A161" size={19} /></View><View><Text style={styles.brandName}>内容宇宙</Text><Text style={styles.brandMeta}>LOCAL OBSERVATORY</Text></View></View>
        <View style={styles.topStatus}><View style={[styles.statusDot, connected && styles.statusDotReady]} /><Text numberOfLines={1} style={styles.statusText}>{source}</Text></View>
        <Pressable accessibilityRole="button" disabled={!ready || busy} onPress={onEnterWorkspace} style={({ pressed }) => [styles.enter, (!ready || busy) && styles.disabled, pressed && styles.pressed, pointer]}><Text style={styles.enterText}>{phone ? "进入" : "打开报告"}</Text><ArrowRight color="#1D1A16" size={17} /></Pressable>
      </View>

      <ScrollView contentContainerStyle={[styles.scrollContent, mobile && styles.scrollContentMobile]} showsVerticalScrollIndicator={false}>
        <View style={[styles.layout, mobile && styles.layoutMobile]}>
          <View style={[styles.intro, mobile && styles.introMobile]}>
            <Text style={styles.eyebrow}>OBSERVATION DOSSIER · 01</Text>
            <Text style={[styles.title, phone && styles.titlePhone]}>先建立证据，{phone ? "\n" : ""}再打开你的内容宇宙。</Text>
            <Text style={styles.lead}>连接本地采集器，或导入一份个人档案。数据只留在这台设备上。</Text>
            <View style={styles.seal}><ShieldCheck color="#C5A161" size={31} strokeWidth={1.2} /><Text style={styles.sealText}>LOCAL · PRIVATE</Text><Text style={styles.sealYear}>{new Date().getFullYear()}</Text></View>
            <View style={styles.steps}><Step index="01" label="连接数据源" detail={connected ? "本地服务已连接" : "点击连接后自动获取配对码"} done={connected} /><Step index="02" label="读取内容记录" detail={total ? `${total.toLocaleString("zh-CN")} 条记录已准备` : "观看、喜欢与收藏"} done={ready} /></View>
          </View>

          <View style={styles.operations}>
            <View style={styles.operationHead}><View><Text style={styles.operationKicker}>CURRENT SAMPLE</Text><Text style={styles.operationTitle}>{connected ? "采集器已就绪" : "等待连接数据源"}</Text><Text style={styles.operationMeta}>{status?.message ?? "所有操作均在本机执行"}</Text></View><View style={[styles.readyPill, ready && styles.readyPillReady]}><View style={[styles.readyDot, ready && styles.statusDotReady]} /><Text style={styles.readyText}>{ready ? "已就绪" : "待完成"}</Text></View></View>

            <ChatProgress progress={chatProgress} />

            <View style={[styles.connection, mobile && styles.connectionMobile]}>
              <View style={styles.connectionCopy}><View style={styles.iconTitle}><View style={styles.iconBox}><Link2 color="#70C3BF" size={19} /></View><View><Text style={styles.cardTitle}>本地采集器</Text><Text style={styles.cardMeta}>专用浏览器会话 · 不上传云端</Text></View></View><Text style={styles.inputLabel}>服务地址</Text><TextInput accessibilityLabel="采集服务地址" autoCapitalize="none" autoCorrect={false} editable={!connected && !busy} onChangeText={onChangeCollectorUrl} placeholder="http://127.0.0.1:4765" placeholderTextColor="#6D716F" style={[styles.input, connected && styles.inputDisabled]} value={collectorUrl} />{!connected ? <><Text style={styles.inputLabel}>配对码（自动获取）</Text><View style={styles.codeWrap}><LockKeyhole color="#8C938F" size={17} /><TextInput accessibilityLabel="8 位配对码" editable={!busy} keyboardType="number-pad" maxLength={8} onChangeText={(value) => onChangePairingCode(value.replace(/\D/gu, ""))} placeholder="点击连接后自动获取" placeholderTextColor="#6D716F" style={styles.codeInput} value={pairingCode} /></View></> : null}</View>
              <View style={styles.connectionAction}><Text style={styles.actionKicker}>{connected ? "CONNECTION READY" : "AUTO PAIR LOCAL SERVICE"}</Text><Text style={styles.actionValue}>{connected ? "连接正常" : "等待连接"}</Text><Text style={styles.actionMeta}>{connected ? collectorUrl : "连接后会读取现有本地快照，不会自动上传。"}</Text><Pressable accessibilityRole="button" disabled={busy} onPress={() => void (connected ? onDisconnect() : onConnect())} style={({ pressed }) => [styles.primary, busy && styles.disabled, pressed && styles.pressed, pointer]}>{busy ? <ActivityIndicator color="#1D1A16" size="small" /> : connected ? <Unplug color="#1D1A16" size={17} /> : <Link2 color="#1D1A16" size={17} />}<Text style={styles.primaryText}>{connected ? "断开连接" : "连接采集器"}</Text></Pressable></View>
            </View>

            <View style={styles.dataCard}><View style={styles.dataHead}><View><Text style={styles.cardKicker}>02 · CONTENT RECORDS</Text><Text style={styles.cardTitle}>读取内容记录</Text></View><Text style={styles.updated}>{snapshotUpdatedAt ? `更新于 ${formatDate(snapshotUpdatedAt)}` : "尚未生成快照"}</Text></View><View style={[styles.counts, mobile && styles.countsMobile]}><Count label="观看历史" value={counts.watch} icon={History} /><Count label="喜欢" value={counts.liked} icon={Play} /><Count label="收藏" value={counts.favorite} icon={BookmarkIcon} /><Count label="聊天" value={counts.chat} icon={MessageCircle} /></View><View style={[styles.actionGrid, mobile && styles.actionGridMobile]}><ActionButton disabled={!connected || busy || observing} icon={Play} label={syncing ? "正在读取" : "增量读取"} onPress={syncing ? () => void onStopSync() : onStartIncrementalSync} busy={syncing ? stoppingSync : busy && !observing} /><ActionButton disabled={!connected || busy || observing} icon={RefreshCw} label="完整读取" onPress={onStartFullSync} /><ActionButton disabled={!connected || busy} icon={observing ? Pause : Eye} label={observing ? "停止监听" : "手动监听"} onPress={() => void (observing ? onStopObservation() : onStartObservation())} /><ActionButton disabled={!connected || (!chatCollecting && busy) || (observing && !chatCollecting)} icon={chatCollecting ? Pause : MessageCircle} label={chatCollecting ? "取消读取" : "读取聊天"} onPress={() => void (chatCollecting ? onStopObservation() : onStartChatObservation())} /></View><Text style={styles.chatPolicy}>聊天只在应用首次启动并连接采集器时、以及你手动点击“读取聊天”时各采集一轮，完成后自动停止，不会持续监听。群聊只保存群名、消息总数和你发出的数量，好友对话保存已读取的完整内容。</Text><Pressable accessibilityRole="switch" accessibilityState={{ checked: autoSyncEnabled }} onPress={onToggleAutoSync} style={({ pressed }) => [styles.autoSync, pressed && styles.pressed, pointer]}><View style={[styles.switch, autoSyncEnabled && styles.switchOn]}><View style={[styles.switchThumb, autoSyncEnabled && styles.switchThumbOn]} /></View><View style={styles.flex}><Text style={styles.autoTitle}>前台自动增量读取（仅视频记录）</Text><Text style={styles.autoMeta}>回到前台时读取新视频记录，应用关闭后不会后台运行，也不会读取聊天。</Text></View><Text style={[styles.autoState, autoSyncEnabled && styles.autoStateOn]}>{autoSyncEnabled ? "已开启" : "已暂停"}</Text></Pressable>{error ? <View style={styles.error}><Text style={styles.errorTitle}>连接或读取失败</Text><Text style={styles.errorText}>{error}</Text></View> : null}</View>

            <View style={[styles.archive, mobile && styles.archiveMobile]}><View style={styles.archiveIcon}><FileArchive color="#C5A161" size={20} /></View><View style={styles.flex}><Text style={styles.cardTitle}>{archive?.name ?? "备用档案导入"}</Text><Text numberOfLines={2} style={styles.cardMeta}>{archive?.detail ?? "读取 JSON / ZIP；仅在当前会话处理"}</Text></View><Pressable accessibilityRole="button" disabled={pickingArchive} onPress={() => void onPickArchive()} style={({ pressed }) => [styles.archiveButton, pickingArchive && styles.disabled, pressed && styles.pressed, pointer]}>{pickingArchive ? <ActivityIndicator color="#C5A161" size="small" /> : <FileArchive color="#C5A161" size={17} />}<Text style={styles.archiveButtonText}>{archive ? "重新选择" : "选择文件"}</Text></Pressable></View>

            <View style={styles.utility}><Pressable disabled={!connected || busy || switchingAccount} onPress={onSwitchAccount} style={({ pressed }) => [styles.utilityButton, pressed && styles.pressed, pointer]}><UserRoundCog color="#8B867C" size={16} /><Text style={styles.utilityText}>切换账号</Text></Pressable><Pressable disabled={!total || busy} onPress={onClearCache} style={({ pressed }) => [styles.utilityButton, pressed && styles.pressed, pointer]}><Trash2 color="#8B867C" size={16} /><Text style={styles.utilityText}>清除本地记录</Text></Pressable><Text style={styles.utilityNote}>Cookie 与记录只保存在当前设备</Text></View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function ChatProgress({ progress }: { progress: CollectorStatus["progress"] }) {
  if (!progress) return null;
  const percent = progress.total > 0
    ? Math.min(100, Math.round((progress.current / progress.total) * 100))
    : 0;
  return (
    <View
      accessibilityLabel="聊天全量读取进度"
      accessibilityRole="progressbar"
      accessibilityValue={progress.total > 0 ? { min: 0, max: progress.total, now: progress.current } : undefined}
      style={chatProgressStyles.container}
    >
      <View style={chatProgressStyles.head}>
        <Text style={chatProgressStyles.label}>聊天全量读取</Text>
        <Text style={chatProgressStyles.value}>
          {progress.total > 0 ? `会话 ${progress.current}/${progress.total}` : "正在读取会话列表"}
        </Text>
      </View>
      <View style={chatProgressStyles.track}>
        {progress.total > 0
          ? <View style={[chatProgressStyles.fill, { width: `${percent}%` }]} />
          : <View style={[chatProgressStyles.fill, { width: "35%" }]} />}
      </View>
    </View>
  );
}

const chatProgressStyles = StyleSheet.create({
  container: { marginTop: 12, padding: 11, borderWidth: 1, borderColor: "#28504E", backgroundColor: "#101B1B" },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label: { color: "#A9D0CD", fontSize: 10, fontWeight: "800" },
  value: { color: "#70C3BF", fontSize: 10, fontWeight: "800" },
  track: { height: 5, justifyContent: "center", marginTop: 9, overflow: "hidden", backgroundColor: "#263E3D" },
  fill: { height: "100%", backgroundColor: "#70C3BF" },
});

function Step({ done, detail, index, label }: { done: boolean; detail: string; index: string; label: string }) { return <View style={styles.step}><View style={[styles.stepIndex, done && styles.stepIndexDone]}>{done ? <Check color="#1D1A16" size={14} strokeWidth={3} /> : <Text style={styles.stepIndexText}>{index}</Text>}</View><View style={styles.flex}><Text style={styles.stepLabel}>{label}</Text><Text style={styles.stepDetail}>{detail}</Text></View></View>; }
function Count({ icon: CountIcon, label, value }: { icon: React.ComponentType<{ color?: string; size?: number }>; label: string; value: number }) { return <View style={styles.count}><CountIcon color="#C5A161" size={18} /><View><Text style={styles.countValue}>{value.toLocaleString("zh-CN")}</Text><Text style={styles.countLabel}>{label}</Text></View></View>; }
function ActionButton({ busy, disabled, icon: ActionIcon, label, onPress }: { busy?: boolean; disabled: boolean; icon: React.ComponentType<{ color?: string; size?: number }>; label: string; onPress: () => void }) { return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.action, disabled && styles.disabled, pressed && styles.pressed, pointer]}>{busy ? <ActivityIndicator color="#C5A161" size="small" /> : <ActionIcon color="#A9A39A" size={17} />}<Text style={styles.actionText}>{label}</Text></Pressable>; }
function BookmarkIcon({ color: iconColor, size }: { color?: string; size?: number }) { return <Bookmark color={iconColor} size={size} />; }
function formatDate(value: string): string { const date = new Date(value); return Number.isFinite(date.getTime()) ? date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }) : value; }

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: "100%", backgroundColor: "#090A0C" }, flex: { flex: 1, minWidth: 0 },
  topbar: { height: 70, flexDirection: "row", alignItems: "center", paddingHorizontal: 22, borderBottomWidth: 1, borderBottomColor: "#2A2824", backgroundColor: "#0D0E11" }, topbarPhone: { height: 64, paddingHorizontal: 14 },
  brand: { minWidth: 195, flexDirection: "row", alignItems: "center", gap: 10 }, brandSeal: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#7D6438", borderRadius: 19 }, brandName: { color: "#F1EBDD", fontSize: 15, fontWeight: "800" }, brandMeta: { color: "#8E877B", fontSize: 8, letterSpacing: 1.2, marginTop: 2 },
  topStatus: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 }, statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#756D61" }, statusDotReady: { backgroundColor: "#70C3BF" }, statusText: { color: "#969087", fontSize: 11 },
  enter: { minWidth: 120, minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 15, backgroundColor: "#E6DFD0" }, enterText: { color: "#211E19", fontSize: 12, fontWeight: "800" },
  scrollContent: { flexGrow: 1, padding: 32 }, scrollContentMobile: { padding: 14, paddingBottom: 30 }, layout: { width: "100%", maxWidth: 1380, alignSelf: "center", flexDirection: "row", borderWidth: 1, borderColor: "#302D28", backgroundColor: "#0E1012" }, layoutMobile: { flexDirection: "column", borderWidth: 0 },
  intro: { width: 330, padding: 34, borderRightWidth: 1, borderRightColor: "#302D28" }, introMobile: { width: "100%" }, eyebrow: { color: "#70C3BF", fontSize: 9, letterSpacing: 1.3, fontWeight: "900" }, title: { color: "#F1E9DA", fontSize: 31, lineHeight: 42, marginTop: 18, fontFamily: serif }, titlePhone: { fontSize: 27, lineHeight: 36 }, lead: { color: "#969087", fontSize: 12, lineHeight: 20, marginTop: 15 }, seal: { width: 156, height: 156, alignItems: "center", justifyContent: "center", marginTop: 44, borderRadius: 78, borderWidth: 1, borderColor: "#6D5836", backgroundColor: "#12120F" }, sealText: { color: "#B9975C", fontSize: 8, letterSpacing: 1.1, marginTop: 8 }, sealYear: { color: "#80715A", fontSize: 10, marginTop: 3 }, steps: { gap: 16, marginTop: 44, paddingTop: 21, borderTopWidth: 1, borderTopColor: "#302D28" }, step: { flexDirection: "row", gap: 11 }, stepIndex: { width: 28, height: 28, alignItems: "center", justifyContent: "center", borderRadius: 14, borderWidth: 1, borderColor: "#3E3A32" }, stepIndexDone: { borderColor: "#70C3BF", backgroundColor: "#70C3BF" }, stepIndexText: { color: "#847C70", fontSize: 9 }, stepLabel: { color: "#D8D0C2", fontSize: 11, fontWeight: "800" }, stepDetail: { color: "#777067", fontSize: 10, lineHeight: 15, marginTop: 3 },
  operations: { flex: 1, minWidth: 0, padding: 34 }, operationHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }, operationKicker: { color: "#70C3BF", fontSize: 8, letterSpacing: 1.2, fontWeight: "900" }, operationTitle: { color: "#E8E1D3", fontSize: 21, marginTop: 6, fontFamily: serif }, operationMeta: { color: "#817A70", fontSize: 10, marginTop: 4 }, readyPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: "#3D3932" }, readyPillReady: { borderColor: "#3F7773", backgroundColor: "#142726" }, readyDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#766D62" }, readyText: { color: "#969087", fontSize: 9 },
  connection: { flexDirection: "row", gap: 18, marginTop: 23 }, connectionMobile: { flexDirection: "column" }, connectionCopy: { flex: 1.15 }, connectionAction: { flex: 0.85, minWidth: 230, justifyContent: "flex-end", padding: 18, borderLeftWidth: 3, borderLeftColor: "#70C3BF", backgroundColor: "#15191A" }, iconTitle: { minHeight: 43, flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 14 }, iconBox: { width: 39, height: 39, alignItems: "center", justifyContent: "center", borderRadius: 20, backgroundColor: "#153131" }, cardTitle: { color: "#E5DED0", fontSize: 13, fontWeight: "800" }, cardMeta: { color: "#807A72", fontSize: 10, lineHeight: 16, marginTop: 3 }, inputLabel: { color: "#9B948A", fontSize: 10, fontWeight: "700", marginBottom: 6, marginTop: 8 }, input: { width: "100%", height: 44, paddingHorizontal: 12, borderWidth: 1, borderColor: "#363A3A", color: "#E8E1D3", backgroundColor: "#0B0D0F", fontSize: 14 }, inputDisabled: { color: "#777067", backgroundColor: "#17191A" }, codeWrap: { height: 44, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 12, borderWidth: 1, borderColor: "#363A3A", backgroundColor: "#0B0D0F" }, codeInput: { flex: 1, color: "#E8E1D3", fontSize: 15 }, actionKicker: { color: "#70C3BF", fontSize: 8, letterSpacing: 1.1, fontWeight: "900" }, actionValue: { color: "#E5DED0", fontSize: 23, marginTop: 7, fontFamily: serif }, actionMeta: { color: "#817A70", fontSize: 10, lineHeight: 16, marginTop: 6, marginBottom: 14 }, primary: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#E6DFD0" }, primaryText: { color: "#211E19", fontSize: 11, fontWeight: "800" },
  dataCard: { marginTop: 24, paddingTop: 22, borderTopWidth: 1, borderTopColor: "#302D28" }, dataHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }, cardKicker: { color: "#70C3BF", fontSize: 8, letterSpacing: 1.1, fontWeight: "900" }, updated: { color: "#716B63", fontSize: 9 }, counts: { flexDirection: "row", marginTop: 16, borderWidth: 1, borderColor: "#302D28" }, countsMobile: { flexWrap: "wrap" }, count: { flex: 1, minWidth: 128, minHeight: 72, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 13, borderRightWidth: 1, borderRightColor: "#302D28" }, countValue: { color: "#E5DED0", fontSize: 21, fontFamily: serif }, countLabel: { color: "#817A70", fontSize: 9, marginTop: 3 }, actionGrid: { flexDirection: "row", gap: 7, marginTop: 14 }, actionGridMobile: { flexWrap: "wrap" }, action: { flex: 1, minWidth: 122, minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderWidth: 1, borderColor: "#343532", backgroundColor: "#151719" }, actionText: { color: "#A9A39A", fontSize: 10, fontWeight: "700" }, autoSync: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14, padding: 11, borderWidth: 1, borderColor: "#283A39", backgroundColor: "#101B1B" }, switch: { width: 29, height: 17, justifyContent: "center", padding: 2, borderRadius: 9, backgroundColor: "#363B3A" }, switchOn: { backgroundColor: "#3C807C" }, switchThumb: { width: 13, height: 13, borderRadius: 7, backgroundColor: "#A5ACA8" }, switchThumbOn: { alignSelf: "flex-end", backgroundColor: "#E2E9E4" }, autoTitle: { color: "#BFC8C6", fontSize: 10, fontWeight: "800" }, autoMeta: { color: "#747D7A", fontSize: 9, marginTop: 3 }, autoState: { color: "#79736A", fontSize: 9 }, autoStateOn: { color: "#70C3BF" }, error: { marginTop: 13, padding: 12, borderLeftWidth: 3, borderLeftColor: "#C86E65", backgroundColor: "#241817" }, errorTitle: { color: "#D99389", fontSize: 10, fontWeight: "800" }, errorText: { color: "#B8958E", fontSize: 10, lineHeight: 16, marginTop: 4 },
  archive: { flexDirection: "row", alignItems: "center", gap: 11, marginTop: 24, paddingTop: 20, borderTopWidth: 1, borderTopColor: "#302D28" }, archiveMobile: { alignItems: "flex-start" }, archiveIcon: { width: 37, height: 37, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#5E4B2E" }, archiveButton: { minHeight: 38, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 11, borderWidth: 1, borderColor: "#5E4B2E" }, archiveButtonText: { color: "#C5A161", fontSize: 10, fontWeight: "800" }, utility: { flexDirection: "row", alignItems: "center", gap: 9, marginTop: 18 }, utilityButton: { minHeight: 34, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 9, borderWidth: 1, borderColor: "#2E2D2A" }, utilityText: { color: "#8B867C", fontSize: 9 }, utilityNote: { flex: 1, color: "#62605A", fontSize: 9, textAlign: "right" },
  pressed: { opacity: 0.72, transform: [{ translateY: 1 }] }, disabled: { opacity: 0.34 },
  chatPolicy: { color: "#69736F", fontSize: 9, lineHeight: 15, marginTop: 9 },
});
