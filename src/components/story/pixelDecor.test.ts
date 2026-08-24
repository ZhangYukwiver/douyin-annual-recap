import { describe, expect, it } from "vitest";

import { burstOffsets, decodeFrame, decodePool, snapToGrid } from "./pixelDecor";

describe("pixel decor", () => {
  it("snaps spawn coordinates onto the 12px grid", () => {
    expect([snapToGrid(0), snapToGrid(11), snapToGrid(12), snapToGrid(25)]).toEqual([0, 0, 12, 24]);
  });

  it("keeps structural glyphs out of the scramble pool", () => {
    expect(decodePool("CHAPTER 03 · 你的节拍")).not.toContain(" ");
    expect(decodePool("CHAPTER 03 · 你的节拍")).not.toContain("·");
    expect(decodePool("你的节拍")).toContain("节");
  });

  it("settles glyphs left to right and never drops the line structure", () => {
    const glyphs = Array.from("CHAPTER 03 · 你的节拍");
    const pool = decodePool("CHAPTER 03 · 你的节拍");
    const frame = decodeFrame(glyphs, 8, pool, () => 0);
    expect(frame).toHaveLength(glyphs.length);
    expect(frame.startsWith("CHAPTER ")).toBe(true);
    expect(Array.from(frame)[11]).toBe("·");
    expect(decodeFrame(glyphs, glyphs.length, pool, () => 0)).toBe("CHAPTER 03 · 你的节拍");
  });

  it("spreads a burst around the full circle", () => {
    const offsets = burstOffsets(4, 20, () => 0);
    expect(offsets).toHaveLength(4);
    expect(offsets[0]!.x).toBeCloseTo(20);
    expect(offsets[2]!.x).toBeCloseTo(-20);
    // 位移始终指向外圈，方向与落点同侧。
    offsets.forEach((offset) => {
      expect(Math.sign(offset.dx) === Math.sign(offset.x) || Math.abs(offset.x) < 1e-9).toBe(true);
    });
  });
});
