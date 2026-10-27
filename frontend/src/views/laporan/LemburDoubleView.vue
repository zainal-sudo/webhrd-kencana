<script setup lang="ts">
import { useRouter } from "vue-router";
import BaseBrowse from "@/components/BaseBrowse.vue";
import MsIcon from "@/components/MsIcon.vue";
import { useTabsStore } from "@/stores/tabsStore";
import type { BrowseColumn } from "@/types";
import { firstDayOfMonth, todaySql } from "@/utils/format";

const router = useRouter();
const tabsStore = useTabsStore();

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

/** Buka Laporan Lembur terfilter tepat ke baris ini: tanggal dikunci + NIK di kotak cari. */
function bukaLembur(row: Record<string, any>) {
  const tanggal = String(row.Tanggal || "").slice(0, 10);
  const query = {
    search: String(row.Nik ?? ""),
    start_date: tanggal || todaySql(),
    end_date: tanggal || todaySql(),
  };
  tabsStore.stageTab({
    title: `Lembur ${tanggalId(tanggal)}`,
    path: "/laporan/lembur",
    query,
    icon: "mdi mdi-open-in-new",
    closable: true,
  });
  router.push({ path: "/laporan/lembur", query });
}

/** Tanggal gaya Indonesia: yyyy-mm-dd → dd/mm/yyyy. */
function tanggalId(tanggal: string): string {
  const [y = "", m = "", d = ""] = String(tanggal || "").slice(0, 10).split("-");
  return d ? `${d}/${m}/${y}` : String(tanggal || "");
}
</script>

<template>
  <BaseBrowse
    class="lembur-double-browse expanded-action-hover"
    module-title="Detail Lembur Double"
    module-subtitle="Indikasi ganda: NIK + tanggal sama di ≥2 nomor transaksi lembur • dikelompokkan per NIK + tanggal"
    endpoint="/laporan/lembur-double"
    :columns="columns"
    primary-key="Nik"
    :row-key="({ Nik, Tanggal }) => `${Nik}-${String(Tanggal).slice(0, 10)}`"
    has-period
    :default-start="firstDayOfMonth()"
    :can-delete="false"
    search-placeholder="Cari NIK / nama / bagian / pabrik..."
    :per-page="50"
  >
    <template #cell="{ column, text }">
      <span :class="{ 'nomor-list': column.key === 'Nomor' }">{{ text }}</span>
    </template>
    <template #row-actions="{ row }">
      <button
        type="button"
        class="row-btn go"
        :title="`Buka Laporan Lembur: ${row.Nama} tanggal ${tanggalId(String(row.Tanggal || ''))}`"
        @click="bukaLembur(row)"
      >
        <MsIcon name="arrow_forward" :size="14" />
      </button>
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
.row-btn.go { color: var(--ds-primary, #3b5998); }
/* Satu tombol ikon saja — kolom aksi menyusut dari 80px default global. */
.lembur-double-browse :deep(.browse-table .action-col) {
  width: 44px;
  min-width: 44px;
}
/* Ring fokus global (.app-shell tbody button:focus, outline 3px !important)
   terpicu juga oleh klik mouse & saat kembali ke tab keep-alive — outline
   kuding buang, diganti ring pada ::before yang menggambar pill hover,
   jadi lingkar fokus memenuhi ukuran sorotan hover. */
.lembur-double-browse :deep(td.action-col .row-btn.go:focus) {
  outline: none !important;
}
.lembur-double-browse :deep(td.action-col .row-btn.go:focus-visible) {
  outline: none !important;
}
.lembur-double-browse :deep(td.action-col .row-btn.go:focus::before),
.lembur-double-browse :deep(td.action-col .row-btn.go:focus-visible::before) {
  outline: 2px solid currentColor;
  outline-offset: 0;
}
</style>
