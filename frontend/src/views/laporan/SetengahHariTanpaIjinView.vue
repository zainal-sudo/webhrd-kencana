<script setup lang="ts">
import { useRouter } from "vue-router";
import BaseBrowse from "@/components/BaseBrowse.vue";
import MsIcon from "@/components/MsIcon.vue";
import { useTabsStore } from "@/stores/tabsStore";
import type { BrowseColumn } from "@/types";
import { firstDayOfMonth } from "@/utils/format";

/**
 * Setengah Hari Tanpa Ijin — padanan `ufrmLapStHariTanpaIjin`.
 *
 * Kehadiran < 6 jam (> 0) di luar Sabtu tanpa ijin apa pun pada tanggal itu.
 * Aksi baris: Buatkan Ijin (jenis 1/Terlambat) dan Edit Absensi.
 */
const router = useRouter();
const tabsStore = useTabsStore();

const columns: BrowseColumn[] = [
  { key: "Kode", label: "Kode Absensi", width: "110px" },
  { key: "Nik", label: "NIK", width: "110px" },
  { key: "Nama", label: "Nama Lengkap" },
  { key: "Sistem", label: "Sistem", width: "80px" },
  { key: "Tanggal", label: "Tanggal", type: "date", width: "95px" },
  { key: "Pabrik", label: "Pabrik", width: "80px" },
  { key: "Bagian", label: "Bagian" },
  { key: "Jabatan", label: "Jabatan" },
  { key: "Jam", label: "Jam", width: "70px", align: "center" },
  { key: "Scan1", label: "Scan Masuk", width: "90px", align: "center" },
  { key: "Scan2", label: "Scan Keluar", width: "90px", align: "center" },
];

function bukaTab(title: string, path: string, query?: Record<string, string>) {
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
    module-title="Setengah Hari Tanpa Ijin"
    module-subtitle="Kehadiran kurang dari 6 jam tanpa ijin (di luar Sabtu)"
    endpoint="/laporan/setengah-hari-tanpa-ijin"
    :columns="columns"
    primary-key="Nik"
    has-period
    :default-start="firstDayOfMonth()"
    :can-delete="false"
    search-placeholder="Cari NIK / nama / bagian..."
    :per-page="50"
  >
    <template #row-actions="{ row }">
      <button class="row-btn edit" title="Buatkan ijin (Terlambat)" @click="buatIjin(row)">
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