import { describe, expect, it } from "vitest";

import { buildDomeSlots, buildDomeWindow } from "./DomeGallery";

describe("Dome Gallery", () => {
  it("fills the ReactBits demo's 34 by 5 sphere layout", () => {
    const slots = buildDomeSlots(["a", "b", "c"]);
    expect(slots).toHaveLength(170);
    expect(slots.slice(0, 4).map((slot) => slot.item)).toEqual(["a", "b", "c", "a"]);
  });

  it("makes every cover reachable through the fixed five-row horizontal window", () => {
    const covers = Array.from({ length: 398 }, (_, index) => index);
    const totalColumns = Math.ceil(covers.length / 5);
    const windows = Array.from(
      { length: totalColumns },
      (_, centerColumn) => buildDomeWindow(covers.length, centerColumn),
    );
    const reachable = new Set(windows.flat().map(({ entryIndex }) => entryIndex));
    const before = new Set(buildDomeWindow(covers.length, 0).map(({ slotKey }) => slotKey));
    const retainedAfterTwoColumns = buildDomeWindow(covers.length, 2)
      .filter(({ slotKey }) => before.has(slotKey));
    expect(windows[0]).toHaveLength(170);
    expect(reachable.size).toBe(covers.length);
    expect(retainedAfterTwoColumns).toHaveLength(160);
    expect(new Set(buildDomeWindow(3, 0).map(({ slotKey }) => slotKey)).size).toBe(170);
  });
});
