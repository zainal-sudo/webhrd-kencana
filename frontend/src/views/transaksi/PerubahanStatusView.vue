<script setup lang="ts">
import BaseBrowse from "@/components/BaseBrowse.vue";
import type { BrowseColumn } from "@/types";
import { firstDayOfMonth } from "@/utils/format";
import { ref } from "vue";
import { useToast } from "vue-toastification";
import { api, getErrorMessage } from "@/api/axios";

/**
 * Browse Perubahan Status — padanan `ufrmBrowsePerubahanStatus`.
 * Tombol cetak memakai query report Delphi (PKWT1/2/3) via
 * GET /transaksi/perubahan-status/surat.
 */
const toast = useToast();
const columns: BrowseColumn[] = [
  { key: "Nomor", label: "Nomor", width: "130px" },
  { key: "Tanggal", label: "Tanggal", type: "date", width: "95px" },
  { key: "Nik", label: "NIK", width: "110px" },
  { key: "Nama", label: "Nama Lengkap" },
  { key: "Pabrik", label: "Pabrik", width: "80px" },
  { key: "Jabatan", label: "Jabatan" },
  { key: "Bagian", label: "Bagian" },
  { key: "Status_Lama", label: "Status Lama", width: "110px" },
  { key: "Status_Baru", label: "Status Baru", width: "110px" },
];

const suratOpen = ref(false);
const surat = ref<Record<string, any> | null>(null);

async function cetak(row: Record<string, any>) {
  try {
    const { data } = await api.get("/transaksi/perubahan-status/surat", { params: { nomor: row.Nomor } });
    surat.value = data.data;
    suratOpen.value = true;
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat surat PKWT"));
  }
}
</script>

<template>
  <BaseBrowse
    module-title="Perubahan Status"
    module-subtitle="Perubahan status kerja karyawan + cetak kontrak PKWT"
    endpoint="/transaksi/perubahan-status"
    :columns="columns"
    primary-key="Nomor"
    has-period
    :default-start="firstDayOfMonth()"
    add-form-path="/transaksi/perubahan-status/form"
    edit-form-path="/transaksi/perubahan-status/form"
    search-placeholder="Cari nomor / NIK / nama / bagian..."
    :per-page="50"
    printable
    @print="cetak"
  />

  <v-dialog v-model="suratOpen" max-width="680" scrollable>
    <v-card rounded="false">
      <v-card-title class="dlg-head">
        <span>Kontrak {{ surat?.template }} — {{ surat?.Nomor }}</span>
        <v-btn icon="close" size="small" variant="text" @click="suratOpen = false" />
      </v-card-title>
      <v-card-text v-if="surat" class="surat">
        <h3>SURAT PERJANJIAN KERJA WAKTU TERTENTU ({{ surat.template }})</h3>
        <p>Nomor: <b>{{ surat.Nomor }}</b> &nbsp;|&nbsp; Tanggal: <b>{{ String(surat.Tanggal).slice(0, 10) }}</b></p>
        <table>
          <tr><td>NIK / Nama</td><td><b>{{ surat.Nik }} / {{ surat.Nama }}</b></td></tr>
          <tr><td>Tempat/Tgl Lahir</td><td>{{ surat.kar_tempatlahir }}, {{ String(surat.kar_tgllahir || "").slice(0, 10) }} (umur {{ surat.umur }} thn)</td></tr>
          <tr><td>Jenis Kelamin</td><td>{{ surat.Jenis_Kelamin }}</td></tr>
          <tr><td>Alamat / Telp</td><td>{{ surat.kar_alamat }} / {{ surat.kar_notelp }}</td></tr>
          <tr><td>Jabatan / Bagian</td><td>{{ surat.Jabatan }} / {{ surat.Bagian }} ({{ surat.Pabrik }})</td></tr>
          <tr><td>Departemen</td><td>{{ surat.departemen }}</td></tr>
          <tr><td>Periode Kontrak</td><td><b>{{ String(surat.ps_tgl_awal).slice(0, 10) }} s/d {{ String(surat.ps_tgl_akhir).slice(0, 10) }}</b></td></tr>
        </table>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.dlg-head { display: flex; justify-content: space-between; align-items: center; font-size: 13px; font-weight: 800; padding: 8px 12px; background: var(--ds-surface-variant, #e0e4ea); }
.surat { background: #fff; padding: 16px 20px; }
.surat h3 { text-align: center; font-size: 14px; margin: 0 0 10px; }
.surat p { font-size: 12px; }
.surat table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
.surat td { border: 1px solid #d5dbe3; padding: 5px 8px; }
.surat td:first-child { width: 140px; font-weight: 700; background: #f4f6f9; }
</style>
