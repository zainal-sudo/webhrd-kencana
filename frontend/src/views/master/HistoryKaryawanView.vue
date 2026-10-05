<script setup lang="ts">
import { ref } from "vue";
import BaseBrowse from "@/components/BaseBrowse.vue";
import type { BrowseColumn } from "@/types";

const columns: BrowseColumn[] = [
  { key: "Nik", label: "NIK", width: "120px" },
  { key: "Nama", label: "Nama" },
  { key: "Pabrik", label: "Pabrik", width: "90px" },
  { key: "Bagian", label: "Bagian", width: "130px" },
  { key: "Jabatan", label: "Jabatan", width: "140px" },
  { key: "TglMasuk", label: "Tgl Masuk", type: "date", width: "110px" },
  { key: "Aktif", label: "Aktif", width: "80px", align: "center" },
];
</script>

<template>
  <BaseBrowse
    module-title="History Karyawan"
    module-subtitle="Snapshot data karyawan sebelum perubahan (tabel tkaryawanold)"
    endpoint="/master/history-karyawan"
    :columns="columns"
    primary-key="Nik"
    :can-delete="false"
    search-placeholder="Cari NIK..."
  />
</template>