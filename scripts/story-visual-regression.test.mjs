import { describe, expect, it } from "vitest";

import {
  assertReferenceAssets,
  assertStableFrames,
  assertStaticFrame,
} from "./story-visual-regression.mjs";

describe("story visual baseline", () => {
  it("matches all manifest crop bounds and 2x page assets", async () => {
    const result = await assertReferenceAssets();
    expect(result.pages).toHaveLength(12);
    expect(Math.max(...result.pages.map((page) => page.mae ?? 0))).toBeLessThanOrEqual(result.maxMae);
  }, 20_000);

  it("rejects an unsettled animated layer", () => {
    expect(() => assertStaticFrame([{ id: "canvas", transform: "none", opacity: 1 }])).not.toThrow();
    expect(() => assertStaticFrame([{ id: "canvas", transform: "translateX(1px)", opacity: 1 }])).toThrow(/静态帧约束失败/u);
    expect(() => assertStaticFrame([{ id: "canvas", transform: "none", opacity: 0.5 }])).toThrow(/静态帧约束失败/u);
  });

  it("detects style changes between two settled snapshots", () => {
    const stable = [{ id: "canvas", transform: "none", opacity: 1 }];
    expect(() => assertStableFrames(stable, [{ id: "canvas", transform: "none", opacity: 1 }])).not.toThrow();
    expect(() => assertStableFrames(stable, [{ id: "canvas", transform: "none", opacity: 0.99 }])).toThrow(/稳定性校验失败/u);
  });
});
