import { describe, expect, it } from "vitest";

import { buildDomeGalleryEntries, makeSlot, type DesktopStoryStream } from "./DesktopCardSwap";
import type { StoryContentItem } from "./storyModel";

describe("ReactBits Card Swap", () => {
  it("places cards in the official depth stack", () => {
    expect(makeSlot(2, 60, 70, 3)).toEqual({ x: 120, y: -140, z: -180, zIndex: 1 });
  });

  it("keeps every stream record and its source in the single gallery", () => {
    const item = (key: string) => ({ key } as StoryContentItem);
    const streams: DesktopStoryStream[] = [
      { accent: "cyan", count: 2, key: "watch_history", label: "观看", records: [item("a"), item("b")], term: null },
      { accent: "red", count: 1, key: "liked_videos", label: "喜欢", records: [item("a")], term: null },
    ];
    const entries = buildDomeGalleryEntries(streams);
    expect(entries.map((entry) => [entry.item.key, entry.sourceKey])).toEqual([
      ["a", "watch_history"],
      ["b", "watch_history"],
      ["a", "liked_videos"],
    ]);
  });
});
