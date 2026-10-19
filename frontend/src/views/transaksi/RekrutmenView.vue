<script setup lang="ts">
import BaseBrowse from "@/components/BaseBrowse.vue";
import type { BrowseColumn } from "@/types";
import { firstDayOfMonth } from "@/utils/format";

/**
 * Browse Rekruitmen (Panggilan) — padanan `ufrmBrowseCalonKaryawan`.
 * Rincian pelamar per dokumen dibuka lewat form (mode ubah).
 */
const columns: BrowseColumn[] = [
  { key: "Nomor", label: "Nomor", width: "150px" },
  { key: "Tanggal", label: "Tanggal", type: "date", width: "95px" },
  { key: "Tgl_Panggil", label: "Tgl Panggil", type: "date", width: "95px" },
  { key: "Jml_Pelamar", label: "Pelamar", width: "70px", align: "center" },
  { key: "Keterangan", label: "Keterangan" },
];
</script>

<template>
  <BaseBrowse class="standard-actions"
    module-title="Rekruitmen"
    module-subtitle="Panggilan tes pelamar per periode"
    endpoint="/transaksi/rekrutmen"
    :columns="columns"
    primary-key="Nomor"
    has-period
    :default-start="firstDayOfMonth()"
    add-form-path="/transaksi/rekrutmen/form"
    edit-form-path="/transaksi/rekrutmen/form"
    search-placeholder="Cari nomor / keterangan..."
    :per-page="50"
  />
</template>
