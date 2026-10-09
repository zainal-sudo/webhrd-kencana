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
        // SP / SPL selalu terakhir, setelah menu transaksi lainnya.
        if (key === "frmSP") return transactionOrder.length + 1;
        const index = transactionOrder.indexOf(key);
        return index === -1 ? transactionOrder.length : index;
      };
      byKey.get("transaksi")?.children?.sort((a, b) => rank(a.key) - rank(b.key));
      const transaksi = byKey.get("transaksi")?.children;
      if (transaksi) {
        const bayarIndex = transaksi.findIndex(m => m.key === 'frmBayar');
        if (bayarIndex !== -1) {
          const [bayar] = transaksi.splice(bayarIndex, 1);
          const pinjamIndex = transaksi.findIndex(m => m.key === 'frmPinjam');
          const spIndex = transaksi.findIndex(m => m.key === 'frmSP');
          transaksi.splice(pinjamIndex !== -1 ? pinjamIndex + 1 : spIndex !== -1 ? spIndex : transaksi.length, 0, bayar);
        }
        const keluarIndex = transaksi.findIndex((m) => m.key === "frmKeluar");
        if (keluarIndex !== -1) {
          const [keluar] = transaksi.splice(keluarIndex, 1);
          const mutasiIndex = transaksi.findIndex((m) => m.key === "frmMutasiKaryawan");
          const spIndex = transaksi.findIndex((m) => m.key === "frmSP");
          transaksi.splice(mutasiIndex !== -1 ? mutasiIndex + 1 : spIndex !== -1 ? spIndex : transaksi.length, 0, keluar);
        }
      }

      // Jadwal / Shift tepat sebelum Hari Libur jika keduanya diizinkan.
      const master = byKey.get("master")?.children;
      if (master) {
        const jadwalIndex = master.findIndex((m) => m.key === "frmJadwal");
        if (jadwalIndex !== -1 && master.some((m) => m.key === "frmHariLibur")) {
          const [jadwal] = master.splice(jadwalIndex, 1);
          const hariLiburIndex = master.findIndex((m) => m.key === "frmHariLibur");
          master.splice(hariLiburIndex, 0, jadwal);
        }
      }

      // Kelompok laporan: Absensi Periode, Lembur Hari Libur, History Karyawan.
      const laporan = byKey.get("laporan")?.children;
      if (laporan) {
        const historyIndex = laporan.findIndex((m) => m.key === "frmHistoryKaryawan");
        if (historyIndex !== -1 && laporan.some((m) => m.key === "frmLapAbsensiPeriode")) {
          const [history] = laporan.splice(historyIndex, 1);
          const periodeIndex = laporan.findIndex((m) => m.key === "frmLapAbsensiPeriode");
          laporan.splice(periodeIndex + 1, 0, history);
        }
        const lemburLiburIndex = laporan.findIndex((m) => m.key === "frmLapLemburHariLibur");
        if (lemburLiburIndex !== -1 && laporan.some((m) => m.key === "frmHistoryKaryawan")) {
          const [lemburLibur] = laporan.splice(lemburLiburIndex, 1);
          const historyPosition = laporan.findIndex((m) => m.key === "frmHistoryKaryawan");
          laporan.splice(historyPosition, 0, lemburLibur);
        }
      }

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
