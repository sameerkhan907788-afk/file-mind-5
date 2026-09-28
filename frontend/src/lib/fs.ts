import * as FileSystem from "expo-file-system/legacy";

import { getKind, type FileKind } from "./format";

const DOCUMENT_DIR = FileSystem.documentDirectory ?? "";
const CACHE_DIR = FileSystem.cacheDirectory ?? "";

export const ROOT = DOCUMENT_DIR ? `${DOCUMENT_DIR}FileMind/` : "";
export const TRASH = ROOT ? `${ROOT}.trash/` : "";
export const VAULT = DOCUMENT_DIR ? `${DOCUMENT_DIR}.vault/` : "";
export const TMP = CACHE_DIR ? `${CACHE_DIR}fm-tmp/` : "";

// Web preview does not provide the native sandbox filesystem. Native (Expo Go / device) does.
export const HAS_FS = Boolean(DOCUMENT_DIR);

export type FileEntry = {
  name: string;
  uri: string;
  isDir: boolean;
  size: number;
  modified: number; // ms
  kind: FileKind;
};

async function ensure(dir: string) {
  if (!HAS_FS || !dir) throw new Error("Local file storage is unavailable in this environment");
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

export async function ensureDirs() {
  if (!HAS_FS) return;
  await ensure(ROOT);
  await ensure(TRASH);
  await ensure(VAULT);
  await ensure(TMP);
}

function joinDir(parent: string, name: string) {
  const base = parent.endsWith("/") ? parent : parent + "/";
  return base + name;
}

export async function listDir(dir: string): Promise<FileEntry[]> {
  if (!HAS_FS || !dir) return [];
  await ensureDirs();
  await ensure(dir);
  const names = await FileSystem.readDirectoryAsync(dir);
  const entries: FileEntry[] = [];
  for (const name of names) {
    if (name.startsWith(".")) continue; // hidden (trash etc.)
    const uri = joinDir(dir, name);
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) continue;
    const isDir = !!info.isDirectory;
    entries.push({
      name,
      uri: isDir ? (uri.endsWith("/") ? uri : uri + "/") : uri,
      isDir,
      size: (info as any).size ?? 0,
      modified: ((info as any).modificationTime ?? 0) * 1000,
      kind: getKind(name, isDir),
    });
  }
  return entries;
}

export async function statFolderSize(dir: string): Promise<number> {
  if (!HAS_FS) return 0;
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop()!;
    let names: string[] = [];
    try {
      names = await FileSystem.readDirectoryAsync(d);
    } catch {
      continue;
    }
    for (const n of names) {
      const uri = joinDir(d, n);
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists) continue;
      if (info.isDirectory) stack.push(uri);
      else total += (info as any).size ?? 0;
    }
  }
  return total;
}

export async function uniqueName(dir: string, name: string): Promise<string> {
  await ensure(dir);
  const safeName = sanitizeName(name, "untitled");
  const dot = safeName.lastIndexOf(".");
  const base = dot > 0 ? safeName.slice(0, dot) : safeName;
  const ext = dot > 0 ? safeName.slice(dot) : "";
  let candidate = safeName;
  let i = 1;
  while ((await FileSystem.getInfoAsync(joinDir(dir, candidate))).exists) {
    candidate = `${base} (${i})${ext}`;
    i++;
  }
  return candidate;
}

export function sanitizeName(value: string, fallback = "untitled"): string {
  const cleaned = value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim().replace(/^\.+/, "");
  return cleaned || fallback;
}

export async function createFolder(parent: string, name: string) {
  await ensure(parent);
  const safe = await uniqueName(parent, sanitizeName(name, "New folder"));
  await FileSystem.makeDirectoryAsync(joinDir(parent, safe), { intermediates: true });
  return joinDir(parent, safe);
}

export async function renameEntry(entry: FileEntry, newName: string) {
  const parent = parentOf(entry.uri);
  const to = joinDir(parent, newName);
  await FileSystem.moveAsync({ from: entry.uri, to });
  return to;
}

export function parentOf(uri: string): string {
  let u = uri.endsWith("/") ? uri.slice(0, -1) : uri;
  const i = u.lastIndexOf("/");
  return u.slice(0, i + 1);
}

export async function copyEntry(entry: FileEntry, destDir: string) {
  await ensure(destDir);
  const safe = await uniqueName(destDir, entry.name);
  await copyFile(entry.uri, joinDir(destDir, safe));
  return joinDir(destDir, safe);
}

export async function moveEntry(entry: FileEntry, destDir: string) {
  await ensure(destDir);
  const safe = await uniqueName(destDir, entry.name);
  await FileSystem.moveAsync({ from: entry.uri, to: joinDir(destDir, safe) });
  return joinDir(destDir, safe);
}

export type TrashItem = {
  id: string;
  name: string;
  originalPath: string;
  trashPath: string;
  size: number;
  isDir: boolean;
  deleted: number;
};

export async function moveToTrash(entry: FileEntry): Promise<TrashItem> {
  await ensureDirs();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const trashPath = TRASH + id + "__" + entry.name + (entry.isDir ? "/" : "");
  await FileSystem.moveAsync({ from: entry.uri, to: trashPath });
  return {
    id,
    name: entry.name,
    originalPath: entry.uri,
    trashPath,
    size: entry.size,
    isDir: entry.isDir,
    deleted: Date.now(),
  };
}

export async function restoreTrash(item: TrashItem) {
  const destDir = parentOf(item.originalPath);
  await ensure(destDir);
  const safe = await uniqueName(destDir, item.name);
  await FileSystem.moveAsync({ from: item.trashPath, to: joinDir(destDir, safe) });
  return joinDir(destDir, safe);
}

export async function deleteForever(uri: string) {
  await FileSystem.deleteAsync(uri, { idempotent: true });
}

export async function readText(uri: string) {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists || info.isDirectory) throw new Error("File is missing or unavailable");
  return FileSystem.readAsStringAsync(uri);
}

export async function writeText(uri: string, content: string) {
  await ensure(parentOf(uri));
  await FileSystem.writeAsStringAsync(uri, content);
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) throw new Error("Text file was not saved");
}

export async function writeBase64(uri: string, b64: string) {
  if (!b64) throw new Error("Cannot save an empty file");
  await ensure(parentOf(uri));
  await FileSystem.writeAsStringAsync(uri, b64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists || Number((info as any).size ?? 0) <= 0) throw new Error("File was not saved");
}

export async function readBase64(uri: string) {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists || info.isDirectory) throw new Error("File is missing or unavailable");
  return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
}

export async function getInfo(uri: string) {
  return FileSystem.getInfoAsync(uri);
}

async function copyFile(srcUri: string, destUri: string) {
  await ensure(parentOf(destUri));
  try {
    await FileSystem.copyAsync({ from: srcUri, to: destUri });
  } catch (copyError) {
    try {
      const b64 = await FileSystem.readAsStringAsync(srcUri, { encoding: FileSystem.EncodingType.Base64 });
      await FileSystem.writeAsStringAsync(destUri, b64, { encoding: FileSystem.EncodingType.Base64 });
    } catch {
      throw copyError;
    }
  }
  const info = await FileSystem.getInfoAsync(destUri);
  if (!info.exists || info.isDirectory) {
    throw new Error("The selected file could not be copied into File Mind storage");
  }
}

export async function importInto(destDir: string, srcUri: string, name: string) {
  await ensure(destDir);
  const safe = await uniqueName(destDir, sanitizeName(name, "imported-file"));
  const to = joinDir(destDir, safe);
  await copyFile(srcUri, to);
  return to;
}

export { joinDir, ensure };
