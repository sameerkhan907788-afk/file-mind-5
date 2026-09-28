import { addVault, listVault, removeVault, type VaultRow } from "./db";
import { deleteForever, importInto, VAULT } from "./fs";
import { getKind } from "./format";
import type { FileEntry } from "./fs";

export async function addToVault(entry: FileEntry): Promise<VaultRow> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const stored = `${id}__${entry.name}`;
  const vaultPath = await importInto(VAULT, entry.uri, stored);
  await deleteForever(entry.uri);
  const row: VaultRow = {
    id,
    name: entry.name,
    vault_path: vaultPath,
    size: entry.size,
    kind: getKind(entry.name),
    added: Date.now(),
  };
  await addVault(row);
  return row;
}

export async function restoreFromVault(row: VaultRow, destDir: string): Promise<string> {
  const to = await importInto(destDir, row.vault_path, row.name);
  await deleteForever(row.vault_path);
  await removeVault(row.id);
  return to;
}

export async function deleteVaultItem(row: VaultRow) {
  await deleteForever(row.vault_path);
  await removeVault(row.id);
}

export { listVault };
