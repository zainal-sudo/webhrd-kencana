<script setup lang="ts">
import { useRouter } from "vue-router";
import BaseBrowse from "@/components/BaseBrowse.vue";
import { reportRowKey } from "@/utils/reportRowKey";
import MsIcon from "@/components/MsIcon.vue";
import { useTabsStore } from "@/stores/tabsStore";
import type { BrowseColumn } from "@/types";
import { firstDayOfMonth } from "@/utils/format";

/**
 * Detail Lembur — padanan `ufrmLapDetailLembur`.
 *
 * Per NIK + tanggal: `2jam` (2 jam pertama, dikapas sesuai sistem gaji),
 * `Lebih2Jam` (Lembur - 2jam), `Panggilan`, `Lembur` total, jenis kerja.
 * Aksi baris: Edit Absensi (prefill kode + tanggal) seperti Delphi.
 */
const router = useRouter();
const tabsStore = useTabsStore();

const decimalColumns = new Set(["2jam", "Lebih2Jam", "Panggilan", "Lembur"]);

function formatJam(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(1) : String(value);
}

const columns: BrowseColumn[] = [
  { key: "Tanggal", label: "Tanggal", type: "date", width: "95px" },
  { key: "Nik", label: "NIK", width: "110px" },
  { key: "Nama", label: "Nama Lengkap" },
  { key: "Pabrik", label: "Pabrik", width: "80px" },
  { key: "Bagian", label: "Bagian" },
  { key: "2jam", label: "2 Jam Pertama", width: "100px", align: "right" },
  { key: "Lebih2Jam", label: "Lebih 2 Jam", width: "100px", align: "right" },
  { key: "Panggilan", label: "Panggilan", width: "90px", align: "right" },
  { key: "Lembur", label: "Total Lembur", width: "100px", align: "right" },
  { key: "Jenis_Kerja", label: "Jenis Kerja" },
];

function editAbsensi(row: Record<string, any>) {
  tabsStore.stageTab({
    title: `Absensi ${row.Kode}`,
    path: "/absensi/form",
    query: {
      nik: String(row.Kode ?? ""),
      tanggal: String(row.Tanggal || "").slice(0, 10),
    },
    icon: "mdi mdi-open-in-new",
    closable: true,
  });
  router.push({
    path: "/absensi/form",
    query: {
      nik: String(row.Kode ?? ""),
      tanggal: String(row.Tanggal || "").slice(0, 10),
    },
  });
}

/** Buka laporan indikasi lembur double (NIK + tanggal sama di ≥2 nomor SPL). */
function bukaDouble() {
  tabsStore.stageTab({
    title: "Detail Lembur Double",
    path: "/laporan/lembur-double",
    icon: "mdi mdi-content-copy",
    closable: true,
  });
  router.push("/laporan/lembur-double");
}
</script>

<template>
  <BaseBrowse
    class="expanded-action-hover"
    module-title="Detail Lembur"
    module-subtitle="Rincian 2 jam pertama, lebih, panggilan & total lembur per karyawan"
    endpoint="/laporan/detail-lembur"
    :columns="columns"
    primary-key="Nik"
    :row-key="reportRowKey"
    has-period
    :default-start="firstDayOfMonth()"
    :can-delete="false"
    search-placeholder="Cari NIK / nama / bagian / pabrik..."
    :per-page="50"
  >
    <template #toolbar-extra>
      <button type="button" class="double-btn" title="NIK + tanggal sama di 2 nomor transaksi" @click="bukaDouble">
        <MsIcon name="content_copy" :size="14" />
        <span>Indikasi Double</span>
      </button>
    </template>
    <template #cell="{ row, column, text }">
      {{ decimalColumns.has(column.key) ? formatJam(row[column.key]) : text }}
    </template>
    <template #row-actions="{ row }">
      <button class="row-btn edit" title="Edit absensi" @click="editAbsensi(row)">
        <MsIcon name="edit" :size="14" />
      </button>
    </template>
  </BaseBrowse>
</template>

<style scoped>
.row-btn.edit { color: var(--ds-primary, #3b5998); }
.double-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  border: 1px solid var(--ds-border, #dbe2ee);
  border-radius: 8px;
  background: #fff;
  color: #1b2d4a;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.double-btn:hover {
  background: #f3f6fb;
}
.double-btn span { white-space: nowrap; }
</style>
