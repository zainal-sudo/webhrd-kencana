<script setup lang="ts">
import BaseBrowse from "@/components/BaseBrowse.vue";
import type { BrowseColumn } from "@/types";
import { firstDayOfMonth } from "@/utils/format";

/**
 * Browse Realisasi Permintaan Karyawan — padanan
 * `ufrmBrowseRiilPermintaanKaryawan`. Hapus menghapus baris realisasi
 * (browse Delphi salah menghapus `tjabatan` — bug copy-paste).
 */
const columns: BrowseColumn[] = [
  { key: "Nomor", label: "Nomor", width: "150px" },
  { key: "Tanggal", label: "Tanggal", type: "date", width: "95px" },
  { key: "Nomor_Minta", label: "Nomor Minta", width: "150px" },
  { key: "Peminta", label: "Peminta" },
  { key: "Tanggal_Minta", label: "Tgl Minta", type: "date", width: "95px" },
  { key: "Jabatan", label: "Jabatan" },
  { key: "Bagian", label: "Bagian" },
  { key: "Tgl_Butuh", label: "Tgl Butuh", type: "date", width: "95px" },
  { key: "Jumlah", label: "Jumlah", width: "70px", align: "center" },
  { key: "KeteranganNama", label: "Keterangan Nama" },
];
</script>

<template>
  <BaseBrowse
    module-title="Realisasi Permintaan"
    module-subtitle="Realisasi permintaan tenaga kerja per periode"
    endpoint="/transaksi/realisasi-permintaan"
    :columns="columns"
    primary-key="Nomor"
    has-period
    :default-start="firstDayOfMonth()"
    add-form-path="/transaksi/realisasi-permintaan/form"
    edit-form-path="/transaksi/realisasi-permintaan/form"
    search-placeholder="Cari nomor / nomor minta / peminta / bagian..."
    :per-page="50"
  />
</template>
