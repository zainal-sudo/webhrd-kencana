<script setup lang="ts">
import BaseBrowse from "@/components/BaseBrowse.vue";
import type { BrowseColumn } from "@/types";
import { firstDayOfMonth } from "@/utils/format";

/**
 * Detail Lembur Double — indikasi SPL ganda.
 *
 * Satu NIK pada satu tanggal tercatat di dua nomor transaksi lembur (lem_nomor)
 * berbeda: bisa double input SPL, atau SPL reguler yang berdeskripsi transaksi
 * panggilan pada hari yang sama. Kolom `Nomor` berisi daftar nomor tersebut.
 * Hak akses mengikuti Detail Lembur (`frmLapDetailLembur`).
 */
const columns: BrowseColumn[] = [
  { key: "Tanggal", label: "Tanggal", type: "date", width: "95px" },
  { key: "Nik", label: "NIK", width: "110px" },
  { key: "Nama", label: "Nama Lengkap" },
  { key: "Pabrik", label: "Pabrik", width: "80px" },
  { key: "Bagian", label: "Bagian" },
  { key: "Jumlah_SPL", label: "Jumlah SPL", width: "95px", align: "right", filterValueType: "number" },
  { key: "Nomor", label: "Nomor Transaksi", width: "240px", filterable: false },
];
</script>

<template>
  <BaseBrowse
    class="lembur-double-browse"
    module-title="Detail Lembur Double"
    module-subtitle="Indikasi ganda: NIK + tanggal sama di ≥2 nomor transaksi lembur • dikelompokkan per NIK + tanggal"
    endpoint="/laporan/lembur-double"
    :columns="columns"
    primary-key="Nik"
    :row-key="({ Nik, Tanggal }) => `${Nik}-${String(Tanggal).slice(0, 10)}`"
    has-period
    :default-start="firstDayOfMonth()"
    :can-delete="false"
    :show-actions="false"
    search-placeholder="Cari NIK / nama / bagian / pabrik..."
    :per-page="50"
  >
    <template #cell="{ column, text }">
      <span :class="{ 'nomor-list': column.key === 'Nomor' }">{{ text }}</span>
    </template>
  </BaseBrowse>
</template>

<style scoped>
/* Ukuran kolom memakai colgroup, bukan panjang teks daftar nomor. */
.lembur-double-browse :deep(.browse-table) {
  table-layout: fixed;
}
.lembur-double-browse :deep(th:not(.sorted) .th-sort) {
  display: inline-flex;
}
/* Daftar nomor yang panjang melipat di dalam sel kolom Nomor. */
.lembur-double-browse :deep(.nomor-list) {
  display: inline-block;
  white-space: normal;
  overflow-wrap: anywhere;
  line-height: 1.45;
}
</style>
