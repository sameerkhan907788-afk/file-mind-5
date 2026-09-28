import { useRouter } from "expo-router";
import { useCallback } from "react";

/**
 * Leaves the current screen when possible and returns to the app entry route
 * when the screen is already at the root. Navigation failures are contained so
 * a hardware/back-button edge case cannot crash the app.
 */
export function useSafeBack() {
  const router = useRouter();

  return useCallback(() => {
    try {
      if (router.canGoBack()) {
        router.back();
        return;
      }

      router.replace("/");
    } catch (error) {
      console.warn("[navigation] safe back failed", error);
      try {
        router.replace("/");
      } catch (fallbackError) {
        console.warn("[navigation] home fallback failed", fallbackError);
      }
    }
  }, [router]);
}
