<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { api, getErrorMessage } from "@/api/axios";
import MsIcon from "@/components/MsIcon.vue";
import PeriodeMouDialog, { type PeriodeSumber } from "@/components/PeriodeMouDialog.vue";
import { formatTanggal } from "@/utils/format";

/**
 * Daftar riwayat periode satu MoU (satu grup `mou_grup`).
 * Ditampilkan di baris expand Master MoU Sewa: baris terlama dulu,
 * periode yang sedang dibuka diberi tanda. Bila `sumber` (data baris yang
 * di-expand) diberikan, tampil tombol "Tambah Periode" yang membuka dialog
 * "Periode MoU Baru" sama persis dengan fitur Eksekusi di Dashboard.
 */
const props = defineProps<{
  mouId: string | number;
  /** Data baris yang di-expand — sumber periode baru (opsional). */
  sumber?: PeriodeSumber | null;
  /** Boleh menambah periode baru (hak insert frmMouSewa). */
  canTambah?: boolean;
}>();

const emit = defineEmits<{ "periode-ditambah": [] }>();

interface MouPeriode {
  Id: number | string;
  "No Surat": string;
  Tempat: string;
  Alamat: string | null;
  "Awal Mulai": string | null;
  Berakhir: string | null;
  Status: string;
  "Dibuat Oleh": string | null;
}

const rows = ref<MouPeriode[]>([]);
const loading = ref(true);
const gagal = ref("");

/* Filter status sederhana (client-side): Semua / Berjalan / Belum Mulai / Berakhir / Riwayat / Selesai. */
const filterStatus = ref("");
const tampil = computed(() =>
  filterStatus.value ? rows.value.filter((r) => r.Status === filterStatus.value) : rows.value
);

/* ── Tambah periode: dialog sama persis dengan fitur Eksekusi ─────────── */
const dialogPeriode = ref(false);

async function muatUlang() {
  try {
    const { data } = await api.get(`/master/mou-sewa/${encodeURIComponent(props.mouId)}/riwayat`);
    rows.value = Array.isArray(data?.data) ? data.data : [];
  } catch (err) {
    gagal.value = getErrorMessage(err, "Gagal memuat riwayat periode.");
  } finally {
    loading.value = false;
  }
}

/** Periode baru tersimpan: muat ulang riwayat + beri tahu Master agar
 *  daftar utama ikut segar (jumlah periode & status baris sumber). */
async function onPeriodeDitambah() {
  dialogPeriode.value = false;
  await muatUlang();
  emit("periode-ditambah");
}

/* Kelas warna badge status (sama dengan Master MoU Sewa). */
const statusClass = (s: string) =>
  s === "Berjalan"
    ? "st-berjalan"
    : s === "Belum Mulai"
      ? "st-belum"
      : s === "Berakhir"
        ? "st-berakhir"
        : s === "Riwayat"
          ? "st-riwayat"
          : s === "Selesai"
            ? "st-selesai"
            : "";

onMounted(muatUlang);
</script>

<template>
  <div class="riwayat">
    <div class="riwayat-judul">
      <MsIcon name="history" :size="14" /> Riwayat periode MoU tempat ini
      <button
        v-if="canTambah && sumber"
        type="button"
        class="tambah-periode-btn"
        title="Buat periode MoU baru untuk tempat ini (riwayat lama tetap tersimpan)"
        @click="dialogPeriode = true"
      >
        <MsIcon name="autorenew" :size="13" /> Tambah Periode
      </button>
      <select v-model="filterStatus" class="filter-status" aria-label="Filter status periode">
        <option value="">Semua Status</option>
        <option value="Berjalan">Berjalan</option>
        <option value="Belum Mulai">Belum Mulai</option>
        <option value="Berakhir">Berakhir</option>
        <option value="Riwayat">Riwayat</option>
        <option value="Selesai">Selesai</option>
      </select>
    </div>
    <div v-if="loading" class="riwayat-keadaan"><MsIcon name="hourglass_top" :size="14" /> Memuat riwayat...</div>
    <div v-else-if="gagal" class="riwayat-keadaan err"><MsIcon name="error" :size="14" /> {{ gagal }}</div>
    <table v-else class="riwayat-tbl">
      <thead>
        <tr>
          <th class="num">No</th>
          <th>Nomor Surat</th>
          <th>Alamat</th>
          <th>Awal Mulai</th>
          <th>Berakhir</th>
          <th class="col-status">Status</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="tampil.length === 0">
          <td colspan="6" class="empty">
            {{ rows.length === 0 ? "Belum ada riwayat." : "Tidak ada periode dengan status ini." }}
          </td>
        </tr>
        <tr v-for="(r, i) in tampil" :key="r.Id" :class="{ 'baris-aktif': String(r.Id) === String(mouId) }">
          <td class="num">{{ i + 1 }}</td>
          <td>
            <span class="no-surat">{{ r["No Surat"] || "-" }}</span>
            <span v-if="String(r.Id) === String(mouId)" class="tag-aktif">baris ini</span>
          </td>
          <td class="alamat">{{ r.Alamat || "-" }}</td>
          <td>{{ r["Awal Mulai"] ? formatTanggal(r["Awal Mulai"]) : "-" }}</td>
          <td>{{ r.Berakhir ? formatTanggal(r.Berakhir) : "-" }}</td>
          <td class="col-status">
            <span class="status-wrap">
              <span class="badge-status" :class="statusClass(r.Status)">{{ r.Status || "-" }}</span>
              <!-- Keterangan penanda masih menunggu tindakan HR. -->
              <small v-if="r.Status === 'Berakhir'" class="status-ket">belum ditangani</small>
            </span>
          </td>
        </tr>
      </tbody>
    </table>
    <!-- Dialog "Periode MoU Baru" — komponen bersama (sama dengan Eksekusi). -->
    <PeriodeMouDialog :sumber="dialogPeriode ? sumber ?? null : null" @close="dialogPeriode = false" @saved="onPeriodeDitambah" />
  </div>
