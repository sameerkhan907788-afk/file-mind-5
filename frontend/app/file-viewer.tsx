import { Image } from "expo-image";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useLocalSearchParams } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

import { ScreenHeader } from "@/src/components/screen-header";
import { useToast } from "@/src/components/toast";
import { Icon } from "@/src/icons";
import { shareFile, saveCopy } from "@/src/lib/file-actions";
import { formatBytes, getExt } from "@/src/lib/format";
import { getInfo, readText } from "@/src/lib/fs";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function FileViewer() {
  const { uri, name, kind } = useLocalSearchParams<{ uri: string; name: string; kind: string }>();
  const styles = useStyles();
  const { colors } = useTheme();
  const toast = useToast();
  const [state, setState] = useState<"checking" | "ready" | "error">("checking");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const info = await getInfo(uri);
        if (!info.exists || info.isDirectory || Number((info as any).size ?? 0) <= 0) throw new Error("File is missing or empty");
        if (active) setState("ready");
      } catch {
        if (active) setState("error");
      }
    })();
    return () => {
      active = false;
    };
  }, [uri, attempt]);

  const runShare = async () => {
    try {
      await shareFile(uri, name);
      toast.show("Share sheet opened", "success");
    } catch (error: any) {
      toast.show(error?.message || "Could not share this file", "error");
    }
  };

  const runSave = async () => {
    try {
      await saveCopy(uri, name);
      toast.show("File saved successfully", "success");
    } catch (error: any) {
      toast.show(error?.message || "Could not save a copy", "error");
    }
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={name}
        actions={[
          { icon: "download", testID: "fileviewer-save", onPress: runSave },
          { icon: "share-variant", testID: "fileviewer-share", onPress: runShare },
        ]}
      />
      {state === "checking" ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>
      ) : state === "error" ? (
        <ViewerError name={name} onRetry={() => { setState("checking"); setAttempt((value) => value + 1); }} />
      ) : kind === "image" ? (
        <ScrollView maximumZoomScale={4} minimumZoomScale={1} contentContainerStyle={styles.imageWrap} centerContent>
          <Image source={{ uri }} style={styles.image} contentFit="contain" testID="viewer-image" />
        </ScrollView>
      ) : kind === "video" ? (
        <VideoPreview uri={uri} />
      ) : kind === "audio" ? (
        <AudioPreview uri={uri} name={name} />
      ) : (
        <TextPreview uri={uri} name={name} onShare={runShare} />
      )}
    </View>
  );
}

function ViewerError({ name, onRetry }: { name: string; onRetry: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.unsupported}>
      <Icon name="file-alert-outline" size={44} color={colors.error} />
      <Text style={styles.unsupportedTitle}>File unavailable</Text>
      <Text style={styles.unsupportedText}>{name} is missing, empty, or cannot be read.</Text>
      <Pressable testID="viewer-retry" style={styles.openWith} onPress={onRetry}>
        <Text style={styles.openWithText}>Try again</Text>
      </Pressable>
    </View>
  );
}

function VideoPreview({ uri }: { uri: string }) {
  const styles = useStyles();
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
  });
  return (
    <View style={styles.mediaWrap}>
      <VideoView style={styles.video} player={player} contentFit="contain" testID="viewer-video" />
    </View>
  );
}

function AudioPreview({ uri, name }: { uri: string; name: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);
  return (
    <View style={styles.audioWrap}>
      <View style={styles.audioArt}>
        <Icon name="music-note" size={72} color={colors.brandPrimary} />
      </View>
      <Text style={styles.audioName} numberOfLines={2}>
        {name}
      </Text>
      <View style={styles.audioBarTrack}>
        <View
          style={[
            styles.audioBarFill,
            { width: `${status.duration ? (status.currentTime / status.duration) * 100 : 0}%` },
          ]}
        />
      </View>
      <Pressable
        testID="audio-playpause"
        style={styles.playBtn}
        onPress={() => (status.playing ? player.pause() : player.play())}
      >
        <Icon name={status.playing ? "pause" : "play"} size={34} color={colors.onBrandPrimary} />
      </Pressable>
    </View>
  );
}

function TextPreview({ uri, name, onShare }: { uri: string; name: string; onShare: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [content, setContent] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ size: number; modified: number } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const info = await getInfo(uri);
        setMeta({ size: (info as any).size ?? 0, modified: ((info as any).modificationTime ?? 0) * 1000 });
        const text = await readText(uri);
        setContent(text.slice(0, 200000));
      } catch {
        setFailed(true);
      }
    })();
  }, [uri]);

  if (failed) {
    return (
      <View style={styles.unsupported}>
        <Icon name="file-alert-outline" size={44} color={colors.muted} />
        <Text style={styles.unsupportedTitle}>Cannot preview this file</Text>
        <Text style={styles.unsupportedText}>
          {name} · {getExt(name).toUpperCase()}
          {meta ? ` · ${formatBytes(meta.size)}` : ""}
        </Text>
        <Pressable
          testID="unsupported-openwith"
          style={styles.openWith}
          onPress={onShare}
        >
          <Text style={styles.openWithText}>Open with…</Text>
        </Pressable>
      </View>
    );
  }
  if (content === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brandPrimary} />
      </View>
    );
  }
  return (
    <ScrollView contentContainerStyle={styles.textWrap}>
      <Text style={styles.textContent} selectable>
        {content}
      </Text>
    </ScrollView>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.surface },
  imageWrap: { flexGrow: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#000" },
  image: { width: "100%", height: "100%", minHeight: 400 },
  mediaWrap: { flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center" },
  video: { width: "100%", height: "100%" },
  audioWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl, gap: spacing.lg },
  audioArt: { width: 180, height: 180, borderRadius: radius.xxl, backgroundColor: c.brandSecondary, alignItems: "center", justifyContent: "center" },
  audioName: { fontSize: 17, fontWeight: "700", color: c.onSurface, textAlign: "center" },
  audioBarTrack: { width: "100%", height: 6, borderRadius: 3, backgroundColor: c.surfaceTertiary },
  audioBarFill: { height: 6, borderRadius: 3, backgroundColor: c.brandPrimary },
  playBtn: { width: 72, height: 72, borderRadius: 36, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  textWrap: { padding: spacing.lg },
  textContent: { fontSize: 13.5, color: c.onSurface, fontFamily: "monospace", lineHeight: 20 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  unsupported: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl, gap: spacing.md },
  unsupportedTitle: { fontSize: 18, fontWeight: "700", color: c.onSurface },
  unsupportedText: { fontSize: 14, color: c.muted, textAlign: "center" },
  openWith: { marginTop: spacing.md, backgroundColor: c.brandPrimary, paddingHorizontal: spacing.xxl, paddingVertical: spacing.md, borderRadius: radius.pill },
  openWithText: { color: c.onBrandPrimary, fontWeight: "700", fontSize: 15 },
}));
