<script setup lang="ts">
import BaseBrowse from "@/components/BaseBrowse.vue";
import type { BrowseColumn } from "@/types";
import { firstDayOfMonth } from "@/utils/format";

/**
 * Absensi Periode — padanan `ufrmLapAbsensiPeriode`.
 *
 * Tabel kalender: kolom per karyawan aktif (NIK, nama, bagian, sistem,
 * jabatan, pabrik) + satu kolom per tanggal dalam periode berisi
 * '0' (tidak hadir), '0.5' (ijin 1/2 hari), '1' (hadir), kosong (tiada data).
 * Kolom hari dibangun dinamis lewat `columns-builder` mengikuti periode aktif.
 */
function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function hariAntara(start: string, end: string): { date: string; dd: string }[] {
  const sm = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(start || ""));
  const em = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(end || ""));
  if (!sm || !em) return [];
  const hari: { date: string; dd: string }[] = [];
  const d = new Date(Number(sm[1]), Number(sm[2]) - 1, Number(sm[3]));
  const stop = new Date(Number(em[1]), Number(em[2]) - 1, Number(em[3]));
  while (d <= stop) {
    hari.push({
      date: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
      dd: pad2(d.getDate()),
    });
    d.setDate(d.getDate() + 1);
  }
  return hari;
}

const statik: BrowseColumn[] = [
  { key: "Nik", label: "NIK", width: "110px" },
  { key: "Nama", label: "Nama Lengkap", filterable: false },
  { key: "Bagian", label: "Bagian", filterable: false },
  { key: "Status", label: "Sistem", width: "80px", filterable: false },
  { key: "Jabatan", label: "Jabatan", filterable: false },
  { key: "Pabrik", label: "Pabrik", width: "70px", filterable: false },
];

function builder(startDate: string, endDate: string): BrowseColumn[] {
  const cols: BrowseColumn[] = [...statik];
  for (const h of hariAntara(startDate, endDate)) {
    cols.push({
      key: h.dd,
      label: h.dd,
      width: "34px",
      align: "center",
      sortable: false,
      filterable: false,
    });
  }
  return cols;
}
</script>

<template>
  <BaseBrowse
    module-title="Absensi Periode"
    module-subtitle="Kalender kehadiran per hari (0 = tidak hadir, 0.5 = ½ hari, 1 = hadir)"
    endpoint="/laporan/absensi-periode"
    :columns-builder="builder"
    primary-key="Nik"
    has-period
    :default-start="firstDayOfMonth()"
    :can-delete="false"
    search-placeholder="Cari NIK / nama / bagian / pabrik..."
    :per-page="25"
  />
</template>