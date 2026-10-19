<script setup lang="ts">
import { computed, defineAsyncComponent, onUnmounted, ref, watch } from "vue";
import { useToast } from "vue-toastification";
import BaseBrowse from "@/components/BaseBrowse.vue";
import { useKaryawanBrowseStore } from "@/stores/karyawanBrowseStore";
import type { BrowseColumn } from "@/types";
import { filterKey } from "@/utils/columnFilter";

const toast = useToast();
const endpoint = "/master/karyawan";
const formPath = "/master/karyawan/form";
const browseStore = useKaryawanBrowseStore();
const initialFilters = computed((): Record<string, string[]> => {
  if (browseStore.status === "aktif") return { Status: [filterKey("Aktif")] };
  if (browseStore.status === "nonaktif") return { Status: [filterKey("Non Aktif")] };
  return {};
});
const statusFilterValues = { Status: ["Aktif", "Non Aktif"] };

function updateStatusFilter(filters: Record<string, string[]>) {
  const selected = filters.Status || [];
  // Jangan menaikkan revision: pilihan popup tidak perlu mereset browse.
  browseStore.status = selected.length === 1 && selected[0] === filterKey("Aktif")
    ? "aktif"
    : selected.length === 1 && selected[0] === filterKey("Non Aktif")
      ? "nonaktif"
      : "all";
}
const statusMessage = computed(() => {
  if (browseStore.status === "aktif") return "Menampilkan karyawan dengan status = Aktif.";
  if (browseStore.status === "nonaktif") return "Menampilkan karyawan dengan status = Non Aktif. Data berdasarkan status, bukan tanggal keluar.";
  return "Menampilkan seluruh karyawan, baik aktif maupun non aktif.";
});

watch(() => browseStore.revision, () => {
  toast.dismiss("karyawan-status");
  // Only dashboard summary cards request this one-shot notice.
  if (!browseStore.notifyStatus) return;
  browseStore.notifyStatus = false;
  toast.info(statusMessage.value, {
    id: "karyawan-status",
    timeout: 5000,
    pauseOnHover: false,
    pauseOnFocusLoss: false,
  });
}, { immediate: true });

// Tutup tab menghapus filter; perpindahan tab keep-alive tetap mempertahankannya.
onUnmounted(() => browseStore.setStatus("all"));

const filterValueTypes: Record<string, "number" | "date"> = {
  MasaKerja: "number", TglLahir: "date", TglMasuk: "date", TglKeluar: "date",
  PKWT1: "date", PKWT2: "date",
};

const columns: BrowseColumn[] = [
  { key: "Nik", label: "Nik", width: "120px" },
  { key: "Nama", label: "Nama", width: "220px" },
  { key: "Kd_Abs", label: "Kode Absensi", width: "120px" },
  { key: "Pabrik", label: "Pabrik", width: "85px" },
  { key: "Nama Pabrik", label: "Nama Pabrik", width: "170px" },
  { key: "Sistem", label: "Sistem Gaji", width: "110px" },
  { key: "TglLahir", label: "Tgl Lahir", type: "date", width: "105px" },
  { key: "JenisKelamin", label: "Jenis Kelamin", width: "125px" },
  { key: "TglMasuk", label: "Tgl Masuk", type: "date", width: "105px" },
  { key: "TglKeluar", label: "Tgl Keluar", type: "date", width: "105px" },
  { key: "Size", label: "Size", width: "70px" },
  { key: "IbuKandung", label: "Ibu Kandung", width: "180px" },
  { key: "Email", label: "Email", width: "220px" },
  { key: "StatusBPJS", label: "Status BPJS", width: "165px" },
  { key: "NoBPJS", label: "BPJS KES", width: "150px" },
  { key: "NoNaker", label: "BPJS TK", width: "150px" },
  { key: "MasaKerja", label: "Masa Kerja", width: "105px", align: "center", type: "align-right" },
  { key: "Jabatan", label: "Jabatan", width: "170px" },
  { key: "Bagian", label: "Bagian", width: "150px" },
  { key: "Departemen", label: "Departemen", width: "160px" },
  { key: "Status Karyawan", label: "Status Karyawan", width: "155px" },
  { key: "Status", label: "Status", width: "90px", align: "center" },
  { key: "Alamat", label: "Alamat", width: "280px" },
  { key: "Telp", label: "Telp", width: "145px" },
  { key: "Identitas", label: "Identitas", width: "170px" },
  { key: "RekeningBank", label: "RekeningBank", width: "180px" },
  { key: "PendidikanTerakhir", label: "Pendidikan Terakhir", width: "180px" },
  { key: "Jurusan", label: "Jurusan", width: "180px" },
  { key: "PKWT1", label: "PKWT1", type: "date", width: "105px" },
  { key: "PKWT2", label: "PKWT2", type: "date", width: "105px" },
];
for (const column of columns) column.filterValueType = filterValueTypes[column.key] ?? "string";

