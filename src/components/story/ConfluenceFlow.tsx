import React, { useEffect, useMemo, useRef } from "react";

import type { PersonalRecordType } from "../../domain/personalRecords";
import {
  CONFLUENCE_NODES,
  CONFLUENCE_NODE_STREAMS,
  CONFLUENCE_TRACKS,
  confluenceParticleCount,
  cubicPoint,
  type ConfluenceTrack,
} from "./confluenceMath";
import type { StoryOverlapKey } from "./storyModel";

const STREAM_COLORS: Record<PersonalRecordType, { line: string; particle: string; rgb: string }> = {
  watch_history: { line: "rgba(37,244,238,0.55)", particle: "#25F4EE", rgb: "37,244,238" },
  liked_videos: { line: "rgba(254,44,85,0.55)", particle: "#FE2C55", rgb: "254,44,85" },
  favorite_videos: { line: "rgba(244,196,94,0.55)", particle: "#F4C45E", rgb: "244,196,94" },
};

const DRAW_IN_MS = 1_150;
const TRACK_SAMPLES = 90;

interface FlowParticle {
  track: number;
  t: number;
  speed: number;
  size: number;
  wobblePhase: number;
  wobbleAmp: number;
}

export interface ConfluenceOverlapDatum {
  key: StoryOverlapKey;
  label: string;
  count: number;
}

export interface ConfluenceFlowProps {
  streamCounts: Record<PersonalRecordType, number>;
  streamLabels: Record<PersonalRecordType, string>;
  overlaps: ConfluenceOverlapDatum[];
  selected: StoryOverlapKey;
  available: boolean;
  onSelect: (key: StoryOverlapKey) => void;
  active: boolean;
  reducedMotion: boolean;
  height?: number;
  /** 放进章节卡片里时去掉自己的边框和底色，融进卡片。 */
  bare?: boolean;
  /** 选中节点的强调色，与章节标题里的词条同色。 */
  accent?: string;
}

const CSS = [
  ".confluence-flow { position: relative; width: 100%; overflow: hidden; border: 1px solid #24262C; border-radius: 8px; background: #0E0F13; }",
  ".confluence-flow.is-bare { border: 0; border-radius: 0; background: transparent; }",
  ".confluence-flow canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }",
  ".confluence-node { position: absolute; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; width: 96px; height: 66px; padding: 0 8px; border: 1px solid #30323A; border-radius: 6px; background: rgba(17,18,22,0.9); color: #C0C2C8; cursor: pointer; transition: border-color 0.2s ease, background-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease; }",
  ".confluence-node:hover { border-color: rgba(37,244,238,0.6); transform: translate(-50%, -50%) scale(1.04); }",
  ".confluence-node.is-selected { border-color: #25F4EE; background: #153334; box-shadow: 0 0 14px rgba(37,244,238,0.35), 0 0 34px rgba(37,244,238,0.16); }",
  ".confluence-node-label { font-size: 9px; font-weight: 800; letter-spacing: 0.02em; }",
  ".confluence-node-value { font-size: 17px; font-weight: 900; color: #25F4EE; font-variant-numeric: tabular-nums; }",
  ".confluence-stream-label { position: absolute; left: 14px; transform: translateY(-50%); font-size: 11px; font-weight: 800; pointer-events: none; }",
].join("\n");

function trackByIndex(index: number): ConfluenceTrack {
  return CONFLUENCE_TRACKS[index]!;
}