</template>

<style scoped>
.riwayat {
  padding: 4px 8px 8px;
  font-size: 11.5px;
}
.riwayat-judul {
  display: flex;
  align-items: center;
  gap: 5px;
  font-weight: 700;
  color: #12224e;
  margin-bottom: 6px;
}
.filter-status {
  margin-left: auto;
  padding: 2px 6px;
  border: 1px solid var(--ds-border, #dbe2ee);
  border-radius: 6px;
  background: var(--ds-surface-raised, #fff);
  color: var(--ds-text, #1b2d4a);
  font: inherit;
  font-size: 10.5px;
  font-weight: 600;
  cursor: pointer;
}
.filter-status:focus-visible { outline: 2px solid var(--ds-primary, #3b5998); outline-offset: 1px; }
/* Tombol "Tambah Periode" — dialog sama dengan Eksekusi di Dashboard. */
.tambah-periode-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  padding: 3px 10px;
  border: 1px solid #88cda8;
  border-radius: 999px;
  background: #f2fbf6;
  color: #148a4b;
  font: inherit;
  font-size: 10.5px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}
.tambah-periode-btn:hover { background: #15803d; border-color: #15803d; color: #fff; }
.tambah-periode-btn:focus-visible { outline: 2px solid #15803d; outline-offset: 1px; }
.tambah-periode-btn + .filter-status { margin-left: 0; }
.col-status { width: 92px; text-align: center; white-space: nowrap; }
.badge-status {
  display: inline-block;
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
}
.st-berjalan { background: #e6f7ee; color: #15803d; border: 1px solid #b7e4c9; }
.st-belum { background: #fef9c3; color: #a16207; border: 1px solid #fde68a; }
.st-berakhir { background: #ffedd5; color: #c2410c; border: 1px solid #fdba74; }
.st-riwayat { background: #f1f5f9; color: #64748b; border: 1px solid #dbe2ee; }
.st-selesai { background: #fdecec; color: #b91c1c; border: 1px solid #f5c6c6; }
/* Bungkus badge + keterangan "belum ditangani" di bawahnya. */
.status-wrap { display: inline-flex; flex-direction: column; align-items: center; gap: 2px; }
.status-ket { font-size: 9px; font-weight: 600; color: #c2410c; white-space: nowrap; }
.riwayat-keadaan {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 0;
  color: #059669;
}
.riwayat-keadaan.err { color: #b91c1c; }
.riwayat-tbl {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid var(--ds-border, #dbe2ee);
}
.riwayat-tbl th {
  background: var(--ds-primary-50, #e8edf5);
  color: #1b2d4a;
  text-align: left;
  padding: 5px 9px;
  font-size: 10.5px;
  white-space: nowrap;
}
.riwayat-tbl td {
  padding: 5px 9px;
  border-top: 1px solid var(--ds-border, #e6eaf2);
  color: var(--ds-text, #1b2d4a);
}
.riwayat-tbl th.num,
.riwayat-tbl td.num { width: 34px; text-align: center; color: var(--ds-text-secondary, #5a6a7e); }
.riwayat-tbl td.empty { text-align: center; color: var(--ds-text-secondary, #5a6a7e); padding: 10px; }
.no-surat { font-weight: 600; }
.tag-aktif {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--ds-primary-100, #c5d0e6);
  color: #12224e;
  font-size: 9px;
  font-weight: 700;
}
.alamat { color: var(--ds-text-secondary, #5a6a7e); }
.baris-aktif td { background: var(--ds-primary-50, #eef3fa); }
</style>
