// stores/tabsStore.ts
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { clearViewSession } from "@/utils/viewSession";

export interface TabItem {
  id: string;
  title: string;
  path: string;
  query?: Record<string, any>;
  icon?: any;
  closable: boolean;
  timestamp: number;
  onClose?: () => void;
}

/**
 * Guard generik: ditanyakan halaman sebelum tab-nya ditutup. Return true =
 * boleh ditutup, false = batal (tab tetap terbuka).
 * Guard tidak dipanggil kalau tab sedang tidak bisa ditutup.
 */
export type TabCloseGuard = () => boolean | Promise<boolean>;

export const useTabsStore = defineStore("tabs", () => {
  // ── State ────────────────────────────────────────────────────────────
  const tabs = ref<TabItem[]>([]);
  const activeTabId = ref("");
  const isReady = ref(false);

  // Hitungan buka per path. Bertambah SETIAP tab dibuka baru (setelah ditutup),
  // dipakai TabView sebagai bagian dari key KeepAlive supaya tab yang dibuka
  // ulang selalu di-render dari nol (state lama tidak ter-cache).
  // Sengaja TIDAK di-reset saat logout: jika di-reset, buka menu setelah
  // login ulang bisa memakai instance KeepAlive lama yang masih ter-cache.
  const openSessions = ref<Record<string, number>>({});

  // ── Getters ──────────────────────────────────────────────────────────
  const activeTab = computed(() =>
    tabs.value.find((t) => t.id === activeTabId.value),
  );

  // ── Actions ──────────────────────────────────────────────────────────
  // Di BSMCabang id tab = path (route edit pakai param, bukan query)
  const generateTabId = (path: string): string => path;

  const openTab = (tab: Omit<TabItem, "id" | "timestamp">) => {
    const id = generateTabId(tab.path);
    const existing = tabs.value.find((t) => t.id === id);

    if (existing) {
      activeTabId.value = existing.id;
      return;
    }

    openSessions.value[id] = (openSessions.value[id] ?? 0) + 1;

    tabs.value.push({
      ...tab,
      id,
      timestamp: Date.now(),
      closable: tab.closable ?? true,
    });
    activeTabId.value = id;

    // Batasi jumlah tab (max 10)
    if (tabs.value.length > 10) {
      const closableTabs = [...tabs.value]
        .filter((t) => t.closable)
        .sort((a, b) => a.timestamp - b.timestamp);
      if (closableTabs.length > 0) closeTab(closableTabs[0].id);
    }
  };

  // Saat tab ditutup, bersihkan state view (search/filter/periode) yang
  // tersimpan di sessionStorage agar buka menu lagi tampil seperti awal.
  const forgetTab = (tab: TabItem) => {
    clearViewSession(tab.path);
  };

  // ── Close guard ──────────────────────────────────────────────────────
  // Halaman yang punya perubahan belum disimpan bisa mendaftarkan guard-nya
  // lewat setCloseGuard. Store tidak tahu apa pun isi halaman tersebut; dia
  // hanya memanggil guard yang terdaftar dan menghormati hasilnya.
  // Peta ini sengaja di luar `tabs` supaya tidak memicu re-render.
  const closeGuards = new Map<string, TabCloseGuard>();

  const setCloseGuard = (tabId: string, guard: TabCloseGuard | null) => {
    if (guard) closeGuards.set(tabId, guard);
    else closeGuards.delete(tabId);
  };

  const hasCloseGuard = (tabId: string) => closeGuards.has(tabId);

  // Jalankan guard satu per satu, berurutan. Kalau ada yang menolak, TIDAK ada
  // tab yang ditutup: menutup sebagian akan memindahkan activeTabId dan
  // admin kehilangan konteks halaman yang mungkin masih menyimpan edit.
  const runCloseGuards = async (tabIds: string[]): Promise<boolean> => {
    for (const id of tabIds) {
      const guard = closeGuards.get(id);
      if (!guard) continue;
      let allowed = false;
      try {
        allowed = Boolean(await guard());
      } catch {
        allowed = false; // Guard error dianggap batal; jangan tutup paksa.
      }
      if (!allowed) return false;
    }
    return true;
  };

  // Tab tanpa guard ditutup sinkron seperti sebelumnya, sehingga pemanggil lama
  // (form view yang menutup tabnya sendiri setelah simpan/batal) tidak berubah
  // perilakunya. Adanya guard membuat jalur ini mengembalikan Promise.
  type CloseResult = boolean | Promise<boolean>;

  const doCloseTab = (tabId: string) => {
    const index = tabs.value.findIndex((t) => t.id === tabId);
    if (index === -1) return;
    const tab = tabs.value[index];
    if (!tab.closable) return;

    forgetTab(tab);
    tabs.value.splice(index, 1);

    if (activeTabId.value === tabId) {
      if (tabs.value.length > 0) {
        const newActiveIndex = Math.min(index, tabs.value.length - 1);
        activeTabId.value = tabs.value[newActiveIndex].id;
      } else {
        activeTabId.value = "";
      }
    }
  };

  const closeTab = (tabId: string): CloseResult => {
    const target = tabs.value.find((t) => t.id === tabId);
    if (!target || !target.closable) return false;
    if (!hasCloseGuard(tabId)) {
      doCloseTab(tabId);
      return true;
    }
    return runCloseGuards([tabId]).then((allowed) => {
      if (allowed) doCloseTab(tabId);
      return allowed;
    });
  };

  const closeActiveTab = (): CloseResult => {
    if (!activeTabId.value) return false;
    const tab = tabs.value.find((t) => t.id === activeTabId.value);
    if (!tab) return false;
    tab.closable = true; // Paksa izinkan tutup
    return closeTab(tab.id);
  };

  const doCloseAllTabs = () => {
    tabs.value.filter((t) => t.closable).forEach(forgetTab);
    tabs.value = tabs.value.filter((t) => !t.closable);
    activeTabId.value = tabs.value.length > 0 ? tabs.value[0].id : "";
  };

  const closeAllTabs = (): CloseResult => {
    const closable = tabs.value.filter((t) => t.closable);
    if (!closable.some((t) => hasCloseGuard(t.id))) {
      doCloseAllTabs();
      return true;
    }
    const ids = closable.map((t) => t.id);
    return runCloseGuards(ids).then((allowed) => {
      if (allowed) doCloseAllTabs();
      return allowed;
    });
  };

  const doCloseOtherTabs = (tabId: string) => {
    tabs.value
      .filter((t) => t.closable && t.id !== tabId)
      .forEach(forgetTab);
    tabs.value = tabs.value.filter((t) => !t.closable || t.id === tabId);
    activeTabId.value = tabId;
  };

  const closeOtherTabs = (tabId: string): CloseResult => {
    const target = tabs.value.find((t) => t.id === tabId);
    if (!target) return false;
    const others = tabs.value.filter((t) => t.closable && t.id !== tabId);
    if (!others.some((t) => hasCloseGuard(t.id))) {
      doCloseOtherTabs(tabId);
      return true;
    }
    return runCloseGuards(others.map((t) => t.id)).then((allowed) => {
      if (allowed) doCloseOtherTabs(tabId);
      return allowed;
    });
  };

  const toRightClosable = (tabId: string): TabItem[] => {
    const index = tabs.value.findIndex((t) => t.id === tabId);
    if (index === -1) return [];
    return tabs.value.slice(index + 1).filter((t) => t.closable);
  };

  const doCloseTabsToRight = (tabId: string) => {
    toRightClosable(tabId).forEach((tab) => doCloseTab(tab.id));
  };

  const closeTabsToRight = (tabId: string): CloseResult => {
    const toRight = toRightClosable(tabId);
    if (toRight.length === 0) return false;
    if (!toRight.some((t) => hasCloseGuard(t.id))) {
      doCloseTabsToRight(tabId);
      return true;
    }
    return runCloseGuards(toRight.map((t) => t.id)).then((allowed) => {
      if (allowed) doCloseTabsToRight(tabId);
      return allowed;
    });
  };

  const setActiveTab = (tabId: string) => {
    const tab = tabs.value.find((t) => t.id === tabId);
    if (tab) activeTabId.value = tabId;
  };

  // Nomor "sesi buka" sebuah path; 0 berarti belum pernah dibuka.
  const getOpenSession = (path: string): number =>
    openSessions.value[generateTabId(path)] ?? 0;

  const initDefaultTabs = () => {
    tabs.value = [];
    activeTabId.value = "";
    closeGuards.clear();
    openTab({ title: "Dashboard", path: "/", closable: false });
    isReady.value = true;
  };

  // Guard di-mapping ke instance store ini, jadi ikut hilang saat reset.
  const resetTabs = () => {
    tabs.value = [];
    activeTabId.value = "";
    closeGuards.clear();
    isReady.value = false;
  };

  return {
    tabs,
    activeTabId,
    isReady,
    activeTab,
    openTab,
    closeTab,
    closeAllTabs,
    closeActiveTab,
    closeOtherTabs,
    closeTabsToRight,
    setCloseGuard,
    setActiveTab,
    getOpenSession,
    initDefaultTabs,
    resetTabs,
  };
});
