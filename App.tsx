import { useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  Alert,
  Linking,
  Platform,
  StyleSheet,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import {
  ContentWorkspace,
  LegacyContentWorkspace,
  SetupWorkspace,
  type LegacyWorkspaceViewKey,
  workspaceColors,
} from "./src/components/workspace";
import { buildPersonalSummary } from "./src/domain/annualReport";
import { buildLivingReport } from "./src/domain/livingReport";
import {
  describeArchiveInspection,
  type PersonalArchiveInspection,
} from "./src/domain/fileFormat";
import {
  countPersonalRecords,
  createEmptyPersonalRecords,
  type PersonalArchiveData,
  type PersonalRecordCollection,
} from "./src/domain/personalRecords";
import type { ChatConversationSummary, ChatMessage } from "./src/domain/chatRecords";
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
  startCollectorChatObservation,
  stopCollectorSync,
  stopCollectorObservation,
  stopCollectorChatObservation,
  switchCollectorAccount,
  type CollectorSnapshot,
  type CollectorStatus,
} from "./src/services/localCollector";
import {
  describePersonalArchiveError,
  importPersonalArchive,
} from "./src/services/importPersonalArchive";
import { getDesktopCollectorConfig } from "./src/desktopRuntime";
import { shouldAutoSync } from "./src/services/autoSync";

type ViewKey = "summary" | "highlights" | "records" | "chat" | "sources";

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
  chatMessages: ChatMessage[];
  chatConversations: ChatConversationSummary[];
  warnings: string[];
  updatedAt: string | null;
}

interface CollectorConnectionOptions {
  baseUrl?: string;
  pairingCode?: string;
  revealSources?: boolean;
  automaticPairing?: boolean;
}

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

function collectorErrorMessage(error: unknown): string {
  return error instanceof LocalCollectorError ? error.message : "本地采集服务暂时不可用。";
}

