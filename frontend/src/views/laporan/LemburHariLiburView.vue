<script setup lang="ts">
import BaseBrowse from "@/components/BaseBrowse.vue";
import { firstDayOfMonth } from "@/utils/format";
import type { BrowseColumn } from "@/types";

const columns: BrowseColumn[] = [
  { key: "Tanggal", label: "Tanggal", type: "date", width: "100px" },
  { key: "Kar_Nik", label: "NIK", width: "115px" },
  { key: "Nama", label: "Nama", width: "220px" },
  { key: "Pabrik", label: "Pabrik", width: "80px" },
  { key: "Bagian", label: "Bagian", width: "170px" },
  { key: "Sistem", label: "Sistem", width: "90px" },
  { key: "scan1", label: "Scan 1", width: "90px", align: "center" },
  { key: "scan2", label: "Scan 2", width: "90px", align: "center" },
  { key: "lama", label: "Lama", width: "90px", align: "center" },
  { key: "jam_mulai", label: "Jam Mulai", width: "100px", align: "center" },
  { key: "jam_selesai", label: "Jam Selesai", width: "100px", align: "center" },
  { key: "lama_lembur", label: "Lama Lembur", width: "105px", align: "center" },
  { key: "no_ijin", label: "No Ijin", width: "100px" },
  { key: "verifikasi", label: "Verifikasi", width: "90px", align: "center" },
];
</script>

<template>
  <div>
    <p class="report-note">Tanggal mengikuti Master Hari Libur (tharilibur), hanya absensi yang memiliki scan. Lama = Scan 2 − Scan 1; Lama Lembur = Jam Selesai − Jam Mulai. No Ijin dan Verifikasi sementara kosong.</p>
    <BaseBrowse
      module-title="Laporan Lembur Hari Libur"
      module-subtitle="Absensi pada tanggal Master Hari Libur, dengan SPL berdasarkan NIK dan tanggal"
      endpoint="/laporan/lembur-hari-libur"
      :columns="columns"
      primary-key="_key"
      has-period
      :default-start="firstDayOfMonth()"
      :can-delete="false"
      :show-actions="false"
      search-placeholder="Cari NIK / nama / pabrik / bagian..."
      :per-page="50"
    />
  </div>
</template>

<style scoped>
.report-note { margin: 0 0 8px; padding: 8px 12px; border: 1px solid var(--ds-border, #b0b8c4); background: #fffbeb; font-size: 12px; color: #854d0e; }
</style>
