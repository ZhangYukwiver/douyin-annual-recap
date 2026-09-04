export type ReportStyle = "archive" | "trace";

export const REPORT_STYLES: ReadonlyArray<{ key: ReportStyle; label: string; detail: string }> = [
  { key: "archive", label: "档案馆", detail: "应用内分页翻阅" },
  { key: "trace", label: "内容年志", detail: "穿卡入口 · 新标签页" },
];

const STORAGE_KEY = "content-insights.report-style";

interface StyleStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

// Native has no localStorage and private browsing may throw; both fall back to the default style.
export function loadReportStyle(storage: StyleStorage | undefined = globalThis.localStorage): ReportStyle {
  try {
    return storage?.getItem(STORAGE_KEY) === "trace" ? "trace" : "archive";
  } catch {
    return "archive";
  }
}

export function saveReportStyle(style: ReportStyle, storage: StyleStorage | undefined = globalThis.localStorage): void {
  try {
    storage?.setItem(STORAGE_KEY, style);
  } catch {
    // Nothing to persist to; the in-memory choice still applies for this session.
  }
}

export interface StoryEntryCounts {
  watch: number;
  liked: number;
  favorite: number;
  chat: number | null;
}

// The entry card reads these query params; the story page behind it still shows its own demo chapters.
export function buildStoryEntryUrl(counts: StoryEntryCounts, year = new Date().getFullYear()): string {
  const params = new URLSearchParams({ watch: String(counts.watch), liked: String(counts.liked), favorite: String(counts.favorite), year: String(year) });
  if (counts.chat !== null) params.set("chat", String(counts.chat));
  return `/story/story-entry.html?${params.toString()}`;
}
