export interface StoryParticleColor {
  text: string;
  border: string;
  surface: string;
}

export const STORY_PARTICLE_COLORS: readonly StoryParticleColor[] = [
  { text: "#25F4EE", border: "rgba(37,244,238,0.48)", surface: "rgba(37,244,238,0.10)" },
  { text: "#FE2C55", border: "rgba(254,44,85,0.48)", surface: "rgba(254,44,85,0.10)" },
  { text: "#B8F500", border: "rgba(184,245,0,0.48)", surface: "rgba(184,245,0,0.10)" },
  { text: "#FFB000", border: "rgba(255,176,0,0.48)", surface: "rgba(255,176,0,0.10)" },
  { text: "#FF5DCE", border: "rgba(255,93,206,0.48)", surface: "rgba(255,93,206,0.10)" },
  { text: "#6D8CFF", border: "rgba(109,140,255,0.48)", surface: "rgba(109,140,255,0.10)" },
  { text: "#52F59A", border: "rgba(82,245,154,0.48)", surface: "rgba(82,245,154,0.10)" },
  { text: "#FFEE58", border: "rgba(255,238,88,0.48)", surface: "rgba(255,238,88,0.10)" },
] as const;

export function storyHashString(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

export function storyParticleColor(seed: string): StoryParticleColor {
  return STORY_PARTICLE_COLORS[storyHashString(seed) % STORY_PARTICLE_COLORS.length]!;
}
