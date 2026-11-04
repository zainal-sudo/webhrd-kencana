import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { authApi, type AuthUser, type MenuPermission } from "@/views/pocokan/_lib/api/authApi";

const TOKEN_KEY = "finance_token";
const USER_KEY = "finance_user";

export const useAuthStore = defineStore("pocokanAuth", () => {
  // ── State ────────────────────────────────────────────────────────────────
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY) ?? localStorage.getItem("kencana_hrd_token"));
  const user = ref<AuthUser | null>(
    (() => {
      try {
        return JSON.parse(localStorage.getItem(USER_KEY) || "null");
      } catch {
        return null;
      }
    })(),
  );

  // ── Getters ──────────────────────────────────────────────────────────────
  const isAuthenticated = computed(() => !!token.value && !!user.value);
  const isAdmin = computed(() => user.value?.level === "ADMIN");
  const userName = computed(() => user.value?.nama || "");
  const userKode = computed(() => user.value?.kode || "");
  const userCabang = computed(() => user.value?.cabang || "");

  // Kursi belakang SSO: bila dibuka langsung di dalam app HRIS (tanpa
  // passing kampanye loginDariHris), tarik profil dari /pocokan-api/auth/me.
  if (token.value && !user.value) {
    setTimeout(() => {
      refreshUser().catch(() => undefined);
    }, 0);
  }

  // ── Permission check ─────────────────────────────────────────────────────
  // Mirip ceKVIEW() di Delphi tapi lebih granular (view/insert/edit/delete/print)
  const can = (
    menuId: string,
    action: "view" | "insert" | "edit" | "delete" | "print" = "view",
  ): boolean => {
    if (isAdmin.value) return true;
    // Belum ada data menus → izinkan semua (fallback)
    if (!user.value?.menus?.length) return true;

    const menu = user.value.menus.find(
      (m) => String(m.menu_id) === String(menuId),
    );
    if (!menu) return false;
    const col = {
      view: "hak_view",
      insert: "hak_insert",
      edit: "hak_edit",
      delete: "hak_delete",
      print: "hak_print",
    }[action] as keyof MenuPermission;
    return menu[col] === "Y";
  };

  // ── Actions ──────────────────────────────────────────────────────────────
  /* SSO dari HRIS: FE pocokan di-serve pada origin yang sama dengan HRIS
   * (iframe /pocokan/ di dalam app HRIS), jadi localStorage "kencana_hrd_token"
   * milik HRIS dapat dibaca langsung — tanpa token di query string. */
  const loginDariHris = async (): Promise<boolean> => {
    const hrisToken = localStorage.getItem("kencana_hrd_token");
    if (!hrisToken) return false;
    token.value = hrisToken;
    // Wajib dipersist: interceptor api/axios.ts membaca finance_token
    // dari localStorage agar API pocokan membawa header Authorization
    // yang sama dengan token HRIS ini (bug SSO: sebelumnya hanya state).
    localStorage.setItem(TOKEN_KEY, hrisToken);
    try {
      await refreshUser();
      return isAuthenticated.value;
    } catch {
      token.value = null;
      user.value = null;
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      return false;
    }
  };

  const login = async (username: string, password: string) => {
    const result = await authApi.login({ username, password });
    token.value = result.token;
    user.value = result.user;
    localStorage.setItem(TOKEN_KEY, result.token);
    localStorage.setItem(USER_KEY, JSON.stringify(result.user));
  };

  const logout = () => {
    token.value = null;
    user.value = null;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  };

  // Refresh data user dari server (misalnya setelah update profil)
  const refreshUser = async () => {
    try {
      const fresh = await authApi.me();
      user.value = fresh;
      localStorage.setItem(USER_KEY, JSON.stringify(fresh));
    } catch {
      logout();
    }
  };

  return {
    token,
    loginDariHris,
    user,
    isAuthenticated,
    isAdmin,
    userName,
    userKode,
    userCabang,
    can,
    login,
    logout,
    refreshUser,
  };
});
