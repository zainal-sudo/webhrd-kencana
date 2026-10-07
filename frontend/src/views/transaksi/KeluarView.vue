<script setup lang="ts">
import BaseBrowse from "@/components/BaseBrowse.vue";
import { useAuthStore } from "@/stores/authStore";
import { firstDayOfMonth } from "@/utils/format";
import type { BrowseColumn } from "@/types";

const auth = useAuthStore();
const columns: BrowseColumn[] = [
  { key: "Nomor", label: "Nomor", width: "145px" },
  { key: "Tanggal", label: "Tanggal", type: "date", width: "100px" },
  { key: "Alasan", label: "Alasan", width: "190px" },
  { key: "Keterangan", label: "Keterangan", width: "240px" },
  { key: "Nik", label: "NIK", width: "120px" },
  { key: "Nama", label: "Nama Lengkap", width: "220px" },
  { key: "Pabrik", label: "Pabrik", width: "85px" },
  { key: "Jabatan", label: "Jabatan", width: "150px" },
  { key: "Bagian", label: "Bagian", width: "150px" },
  { key: "Status", label: "Status", width: "100px" },
];
</script>

<template>
  <BaseBrowse
    module-title="Karyawan Keluar"
    module-subtitle="Dokumen karyawan keluar per periode"
    endpoint="/transaksi/keluar"
    :columns="columns"
    primary-key="Nomor"
    has-period
    refresh-on-activate
    :default-start="firstDayOfMonth()"
    :add-form-path="auth.can('frmKeluar', 'insert') ? '/transaksi/keluar/form' : undefined"
    :edit-form-path="auth.can('frmKeluar', 'edit') ? '/transaksi/keluar/form' : undefined"
    :can-delete="auth.can('frmKeluar', 'delete')"
    search-placeholder="Cari nomor / NIK / nama / alasan / keterangan..."
    :per-page="50"
  />
</template>
