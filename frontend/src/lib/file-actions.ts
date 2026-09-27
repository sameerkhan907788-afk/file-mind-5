import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

import { getInfo, parentOf, readBase64, writeBase64 } from "./fs";

export function mimeForName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    pdf: "application/pdf",
    txt: "text/plain",
    md: "text/markdown",
    csv: "text/csv",
    json: "application/json",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    mp4: "video/mp4",
    mp3: "audio/mpeg",
    zip: "application/zip",
  };
  return (ext && map[ext]) || "application/octet-stream";
}

export async function assertReadableFile(uri: string): Promise<{ size: number }> {
  const info = await getInfo(uri);
  if (!info.exists || info.isDirectory) throw new Error("File is missing or unavailable");
  const size = Number((info as any).size ?? 0);
  if (size <= 0) throw new Error("File is empty");
  return { size };
}

export async function shareFile(uri: string, name: string): Promise<void> {
  await assertReadableFile(uri);
  if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing is not available on this device");
  await Sharing.shareAsync(uri, {
    mimeType: mimeForName(name),
    dialogTitle: `Share ${name}`,
    UTI: mimeForName(name),
  });
}

export async function saveCopy(uri: string, name: string): Promise<string> {
  const { size } = await assertReadableFile(uri);
  if (Platform.OS === "android") {
    const saf = (FileSystem as any).StorageAccessFramework;
    if (!saf) throw new Error("Android storage access is unavailable");
    const permission = await saf.requestDirectoryPermissionsAsync();
    if (!permission.granted || !permission.directoryUri) throw new Error("Storage permission was cancelled");
    const target = await saf.createFileAsync(permission.directoryUri, name, mimeForName(name));
    const base64 = await readBase64(uri);
    await FileSystem.writeAsStringAsync(target, base64, { encoding: FileSystem.EncodingType.Base64 });
    const saved = await getInfo(target);
    if (!saved.exists || Number((saved as any).size ?? 0) !== size) throw new Error("The saved copy could not be verified");
    return target;
  }

  // On iOS and web, the system share sheet is the supported save/export path.
  await shareFile(uri, name);
  return uri;
}

export async function verifyOutput(uri: string, expectedPrefix?: string): Promise<{ uri: string; size: number }> {
  const { size } = await assertReadableFile(uri);
  if (expectedPrefix) {
    const base64 = await readBase64(uri);
    if (!base64.startsWith(expectedPrefix)) throw new Error("Generated file failed validation");
  }
  return { uri, size };
}

export function parentDirectory(uri: string): string {
  return parentOf(uri);
}

export async function copyToCache(uri: string, name: string): Promise<string> {
  const cache = `${FileSystem.cacheDirectory}file-mind/`;
  await FileSystem.makeDirectoryAsync(cache, { intermediates: true });
  const target = `${cache}${name}`;
  await FileSystem.copyAsync({ from: uri, to: target });
  await assertReadableFile(target);
  return target;
}

export async function overwriteBase64(uri: string, base64: string): Promise<void> {
  await writeBase64(uri, base64);
  await assertReadableFile(uri);
}
