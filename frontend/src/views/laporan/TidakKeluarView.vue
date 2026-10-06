<script setup lang="ts">
import { useRouter } from "vue-router";
import BaseBrowse from "@/components/BaseBrowse.vue";
import MsIcon from "@/components/MsIcon.vue";
import { useTabsStore } from "@/stores/tabsStore";
import type { BrowseColumn } from "@/types";
import { firstDayOfMonth } from "@/utils/format";

/**
 * Absen Tidak Lengkap — padanan `ufrmLapTidakKeluar`.
 *
 * Absensi status <> 0 yang salah satu scan-nya 00:00:00 (tidak absen
 * masuk / tidak absen keluar). Aksi baris: Buatkan Ijin Terlambat
 * (prefill form Ijin, jenis 1) dan Edit Absensi.
 */
const router = useRouter();
const tabsStore = useTabsStore();

const columns: BrowseColumn[] = [
  { key: "Kode", label: "Kode Absensi", width: "110px" },
  { key: "Nik", label: "NIK", width: "110px" },
  { key: "Nama", label: "Nama Lengkap" },
  { key: "Tanggal", label: "Tanggal", type: "date", width: "95px" },
  { key: "Hari", label: "Hari", width: "70px", align: "center" },
  { key: "Pabrik", label: "Pabrik", width: "80px" },
  { key: "Scan1", label: "Scan Masuk", width: "90px", align: "center" },
  { key: "Scan2", label: "Scan Keluar", width: "90px", align: "center" },
  { key: "Jenis_Ijin", label: "Jenis Ijin", width: "130px" },
];

function bukaTab(title: string, path: string, query: Record<string, string>) {
  tabsStore.openTab({ title, path, query, icon: "mdi mdi-open-in-new", closable: true });
  router.push({ path, query });
}

function buatIjin(row: Record<string, any>) {
  bukaTab(`Ijin ${row.Nik}`, "/transaksi/ijin/form", {
    nik: String(row.Nik ?? ""),
    tanggal: String(row.Tanggal || "").slice(0, 10),
    jenis_id: "1",
  });
}

function editAbsensi(row: Record<string, any>) {
  bukaTab(`Absensi ${row.Kode}`, "/absensi/form", {
    nik: String(row.Kode ?? ""),
    tanggal: String(row.Tanggal || "").slice(0, 10),
  });
}
</script>

<template>
  <BaseBrowse
    module-title="Absen Tidak Lengkap"
    module-subtitle="Tidak absen masuk / tidak absen keluar (salah satu scan 00:00:00)"
    endpoint="/laporan/tidak-keluar"
    :columns="columns"
    primary-key="Nik"
    has-period
    :default-start="firstDayOfMonth()"
    :can-delete="false"
    search-placeholder="Cari NIK / nama / bagian..."
    :per-page="50"
  >
    <template #row-actions="{ row }">
      <button
        v-if="!row.Jenis_Ijin"
        class="row-btn edit"
        title="Buatkan ijin Terlambat"
        @click="buatIjin(row)"
      >
        <MsIcon name="event_available" :size="14" />
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
