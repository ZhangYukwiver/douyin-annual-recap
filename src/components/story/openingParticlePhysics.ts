import Matter from "matter-js";

const { Bodies, Body, Composite, Engine } = Matter;
const WALL_THICKNESS = 160;
const TARGET_FORCE = 0.000_016;
const TWO_PI = Math.PI * 2;
const UINT32_RANGE = 4_294_967_296;
const MIN_DESTINATION_RATIO = 0.34;
const MAX_DESTINATION_RATIO = 0.98;
const DIRECTION_JITTER_IN_SECTORS = 0.22;
const DESTINATION_MARGIN = 24;

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

export interface OpeningPhysicsPose {
  x: number;
  y: number;
}

interface TrackedParticle {
  body: Matter.Body;
  targetX: number;
  targetY: number;
  targetForce: number;
}

export function insetCollisionBox(width: number, height: number): { width: number; height: number } {
  return {
    width: Math.max(18, width * 0.88),
    height: Math.max(14, height * 0.88),
  };
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
  const safeStep = Math.min(safeStepCount, Math.max(1, Math.floor(step)));
  const radialBand = (MAX_DESTINATION_RATIO - MIN_DESTINATION_RATIO) / safeStepCount;
  const outerRatio = MAX_DESTINATION_RATIO - (safeStep - 1) * radialBand;
  const innerRatio = Math.max(MIN_DESTINATION_RATIO, outerRatio - radialBand * 0.9);
  const sectorWidth = TWO_PI / items.length;
  const rotation = seededUnit(seed, "rotation") * TWO_PI;
  const orderedItems = [...items].sort((left, right) => {
    const order = seededHash(seed, `order:${left.key}`) - seededHash(seed, `order:${right.key}`);
    return order || left.key.localeCompare(right.key);
  });

  return new Map(orderedItems.map((item, sectorIndex) => {
    const sectorJitter = (
      seededUnit(seed, `direction:${item.key}`) * 2 - 1
    ) * DIRECTION_JITTER_IN_SECTORS;
    const angle = rotation + (sectorIndex + 0.5 + sectorJitter) * sectorWidth;
    const distanceRatio = innerRatio + (
      outerRatio - innerRatio
    ) * seededUnit(seed, `distance:${item.key}`);
    const directionX = Math.cos(angle);
    const directionY = Math.sin(angle);
    const radiusX = Math.max(80, width / 2 - item.collisionWidth / 2 - DESTINATION_MARGIN);
    const radiusY = Math.max(80, height / 2 - item.collisionHeight / 2 - DESTINATION_MARGIN);
    const rayLimitX = Math.abs(directionX) < 0.000_001 ? Number.POSITIVE_INFINITY : radiusX / Math.abs(directionX);
    const rayLimitY = Math.abs(directionY) < 0.000_001 ? Number.POSITIVE_INFINITY : radiusY / Math.abs(directionY);
    const distance = Math.min(rayLimitX, rayLimitY) * distanceRatio;
    return [item.key, {
      x: directionX * distance,
      y: directionY * distance,
    }];
  }));
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

  constructor(width: number, height: number) {
    this.engine.gravity.x = 0;
    this.engine.gravity.y = 0;
    this.engine.gravity.scale = 0;
    const wallOptions: Matter.IChamferableBodyDefinition = { isStatic: true, restitution: 0.5 };
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
        friction: 0,
        frictionAir: spec.frictionAir ?? 0.085,
        frictionStatic: 0,
        restitution: spec.restitution ?? 0.58,
        slop: 0.02,
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
    });
    Composite.add(this.engine.world, body);
  }

  setCollisionGroup(keys: readonly string[], group: number): void {
    keys.forEach((key) => {
      const tracked = this.particles.get(key);
      if (tracked) tracked.body.collisionFilter.group = group;
    });
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
      const force = {
        x: (tracked.targetX - tracked.body.position.x) * tracked.body.mass * tracked.targetForce,
        y: (tracked.targetY - tracked.body.position.y) * tracked.body.mass * tracked.targetForce,
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
