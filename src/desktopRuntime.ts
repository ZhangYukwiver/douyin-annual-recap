export interface DesktopCollectorConfig {
  baseUrl: string;
  pairingCode: string;
}

interface DesktopRuntimeBridge {
  getCollectorConfig(): Promise<unknown>;
}

declare global {
  interface Window {
    desktopRuntime?: DesktopRuntimeBridge;
  }
}

export async function getDesktopCollectorConfig(): Promise<DesktopCollectorConfig | null> {
  if (typeof window === "undefined" || !window.desktopRuntime) return null;
  try {
    const value = await window.desktopRuntime.getCollectorConfig();
    if (!value || typeof value !== "object") return null;
    const candidate = value as Record<string, unknown>;
    return typeof candidate.baseUrl === "string" && /^\d{8}$/u.test(String(candidate.pairingCode))
      ? { baseUrl: candidate.baseUrl, pairingCode: String(candidate.pairingCode) }
      : null;
  } catch {
    return null;
  }
}
