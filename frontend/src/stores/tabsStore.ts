import { defineStore } from "pinia";

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
  }),

  getters: {
    activeTab: (state) => state.tabs.find((t) => t.id === state.activeTabId),
  },

  actions: {
    generateTabId(path: string, query?: Record<string, any>): string {
      if (query?.id) {
        return `${path}?id=${query.id}`;
      }
      return path;
    },

    openTab(tab: Omit<TabItem, "id" | "timestamp">) {
      const id = this.generateTabId(tab.path, tab.query);
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
        const closable = this.tabs.filter((t) => t.closable);
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
      this.tabs.splice(index, 1);
      if (this.activeTabId === tabId) {
        if (this.tabs.length > 0) {
          const newIndex = Math.min(index, this.tabs.length - 1);
          this.activeTabId = this.tabs[newIndex].id;
        } else {
          this.activeTabId = "";
        }
      }
    },

    closeAllTabs() {
      this.tabs = this.tabs.filter((t) => !t.closable);
      if (this.tabs.length > 0) {
        this.activeTabId = this.tabs[0].id;
      } else {
        this.activeTabId = "";
      }
    },

    closeOtherTabs(tabId: string) {
      const tab = this.tabs.find((t) => t.id === tabId);
      if (!tab) return;
      this.tabs = this.tabs.filter((t) => !t.closable || t.id === tabId);
      this.activeTabId = tabId;
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
      this.tabs = [];
      this.activeTabId = "";
    },
  },
});