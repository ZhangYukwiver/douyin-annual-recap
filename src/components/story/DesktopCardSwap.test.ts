import { describe, expect, it } from "vitest";

import { makeSlot } from "./DesktopCardSwap";

describe("ReactBits Card Swap", () => {
  it("places cards in the official depth stack", () => {
    expect(makeSlot(2, 60, 70, 3)).toEqual({ x: 120, y: -140, z: -180, zIndex: 1 });
  });
});
