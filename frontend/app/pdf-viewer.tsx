import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

import { useDialog } from "@/src/components/dialog";
import { useToast } from "@/src/components/toast";
import { useSafeBack } from "@/src/hooks/use-safe-back";
import { Icon } from "@/src/icons";
import { shareFile, saveCopy } from "@/src/lib/file-actions";
import { haptic } from "@/src/components/ui";
import { createTextPdf } from "@/src/lib/pdf";
import { baseName } from "@/src/lib/format";
import { parentOf, readBase64, writeText, joinDir, uniqueName } from "@/src/lib/fs";
import { ensurePdfJs, viewerUri } from "@/src/lib/pdfjs";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function PdfViewer() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const safeBack = useSafeBack();
  const dialog = useDialog();
  const toast = useToast();
  const { uri, name, autoExtract } = useLocalSearchParams<{ uri: string; name: string; autoExtract?: string }>();
  const webRef = useRef<WebView>(null);

  const [pages, setPages] = useState(0);
  const [scale, setScale] = useState(1);
  const [docText, setDocText] = useState("");
  const [pageTexts, setPageTexts] = useState<string[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  const ready = useQuery({
    queryKey: ["pdfjs-ready"],
    queryFn: ensurePdfJs,
    enabled: Platform.OS !== "web",
    retry: 1,
  });
  const pdfData = useQuery({
    queryKey: ["pdf-data", uri],
    queryFn: () => readBase64(uri),
    enabled: Platform.OS !== "web" && !!uri,
    retry: 1,
  });

  const injected = useMemo(
    () => (pdfData.data ? `window.__PDF_BASE64__=${JSON.stringify(pdfData.data)};true;` : "true;"),
    [pdfData.data],
  );

  const post = (obj: any) => webRef.current?.postMessage(JSON.stringify(obj));

  const onMessage = (e: any) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === "loaded") setPages(msg.pages);
      else if (msg.type === "text") {
        setDocText(msg.text || "");
        setPageTexts(msg.pages || []);
      } else if (msg.type === "error") setError(msg.message || "Failed to render PDF");
    } catch {}
  };

  const zoom = (dir: 1 | -1) => {
    const next = Math.min(3, Math.max(0.5, +(scale + dir * 0.25).toFixed(2)));
    setScale(next);
    post({ type: "zoom", scale: next });
  };

  const runSearch = (text: string) => {
    if (!text) return;
    const idx = pageTexts.findIndex((t) => t.toLowerCase().includes(text.toLowerCase()));
    if (idx >= 0) {
      post({ type: "goto", page: idx + 1 });
      toast.show(`Found on page ${idx + 1}`, "success");
    } else {
      toast.show("No matches", "info");
    }
  };

  const share = async () => {
    try {
      await shareFile(uri, name);
      toast.show("Share sheet opened", "success");
    } catch (error: any) {
      toast.show(error?.message || "Could not share this PDF", "error");
    }
  };

  const save = async () => {
    try {
      await saveCopy(uri, name);
      toast.show("PDF saved successfully", "success");
    } catch (error: any) {
      toast.show(error?.message || "Could not save this PDF", "error");
    }
  };

  const extractText = async () => {
    if (!docText.trim()) return toast.show("No selectable text in this PDF", "info");
    try {
      const v = await dialog.actions({
        title: "Extract text",
        options: [
          { label: "Save as .txt", icon: "file-document-outline", value: "txt" },
          { label: "Save as text PDF", icon: "file-pdf-box", value: "pdf" },
          { label: "Share text", icon: "share-variant", value: "share" },
        ],
      });
      if (!v) return;
      const dir = parentOf(uri);
      const base = baseName(name || "document");
      if (v === "txt") {
        const fn = await uniqueName(dir, `${base}.txt`);
        await writeText(joinDir(dir, fn), docText);
        toast.show("Saved as text file", "success");
      } else if (v === "pdf") {
        await createTextPdf(docText, dir, `${base}_text`);
        toast.show("Saved as text PDF", "success");
      } else if (v === "share") {
        const tmp = (await import("@/src/lib/fs")).TMP + `${base}.txt`;
        await writeText(tmp, docText);
        await shareFile(tmp, `${base}.txt`);
        toast.show("Share sheet opened", "success");
      }
    } catch (error: any) {
      toast.show(error?.message || "Could not extract text", "error");
    }
  };

  const autoExtracted = useRef(false);

  useEffect(() => {
    if (autoExtract !== "1" || !docText.trim() || autoExtracted.current) return;
    autoExtracted.current = true;
    (async () => {
      try {
        const dir = parentOf(uri);
        const fn = await uniqueName(dir, `${baseName(name || "document")}.txt`);
        await writeText(joinDir(dir, fn), docText);
        toast.show("PDF text saved", "success");
      } catch (error: any) {
        toast.show(error?.message || "Could not save PDF text", "error");
      }
    })();
  }, [autoExtract, docText, name, toast, uri]);

  const loadError = error || (ready.error as Error | null)?.message || (pdfData.error as Error | null)?.message || "Could not load this PDF";

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="viewer-back" onPress={safeBack} hitSlop={10} style={styles.hBtn}>
          <Icon name="chevron-left" size={28} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {name}
          </Text>
          {pages > 0 && <Text style={styles.sub}>{pages} pages</Text>}
        </View>
        <Pressable testID="viewer-search" onPress={() => { haptic(); setSearchOpen((s) => !s); }} hitSlop={8} style={styles.hBtn}>
          <Icon name="magnify" size={23} color={colors.onSurface} />
        </Pressable>
        <Pressable testID="viewer-extract" onPress={extractText} hitSlop={8} style={styles.hBtn}>
          <Icon name="text-recognition" size={23} color={colors.onSurface} />
        </Pressable>
        <Pressable testID="viewer-save" onPress={save} hitSlop={8} style={styles.hBtn}>
          <Icon name="download" size={22} color={colors.onSurface} />
        </Pressable>
        <Pressable testID="viewer-share" onPress={share} hitSlop={8} style={styles.hBtn}>
          <Icon name="share-variant" size={22} color={colors.onSurface} />
        </Pressable>
      </View>

      {searchOpen && (
        <View style={styles.searchBar}>
          <Icon name="magnify" size={20} color={colors.muted} />
          <TextInput
            testID="viewer-search-input"
            style={styles.searchInput}
            value={q}
            onChangeText={setQ}
            placeholder="Search in document"
            placeholderTextColor={colors.muted}
            onSubmitEditing={() => runSearch(q)}
            returnKeyType="search"
            autoFocus
          />
        </View>
      )}

      <View style={styles.body}>
        {Platform.OS === "web" ? (
          <View style={styles.center}>
            <Icon name="cellphone" size={40} color={colors.muted} />
            <Text style={styles.centerText}>Open the app on your device to view PDFs.</Text>
          </View>
        ) : ready.isError || pdfData.isError || error ? (
          <View style={styles.center}>
            <Icon name="alert-circle-outline" size={40} color={colors.error} />
            <Text style={styles.centerText}>{loadError}</Text>
            <Pressable
              testID="viewer-retry"
              style={styles.retryBtn}
              onPress={() => {
                setError(null);
                void ready.refetch();
                void pdfData.refetch();
              }}
            >
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : ready.isLoading || pdfData.isLoading || !ready.data || !pdfData.data ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.brandPrimary} />
            <Text style={styles.centerText}>Preparing PDF…</Text>
          </View>
        ) : !ready.data.ready ? (
          <View style={styles.center}>
            <Icon name="wifi-off" size={40} color={colors.muted} />
            <Text style={styles.centerText}>
              First-time setup needs internet once to prepare the offline PDF engine. Connect and reopen.
            </Text>
          </View>
        ) : (
          <WebView
            ref={webRef}
            testID="pdf-webview"
            source={{ uri: viewerUri() }}
            originWhitelist={["*"]}
            injectedJavaScriptBeforeContentLoaded={injected}
            onMessage={onMessage}
            allowFileAccess
            allowFileAccessFromFileURLs
            allowUniversalAccessFromFileURLs
            javaScriptEnabled
            domStorageEnabled
            style={{ flex: 1, backgroundColor: "#54565b" }}
          />
        )}
      </View>

      {pages > 0 && !error && Platform.OS !== "web" && (
        <View style={[styles.zoomBar, { bottom: insets.bottom + spacing.lg }]}>
          <Pressable testID="viewer-zoom-out" onPress={() => zoom(-1)} style={styles.zoomBtn}>
            <Icon name="minus" size={22} color={colors.onSurface} />
          </Pressable>
          <Text style={styles.zoomText}>{Math.round(scale * 100)}%</Text>
          <Pressable testID="viewer-zoom-in" onPress={() => zoom(1)} style={styles.zoomBtn}>
            <Icon name="plus" size={22} color={colors.onSurface} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    backgroundColor: c.surface,
    borderBottomWidth: 1,
    borderBottomColor: c.divider,
  },
  hBtn: { padding: spacing.sm },
  title: { fontSize: 16, fontWeight: "700", color: c.onSurface },
  sub: { fontSize: 12, color: c.muted },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    margin: spacing.md,
    backgroundColor: c.surfaceTertiary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  searchInput: { flex: 1, paddingVertical: spacing.md, fontSize: 15, color: c.onSurfaceTertiary },
  body: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl, gap: spacing.md },
  centerText: { fontSize: 14.5, color: c.muted, textAlign: "center", lineHeight: 21 },
  retryBtn: { marginTop: spacing.md, backgroundColor: c.brandPrimary, borderRadius: radius.pill, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  retryText: { color: c.onBrandPrimary, fontSize: 14, fontWeight: "700" },
  zoomBar: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: c.surfaceSecondary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: c.border,
    elevation: 5,
  },
  zoomBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  zoomText: { fontSize: 14, fontWeight: "700", color: c.onSurface, minWidth: 46, textAlign: "center" },
}));
