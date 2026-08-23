import { describe, expect, it } from "vitest";

import { DESKTOP_FALL, createFallRng, seedFallBodies, stepFallBodies } from "./desktopFallPhysics";

const ICON_SPEC = { width: 96, height: 74 };

describe("desktop fall physics", () => {
  it("seeds deterministically and staggers releases inside the window", () => {
    const specs = Array.from({ length: 21 }, () => ICON_SPEC);
    const first = seedFallBodies(specs, createFallRng(0x08_23));
    expect(seedFallBodies(specs, createFallRng(0x08_23))).toEqual(first);
    for (const body of first) {
      expect(body.releaseAt).toBeGreaterThanOrEqual(DESKTOP_FALL.holdBefore);
      expect(body.releaseAt).toBeLessThanOrEqual(DESKTOP_FALL.holdBefore + DESKTOP_FALL.releaseWindow);
    }
    expect(new Set(first.map((body) => body.releaseAt)).size).toBeGreaterThan(1);
  });

  it("holds a body before its release, then accelerates it under gravity", () => {
    const body = seedFallBodies([ICON_SPEC], createFallRng(1))[0]!;
    stepFallBodies([body], 0.016, body.releaseAt - 0.1, 900);
    expect(body.y).toBe(0);
    const vyBefore = body.vy;
    stepFallBodies([body], 0.016, body.releaseAt + 0.001, 900);
    expect(body.vy).toBeCloseTo(vyBefore + DESKTOP_FALL.gravity * 0.016, 6);
    expect(body.angle).not.toBe(0);
  });

  it("spins small parts faster than large ones from the same draw", () => {
    const small = seedFallBodies([ICON_SPEC], createFallRng(7))[0]!;
    const widget = seedFallBodies([{ width: 316, height: 128 }], createFallRng(7))[0]!;
    expect(Math.abs(small.angularVelocity)).toBeGreaterThan(Math.abs(widget.angularVelocity));
  });

  it("marks every body done once it falls past the exit line", () => {
    const bodies = seedFallBodies(Array.from({ length: 21 }, () => ICON_SPEC), createFallRng(0x08_23));
    let elapsed = 0;
    let done = false;
    for (let frame = 0; frame < 600 && !done; frame += 1) {
      elapsed += 1 / 60;
      done = stepFallBodies(bodies, 1 / 60, elapsed, 900);
    }
    expect(done).toBe(true);
    expect(bodies.every((body) => body.done)).toBe(true);
  });
});