function AppContent() {
  const [activeView, setActiveView] = useState<ViewKey>("sources");
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [dashboardView, setDashboardView] = useState<LegacyWorkspaceViewKey>("summary");
  const [privacy, setPrivacy] = useState(false);
  const [selectedArchive, setSelectedArchive] = useState<SelectedArchive | null>(null);
  const [pickingArchive, setPickingArchive] = useState(false);
  const [collectorUrl, setCollectorUrl] = useState(getDefaultCollectorBaseUrl());
  const [pairingCode, setPairingCode] = useState("");
  const [collectorToken, setCollectorToken] = useState<string | null>(null);
  const [collectorStatus, setCollectorStatus] = useState<CollectorStatus | null>(null);
  const [collectorSnapshot, setCollectorSnapshot] = useState<CollectorSnapshot | null>(null);
  const [collectorBusy, setCollectorBusy] = useState(false);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);
  const [stoppingSync, setStoppingSync] = useState(false);
  const [switchingAccount, setSwitchingAccount] = useState(false);
  const [collectorError, setCollectorError] = useState<string | null>(null);
  const importRequest = useRef(0);
  const pollRequest = useRef(0);
  const connectingRef = useRef(false);
  const syncConfirmationOpenRef = useRef(false);
  const accountSwitchConfirmationOpenRef = useRef(false);
  const autoSyncInFlightRef = useRef(false);
  const autoSyncTriggerRef = useRef<() => void>(() => undefined);
  const chatStartupPendingRef = useRef(false);
  const chatStartupTriggeredRef = useRef(false);
  const chatCollectionInFlightRef = useRef(false);
  const chatPollRequestRef = useRef<number | null>(null);

  useEffect(() => () => {
    pollRequest.current += 1;
    importRequest.current += 1;
    chatStartupPendingRef.current = false;
    chatStartupTriggeredRef.current = false;
    chatCollectionInFlightRef.current = false;
    chatPollRequestRef.current = null;
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
      [data-focus-treatment="scale"]:focus-visible {
        outline: none !important;
        outline-offset: 0 !important;
        transform: scale(1.04);
      }
    `;
    document.head.appendChild(focusStyles);
    return () => focusStyles.remove();
  }, []);

  const displaySnapshot: DisplaySnapshot | null = collectorSnapshot
    ? {
        source: "collector",
        records: collectorSnapshot.records,
        chatMessages: collectorSnapshot.chatMessages,
        chatConversations: collectorSnapshot.chatConversations,
        warnings: collectorSnapshot.warnings,
        updatedAt: collectorSnapshot.updatedAt,
      }
    : selectedArchive?.data
      ? {
          source: "archive",
          records: selectedArchive.data.records,
          chatMessages: [],
          chatConversations: [],
          warnings: selectedArchive.data.warnings,
          updatedAt: null,
        }
      : null;

  const personalSummary = useMemo(() => {
    if (!displaySnapshot) return null;
    const collectionState = displaySnapshot?.source === "collector"
      ? collectorStatus?.state === "complete"
        ? "complete"
        : collectorStatus && ["partial", "error", "collecting", "launching_browser", "awaiting_login", "observing"].includes(collectorStatus.state)
          ? "partial"
          : "unknown"
      : "unknown";
    return buildPersonalSummary(displaySnapshot.records, {
      source: displaySnapshot?.source,
      collectionState,
      warnings: displaySnapshot?.warnings ?? [],
    });
  }, [collectorStatus?.state, displaySnapshot?.records, displaySnapshot?.source, displaySnapshot?.warnings]);

  const livingReport = useMemo(() => {
    if (!displaySnapshot) return null;
    const collectionState = displaySnapshot.source === "collector"
      ? collectorStatus?.state === "complete"
        ? "complete"
        : collectorStatus && ["partial", "error", "collecting", "launching_browser", "awaiting_login", "observing"].includes(collectorStatus.state)
          ? "partial"
          : "unknown"
      : "unknown";
    return buildLivingReport(displaySnapshot.records, {
      source: displaySnapshot.source,
      sourceUpdatedAt: displaySnapshot.updatedAt,
      collectionState,
      warnings: displaySnapshot.warnings,
    });
  }, [collectorStatus?.state, displaySnapshot?.records, displaySnapshot?.source, displaySnapshot?.updatedAt, displaySnapshot?.warnings]);

  useEffect(() => {
    const trigger = () => autoSyncTriggerRef.current();
    if (Platform.OS === "web") {
      if (typeof document === "undefined") return undefined;
      const onVisibilityChange = () => {
        if (document.visibilityState === "visible") trigger();
      };
      document.addEventListener("visibilitychange", onVisibilityChange);
      if (document.visibilityState === "visible") trigger();
      return () => document.removeEventListener("visibilitychange", onVisibilityChange);
    }
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") trigger();
    });
    if (AppState.currentState === "active") trigger();
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (collectorToken && displaySnapshot?.source === "collector") autoSyncTriggerRef.current();
  }, [autoSyncEnabled, collectorToken, displaySnapshot?.source]);

  useEffect(() => {
    if (!collectorToken || displaySnapshot?.source !== "collector" || !chatStartupPendingRef.current) return undefined;
    if (collectorBusy || switchingAccount || autoSyncInFlightRef.current || chatCollectionInFlightRef.current) return undefined;
    if (collectorStatus && !TERMINAL_COLLECTOR_STATES.has(collectorStatus.state)) return undefined;

    // Let the foreground record refresh claim the collector first. The chat
    // snapshot starts once per app session, then the collector closes it.
    const timer = setTimeout(() => {
      if (!chatStartupPendingRef.current || !collectorToken || collectorBusy || switchingAccount || autoSyncInFlightRef.current || chatCollectionInFlightRef.current) return;
      chatStartupPendingRef.current = false;
      void beginChatObservation(collectorUrl, collectorToken);
    }, 0);
    return () => clearTimeout(timer);
  }, [collectorBusy, collectorStatus?.state, collectorToken, collectorUrl, displaySnapshot?.source, switchingAccount]);

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
          if (status.phase !== "chat_messages") setCollectorBusy(false);
          continue;
        }
        if (TERMINAL_COLLECTOR_STATES.has(status.state)) {
          if (!await refreshCollectorSnapshot(baseUrl, token, requestId)) return;
          if (pollRequest.current !== requestId) return;
          setCollectorBusy(false);
          autoSyncInFlightRef.current = false;
          if (chatPollRequestRef.current === requestId) {
            chatCollectionInFlightRef.current = false;
            chatPollRequestRef.current = null;
          }
          if (chatStartupPendingRef.current && !chatCollectionInFlightRef.current) {
            chatStartupPendingRef.current = false;
            void beginChatObservation(baseUrl, token);
          }
          return;
        }
      }
    } catch (error) {
      if (pollRequest.current !== requestId) return;
      setCollectorBusy(false);
      autoSyncInFlightRef.current = false;
      if (chatPollRequestRef.current === requestId) {
        chatCollectionInFlightRef.current = false;
        chatPollRequestRef.current = null;
      }
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
      autoSyncInFlightRef.current = false;
      const message = collectorErrorMessage(error);
      setCollectorError(message);
      showAlert(incremental ? "无法增量读取记录" : "无法完整读取记录", message);
    }
  }

  function triggerAutoSync() {
    const token = collectorToken;
    if (!token || !shouldAutoSync({
      enabled: autoSyncEnabled,
      connected: Boolean(token),
      source: displaySnapshot?.source ?? null,
      busy: collectorBusy,
      inFlight: autoSyncInFlightRef.current,
      switchingAccount,
      stoppingSync,
      state: collectorStatus?.state ?? null,
    })) return;
    autoSyncInFlightRef.current = true;
    void beginSync(collectorUrl, token, true);
  }

  autoSyncTriggerRef.current = triggerAutoSync;

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

  async function beginChatObservation(baseUrl: string, token: string) {
    if (chatCollectionInFlightRef.current || switchingAccount) return;
    chatCollectionInFlightRef.current = true;
    const requestId = pollRequest.current + 1;
    pollRequest.current = requestId;
    chatPollRequestRef.current = requestId;
    setCollectorBusy(true);
    setCollectorError(null);
    try {
      const status = await startCollectorChatObservation(baseUrl, token);
      if (pollRequest.current !== requestId) {
        if (chatPollRequestRef.current === requestId) {
          chatCollectionInFlightRef.current = false;
          chatPollRequestRef.current = null;
        }
        return;
      }
      setCollectorStatus(status);
      void pollCollector(baseUrl, token, requestId);
    } catch (error) {
      if (pollRequest.current !== requestId) {
        if (chatPollRequestRef.current === requestId) {
          chatCollectionInFlightRef.current = false;
          chatPollRequestRef.current = null;
        }
        return;
      }
      if (chatPollRequestRef.current === requestId) {
        chatCollectionInFlightRef.current = false;
        chatPollRequestRef.current = null;
      }
      setCollectorBusy(false);
      const message = collectorErrorMessage(error);
      setCollectorError(message);
      showAlert("无法读取聊天", message);
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

  async function endChatObservation(baseUrl: string, token: string) {
    const requestId = pollRequest.current + 1;
    pollRequest.current = requestId;
    setCollectorBusy(true);
    setCollectorError(null);
    try {
      const status = await stopCollectorChatObservation(baseUrl, token);
      if (pollRequest.current !== requestId) return;
      setCollectorStatus(status);
      await refreshCollectorSnapshot(baseUrl, token, requestId);
      if (pollRequest.current !== requestId) return;
      chatCollectionInFlightRef.current = false;
      chatPollRequestRef.current = null;
      setCollectorBusy(false);
    } catch (error) {
      if (pollRequest.current !== requestId) return;
      chatCollectionInFlightRef.current = false;
      chatPollRequestRef.current = null;
      setCollectorBusy(false);
      const message = collectorErrorMessage(error);
      setCollectorError(message);
      showAlert("无法取消聊天读取", message);
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
      if (!chatStartupTriggeredRef.current) {
        chatStartupTriggeredRef.current = true;
        chatStartupPendingRef.current = true;
      }
      if (revealSources) setActiveView("sources");
      if (TERMINAL_COLLECTOR_STATES.has(status.state)) {
        setCollectorBusy(false);
      } else {
        void pollCollector(normalizedUrl, pairedToken, requestId);
      }
    } catch (error) {
      if (pollRequest.current !== requestId) return;
      chatStartupPendingRef.current = false;
      chatCollectionInFlightRef.current = false;
      chatPollRequestRef.current = null;
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
    autoSyncInFlightRef.current = false;
    chatStartupPendingRef.current = false;
    chatCollectionInFlightRef.current = false;
    chatPollRequestRef.current = null;
    setCollectorBusy(true);
    let stopError: string | null = null;
    try {
      await stopCollectorObservation(collectorUrl, token);
    } catch (error) {
      stopError = collectorErrorMessage(error);
    } finally {
      setCollectorToken(null);
      setCollectorStatus(null);
      setCollectorSnapshot(null);
      setStoppingSync(false);
      setCollectorBusy(false);
      setCollectorError(stopError
        ? `已断开应用，但无法确认采集任务已停止：${stopError}`
        : null);
    }
  }

  async function performAccountSwitch() {
    if (!collectorToken || switchingAccount || collectorBusy) return;
    const requestId = pollRequest.current + 1;
    pollRequest.current = requestId;
    autoSyncInFlightRef.current = false;
    chatStartupPendingRef.current = false;
    chatCollectionInFlightRef.current = false;
    chatPollRequestRef.current = null;
    setSwitchingAccount(true);
    setCollectorBusy(true);
    setCollectorError(null);
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
        autoSyncInFlightRef.current = false;
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

  function enterWorkspace() {
    setDashboardOpen(false);
    setActiveView("summary");
  }

  function replayStory() {
    setDashboardOpen(false);
    setActiveView("summary");
  }

  function openDashboard() {
    setDashboardView("summary");
    setDashboardOpen(true);
  }

  function openSettings() {
    setDashboardOpen(false);
    setActiveView("sources");
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <StatusBar style="light" />
      {activeView === "sources" ? (
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
          onStartChatObservation={() => {
            chatStartupTriggeredRef.current = true;
            chatStartupPendingRef.current = false;
            return collectorToken ? beginChatObservation(collectorUrl, collectorToken) : Promise.resolve();
          }}
          onStartFullSync={confirmFullSync}
          onStopSync={() => collectorToken ? endSync(collectorUrl, collectorToken) : Promise.resolve()}
          onStopObservation={() => collectorToken
            ? collectorStatus?.phase === "chat_messages"
              ? endChatObservation(collectorUrl, collectorToken)
              : endObservation(collectorUrl, collectorToken)
            : Promise.resolve()}
          onSwitchAccount={confirmAccountSwitch}
          autoSyncEnabled={autoSyncEnabled}
          onToggleAutoSync={() => setAutoSyncEnabled((value) => !value)}
          observing={collectorStatus?.state === "observing" && collectorStatus?.phase !== "chat_messages"}
          pairingCode={pairingCode}
          pickingArchive={pickingArchive}
          records={workspaceRecords}
          snapshotSource={displaySnapshot?.source ?? null}
          snapshotUpdatedAt={displaySnapshot?.updatedAt ?? null}
          status={collectorStatus}
          stoppingSync={stoppingSync}
          switchingAccount={switchingAccount}
        />
      ) : dashboardOpen ? (
        <LegacyContentWorkspace
          activeView={dashboardView}
          busy={collectorBusy}
          chatConversations={displaySnapshot?.chatConversations ?? []}
          chatMessages={displaySnapshot?.chatMessages ?? []}
          onChangeView={setDashboardView}
          onOpenRecord={openRecord}
          onOpenSettings={openSettings}
          onReplayStory={replayStory}
          onSync={() => collectorToken ? confirmIncrementalSync() : openSettings()}
          onTogglePrivacy={() => setPrivacy((value) => !value)}
          privacy={privacy}
          records={workspaceRecords}
          report={personalSummary ?? livingReport}
          sourceLabel={sourceLabel}
          status={collectorStatus}
          updatedAt={displaySnapshot?.updatedAt ?? null}
        />
      ) : (
        <ContentWorkspace
          activeView={activeView === "chat" ? "chat" : activeView === "highlights" ? "highlights" : "summary"}
          busy={collectorBusy}
          onOpenDashboard={openDashboard}
          onChangeView={(view) => {
            if (view === "summary" || view === "highlights" || view === "chat") {
              setActiveView(view);
              return;
            }
            setActiveView("summary");
          }}
          onOpenRecord={openRecord}
          onOpenSettings={openSettings}
          onReplayStory={replayStory}
          onSync={() => collectorToken ? confirmIncrementalSync() : setActiveView("sources")}
          onTogglePrivacy={() => setPrivacy((value) => !value)}
          privacy={privacy}
          records={workspaceRecords}
          chatMessages={displaySnapshot?.chatMessages ?? []}
          chatConversations={displaySnapshot?.chatConversations ?? []}
          report={personalSummary ?? livingReport}
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
});
