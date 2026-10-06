<script setup lang="ts">
import { useRouter } from "vue-router";
import BaseBrowse from "@/components/BaseBrowse.vue";
import MsIcon from "@/components/MsIcon.vue";
import { useTabsStore } from "@/stores/tabsStore";
import type { BrowseColumn } from "@/types";
import { firstDayOfMonth } from "@/utils/format";

/**
 * Laporan Lembur — padanan `ufrmLapLembur`.
 *
 * Tiap baris SPL + scan keluar absensi. Stat=1 bila scan keluar lebih awal
 * dari jam akhir SPL (baris merah di Delphi). Aksi baris: Buka SPL
 * (form Lembur mode ubah) dan Edit Absensi.
 */
const router = useRouter();
const tabsStore = useTabsStore();

const columns: BrowseColumn[] = [
  { key: "Nomor", label: "Nomor SPL", width: "140px" },
  { key: "Tanggal", label: "Tanggal", type: "date", width: "95px" },
  { key: "Nik", label: "NIK", width: "110px" },
  { key: "Nama", label: "Nama Lengkap" },
  { key: "Pabrik", label: "Pabrik", width: "80px" },
  { key: "Bagian", label: "Bagian" },
  { key: "Jadwal", label: "Jam Akhir SPL", width: "100px", align: "center" },
  { key: "Scan2", label: "Scan Keluar", width: "100px", align: "center" },
  { key: "Stat", label: "Stat", width: "55px", align: "center" },
];

function bukaTab(title: string, path: string, query: Record<string, string>) {
  tabsStore.openTab({ title, path, query, icon: "mdi mdi-open-in-new", closable: true });
  router.push({ path, query });
}

function bukaSpl(row: Record<string, any>) {
  bukaTab(`SPL ${row.Nomor}`, "/transaksi/lembur/form", { id: String(row.Nomor ?? "") });
}

function editAbsensi(row: Record<string, any>) {
  bukaTab(`Absensi ${row.Nik}`, "/absensi/form", {
    nik: String(row.Nik ?? ""),
    tanggal: String(row.Tanggal || "").slice(0, 10),
  });
}
</script>

<template>
  <BaseBrowse
    module-title="Laporan Lembur"
    module-subtitle="Realisasi SPL vs scan keluar mesin absensi"
    endpoint="/laporan/lembur"
    :columns="columns"
    primary-key="Nomor"
    has-period
    :default-start="firstDayOfMonth()"
    :can-delete="false"
    search-placeholder="Cari nomor SPL / NIK / nama / bagian..."
    :per-page="50"
  >
    <template #row-actions="{ row }">
      <button class="row-btn edit" title="Buka SPL" @click="bukaSpl(row)">
        <MsIcon name="more_time" :size="14" />
      </button>
      <button class="row-btn edit" title="Edit absensi" @click="editAbsensi(row)">
        <MsIcon name="how_to_reg" :size="14" />
      </button>
    </template>
  </BaseBrowse>
</template>

<style scoped>
.row-btn.edit { color: var(--ds-primary, #3b5998); }
</style>
