import type { CollectorState } from "./localCollector";

export interface AutoSyncGuard {
  enabled: boolean;
  connected: boolean;
  source: "collector" | "archive" | null;
  busy: boolean;
  inFlight: boolean;
  switchingAccount: boolean;
  stoppingSync: boolean;
  state: CollectorState | null;
}

const BLOCKED_STATES = new Set<CollectorState>([
  "launching_browser",
  "awaiting_login",
  "observing",
  "collecting",
]);

export function shouldAutoSync(guard: AutoSyncGuard): boolean {
  // Foreground refreshes are intentionally limited to video records; chat is
  // collected only by the explicit one-shot flow in App.
  return guard.enabled
    && guard.connected
    && guard.source === "collector"
    && !guard.busy
    && !guard.inFlight
    && !guard.switchingAccount
    && !guard.stoppingSync
    && !BLOCKED_STATES.has(guard.state ?? "idle");
}
