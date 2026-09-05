import { describe, expect, it } from "vitest";

import { buildStoryEntryUrl, loadReportStyle, saveReportStyle } from "./reportStyle";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) };
}

describe("report style", () => {
  it("defaults to the archive report and round-trips the trace choice", () => {
    const storage = memoryStorage();
    expect(loadReportStyle(storage)).toBe("archive");
    expect(loadReportStyle(undefined)).toBe("archive");
    saveReportStyle("trace", storage);
    expect(loadReportStyle(storage)).toBe("trace");
    expect(loadReportStyle(memoryStorage({ "content-insights.report-style": "garbage" }))).toBe("archive");
  });

  it("survives a storage that throws", () => {
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(loadReportStyle(broken)).toBe("archive");
    expect(() => saveReportStyle("trace", broken)).not.toThrow();
  });

  it("builds the entry card url with counts and omits chat when unknown", () => {
    expect(buildStoryEntryUrl({ watch: 1144, liked: 8, favorite: 6, chat: 42 }, 2026)).toBe("/story/story-entry.html?watch=1144&liked=8&favorite=6&year=2026&chat=42");
    expect(buildStoryEntryUrl({ watch: 0, liked: 0, favorite: 0, chat: null }, 2026)).not.toContain("chat=");
  });
});
