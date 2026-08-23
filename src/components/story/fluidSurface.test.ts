import { describe, expect, it } from "vitest";

import { fluidSurfaceAmplitude, fluidSurfaceOffset, fluidSurfacePaths } from "./fluidSurface";

const BASE = {
  timeMs: 1_234,
  agitation: 1,
  amplitude: 16,
  idleAmplitude: 5,
  baselineY: 8,
  spanStart: -120,
  spanEnd: 360,
  closeY: 260,
} as const;

describe("fluidSurface", () => {
  it("归一化液面高度有界且随时间变化、结果确定", () => {
    for (let x = -120; x <= 360; x += 48) {
      const offset = fluidSurfaceOffset(x, 500);
      expect(Math.abs(offset)).toBeLessThanOrEqual(1);
      expect(offset).toBe(fluidSurfaceOffset(x, 500));
    }
    expect(fluidSurfaceOffset(0, 0)).not.toBe(fluidSurfaceOffset(0, 700));
  });

  it("扰动强度映射波幅：0 取涟漪幅度，1 取最大幅度，越界被夹住", () => {
    expect(fluidSurfaceAmplitude({ agitation: 0, amplitude: 16, idleAmplitude: 5 })).toBe(5);
    expect(fluidSurfaceAmplitude({ agitation: 1, amplitude: 16, idleAmplitude: 5 })).toBe(16);
    expect(fluidSurfaceAmplitude({ agitation: 3, amplitude: 16, idleAmplitude: 5 })).toBe(16);
    expect(fluidSurfaceAmplitude({ agitation: -1, amplitude: 16, idleAmplitude: 5 })).toBe(5);
  });

  it("路径从起点跨到终点，填充路径闭合到封口边", () => {
    const { surface, body } = fluidSurfacePaths(BASE);
    expect(surface.startsWith("M -120 ")).toBe(true);
    expect(surface).not.toContain("Z");
    expect(body.endsWith("Z")).toBe(true);
    expect(body).toContain("L 360 260");
    expect(body).toContain("L -120 260");
  });

  it("液面高度停留在基线正负波幅内", () => {
    const { surface } = fluidSurfacePaths(BASE);
    const ys = [...surface.matchAll(/[-\d.]+ ([-\d.]+)/gu)].map((match) => Number(match[1]));
    for (const y of ys) {
      expect(y).toBeGreaterThanOrEqual(BASE.baselineY - BASE.amplitude - 0.01);
      expect(y).toBeLessThanOrEqual(BASE.baselineY + BASE.amplitude + 0.01);
    }
  });
});
