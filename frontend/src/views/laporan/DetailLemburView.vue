<script setup lang="ts">
import { useRouter } from "vue-router";
import BaseBrowse from "@/components/BaseBrowse.vue";
import MsIcon from "@/components/MsIcon.vue";
import { useTabsStore } from "@/stores/tabsStore";
import type { BrowseColumn } from "@/types";
import { firstDayOfMonth } from "@/utils/format";

/**
 * Detail Lembur — padanan `ufrmLapDetailLembur`.
 *
 * Per NIK + tanggal: `2jam` (2 jam pertama, dikapas sesuai sistem gaji),
 * `Lebih2Jam` (Lembur - 2jam), `Panggilan`, `Lembur` total, jenis kerja.
 * Aksi baris: Edit Absensi (prefill kode + tanggal) seperti Delphi.
 */
const router = useRouter();
const tabsStore = useTabsStore();

const columns: BrowseColumn[] = [
  { key: "Kode", label: "Kode Absensi", width: "110px" },
  { key: "Tanggal", label: "Tanggal", type: "date", width: "95px" },
  { key: "Nik", label: "NIK", width: "110px" },
  { key: "Nama", label: "Nama Lengkap" },
  { key: "Pabrik", label: "Pabrik", width: "80px" },
  { key: "Bagian", label: "Bagian" },
  { key: "2jam", label: "2 Jam Pertama", width: "100px", align: "right" },
  { key: "Lebih2Jam", label: "Lebih 2 Jam", width: "100px", align: "right" },
  { key: "Panggilan", label: "Panggilan", width: "90px", align: "right" },
  { key: "Lembur", label: "Total Lembur", width: "100px", align: "right" },
  { key: "Jenis_Kerja", label: "Jenis Kerja" },
];

function editAbsensi(row: Record<string, any>) {
  tabsStore.openTab({
    title: `Absensi ${row.Kode}`,
    path: "/absensi/form",
    query: {
      nik: String(row.Kode ?? ""),
      tanggal: String(row.Tanggal || "").slice(0, 10),
    },
    icon: "mdi mdi-open-in-new",
    closable: true,
  });
  router.push({
    path: "/absensi/form",
    query: {
      nik: String(row.Kode ?? ""),
      tanggal: String(row.Tanggal || "").slice(0, 10),
    },
  });
}
</script>

<template>
  <BaseBrowse
    module-title="Detail Lembur"
    module-subtitle="Rincian 2 jam pertama, lebih, panggilan & total lembur per karyawan"
    endpoint="/laporan/detail-lembur"
    :columns="columns"
    primary-key="Nik"
    has-period
    :default-start="firstDayOfMonth()"
    :can-delete="false"
    search-placeholder="Cari NIK / nama / bagian / pabrik..."
    :per-page="50"
  >
    <template #row-actions="{ row }">
      <button class="row-btn edit" title="Edit absensi" @click="editAbsensi(row)">
        <MsIcon name="how_to_reg" :size="14" />
      </button>
    </template>
  </BaseBrowse>
</template>

<style scoped>
.row-btn.edit { color: var(--ds-primary, #3b5998); }
</style>