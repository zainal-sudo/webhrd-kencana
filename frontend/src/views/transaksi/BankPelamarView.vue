<script setup lang="ts">
import BaseBrowse from "@/components/BaseBrowse.vue";
import type { BrowseColumn } from "@/types";
import { firstDayOfMonth } from "@/utils/format";

/**
 * Browse Bank Pelamar — padanan `ufrmBrowseRekruitmen` (menu Bank Pelamar).
 * Status tersimpan sebagai index (0–8), label mengikuti pemetaan Delphi.
 */
const columns: BrowseColumn[] = [
  { key: "Nomor", label: "Nomor", width: "150px" },
  { key: "Tanggal", label: "Tanggal", type: "date", width: "95px" },
  { key: "Nama", label: "Nama" },
  { key: "Jenis_Kelamin", label: "L/P", width: "90px", align: "center" },
  { key: "Alamat", label: "Alamat" },
  { key: "Telp", label: "Telp", width: "110px" },
  { key: "Identitas", label: "Identitas", width: "130px" },
  { key: "TempatLahir", label: "Tempat Lahir", width: "110px" },
  { key: "TglLahir", label: "Tgl Lahir", type: "date", width: "95px" },
  { key: "IbuKandung", label: "Ibu Kandung", width: "130px" },
  { key: "Email", label: "Email", width: "160px" },
  { key: "Posisi", label: "Posisi" },
  { key: "Status", label: "Status", width: "150px", align: "center" },
  { key: "PendidikanTerakhir", label: "Pendidikan", width: "130px" },
  { key: "Jurusan", label: "Jurusan", width: "130px" },
  { key: "SizeKaos", label: "Size", width: "60px", align: "center" },
];
</script>

<template>
  <BaseBrowse
    module-title="Bank Pelamar"
    module-subtitle="Data pelamar per periode + status seleksi"
    endpoint="/transaksi/bank-pelamar"
    :columns="columns"
    primary-key="Nomor"
    has-period
    :default-start="firstDayOfMonth()"
    add-form-path="/transaksi/bank-pelamar/form"
    edit-form-path="/transaksi/bank-pelamar/form"
    search-placeholder="Cari nomor / nama / posisi / alamat..."
    :per-page="50"
  />
</template>
