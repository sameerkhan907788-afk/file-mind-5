import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useDialog } from "@/src/components/dialog";
import { EmptyState } from "@/src/components/empty-state";
import { QueryErrorState } from "@/src/components/query-error";
import { FileRow } from "@/src/components/file-row";
import { FolderPicker } from "@/src/components/folder-picker";
import { useToast } from "@/src/components/toast";
import { Chip, Fab, IconButton, ProgressOverlay, haptic } from "@/src/components/ui";
import { Icon } from "@/src/icons";
import { shareFile } from "@/src/lib/file-actions";
import { useFileOpener } from "@/src/hooks/use-file-opener";
import { useImport } from "@/src/hooks/use-import";
import {
  addTrash,
  deleteMeta,
  listFavorites,
  movePath,
  toggleFavorite,
  upsertMeta,
} from "@/src/lib/db";
import { formatBytes, formatDate, getExt } from "@/src/lib/format";
import {
  ROOT,
  copyEntry,
  createFolder,
  listDir,
  moveEntry,
  moveToTrash,
  parentOf,
  renameEntry,
  type FileEntry,
} from "@/src/lib/fs";
import { imagesToPdf } from "@/src/lib/pdf";
import { addToVault } from "@/src/lib/vault";
import { createZip, extractZip } from "@/src/lib/zip";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

type Filter = "all" | "folder" | "pdf" | "image" | "media" | "doc";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "folder", label: "Folders" },
  { key: "pdf", label: "PDF" },
  { key: "image", label: "Images" },
  { key: "media", label: "Media" },
  { key: "doc", label: "Docs" },
];

