import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { AudioLines } from "lucide-react-native";

import { workspaceColors as color } from "../workspace/workspaceTheme";
import type { StoryHour } from "./storyModel";

const SIZE = 540;
const CENTER = SIZE / 2;
const BAR_INNER = 122;
const BAR_MAX = 86;
const BAR_STUB = 8;
const BAR_WIDTH = 12;
const HIT_RADIUS = 236;
const CENTER_DISC = 96;

const WEB_POINTER = Platform.OS === "web" ? ({ cursor: "pointer" } as object) : null;
const BAR_GLOW_WEB = Platform.OS === "web"
  ? ({ boxShadow: "0 0 10px rgba(37,244,238,0.65), 0 0 26px rgba(37,244,238,0.32)" } as unknown as ViewStyle)
  : null;
const PEAK_GLOW_WEB = Platform.OS === "web"
  ? ({ boxShadow: "0 0 10px rgba(254,44,85,0.55), 0 0 24px rgba(254,44,85,0.26)" } as unknown as ViewStyle)
  : null;
const TIME_GLITCH_WEB = Platform.OS === "web"
  ? ({ textShadow: "-2px 0 6px rgba(37,244,238,0.55), 2px 0 6px rgba(254,44,85,0.55)" } as unknown as TextStyle)
  : null;

export interface RhythmEqualizerProps {
  hours: StoryHour[];
  selectedHour: number;
  onSelectHour: (hour: number) => void;
  onHourKey: (event: unknown, hour: number) => void;
  onWheel: (event: unknown) => void;
  active: boolean;
  reducedMotion: boolean;
}

