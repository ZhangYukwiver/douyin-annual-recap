import type { StoryOverlapKey } from "./storyModel";
import type { PersonalRecordType } from "../../domain/personalRecords";

export interface ConfluencePoint {
  x: number;
  y: number;
}

export interface ConfluenceTrack {
  type: PersonalRecordType;
  p0: ConfluencePoint;
  c1: ConfluencePoint;
  c2: ConfluencePoint;
  p3: ConfluencePoint;
}

/** 归一化 0..1 坐标系里的三条汇流轨道，终点共享同一个汇点。 */
export const CONFLUENCE_TRACKS: readonly ConfluenceTrack[] = [
  {
    type: "watch_history",
    p0: { x: 0.03, y: 0.16 },
    c1: { x: 0.30, y: 0.14 },
    c2: { x: 0.58, y: 0.46 },
    p3: { x: 0.94, y: 0.50 },
  },
  {
    type: "liked_videos",
    p0: { x: 0.03, y: 0.50 },
    c1: { x: 0.30, y: 0.56 },
    c2: { x: 0.56, y: 0.72 },
    p3: { x: 0.94, y: 0.50 },
  },
  {
    type: "favorite_videos",
    p0: { x: 0.03, y: 0.84 },
    c1: { x: 0.32, y: 0.86 },
    c2: { x: 0.60, y: 0.56 },
    p3: { x: 0.94, y: 0.50 },
  },
] as const;

/** 交点节点位置（归一化坐标），与轨道形状对应的可点位置。 */
export const CONFLUENCE_NODES: Record<StoryOverlapKey, ConfluencePoint> = {
  watchLiked: { x: 0.44, y: 0.33 },
  likedFavorite: { x: 0.46, y: 0.68 },
  watchFavorite: { x: 0.66, y: 0.52 },
  allThree: { x: 0.90, y: 0.50 },
};

export const CONFLUENCE_NODE_STREAMS: Record<StoryOverlapKey, readonly PersonalRecordType[]> = {
  watchLiked: ["watch_history", "liked_videos"],
  watchFavorite: ["watch_history", "favorite_videos"],
  likedFavorite: ["liked_videos", "favorite_videos"],
  allThree: ["watch_history", "liked_videos", "favorite_videos"],
};

export function cubicPoint(track: ConfluenceTrack, t: number): ConfluencePoint {
  const clamped = Math.min(1, Math.max(0, t));
  const inverse = 1 - clamped;
  const a = inverse * inverse * inverse;
  const b = 3 * inverse * inverse * clamped;
  const c = 3 * inverse * clamped * clamped;
  const d = clamped * clamped * clamped;
  return {
    x: a * track.p0.x + b * track.c1.x + c * track.c2.x + d * track.p3.x,
    y: a * track.p0.y + b * track.c1.y + c * track.c2.y + d * track.p3.y,
  };
}

/** 单条轨道的粒子数：随记录数增长但有上下限，保证空数据也有微弱流动。 */
export function confluenceParticleCount(streamCount: number, maxCount: number): number {
  if (maxCount <= 0) return 8;
  const ratio = Math.min(1, streamCount / maxCount);
  return Math.round(8 + ratio * 22);
}
