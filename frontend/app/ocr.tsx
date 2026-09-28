import { useQueryClient } from "@tanstack/react-query";
import { Asset } from "expo-asset";
import { useLocalSearchParams } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import React, { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

import { ScreenHeader } from "@/src/components/screen-header";
import { useToast } from "@/src/components/toast";
import { Chip } from "@/src/components/ui";
import { Icon } from "@/src/icons";
import { getMeta, upsertMeta } from "@/src/lib/db";
import { baseName, getExt } from "@/src/lib/format";
import { createFolder, importInto, joinDir, listDir, readBase64, ROOT, TMP, uniqueName, writeText } from "@/src/lib/fs";

const TESS_DIR = `${FileSystem.cacheDirectory}tesseract/`;
const TESS_CORE_DIR = `${TESS_DIR}core/`;
const TESS_CORE = `${TESS_CORE_DIR}tesseract-core.wasm.js`;
const TESS_DATA_DIR = `${TESS_DIR}data/`;
const OCR_PAGE = `${TESS_DIR}ocr.html`;
const TESS_ASSETS = [
  { module: require("../assets/tesseract/tesseract.min.js.tessjs"), target: `${TESS_DIR}tesseract.min.js` },
  { module: require("../assets/tesseract/worker.min.js.tessjs"), target: `${TESS_DIR}worker.min.js` },
  { module: require("../assets/tesseract/core/tesseract-core.wasm.js.tessjs"), target: `${TESS_CORE_DIR}tesseract-core.wasm.js` },
  { module: require("../assets/tesseract/core/tesseract-core-simd.wasm.js.tessjs"), target: `${TESS_CORE_DIR}tesseract-core-simd.wasm.js` },
  { module: require("../assets/tesseract/core/tesseract-core-lstm.wasm.js.tessjs"), target: `${TESS_CORE_DIR}tesseract-core-lstm.wasm.js` },
  { module: require("../assets/tesseract/core/tesseract-core-simd-lstm.wasm.js.tessjs"), target: `${TESS_CORE_DIR}tesseract-core-simd-lstm.wasm.js` },
  { module: require("../assets/tesseract/data/eng.traineddata.gz.tessdata"), target: `${TESS_DATA_DIR}eng.traineddata.gz` },
  { module: require("../assets/tesseract/data/hin.traineddata.gz.tessdata"), target: `${TESS_DATA_DIR}hin.traineddata.gz` },
];

async function prepareOcrAssets() {
  await FileSystem.makeDirectoryAsync(TESS_CORE_DIR, { intermediates: true });
  await FileSystem.makeDirectoryAsync(TESS_DATA_DIR, { intermediates: true });
  for (const item of TESS_ASSETS) {
    const asset = Asset.fromModule(item.module);
    await asset.downloadAsync();
    const source = asset.localUri || asset.uri;
    if (!source) throw new Error("OCR engine asset unavailable");
    const info = await FileSystem.getInfoAsync(item.target);
    if (!info.exists) await FileSystem.copyAsync({ from: source, to: item.target });
  }
  await FileSystem.writeAsStringAsync(OCR_PAGE, OCR_HTML);
}

import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const OCR_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<script src="./tesseract.min.js"></script>
</head><body>
<script>
var RN=window.ReactNativeWebView;
function post(o){try{RN.postMessage(JSON.stringify(o));}catch(e){}}
(function(){
  if(!window.Tesseract){post({type:'error',message:'engine'});return;}
  try{
    Tesseract.recognize(window.__IMG__, window.__LANG__, {
      workerPath: window.__WORKER__,
      corePath: window.__CORE__,
      langPath: window.__LANGPATH__,
      logger:function(m){ if(m.status==='recognizing text'){ post({type:'progress',progress:m.progress}); } else { post({type:'status',status:m.status}); } }
    }).then(function(r){ post({type:'done', text:(r.data&&r.data.text)||''}); })
      .catch(function(e){ post({type:'error', message:String(e&&e.message)}); });
  }catch(e){ post({type:'error', message:String(e&&e.message)}); }
})();
</script></body></html>`;

export default function Ocr() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const qc = useQueryClient();
  const { uri, name } = useLocalSearchParams<{ uri: string; name: string }>();

  const [lang, setLang] = useState<"eng" | "hin" | "eng+hin">("eng");
  const [imgData, setImgData] = useState<string | null>(null);
  const [status, setStatus] = useState("Loading image…");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assetsReady, setAssetsReady] = useState(false);
  const [runKey, setRunKey] = useState(0);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        if (Platform.OS !== "web") await prepareOcrAssets();
        const b64 = await readBase64(uri);
        const ext = getExt(name) || "jpg";
        const mime = ext === "png" ? "image/png" : "image/jpeg";
        setImgData(`data:${mime};base64,${b64}`);
        setAssetsReady(true);
      } catch {
        setError("Could not prepare the offline OCR engine");
      }
    })();
  }, [uri, name, retryKey]);

  const injected = useMemo(
    () => (imgData ? `window.__IMG__=${JSON.stringify(imgData)};window.__LANG__=${JSON.stringify(lang)};window.__WORKER__=${JSON.stringify(`${TESS_DIR}worker.min.js`)};window.__CORE__=${JSON.stringify(TESS_CORE)};window.__LANGPATH__=${JSON.stringify(TESS_DATA_DIR)};true;` : "true;"),
    [imgData, lang],
  );

  const onMessage = (e: any) => {
    try {
      const m = JSON.parse(e.nativeEvent.data);
      if (m.type === "status") setStatus(m.status);
      else if (m.type === "progress") {
        setProgress(m.progress);
        setStatus("Recognizing text…");
      } else if (m.type === "done") {
        setResult(m.text || "");
        setProgress(1);
      } else if (m.type === "error") setError(m.message || "OCR failed");
    } catch {
      setError("OCR returned an invalid response");
    }
  };

  const rerun = (l: typeof lang) => {
    setLang(l);
    setResult(null);
    setError(null);
    setProgress(0);
    setStatus("Restarting…");
    setRunKey((k) => k + 1);
  };

  const saveTxt = async () => {
    if (!result) return;
    try {
      const ocrDir = ROOT + "OCR/";
      const rootEntries = await listDir(ROOT).catch(() => []);
      if (!rootEntries.some((e) => e.isDir && e.name === "OCR")) await createFolder(ROOT, "OCR");
      const fn = await uniqueName(ocrDir, `${baseName(name)}.txt`);
      const dest = joinDir(ocrDir, fn);
      await writeText(dest, result);
      if (uri.startsWith(ROOT)) {
        const m = await getMeta(uri);
        await upsertMeta(uri, name, { ocr: result, category: m?.category || "" });
      }
      await upsertMeta(dest, fn, { ocr: result });
      qc.invalidateQueries({ queryKey: ["files"] });
      toast.show("Saved as searchable text", "success");
    } catch {
      toast.show("Could not save OCR text", "error");
    }
  };

  const share = async () => {
    if (!result) return;
    try {
      const tmp = TMP + `${baseName(name)}.txt`;
      await writeText(tmp, result);
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(tmp);
      else toast.show("Sharing is not available", "info");
    } catch {
      toast.show("Could not share OCR text", "error");
    }
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title="OCR — Extract text" subtitle={name} />
      <View style={styles.langRow}>
        <Chip label="English" active={lang === "eng"} onPress={() => rerun("eng")} testID="ocr-eng" />
        <Chip label="हिन्दी" active={lang === "hin"} onPress={() => rerun("hin")} testID="ocr-hin" />
        <Chip label="Both" active={lang === "eng+hin"} onPress={() => rerun("eng+hin")} testID="ocr-both" />
      </View>

      {Platform.OS === "web" ? (
        <View style={styles.center}>
          <Icon name="cellphone" size={40} color={colors.muted} />
          <Text style={styles.centerText}>OCR requires Expo Go or a native development build.</Text>
          <Text style={styles.hint}>The browser preview cannot run the bundled native OCR WebView.</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Icon name="alert-circle-outline" size={40} color={colors.error} />
          <Text style={styles.centerText}>{error}</Text>
          <Text style={styles.hint}>OCR runs from the bundled on-device engine. No internet connection is required.</Text>
          <Pressable
            testID="ocr-retry"
            style={styles.retryBtn}
            onPress={() => {
              setError(null);
              setResult(null);
              setProgress(0);
              setStatus("Retrying…");
              setRunKey((key) => key + 1);
              setRetryKey((key) => key + 1);
            }}
          >
            <Text style={styles.retryText}>Retry OCR</Text>
          </Pressable>
        </View>
      ) : result === null ? (
        <View style={styles.center}>
          <View style={styles.progressCircle}>
            <Text style={styles.progressPct}>{Math.round(progress * 100)}%</Text>
          </View>
          <Text style={styles.centerText}>{status}</Text>
          <Text style={styles.hint}>Reading {lang === "hin" ? "Hindi" : lang === "eng+hin" ? "Hindi + English" : "English"} text on-device…</Text>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.resultWrap}>
            <Text style={styles.resultText} selectable testID="ocr-result">
              {result.trim() || "No text detected in this image."}
            </Text>
          </ScrollView>
          <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
            <Pressable testID="ocr-share" style={[styles.btn, styles.ghost]} onPress={share}>
              <Icon name="share-variant" size={18} color={colors.onSurfaceTertiary} />
              <Text style={styles.ghostText}>Share</Text>
            </Pressable>
            <Pressable testID="ocr-save" style={[styles.btn, styles.primary]} onPress={saveTxt}>
              <Icon name="content-save" size={18} color={colors.onBrandPrimary} />
              <Text style={styles.primaryText}>Save searchable text</Text>
            </Pressable>
          </View>
        </>
      )}

      {imgData && assetsReady && result === null && !error && Platform.OS !== "web" && (
        <WebView
          key={runKey}
          testID="ocr-webview"
          source={{ uri: OCR_PAGE }}
          injectedJavaScriptBeforeContentLoaded={injected}
          onMessage={onMessage}
          onError={() => setError("OCR WebView could not load the bundled engine")}
          onHttpError={() => setError("OCR assets could not be loaded on this device")}
          javaScriptEnabled
          domStorageEnabled
          originWhitelist={["*"]}
          style={styles.hiddenWeb}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.surface },
  langRow: { flexDirection: "row", gap: spacing.sm, padding: spacing.lg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl, gap: spacing.md },
  centerText: { fontSize: 15, color: c.onSurface, fontWeight: "600", textAlign: "center" },
  hint: { fontSize: 13, color: c.muted, textAlign: "center", lineHeight: 19, maxWidth: 300 },
  retryBtn: { marginTop: spacing.md, backgroundColor: c.brandPrimary, borderRadius: radius.pill, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  retryText: { color: c.onBrandPrimary, fontWeight: "700", fontSize: 14 },
  progressCircle: { width: 96, height: 96, borderRadius: 48, borderWidth: 5, borderColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  progressPct: { fontSize: 22, fontWeight: "800", color: c.brandPrimary },
  resultWrap: { padding: spacing.lg, paddingBottom: 100 },
  resultText: { fontSize: 15, color: c.onSurface, lineHeight: 23 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", gap: spacing.md, padding: spacing.lg, borderTopWidth: 1, borderTopColor: c.divider, backgroundColor: c.surface },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, paddingVertical: spacing.md, borderRadius: radius.md },
  ghost: { flex: 1, backgroundColor: c.surfaceTertiary },
  ghostText: { color: c.onSurfaceTertiary, fontWeight: "600", fontSize: 14 },
  primary: { flex: 2, backgroundColor: c.brandPrimary },
  primaryText: { color: c.onBrandPrimary, fontWeight: "700", fontSize: 14 },
  hiddenWeb: { position: "absolute", width: 1, height: 1, opacity: 0 },
}));
