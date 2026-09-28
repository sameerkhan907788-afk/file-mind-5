import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import * as LocalAuthentication from "expo-local-authentication";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useDialog } from "@/src/components/dialog";
import { EmptyState } from "@/src/components/empty-state";
import { QueryErrorState } from "@/src/components/query-error";
import { ScreenHeader } from "@/src/components/screen-header";
import { useToast } from "@/src/components/toast";
import { Fab, ProgressOverlay } from "@/src/components/ui";
import { Icon } from "@/src/icons";
import { useFileOpener } from "@/src/hooks/use-file-opener";
import { addVault, listVault, type VaultRow } from "@/src/lib/db";
import { formatBytes, getKind, kindIcon, kindTint } from "@/src/lib/format";
import { importInto, ROOT, VAULT } from "@/src/lib/fs";
import { deleteVaultItem, restoreFromVault } from "@/src/lib/vault";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";
import * as FileSystem from "expo-file-system/legacy";

export default function Vault() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const dialog = useDialog();
  const toast = useToast();
  const open = useFileOpener();

  const [unlocked, setUnlocked] = useState(false);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const itemsQ = useQuery({
    queryKey: ["vault"],
    queryFn: listVault,
    enabled: unlocked,
  });

  const unlock = useCallback(async () => {
    setChecking(true);
    try {
      const hasHw = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHw || !enrolled) {
        // No biometric configured — device auth unavailable; allow with warning.
        toast.show("No device lock set — Vault is open", "info");
        setUnlocked(true);
        return;
      }
      const res = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock File Mind Vault",
        fallbackLabel: "Use device passcode",
      });
      if (res.success) setUnlocked(true);
    } catch {
      toast.show("Could not unlock Vault", "error");
    } finally {
      setChecking(false);
    }
  }, [toast]);

  useEffect(() => {
    unlock();
  }, [unlock]);

  const addFiles = async () => {
    const res = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.length) return;
    setBusy("Securing…");
    try {
      for (const a of res.assets) {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const stored = `${id}__${a.name}`;
        const vaultPath = await importInto(VAULT, a.uri, stored);
        const info = await FileSystem.getInfoAsync(vaultPath);
        await addVault({
          id,
          name: a.name || "file",
          vault_path: vaultPath,
          size: (info as any).size ?? 0,
          kind: getKind(a.name || ""),
          added: Date.now(),
        });
      }
      qc.invalidateQueries({ queryKey: ["vault"] });
      toast.show("Added to Vault", "success");
    } catch {
      toast.show("Could not add files to Vault", "error");
    } finally {
      setBusy(null);
    }
  };

  const onItem = async (row: VaultRow) => {
    const v = await dialog.actions({
      title: row.name,
      options: [
        { label: "Open", icon: "eye", value: "open" },
        { label: "Restore to Files", icon: "export", value: "restore" },
        { label: "Delete permanently", icon: "trash-can-outline", value: "delete", destructive: true },
      ],
    });
    if (v === "open") open(row.vault_path, row.name);
    else if (v === "restore") {
      await restoreFromVault(row, ROOT);
      qc.invalidateQueries({ queryKey: ["vault"] });
      qc.invalidateQueries({ queryKey: ["files"] });
      toast.show("Restored to Files", "success");
    } else if (v === "delete") {
      const ok = await dialog.confirm({ title: "Delete permanently?", message: "This cannot be undone.", destructive: true, confirmText: "Delete" });
      if (ok) {
        await deleteVaultItem(row);
        qc.invalidateQueries({ queryKey: ["vault"] });
        toast.show("Deleted", "success");
      }
    }
  };

  if (!unlocked) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Secure Vault" />
        <View style={styles.lockWrap}>
          <View style={styles.lockIcon}>
            <Icon name="shield-lock" size={54} color={colors.brandPrimary} />
          </View>
          <Text style={styles.lockTitle}>Your private Vault</Text>
          <Text style={styles.lockText}>
            Files here are hidden and protected by your device biometrics. Nothing is uploaded anywhere.
          </Text>
          {checking ? (
            <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.lg }} />
          ) : (
            <Pressable testID="vault-unlock" style={styles.unlockBtn} onPress={unlock}>
              <Icon name="fingerprint" size={22} color={colors.onBrandPrimary} />
              <Text style={styles.unlockText}>Unlock</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Secure Vault" subtitle={`${itemsQ.data?.length ?? 0} protected items`} />
      {itemsQ.isError ? (
        <QueryErrorState onRetry={() => itemsQ.refetch()} message="Could not open the Vault." />
      ) : itemsQ.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      ) : (itemsQ.data ?? []).length === 0 ? (
        <EmptyState
          icon="shield-plus"
          title="Vault is empty"
          subtitle="Add sensitive files here to keep them hidden and biometric-locked."
          actionLabel="Add files"
          onAction={addFiles}
          testID="vault-empty"
        />
      ) : (
        <FlatList
          data={itemsQ.data}
          keyExtractor={(r) => r.id}
          numColumns={3}
          columnWrapperStyle={{ gap: spacing.md, paddingHorizontal: spacing.md }}
          contentContainerStyle={{ paddingVertical: spacing.md, gap: spacing.md, paddingBottom: insets.bottom + 96 }}
          renderItem={({ item }) => (
            <Pressable testID={`vault-item-${item.name}`} style={styles.vItem} onPress={() => onItem(item)}>
              <View style={[styles.vThumb, { backgroundColor: kindTint(item.kind as any) + "22" }]}>
                <Icon name={kindIcon(item.kind as any)} size={30} color={kindTint(item.kind as any)} />
              </View>
              <Text style={styles.vName} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.vMeta}>{formatBytes(item.size)}</Text>
            </Pressable>
          )}
        />
      )}
      {unlocked && (itemsQ.data ?? []).length > 0 && (
        <Fab icon="plus" testID="vault-add" onPress={addFiles} bottom={insets.bottom + spacing.lg} />
      )}
      <ProgressOverlay visible={!!busy} label={busy ?? undefined} />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  lockWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl, gap: spacing.md },
  lockIcon: { width: 110, height: 110, borderRadius: radius.pill, backgroundColor: c.brandSecondary, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  lockTitle: { fontSize: 22, fontWeight: "800", color: c.onSurface },
  lockText: { fontSize: 14.5, color: c.muted, textAlign: "center", lineHeight: 21, maxWidth: 300 },
  unlockBtn: { marginTop: spacing.xl, flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: c.brandPrimary, paddingHorizontal: spacing.xxl, paddingVertical: spacing.md, borderRadius: radius.pill },
  unlockText: { color: c.onBrandPrimary, fontWeight: "700", fontSize: 16 },
  vItem: { flex: 1, gap: 4, maxWidth: "31%" },
  vThumb: { width: "100%", aspectRatio: 1, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  vName: { fontSize: 12, fontWeight: "600", color: c.onSurface },
  vMeta: { fontSize: 10.5, color: c.muted },
}));
