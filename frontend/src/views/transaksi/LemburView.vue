<script setup lang="ts">
import { useRouter } from "vue-router";
import BaseBrowse from "@/components/BaseBrowse.vue";
import MsIcon from "@/components/MsIcon.vue";
import { useTabsStore } from "@/stores/tabsStore";
import type { BrowseColumn } from "@/types";
import { firstDayOfMonth } from "@/utils/format";

/**
 * Browse Lembur — padanan `ufrmBrowseLembur` (master SPL per periode).
 * Detail per SPL dibuka lewat form edit (GET /transaksi/lembur/form).
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
  tabsStore.openTab({
    title: "Tambah Lembur Per NIK",
    path,
    icon: "mdi mdi-plus-box-outline",
    closable: true,
  });
  router.push(path);
}
</script>

<template>
  <BaseBrowse
    module-title="Lembur"
    module-subtitle="Surat perintah lembur (SPL) per tanggal dan bagian"
    endpoint="/transaksi/lembur"
    :columns="columns"
    primary-key="Nomor"
    has-period
    :default-start="firstDayOfMonth()"
    add-form-path="/transaksi/lembur/form"
    edit-form-path="/transaksi/lembur/form"
    search-placeholder="Cari nomor SPL / bagian / jenis kerja..."
    :per-page="50"
  >
    <template #toolbar-extra>
      <button class="tool-btn pernik" title="Lembur satu karyawan untuk banyak tanggal (Lembur V2)" @click="bukaPerNik">
        <MsIcon name="person_add" :size="15" />
        <span>Per NIK (V2)</span>
      </button>
    </template>
  </BaseBrowse>
</template>

<style scoped>
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
  border-radius: 0;
}
.tool-btn.pernik {
  background: #fff;
  color: var(--ds-on-surface, #1b2d4a);
}
.tool-btn.pernik:hover {
  background: var(--ds-surface-variant, #e0e4ea);
}
</style>
