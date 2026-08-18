import Matter from "matter-js";

const { Bodies, Body, Composite, Engine } = Matter;
const WALL_THICKNESS = 160;
const TARGET_FORCE = 0.000_016;
const UINT32_RANGE = 4_294_967_296;
const DESTINATION_MARGIN = 24;
const COLUMN_JITTER = 0.34;
const BAND_INSET = 0.16;
const COLLISION_WIDTH_SCALE = 0.94;
const COLLISION_HEIGHT_SCALE = 0.92;
const WALL_RESTITUTION = 0.08;

export interface OpeningDestinationItem {
  key: string;
  collisionWidth: number;
  collisionHeight: number;
}

export interface OpeningDestinationOptions {
  seed: number;
  width: number;
  height: number;
  step: number;
  stepCount: number;
  items: readonly OpeningDestinationItem[];
}

export interface OpeningPhysicsSpec {
  key: string;
  targetX: number;
  targetY: number;
  collisionWidth: number;
  collisionHeight: number;
  angle: number;
  spawnX: number;
  spawnY: number;
  velocityX: number;
  velocityY: number;
  isStatic?: boolean;
  frictionAir?: number;
  restitution?: number;
  targetForce?: number;
  collisionGroup?: number;
}

export interface OpeningPhysicsOptions {
  gravityY?: number;
  fallWhenUnsupported?: boolean;
}

export interface OpeningPhysicsPose {
  x: number;
  y: number;
}

export interface OpeningParticleExitPlan extends OpeningPhysicsPose {
  radialProgress: number;
}

interface TrackedParticle {
  body: Matter.Body;
  targetX: number;
  targetY: number;
  targetForce: number;
  verticalCatchupGap: number;
}

export const FIXED_STEP_MS = 1000 / 60;
const MAX_STEP_BACKLOG_MS = 100;

// ponytail: fixed-step accumulator so a 120Hz display doesn't run the flight at double speed.
export function consumeFixedSteps(accumulator: number, deltaMs: number): { steps: number; remainder: number } {
  const pending = Math.min(accumulator + Math.max(0, deltaMs), MAX_STEP_BACKLOG_MS);
  const steps = Math.floor(pending / FIXED_STEP_MS);
  return { steps, remainder: pending - steps * FIXED_STEP_MS };
}

export function insetCollisionBox(width: number, fontSize: number): { width: number; height: number } {
  return {
    width: Math.max(12, width * COLLISION_WIDTH_SCALE),
    height: Math.max(8, fontSize * COLLISION_HEIGHT_SCALE),
  };
}

/**
 * Logo 的放大中心落在圆形音符内部一块约 22px 的稳定实心区域。
 * 这个比例保证那块区域放大后覆盖视口对角线，最终不会残留黑角。
 */
export function openingLogoRevealScale(width: number, height: number): number {
  const halfDiagonal = Math.hypot(Math.max(1, width) / 2, Math.max(1, height) / 2);
  return Math.max(1, halfDiagonal / 22 + 1);
}

/**
 * 给词条安排一条从当前位置沿 Logo 外法线方向离开屏幕的路径。
 * `radialProgress` 用来让离中心近的词条更早被扩张轮廓碰到。
 */
export function planOpeningParticleExit(
  key: string,
  x: number,
  y: number,
  width: number,
  height: number,
): OpeningParticleExitPlan {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const distance = Math.hypot(x, y);
  const fallbackAngle = seededUnit(0x51_9f_a3_2d, `exit:${key}`) * Math.PI * 2;
  const normalX = distance > 1 ? x / distance : Math.cos(fallbackAngle);
  const normalY = distance > 1 ? y / distance : Math.sin(fallbackAngle);
  const margin = Math.max(160, Math.min(safeWidth, safeHeight) * 0.24);
  const distanceToVerticalEdge = Math.abs(normalX) > 0.000_1
    ? (safeWidth / 2 + margin) / Math.abs(normalX)
    : Number.POSITIVE_INFINITY;
  const distanceToHorizontalEdge = Math.abs(normalY) > 0.000_1
    ? (safeHeight / 2 + margin) / Math.abs(normalY)
    : Number.POSITIVE_INFINITY;
  const exitDistance = Math.min(distanceToVerticalEdge, distanceToHorizontalEdge);

  return {
    x: normalX * exitDistance - x,
    y: normalY * exitDistance - y,
    radialProgress: clamp(distance / Math.hypot(safeWidth / 2, safeHeight / 2), 0, 1),
  };
}

