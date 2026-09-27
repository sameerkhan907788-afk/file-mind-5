import { useRouter } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import React, { useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BrandMark } from "@/src/components/brand-mark";
import { useDialog } from "@/src/components/dialog";
import { ScreenHeader } from "@/src/components/screen-header";
import { useToast } from "@/src/components/toast";
import { Icon, type IconName } from "@/src/icons";
import { TMP } from "@/src/lib/fs";
import { loadThemePref, saveThemePref, type ThemePref } from "@/src/lib/theme-pref";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const SUPPORT_EMAIL = "jarvisai9077@gmail.com";
const THEMES: { key: ThemePref; label: string; icon: IconName }[] = [
  { key: "system", label: "System", icon: "cellphone" },
  { key: "light", label: "Light", icon: "white-balance-sunny" },
  { key: "dark", label: "Dark", icon: "moon-waning-crescent" },
];

export default function Settings() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const dialog = useDialog();
  const toast = useToast();
  const [pref, setPref] = useState<ThemePref>("system");

  useEffect(() => {
    void loadThemePref().then(setPref).catch(() => setPref("system"));
  }, []);

  const setTheme = (p: ThemePref) => {
    setPref(p);
    void saveThemePref(p).catch(() => toast.show("Could not save appearance", "error"));
  };

  const clearCache = async () => {
    const ok = await dialog.confirm({ title: "Clear cache?", message: "Temporary files are removed. Your documents are not affected.", confirmText: "Clear" });
    if (!ok) return;
    try {
      await FileSystem.deleteAsync(TMP, { idempotent: true });
      const cacheDirectory = FileSystem.cacheDirectory;
      if (cacheDirectory) await FileSystem.deleteAsync(cacheDirectory + "pdfjs/", { idempotent: true });
      toast.show("Cache cleared", "success");
    } catch {
      toast.show("Could not clear cache", "error");
    }
  };

  const contact = async () => {
    try {
      const url = `mailto:${SUPPORT_EMAIL}?subject=File%20Mind%20Support`;
      if (await Linking.canOpenURL(url)) await Linking.openURL(url);
      else toast.show(`Email us at ${SUPPORT_EMAIL}`, "info");
    } catch {
      toast.show(`Email us at ${SUPPORT_EMAIL}`, "info");
    }
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Settings" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl, gap: spacing.xl }} showsVerticalScrollIndicator={false}>
        <View style={styles.brandCard}>
          <BrandMark size={52} />
          <View style={styles.brandCopy}>
            <Text style={styles.brandTitle}>File Mind</Text>
            <Text style={styles.brandSub}>Private file tools that stay on your device.</Text>
          </View>
        </View>

        <View>
          <Text style={styles.section}>Appearance</Text>
          <View style={styles.themeRow}>
            {THEMES.map((t) => (
              <Pressable key={t.key} testID={`theme-${t.key}`} style={[styles.themeCard, pref === t.key && styles.themeCardOn]} onPress={() => setTheme(t.key)}>
                <Icon name={t.icon} size={24} color={pref === t.key ? colors.brandPrimary : colors.muted} />
                <Text style={[styles.themeLabel, pref === t.key && { color: colors.brandPrimary }]}>{t.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View>
          <Text style={styles.section}>Privacy & security</Text>
          <View style={styles.card}>
            <Item icon="shield-lock" label="Secure Vault" onPress={() => router.push("/vault")} testID="set-vault" />
            <Item icon="trash-can-outline" label="Trash" onPress={() => router.push("/trash")} testID="set-trash" />
            <Item icon="broom" label="Clear cache" onPress={clearCache} testID="set-cache" last />
          </View>
          <View style={styles.offlineNote}>
            <Icon name="shield-check" size={16} color={colors.success} />
            <Text style={styles.offlineText}>100% offline. Your files never leave this device.</Text>
          </View>
        </View>

        <View>
          <Text style={styles.section}>About & support</Text>
          <View style={styles.card}>
            <Item icon="email-outline" label="Contact support" sub={SUPPORT_EMAIL} onPress={contact} testID="set-support" />
            <Item icon="file-lock-outline" label="Privacy Policy" onPress={() => router.push("/privacy")} testID="set-privacy" />
            <Item icon="file-document-outline" label="Terms & Conditions" onPress={() => router.push("/terms")} testID="set-terms" last />
          </View>
        </View>

        <Text style={styles.version}>File Mind · v1.0.0</Text>
      </ScrollView>
    </View>
  );
}

function Item({ icon, label, sub, onPress, testID, last }: { icon: IconName; label: string; sub?: string; onPress: () => void; testID: string; last?: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress} style={[styles.item, !last && styles.itemBorder]}>
      <Icon name={icon} size={22} color={colors.onSurfaceSecondary} />
      <View style={{ flex: 1 }}>
        <Text style={styles.itemLabel}>{label}</Text>
        {!!sub && <Text style={styles.itemSub}>{sub}</Text>}
      </View>
      <Icon name="chevron-right" size={20} color={colors.muted} />
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.surface },
  brandCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: c.brandSecondary, borderWidth: 1, borderColor: c.brandPrimary + "40" },
  brandCopy: { flex: 1 },
  brandTitle: { fontSize: 19, fontWeight: "800", color: c.onSurface },
  brandSub: { fontSize: 13, color: c.onSurfaceTertiary, marginTop: 3 },
  section: { fontSize: 13, fontWeight: "700", color: c.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: spacing.md },
  themeRow: { flexDirection: "row", gap: spacing.md },
  themeCard: { flex: 1, alignItems: "center", gap: spacing.sm, paddingVertical: spacing.lg, borderRadius: radius.lg, backgroundColor: c.surfaceSecondary, borderWidth: 1.5, borderColor: c.border },
  themeCardOn: { borderColor: c.brandPrimary, backgroundColor: c.brandSecondary },
  themeLabel: { fontSize: 13.5, fontWeight: "600", color: c.onSurface },
  card: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, overflow: "hidden" },
  item: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, minHeight: 64 },
  itemBorder: { borderBottomWidth: 1, borderBottomColor: c.divider },
  itemLabel: { fontSize: 15.5, fontWeight: "600", color: c.onSurface },
  itemSub: { fontSize: 12.5, color: c.muted, marginTop: 2 },
  offlineNote: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.md, paddingHorizontal: spacing.xs },
  offlineText: { fontSize: 12.5, color: c.onSurfaceTertiary },
  version: { textAlign: "center", color: c.muted, fontSize: 13 },
}));
