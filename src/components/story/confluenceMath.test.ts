import { describe, expect, it } from "vitest";

import {
  CONFLUENCE_NODE_STREAMS,
  CONFLUENCE_TRACKS,
  confluenceParticleCount,
  cubicPoint,
} from "./confluenceMath";

describe("confluenceMath", () => {
  it("轨道端点与贝塞尔取值一致，且全程停留在归一化范围内", () => {
    for (const track of CONFLUENCE_TRACKS) {
      const start = cubicPoint(track, 0);
      const end = cubicPoint(track, 1);
      expect(start.x).toBeCloseTo(track.p0.x, 6);
      expect(start.y).toBeCloseTo(track.p0.y, 6);
      expect(end.x).toBeCloseTo(track.p3.x, 6);
      expect(end.y).toBeCloseTo(track.p3.y, 6);
      for (let step = 0; step <= 20; step += 1) {
        const point = cubicPoint(track, step / 20);
        expect(point.x).toBeGreaterThanOrEqual(0);
        expect(point.x).toBeLessThanOrEqual(1);
        expect(point.y).toBeGreaterThanOrEqual(0);
        expect(point.y).toBeLessThanOrEqual(1);
      }
    }
  });

  it("三条轨道共享同一个汇点，交集节点映射到正确的列表", () => {
    const [first, ...rest] = CONFLUENCE_TRACKS;
    for (const track of rest) {
      expect(track.p3).toEqual(first!.p3);
    }
    expect(CONFLUENCE_NODE_STREAMS.allThree).toHaveLength(3);
    expect(CONFLUENCE_NODE_STREAMS.watchLiked).toEqual(["watch_history", "liked_videos"]);
  });

  it("粒子数量有上下限", () => {
    expect(confluenceParticleCount(0, 0)).toBe(8);
    expect(confluenceParticleCount(0, 100)).toBe(8);
    expect(confluenceParticleCount(100, 100)).toBe(30);
    expect(confluenceParticleCount(50, 100)).toBeGreaterThan(8);
    expect(confluenceParticleCount(50, 100)).toBeLessThan(30);
  });
});
