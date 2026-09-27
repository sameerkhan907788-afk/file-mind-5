import { useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useDialog } from "@/src/components/dialog";
import { ScreenHeader } from "@/src/components/screen-header";
import { useToast } from "@/src/components/toast";
import { ProgressOverlay, haptic } from "@/src/components/ui";
import { Icon, type IconName } from "@/src/icons";
import { useImport } from "@/src/hooks/use-import";
import { ROOT, createFolder, importInto, joinDir, sanitizeName, uniqueName, writeText } from "@/src/lib/fs";
import { createTextPdf, imagesToPdf } from "@/src/lib/pdf";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

type Item = { id: string; label: string; icon: IconName; tint: string };
type Group = { title: string; items: Item[] };

const GROUPS: Group[] = [
  {
    title: "File Tools",
    items: [
      { id: "import", label: "Import files", icon: "import", tint: "#FF5E00" },
      { id: "newfolder", label: "New folder", icon: "folder-plus", tint: "#2563EB" },
      { id: "newtext", label: "Create text file", icon: "file-document-plus-outline", tint: "#64748B" },
      { id: "trash", label: "Trash", icon: "trash-can-outline", tint: "#8E8E93" },
    ],
  },
  {
    title: "PDF Tools",
    items: [
      { id: "merge", label: "Merge PDFs", icon: "vector-combine", tint: "#FF5E00" },
      { id: "createpdf", label: "Create PDF", icon: "file-pdf-box", tint: "#E4483C" },
      { id: "split", label: "Split PDF", icon: "call-split", tint: "#E4483C" },
      { id: "pdfcompress", label: "Compress PDF", icon: "zip-box", tint: "#8B5CF6" },
      { id: "watermark", label: "Watermark", icon: "watermark", tint: "#2563EB" },
    ],
  },
  {
    title: "Scanner & OCR",
    items: [
      { id: "scan", label: "Scan document", icon: "camera", tint: "#FF5E00" },
      { id: "idscan", label: "Scan ID card", icon: "card-account-details", tint: "#2E9E5B" },
      { id: "ocr", label: "Extract text (OCR)", icon: "text-recognition", tint: "#0891B2" },
    ],
  },
  {
    title: "Convert & Compress",
    items: [
      { id: "images_to_pdf", label: "Images → PDF", icon: "image-multiple", tint: "#2E9E5B" },
      { id: "pdftext", label: "PDF → Text", icon: "file-document-outline", tint: "#64748B" },
      { id: "zip2", label: "Create ZIP", icon: "folder-zip", tint: "#A16207" },
    ],
  },
  {
    title: "Organize & Storage",
    items: [
      { id: "organize", label: "Smart Organize", icon: "auto-fix", tint: "#8B5CF6" },
      { id: "duplicates", label: "Duplicates", icon: "content-duplicate", tint: "#E4483C" },
      { id: "storage", label: "Storage analyzer", icon: "chart-donut", tint: "#FF5E00" },
      { id: "large", label: "Large files", icon: "file-chart", tint: "#D97706" },
    ],
  },
  {
    title: "AI & Security",
    items: [
      { id: "ai", label: "Ask Files AI", icon: "robot", tint: "#FF5E00" },
      { id: "vault", label: "Secure Vault", icon: "shield-lock", tint: "#2563EB" },
    ],
  },
];

