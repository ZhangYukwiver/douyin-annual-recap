import { describe, expect, it } from "vitest";

import {
  consumeFixedSteps,
  coverGatherWindow,
  FIXED_STEP_MS,
  fillOpeningRows,
  insetCollisionBox,
  openingBorderGlowPose,
  openingLogoRevealScale,
  openingMessageExitWindow,
  openingPileDestinationStep,
  openingScrollTop,
  openingSurfaceY,
  openingTransitionProgress,
  openingVisualRow,
  OpeningParticlePhysics,
  planOpeningParticleExit,
  planOpeningDestinations,
  shuffledCoverIndices,
  truncateOpeningParticleLabel,
} from "./openingParticlePhysics";

describe("opening particle physics", () => {
  it("only advances the cover transition after the opening message is ready", () => {
    expect(openingTransitionProgress(230, 460, false)).toBe(0);
    expect(openingTransitionProgress(230, 460, true)).toBe(0.5);
    expect(openingTransitionProgress(-20, 460, true)).toBe(0);
    expect(openingTransitionProgress(900, 460, true)).toBe(1);
  });

  it("keeps the opening at the stacked cover until the user continues", () => {
    expect(openingScrollTop(230, 460, false, false)).toBe(0);
    expect(openingScrollTop(230, 460, true, false)).toBe(230);
    expect(openingScrollTop(900, 460, true, false)).toBe(460);
    expect(openingScrollTop(900, 460, true, true)).toBe(900);
  });

  it("hides opening message characters in reverse playback order", () => {
    const first = openingMessageExitWindow(0, 12);
    const last = openingMessageExitWindow(11, 12);

    expect(last[0]).toBeLessThan(first[0]);
    expect(last[1] - last[0]).toBeCloseTo(first[1] - first[0]);
  });

  it("gathers shuffled covers through staggered progress windows", () => {
    const first = coverGatherWindow(0, 5);
    const last = coverGatherWindow(4, 5);

    expect(first[0]).toBeCloseTo(0.04);
    expect(first[1]).toBeCloseTo(0.34);
    expect(last[0]).toBeCloseTo(0.68);
    expect(last[1]).toBeCloseTo(0.98);
    expect(shuffledCoverIndices(4, () => 0)).toEqual([1, 2, 3, 0]);
  });

  it("tracks a neutral border glow by pointer angle and edge distance", () => {
    expect(openingBorderGlowPose(100, 40, 50, 20)).toEqual({ edgeProximity: 0, angle: 0 });
    expect(openingBorderGlowPose(100, 40, 100, 20)).toEqual({ edgeProximity: 100, angle: 90 });
    expect(openingBorderGlowPose(100, 40, 50, 0)).toEqual({ edgeProximity: 100, angle: 0 });
    expect(openingBorderGlowPose(100, 40, 101, 20)).toBeNull();
  });

  it("advances the same simulated time per second on 60Hz and 120Hz displays", () => {
    const simulate = (frameMs: number) => {
      let accumulator = 0;
      let steps = 0;
      for (let elapsed = 0; elapsed < 1000; elapsed += frameMs) {
        const drained = consumeFixedSteps(accumulator, frameMs);
        steps += drained.steps;
        accumulator = drained.remainder;
      }
      return steps;
    };

    const sixtyHz = simulate(1000 / 60);
    const oneTwentyHz = simulate(1000 / 120);

    expect(sixtyHz).toBeGreaterThanOrEqual(59);
    expect(Math.abs(sixtyHz - oneTwentyHz)).toBeLessThanOrEqual(1);
  });

  it("caps the backlog after a long stall instead of fast-forwarding the flight", () => {
    const drained = consumeFixedSteps(0, 5_000);

    expect(drained.steps).toBe(6);
    expect(drained.remainder).toBeLessThan(FIXED_STEP_MS);
  });


  it("keeps the collision box slightly smaller than the text width and font size", () => {
    const fontSize = 18;
    const box = insetCollisionBox(120, fontSize);

    expect(box.width).toBeCloseTo(112.8);
    expect(box.height).toBeCloseTo(16.56);
    expect(box.height).toBeLessThan(fontSize);
  });

  it("scales collision bodies proportionally with enlarged text boxes", () => {
    const scale = 1.12;
    const base = insetCollisionBox(120, 30);
    const enlarged = insetCollisionBox(120 * scale, 30 * scale);

    expect(enlarged.width).toBeCloseTo(base.width * scale);
    expect(enlarged.height).toBeCloseTo(base.height * scale);
  });

  it("only shortens labels after eight characters", () => {
    expect(truncateOpeningParticleLabel("八个字符刚好够了")).toBe("八个字符刚好够了");
    expect(truncateOpeningParticleLabel("超过八个字符才需要省略")).toBe("超过八个字符才需…");
    expect(truncateOpeningParticleLabel("一碗热汤的做法 #家常菜")).toBe("一碗热汤的做法…");
  });

  it("fills earlier row gaps with later labels and keeps variable item counts", () => {
    const first = { key: "first", width: 70 };
    const second = { key: "second", width: 70 };
    const third = { key: "third", width: 40 };
    const fourth = { key: "fourth", width: 20 };
    const fifth = { key: "fifth", width: 20 };
    const sixth = { key: "sixth", width: 20 };

    const rows = fillOpeningRows([first, second, third, fourth, fifth, sixth], 130, 3, 10);

    expect(rows).toEqual([[first, third], [second, fourth, fifth], [sixth]]);
    expect(rows.map((row) => row.length)).toEqual([2, 3, 1]);
    expect(new Set(rows.flat())).toEqual(new Set([first, second, third, fourth, fifth, sixth]));
  });

  it("scales the logo aperture far enough to cover every viewport corner", () => {
    const width = 1_280;
    const height = 720;
    const scale = openingLogoRevealScale(width, height);

    expect(scale * 22).toBeGreaterThan(Math.hypot(width / 2, height / 2));
  });

  it("pushes words fully beyond a screen edge and catches inner words first", () => {
    const width = 1_280;
    const height = 720;
    const inner = planOpeningParticleExit("inner", 20, -10, width, height);
    const outer = planOpeningParticleExit("outer", -520, 220, width, height);
    const outerEnd = { x: -520 + outer.x, y: 220 + outer.y };

    expect(Math.abs(outerEnd.x)).toBeGreaterThan(width / 2);
    expect(outer.x).toBeLessThan(0);
    expect(inner.radialProgress).toBeLessThan(outer.radialProgress);
  });

  it("gives a centered word a deterministic non-zero exit path", () => {
    const first = planOpeningParticleExit("center", 0, 0, 1_280, 720);
    const second = planOpeningParticleExit("center", 0, 0, 1_280, 720);

    expect(first).toEqual(second);
    expect(Math.hypot(first.x, first.y)).toBeGreaterThan(500);
  });

  it("lets an unsupported word fall instead of pulling it toward a lower target", () => {
    const physics = new OpeningParticlePhysics(800, 600, {
      gravityY: 0.7,
      fallWhenUnsupported: true,
    });
    physics.add({
      key: "falling",
      targetX: 400,
      targetY: 420,
      collisionWidth: 100,
      collisionHeight: 18,
      angle: 0,
      spawnX: 400,
      spawnY: 180,
      velocityX: 0,
      velocityY: 0,
      targetForce: 0.001,
    });

    physics.advance(FIXED_STEP_MS);
    const firstFramePose = physics.poses().get("falling")!;
    for (let frame = 1; frame < 20; frame += 1) physics.advance(FIXED_STEP_MS);

    const pose = physics.poses().get("falling")!;
    expect(firstFramePose.y).toBeGreaterThan(180);
    expect(pose.y).toBeGreaterThan(180);
    expect(pose.y).toBeLessThan(230);
    physics.dispose();
  });

  it("separates overlapping word bodies", () => {
    const physics = new OpeningParticlePhysics(800, 600);
    const box = insetCollisionBox(120, 30);
    physics.add({
      key: "left",
      targetX: 400,
      targetY: 300,
      collisionWidth: box.width,
      collisionHeight: box.height,
      angle: 0,
      spawnX: 398,
      spawnY: 300,
      velocityX: 0,
      velocityY: 0,
    });
    physics.add({
      key: "right",
      targetX: 400,
      targetY: 300,
      collisionWidth: box.width,
      collisionHeight: box.height,
      angle: 0,
      spawnX: 402,
      spawnY: 300,
      velocityX: 0,
      velocityY: 0,
    });

    for (let frame = 0; frame < 30; frame += 1) physics.advance(16.67);
    const poses = physics.poses();
    const left = poses.get("left")!;
    const right = poses.get("right")!;
    expect(Math.hypot(left.x - right.x, left.y - right.y)).toBeGreaterThan(box.height * 0.8);
    physics.dispose();
  });

  it("keeps revealed words fixed while settling a new word", () => {
    const physics = new OpeningParticlePhysics(800, 600);
    const box = insetCollisionBox(120, 30);
    physics.add({
      key: "revealed",
      targetX: 400,
      targetY: 300,
      collisionWidth: box.width,
      collisionHeight: box.height,
      angle: 0,
      spawnX: 400,
      spawnY: 300,
      velocityX: 0,
      velocityY: 0,
      isStatic: true,
    });
    physics.add({
      key: "new",
      targetX: 402,
      targetY: 300,
      collisionWidth: box.width,
      collisionHeight: box.height,
      angle: 0,
      spawnX: 402,
      spawnY: 300,
      velocityX: 0,
      velocityY: 0,
    });

    for (let frame = 0; frame < 42; frame += 1) physics.advance(16.67);
    const poses = physics.poses();
    const newPose = poses.get("new")!;
    expect(poses.get("revealed")).toEqual({ x: 400, y: 300 });
    expect(Math.hypot(newPose.x - 400, newPose.y - 300)).toBeGreaterThan(box.height * 0.8);
    physics.dispose();
  });

  it("keeps a straight velocity until a word collides, then rebounds", () => {
    const physics = new OpeningParticlePhysics(800, 600);
    physics.add({
      key: "obstacle",
      targetX: 500,
      targetY: 300,
      collisionWidth: 100,
      collisionHeight: 30,
      angle: 0,
      spawnX: 500,
      spawnY: 300,
      velocityX: 0,
      velocityY: 0,
      isStatic: true,
    });
    physics.add({
      key: "moving",
      targetX: 650,
      targetY: 300,
      collisionWidth: 100,
      collisionHeight: 30,
      angle: 0,
      spawnX: 300,
      spawnY: 300,
      velocityX: 10,
      velocityY: 0,
      frictionAir: 0,
      restitution: 0.68,
      targetForce: 0,
    });

    for (let frame = 0; frame < 5; frame += 1) physics.advance(16.67);
    const straightPose = physics.poses().get("moving")!;
    for (let frame = 0; frame < 7; frame += 1) physics.advance(16.67);
    const collisionPose = physics.poses().get("moving")!;
    for (let frame = 0; frame < 8; frame += 1) physics.advance(16.67);
    const reboundPose = physics.poses().get("moving")!;
    expect(straightPose.y).toBeCloseTo(300, 5);
    expect(straightPose.x).toBeGreaterThan(300);
    expect(reboundPose.x).toBeLessThan(collisionPose.x);
    physics.dispose();
  });

  it("moves an impacted word and decelerates it before stopping", () => {
    const physics = new OpeningParticlePhysics(800, 600);
    physics.add({
      key: "impacted",
      targetX: 500,
      targetY: 300,
      collisionWidth: 100,
      collisionHeight: 30,
      angle: 0,
      spawnX: 500,
      spawnY: 300,
      velocityX: 0,
      velocityY: 0,
      frictionAir: 0,
      restitution: 0.68,
      targetForce: 0,
    });
    physics.add({
      key: "moving",
      targetX: 650,
      targetY: 300,
      collisionWidth: 100,
      collisionHeight: 30,
      angle: 0,
      spawnX: 300,
      spawnY: 300,
      velocityX: 10,
      velocityY: 0,
      frictionAir: 0,
      restitution: 0.68,
      targetForce: 0,
    });

    for (let frame = 0; frame < 14; frame += 1) physics.advance(16.67);
    const impactPose = physics.poses().get("impacted")!;
    physics.setFrictionAir(["impacted", "moving"], 0.18);
    for (let frame = 0; frame < 4; frame += 1) physics.advance(16.67);
    const slowingPose = physics.poses().get("impacted")!;
    for (let frame = 0; frame < 4; frame += 1) physics.advance(16.67);
    const stoppedPose = physics.poses().get("impacted")!;

    expect(impactPose.x).toBeGreaterThan(500);
    expect(stoppedPose.x - slowingPose.x).toBeLessThan(slowingPose.x - impactPose.x);
    physics.dispose();
  });

  it("keeps a sparse wave centered with a compact fixed gap", () => {
    const items = Array.from({ length: 3 }, (_, index) => ({
      key: `word-${index}`,
      collisionWidth: 120,
      collisionHeight: 28,
      displayWidth: 120,
    }));
    const destinations = planOpeningDestinations({
      seed: 123_456,
      width: 1_280,
      height: 720,
      step: 2,
      stepCount: 5,
      itemGap: 12,
      items,
    });
    const xs = [...destinations.values()].map(({ x }) => x).sort((left, right) => left - right);
    const gaps = xs.slice(1).map((x, index) => x - xs[index]! - 120);

    expect(xs).toEqual([-132, 0, 132]);
    gaps.forEach((gap) => expect(gap).toBe(12));
  });

  it("lays one wave out as a compact mosaic row", () => {
    const items = [420, 120, 320, 300].map((displayWidth, index) => ({
      key: `tile-${index}`,
      collisionWidth: displayWidth * 0.94,
      collisionHeight: 28,
      displayWidth,
    }));
    const destinations = planOpeningDestinations({
      seed: 456_789,
      width: 1_280,
      height: 720,
      step: 2,
      stepCount: 5,
      itemGap: 12,
      items,
    });
    const row = items
      .map((item) => ({ item, ...destinations.get(item.key)! }))
      .sort((left, right) => left.x - right.x);
    const gaps = row.slice(1).map((item, index) => (
      item.x - item.item.displayWidth / 2
      - (row[index]!.x + row[index]!.item.displayWidth / 2)
    ));

    expect(new Set(row.map((item) => item.y)).size).toBe(1);
    expect(row[0]!.x - row[0]!.item.displayWidth / 2).toBeCloseTo(-598);
    expect(row.at(-1)!.x + row.at(-1)!.item.displayWidth / 2).toBeCloseTo(598);
    gaps.forEach((gap) => expect(gap).toBeCloseTo(12));
  });

  it("stacks each wave above the previous one, bottom of the stage first", () => {
    const items = Array.from({ length: 10 }, (_, index) => ({
      key: `word-${index}`,
      collisionWidth: 100 + index * 3,
      collisionHeight: 28,
    }));
    const bandFor = (step: number) => {
      const destinations = planOpeningDestinations({
        seed: 789_012,
        width: 1_280,
        height: 720,
        step,
        stepCount: 5,
        items,
      });
      const ys = items.map((item) => destinations.get(item.key)!.y);
      return { top: Math.min(...ys), bottom: Math.max(...ys) };
    };

    const bands = [1, 2, 3, 4, 5].map(bandFor);
    // y 向下为正：第 1 步在最下面，之后每一步整体更靠上，且层与层不互相穿插。
    expect(bands[0]!.bottom).toBeGreaterThan(0);
    expect(bands.at(-1)!.top).toBeLessThan(0);
    bands.slice(1).forEach((band, index) => {
      expect(band.bottom).toBeLessThan(bands[index]!.top);
    });
  });

  it("reports a surface line that climbs from the floor to the ceiling", () => {
    expect(openingSurfaceY(720, 1, 5)).toBe(360);
    expect(openingSurfaceY(720, 3, 5)).toBe(72);
    expect(openingSurfaceY(720, 6, 5)).toBe(-360);
  });

  it("places the earliest revealed pile row at the top of the final screen", () => {
    expect(openingPileDestinationStep(1, 12)).toBe(12);
    expect(openingPileDestinationStep(6, 12)).toBe(7);
    expect(openingPileDestinationStep(12, 12)).toBe(1);
  });

  it("distributes reveal order across dense visual rows", () => {
    const rows = Array.from({ length: 264 }, (_, order) => openingVisualRow(order, 264, 24));

    expect(rows[0]).toBe(1);
    expect(rows.at(-1)).toBe(24);
    expect(Array.from({ length: 24 }, (_, index) => rows.filter((row) => row === index + 1).length))
      .toEqual(Array(24).fill(11));
  });

  it("keeps destinations inside the available stage", () => {
    const items = Array.from({ length: 16 }, (_, index) => ({
      key: `word-${index}`,
      collisionWidth: 90 + index * 5,
      collisionHeight: 28,
    }));
    const destinations = planOpeningDestinations({
      seed: 345_678,
      width: 1_024,
      height: 650,
      step: 1,
      stepCount: 5,
      items,
    });

    items.forEach((item) => {
      const destination = destinations.get(item.key)!;
      expect(Math.abs(destination.x) + item.collisionWidth / 2).toBeLessThan(1_024 / 2 - 18);
      expect(Math.abs(destination.y) + item.collisionHeight / 2).toBeLessThan(650 / 2 - 18);
    });
  });

  it("keeps the first and last visual rows clear of their neighbors", () => {
    const item = { key: "word", collisionWidth: 120, collisionHeight: 26.4 };
    const ys = Array.from({ length: 20 }, (_, index) => planOpeningDestinations({
      seed: 123_456,
      width: 1_280,
      height: 602,
      step: index + 1,
      stepCount: 20,
      items: [item],
    }).get(item.key)!.y);

    ys.slice(1).forEach((y, index) => {
      expect(ys[index]! - y).toBeGreaterThanOrEqual(item.collisionHeight);
    });
  });
});
