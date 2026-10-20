<script setup lang="ts">
import BaseBrowse from "@/components/BaseBrowse.vue";
import type { BrowseColumn } from "@/types";

const columns: BrowseColumn[] = [
  { key: "Nik", label: "NIK", width: "120px" },
  { key: "Nama", label: "Nama", width: "240px" },
  { key: "Pabrik", label: "Pabrik", width: "90px" },
  { key: "Bagian", label: "Bagian", width: "130px" },
  { key: "Jabatan", label: "Jabatan", width: "140px" },
  { key: "PKWT1", label: "PKWT1", width: "230px" },
  { key: "PKWT2", label: "PKWT2", width: "230px" },
  { key: "PKWT3", label: "PKWT3", width: "230px" },
  { key: "Pembinaan", label: "Pembinaan", width: "230px" },
  { key: "Sp1", label: "Sp1", width: "230px" },
  { key: "Sp2", label: "Sp2", width: "230px" },
  { key: "Sp3", label: "Sp3", width: "230px" },
  { key: "Mutasi", label: "Mutasi", width: "380px" },
  { key: "Promosi", label: "Promosi", width: "380px" },
  { key: "Rotasi", label: "Rotasi", width: "380px" },
  { key: "Demosi", label: "Demosi", width: "380px" },
  { key: "St_hari", label: "St_hari", width: "100px", align: "right", filterValueType: "number" },
  { key: "Sakit", label: "Sakit", width: "90px", align: "right", filterValueType: "number" },
  { key: "Ijin", label: "Ijin", width: "90px", align: "right", filterValueType: "number" },
  { key: "Alpha", label: "Alpha", width: "90px", align: "right", filterValueType: "number" },
];
</script>

<template>
  <BaseBrowse
    class="history-karyawan-browse"
    compact
    module-title="History Karyawan"
    module-subtitle="Karyawan aktif • Riwayat terbaru per kategori • Rekap absensi seluruh riwayat"
    endpoint="/master/history-karyawan"
    :columns="columns"
    primary-key="Nik"
    :can-delete="false"
    :show-actions="false"
    search-placeholder="Cari NIK, nama, bagian, atau jabatan..."
  />
</template>

<style scoped>
/* Gunakan lebar colgroup, bukan panjang isi riwayat, sebagai ukuran kolom. */
.history-karyawan-browse.compact :deep(.browse-table) {
  table-layout: fixed;
}

.history-karyawan-browse.compact :deep(th:not(.sorted) .th-sort) {
  display: inline-flex;
}
</style>
