import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import * as ImageManipulator from "expo-image-manipulator";
import React, { useEffect, useRef, useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useDialog } from "@/src/components/dialog";
import { useToast } from "@/src/components/toast";
import { Icon } from "@/src/icons";
import { ProgressOverlay, haptic } from "@/src/components/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeBack } from "@/src/hooks/use-safe-back";
import { createFolder, listDir, ROOT } from "@/src/lib/fs";
import { imagesToPdf } from "@/src/lib/pdf";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function Scanner() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const safeBack = useSafeBack();
  const dialog = useDialog();
  const toast = useToast();
  const qc = useQueryClient();

  const [permission, requestPermission] = useCameraPermissions();
  const askedPermission = useRef(false);
  const cameraRef = useRef<CameraView>(null);
  const [facing, setFacing] = useState<"back" | "front">("back");
  const [flash, setFlash] = useState<"off" | "on">("off");
  const [pages, setPages] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    if (permission && !permission.granted && !askedPermission.current) {
      askedPermission.current = true;
      if (permission.canAskAgain) void requestPermission();
      else safeBack();
    }
  }, [permission, requestPermission, safeBack]);

  const capture = async () => {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    haptic();
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.75 });
      if (photo?.uri) setPages((p) => [...p, photo.uri]);
    } catch {
      toast.show("Capture failed", "error");
    } finally {
      setCapturing(false);
    }
  };

  const rotate = async (i: number) => {
    setBusy("Rotating…");
    try {
      const r = await ImageManipulator.manipulateAsync(pages[i], [{ rotate: 90 }], {
        compress: 0.85,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      setPages((p) => p.map((u, idx) => (idx === i ? r.uri : u)));
    } finally {
      setBusy(null);
    }
  };

  const removePage = (i: number) => setPages((p) => p.filter((_, idx) => idx !== i));

  const saveAsPdf = async (thenOcr: boolean) => {
    if (!pages.length) return;
    const name = await dialog.prompt({
      title: "Save scan as PDF",
      defaultValue: `Scan ${new Date().toLocaleDateString()}`,
      confirmText: "Save",
    });
    if (!name) return;
    setBusy("Creating PDF…");
    try {
      const scansDir = ROOT + "Scans/";
      const existing = await listDir(ROOT).catch(() => []);
      if (!existing.some((e) => e.isDir && e.name === "Scans")) await createFolder(ROOT, "Scans");
      const r = await imagesToPdf(pages, scansDir, name);
      qc.invalidateQueries({ queryKey: ["files"] });
      qc.invalidateQueries({ queryKey: ["pdf"] });
      qc.invalidateQueries({ queryKey: ["home"] });
      toast.show("Scan saved as PDF", "success");
      const firstPage = pages[0];
      setPages([]);
      setBusy(null);
      if (thenOcr) router.replace({ pathname: "/ocr", params: { uri: firstPage, name: name + ".pdf" } });
      else router.replace({ pathname: "/pdf-viewer", params: { uri: r.uri, name: name + ".pdf" } });
    } catch {
      setBusy(null);
      toast.show("Could not save PDF", "error");
    }
  };

  // Camera permission is requested automatically; no pre-permission screen is shown.
  if (!permission?.granted) return null;

  return (
    <View style={styles.cameraScreen}>
      <CameraView ref={cameraRef} style={styles.camera} facing={facing} flash={flash} />

      <View style={[styles.topControls, { top: insets.top + spacing.sm }]}>
        <Pressable testID="scanner-close" style={styles.roundBtn} onPress={safeBack}>
          <Icon name="close" size={24} color="#FFFFFF" />
        </Pressable>
        <View style={styles.topRight}>
          <Pressable testID="scanner-flash" style={styles.roundBtn} onPress={() => setFlash((f) => (f === "off" ? "on" : "off"))}>
            <Icon name={flash === "on" ? "flash" : "flash-off"} size={22} color="#FFFFFF" />
          </Pressable>
          <Pressable testID="scanner-flip" style={styles.roundBtn} onPress={() => setFacing((f) => (f === "back" ? "front" : "back"))}>
            <Icon name="camera-flip" size={22} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>

      <View style={styles.guide} pointerEvents="none">
        <View style={styles.guideFrame} />
        <Text style={styles.guideText}>Align document within the frame</Text>
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + spacing.md }]}>
        {pages.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbs}>
            {pages.map((uri, i) => (
              <View key={uri + i} style={styles.thumbWrap}>
                <Image source={{ uri }} style={styles.thumb} />
                <View style={styles.pageNum}>
                  <Text style={styles.pageNumText}>{i + 1}</Text>
                </View>
                <Pressable testID={`scan-rotate-${i}`} style={styles.thumbRotate} onPress={() => rotate(i)}>
                  <Icon name="rotate-right" size={14} color="#FFFFFF" />
                </Pressable>
                <Pressable testID={`scan-remove-${i}`} style={styles.thumbRemove} onPress={() => removePage(i)}>
                  <Icon name="close" size={14} color="#FFFFFF" />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        )}

        <View style={styles.captureRow}>
          <View style={styles.sideSlot}>
            <Text style={styles.countText}>{pages.length > 0 ? `${pages.length} page${pages.length === 1 ? "" : "s"}` : ""}</Text>
          </View>
          <Pressable testID="scanner-capture" style={styles.captureBtn} onPress={capture}>
            <View style={styles.captureInner} />
          </Pressable>
          <View style={styles.sideSlot}>
            {pages.length > 0 && (
              <Pressable testID="scanner-done" style={styles.doneBtn} onPress={() => saveAsPdf(false)}>
                <Icon name="check" size={26} color={colors.onBrandPrimary} />
              </Pressable>
            )}
          </View>
        </View>

        {pages.length > 0 && (
          <View style={styles.finishRow}>
            <Pressable testID="scanner-save-pdf" style={[styles.finishBtn, styles.finishGhost]} onPress={() => saveAsPdf(false)}>
              <Icon name="file-pdf-box" size={18} color="#FFFFFF" />
              <Text style={styles.finishText}>Save PDF</Text>
            </Pressable>
            <Pressable testID="scanner-save-ocr" style={[styles.finishBtn, styles.finishPrimary]} onPress={() => saveAsPdf(true)}>
              <Icon name="text-recognition" size={18} color="#FFFFFF" />
              <Text style={styles.finishText}>Save + OCR</Text>
            </Pressable>
          </View>
        )}
      </View>

      <ProgressOverlay visible={!!busy} label={busy ?? undefined} />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.surface },
  cameraScreen: { flex: 1, backgroundColor: "#000000" },
  camera: { ...StyleSheetAbsolute() },
  topControls: { position: "absolute", left: spacing.lg, right: spacing.lg, flexDirection: "row", justifyContent: "space-between", zIndex: 3 },
  topRight: { flexDirection: "row", gap: spacing.sm },
  roundBtn: { width: 42, height: 42, borderRadius: radius.pill, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" },
  guide: { ...StyleSheetAbsolute(), alignItems: "center", justifyContent: "center" },
  guideFrame: { width: "78%", height: "52%", borderWidth: 2, borderColor: "rgba(255,255,255,0.75)", borderRadius: radius.md, borderStyle: "dashed" },
  guideText: { color: "rgba(255,255,255,0.85)", marginTop: spacing.md, fontSize: 13, fontWeight: "600" },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.4)", paddingTop: spacing.md },
  thumbs: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  thumbWrap: { width: 60, height: 78 },
  thumb: { width: 60, height: 78, borderRadius: radius.sm, backgroundColor: "#333" },
  pageNum: { position: "absolute", bottom: 2, left: 2, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 4, paddingHorizontal: 5 },
  pageNumText: { color: "#FFF", fontSize: 10, fontWeight: "700" },
  thumbRotate: { position: "absolute", top: -6, left: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center" },
  thumbRemove: { position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: "#D32F2F", alignItems: "center", justifyContent: "center" },
  captureRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xxl },
  sideSlot: { width: 64, alignItems: "center", justifyContent: "center" },
  countText: { color: "#FFF", fontSize: 12, fontWeight: "600" },
  captureBtn: { width: 74, height: 74, borderRadius: 37, borderWidth: 4, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  captureInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: "#FFFFFF" },
  doneBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: "#FF5E00", alignItems: "center", justifyContent: "center" },
  finishRow: { flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.lg, marginTop: spacing.md },
  finishBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, paddingVertical: spacing.md, borderRadius: radius.md },
  finishGhost: { backgroundColor: "rgba(255,255,255,0.18)" },
  finishPrimary: { backgroundColor: "#FF5E00" },
  finishText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 },
}));

function StyleSheetAbsolute() {
  return { position: "absolute" as const, top: 0, left: 0, right: 0, bottom: 0 };
}
