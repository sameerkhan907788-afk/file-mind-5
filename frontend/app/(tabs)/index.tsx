import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BrandMark } from "@/src/components/brand-mark";
import { EmptyState } from "@/src/components/empty-state";
import { Icon, type IconName } from "@/src/icons";
import { Card, SectionHeader, haptic } from "@/src/components/ui";
import { useFileOpener } from "@/src/hooks/use-file-opener";
import { useImport } from "@/src/hooks/use-import";
import { listFavorites, listRecent } from "@/src/lib/db";
import { formatBytes, getKind, kindIcon, kindTint } from "@/src/lib/format";
import { ROOT, statFolderSize } from "@/src/lib/fs";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const QUICK: { icon: IconName; label: string; route: string; tint: string }[] = [
  { icon: "camera", label: "Scan", route: "/scanner", tint: "#FF5E00" },
  { icon: "file-pdf-box", label: "PDF Tools", route: "/(tabs)/pdf", tint: "#E4483C" },
  { icon: "apps", label: "All Tools", route: "/tools", tint: "#8B5CF6" },
  { icon: "shield-lock", label: "Vault", route: "/vault", tint: "#2563EB" },
];

export default function Home() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const open = useFileOpener();
  const importFiles = useImport();

  const recent = useQuery({
    queryKey: ["home", "recent"],
    queryFn: async () => {
      const rows = await listRecent(8);
      const out: { path: string; name: string }[] = [];
      for (const r of rows) {
        const info = await FileSystem.getInfoAsync(r.path);
        if (info.exists) out.push(r);
      }
      return out;
    },
  });

  const favorites = useQuery({
    queryKey: ["home", "favorites"],
    queryFn: async () => (await listFavorites()).slice(0, 10),
  });

  const storage = useQuery({
    queryKey: ["home", "storage"],
    queryFn: async () => {
      const used = await statFolderSize(ROOT).catch(() => 0);
      let free = 0;
      let total = 0;
      try {
        free = await FileSystem.getFreeDiskStorageAsync();
        total = await FileSystem.getTotalDiskCapacityAsync();
      } catch {}
      return { used, free, total };
    },
  });

  const usedPct =
    storage.data && storage.data.total > 0
      ? Math.min(100, ((storage.data.total - storage.data.free) / storage.data.total) * 100)
      : 0;

  return (
    <View style={styles.screen}>
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.brandRow}>
          <BrandMark size={42} />
          <View>
            <Text style={styles.brandName}>File Mind</Text>
            <Text style={styles.brandSub}>Private document tools, all in one place</Text>
          </View>
        </View>
        <Pressable testID="home-settings" onPress={() => router.push("/settings")} hitSlop={8} style={styles.topIcon}>
          <Icon name="cog-outline" size={24} color={colors.onSurface} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl, gap: spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          testID="home-search"
          style={styles.search}
          onPress={() => {
            haptic();
            router.push("/(tabs)/ai");
          }}
        >
          <Icon name="magnify" size={22} color={colors.muted} />
          <Text style={styles.searchText}>Search files or ask AI…</Text>
        </Pressable>

        <View>
          <SectionHeader title="Quick Tools" />
          <View style={styles.quickRow}>
          {QUICK.map((q) => (
            <Pressable
              key={q.label}
              testID={`quick-${q.label.toLowerCase().replace(/ /g, "-")}`}
              style={styles.quickItem}
              onPress={() => {
                haptic();
                router.push(q.route as any);
              }}
            >
              <View style={[styles.quickIcon, { backgroundColor: q.tint + "1A" }]}>
                <Icon name={q.icon} size={26} color={q.tint} />
              </View>
              <Text style={styles.quickLabel}>{q.label}</Text>
            </Pressable>
          ))}
          </View>
        </View>

        <Pressable testID="home-storage" onPress={() => router.push("/storage")}>
          <Card>
            <View style={styles.storageHeader}>
              <Text style={styles.cardTitle}>Storage</Text>
              <Icon name="chevron-right" size={20} color={colors.muted} />
            </View>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${usedPct}%` }]} />
            </View>
            <View style={styles.storageMeta}>
              <Text style={styles.storageText}>
                {storage.data ? formatBytes(storage.data.total - storage.data.free) : "…"} used
              </Text>
              <Text style={styles.storageText}>
                {storage.data ? formatBytes(storage.data.free) : "…"} free
              </Text>
            </View>
            <View style={styles.appUsage}>
              <Icon name="folder-star" size={16} color={colors.brandPrimary} />
              <Text style={styles.appUsageText}>
                {storage.data ? formatBytes(storage.data.used) : "0 B"} managed by File Mind
              </Text>
            </View>
          </Card>
        </Pressable>

        <View>
          <SectionHeader title="Recent" actionLabel="Files" onAction={() => router.push("/(tabs)/files")} testID="home-see-files" />
          {recent.data && recent.data.length > 0 ? (
            <View style={{ gap: 2 }}>
              {recent.data.map((r) => {
                const kind = getKind(r.name);
                return (
                  <Pressable
                    key={r.path}
                    testID={`recent-${r.name}`}
                    style={styles.recentRow}
                    onPress={() => open(r.path, r.name)}
                  >
                    <View style={[styles.recentThumb, { backgroundColor: kindTint(kind) + "22" }]}>
                      {kind === "image" ? (
                        <Image source={{ uri: r.path }} style={styles.recentImg} contentFit="cover" />
                      ) : (
                        <Icon name={kindIcon(kind)} size={22} color={kindTint(kind)} />
                      )}
                    </View>
                    <Text style={styles.recentName} numberOfLines={1}>
                      {r.name}
                    </Text>
                    <Icon name="chevron-right" size={20} color={colors.muted} />
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <Card>
              <EmptyState
                icon="clock-outline"
                title="No recent files yet"
                subtitle="Scan, import or create a file to get started."
                actionLabel="Import a file"
                onAction={() => importFiles()}
                testID="home-empty-recent"
              />
            </Card>
          )}
        </View>

        {favorites.data && favorites.data.length > 0 && (
          <View>
            <SectionHeader title="Favorites" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md }}>
              {favorites.data.map((f) => {
                const kind = getKind(f.name);
                return (
                  <Pressable key={f.path} testID={`fav-${f.name}`} style={styles.favCard} onPress={() => open(f.path, f.name)}>
                    <View style={[styles.favThumb, { backgroundColor: kindTint(kind) + "22" }]}>
                      {kind === "image" ? (
                        <Image source={{ uri: f.path }} style={styles.favImg} contentFit="cover" />
                      ) : (
                        <Icon name={kindIcon(kind)} size={30} color={kindTint(kind)} />
                      )}
                    </View>
                    <Text style={styles.favName} numberOfLines={1}>
                      {f.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        <View>
          <SectionHeader title="Suggested" />
          <View style={{ gap: spacing.md }}>
            <SuggestCard
              icon="content-duplicate"
              tint="#8B5CF6"
              title="Find duplicates"
              sub="Free up space by removing copies"
              onPress={() => router.push("/duplicates")}
              testID="suggest-duplicates"
            />
            <SuggestCard
              icon="image-multiple"
              tint="#E4483C"
              title="Images to PDF"
              sub="Combine photos into one PDF"
              onPress={() => router.push({ pathname: "/tools", params: { open: "images_to_pdf" } })}
              testID="suggest-img-pdf"
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function SuggestCard({
  icon,
  tint,
  title,
  sub,
  onPress,
  testID,
}: {
  icon: IconName;
  tint: string;
  title: string;
  sub: string;
  onPress: () => void;
  testID: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress}>
      <Card style={styles.suggestCard}>
        <View style={[styles.suggestIcon, { backgroundColor: tint + "1A" }]}>
          <Icon name={icon} size={24} color={tint} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.suggestSub}>{sub}</Text>
        </View>
        <Icon name="chevron-right" size={20} color={colors.muted} />
      </Card>
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.surface },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  brandName: { fontSize: 20, fontWeight: "800", color: c.onSurface },
  brandSub: { fontSize: 12, color: c.muted },
  topIcon: { padding: spacing.xs },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: c.surfaceSecondary,
    borderRadius: radius.pill,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: c.border,
  },
  searchText: { color: c.muted, fontSize: 15 },
  quickRow: { flexDirection: "row", justifyContent: "space-between" },
  quickItem: { alignItems: "center", gap: spacing.sm, flex: 1 },
  quickIcon: { width: 60, height: 60, borderRadius: radius.lg, alignItems: "center", justifyContent: "center" },
  quickLabel: { fontSize: 12.5, fontWeight: "600", color: c.onSurface },
  cardTitle: { fontSize: 16, fontWeight: "700", color: c.onSurfaceSecondary },
  storageHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  barTrack: { height: 10, borderRadius: radius.pill, backgroundColor: c.surfaceTertiary, overflow: "hidden" },
  barFill: { height: 10, borderRadius: radius.pill, backgroundColor: c.brandPrimary },
  storageMeta: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.sm },
  storageText: { fontSize: 13, color: c.muted, fontWeight: "500" },
  appUsage: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.md },
  appUsageText: { fontSize: 12.5, color: c.onSurfaceTertiary },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    backgroundColor: c.surfaceSecondary,
    borderRadius: radius.md,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: c.border,
  },
  recentThumb: { width: 42, height: 42, borderRadius: radius.md, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  recentImg: { width: 42, height: 42 },
  recentName: { flex: 1, fontSize: 15, fontWeight: "600", color: c.onSurface },
  favCard: { width: 110, gap: spacing.sm },
  favThumb: { width: 110, height: 84, borderRadius: radius.md, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  favImg: { width: 110, height: 84 },
  favName: { fontSize: 12.5, fontWeight: "600", color: c.onSurface },
  suggestCard: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  suggestIcon: { width: 46, height: 46, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  suggestSub: { fontSize: 12.5, color: c.muted, marginTop: 2 },
}));
