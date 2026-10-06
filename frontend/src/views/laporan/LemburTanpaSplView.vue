<script setup lang="ts">
import { useRouter } from "vue-router";
import BaseBrowse from "@/components/BaseBrowse.vue";
import MsIcon from "@/components/MsIcon.vue";
import { useTabsStore } from "@/stores/tabsStore";
import type { BrowseColumn } from "@/types";
import { firstDayOfMonth } from "@/utils/format";

/**
 * Lembur Tanpa SPL — padanan `ufrmLapLemburTanpaSPL`.
 *
 * Scan keluar > 25 menit dari jam keluar jadwal tanpa dokumen SPL.
 * Kategori Delphi: Setengah (15–45 mnt), Satu (45–75 mnt), selainnya Lebih.
 * Aksi baris: Edit Absensi (jam scan) — SPL-nya dibuat lewat menu Lembur.
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
  { key: "Bagian", label: "Bagian" },
  { key: "Keluar", label: "Jam Keluar", width: "90px", align: "center" },
  { key: "Scan2", label: "Scan Keluar", width: "90px", align: "center" },
  { key: "Lembur", label: "Kategori", width: "90px", align: "center" },
  { key: "Sistem", label: "Sistem", width: "80px" },
];

function editAbsensi(row: Record<string, any>) {
  const query = {
    nik: String(row.Kode ?? ""),
    tanggal: String(row.Tanggal || "").slice(0, 10),
  };
  tabsStore.openTab({
    title: `Absensi ${row.Kode}`,
    path: "/absensi/form",
    query,
    icon: "mdi mdi-open-in-new",
    closable: true,
  });
  router.push({ path: "/absensi/form", query });
}
</script>

<template>
  <BaseBrowse
    module-title="Lembur Tanpa SPL"
    module-subtitle="Scan keluar jauh dari jadwal tanpa surat perintah lembur"
    endpoint="/laporan/lembur-tanpa-spl"
    :columns="columns"
    primary-key="Nik"
    has-period
    :default-start="firstDayOfMonth()"
    :can-delete="false"
    search-placeholder="Cari NIK / nama / bagian..."
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
