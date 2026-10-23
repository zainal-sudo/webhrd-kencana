import { defineStore } from "pinia";
import { clearDrafts, confirmDraftDiscard, isTabBusy, isTabDirty } from "@/utils/unsavedChanges";

export interface TabItem {
  id: string;
  title: string;
  path: string;
  query?: Record<string, any>;
  icon?: string;
  closable: boolean;
  timestamp: number;
}

export const useTabsStore = defineStore("tabs", {
  state: () => ({
    tabs: [] as TabItem[],
    activeTabId: "" as string,
    cacheVersion: 0,
    pendingTabs: {} as Record<string, Omit<TabItem, "id" | "timestamp">>,
  }),

  getters: {
    activeTab: (state) => state.tabs.find((t) => t.id === state.activeTabId),
  },

  actions: {
    stageTab(tab: Omit<TabItem, "id" | "timestamp">) {
      this.pendingTabs[this.generateTabId(tab.path, tab.query)] = tab;
    },
    canOpenTab(id: string): boolean {
      return this.tabs.some(tab => tab.id === id) || this.tabs.length < 12
        || this.tabs.some(tab => tab.closable && !isTabDirty(tab.id) && !isTabBusy(tab.id));
    },
    generateTabId(path: string, query?: Record<string, any>): string {
      const params = new URLSearchParams();
      for (const key of Object.keys(query || {}).sort()) {
        const value = query![key];
        for (const item of Array.isArray(value) ? value : [value]) {
          if (item !== undefined) params.append(key, item === null ? "" : String(item));
        }
      }
      const suffix = params.toString();
      return suffix ? `${path}?${suffix}` : path;
    },

    openTab(tab: Omit<TabItem, "id" | "timestamp">) {
      const id = this.generateTabId(tab.path, tab.query);
      if (!this.canOpenTab(id)) return false;
      const existing = this.tabs.find((t) => t.id === id);
      if (existing) {
        this.activeTabId = existing.id;
        return;
      }
      const newTab: TabItem = {
        ...tab,
        id,
        timestamp: Date.now(),
        closable: tab.closable ?? true,
      };
      this.tabs.push(newTab);
      this.activeTabId = newTab.id;
      if (this.tabs.length > 12) {
        const closable = this.tabs.filter((t) => t.closable && t.id !== id && !isTabDirty(t.id) && !isTabBusy(t.id));
        if (closable.length > 0) {
          const oldest = closable.sort((a, b) => a.timestamp - b.timestamp)[0];
          this.closeTab(oldest.id);
        }
      }
    },

    closeTab(tabId: string) {
      const index = this.tabs.findIndex((t) => t.id === tabId);
      if (index === -1) return;
      const tab = this.tabs[index];
      if (!tab.closable) return;
      if (!confirmDraftDiscard([tabId])) return false;
      this.tabs.splice(index, 1);
      if (this.activeTabId === tabId) {
        if (this.tabs.length > 0) {
          const newIndex = Math.min(index, this.tabs.length - 1);
          this.activeTabId = this.tabs[newIndex].id;
        } else {
          this.activeTabId = "";
        }
      }
      return true;
    },

    closeAllTabs() {
      if (!confirmDraftDiscard(this.tabs.map(tab => tab.id))) return false;
      const dashboard = this.tabs.find((t) => t.path === "/dashboard");
      this.tabs = [];
      this.openTab({
        title: "Dashboard",
        path: "/dashboard",
        icon: dashboard?.icon || "mdi mdi-view-dashboard-outline",
        closable: false,
      });
      this.cacheVersion += 1;
    },

    closeOtherTabs(tabId: string) {
      const tab = this.tabs.find((t) => t.id === tabId);
      if (!tab) return;
      if (!confirmDraftDiscard(this.tabs.filter(item => item.closable && item.id !== tabId).map(item => item.id))) return false;
      this.tabs = this.tabs.filter((t) => !t.closable || t.id === tabId);
      this.activeTabId = tabId;
    },

    moveTab(tabId: string, targetIndex: number) {
      const index = this.tabs.findIndex((tab) => tab.id === tabId);
      if (index < 0 || !Number.isInteger(targetIndex)) return;
      const destination = Math.max(0, Math.min(targetIndex, this.tabs.length - 1));
      if (index === destination) return;
      const [tab] = this.tabs.splice(index, 1);
      this.tabs.splice(destination, 0, tab);
    },

    setActiveTab(tabId: string) {
      const tab = this.tabs.find((t) => t.id === tabId);
      if (tab) this.activeTabId = tabId;
    },

    initDefaultTabs() {
      if (this.tabs.length > 0) return;
      this.openTab({
        title: "Dashboard",
        path: "/dashboard",
        icon: "mdi mdi-view-dashboard-outline",
        closable: false,
      });
    },

    resetTabs() {
      clearDrafts();
      this.pendingTabs = {};
      this.tabs = [];
      this.activeTabId = "";
      this.cacheVersion += 1;
    },
  },
});
