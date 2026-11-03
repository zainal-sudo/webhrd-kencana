import { defineStore } from "pinia";
import { ref, computed } from "vue";
import {
  menuApi,
  type MenuGroup,
  type MenuItem,
  type HakMenu,
} from "@/api/menuApi";
import { useAuthStore } from "@/stores/authStore";

export type PermAction = "view" | "insert" | "edit" | "delete" | "print";

/**
 * Store menu & permission yang bersumber dari database (tmenu/tmenuparent/thakuser)
 * pada database cabang yang sedang aktif. Menggantikan hardcode menuId per view.
 */
export const usePermissionStore = defineStore("permission", () => {
  const authStore = useAuthStore();

  const menuTree = ref<MenuGroup[]>([]);
  const menuItems = ref<MenuItem[]>([]);
  const hakList = ref<HakMenu[]>([]);
  const loaded = ref(false);

  const fetchAll = async () => {
    try {
      const [tree, items, hak] = await Promise.all([
        menuApi.getTree(),
        menuApi.getItems(),
        menuApi.getHakUser(authStore.userKode),
      ]);
      menuTree.value = tree;
      menuItems.value = items;
      hakList.value = hak;
      loaded.value = true;
    } catch {
      loaded.value = false;
    }
  };

  const reset = () => {
    menuTree.value = [];
    menuItems.value = [];
    hakList.value = [];
    loaded.value = false;
  };

  /**
   * Resolve MEN_ID dari path route (men_route di DB).
   * Coba exact match dulu, lalu potong segmen terakhir hingga cocok,
   * mis. /transaksi/bkm/create → /transaksi/bkm.
   */
  const getMenuIdByRoute = (path: string): string | null => {
    if (!menuItems.value.length) return null;
    
    // Normalisasi path: buang trailing slash
    let p = path.replace(/\/$/, "");
    
    // Coba exact match dulu
    let menu = menuItems.value.find(x => x.men_route === p);
    if (menu) return String(menu.MEN_ID);
    
    // Kalau tidak ketemu, potong segmen terakhir
    // Contoh: /transaksi/po/create → /transaksi/po
    while (p) {
      const idx = p.lastIndexOf("/");
      if (idx <= 0) break;
      p = p.slice(0, idx);
      
      menu = menuItems.value.find(x => x.men_route === p);
      if (menu) return String(menu.MEN_ID);
    }
    
    return null;
  };

  const getHak = (menuId: string) =>
    hakList.value.find((h) => String(h.menu_id) === String(menuId)) || null;

  const can = (
    menuId: string,
    action: PermAction = "view",
  ): boolean => {
    if (authStore.isAdmin) return true;
    if (!loaded.value) return true;
    if (!menuId) return false;
    const hak = getHak(menuId);
    if (!hak) return false;
    if (action === "view" || action === "print") return true;
    const col: Record<"insert" | "edit" | "delete", keyof HakMenu> = {
      insert: "insert_",
      edit: "edit_",
      delete: "delete_",
    };
    return hak[col[action as "insert" | "edit" | "delete"]] === "Y";
  };

  const canByRoute = (path: string, action: PermAction = "view"): boolean => {
    const menuId = getMenuIdByRoute(path);
    if (!menuId) return false;
    return can(menuId, action);
  };

  const canAccessRoute = (path: string): boolean => {
    if (authStore.isAdmin) return true;
    if (!loaded.value) return true;
    const menuId = getMenuIdByRoute(path);
    if (!menuId) return false;
    return can(menuId, "view");
  };

  return {
    menuTree,
    menuItems,
    hakList,
    loaded,
    fetchAll,
    reset,
    getMenuIdByRoute,
    can,
    canByRoute,
    canAccessRoute,
  };
});
