import React from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "@/src/components/screen-header";
import { makeStyles, spacing } from "@/src/theme";

const EFFECTIVE_DATE = "August 26, 2025";

export default function Terms() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      <ScreenHeader title="Terms & Conditions" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl }} showsVerticalScrollIndicator={false}>
        <Text style={styles.updated}>Effective date: {EFFECTIVE_DATE}</Text>
        <Text style={styles.p}>By using File Mind, you agree to these Terms & Conditions. File Mind is an offline file utility operated by Jarvis AI. If you do not agree, do not use the app.</Text>
        <Text style={styles.h}>1. License</Text>
        <Text style={styles.p}>We grant you a personal, non-exclusive, non-transferable license to use File Mind on devices you own or control for managing lawful content.</Text>
        <Text style={styles.h}>2. Your responsibilities</Text>
        <Text style={styles.p}>You are responsible for the files you import, create, edit, convert, and share. Use only content you have the right to use and do not use the app for unlawful activity.</Text>
        <Text style={styles.h}>3. Local data and backups</Text>
        <Text style={styles.p}>File Mind stores data locally. Uninstalling the app, clearing its data, or losing the device may remove files and Vault content. Because File Mind has no cloud backup, you are responsible for maintaining independent backups.</Text>
        <Text style={styles.h}>4. Document operations</Text>
        <Text style={styles.p}>Conversions, OCR, edits, merges, compression, and other operations can be affected by file format, device storage, and platform limitations. Verify important output and preserve originals before destructive actions.</Text>
        <Text style={styles.h}>5. Device features</Text>
        <Text style={styles.p}>Camera, biometrics, media access, audio, video, PDF rendering, and OCR depend on your device and operating system. You control permission decisions and system settings.</Text>
        <Text style={styles.h}>6. No warranty</Text>
        <Text style={styles.p}>File Mind is provided “as is” without warranties of any kind. We do not guarantee uninterrupted operation or recovery of local data.</Text>
        <Text style={styles.h}>7. Limitation of liability</Text>
        <Text style={styles.p}>To the maximum extent permitted by law, Jarvis AI is not liable for loss of data, profits, or indirect or consequential damages arising from use of the app.</Text>
        <Text style={styles.h}>8. Changes</Text>
        <Text style={styles.p}>We may update the app and these terms. Continued use after an update means you accept the updated terms.</Text>
        <Text style={styles.h}>9. Contact</Text>
        <Text style={styles.p}>Questions about these terms can be sent to jarvisai9077@gmail.com.</Text>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.surface },
  updated: { fontSize: 13, color: c.muted, marginBottom: spacing.lg },
  h: { fontSize: 16, fontWeight: "700", color: c.onSurface, marginTop: spacing.lg, marginBottom: spacing.sm },
  p: { fontSize: 14.5, color: c.onSurfaceTertiary, lineHeight: 22 },
}));
