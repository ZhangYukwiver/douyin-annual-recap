export interface FluidSurfaceOptions {
  timeMs: number;
  /** 0..1，由上升速度映射出的扰动强度。 */
  agitation: number;
  /** agitation = 1 时的最大波幅（px）。 */
  amplitude: number;
  /** agitation = 0 时保留的微幅涟漪（px）。 */
  idleAmplitude: number;
  baselineY: number;
  spanStart: number;
  spanEnd: number;
  /** 封口边的 y：液面以下为实体时传底边，液面以上为实体时传顶边。 */
  closeY: number;
  samples?: number;
}

export interface FluidSurfacePaths {
  /** 液面本身的开放路径，用于描边。 */
  surface: string;
  /** 液面加封口的闭合路径，用于填充。 */
  body: string;
}

interface FluidWaveComponent {
  wavelength: number;
  speedHz: number;
  weight: number;
  phase: number;
}

// 波长与相速互不成简单整数比，叠加后不会出现肉眼可辨的循环。权重和为 1。
const WAVE_COMPONENTS: readonly FluidWaveComponent[] = [
  { wavelength: 223, speedHz: 0.36, weight: 0.46, phase: 0.7 },
  { wavelength: 127, speedHz: -0.53, weight: 0.31, phase: 2.3 },
  { wavelength: 389, speedHz: 0.22, weight: 0.23, phase: 4.9 },
];

/** 归一化液面高度，范围 [-1, 1]。 */
export function fluidSurfaceOffset(x: number, timeMs: number): number {
  let offset = 0;
  for (const component of WAVE_COMPONENTS) {
    offset += Math.sin(
      (x / component.wavelength) * Math.PI * 2
      + (timeMs / 1000) * component.speedHz * Math.PI * 2
      + component.phase,
    ) * component.weight;
  }
  return offset;
}

export function fluidSurfaceAmplitude(options: Pick<FluidSurfaceOptions, "agitation" | "amplitude" | "idleAmplitude">): number {
  const agitation = Math.min(1, Math.max(0, options.agitation));
  return options.idleAmplitude + (options.amplitude - options.idleAmplitude) * agitation;
}

export function fluidSurfacePaths(options: FluidSurfaceOptions): FluidSurfacePaths {
  const samples = options.samples ?? 24;
  const amplitude = fluidSurfaceAmplitude(options);
  const width = options.spanEnd - options.spanStart;
  const round = (value: number) => Math.round(value * 100) / 100;

  const points: Array<readonly [number, number]> = [];
  for (let index = 0; index <= samples; index += 1) {
    const x = options.spanStart + (index / samples) * width;
    points.push([x, options.baselineY + fluidSurfaceOffset(x, options.timeMs) * amplitude]);
  }

  // 中点二次曲线平滑采样折线。
  let surface = `M ${round(points[0]![0])} ${round(points[0]![1])}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const [x, y] = points[index]!;
    const [nextX, nextY] = points[index + 1]!;
    surface += ` Q ${round(x)} ${round(y)} ${round((x + nextX) / 2)} ${round((y + nextY) / 2)}`;
  }
  const last = points[points.length - 1]!;
  surface += ` L ${round(last[0])} ${round(last[1])}`;

  const body = `${surface} L ${round(options.spanEnd)} ${round(options.closeY)} L ${round(options.spanStart)} ${round(options.closeY)} Z`;
  return { surface, body };
}
