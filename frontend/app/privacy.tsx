import React from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "@/src/components/screen-header";
import { makeStyles, spacing } from "@/src/theme";

const EFFECTIVE_DATE = "August 26, 2025";

export default function Privacy() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      <ScreenHeader title="Privacy Policy" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl }} showsVerticalScrollIndicator={false}>
        <Text style={styles.updated}>Effective date: {EFFECTIVE_DATE}</Text>
        <Text style={styles.p}>File Mind is an offline-first document and file utility operated by Jarvis AI. This policy describes how File Mind handles information.</Text>
        <Text style={styles.h}>1. Local-only design</Text>
        <Text style={styles.p}>File Mind does not require an account, backend, cloud database, or cloud storage. Files, scans, OCR results, tags, favorites, trash, and Vault content are stored on your device.</Text>
        <Text style={styles.h}>2. Information we do not collect</Text>
        <Text style={styles.p}>We do not collect, sell, or share your files, document contents, contacts, precise location, or usage analytics. File Mind does not use advertising trackers.</Text>
        <Text style={styles.h}>3. Device permissions</Text>
        <Text style={styles.p}>Camera is used only to scan documents. Photos and media access are used only to import or save files. Biometrics are used only to protect Vault. You can revoke permissions in system settings.</Text>
        <Text style={styles.h}>4. Sharing</Text>
        <Text style={styles.p}>Files leave File Mind only when you explicitly use your device’s share or export controls. File Mind does not transmit files on its own.</Text>
        <Text style={styles.h}>5. Security and retention</Text>
        <Text style={styles.p}>Vault files remain in the app’s private storage and may be protected by device biometrics. Uninstalling the app, clearing app data, or losing the device can remove local data. Keep independent backups of important files.</Text>
        <Text style={styles.h}>6. Children’s privacy</Text>
        <Text style={styles.p}>File Mind does not knowingly collect personal information from anyone, including children.</Text>
        <Text style={styles.h}>7. Changes</Text>
        <Text style={styles.p}>We may update this policy as the app changes. The effective date above will be updated when material changes are made.</Text>
        <Text style={styles.h}>8. Contact</Text>
        <Text style={styles.p}>Privacy questions can be sent to jarvisai9077@gmail.com.</Text>
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
