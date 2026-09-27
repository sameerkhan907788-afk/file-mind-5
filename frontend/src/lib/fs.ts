import * as FileSystem from "expo-file-system/legacy";

import { getKind, type FileKind } from "./format";

export const ROOT = FileSystem.documentDirectory + "FileMind/";
export const TRASH = ROOT + ".trash/";
export const VAULT = FileSystem.documentDirectory + ".vault/";
export const TMP = FileSystem.cacheDirectory + "fm-tmp/";

// On web there is no sandbox document directory; short-circuit fs ops so the UI
// renders empty states instead of hanging. Native (Expo Go / device) is unaffected.
export const HAS_FS = !!FileSystem.documentDirectory;

export type FileEntry = {
  name: string;
  uri: string;
  isDir: boolean;
  size: number;
  modified: number; // ms
  kind: FileKind;
};

async function ensure(dir: string) {
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
  if (!HAS_FS) return [];
  await ensureDirs();
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
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let candidate = name;
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
  const safe = await uniqueName(destDir, entry.name);
  await FileSystem.copyAsync({ from: entry.uri, to: joinDir(destDir, safe) });
  return joinDir(destDir, safe);
}

export async function moveEntry(entry: FileEntry, destDir: string) {
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

export async function importInto(destDir: string, srcUri: string, name: string) {
  const safe = await uniqueName(destDir, name);
  const to = joinDir(destDir, safe);
  await FileSystem.copyAsync({ from: srcUri, to });
  return to;
}

export { joinDir, ensure };
