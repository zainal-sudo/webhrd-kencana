<script setup lang="ts">
<<<<<<< HEAD
import { useRouter } from "vue-router";
import BaseBrowse from "@/components/BaseBrowse.vue";
import MsIcon from "@/components/MsIcon.vue";
import { useTabsStore } from "@/stores/tabsStore";
import type { BrowseColumn } from "@/types";
import { firstDayOfMonth } from "@/utils/format";

/**
 * Browse Ijin — padanan `ufrmBrowseIjin`.
 *
 * Kolom mengikuti `btnRefreshClick`: Nomor, Tanggal, Jenis_Ijin, Nik, Nama,
 * Pabrik, Bagian (jab_nama + kar_bagian), Awal, Akhir, Alasan, Keterangan,
 * SistemGaji. Hapus memakai kunci Nomor (BaseBrowse standar).
 *
 * Tombol "Kolektif (V2)" di toolbar = cxButton5 Delphi yang membuka
 * `ufrmIjin2` (input ijin multi-NIK). Hak akses form V2 tetap `frmIjin2`.
 */
const router = useRouter();
const tabsStore = useTabsStore();

const columns: BrowseColumn[] = [
  { key: "Nomor", label: "Nomor", width: "130px" },
  { key: "Tanggal", label: "Tanggal", type: "date", width: "95px" },
  { key: "Jenis_Ijin", label: "Jenis Ijin", width: "150px" },
  { key: "Nik", label: "NIK", width: "110px" },
  { key: "Nama", label: "Nama Lengkap" },
  { key: "Pabrik", label: "Pabrik", width: "80px" },
  { key: "Bagian", label: "Jabatan / Bagian" },
  { key: "Awal", label: "Jam Awal", width: "85px", align: "center" },
  { key: "Akhir", label: "Jam Akhir", width: "85px", align: "center" },
  { key: "Alasan", label: "Alasan" },
  { key: "Keterangan", label: "Keterangan", width: "95px" },
  { key: "SistemGaji", label: "Sistem", width: "80px" },
];

