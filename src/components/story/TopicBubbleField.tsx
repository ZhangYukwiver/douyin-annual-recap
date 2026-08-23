import React, { useEffect, useMemo, useRef } from "react";
import Matter from "matter-js";

import { storyParticleColor } from "./storyPalette";

const { Bodies, Body, Composite, Engine, Mouse, MouseConstraint, Query } = Matter;

const WALL_THICKNESS = 220;
const CENTER_PULL = 0.000_002_6;
const MIN_RADIUS = 36;
const MAX_RADIUS = 64;
const CLICK_SLOP = 8;
const CLICK_MAX_MS = 520;

export interface TopicBubbleDatum {
  name: string;
  label: string;
  count: number;
}

export interface TopicBubbleFieldProps {
  topics: TopicBubbleDatum[];
  selectedName: string | null;
  onSelect: (name: string) => void;
  active: boolean;
  reducedMotion: boolean;
  height?: number;
  /** 放进章节卡片里时去掉自己的边框和底色，融进卡片。 */
  bare?: boolean;
}

interface BubbleSpec {
  name: string;
  label: string;
  count: number;
  radius: number;
  color: { text: string; border: string; surface: string };
}

const CSS = [
  ".topic-bubble-field { position: relative; width: 100%; overflow: hidden; border: 1px solid #24262C; border-radius: 8px; background: radial-gradient(circle at 30% 20%, rgba(37,244,238,0.05), transparent 52%), radial-gradient(circle at 74% 82%, rgba(254,44,85,0.05), transparent 52%), #101116; }",
  ".topic-bubble-field.is-bare { border: 0; border-radius: 0; background: transparent; }",
  ".topic-bubble { position: absolute; top: 0; left: 0; will-change: transform; }",
  ".topic-bubble-skin { width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; border-radius: 50%; border: 1px solid; background: rgba(17,18,22,0.9); transform: scale(0); transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.22s ease, border-color 0.22s ease, background-color 0.22s ease; cursor: grab; user-select: none; -webkit-user-select: none; touch-action: none; }",
  ".topic-bubble-field.is-live .topic-bubble-skin { transform: scale(1); }",
  ".topic-bubble-skin:active { cursor: grabbing; }",
  ".topic-bubble-field.is-live .topic-bubble-skin:hover, .topic-bubble-static .topic-bubble-skin:hover { transform: scale(1.05); }",
  ".topic-bubble-label { font-weight: 900; line-height: 1.25; max-width: 86%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: center; }",
  ".topic-bubble-count { font-size: 10px; font-weight: 800; color: rgba(255,255,255,0.55); }",
  ".topic-bubble-static { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; justify-content: center; padding: 28px; }",
  ".topic-bubble-static .topic-bubble { position: static; }",
  ".topic-bubble-static .topic-bubble-skin, .topic-bubble-field.is-live .topic-bubble-static .topic-bubble-skin { transform: scale(1); }",
].join("\n");

// ponytail: 气泡按容器高度等比放大，章节卡片里的高场不会只剩几颗小球。
function bubbleRadius(count: number, maxCount: number, fieldHeight: number): number {
  const ratio = maxCount > 0 ? Math.sqrt(count / maxCount) : 0;
  const scale = Math.min(1.6, Math.max(1, fieldHeight / 470));
  return Math.round((MIN_RADIUS + ratio * (MAX_RADIUS - MIN_RADIUS)) * scale);
}

