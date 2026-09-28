import React from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon, type IconName } from "@/src/icons";
import { makeStyles, spacing, useTheme } from "@/src/theme";
import { haptic } from "@/src/components/ui";
import { useSafeBack } from "@/src/hooks/use-safe-back";

export type HeaderAction = { icon: IconName; onPress: () => void; testID?: string; tint?: string };

export function ScreenHeader({
  title,
  subtitle,
  showBack = true,
  actions = [],
  onBack,
}: {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  actions?: HeaderAction[];
  onBack?: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const safeBack = useSafeBack();

  const handleBack = () => {
    haptic();
    try {
      if (onBack) onBack();
      else safeBack();
    } catch (error) {
      console.warn("[navigation] header back failed", error);
      safeBack();
    }
  };

  return (
    <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
      {showBack && (
        <Pressable
          testID="header-back"
          onPress={handleBack}
          hitSlop={10}
          style={styles.backBtn}
        >
          <Icon name="chevron-left" size={28} color={colors.onSurface} />
        </Pressable>
      )}
      <View style={styles.titleWrap}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {!!subtitle && (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      <View style={styles.actions}>
        {actions.map((a, i) => (
          <Pressable
            key={i}
            testID={a.testID}
            onPress={() => {
              haptic();
              a.onPress();
            }}
            hitSlop={8}
            style={styles.actionBtn}
          >
            <Icon name={a.icon} size={23} color={a.tint || colors.onSurface} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: c.surface,
    borderBottomWidth: 1,
    borderBottomColor: c.divider,
    gap: spacing.xs,
  },
  backBtn: { padding: spacing.xs },
  titleWrap: { flex: 1, marginLeft: spacing.xs },
  title: { fontSize: 20, fontWeight: "700", color: c.onSurface },
  subtitle: { fontSize: 12.5, color: c.muted, marginTop: 1 },
  actions: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  actionBtn: { padding: spacing.sm },
}));
