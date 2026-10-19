<script setup lang="ts">
import { ref } from "vue";
import BaseBrowse from "@/components/BaseBrowse.vue";
import type { BrowseColumn } from "@/types";
import { firstDayOfMonth } from "@/utils/format";

/**
 * Rekap Absensi — padanan `ufrmLapAbsensi`.
 *
 * Ringkasan per karyawan: hari hadir, lembur (2 jam pertama / lebih /
 * panggilan / total), bonus, terlambat, dan hitungan ijin
 * (setengah hari, sakit, ijin, alpha, lain-lain) + total.
 * Checkbox "Rincian tanggal" = checkbox Delphi yang mengisi kolom Ket*
 * (daftar tanggal dd-Mon per kategori) untuk halaman aktif.
 */
const tampilRinci = ref(false);
const versi = ref(0);

const base: BrowseColumn[] = [
  { key: "Nik", label: "NIK", width: "110px" },
  { key: "Nama", label: "Nama Lengkap" },
  { key: "Pabrik", label: "Pabrik", width: "80px" },
  { key: "Departemen", label: "Departemen" },
  { key: "Jabatan", label: "Jabatan" },
  { key: "Bagian", label: "Bagian" },
  { key: "Sistem", label: "Sistem", width: "80px" },
  { key: "Total_Hari", label: "Total Hari", width: "80px", align: "center", type: "number" },
  { key: "2_Jam_Pertama", label: "2 Jam Pertama", width: "95px", align: "center", type: "number" },
  { key: "Lebih dari 2 Jam", label: "Lebih dari 2 Jam", width: "110px", align: "center", type: "number" },
  { key: "Panggilan", label: "Panggilan", width: "85px", align: "center", type: "number" },
  { key: "TotalLembur", label: "Total Lembur", width: "95px", align: "center", type: "number" },
  { key: "Bonus_Malam_Libur", label: "Bonus Malam Libur", width: "110px", align: "center", type: "number" },
  { key: "Bonus_Libur", label: "Bonus Libur", width: "90px", align: "center", type: "number" },
  { key: "terlambat", label: "Terlambat", width: "80px", align: "center", type: "number" },
  { key: "ST_HARI", label: "½ Hari", width: "60px", align: "center", type: "number" },
  { key: "sakit", label: "Sakit", width: "60px", align: "center", type: "number" },
  { key: "Ijin", label: "Ijin", width: "60px", align: "center", type: "number" },
  { key: "Alpha", label: "Alpha", width: "60px", align: "center", type: "number" },
  { key: "LainLain", label: "Lain2", width: "60px", align: "center", type: "number" },
  { key: "Total", label: "Total", width: "80px", align: "center", type: "number" },
];

const rinci: BrowseColumn[] = [
  { key: "Adaform", label: "Terlambat Ada Form" },
  { key: "Tanpaform", label: "Terlambat Tanpa Form" },
  { key: "KetSetengahaHari", label: "Ket ½ Hari" },
  { key: "KetSakit", label: "Ket Sakit" },
  { key: "KetIjin", label: "Ket Ijin" },
  { key: "KetAlpha", label: "Ket Alpha" },
  { key: "KetLainLain", label: "Ket Lain-lain" },
];

const columns: BrowseColumn[] = [...base, ...rinci];
const columnsPolos: BrowseColumn[] = base;

function toggleRinci() {
  tampilRinci.value = !tampilRinci.value;
  versi.value += 1;
}
</script>

<template>
  <BaseBrowse
    :key="versi"
    module-title="Laporan Absensi"
    module-subtitle="Rekap kehadiran, lembur, bonus & ijin per karyawan"
    endpoint="/laporan/absensi"
    :columns="tampilRinci ? columns : columnsPolos"
    :extra-query="tampilRinci ? { detail: 1 } : {}"
    primary-key="Nik"
    has-period
    :default-start="firstDayOfMonth()"
    :can-delete="false"
    :show-actions="false"
    search-placeholder="Cari NIK / nama / bagian / pabrik..."
    :per-page="25"
  >
    <template #toolbar-extra>
      <label class="rinci-toggle" title="Isi kolom rincian tanggal (seperti checkbox Delphi)">
        <input type="checkbox" :checked="tampilRinci" @change="toggleRinci" />
        Rincian tanggal
      </label>
    </template>
  </BaseBrowse>
</template>

<style scoped>
.rinci-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--ds-border, #b0b8c4);
  background: #fff;
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: 11px;
  font-weight: 700;
  color: var(--ds-on-surface, #1b2d4a);
  cursor: pointer;
  user-select: none;
}
</style>
