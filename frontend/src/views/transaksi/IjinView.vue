<script setup lang="ts">
import { useRouter } from "vue-router";
import BaseBrowse from "@/components/BaseBrowse.vue";
import MsIcon from "@/components/MsIcon.vue";
import { useTabsStore } from "@/stores/tabsStore";
import type { BrowseColumn } from "@/types";
import { firstDayOfMonth } from "@/utils/format";

/**
 * Browse Ijin — padanan `ufrmBrowseIjin`.
 *
 * Kolom mengikuti `btnRefreshClick`: Nomor, Tanggal, Jenis_Ijin, Nik, Nama,
 * Pabrik, Bagian (jab_nama + kar_bagian), Awal, Akhir, Alasan, Keterangan,
 * SistemGaji. Hapus memakai kunci Nomor (BaseBrowse standar).
 *
 * Tombol "Kolektif (V2)" di toolbar = cxButton5 Delphi yang membuka
 * `ufrmIjin2` (input ijin multi-NIK). Hak akses form V2 tetap `frmIjin2`.
 */
const router = useRouter();
const tabsStore = useTabsStore();

const columns: BrowseColumn[] = [
  { key: "Nomor", label: "Nomor", width: "130px" },
  { key: "Tanggal", label: "Tanggal", type: "date", width: "95px" },
  { key: "Jenis_Ijin", label: "Jenis Ijin", width: "150px" },
  { key: "Nik", label: "NIK", width: "110px" },
  { key: "Nama", label: "Nama Lengkap" },
  { key: "Pabrik", label: "Pabrik", width: "80px" },
  { key: "Bagian", label: "Jabatan / Bagian" },
  { key: "Awal", label: "Jam Awal", width: "85px", align: "center" },
  { key: "Akhir", label: "Jam Akhir", width: "85px", align: "center" },
  { key: "Alasan", label: "Alasan" },
  { key: "Keterangan", label: "Keterangan", width: "95px" },
  { key: "SistemGaji", label: "Sistem", width: "80px" },
];

function bukaKolektif() {
  const path = "/transaksi/ijin-v2/form";
  tabsStore.openTab({
    title: "Tambah Ijin Kolektif",
    path,
    icon: "mdi mdi-plus-box-outline",
    closable: true,
  });
  router.push(path);
}
</script>

<template>
  <BaseBrowse
    module-title="Ijin"
    module-subtitle="Daftar surat ijin / tidak masuk karyawan per periode"
    endpoint="/transaksi/ijin"
    :columns="columns"
    primary-key="Nomor"
    has-period
    :default-start="firstDayOfMonth()"
    add-form-path="/transaksi/ijin/form"
    edit-form-path="/transaksi/ijin/form"
    search-placeholder="Cari nomor / NIK / nama / alasan..."
    :per-page="50"
  >
    <template #toolbar-extra>
      <button class="tool-btn kolektif" title="Input ijin banyak karyawan sekaligus (Ijin V2)" @click="bukaKolektif">
        <MsIcon name="group_add" :size="15" />
        <span>Kolektif (V2)</span>
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
.tool-btn.kolektif {
  background: #fff;
  color: var(--ds-on-surface, #1b2d4a);
}
.tool-btn.kolektif:hover {
  background: var(--ds-surface-variant, #e0e4ea);
}
</style>
