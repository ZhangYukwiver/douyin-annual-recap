import { describe, expect, it } from "vitest";

import { buildDomeSlots, cardLocalPointerDelta } from "./DomeGallery";

describe("Dome Gallery", () => {
  it("fills the ReactBits 35 by 5 sphere layout", () => {
    const slots = buildDomeSlots(["a", "b", "c"]);
    expect(slots).toHaveLength(175);
    expect(slots.slice(0, 4).map((slot) => slot.item)).toEqual(["a", "b", "c", "a"]);
  });

  it("maps a skewed screen drag back onto the card's local horizontal axis", () => {
    const skew = 6;
    const local = cardLocalPointerDelta(120, Math.tan(skew * Math.PI / 180) * 120, skew);
    expect(local.x).toBe(120);
    expect(local.y).toBeCloseTo(0, 10);
  });
});
