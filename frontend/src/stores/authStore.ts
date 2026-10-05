import { defineStore } from "pinia";
import { authApi } from "@/api";
import { TOKEN_KEY, USER_KEY, MENUS_KEY } from "@/api/axios";
import type { AuthUser, MenuIjin } from "@/types";

function readJson<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export const useAuthStore = defineStore("auth", {
  state: () => ({
    token: localStorage.getItem(TOKEN_KEY) || "",
    user: readJson<AuthUser | null>(USER_KEY, null),
    menus: readJson<MenuIjin[]>(MENUS_KEY, []),
  }),

  getters: {
    isAuthenticated: (state) => !!state.token && !!state.user,
    /** Kode pabrik/cabang dari `tuser.user_akses`; null = semua pabrik. */
    cabang: (state): string | null => state.user?.user_akses || null,
  },

  actions: {
    async login(user_kode: string, user_password: string) {
      const res = await authApi.login(user_kode, user_password);
      this.token = res.token;
      this.user = res.user;
      this.menus = res.menus || [];
      localStorage.setItem(TOKEN_KEY, res.token);
      localStorage.setItem(USER_KEY, JSON.stringify(res.user));
      localStorage.setItem(MENUS_KEY, JSON.stringify(this.menus));
      return res;
    },

    /** Dipanggil saat halaman di-refresh:ambil profil + menu terbaru dari server. */
    async refreshProfile() {
      const d = await authApi.me();
      this.user = {
        user_kode: d.user_kode,
        user_nama: d.user_nama,
        user_akses: d.user_akses,
        cabang: d.cabang,
      };
      this.menus = d.menus || [];
      localStorage.setItem(USER_KEY, JSON.stringify(this.user));
      localStorage.setItem(MENUS_KEY, JSON.stringify(this.menus));
    },

    /** True bila user punya hak (view/insert/edit/delete) pada form tertentu. */
    can(form: string, aksi: "view" | "insert" | "edit" | "delete" = "view"): boolean {
      const m = this.menus.find((x) => x.men_nama === form);
      if (!m) return false;
      if (aksi === "view") return true;
      return !!m[`can_${aksi}`];
    },

    setToken(token: string) {
      this.token = token;
      localStorage.setItem(TOKEN_KEY, token);
    },

    logout() {
      this.token = "";
      this.user = null;
      this.menus = [];
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(MENUS_KEY);
    },
  },
});
