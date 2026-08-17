import { describe, expect, it } from "vitest";

import {
  insetCollisionBox,
  OpeningParticlePhysics,
  planOpeningDestinations,
} from "./openingParticlePhysics";

describe("opening particle physics", () => {
  it("uses collision bodies slightly smaller than their text boxes", () => {
    expect(insetCollisionBox(120, 30)).toEqual({ width: 105.6, height: 26.4 });
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

  it("keeps randomized directions distributed around the full circle", () => {
    const items = Array.from({ length: 12 }, (_, index) => ({
      key: `word-${index}`,
      collisionWidth: 120,
      collisionHeight: 28,
    }));
    const destinations = planOpeningDestinations({
      seed: 123_456,
      width: 1_280,
      height: 720,
      step: 2,
      stepCount: 5,
      items,
    });
    const angles = [...destinations.values()]
      .map(({ x, y }) => (Math.atan2(y, x) + Math.PI * 2) % (Math.PI * 2))
      .sort((left, right) => left - right);
    const gaps = angles.map((angle, index) => {
      const next = angles[(index + 1) % angles.length]!;
      return (next - angle + Math.PI * 2) % (Math.PI * 2);
    });

    expect(Math.max(...gaps)).toBeLessThanOrEqual((Math.PI * 2 / items.length) * 1.45);
  });

  it("places later reveal groups progressively closer to the logo", () => {
    const items = Array.from({ length: 10 }, (_, index) => ({
      key: `word-${index}`,
      collisionWidth: 100 + index * 3,
      collisionHeight: 28,
    }));
    const distanceRatios = (step: number) => {
      const destinations = planOpeningDestinations({
        seed: 789_012,
        width: 1_280,
        height: 720,
        step,
        stepCount: 5,
        items,
      });
      return items.map((item) => {
        const destination = destinations.get(item.key)!;
        const angle = Math.atan2(destination.y, destination.x);
        const radiusX = 1_280 / 2 - item.collisionWidth / 2 - 24;
        const radiusY = 720 / 2 - item.collisionHeight / 2 - 24;
        const rayLimit = Math.min(
          radiusX / Math.max(0.000_001, Math.abs(Math.cos(angle))),
          radiusY / Math.max(0.000_001, Math.abs(Math.sin(angle))),
        );
        return Math.hypot(destination.x, destination.y) / rayLimit;
      });
    };

    const firstStep = distanceRatios(1);
    const lastStep = distanceRatios(5);
    expect(Math.min(...firstStep)).toBeGreaterThan(Math.max(...lastStep));
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
});
