<script setup lang="ts">
import { useRouter } from "vue-router";
import BaseBrowse from "@/components/BaseBrowse.vue";
import LemburDetail from "@/components/LemburDetail.vue";
import MsIcon from "@/components/MsIcon.vue";
import { useTabsStore } from "@/stores/tabsStore";
import type { BrowseColumn } from "@/types";
import { firstDayOfMonth } from "@/utils/format";

/**
 * Browse Lembur — padanan `ufrmBrowseLembur` (master SPL per periode).
 * Detail per SPL tersedia di panel baca saja di bawah baris browse.
 *
 * Tombol "Per NIK (V2)" di toolbar = cxButton5 Delphi yang membuka
 * `ufrmLembur2` (satu NIK untuk banyak tanggal). Hak form V2: `frmLembur2`.
 */
const router = useRouter();
const tabsStore = useTabsStore();

const columns: BrowseColumn[] = [
  { key: "Nomor", label: "Nomor SPL", width: "140px" },
  { key: "Tanggal", label: "Tanggal", type: "date", width: "95px" },
  { key: "Pabrik", label: "Pabrik", width: "90px" },
  { key: "Bagian", label: "Bagian" },
  { key: "JenisKerja", label: "Jenis Kerja" },
];

function bukaPerNik() {
  const path = "/transaksi/lembur-v2/form";
  tabsStore.stageTab({
    title: "Tambah Lembur Per NIK",
    path,
    icon: "mdi mdi-plus-box-outline",
    closable: true,
  });
  router.push(path);
}
</script>

<template>
  <BaseBrowse class="standard-actions lembur-browse"
    module-title="Lembur"
    module-subtitle="Surat perintah lembur (SPL)"
    endpoint="/transaksi/lembur"
    :extra-query="{ include_detail: '1' }"
    :columns="columns"
    primary-key="Nomor"
    expandable
    animate-expansion
    expand-label="Detail SPL"
    has-period
    :default-start="firstDayOfMonth()"
    add-form-path="/transaksi/lembur/form"
    edit-form-path="/transaksi/lembur/form"
    search-placeholder="Cari nomor SPL / bagian / jenis kerja..."
    :per-page="50"
  >
    <template #expanded-row="{ row }">
      <LemburDetail :nomor="row.Nomor" :preloaded="row.Detail" />
    </template>
    <template #toolbar-extra>
      <button class="tool-btn pernik" title="Lembur satu karyawan untuk banyak tanggal (Lembur V2)" @click="bukaPerNik">
        <MsIcon name="person_add" :size="15" />
        <span>Per NIK (V2)</span>
      </button>
    </template>
  </BaseBrowse>
</template>

<style scoped>
.lembur-browse :deep(.expanded-content) { max-width: none; min-width: 0; }
.lembur-browse { --spl-expanded-bg: #eef7fd; }
:root[data-theme="dark"] .lembur-browse { --spl-expanded-bg: color-mix(in srgb, var(--ds-primary-50) 45%, var(--ds-surface-raised)); }
:root .lembur-browse :deep(.browse-table > tbody > tr.expanded-row > td) { background: var(--spl-expanded-bg) !important; }
/* Stripe by the data index (.odd), not the number of inserted detail rows. */
.lembur-browse :deep(.browse-table > tbody > tr) { --spl-row-background: var(--ds-surface-raised, #fff); }
.lembur-browse :deep(.browse-table > tbody > tr.odd) { --spl-row-background: var(--ds-row-alt, #eef1f6); }
:root .lembur-browse :deep(.browse-table > tbody > tr:not(.expanded-row) > td) { background: var(--spl-row-background) !important; }
:root .lembur-browse :deep(.browse-table > tbody > tr:not(.expanded-row):hover > td) { background: var(--ds-row-hover, #dbe4f3) !important; }
.tool-btn {
  height: 28px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  border: 1px solid var(--ds-border, #b0b8c4);
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  border-radius: 8px;
}
.tool-btn.pernik {
  background: #fff;
  color: var(--ds-on-surface, #1b2d4a);
}
.tool-btn.pernik:hover {
  background: var(--ds-surface-variant, #e0e4ea);
}
</style>