/**
 * 水位线：场景中心为原点、y 向下为正，返回第 `step` 层的下沿。
 * 第 1 步的下沿是屏幕最底部，之后逐层上移，第 `stepCount` 步填到最顶。
 */
export function openingSurfaceY(height: number, step: number, stepCount: number): number {
  const safeStepCount = Math.max(1, Math.floor(stepCount));
  const safeStep = Math.min(safeStepCount + 1, Math.max(1, Math.floor(step)));
  return height / 2 - (safeStep - 1) * (height / safeStepCount);
}

/**
 * 词条按出现顺序从底边进入，但最终要让最早出现的一层被后续内容顶到最上方。
 */
export function openingPileDestinationStep(revealStep: number, stepCount: number): number {
  const safeStepCount = Math.max(1, Math.floor(stepCount));
  const safeRevealStep = Math.min(safeStepCount, Math.max(1, Math.floor(revealStep)));
  return safeStepCount - safeRevealStep + 1;
}

export function planOpeningDestinations({
  seed,
  width,
  height,
  step,
  stepCount,
  items,
}: OpeningDestinationOptions): Map<string, OpeningPhysicsPose> {
  if (items.length === 0) return new Map();

  const safeStepCount = Math.max(1, Math.floor(stepCount));
  const bandHeight = height / safeStepCount;
  const bandBottom = openingSurfaceY(height, step, stepCount);
  const columnWidth = width / items.length;
  const orderedItems = [...items].sort((left, right) => {
    const order = seededHash(seed, `order:${left.key}`) - seededHash(seed, `order:${right.key}`);
    return order || left.key.localeCompare(right.key);
  });

  return new Map(orderedItems.map((item, columnIndex) => {
    const limitX = Math.max(0, width / 2 - item.collisionWidth / 2 - DESTINATION_MARGIN);
    const limitY = Math.max(0, height / 2 - item.collisionHeight / 2 - DESTINATION_MARGIN);
    const columnJitter = (
      seededUnit(seed, `column:${item.key}`) * 2 - 1
    ) * columnWidth * COLUMN_JITTER;
    const depth = BAND_INSET + (1 - BAND_INSET * 2) * seededUnit(seed, `depth:${item.key}`);
    return [item.key, {
      x: clamp(-width / 2 + (columnIndex + 0.5) * columnWidth + columnJitter, -limitX, limitX),
      y: clamp(bandBottom - bandHeight * depth, -limitY, limitY),
    }];
  }));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function seededHash(seed: number, value: string): number {
  let hash = (Math.floor(seed) >>> 0) ^ 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function seededUnit(seed: number, value: string): number {
  return seededHash(seed, value) / UINT32_RANGE;
}

export class OpeningParticlePhysics {
  private readonly engine = Engine.create();
  private readonly particles = new Map<string, TrackedParticle>();
  private readonly fallWhenUnsupported: boolean;

  constructor(width: number, height: number, options: OpeningPhysicsOptions = {}) {
    const gravityY = Number.isFinite(options.gravityY) ? options.gravityY ?? 0 : 0;
    this.fallWhenUnsupported = options.fallWhenUnsupported ?? false;
    this.engine.gravity.x = 0;
    this.engine.gravity.y = gravityY;
    this.engine.gravity.scale = gravityY === 0 ? 0 : 0.001;
    const wallOptions: Matter.IChamferableBodyDefinition = {
      friction: 0.04,
      frictionStatic: 0.12,
      isStatic: true,
      restitution: WALL_RESTITUTION,
    };
    Composite.add(this.engine.world, [
      Bodies.rectangle(width / 2, -WALL_THICKNESS / 2, width + WALL_THICKNESS * 2, WALL_THICKNESS, wallOptions),
      Bodies.rectangle(width / 2, height + WALL_THICKNESS / 2, width + WALL_THICKNESS * 2, WALL_THICKNESS, wallOptions),
      Bodies.rectangle(-WALL_THICKNESS / 2, height / 2, WALL_THICKNESS, height + WALL_THICKNESS * 2, wallOptions),
      Bodies.rectangle(width + WALL_THICKNESS / 2, height / 2, WALL_THICKNESS, height + WALL_THICKNESS * 2, wallOptions),
    ]);
  }

  add(spec: OpeningPhysicsSpec): void {
    const body = Bodies.rectangle(
      spec.spawnX,
      spec.spawnY,
      spec.collisionWidth,
      spec.collisionHeight,
      {
        angle: spec.angle,
        chamfer: { radius: Math.min(6, spec.collisionHeight * 0.22) },
        friction: 0.04,
        frictionAir: spec.frictionAir ?? 0.085,
        frictionStatic: 0.12,
        restitution: spec.restitution ?? 0.58,
        slop: 0.08,
        isStatic: spec.isStatic,
        ...(spec.collisionGroup === undefined ? {} : {
          collisionFilter: {
            category: 0x0001,
            group: spec.collisionGroup,
            mask: 0xFFFF_FFFF,
          },
        }),
      },
    );
    if (!spec.isStatic) {
      Body.setInertia(body, Infinity);
      Body.setVelocity(body, { x: spec.velocityX, y: spec.velocityY });
    }
    this.particles.set(spec.key, {
      body,
      targetX: spec.targetX,
      targetY: spec.targetY,
      targetForce: spec.targetForce ?? TARGET_FORCE,
      verticalCatchupGap: spec.collisionHeight * 0.5,
    });
    Composite.add(this.engine.world, body);
  }

  setCollisionGroup(keys: readonly string[], group: number): void {
    keys.forEach((key) => {
      const tracked = this.particles.get(key);
      if (tracked) tracked.body.collisionFilter.group = group;
    });
  }

  setTarget(key: string, targetX: number, targetY: number): void {
    const tracked = this.particles.get(key);
    if (!tracked || tracked.body.isStatic) return;
    tracked.targetX = targetX;
    tracked.targetY = targetY;
  }

  setFrictionAir(keys: readonly string[], frictionAir: number): void {
    keys.forEach((key) => {
      const tracked = this.particles.get(key);
      if (tracked && !tracked.body.isStatic) tracked.body.frictionAir = frictionAir;
    });
  }

  advance(deltaMs: number): Map<string, OpeningPhysicsPose> {
    this.particles.forEach((tracked) => {
      if (tracked.body.isStatic) return;
      const targetDeltaY = tracked.targetY - tracked.body.position.y;
      // 上推只在词条落后时托住它；被碰撞顶高的词条由重力自然落回。
      const guidedDeltaY = this.fallWhenUnsupported
        ? Math.min(0, targetDeltaY + tracked.verticalCatchupGap)
        : targetDeltaY;
      const force = {
        x: (tracked.targetX - tracked.body.position.x) * tracked.body.mass * tracked.targetForce,
        y: guidedDeltaY * tracked.body.mass * tracked.targetForce,
      };
      Body.applyForce(tracked.body, tracked.body.position, force);
    });
    Engine.update(this.engine, Math.min(1000 / 60, Math.max(8, deltaMs)));
    return this.poses();
  }

  poses(): Map<string, OpeningPhysicsPose> {
    return new Map([...this.particles].map(([key, tracked]) => [key, {
      x: tracked.body.position.x,
      y: tracked.body.position.y,
    }]));
  }

  dispose(): void {
    Composite.clear(this.engine.world, false, true);
    Engine.clear(this.engine);
    this.particles.clear();
  }
}
