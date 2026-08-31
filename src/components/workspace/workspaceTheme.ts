import { Platform } from "react-native";

// 档案馆风：与故事页（ReportWorkspace）同一套暖金 + 冷青 + 近黑纸面
export const workspaceColors = {
  canvas: "#0A0B0B",
  sidebar: "#0E1010",
  surface: "#131717",
  surfaceRaised: "#181B1A",
  surfaceMuted: "#242726",
  border: "#3A3228",
  borderSoft: "#2A2620",
  frame: "#6E5D49",
  text: "#EFDFCC",
  textSecondary: "#CFC1B0",
  textMuted: "#7C7266",
  accent: "#C59861",
  accentPressed: "#A87F4C",
  accentAction: "#B07E40",
  accentSoft: "#2A2114",
  figure: "#E3C8A6",
  cyan: "#6E8C8F",
  cyanSoft: "#182223",
  green: "#A9D0D3",
  greenSoft: "#16211F",
  amber: "#B68B57",
  amberSoft: "#241C12",
  danger: "#B4664F",
  white: "#EFE6D8",
  black: "#0A0B0B",
  scrim: "rgba(10,11,11,0.72)",
} as const;

export const workspaceFonts = {
  serif: Platform.OS === "web" ? "Georgia, 'Songti SC', 'STSong', 'SimSun', serif" : undefined,
  didot: Platform.OS === "web" ? "Didot, 'Bodoni 72', Georgia, 'Songti SC', serif" : undefined,
} as const;

// ponytail: 档案页面是直角的，圆角 token 统一归零，不再逐处改 borderRadius
export const workspaceRadii = {
  small: 0,
  medium: 0,
  large: 0,
} as const;
