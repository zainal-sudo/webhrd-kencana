import { defineStore } from "pinia";
import { GRUP, definisiMenu } from "@/utils/menuMap";
import type { SidebarNode } from "@/types";
import { useAuthStore } from "@/stores/authStore";

/**
 * Membangun pohon sidebar dari daftar menu milik user (`/api/me` -> `menus`)
 * lalu memetakannya lewat `utils/menuMap`. Menu tanpa definisi rute atau
 * `ready: false` disembunyikan.
 */
export const usePermissionStore = defineStore("permission", {
  state: () => ({
    menuTree: [] as SidebarNode[],
    loaded: false,
    loading: false,
  }),

  getters: {
    /** Semua rute yang boleh dibuka user (untuk penjaga router). */
    allowedRoutes: (state): string[] =>
      state.menuTree.flatMap((g) => g.children || []).map((c) => c.route || ""),
  },

  actions: {
    reset() {
      this.menuTree = [];
      this.loaded = false;
      this.loading = false;
    },

    /** Bangun pohon dari data yang sudah ada di authStore (tanpa request). */
    build() {
      const auth = useAuthStore();
      const groups = Object.values(GRUP)
        .sort((a, b) => a.order - b.order)
        .map<SidebarNode>((g) => ({
          key: g.key,
          label: g.label,
          icon: g.icon,
          children: [],
        }));

      const byKey = new Map(groups.map((g) => [g.key, g]));

      for (const m of auth.menus) {
        const def = definisiMenu(m.men_nama);
        if (!def || !def.ready) continue;
        const parent = byKey.get(def.grup);
        if (!parent) continue;
        parent.children!.push({
          key: m.men_nama,
          label: def.label,
          icon: def.icon,
          route: def.path,
          form: m.men_nama,
          can_insert: m.can_insert,
          can_edit: m.can_edit,
          can_delete: m.can_delete,
        });
      }

      // Urutan transaksi di sidebar tidak bergantung pada men_id database.
      const transactionOrder = ["frmAbsensi", "frmImportAbsensi", "frmIjin"];
      const rank = (key: string) => {
        const index = transactionOrder.indexOf(key);
        return index === -1 ? transactionOrder.length : index;
      };
      byKey.get("transaksi")?.children?.sort((a, b) => rank(a.key) - rank(b.key));

      this.menuTree = groups.filter((g) => g.children && g.children.length > 0);
      this.loaded = true;
    },

    /** Muat ulang dari server (dipanggil setelah login / refresh halaman). */
    async fetchAll() {
      this.loading = true;
      try {
        const auth = useAuthStore();
        if (!auth.user) return;
        await auth.refreshProfile();
        this.build();
      } finally {
        this.loading = false;
      }
    },
  },
});
