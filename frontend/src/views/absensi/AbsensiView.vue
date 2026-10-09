<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import BaseBrowse from "@/components/BaseBrowse.vue";
import type { BrowseColumn } from "@/types";
import { api, getErrorMessage } from "@/api/axios";
import { firstDayOfMonth } from "@/utils/format";

/**
 * Browse Absensi — padanan `ufrmBrowseAbsensi`.
 *
 * Bedanya dengan modul browse lain: primary key-nya majemuk (kode absensi +
 * tanggal), sehingga tombol hapus ditangani manual di sini, bukan lewat
 * `BaseBrowse`.
 */
const toast = useToast();
const router = useRouter();

const endpoint = "/absensi";
const formPath = "/absensi/form";

const columns: BrowseColumn[] = [
  { key: "Nik", label: "Kode Absensi", width: "110px" },
  { key: "NIK", label: "NIK", width: "110px" },
  { key: "Nama", label: "Nama Lengkap" },
  { key: "Tanggal", label: "Tanggal", type: "date", width: "100px" },
  { key: "Hari", label: "Hari", width: "70px", align: "center" },
  { key: "Pabrik", label: "Pabrik", width: "90px" },
  { key: "Bagian", label: "Jabatan / Bagian" },
  { key: "Sistem", label: "Sistem", width: "80px" },
  { key: "Masuk", label: "Jam Masuk", width: "90px", align: "center" },
  { key: "Scan1", label: "Scan Masuk", width: "90px", align: "center" },
  { key: "Keluar", label: "Jam Keluar", width: "90px", align: "center" },
  { key: "Scan2", label: "Scan Keluar", width: "90px", align: "center" },
  { key: "Status", label: "Status", width: "110px", align: "center" },
  { key: "Nonaktif", label: "Sudah Keluar", width: "95px", align: "center" },
];

/** Status absensi: 0 = tidak masuk (kuning), 1 = masuk, 2 = terlambat (hijau). */
function statusAbsensi(row: Record<string, any>): { label: string; cls: string } {
  const s = String(row.Status ?? "").trim();
  if (s === "0") return { label: "Tidak Masuk", cls: "st-0" };
  if (s === "2") return { label: "Terlambat", cls: "st-2" };
  return { label: "Masuk", cls: "st-1" };
}

/** Baris ikut ditandai samar mengikuti status. */
function barisAbsensi(row: Record<string, any>): string {
  const s = String(row.Status ?? "").trim();
  if (s === "0") return "absen-0";
  if (s === "2") return "absen-2";
  return "";
}

const dialog = ref(false);
const target = ref<{ Nik: string; Tanggal: string; Nama: string } | null>(null);
const menghapus = ref(false);

function bukaEdit(row: Record<string, any>) {
  router.push({
    path: formPath,
    query: { nik: row.Nik, tanggal: String(row.Tanggal || "").slice(0, 10) },
  });
}

function konfirmasiHapus(row: Record<string, any>) {
  target.value = {
    Nik: String(row.Nik ?? ""),
    Tanggal: String(row.Tanggal ?? "").slice(0, 10),
    Nama: row.Nama || "",
  };
  dialog.value = true;
}

async function hapus() {
  if (!target.value) return;
  menghapus.value = true;
  try {
    await api.delete(endpoint, {
      params: { nik: target.value.Nik, tanggal: target.value.Tanggal },
    });
    toast.success("Absensi berhasil dihapus");
    dialog.value = false;
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal menghapus absensi"));
  } finally {
    menghapus.value = false;
  }
}
</script>

<template>
  <BaseBrowse
    module-title="Browse Absensi"
    module-subtitle="Rekap hasil scan mesin absensi per karyawan dan tanggal"
    :endpoint="endpoint"
    :columns="columns"
    :add-form-path="formPath"
    primary-key="Nik"
    has-period
    :default-start="firstDayOfMonth()"
    :can-delete="false"
    search-placeholder="Cari NIK / nama / bagian / kode absensi..."
    :per-page="50"
    :row-class="barisAbsensi"
  >
    <template #cell="{ row, column, text }">
      <span v-if="column.key === 'Status'" :class="['status-badge', statusAbsensi(row).cls]">{{
        statusAbsensi(row).label
      }}</span>
      <span v-else-if="column.key === 'Nonaktif'" :class="['keluar-badge', String(row.Nonaktif ?? '').trim() === '1' ? 'ya' : 'tidak']">{{
        String(row.Nonaktif ?? '').trim() === '1' ? "Sudah Keluar" : "–"
      }}</span>
      <template v-else>{{ text }}</template>
    </template>
    <template #row-actions="{ row }">
      <button class="row-btn edit" title="Ubah jam absensi" @click="bukaEdit(row)">
        <span class="material-symbols-outlined" style="font-size: 14px">edit</span>
      </button>
      <button class="row-btn del" title="Hapus" @click="konfirmasiHapus(row)">
        <span class="material-symbols-outlined" style="font-size: 14px">delete</span>
      </button>
    </template>
  </BaseBrowse>

  <v-dialog v-model="dialog" max-width="420" persistent>
    <v-card rounded="false">
      <v-card-item class="py-3">
        <div class="d-flex align-center">
          <span class="material-symbols-outlined" style="color: #dc2626; margin-right: 8px">delete</span>
          <v-card-title class="text-body-1 font-weight-bold pa-0">Hapus Absensi</v-card-title>
        </div>
      </v-card-item>
      <v-card-text class="text-body-2">
        Hapus absensi <strong>{{ target?.Nama }}</strong> (kode {{ target?.Nik }}) tanggal
        <strong>{{ target?.Tanggal }}</strong>? Tindakan ini tidak dapat dibatalkan.
      </v-card-text>
      <v-card-actions class="pa-4 pt-2">
        <v-spacer />
        <v-btn variant="text" color="grey-darken-2" @click="dialog = false">Batal</v-btn>
        <v-btn color="error" variant="flat" :loading="menghapus" @click="hapus">Hapus</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.status-badge {
  display: inline-block;
  padding: 1px 8px;
  border: 1px solid transparent;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}
/* 0 = tidak masuk */
.status-badge.st-0 {
  color: #854d0e;
  background: #fef3c7;
  border-color: #e8c547;
}
/* 1 = masuk */
.status-badge.st-1 {
  color: #1d4ed8;
  background: #e3ecfd;
  border-color: #9dbcf3;
}
/* 2 = terlambat */
.status-badge.st-2 {
  color: #166534;
  background: #dff3e5;
  border-color: #8ed0a4;
}
/* Kolom Sudah Keluar: hanya sel bernilai 1 yang merah. */
.keluar-badge {
  display: inline-block;
  padding: 1px 8px;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}
.keluar-badge.ya {
  color: #b91c1c;
  background: #fde2e2;
  border: 1px solid #f0a8a8;
}
.keluar-badge.tidak {
  color: #9aa7b8;
}
:deep(tbody tr.absen-0 td) {
  background: #fff8e1;
}
:deep(tbody tr.absen-0:hover td) {
  background: #ffefc2 !important;
}
:deep(tbody tr.absen-2 td) {
  background: #eef9f0;
}
:deep(tbody tr.absen-2:hover td) {
  background: #d9f0dd !important;
}
</style>