export function ConfluenceFlow({
  streamCounts,
  streamLabels,
  overlaps,
  selected,
  available,
  onSelect,
  active,
  reducedMotion,
  height = 440,
  bare = false,
  accent,
}: ConfluenceFlowProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeRef = useRef(active);
  const selectedRef = useRef(selected);
  const startedAtRef = useRef<number | null>(null);
  activeRef.current = active;
  selectedRef.current = selected;

  const particles = useMemo<FlowParticle[]>(() => {
    const maxCount = Math.max(1, ...CONFLUENCE_TRACKS.map((track) => streamCounts[track.type] ?? 0));
    const list: FlowParticle[] = [];
    CONFLUENCE_TRACKS.forEach((track, trackIndex) => {
      const total = confluenceParticleCount(streamCounts[track.type] ?? 0, maxCount);
      for (let index = 0; index < total; index += 1) {
        const seed = (trackIndex * 131 + index * 37) % 100 / 100;
        list.push({
          track: trackIndex,
          t: (index / total + seed * 0.4) % 1,
          speed: 0.0016 + seed * 0.0026,
          size: 1.4 + ((index * 7) % 10) / 10 * 1.8,
          wobblePhase: seed * Math.PI * 2,
          wobbleAmp: 1.5 + seed * 3.5,
        });
      }
    });
    return list;
  }, [streamCounts]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!container || !canvas || !context || typeof window === "undefined") return undefined;

    let width = 1;
    let canvasHeight = 1;
    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, rect.width);
      canvasHeight = Math.max(1, rect.height);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(canvasHeight * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const resizeObserver = new ResizeObserver(() => {
      resize();
      if (reducedMotion) drawFrame(performance.now(), 1);
    });
    resizeObserver.observe(container);

    const point = (track: ConfluenceTrack, t: number) => {
      const position = cubicPoint(track, t);
      return { x: position.x * width, y: position.y * canvasHeight };
    };

    const involvedStreams = () => new Set(CONFLUENCE_NODE_STREAMS[selectedRef.current]);

    const drawFrame = (now: number, drawProgress: number) => {
      context.clearRect(0, 0, width, canvasHeight);
      const involved = involvedStreams();

      CONFLUENCE_TRACKS.forEach((track) => {
        const colors = STREAM_COLORS[track.type];
        const emphasis = involved.has(track.type) ? 1 : 0.4;
        const limit = Math.max(2, Math.round(TRACK_SAMPLES * drawProgress));
        context.beginPath();
        for (let index = 0; index <= limit; index += 1) {
          const position = point(track, index / TRACK_SAMPLES);
          if (index === 0) context.moveTo(position.x, position.y);
          else context.lineTo(position.x, position.y);
        }
        context.lineCap = "round";
        context.strokeStyle = `rgba(${colors.rgb},${(0.05 * emphasis).toFixed(3)})`;
        context.lineWidth = 9;
        context.stroke();
        context.strokeStyle = `rgba(${colors.rgb},${(0.4 * emphasis).toFixed(3)})`;
        context.lineWidth = 2;
        context.stroke();
      });

      context.globalCompositeOperation = "lighter";
      for (const particle of particles) {
        if (particle.t > drawProgress) continue;
        const track = trackByIndex(particle.track);
        const colors = STREAM_COLORS[track.type];
        const emphasis = involved.has(track.type) ? 1 : 0.32;
        const ahead = cubicPoint(track, particle.t + 0.012);
        const behind = cubicPoint(track, particle.t - 0.012);
        const dx = (ahead.x - behind.x) * width;
        const dy = (ahead.y - behind.y) * canvasHeight;
        const length = Math.max(1e-4, Math.hypot(dx, dy));
        const wobble = Math.sin(particle.wobblePhase + now * 0.0011 + particle.t * 9) * particle.wobbleAmp;
        const base = point(track, particle.t);
        const x = base.x + (-dy / length) * wobble;
        const y = base.y + (dx / length) * wobble;
        const fade = particle.t < 0.06 ? particle.t / 0.06 : particle.t > 0.94 ? (1 - particle.t) / 0.06 : 1;
        context.beginPath();
        context.arc(x, y, particle.size, 0, Math.PI * 2);
        context.fillStyle = `rgba(${colors.rgb},${(0.75 * fade * emphasis).toFixed(3)})`;
        context.shadowColor = colors.particle;
        context.shadowBlur = 7;
        context.fill();
      }
      context.shadowBlur = 0;
      context.globalCompositeOperation = "source-over";

      // 汇点与交点的光晕（按钮本体是 DOM，负责命中与可达性）。
      for (const overlap of overlaps) {
        const node = CONFLUENCE_NODES[overlap.key];
        const x = node.x * width;
        const y = node.y * canvasHeight;
        const isSelected = overlap.key === selectedRef.current;
        const pulse = reducedMotion ? 0.5 : (Math.sin(now * 0.0022) + 1) / 2;
        const radius = isSelected ? 44 + pulse * 8 : 30;
        const alpha = (isSelected ? 0.34 : 0.12) * drawProgress;
        const gradient = context.createRadialGradient(x, y, 4, x, y, radius);
        gradient.addColorStop(0, `rgba(37,244,238,${alpha.toFixed(3)})`);
        gradient.addColorStop(1, "rgba(37,244,238,0)");
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fillStyle = gradient;
        context.fill();
      }
    };

    if (reducedMotion) {
      startedAtRef.current = 0;
      drawFrame(performance.now(), 1);
      return () => resizeObserver.disconnect();
    }

    let frame = 0;
    let lastTime = performance.now();
    const step = (now: number) => {
      frame = window.requestAnimationFrame(step);
      const delta = Math.min(50, now - lastTime);
      lastTime = now;
      if (!activeRef.current && startedAtRef.current === null) return;
      if (startedAtRef.current === null) startedAtRef.current = now;
      const elapsed = now - startedAtRef.current;
      const linear = Math.min(1, elapsed / DRAW_IN_MS);
      const drawProgress = 1 - (1 - linear) ** 3;
      if (activeRef.current) {
        for (const particle of particles) {
          particle.t += particle.speed * (delta / 16.7);
          if (particle.t > 1) particle.t -= 1;
        }
      }
      drawFrame(now, drawProgress);
    };
    frame = window.requestAnimationFrame(step);

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
    };
    // selected 参与依赖只为 reducedMotion 下的静态重绘；动画模式里 startedAtRef 保证不会重播入场。
  }, [overlaps, particles, reducedMotion, selected]);

  return (
    <div className={bare ? "confluence-flow is-bare" : "confluence-flow"} data-testid="confluence-flow" ref={containerRef} style={{ height }}>
      <style>{CSS}</style>
      <canvas ref={canvasRef} />
      {CONFLUENCE_TRACKS.map((track) => (
        <span
          key={track.type}
          className="confluence-stream-label"
          style={{ top: `${track.p0.y * 100}%`, color: STREAM_COLORS[track.type].particle }}
        >
          {streamLabels[track.type]}
        </span>
      ))}
      {overlaps.map((overlap) => {
        const node = CONFLUENCE_NODES[overlap.key];
        const isSelected = overlap.key === selected;
        return (
          <button
            key={overlap.key}
            aria-label={`${overlap.label}，${available ? `${overlap.count} 个视频` : "不可判断"}`}
            aria-pressed={isSelected}
            className={`confluence-node${isSelected ? " is-selected" : ""}`}
            onClick={() => onSelect(overlap.key)}
            style={{
              left: `${node.x * 100}%`,
              top: `${node.y * 100}%`,
              ...(isSelected && accent
                ? {
                    borderColor: accent,
                    background: `${accent}26`,
                    boxShadow: `0 0 14px ${accent}59, 0 0 34px ${accent}29`,
                  }
                : null),
            }}
            type="button"
          >
            <span className="confluence-node-label">{overlap.label}</span>
            <span className="confluence-node-value" style={isSelected && accent ? { color: accent } : undefined}>
              {available ? overlap.count : "--"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
