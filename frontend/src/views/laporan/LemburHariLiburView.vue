<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import BaseBrowse from "@/components/BaseBrowse.vue";
import MsIcon from "@/components/MsIcon.vue";
import { api, getErrorMessage } from "@/api/axios";
import { useTabsStore } from "@/stores/tabsStore";
import { reportRowKey } from "@/utils/reportRowKey";
import { firstDayOfMonth } from "@/utils/format";
import type { BrowseColumn } from "@/types";

/**
 * Laporan Lembur Hari Libur — padanan `ufrmLapLemburHarilibur`.
 *
 * Tanggal mengikuti Master Hari Libur (tharilibur), hanya absensi yang
 * memiliki scan. Lama = Scan 2 − Scan 1 (lintas-malam); Lama Lembur =
 * Jam Selesai − Jam Mulai SPL (lintas-malam). No Ijin dari `tijin`
 * (ij_ji_id = 2), Verifikasi dari `tabsensi`.
 *
 * Aksi baris (popup di Delphi): Verifikasi, Batal Verifikasi
 * (`UPDATE tabsensi SET verifikasi`), dan Edit Absensi (form Absensi
 * dengan kode absensi + tanggal). Baris terverifikasi ditandai seperti
 * gaya fuchsia di Delphi.
 */
const router = useRouter();
const tabsStore = useTabsStore();
const toast = useToast();
const browseRef = ref<InstanceType<typeof BaseBrowse> | null>(null);
const busyKey = ref<string | null>(null);

const columns: BrowseColumn[] = [
  { key: "Tanggal", label: "Tanggal", type: "date", width: "100px" },
  { key: "Kar_Nik", label: "NIK", width: "115px" },
  { key: "Nama", label: "Nama", width: "220px" },
  { key: "Pabrik", label: "Pabrik", width: "80px" },
  { key: "Bagian", label: "Bagian", width: "170px" },
  { key: "Sistem", label: "Sistem", width: "90px" },
  { key: "scan1", label: "Scan 1", width: "90px", align: "center" },
  { key: "scan2", label: "Scan 2", width: "90px", align: "center" },
  { key: "lama", label: "Lama", width: "90px", align: "center" },
  { key: "jam_mulai", label: "Jam Mulai", width: "100px", align: "center" },
  { key: "jam_selesai", label: "Jam Selesai", width: "100px", align: "center" },
  { key: "lama_lembur", label: "Lama Lembur", width: "105px", align: "center" },
  { key: "no_ijin", label: "No Ijin", width: "100px" },
  { key: "verifikasi", label: "Verifikasi", width: "90px", align: "center" },
];

function isVerified(row: Record<string, any>): boolean {
  return String(row.verifikasi ?? "").trim() === "1";
}

function barisVerifikasi(row: Record<string, any>): string {
  return isVerified(row) ? "row-verified" : "";
}

function rowIdentity(row: Record<string, any>): string {
  return `${String(row.nik ?? "")}|${String(row.Tanggal || "").slice(0, 10)}`;
}

async function setVerifikasi(row: Record<string, any>, nilai: 0 | 1) {
  const key = rowIdentity(row);
  busyKey.value = `${key}|${nilai}`;
  try {
    await api.post("/laporan/lembur-hari-libur/verifikasi", {
      nik: String(row.nik ?? ""),
      tanggal: String(row.Tanggal || "").slice(0, 10),
      verifikasi: nilai,
    });
    toast.success(nilai === 1 ? "Absensi diverifikasi" : "Verifikasi dibatalkan");
    browseRef.value?.refresh();
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal menyimpan verifikasi"));
  } finally {
    busyKey.value = null;
  }
}

function editAbsensi(row: Record<string, any>) {
  const query = {
    nik: String(row.nik ?? ""),
    tanggal: String(row.Tanggal || "").slice(0, 10),
  };
  tabsStore.openTab({
    title: `Absensi ${query.nik}`,
    path: "/absensi/form",
    query,
    icon: "mdi mdi-open-in-new",
    closable: true,
  });
  router.push({ path: "/absensi/form", query });
}
</script>

<template>
  <div class="report-page">
    <p class="report-note">Tanggal mengikuti Master Hari Libur (tharilibur), hanya absensi yang memiliki scan. Lama = Scan 2 − Scan 1; Lama Lembur = Jam Selesai − Jam Mulai SPL. Baris ungu = sudah verifikasi.</p>
    <BaseBrowse
      ref="browseRef"
      module-title="Laporan Lembur Hari Libur"
      module-subtitle="Absensi pada tanggal Master Hari Libur, dengan SPL berdasarkan NIK dan tanggal"
      endpoint="/laporan/lembur-hari-libur"
      :columns="columns"
      primary-key="_key"
      :row-key="reportRowKey"
      :row-class="barisVerifikasi"
      has-period
      :default-start="firstDayOfMonth()"
      :can-delete="false"
      search-placeholder="Cari NIK / nama / pabrik / bagian..."
      :per-page="50"
    >
      <template #cell="{ row, column, text }">
        <span
          v-if="column.key === 'verifikasi'"
          :class="['verif-badge', isVerified(row) ? 'ya' : 'belum']"
        >{{ isVerified(row) ? "Sudah" : "–" }}</span>
        <template v-else>{{ text }}</template>
      </template>
      <template #row-actions="{ row }">
        <button
          class="row-btn verify"
          title="Verifikasi"
          :disabled="busyKey === `${rowIdentity(row)}|1` || isVerified(row)"
          @click="setVerifikasi(row, 1)"
        >
          <MsIcon name="check_circle" :size="14" />
        </button>
        <button
          class="row-btn unverify"
          title="Batal verifikasi"
          :disabled="busyKey === `${rowIdentity(row)}|0` || !isVerified(row)"
          @click="setVerifikasi(row, 0)"
        >
          <MsIcon name="cancel" :size="14" />
        </button>
        <button class="row-btn edit" title="Edit absensi" @click="editAbsensi(row)">
          <MsIcon name="edit" :size="14" />
        </button>
      </template>
    </BaseBrowse>
  </div>
</template>

<style scoped>
.report-page { height: 100%; min-height: 0; display: flex; flex-direction: column; }
.report-page :deep(.browse-panel) { flex: 1; height: auto; min-height: 0; }
.report-note { flex-shrink: 0; }
.report-note { margin: 0 0 8px; padding: 8px 12px; border: 1px solid var(--ds-border, #b0b8c4); background: #fffbeb; font-size: 12px; color: #854d0e; }
.row-btn.verify { color: #15803d; }
.row-btn.verify:hover { background: rgba(21, 128, 61, 0.12); }
.row-btn.verify:disabled { opacity: 0.35; cursor: not-allowed; }
.row-btn.unverify { color: #b45309; }
.row-btn.unverify:hover { background: rgba(180, 83, 9, 0.12); }
.row-btn.unverify:disabled { opacity: 0.35; cursor: not-allowed; }
.row-btn.edit { color: var(--ds-primary, #3b5998); }
.verif-badge { display: inline-block; padding: 1px 8px; font-size: 11px; font-weight: 700; border: 1px solid transparent; }
.verif-badge.ya { color: #86198f; background: #fae8ff; border-color: #e9a8f2; }
.verif-badge.belum { color: #9aa7b8; }
.report-page :deep(tbody tr.row-verified) { background: #fae8ff !important; }
.report-page :deep(tbody tr.row-verified:hover) { background: #f5d0fe !important; }
.report-page :deep(tbody tr.row-verified td.action-col) { background: #fae8ff; }
</style>
