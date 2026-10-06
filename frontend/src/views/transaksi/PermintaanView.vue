<script setup lang="ts">
import BaseBrowse from "@/components/BaseBrowse.vue";
import type { BrowseColumn } from "@/types";
import { firstDayOfMonth } from "@/utils/format";
import { ref } from "vue";
import { useToast } from "vue-toastification";
import { api, getErrorMessage } from "@/api/axios";

/**
 * Browse Permintaan Karyawan — padanan `ufrmBrowsePermintaankaryawan`.
 * Kolom Closed (Sudah/Belum) dihitung dari realisasi. Ikon arsip membuka
 * daftar realisasi nomor tersebut (modul realisasi terpisah, read-only).
 */
const toast = useToast();
const columns: BrowseColumn[] = [
  { key: "Nomor", label: "Nomor", width: "150px" },
  { key: "Peminta", label: "Peminta" },
  { key: "Tanggal", label: "Tanggal", type: "date", width: "95px" },
  { key: "Jabatan", label: "Jabatan" },
  { key: "Bagian", label: "Bagian" },
  { key: "Tgl_Butuh", label: "Tgl Butuh", type: "date", width: "95px" },
  { key: "Jumlah_Minta", label: "Minta", width: "60px", align: "center" },
  { key: "Alasan", label: "Alasan" },
  { key: "Jml_Realisasi", label: "Realisasi", width: "75px", align: "center" },
  { key: "Closed", label: "Status", width: "75px", align: "center" },
];

const riilOpen = ref(false);
const riilNomor = ref("");
const riilRows = ref<any[]>([]);

async function lihatRealisasi(row: Record<string, any>) {
  try {
    riilNomor.value = String(row.Nomor ?? "");
    const { data } = await api.get("/transaksi/permintaan-karyawan/realisasi", {
      params: { nomor: riilNomor.value },
    });
    riilRows.value = data.data || [];
    riilOpen.value = true;
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat realisasi"));
  }
}
</script>

<template>
  <BaseBrowse
    module-title="Permintaan Karyawan"
    module-subtitle="Permintaan tenaga kerja per bagian + status realisasi"
    endpoint="/transaksi/permintaan-karyawan"
    :columns="columns"
    primary-key="Nomor"
    has-period
    :default-start="firstDayOfMonth()"
    add-form-path="/transaksi/permintaan-karyawan/form"
    edit-form-path="/transaksi/permintaan-karyawan/form"
    search-placeholder="Cari nomor / peminta / bagian / jabatan..."
    :per-page="50"
  >
    <template #row-actions="{ row }">
      <button class="row-btn print" title="Lihat realisasi" @click="lihatRealisasi(row)">
        <span class="material-symbols-outlined" style="font-size: 14px">inventory</span>
      </button>
    </template>
  </BaseBrowse>

  <v-dialog v-model="riilOpen" max-width="620" scrollable>
    <v-card rounded="false">
      <v-card-title class="dlg-head">
        <span>Realisasi {{ riilNomor }}</span>
        <v-btn icon="close" size="small" variant="text" @click="riilOpen = false" />
      </v-card-title>
      <v-card-text class="dlg-body">
        <table class="mini">
          <thead><tr><th>Nomor Realisasi</th><th>Tgl Realisasi</th><th>Jumlah</th><th>Keterangan</th></tr></thead>
          <tbody>
            <tr v-for="(r, i) in riilRows" :key="i">
              <td>{{ r.Nomor_Realisasi }}</td>
              <td>{{ String(r.Tgl_Realisasi || "").slice(0, 10) }}</td>
              <td>{{ r.Jml_Realisasi }}</td>
              <td>{{ r.Keterangan }}</td>
            </tr>
            <tr v-if="!riilRows.length"><td colspan="4" class="empty">Belum ada realisasi</td></tr>
          </tbody>
        </table>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.dlg-head { display: flex; justify-content: space-between; align-items: center; font-size: 13px; font-weight: 800; padding: 8px 12px; background: var(--ds-surface-variant, #e0e4ea); }
.dlg-body { background: #fff; padding: 12px 14px; }
table.mini { width: 100%; border-collapse: collapse; font-size: 11px; }
table.mini th { background: var(--ds-surface-variant, #e0e4ea); border: 1px solid var(--ds-border, #b0b8c4); padding: 5px 7px; text-align: left; font-weight: 800; }
table.mini td { border: 1px solid #d5dbe3; padding: 4px 7px; }
table.mini .empty { text-align: center; color: #8995a6; padding: 10px; }
.row-btn.print { color: #0f766e; }
</style>