export default function Files() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const dialog = useDialog();
  const toast = useToast();
  const open = useFileOpener();
  const importFiles = useImport();

  const [dir, setDir] = useState(ROOT);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"list" | "grid">("list");
  const [filter, setFilter] = useState<Filter>("all");
  const [sortBy, setSortBy] = useState<"name" | "date" | "size">("date");
  const [asc, setAsc] = useState(false);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [picker, setPicker] = useState<null | "copy" | "move">(null);

  const selecting = selected.size > 0;
  const atRoot = dir === ROOT;

  const entriesQ = useQuery({
    queryKey: ["files", dir],
    queryFn: () => listDir(dir),
  });
  const favQ = useQuery({
    queryKey: ["files", "favset"],
    queryFn: async () => new Set((await listFavorites()).map((m) => m.path)),
  });
  const favSet = favQ.data ?? new Set<string>();

  const entries = useMemo(() => {
    let list = entriesQ.data ?? [];
    if (filter === "folder") list = list.filter((e) => e.isDir);
    else if (filter === "pdf") list = list.filter((e) => e.kind === "pdf");
    else if (filter === "image") list = list.filter((e) => e.kind === "image");
    else if (filter === "media") list = list.filter((e) => ["image", "video", "audio"].includes(e.kind));
    else if (filter === "doc") list = list.filter((e) => ["pdf", "doc", "sheet", "slide", "text"].includes(e.kind));
    if (query) list = list.filter((e) => e.name.toLowerCase().includes(query.toLowerCase()));
    const dirs = list.filter((e) => e.isDir);
    const files = list.filter((e) => !e.isDir);
    const cmp = (a: FileEntry, b: FileEntry) => {
      let r = 0;
      if (sortBy === "name") r = a.name.localeCompare(b.name);
      else if (sortBy === "size") r = a.size - b.size;
      else r = a.modified - b.modified;
      return asc ? r : -r;
    };
    dirs.sort(cmp);
    files.sort(cmp);
    return [...dirs, ...files];
  }, [entriesQ.data, filter, query, sortBy, asc]);

  const selectedEntries = useMemo(
    () => (entriesQ.data ?? []).filter((e) => selected.has(e.uri)),
    [entriesQ.data, selected],
  );

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["files"] });
    qc.invalidateQueries({ queryKey: ["home"] });
    qc.invalidateQueries({ queryKey: ["storage"] });
  };
  const clearSel = () => setSelected(new Set());
  const toggle = (uri: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(uri) ? n.delete(uri) : n.add(uri);
      return n;
    });
  };

  const onItemPress = (e: FileEntry) => {
    if (selecting) return toggle(e.uri);
    if (e.isDir) return setDir(e.uri);
    open(e.uri, e.name);
  };

  // ---------- operations ----------
  const doNewFolder = async () => {
    const name = await dialog.prompt({ title: "New folder", placeholder: "Folder name", confirmText: "Create" });
    if (!name) return;
    await createFolder(dir, name);
    invalidate();
    toast.show("Folder created", "success");
  };

  const doRename = async (e: FileEntry) => {
    const name = await dialog.prompt({ title: "Rename", defaultValue: e.name, confirmText: "Rename" });
    if (!name || name === e.name) return;
    const to = await renameEntry(e, name);
    await movePath(e.uri, to, name);
    invalidate();
    clearSel();
    toast.show("Renamed", "success");
  };

  const doDelete = async () => {
    const n = selectedEntries.length;
    const ok = await dialog.confirm({
      title: `Move ${n} item${n === 1 ? "" : "s"} to Trash?`,
      message: "You can restore from Trash later.",
      confirmText: "Move to Trash",
      destructive: true,
    });
    if (!ok) return;
    setBusy("Deleting…");
    try {
      for (const e of selectedEntries) {
        const t = await moveToTrash(e);
        await addTrash(t);
        await deleteMeta(e.uri);
      }
      toast.show(`Moved ${n} to Trash`, "success");
    } finally {
      setBusy(null);
      clearSel();
      invalidate();
    }
  };

  const doCopyMove = async (destDir: string) => {
    const kind = picker;
    setPicker(null);
    if (!kind) return;
    setBusy(kind === "copy" ? "Copying…" : "Moving…");
    try {
      for (const e of selectedEntries) {
        if (kind === "copy") await copyEntry(e, destDir);
        else {
          const to = await moveEntry(e, destDir);
          await movePath(e.uri, to, e.name);
        }
      }
      toast.show(kind === "copy" ? "Copied" : "Moved", "success");
    } catch {
      toast.show("Operation failed", "error");
    } finally {
      setBusy(null);
      clearSel();
      invalidate();
    }
  };

  const doShare = async () => {
    if (selectedEntries.length === 0) return;
    setBusy("Preparing share…");
    try {
      if (selectedEntries.length === 1 && !selectedEntries[0].isDir) {
        await shareFile(selectedEntries[0].uri, selectedEntries[0].name);
      } else {
        const files = selectedEntries.filter((e) => !e.isDir).map((e) => ({ uri: e.uri, name: e.name }));
        if (!files.length) throw new Error("Select at least one file to share");
        const { TMP } = await import("@/src/lib/fs");
        const zipUri = await createZip(files, TMP, `share-${Date.now()}.zip`);
        await shareFile(zipUri, "File Mind share.zip");
      }
      toast.show("Share sheet opened", "success");
    } catch (error: any) {
      toast.show(error?.message || "Could not share selected files", "error");
    } finally {
      setBusy(null);
      clearSel();
    }
  };

  const doFavorite = async () => {
    for (const e of selectedEntries) await toggleFavorite(e.uri, e.name);
    invalidate();
    clearSel();
    toast.show("Updated favorites", "success");
  };

  const doTag = async () => {
    const tag = await dialog.prompt({ title: "Add tag", placeholder: "e.g. important", confirmText: "Add" });
    if (!tag) return;
    for (const e of selectedEntries) {
      const { getMeta } = await import("@/src/lib/db");
      const m = await getMeta(e.uri);
      const tags = new Set((m?.tags || "").split(",").map((t) => t.trim()).filter(Boolean));
      tags.add(tag);
      await upsertMeta(e.uri, e.name, { tags: [...tags].join(",") });
    }
    clearSel();
    toast.show("Tag added", "success");
  };

  const doZip = async () => {
    const name = await dialog.prompt({ title: "Create ZIP", defaultValue: "archive", confirmText: "Create" });
    if (!name) return;
    setBusy("Compressing…");
    try {
      const files = selectedEntries.filter((e) => !e.isDir).map((e) => ({ uri: e.uri, name: e.name }));
      await createZip(files, dir, name);
      toast.show("ZIP created", "success");
    } catch {
      toast.show("Could not create ZIP", "error");
    } finally {
      setBusy(null);
      clearSel();
      invalidate();
    }
  };

  const doExtract = async (e: FileEntry) => {
    setBusy("Extracting…");
    try {
      const n = await extractZip(e.uri, dir);
      toast.show(`Extracted ${n} files`, "success");
    } catch {
      toast.show("Could not extract archive", "error");
    } finally {
      setBusy(null);
      clearSel();
      invalidate();
    }
  };

  const doImagesToPdf = async () => {
    const imgs = selectedEntries.filter((e) => e.kind === "image");
    if (!imgs.length) return toast.show("Select images first", "info");
    const name = await dialog.prompt({ title: "Create PDF", defaultValue: "document", confirmText: "Create" });
    if (!name) return;
    setBusy("Creating PDF…");
    try {
      await imagesToPdf(imgs.map((e) => e.uri), dir, name);
      toast.show("PDF created", "success");
    } catch {
      toast.show("Could not create PDF", "error");
    } finally {
      setBusy(null);
      clearSel();
      invalidate();
    }
  };

  const doVault = async () => {
    const ok = await dialog.confirm({
      title: `Move ${selectedEntries.length} to Vault?`,
      message: "Files move to your private, biometric-locked Vault and leave this folder.",
      confirmText: "Move to Vault",
    });
    if (!ok) return;
    setBusy("Securing…");
    try {
      for (const e of selectedEntries.filter((x) => !x.isDir)) {
        await addToVault(e);
        await deleteMeta(e.uri);
      }
      toast.show("Moved to Vault", "success");
    } finally {
      setBusy(null);
      clearSel();
      invalidate();
    }
  };

  const showProperties = async (e: FileEntry) => {
    let extra = "";
    if (e.kind === "pdf") {
      try {
        const { getPageCount } = await import("@/src/lib/pdf");
        extra = `\nPages: ${await getPageCount(e.uri)}`;
      } catch {}
    }
    await dialog.confirm({
      title: e.name,
      message: `Type: ${e.isDir ? "Folder" : getExt(e.name).toUpperCase() || "File"}\nSize: ${formatBytes(e.size)}\nModified: ${formatDate(e.modified)}${extra}\nPath: ${decodeURIComponent(e.uri.replace(ROOT, "/"))}`,
      confirmText: "Done",
      cancelText: "Close",
    });
  };

  const openMore = async () => {
    const single = selectedEntries.length === 1 ? selectedEntries[0] : null;
    const allImages = selectedEntries.every((e) => e.kind === "image") && selectedEntries.length > 0;
    const isZip = single && getExt(single.name) === "zip";
    const anyFav = selectedEntries.some((e) => favSet.has(e.uri));
    const opts = [
      ...(single ? [{ label: "Rename", icon: "pencil" as const, value: "rename" }] : []),
      { label: anyFav ? "Remove from favorites" : "Add to favorites", icon: "star" as const, value: "fav" },
      { label: "Add tag", icon: "tag-outline" as const, value: "tag" },
      ...(allImages ? [{ label: "Convert to PDF", icon: "file-pdf-box" as const, value: "topdf" }] : []),
      { label: "Compress to ZIP", icon: "folder-zip" as const, value: "zip" },
      ...(isZip ? [{ label: "Extract archive", icon: "package-down" as const, value: "extract" }] : []),
      ...(single && single.kind === "image" ? [{ label: "OCR (extract text)", icon: "text-recognition" as const, value: "ocr" }] : []),
      { label: "Move to Vault", icon: "shield-lock" as const, value: "vault" },
      ...(single ? [{ label: "Properties", icon: "information-outline" as const, value: "props" }] : []),
    ];
    const v = await dialog.actions({ title: `${selectedEntries.length} selected`, options: opts });
    if (!v) return;
    if (v === "rename" && single) doRename(single);
    else if (v === "fav") doFavorite();
    else if (v === "tag") doTag();
    else if (v === "topdf") doImagesToPdf();
    else if (v === "zip") doZip();
    else if (v === "extract" && single) doExtract(single);
    else if (v === "ocr" && single) {
      clearSel();
      router.push({ pathname: "/ocr", params: { uri: single.uri, name: single.name } });
    } else if (v === "vault") doVault();
    else if (v === "props" && single) showProperties(single);
  };

  const openFab = async () => {
    const v = await dialog.actions({
      options: [
        { label: "New folder", icon: "folder-plus", value: "folder" },
        { label: "Import files", icon: "import", value: "import" },
        { label: "Scan document", icon: "camera", value: "scan" },
      ],
    });
    if (v === "folder") doNewFolder();
    else if (v === "import") importFiles(dir);
    else if (v === "scan") router.push("/scanner");
  };

  const chooseSort = async () => {
    const v = await dialog.actions({
      title: "Sort by",
      options: [
        { label: `Name ${sortBy === "name" ? (asc ? "↑" : "↓") : ""}`, icon: "sort-alphabetical-variant", value: "name" },
        { label: `Date ${sortBy === "date" ? (asc ? "↑" : "↓") : ""}`, icon: "sort-calendar-descending", value: "date" },
        { label: `Size ${sortBy === "size" ? (asc ? "↑" : "↓") : ""}`, icon: "sort-numeric-variant", value: "size" },
      ],
    });
    if (!v) return;
    if (v === sortBy) setAsc((a) => !a);
    else {
      setSortBy(v as any);
      setAsc(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        {selecting ? (
          <>
            <IconButton name="close" testID="sel-close" onPress={clearSel} color={colors.onSurface} />
            <Text style={styles.title}>{selected.size} selected</Text>
            <IconButton
              name={entries.length && entries.every((e) => selected.has(e.uri)) ? "checkbox-multiple-marked" : "checkbox-multiple-blank-outline"}
              testID="sel-all"
              onPress={() => setSelected(new Set(entries.map((e) => e.uri)))}
              color={colors.brandPrimary}
            />
          </>
        ) : (
          <>
            {!atRoot && <IconButton name="arrow-left" testID="files-up" onPress={() => setDir(parentOf(dir))} />}
            <Text style={styles.title} numberOfLines={1}>
              {atRoot ? "Files" : decodeURIComponent(dir.replace(ROOT, "").replace(/\/$/, "").split("/").pop() || "")}
            </Text>
            <IconButton name="magnify" testID="files-search" onPress={() => setSearchOpen((s) => !s)} />
            <IconButton name={mode === "list" ? "view-grid-outline" : "format-list-bulleted"} testID="files-view" onPress={() => setMode((m) => (m === "list" ? "grid" : "list"))} />
            <IconButton name="sort" testID="files-sort" onPress={chooseSort} />
          </>
        )}
      </View>

      {searchOpen && !selecting && (
        <View style={styles.searchBar}>
          <Icon name="magnify" size={20} color={colors.muted} />
          <TextInputRow value={query} onChange={setQuery} />
          {query.length > 0 && <IconButton name="close-circle" size={18} onPress={() => setQuery("")} color={colors.muted} />}
        </View>
      )}

      {!selecting && (
        <View style={styles.chipsWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {FILTERS.map((f) => (
              <Chip key={f.key} label={f.label} active={filter === f.key} onPress={() => setFilter(f.key)} testID={`filter-${f.key}`} />
            ))}
          </ScrollView>
        </View>
      )}

      {entriesQ.isError ? (
        <QueryErrorState onRetry={() => entriesQ.refetch()} message="Could not read this folder." />
      ) : entriesQ.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      ) : entries.length === 0 ? (
        <EmptyState
          icon="folder-open-outline"
          title={query ? "No matches" : "This folder is empty"}
          subtitle={query ? "Try a different search." : "Import files, create a folder or scan a document."}
          actionLabel={query ? undefined : "Import files"}
          onAction={query ? undefined : () => importFiles(dir)}
          testID="files-empty"
        />
      ) : (
        <FlatList
          key={mode}
          data={entries}
          keyExtractor={(e) => e.uri}
          numColumns={mode === "grid" ? 2 : 1}
          columnWrapperStyle={mode === "grid" ? { gap: spacing.md, paddingHorizontal: spacing.md } : undefined}
          contentContainerStyle={{
            padding: mode === "grid" ? spacing.xs : spacing.sm,
            paddingBottom: insets.bottom + 96,
            gap: mode === "grid" ? spacing.md : 0,
          }}
          renderItem={({ item }) => (
            <View style={mode === "grid" ? { flex: 1 } : undefined}>
              <FileRow
                entry={item}
                mode={mode}
                selectionMode={selecting}
                selected={selected.has(item.uri)}
                favorite={favSet.has(item.uri)}
                onPress={() => onItemPress(item)}
                onLongPress={() => {
                  haptic();
                  toggle(item.uri);
                }}
                onMore={() => {
                  setSelected(new Set([item.uri]));
                  setTimeout(openMore, 60);
                }}
              />
            </View>
          )}
        />
      )}

      {!selecting && <Fab icon="plus" testID="files-fab" onPress={openFab} bottom={insets.bottom + spacing.lg} />}

      {selecting && (
        <View style={[styles.actionBar, { paddingBottom: insets.bottom + spacing.sm }]}>
          <ActionBtn icon="share-variant" label="Share" onPress={doShare} testID="act-share" />
          <ActionBtn icon="content-copy" label="Copy" onPress={() => setPicker("copy")} testID="act-copy" />
          <ActionBtn icon="folder-move" label="Move" onPress={() => setPicker("move")} testID="act-move" />
          <ActionBtn icon="trash-can-outline" label="Delete" onPress={doDelete} testID="act-delete" danger />
          <ActionBtn icon="dots-horizontal" label="More" onPress={openMore} testID="act-more" />
        </View>
      )}

      <FolderPicker
        visible={!!picker}
        title={picker === "copy" ? "Copy to" : "Move to"}
        onCancel={() => setPicker(null)}
        onPick={doCopyMove}
      />
      <ProgressOverlay visible={!!busy} label={busy ?? undefined} />
    </View>
  );
}

function TextInputRow({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <TextInput
      testID="files-search-input"
      style={styles.searchInput}
      value={value}
      onChangeText={onChange}
      placeholder="Search this folder"
      placeholderTextColor={colors.muted}
      autoFocus
    />
  );
}

function ActionBtn({
  icon,
  label,
  onPress,
  testID,
  danger,
}: {
  icon: any;
  label: string;
  onPress: () => void;
  testID: string;
  danger?: boolean;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={() => {
        haptic();
        onPress();
      }}
      style={styles.actionBtn}
    >
      <Icon name={icon} size={22} color={danger ? colors.error : colors.onSurface} />
      <Text style={[styles.actionLabel, danger && { color: colors.error }]}>{label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: c.surface,
  },
  title: { flex: 1, fontSize: 20, fontWeight: "700", color: c.onSurface, marginLeft: spacing.xs },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: c.surfaceTertiary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  searchInput: { flex: 1, paddingVertical: spacing.md, fontSize: 15, color: c.onSurfaceTertiary },
  chipsWrap: { height: 56, justifyContent: "center" },
  chips: { gap: spacing.sm, paddingHorizontal: spacing.md, alignItems: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  actionBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    justifyContent: "space-around",
    backgroundColor: c.surfaceSecondary,
    borderTopWidth: 1,
    borderTopColor: c.divider,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  actionBtn: { alignItems: "center", gap: 4, minWidth: 56 },
  actionLabel: { fontSize: 11.5, fontWeight: "600", color: c.onSurface },
}));