export function RhythmEqualizer({
  hours,
  selectedHour,
  onSelectHour,
  onHourKey,
  onWheel,
  active,
  reducedMotion,
}: RhythmEqualizerProps) {
  const [hoveredHour, setHoveredHour] = useState<number | null>(null);
  const entrance = useRef(new Animated.Value(0)).current;
  const handRotation = useRef(new Animated.Value(selectedHour)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const timeFlicker = useRef(new Animated.Value(1)).current;
  const entranceStarted = useRef(false);
  const previousHour = useRef(selectedHour);

  const maxCount = Math.max(1, ...hours.map((hour) => hour.count));
  const peakHour = useMemo(() => {
    let peak: StoryHour | null = null;
    for (const hour of hours) {
      if (hour.count > 0 && (!peak || hour.count > peak.count)) peak = hour;
    }
    return peak?.hour ?? null;
  }, [hours]);

  useEffect(() => {
    if (!active || entranceStarted.current) return;
    entranceStarted.current = true;
    if (reducedMotion) {
      entrance.setValue(1);
      return;
    }
    Animated.timing(entrance, {
      toValue: 1,
      duration: 1_150,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }, [active, entrance, reducedMotion]);

  useEffect(() => {
    if (reducedMotion) {
      entrance.setValue(entranceStarted.current || active ? 1 : 0);
    }
  }, [active, entrance, reducedMotion]);

  useEffect(() => {
    handRotation.stopAnimation();
    if (reducedMotion) {
      handRotation.setValue(selectedHour);
      return;
    }
    Animated.timing(handRotation, {
      toValue: selectedHour,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }, [handRotation, reducedMotion, selectedHour]);

  useEffect(() => {
    pulse.stopAnimation();
    if (reducedMotion || !active) {
      pulse.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 760, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== "web" }),
      Animated.timing(pulse, { toValue: 0, duration: 760, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== "web" }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [active, pulse, reducedMotion]);

  useEffect(() => {
    if (previousHour.current === selectedHour) return;
    previousHour.current = selectedHour;
    if (reducedMotion) return;
    timeFlicker.stopAnimation();
    timeFlicker.setValue(1);
    Animated.sequence([
      Animated.timing(timeFlicker, { toValue: 0.32, duration: 55, easing: Easing.linear, useNativeDriver: Platform.OS !== "web" }),
      Animated.timing(timeFlicker, { toValue: 1, duration: 140, easing: Easing.out(Easing.quad), useNativeDriver: Platform.OS !== "web" }),
    ]).start();
  }, [reducedMotion, selectedHour, timeFlicker]);

  const handAngle = handRotation.interpolate({ inputRange: [0, 24], outputRange: ["0deg", "360deg"] });
  const selectedData = hours[selectedHour] ?? null;

  return (
    <View
      accessibilityLabel="24 小时节拍均衡器，滚动鼠标滚轮或使用方向键切换小时"
      style={styles.wrap}
      {...(Platform.OS === "web" ? { dataSet: { storyReveal: "true" } } : {})}
      {...({ onWheel } as Record<string, unknown>)}
    >
      <View style={styles.outerRing} />

      {hours.map((hour) => {
        const ratio = hour.count / maxCount;
        const barLength = hour.count === 0 ? BAR_STUB : BAR_STUB + Math.round(ratio * (BAR_MAX - BAR_STUB));
        const selected = hour.hour === selectedHour;
        const hovered = hour.hour === hoveredHour;
        const isPeak = hour.hour === peakHour && !selected;
        const windowStart = (hour.hour / 24) * 0.55;
        const grow = entrance.interpolate({
          inputRange: [0, windowStart, Math.min(1, windowStart + 0.45), 1],
          outputRange: [0, 0, 1, 1],
          easing: Easing.out(Easing.back(1.7)),
          extrapolate: "clamp",
        });
        const barColor = hour.count === 0
          ? "rgba(255,255,255,0.07)"
          : selected
            ? color.cyan
            : isPeak
              ? "rgba(254,44,85,0.78)"
              : `rgba(37,244,238,${(0.22 + ratio * 0.55 + (hovered ? 0.18 : 0)).toFixed(3)})`;
        return (
          <View
            key={hour.hour}
            pointerEvents="none"
            style={[
              styles.barSlot,
              {
                transform: [{ rotate: `${hour.hour * 15}deg` }],
              },
            ]}
          >
            <Animated.View
              style={[
                styles.bar,
                {
                  height: barLength,
                  backgroundColor: barColor,
                  transform: [{ scaleY: grow }],
                },
                selected && BAR_GLOW_WEB,
                isPeak && PEAK_GLOW_WEB,
              ]}
            />
            {selected ? (
              <Animated.View
                style={[
                  styles.bar,
                  styles.barPulse,
                  {
                    height: barLength,
                    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0, 0.55] }),
                    transform: [
                      { scaleY: Animated.multiply(grow, pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.14] })) },
                      { scaleX: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) },
                    ],
                  },
                ]}
              />
            ) : null}
          </View>
        );
      })}

      <Animated.View pointerEvents="none" style={[styles.hand, { transform: [{ rotate: handAngle }] }]}>
        <View style={styles.handLine} />
        <View style={styles.handTip} />
      </Animated.View>

      {hours.map((hour) => {
        const angle = (hour.hour / 24) * Math.PI * 2 - Math.PI / 2;
        const left = CENTER + Math.cos(angle) * HIT_RADIUS;
        const top = CENTER + Math.sin(angle) * HIT_RADIUS;
        const selected = hour.hour === selectedHour;
        return (
          <Pressable
            key={hour.hour}
            accessibilityLabel={`${String(hour.hour).padStart(2, "0")}:00，${hour.count} 条可靠记录`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onHoverIn={() => setHoveredHour(hour.hour)}
            onHoverOut={() => setHoveredHour((current) => current === hour.hour ? null : current)}
            onPress={() => onSelectHour(hour.hour)}
            style={({ pressed }) => [
              styles.hourButton,
              { left: left - 22, top: top - 22 },
              selected && styles.hourButtonSelected,
              pressed && styles.pressed,
              WEB_POINTER,
            ]}
            {...({
              dataSet: { storyHour: String(hour.hour) },
              onKeyDown: (event: unknown) => onHourKey(event, hour.hour),
              tabIndex: selected ? 0 : -1,
            } as Record<string, unknown>)}
          >
            <Text style={[styles.hourText, selected && styles.hourTextSelected]}>
              {String(hour.hour).padStart(2, "0")}
            </Text>
          </Pressable>
        );
      })}

      <View style={styles.centerDisc}>
        <AudioLines color={color.cyan} size={20} />
        <Animated.Text style={[styles.centerTime, TIME_GLITCH_WEB, { opacity: timeFlicker }]}>
          {String(selectedHour).padStart(2, "0")}:00
        </Animated.Text>
        <Text style={styles.centerCount}>{selectedData?.count ?? 0} 条可靠记录</Text>
        {selectedData?.topTopic ? (
          <Text numberOfLines={1} style={styles.centerTopic}>#{selectedData.topTopic}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "relative", width: SIZE, height: SIZE, flexShrink: 0, alignItems: "center", justifyContent: "center" },
  outerRing: {
    position: "absolute",
    top: CENTER - (HIT_RADIUS + 24),
    left: CENTER - (HIT_RADIUS + 24),
    width: (HIT_RADIUS + 24) * 2,
    height: (HIT_RADIUS + 24) * 2,
    borderRadius: HIT_RADIUS + 24,
    borderWidth: 1,
    borderColor: color.borderSoft,
  },
  barSlot: {
    position: "absolute",
    top: CENTER - BAR_INNER - BAR_MAX,
    left: CENTER - BAR_WIDTH / 2,
    width: BAR_WIDTH,
    height: BAR_MAX,
    justifyContent: "flex-end",
    // ponytail: 故事页只在 ≥1024px 的 web 端展示（与 DesktopCardSwap 同前提），原生端不做圆盘变换适配。
    ...(Platform.OS === "web"
      ? ({ transformOrigin: `${BAR_WIDTH / 2}px ${BAR_MAX + BAR_INNER}px` } as unknown as ViewStyle)
      : null),
  },
  bar: {
    width: BAR_WIDTH,
    borderRadius: BAR_WIDTH / 2,
    ...(Platform.OS === "web" ? ({ transformOrigin: "50% 100%" } as unknown as ViewStyle) : null),
  },
  barPulse: {
    position: "absolute",
    bottom: 0,
    backgroundColor: color.cyan,
  },
  hand: {
    position: "absolute",
    top: CENTER - BAR_INNER,
    left: CENTER - 2,
    width: 4,
    height: BAR_INNER,
    alignItems: "center",
    ...(Platform.OS === "web"
      ? ({ transformOrigin: `2px ${BAR_INNER}px` } as unknown as ViewStyle)
      : null),
  },
  handLine: { flex: 1, width: 3, borderRadius: 2, backgroundColor: "rgba(37,244,238,0.45)", marginTop: 14 },
  handTip: {
    position: "absolute",
    top: 4,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: color.cyan,
    ...(Platform.OS === "web"
      ? ({ boxShadow: "0 0 8px rgba(37,244,238,0.85), 0 0 20px rgba(37,244,238,0.4)" } as unknown as ViewStyle)
      : null),
  },
  hourButton: {
    position: "absolute",
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "transparent",
  },
  hourButtonSelected: { borderColor: color.cyan, backgroundColor: color.cyanSoft },
  hourText: { color: color.textMuted, fontSize: 10, fontWeight: "700" },
  hourTextSelected: { color: color.text, fontWeight: "900" },
  pressed: { opacity: 0.72 },
  centerDisc: {
    width: CENTER_DISC * 2,
    height: CENTER_DISC * 2,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: CENTER_DISC,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: "rgba(11,12,15,0.92)",
  },
  centerTime: { color: color.text, fontSize: 40, lineHeight: 46, fontWeight: "900", marginTop: 6, fontVariant: ["tabular-nums"] },
  centerCount: { color: color.textMuted, fontSize: 10, marginTop: 4 },
  centerTopic: { maxWidth: CENTER_DISC * 2 - 36, color: color.cyan, fontSize: 11, fontWeight: "800", marginTop: 8 },
});