function bukaKolektif() {
  const path = "/transaksi/ijin-v2/form";
  tabsStore.openTab({
    title: "Tambah Ijin Kolektif",
    path,
    icon: "mdi mdi-plus-box-outline",
    closable: true,
  });
  router.push(path);
=======
import { ref } from "vue";
import { useToast } from "vue-toastification";
import BaseBrowse from "@/components/BaseBrowse.vue";
import MsIcon from "@/components/MsIcon.vue";
import { api, getErrorMessage } from "@/api/axios";
import { firstDayOfMonth, formatTanggal } from "@/utils/format";
import type { BrowseColumn } from "@/types";

interface IjinRecord {
  Nomor: string;
  Tanggal: string | null;
  JenisIjin: string | null;
  Nik: string | null;
  Nama: string | null;
  Pabrik: string | null;
  Bagian: string | null;
  Awal: string | null;
  Akhir: string | null;
  Alasan: string | null;
  Keterangan: string | null;
  SistemGaji: string | null;
  JenisIjinId: number | null;
  KeteranganKode: number | null;
  JumlahMasterKaryawan: number;
}

const columns: BrowseColumn[] = [
  { key: "Nomor", label: "Nomor", width: "180px" },
  { key: "Tanggal", label: "Tanggal", type: "date", width: "100px" },
  { key: "JenisIjin", label: "Jenis Ijin", width: "170px" },
  { key: "Nik", label: "NIK", width: "120px" },
  { key: "Nama", label: "Nama", width: "220px" },
  { key: "Pabrik", label: "Pabrik", width: "80px" },
  { key: "Bagian", label: "Bagian", width: "220px" },
  { key: "Awal", label: "Awal", width: "90px", align: "center" },
  { key: "Akhir", label: "Akhir", width: "90px", align: "center" },
  { key: "Alasan", label: "Alasan", width: "250px" },
  { key: "Keterangan", label: "Keterangan", width: "120px" },
  { key: "SistemGaji", label: "Sistem Gaji", width: "110px" },
];

const toast = useToast();
const dialog = ref(false);
const loading = ref(false);
const detail = ref<IjinRecord | null>(null);
let requestId = 0;

function display(value: string | number | null | undefined): string {
  // Nilai nol, termasuk waktu 00:00:00, tetap utuh; NULL berbeda dari nol.
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

async function bukaDetail(row: Record<string, any>) {
  const id = ++requestId;
  detail.value = null;
  dialog.value = true;
  loading.value = true;
  try {
    const { data } = await api.get(`/transaksi/ijin/${encodeURIComponent(String(row.Nomor))}`);
    if (id === requestId) detail.value = data.data;
  } catch (err) {
    if (id === requestId) {
      toast.error(getErrorMessage(err, "Gagal memuat detail Ijin"));
      dialog.value = false;
    }
  } finally {
    if (id === requestId) loading.value = false;
  }
>>>>>>> 737489d0e1f7cb7413e96f96516bf731f89f62d5
}
</script>

<template>
  <BaseBrowse
    module-title="Ijin"
<<<<<<< HEAD
    module-subtitle="Daftar surat ijin / tidak masuk karyawan per periode"
=======
    module-subtitle="Transaksi Ijin — browse dan detail read-only"
>>>>>>> 737489d0e1f7cb7413e96f96516bf731f89f62d5
    endpoint="/transaksi/ijin"
    :columns="columns"
    primary-key="Nomor"
    has-period
    :default-start="firstDayOfMonth()"
<<<<<<< HEAD
    add-form-path="/transaksi/ijin/form"
    edit-form-path="/transaksi/ijin/form"
    search-placeholder="Cari nomor / NIK / nama / alasan..."
    :per-page="50"
  >
    <template #toolbar-extra>
      <button class="tool-btn kolektif" title="Input ijin banyak karyawan sekaligus (Ijin V2)" @click="bukaKolektif">
        <MsIcon name="group_add" :size="15" />
        <span>Kolektif (V2)</span>
      </button>
    </template>
  </BaseBrowse>
</template>

<style scoped>
.tool-btn {
  height: 28px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  border: 1px solid var(--ds-border, #b0b8c4);
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  border-radius: 0;
}
.tool-btn.kolektif {
  background: #fff;
  color: var(--ds-on-surface, #1b2d4a);
}
.tool-btn.kolektif:hover {
  background: var(--ds-surface-variant, #e0e4ea);
=======
    :can-delete="false"
    :per-page="50"
    search-placeholder="Cari nomor / NIK / nama / alasan / jenis ijin / bagian / pabrik..."
  >
    <template #row-actions="{ row }">
      <button class="row-btn" type="button" title="Detail Ijin" aria-label="Detail Ijin" @click="bukaDetail(row)">
        <MsIcon name="visibility" :size="14" />
      </button>
    </template>
  </BaseBrowse>

  <v-dialog v-model="dialog" max-width="900" scrollable>
    <v-card rounded="false">
      <v-card-title class="d-flex align-center justify-space-between text-body-1 font-weight-bold">
        <span>Detail Ijin{{ detail ? ` — ${detail.Nomor}` : "" }}</span>
        <v-btn icon="close" size="small" variant="text" aria-label="Tutup detail" @click="dialog = false" />
      </v-card-title>
      <v-card-text>
        <div v-if="loading" class="pa-6 text-center" role="status">Memuat detail...</div>
        <template v-else-if="detail">
          <p class="text-caption mb-4">READ-ONLY — informasi transaksi tersimpan, tanpa perubahan data.</p>
          <v-alert v-if="detail.JumlahMasterKaryawan === 0" type="warning" variant="tonal" class="mb-4">
            Data master karyawan tidak ditemukan. Transaksi tetap ditampilkan.
          </v-alert>
          <v-alert v-else-if="detail.JumlahMasterKaryawan > 1" type="warning" variant="tonal" class="mb-4">
            NIK memiliki beberapa baris master. Informasi master menggunakan fallback MIN per kolom;
            perlu verifikasi data master, tanpa mengubah transaksi.
          </v-alert>
          <dl class="detail-grid">
            <div><dt>Nomor</dt><dd>{{ detail.Nomor }}</dd></div>
            <div><dt>Tanggal</dt><dd>{{ detail.Tanggal ? formatTanggal(detail.Tanggal) : "—" }}</dd></div>
            <div><dt>Jenis Ijin</dt><dd>{{ display(detail.JenisIjin) }} <small>(kode {{ display(detail.JenisIjinId) }})</small></dd></div>
            <div><dt>NIK</dt><dd>{{ display(detail.Nik) }}</dd></div>
            <div><dt>Nama</dt><dd>{{ display(detail.Nama) }}</dd></div>
            <div><dt>Pabrik</dt><dd>{{ display(detail.Pabrik) }}</dd></div>
            <div><dt>Bagian</dt><dd>{{ display(detail.Bagian) }}</dd></div>
            <div><dt>Sistem Gaji</dt><dd>{{ display(detail.SistemGaji) }}</dd></div>
            <div><dt>Awal / Jam pertama</dt><dd>{{ display(detail.Awal) }}</dd></div>
            <div><dt>Akhir / Jam kedua</dt><dd>{{ display(detail.Akhir) }}</dd></div>
            <div><dt>Keterangan</dt><dd>{{ display(detail.Keterangan) }} <small>(kode {{ display(detail.KeteranganKode) }})</small></dd></div>
            <div class="full-width"><dt>Alasan</dt><dd>{{ display(detail.Alasan) }}</dd></div>
          </dl>
        </template>
      </v-card-text>
      <v-card-actions class="pa-4">
        <v-spacer />
        <v-btn variant="text" @click="dialog = false">Tutup</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px 24px;
}
.detail-grid dt {
  font-size: 12px;
  font-weight: 700;
  color: var(--ds-primary, #3b5998);
  margin-bottom: 4px;
}
.detail-grid dd {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.full-width { grid-column: 1 / -1; }
@media (max-width: 600px) {
  .detail-grid { grid-template-columns: 1fr; }
>>>>>>> 737489d0e1f7cb7413e96f96516bf731f89f62d5
}
</style>
