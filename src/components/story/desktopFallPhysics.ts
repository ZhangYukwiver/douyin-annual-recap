export interface DesktopFallSpec {
  height: number;
  width: number;
}

export interface DesktopFallBody {
  angle: number;
  angularVelocity: number;
  done: boolean;
  height: number;
  releaseAt: number;
  vx: number;
  vy: number;
  width: number;
  x: number;
  y: number;
}

export const DESKTOP_FALL = {
  gravity: 2_400,
  holdBefore: 1.0,
  releaseWindow: 0.55,
  iconEnterAt: 2.35,
  iconEnterDuration: 1.55,
  maxStep: 0.032,
} as const;

// mulberry32：确定性随机，让坠落每次回放一致、测试可复现
export function createFallRng(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d_2b_79_f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function seedFallBodies(specs: readonly DesktopFallSpec[], rng: () => number): DesktopFallBody[] {
  return specs.map(({ height, width }) => ({
    angle: 0,
    // 小零件转得快、大零件转得慢（转动惯量近似）
    angularVelocity: (rng() - 0.5) * 2 * (0.75 + (170 / (width + height)) * 1.7),
    done: false,
    height,
    releaseAt: DESKTOP_FALL.holdBefore + rng() * DESKTOP_FALL.releaseWindow,
    vx: (rng() - 0.5) * 150,
    vy: -(15 + rng() * 135),
    width,
    x: 0,
    y: 0,
  }));
}

// ponytail: 手写重力积分（自由落体无碰撞需求）；要碰撞、堆叠再换 matter-js
export function stepFallBodies(bodies: DesktopFallBody[], dt: number, elapsed: number, exitY: number): boolean {
  let allDone = true;
  for (const body of bodies) {
    if (body.done) continue;
    if (elapsed < body.releaseAt) {
      allDone = false;
      continue;
    }
    body.vy += DESKTOP_FALL.gravity * dt;
    body.x += body.vx * dt;
    body.y += body.vy * dt;
    body.angle += body.angularVelocity * dt;
    if (body.y > exitY + body.width + body.height) body.done = true;
    else allDone = false;
  }
  return allDone;
}
