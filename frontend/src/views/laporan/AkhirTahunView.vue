<script setup lang="ts">
import { ref } from "vue";
import BaseBrowse from "@/components/BaseBrowse.vue";
import type { BrowseColumn } from "@/types";

const currentYear = new Date().getFullYear();
const tahun = ref(currentYear);
const years = Array.from({ length: currentYear - 1900 + 2 }, (_, index) => currentYear + 1 - index);
const metrics = [
  { key: "Sakit", label: "Sakit" }, { key: "Ijin", label: "Ijin" },
  { key: "Alpha", label: "Alpha" }, { key: "Lain_Lain", label: "Lain-lain" },
  { key: "Terlambat", label: "Terlambat" }, { key: "ST_Hari", label: "ST Hari" },
];
const numericColumn = (key: string, label: string): BrowseColumn => ({ key, label, type: "number", align: "right" });
const columns: BrowseColumn[] = [
  { key: "Nik", label: "NIK" },
  { key: "Nama", label: "Nama" },
  { key: "Bagian", label: "Bagian" },
  { key: "Jabatan", label: "Jabatan" },
  { key: "Tgl_Masuk", label: "Tgl Masuk", type: "date" },
  { key: "Sistem", label: "Sistem" },
  { key: "Jenis_Kelamin", label: "Jenis Kelamin" },
  { key: "Pabrik", label: "Pabrik" },
  { key: "umur_1th", label: "Masa Kerja > 1 Th" },
  ...Array.from({ length: 12 }, (_, index) => metrics.map(metric => numericColumn(`${metric.key}_${index + 1}`, `${metric.label} ${index + 1}`))).flat(),
  ...metrics.map(metric => numericColumn(`Total_${metric.key}`, `Total ${metric.label}`)),
];
</script>

<template>
  <BaseBrowse
    :key="tahun"
    class="annual-report"
    module-title="Laporan Akhir Tahun"
    module-subtitle="Karyawan aktif · bulan 1–12 = Januari–Desember · masa kerja per 31 Desember"
    endpoint="/laporan/akhir-tahun"
    :columns="columns"
    :extra-query="{ tahun }"
    primary-key="Nik"
    :show-actions="false"
    :can-delete="false"
    :per-page="50"
    :export-name="`Laporan-Akhir-Tahun-${tahun}`"
    search-placeholder="Cari NIK / nama / bagian / jabatan / pabrik..."
    compact
  >
    <template #toolbar-before-search>
      <div class="annual-year">
        <label for="annual-report-year">Tahun</label>
        <v-select
          id="annual-report-year"
          v-model="tahun"
          class="annual-year-select"
          :items="years"
          aria-label="Tahun laporan"
          density="compact"
          variant="outlined"
          menu-icon="mdi-chevron-down"
          :menu-props="{ maxHeight: 280, contentClass: 'annual-year-menu' }"
          :list-props="{ density: 'compact' }"
          hide-details
        />
      </div>
    </template>
  </BaseBrowse>
</template>

<style scoped>
/* Override compact browse's fixed column hints only for this wide report. */
.annual-report :deep(.browse-table) { width: max-content; min-width: 100% !important; table-layout: auto; }
.annual-report :deep(col) { width: auto !important; }
.annual-report :deep(.browse-table th),
.annual-report :deep(.browse-table td) { white-space: nowrap; overflow-wrap: normal; }
.annual-report :deep(th:not(.sorted) .th-sort) { display: inline-flex; }
.annual-year { display: inline-flex; align-items: center; gap: 8px; flex-shrink: 0; font-size: 12px; font-weight: 700; color: var(--ds-text); }
.annual-year-select { width: 112px; flex: 0 0 112px; --v-input-control-height: 32px; }
.annual-year-select :deep(.v-field) { border-radius: 10px; background: var(--ds-surface-raised, #fff); color: var(--ds-text, #1b2d4a); font-size: 12px; --v-field-padding-start: 12px; --v-field-padding-end: 8px; }
.annual-year-select :deep(.v-field__input) { min-height: 32px; padding-top: 0; padding-bottom: 0; }
.annual-year-select :deep(.v-field__outline) { color: var(--ds-border, #b0b8c4); --v-field-border-opacity: 1; }
.annual-year-select :deep(.v-field--focused .v-field__outline) { color: var(--ds-primary, #3b5998); }
.annual-year-select :deep(.v-field__append-inner) { padding-top: 0; align-items: center; color: var(--ds-text-secondary, #5a6a7e); }
.annual-year-select :deep(.v-field__append-inner .v-icon) { font-size: 18px; opacity: 1; }
.annual-year-select :deep(.v-select__selection) { margin: 0; font-weight: 600; }
:global(.annual-year-menu .v-list) { padding: 6px !important; border: 1px solid var(--ds-border-light, #d5dce6); border-radius: 12px !important; background: var(--ds-surface-raised, #fff) !important; color: var(--ds-text, #1b2d4a); box-shadow: 0 8px 24px rgb(27 45 74 / 12%); }
:global(.annual-year-menu .v-list-item) { min-height: 34px !important; padding: 6px 10px !important; border-radius: 7px !important; }
:global(.annual-year-menu .v-list-item-title) { font-size: 12px; font-weight: 600; }
:global(.annual-year-menu .v-list-item--active) { color: var(--ds-primary, #3b5998); font-weight: 700; }
</style>