export default function Tools() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const dialog = useDialog();
  const toast = useToast();
  const params = useLocalSearchParams<{ open?: string }>();
  const importFiles = useImport();
  const [busy, setBusy] = React.useState<string | null>(null);
  const handledParam = useRef(false);

  const createTextFlow = useCallback(async () => {
    const requestedName = await dialog.prompt({ title: "Create text file", placeholder: "notes.txt", defaultValue: "notes.txt", confirmText: "Next" });
    if (!requestedName) return;
    const content = await dialog.prompt({ title: "Text content", placeholder: "Write your notes", confirmText: "Save" });
    if (content === null) return;
    setBusy("Saving text file…");
    try {
      const name = sanitizeName(requestedName, "notes").toLowerCase().endsWith(".txt") ? sanitizeName(requestedName, "notes") : `${sanitizeName(requestedName, "notes")}.txt`;
      const target = joinDir(ROOT, await uniqueName(ROOT, name));
      await writeText(target, content);
      await qc.invalidateQueries({ queryKey: ["files"] });
      await qc.invalidateQueries({ queryKey: ["home"] });
      toast.show("Text file created", "success");
    } catch (error: any) {
      toast.show(error?.message || "Could not create text file", "error");
    } finally {
      setBusy(null);
    }
  }, [dialog, qc, toast]);

  const createPdfTextFlow = useCallback(async () => {
    const requestedName = await dialog.prompt({ title: "Create PDF", placeholder: "document", defaultValue: "document", confirmText: "Next" });
    if (!requestedName) return;
    const content = await dialog.prompt({ title: "PDF content", placeholder: "Write the document text", confirmText: "Create" });
    if (content === null) return;
    setBusy("Creating PDF…");
    try {
      const result = await createTextPdf(content, ROOT, sanitizeName(requestedName, "document"));
      await qc.invalidateQueries({ queryKey: ["files"] });
      await qc.invalidateQueries({ queryKey: ["pdf"] });
      await qc.invalidateQueries({ queryKey: ["home"] });
      toast.show("PDF created", "success");
      router.push({ pathname: "/pdf-viewer", params: { uri: result.uri, name: result.uri.split("/").pop() || "document.pdf" } });
    } catch (error: any) {
      toast.show(error?.message || "Could not create PDF", "error");
    } finally {
      setBusy(null);
    }
  }, [dialog, qc, router, toast]);

  const newFolderFlow = useCallback(async () => {
    const name = await dialog.prompt({ title: "New folder", placeholder: "Folder name", confirmText: "Create" });
    if (!name) return;
    try {
      await createFolder(ROOT, name);
      await qc.invalidateQueries({ queryKey: ["files"] });
      await qc.invalidateQueries({ queryKey: ["home"] });
      toast.show("Folder created", "success");
    } catch (error: any) {
      toast.show(error?.message || "Could not create folder", "error");
    }
  }, [dialog, qc, toast]);

  const imagesToPdfFlow = useCallback(async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: "image/*", multiple: true, copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.length) return;
    const name = await dialog.prompt({ title: "PDF name", defaultValue: "document", confirmText: "Create" });
    if (!name) return;
    setBusy("Creating PDF…");
    try {
      const r = await imagesToPdf(res.assets.map((a) => a.uri), ROOT, name);
      qc.invalidateQueries({ queryKey: ["files"] });
      qc.invalidateQueries({ queryKey: ["pdf"] });
      qc.invalidateQueries({ queryKey: ["home"] });
      setBusy(null);
      toast.show("PDF created", "success");
      router.push({ pathname: "/pdf-viewer", params: { uri: r.uri, name: name + ".pdf" } });
    } catch {
      setBusy(null);
      toast.show("Could not create PDF", "error");
    }
  }, [dialog, qc, router, toast]);

  const pdfToTextFlow = useCallback(async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.length) return;
    const asset = res.assets[0];
    setBusy("Preparing PDF…");
    try {
      const stored = await importInto(ROOT, asset.uri, asset.name || "document.pdf");
      router.push({ pathname: "/pdf-viewer", params: { uri: stored, name: stored.split("/").pop() || "document.pdf", autoExtract: "1" } });
    } catch (error: any) {
      toast.show(error?.message || "Could not prepare PDF", "error");
    } finally {
      setBusy(null);
    }
  }, [router, toast]);

  const ocrFlow = useCallback(async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: "image/*", copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    router.push({ pathname: "/ocr", params: { uri: a.uri, name: a.name || "image" } });
  }, [router]);

  useEffect(() => {
    if (params.open && !handledParam.current) {
      handledParam.current = true;
      if (params.open === "images_to_pdf") imagesToPdfFlow();
    }
  }, [params.open, imagesToPdfFlow]);

  const onSelect = (id: string) => {
    haptic();
    switch (id) {
      case "import":
        void importFiles(ROOT);
        break;
      case "newfolder":
        void newFolderFlow();
        break;
      case "newtext":
        void createTextFlow();
        break;
      case "zip":
      case "zip2":
        router.push("/(tabs)/files");
        break;
      case "trash":
        router.push("/trash");
        break;
      case "pdftext":
        void pdfToTextFlow();
        break;
      case "merge":
      case "split":
      case "pdfcompress":
      case "watermark":
        router.push("/(tabs)/pdf");
        break;
      case "scan":
      case "idscan":
        router.push("/scanner");
        break;
      case "ocr":
        ocrFlow();
        break;
      case "images_to_pdf":
        imagesToPdfFlow();
        break;
      case "organize":
        router.push("/organize");
        break;
      case "duplicates":
        router.push("/duplicates");
        break;
      case "storage":
      case "large":
        router.push("/storage");
        break;
      case "ai":
        router.push("/(tabs)/ai");
        break;
      case "vault":
        router.push("/vault");
        break;
    }
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title="All Tools" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl, gap: spacing.xl }} showsVerticalScrollIndicator={false}>
        {GROUPS.map((g) => (
          <View key={g.title}>
            <Text style={styles.groupTitle}>{g.title}</Text>
            <View style={styles.grid}>
              {g.items.map((it) => (
                <Pressable key={it.id} testID={`tool-${it.id}`} style={styles.item} onPress={() => onSelect(it.id)}>
                  <View style={[styles.itemIcon, { backgroundColor: it.tint + "1A" }]}>
                    <Icon name={it.icon} size={26} color={it.tint} />
                  </View>
                  <Text style={styles.itemLabel} numberOfLines={2}>
                    {it.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
      <ProgressOverlay visible={!!busy} label={busy ?? undefined} />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.surface },
  groupTitle: { fontSize: 16, fontWeight: "700", color: c.onSurface, marginBottom: spacing.md },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  item: {
    width: "22%",
    minWidth: 74,
    alignItems: "center",
    gap: 6,
    flexGrow: 1,
  },
  itemIcon: { width: 58, height: 58, borderRadius: radius.lg, alignItems: "center", justifyContent: "center" },
  itemLabel: { fontSize: 11.5, fontWeight: "600", color: c.onSurface, textAlign: "center" },
}));
