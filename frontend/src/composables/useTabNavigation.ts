import { isNavigationFailure, NavigationFailureType, useRouter } from "vue-router";
import { useTabsStore } from "@/stores/tabsStore";

/** Tutup seluruh tab hanya setelah navigasi Dashboard berhasil. */
export function useTabNavigation() {
  const router = useRouter();
  const tabsStore = useTabsStore();

  async function closeAllTabs() {
    const failure = await router.replace("/dashboard");
    if (!failure || isNavigationFailure(failure, NavigationFailureType.duplicated)) {
      tabsStore.closeAllTabs();
    }
  }

  return { closeAllTabs };
}
