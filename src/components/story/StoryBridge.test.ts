import { describe, expect, it } from "vitest";

import { bridgeObjectBox, storyBridgeShapes, type StoryBridgeData } from "./StoryBridge";

// 1600×900 视口下 sceneHeight = height - 68。
const WIDTH = 1600;
const HEIGHT = 832;

const HOURS = [12, 6, 3, 1, 0, 0, 2, 9, 14, 11, 8, 10, 19, 16, 9, 7, 8, 12, 15, 18, 24, 31, 38, 46];

const TOPICS = [128, 96, 74, 61, 47, 39, 33, 28, 24, 19, 15, 12].map((count, index) => ({
  label: `#标签${index + 1}`,
  count,
  color: "#25F4EE",
}));

const NODES = ["三份列表相遇", "观看 ∩ 喜欢", "观看 ∩ 收藏", "喜欢 ∩ 收藏"].map((label) => ({
  label,
  color: "#25F4EE",
}));

const DATA: StoryBridgeData = {
  cardLabels: ["首条记录", "末条记录", "峰值日代表", "最长内容", "互动快照最高"],
  height: HEIGHT,
  hours: HOURS,
  nodes: NODES,
  topics: TOPICS,
  width: WIDTH,
};

const box = (shape: { x: number; y: number; w: number; h: number }) => [
  Math.round(shape.x),
  Math.round(shape.y),
  Math.round(shape.w),
  Math.round(shape.h),
];

const centre = (shape: { x: number; y: number; w: number; h: number }) => [
  Math.round(shape.x + shape.w / 2),
  Math.round(shape.y + shape.h / 2),
];

describe("story bridge geometry", () => {
  it("derives the object box from the same formula as StageCard", () => {
    // stageCardHeight = round(min(760, sceneHeight × 0.84))，减掉 72px 卡头与 44px 描述条。
    // 物件区从视口中线铺到 right: -24，所以比半屏宽 24px。
    expect(bridgeObjectBox(WIDTH, HEIGHT)).toEqual({ x: 800, y: 182.5, w: 824, h: 583 });
    expect(bridgeObjectBox(WIDTH, HEIGHT).x + bridgeObjectBox(WIDTH, HEIGHT).w).toBe(WIDTH + 24);
    expect(bridgeObjectBox(1100, HEIGHT).w).toBe(574);
  });

  it("lands the dial on RhythmEqualizer's real radii, not a scaled-up design frame", () => {
    const shapes = storyBridgeShapes("cardsToDial", 1, DATA);
    expect(shapes).toHaveLength(24);
    const object = bridgeObjectBox(WIDTH, HEIGHT);
    // 00 点朝正上方：宽度收到 BAR_WIDTH 12，底端落在 BAR_INNER 122 处。
    const top = shapes[0]!;
    expect(Math.round(top.w)).toBe(12);
    expect(centre(top)[0]).toBe(Math.round(object.x + object.w / 2));
    const outer = object.y + object.h / 2 - 122;
    expect(top.y + top.h).toBeCloseTo(outer, 1);
    // 最高的一根用满 BAR_MAX 86 + BAR_STUB 8。
    const peak = shapes[23]!;
    expect(Math.round(peak.h)).toBe(94);
  });

  it("hands the dial off between the first two bridges without a jump", () => {
    const end = storyBridgeShapes("cardsToDial", 1, DATA);
    const start = storyBridgeShapes("dialToBubbles", 0, DATA);
    expect(end).toHaveLength(start.length);
    end.forEach((shape, index) => {
      expect(box(start[index]!)).toEqual(box(shape));
    });
  });

  it("hands the bubbles off between the second and third bridges without a jump", () => {
    const end = storyBridgeShapes("dialToBubbles", 1, DATA);
    const start = storyBridgeShapes("bubblesToStreams", 0, DATA);
    TOPICS.forEach((_, seat) => {
      expect(box(start[seat]!)).toEqual(box(end[seat * 2]!));
    });
    // 直径按 TopicBubbleField 的 36–64 半径换算，最大的一颗约 159px。
    expect(Math.round(end[0]!.w)).toBe(159);
  });

  it("keeps every bubble inside the object box when it settles", () => {
    const object = bridgeObjectBox(WIDTH, HEIGHT);
    const shapes = storyBridgeShapes("dialToBubbles", 1, DATA).filter((_, index) => index % 2 === 0);
    for (const shape of shapes) {
      const [cx, cy] = centre(shape);
      expect(cx).toBeGreaterThanOrEqual(Math.round(object.x));
      expect(cx).toBeLessThanOrEqual(Math.round(object.x + object.w));
      expect(cy).toBeGreaterThanOrEqual(Math.round(object.y));
      expect(cy).toBeLessThanOrEqual(Math.round(object.y + object.h));
    }
  });

  it("drains every bubble into the three stream sources on the left edge", () => {
    const shapes = storyBridgeShapes("bubblesToStreams", 1, DATA);
    // 12 颗气泡 + 3 个源流 pill。
    expect(shapes).toHaveLength(15);
    const object = bridgeObjectBox(WIDTH, HEIGHT);
    // ConfluenceFlow 的三条 track 都从左缘 p0 出发，气泡要沉到那里。
    for (const shape of shapes.slice(0, 12)) {
      expect(centre(shape)[0]).toBeLessThan(Math.round(object.x + object.w * 0.3));
    }
    // 源流 pill 在半程之前还没出现。
    expect(storyBridgeShapes("bubblesToStreams", 0.3, DATA)[12]!.opacity).toBe(0);
  });

  it("lands the intersection nodes on the chapter 06 highlight strip", () => {
    const shapes = storyBridgeShapes("nodesToCards", 1, DATA);
    expect(shapes).toHaveLength(5);
    // 卡片 298×220、步进 314，从物件区左缘 (width/2 + 1) 排开。
    expect(box(shapes[0]!)).toEqual([801, 306, 298, 220]);
    expect(box(shapes[1]!)).toEqual([1115, 306, 298, 220]);
    // 后两张排到视口外，与真实的横向滚动条一致。
    expect(shapes[4]!.x).toBeGreaterThan(WIDTH);
    // 第五张没有对应节点，从最后一个节点的位置淡入补齐。
    expect(storyBridgeShapes("nodesToCards", 0, DATA)[4]!.opacity).toBe(0);
    expect(shapes[4]!.opacity).toBe(1);
    // 半程换词：交集节点名 → 坐标名。
    expect(storyBridgeShapes("nodesToCards", 0.2, DATA)[1]!.label).toBe("观看 ∩ 喜欢");
    expect(shapes[1]!.label).toBe("末条记录");
  });

  it("falls back to a usable dial when hours are missing", () => {
    const shapes = storyBridgeShapes("cardsToDial", 1, { ...DATA, hours: [] });
    expect(shapes).toHaveLength(24);
    for (const shape of shapes) {
      expect(shape.h).toBeGreaterThan(0);
      expect(Number.isFinite(shape.x)).toBe(true);
    }
  });
});
