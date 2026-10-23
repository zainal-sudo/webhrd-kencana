import { isNavigationFailure, NavigationFailureType, useRouter } from "vue-router";
import { useTabsStore } from "@/stores/tabsStore";
import { discardDraftsAndRun } from "@/utils/unsavedChanges";

/** Tutup seluruh tab hanya setelah navigasi Dashboard berhasil. */
export function useTabNavigation() {
  const router = useRouter();
  const tabsStore = useTabsStore();

  async function closeAllTabs() {
    return discardDraftsAndRun(tabsStore.tabs.map(tab => tab.id), async () => {
      const failure = await router.replace("/dashboard");
      if (failure && !isNavigationFailure(failure, NavigationFailureType.duplicated)) return false;
      tabsStore.closeAllTabs();
      return true;
    });
  }

  async function closeTab(id: string, returnPath = "") {
    const index = tabsStore.tabs.findIndex(tab => tab.id === id);
    if (index < 0 || !tabsStore.tabs[index].closable) return false;
    return discardDraftsAndRun([id], async () => {
      if (tabsStore.activeTabId === id) {
        const others = tabsStore.tabs.filter(tab => tab.id !== id);
        const next = others[Math.min(index, others.length - 1)];
        const failure = await router.push(returnPath || (next ? { path: next.path, query: next.query } : "/dashboard"));
        if (failure && !isNavigationFailure(failure, NavigationFailureType.duplicated)) return false;
      }
      return tabsStore.closeTab(id) !== false;
    });
  }

  return { closeAllTabs, closeTab };
}
