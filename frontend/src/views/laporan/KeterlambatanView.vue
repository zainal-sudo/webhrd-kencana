<script setup lang="ts">
import { useRouter } from "vue-router";
import BaseBrowse from "@/components/BaseBrowse.vue";
import MsIcon from "@/components/MsIcon.vue";
import { useTabsStore } from "@/stores/tabsStore";
import type { BrowseColumn } from "@/types";
import { firstDayOfMonth } from "@/utils/format";

/**
 * Laporan Keterlambatan — padanan `ufrmLapKeterlambatan`.
 *
 * Absensi status 2 (terlambat), bukan Minggu, karyawan aktif, plus ijin
 * Terlambat (ji_id 1) bila ada. Aksi baris: Buatkan Ijin Terlambat
 * (prefill form Ijin, jenis 1).
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
  { key: "Jabatan", label: "Jabatan" },
  { key: "Bagian", label: "Bagian" },
  { key: "Masuk", label: "Jam Masuk", width: "90px", align: "center" },
  { key: "Scan1", label: "Scan Masuk", width: "90px", align: "center" },
  { key: "Jenis_Ijin", label: "Jenis Ijin", width: "130px" },
  { key: "Alasan", label: "Alasan" },
];

function buatIjin(row: Record<string, any>) {
  const query = {
    nik: String(row.Nik ?? ""),
    tanggal: String(row.Tanggal || "").slice(0, 10),
    jenis_id: "1",
  };
  tabsStore.openTab({
    title: `Ijin ${row.Nik}`,
    path: "/transaksi/ijin/form",
    query,
    icon: "mdi mdi-open-in-new",
    closable: true,
  });
  router.push({ path: "/transaksi/ijin/form", query });
}
</script>

<template>
  <BaseBrowse
    module-title="Laporan Keterlambatan"
    module-subtitle="Absensi terlambat (status 2) di luar hari Minggu"
    endpoint="/laporan/keterlambatan"
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
    </template>
  </BaseBrowse>
</template>

<style scoped>
.row-btn.edit { color: var(--ds-primary, #3b5998); }
</style>
