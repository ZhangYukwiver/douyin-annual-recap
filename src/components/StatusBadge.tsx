import { StyleSheet, Text, View } from "react-native";

import { colors } from "../theme";

export type StatusBadgeState = "ready" | "not_configured" | "invalid" | "manual_action";

const labels: Record<StatusBadgeState, string> = {
  ready: "就绪",
  not_configured: "未配置",
  invalid: "需修正",
  manual_action: "待处理",
};

export function StatusBadge({ state }: { state: StatusBadgeState }) {
  return (
    <View
      style={[
        styles.badge,
        state === "ready" && styles.ready,
        state === "invalid" && styles.invalid,
        state === "manual_action" && styles.manual,
      ]}
    >
      <Text
        style={[
          styles.label,
          state === "ready" && styles.readyText,
          state === "invalid" && styles.invalidText,
          state === "manual_action" && styles.manualText,
        ]}
      >
        {labels[state]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minWidth: 58,
    height: 24,
    paddingHorizontal: 8,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.inkSoft,
  },
  label: { color: colors.secondaryText, fontSize: 12, fontWeight: "700" },
  ready: { backgroundColor: colors.greenSoft },
  readyText: { color: colors.green },
  invalid: { backgroundColor: colors.redSoft },
  invalidText: { color: colors.accentPressed },
  manual: { backgroundColor: colors.amberSoft },
  manualText: { color: colors.amber },
});
