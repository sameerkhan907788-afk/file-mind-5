import { useRouter } from "expo-router";
import { useCallback } from "react";

import { useToast } from "@/src/components/toast";
import { addRecent } from "@/src/lib/db";
import { shareFile } from "@/src/lib/file-actions";
import { getKind } from "@/src/lib/format";

export function useFileOpener() {
  const router = useRouter();
  const toast = useToast();

  const open = useCallback(
    async (uri: string, name: string, isDir = false) => {
      if (isDir) return;
      const kind = getKind(name);
      addRecent(uri, name).catch(() => {});
      if (kind === "pdf") {
        router.push({ pathname: "/pdf-viewer", params: { uri, name } });
        return;
      }
      if (kind === "image" || kind === "video" || kind === "audio" || kind === "text" || kind === "code") {
        router.push({ pathname: "/file-viewer", params: { uri, name, kind } });
        return;
      }
      // Unsupported preview → hand off to Android "Open with" / share sheet.
      try {
        await shareFile(uri, name);
      } catch (error: any) {
        toast.show(error?.message || "No compatible app is available to open this file", "error");
      }
    },
    [router, toast],
  );

  return open;
}
