<script setup lang="ts">
import BaseBrowse from "@/components/BaseBrowse.vue";
import type { BrowseColumn } from "@/types";
import { firstDayOfMonth } from "@/utils/format";

/**
 * Browse Penilaian 3 Bulan — padanan `ufrmBrowsePenilaian3Bulan`
 * (master dokumen per periode; rincian nilai dibuka lewat form edit).
 */
const columns: BrowseColumn[] = [
  { key: "Nomor", label: "Nomor", width: "140px" },
  { key: "Tanggal", label: "Tanggal", type: "date", width: "95px" },
  { key: "Pabrik", label: "Pabrik", width: "90px" },
  { key: "Tahun", label: "Tahun", width: "70px", align: "center" },
  { key: "Periode", label: "Periode Bl", width: "85px", align: "center" },
  { key: "Periode2", label: "Periode s/d", width: "85px", align: "center" },
];
</script>

<template>
  <BaseBrowse
    module-title="Penilaian 3 Bulanan"
    module-subtitle="Penilaian kinerja karyawan per periode 3 bulan"
    endpoint="/transaksi/penilaian-3-bulan"
    :columns="columns"
    primary-key="Nomor"
    has-period
    :default-start="firstDayOfMonth()"
    add-form-path="/transaksi/penilaian-3-bulan/form"
    edit-form-path="/transaksi/penilaian-3-bulan/form"
    search-placeholder="Cari nomor / pabrik..."
    :per-page="50"
  />
</template>