export function TopicBubbleField({
  topics,
  selectedName,
  onSelect,
  active,
  reducedMotion,
  height = 470,
  bare = false,
}: TopicBubbleFieldProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bubbleRefs = useRef(new Map<string, HTMLDivElement>());
  const activeRef = useRef(active);
  const onSelectRef = useRef(onSelect);
  activeRef.current = active;
  onSelectRef.current = onSelect;

  const specs = useMemo<BubbleSpec[]>(() => {
    const maxCount = Math.max(1, ...topics.map((topic) => topic.count));
    return topics.map((topic) => ({
      name: topic.name,
      label: topic.label,
      count: topic.count,
      radius: bubbleRadius(topic.count, maxCount, height),
      color: storyParticleColor(`topic-bubble:${topic.name}`),
    }));
  }, [height, topics]);
  const topicsSignature = useMemo(
    () => specs.map((spec) => `${spec.name}:${spec.count}`).join("|"),
    [specs],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container || reducedMotion || typeof window === "undefined") return undefined;

    window.requestAnimationFrame(() => container.classList.add("is-live"));

    const engine = Engine.create();
    engine.gravity.y = 0;
    let walls: Matter.Body[] = [];
    const bodies = new Map<string, Matter.Body>();

    const rect = () => container.getBoundingClientRect();
    const spawn = () => {
      const { width, height: fieldHeight } = rect();
      const ringRadius = Math.min(width, fieldHeight) * 0.3;
      specs.forEach((spec, index) => {
        const angle = (index / Math.max(1, specs.length)) * Math.PI * 2 - Math.PI / 2;
        const jitter = ((index * 7919) % 23) - 11;
        const body = Bodies.circle(
          width / 2 + Math.cos(angle) * (ringRadius + jitter),
          fieldHeight / 2 + Math.sin(angle) * (ringRadius * 0.72 + jitter),
          spec.radius,
          { restitution: 0.86, frictionAir: 0.028, friction: 0.002 },
        );
        bodies.set(spec.name, body);
        Composite.add(engine.world, body);
      });
    };
    const buildWalls = () => {
      walls.forEach((wall) => Composite.remove(engine.world, wall));
      const { width, height: fieldHeight } = rect();
      walls = [
        Bodies.rectangle(width / 2, -WALL_THICKNESS / 2, width + WALL_THICKNESS * 2, WALL_THICKNESS, { isStatic: true }),
        Bodies.rectangle(width / 2, fieldHeight + WALL_THICKNESS / 2, width + WALL_THICKNESS * 2, WALL_THICKNESS, { isStatic: true }),
        Bodies.rectangle(-WALL_THICKNESS / 2, fieldHeight / 2, WALL_THICKNESS, fieldHeight + WALL_THICKNESS * 2, { isStatic: true }),
        Bodies.rectangle(width + WALL_THICKNESS / 2, fieldHeight / 2, WALL_THICKNESS, fieldHeight + WALL_THICKNESS * 2, { isStatic: true }),
      ];
      Composite.add(engine.world, walls);
    };
    spawn();
    buildWalls();

    const mouse = Mouse.create(container);
    // Matter 以 passive:false 监听 wheel，会干扰故事页滚动，这里移除。
    const wheelHandler = (mouse as unknown as { mousewheel: EventListener }).mousewheel;
    container.removeEventListener("wheel", wheelHandler);
    const mouseConstraint = MouseConstraint.create(engine, {
      mouse,
      constraint: { stiffness: 0.14, damping: 0.24, render: { visible: false } },
    });
    Composite.add(engine.world, mouseConstraint);

    // 点击与拖拽区分：位移小、耗时短的按压视为选择该标签。
    let pressStart: { x: number; y: number; time: number } | null = null;
    const onPointerDown = (event: PointerEvent) => {
      pressStart = { x: event.clientX, y: event.clientY, time: performance.now() };
    };
    const onPointerUp = (event: PointerEvent) => {
      const start = pressStart;
      pressStart = null;
      if (!start) return;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > CLICK_SLOP) return;
      if (performance.now() - start.time > CLICK_MAX_MS) return;
      const bounds = rect();
      const point = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
      const hit = Query.point([...bodies.values()], point)[0];
      if (!hit) return;
      for (const [name, body] of bodies) {
        if (body === hit) {
          onSelectRef.current(name);
          return;
        }
      }
    };
    container.addEventListener("pointerdown", onPointerDown);
    container.addEventListener("pointerup", onPointerUp);

    const resizeObserver = new ResizeObserver(buildWalls);
    resizeObserver.observe(container);

    // 入场级联结束后清掉延迟，避免 hover 反馈跟着延迟。
    const delayReset = window.setTimeout(() => {
      for (const element of bubbleRefs.current.values()) {
        const skin = element.firstElementChild as HTMLElement | null;
        if (skin) skin.style.transitionDelay = "0ms";
      }
    }, 1_400);

    let frame = 0;
    let lastTime = performance.now();
    const step = (now: number) => {
      frame = window.requestAnimationFrame(step);
      const delta = now - lastTime;
      lastTime = now;
      if (!activeRef.current) return;
      const bounds = rect();
      for (const body of bodies.values()) {
        Body.applyForce(body, body.position, {
          x: (bounds.width / 2 - body.position.x) * body.mass * CENTER_PULL,
          y: (bounds.height / 2 - body.position.y) * body.mass * CENTER_PULL,
        });
      }
      // 固定步长推进，帧率抖动时最多补 3 步，避免穿透。
      const steps = Math.min(3, Math.max(1, Math.round(delta / (1000 / 60))));
      for (let index = 0; index < steps; index += 1) Engine.update(engine, 1000 / 60);
      for (const [name, body] of bodies) {
        const element = bubbleRefs.current.get(name);
        const spec = specs.find((candidate) => candidate.name === name);
        if (!element || !spec) continue;
        element.style.transform = `translate3d(${(body.position.x - spec.radius).toFixed(2)}px, ${(body.position.y - spec.radius).toFixed(2)}px, 0)`;
      }
    };
    frame = window.requestAnimationFrame(step);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(delayReset);
      resizeObserver.disconnect();
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointerup", onPointerUp);
      Mouse.clearSourceEvents(mouse);
      Composite.clear(engine.world, false);
      Engine.clear(engine);
    };
    // topicsSignature 表达了 specs 的全部可变输入。
  }, [reducedMotion, topicsSignature]); // eslint-disable-line react-hooks/exhaustive-deps

  const renderBubble = (spec: BubbleSpec, index: number) => {
    const selected = spec.name === selectedName;
    const diameter = spec.radius * 2;
    const fontSize = Math.max(11, Math.min(16, Math.round(spec.radius * 0.3)));
    return (
      <div
        key={spec.name}
        className="topic-bubble"
        ref={(node) => {
          if (node) bubbleRefs.current.set(spec.name, node);
          else bubbleRefs.current.delete(spec.name);
        }}
        style={{ width: diameter, height: diameter }}
      >
        <button
          aria-label={`话题 ${spec.label}，${spec.count} 条内容`}
          aria-pressed={selected}
          className="topic-bubble-skin"
          onClick={reducedMotion ? () => onSelect(spec.name) : undefined}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            onSelect(spec.name);
          }}
          style={{
            width: "100%",
            height: "100%",
            padding: 0,
            borderColor: selected ? spec.color.text : spec.color.border,
            backgroundColor: selected ? spec.color.surface : "rgba(17,18,22,0.9)",
            boxShadow: selected
              ? `0 0 16px ${spec.color.border}, 0 0 38px ${spec.color.surface}`
              : "none",
            transitionDelay: reducedMotion ? undefined : `${index * 45}ms`,
          }}
          tabIndex={0}
          type="button"
        >
          <span className="topic-bubble-label" style={{ color: spec.color.text, fontSize }}>
            {spec.label}
          </span>
          <span className="topic-bubble-count">{spec.count}</span>
        </button>
      </div>
    );
  };

  return (
    <div
      className={bare ? "topic-bubble-field is-bare" : "topic-bubble-field"}
      data-testid="topic-bubble-field"
      ref={containerRef}
      style={{ height }}
    >
      <style>{CSS}</style>
      {reducedMotion ? (
        <div className="topic-bubble-static" style={{ minHeight: height }}>
          {specs.map(renderBubble)}
        </div>
      ) : (
        specs.map(renderBubble)
      )}
    </div>
  );
}