const barcodeTarget = ref<{ nik: string; nama: string } | null>(null);
const BarcodeDialog = defineAsyncComponent({
  loader: () => import("@/components/EmployeeBarcodeDialog.vue"),
  onError(_error, _retry, fail) {
    toast.error("Gagal memuat pencetak barcode. Coba kembali.");
    barcodeTarget.value = null;
    fail();
  },
});
function showBarcode(row: Record<string, any>) {
  barcodeTarget.value = { nik: typeof row.Nik === "string" ? row.Nik : "", nama: String(row.Nama ?? "") };
}
</script>

<template>
  <BaseBrowse
    class="karyawan-browse"
    data-native-scrollbar
    :key="browseStore.revision"
    module-title="Master Karyawan"
    module-subtitle="Data induk karyawan beserta riwayat jabatan, pendidikan, keluarga dan jadwal kerja"
    :endpoint="endpoint"
    :columns="columns"
    combine-blank-values
    primary-key="Nik"
    row-number-label="No"
    add-label="Tambah Karyawan"
    :add-form-path="formPath"
    :edit-form-path="formPath"
    search-placeholder="Cari NIK / nama / kode absensi..."
    :per-page="25"
    :initial-filters="initialFilters"
    :filter-values="statusFilterValues"
    @filters-change="updateStatusFilter"
  >
    <template #toolbar-extra>
      <button v-if="browseStore.status !== 'all'" class="status-reset" @click="browseStore.setStatus('all')">
        Tampilkan Semua
      </button>
    </template>
    <template #row-actions="{ row }">
      <div class="row-actions">
        <button type="button" class="lnk" title="Cetak Barcode" aria-label="Cetak barcode karyawan" @click.stop="showBarcode(row)">Cetak Barcode</button>
      </div>
    </template>
  </BaseBrowse>

  <BarcodeDialog v-if="barcodeTarget" :employee="barcodeTarget" @close="barcodeTarget = null" />
</template>

<style scoped>
.karyawan-browse :deep(.browse-table th), .karyawan-browse :deep(.th-label) { text-transform: none; }
.karyawan-browse :deep(.action-col) { width: 180px; min-width: 180px; }
.karyawan-browse :deep(td.action-col) { padding-left: 4px; padding-right: 4px; }
.karyawan-browse :deep(.row-actions) {
  align-items: center;
  flex-wrap: nowrap;
}
.karyawan-browse :deep(.row-actions > *) { flex-shrink: 0; }
.karyawan-browse :deep(.row-btn.del) {
  width: 36px;
  height: 32px;
  border: 1px solid currentColor;
  border-radius: 6px;
}
.status-reset {
  border: 1px solid var(--ds-primary, #3b5998);
  border-radius: 6px;
  padding: 6px 10px;
  color: var(--ds-primary, #3b5998);
  background: var(--ds-surface, #fff);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.row-actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}
.lnk {
  border: 1px solid #a3b1c6;
  border-radius: 6px;
  padding: 6px 10px;
  background: transparent;
  color: var(--ds-primary, #3b5998);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  text-decoration: none;
}
.lnk:hover,
.lnk:focus {
  text-decoration: none;
}
.lnk:hover {
  background: rgba(59, 89, 152, 0.14);
}
</style>
