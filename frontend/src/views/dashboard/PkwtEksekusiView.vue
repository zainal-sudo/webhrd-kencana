<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { pickError, safeGet } from "@/api";
import { useToast } from "vue-toastification";
import MsIcon from "@/components/MsIcon.vue";
import ColumnFilterPopup from "@/components/ColumnFilterPopup.vue";
import { filterKey } from "@/utils/columnFilter";
import {
  formatTglBerakhir,
  kirimWa,
  sisaHariTeks,
  type EksekusiRow,
} from "@/utils/pkwtWa";
import { kategoriPkwt, statusPkwt } from "@/utils/pkwtMonitoring";

const rows = ref<EksekusiRow[]>([]);
const loading = ref(false);
const gagal = ref("");
const cari = ref("");
const searchInput = ref<HTMLInputElement | null>(null);

function jalankanPencarian() {
  cari.value = cari.value.trim();
  searchInput.value?.focus();
}
const statusAktif = ref<ReturnType<typeof kategoriPkwt> | null>(null);
const filterColumns = [
  { key: "karyawan", label: "Karyawan", className: "col-karyawan" },
  { key: "kontrak", label: "Kontrak", className: "col-kontrak" },
  { key: "status", label: "Status", className: "col-rok" },
] as const;
type FilterColumn = typeof filterColumns[number]["key"];
const columnFilters = ref<Record<FilterColumn, string[]>>({ karyawan: [], kontrak: [], status: [] });
const openFilter = ref<FilterColumn | null>(null);
const filterAnchor = ref<HTMLElement | null>(null);
const hasColumnFilters = computed(() => filterColumns.some(({ key }) => columnFilters.value[key].length > 0));

function columnValue(row: EksekusiRow, key: FilterColumn): string {
  if (key === "karyawan") return `${row.Nama} · ${row.Nik} · ${row.Jabatan || "-"} · ${row.Bagian || "-"}`;
  if (key === "kontrak") return `${row.Status_PKWT || "-"} · ${row.Pabrik || "-"} · Berakhir ${formatTglBerakhir(row.Tgl_Berakhir)}`;
  return `${sisaHariTeks(row.Sisa_Hari)} ${Number(row.Sisa_Hari) > 0 ? "hari lagi" : "hari"} · ${labelStatus(row.Sisa_Hari)}`;
}

async function columnValues(key: FilterColumn): Promise<string[]> {
  return [...new Set(rows.value.map((row) => columnValue(row, key)))].sort((a, b) => a.localeCompare(b, "id", { numeric: true }));
}

function toggleColumnFilter(key: FilterColumn, event: MouseEvent) {
  filterAnchor.value = event.currentTarget as HTMLElement;
  openFilter.value = openFilter.value === key ? null : key;
}

function applyColumnFilter(key: FilterColumn, values: string[]) {
  columnFilters.value[key] = values;
  openFilter.value = null;
}

function resetFilters() {
  statusAktif.value = null;
  columnFilters.value = { karyawan: [], kontrak: [], status: [] };
  openFilter.value = null;
}

function pilihStatus(status: ReturnType<typeof kategoriPkwt>) {
  statusAktif.value = statusAktif.value === status ? null : status;
}

const filtered = computed(() => {
  const q = cari.value.trim().toLowerCase();
  return rows.value.filter((r) => {
    const cocokStatus = !statusAktif.value || kategoriPkwt(Number(r.Sisa_Hari)) === statusAktif.value;
    const cocokCari = !q || `${r.Nik} ${r.Nama} ${r.Jabatan || ""} ${r.Bagian || ""} ${r.Pabrik || ""}`.toLowerCase().includes(q);
    const cocokKolom = filterColumns.every(({ key }) => !columnFilters.value[key].length || columnFilters.value[key].includes(filterKey(columnValue(r, key))));
    return cocokStatus && cocokCari && cocokKolom;
  });
});

const ringkas = computed(() => {
  const counts = { berakhir: 0, segera: 0, akan: 0, aman: 0 };
  for (const row of rows.value) counts[kategoriPkwt(Number(row.Sisa_Hari))]++;
  return counts;
});

function badgeClass(sisaHari: number): string {
  return `rok-${kategoriPkwt(Number(sisaHari))}`;
}

function labelStatus(sisaHari: number): string {
  if (kategoriPkwt(Number(sisaHari)) === "berakhir") return "Berakhir";
  return statusPkwt.find((status) => status.key === kategoriPkwt(Number(sisaHari)))!.label;
}

async function load() {
  loading.value = true;
  gagal.value = "";
  try {
    const data = await safeGet<EksekusiRow[]>("/dashboard/eksekusi-pkwt");
    rows.value = Array.isArray(data) ? data : [];
  } catch (e) {
    gagal.value = pickError(e);
    toast.error(gagal.value);
  } finally {
    loading.value = false;
  }
}

const toast = useToast();
onMounted(load);
</script>

<template>
  <div class="page eksekusi-page">
    <div class="page-head">
      <div>
        <h2 class="module-title"><MsIcon name="contract" :size="18" /> Eksekusi PKWT</h2>
        <p class="module-sub">
          Karyawan aktif berstatus PKWT dengan kontrak sudah berakhir atau berakhir sebelum 2 bulan dari hari ini
          &middot;
          Tombol WhatsApp menyiapkan pesan beserta link penilaian sesuai jabatan (OPERATOR/STAF tanpa bawahan)
          &middot; 
          HR memilih sendiri penerima di WhatsApp.
        </p>
      </div>
      <button type="button" class="refresh-btn" :disabled="loading" @click="load">
        <MsIcon name="refresh" :size="15" /> Muat Ulang
      </button>
    </div>

    <div class="stat-row">
      <button
        v-for="status in statusPkwt"
        :key="status.key"
        type="button"
        class="stat-box"
        :class="[status.key, { selected: statusAktif === status.key }]"
        :aria-pressed="statusAktif === status.key"
        :disabled="loading || !!gagal"
        :title="`Filter ${status.label}: ${status.rentang}. Klik lagi untuk menampilkan semua.`"
        @click="pilihStatus(status.key)"
      >
        <span class="stat-val">{{ loading ? "—" : ringkas[status.key] }}</span>
        <span class="stat-description">
          <span class="stat-label">{{ status.label }}</span>
          <span class="stat-range">{{ status.rentang }}</span>
        </span>
      </button>
    </div>
    <div class="summary-info" aria-live="polite">
      <span>Total karyawan PKWT: {{ loading ? "—" : rows.length }}</span>
      <span v-if="statusAktif">Filter: {{ statusPkwt.find((s) => s.key === statusAktif)?.label }}</span>
      <span v-if="hasColumnFilters">Filter kolom aktif</span>
      <button v-if="statusAktif || hasColumnFilters" type="button" class="reset-filter" @click="resetFilters">Tampilkan semua</button>
    </div>

    <div class="eksekusi-card">
      <div class="card-tool">
        <form class="search-field" role="search" @submit.prevent="jalankanPencarian">
          <input
            ref="searchInput"
            v-model="cari"
            type="search"
            class="cari-input"
            aria-label="Cari karyawan berdasarkan NIK, nama, bagian, atau jabatan"
            placeholder="Cari NIK, nama, bagian, atau jabatan..."
          />
          <button type="submit" class="search-button" aria-label="Cari karyawan" title="Cari karyawan">
            <MsIcon name="search" :size="16" />
          </button>
        </form>
      </div>

      <div v-if="loading" class="keadaan"><MsIcon name="hourglass_top" :size="16" /> Memuat daftar...</div>
      <div v-else-if="gagal" class="keadaan err"><MsIcon name="error" :size="16" /> {{ gagal }}</div>

      <div v-else class="tbl-wrap">
        <table class="tbl">
          <thead>
            <tr>
              <th scope="col" class="num">No</th>
              <th v-for="column in filterColumns" :key="column.key" scope="col" :class="column.className">
                <div class="th-content">
                  <span>{{ column.label }}</span>
                  <button
                    type="button"
                    class="column-filter-btn"
                    :class="{ active: columnFilters[column.key].length > 0 }"
                    :aria-label="`Filter ${column.label}`"
                    :aria-expanded="openFilter === column.key"
                    aria-haspopup="dialog"
                    @click="toggleColumnFilter(column.key, $event)"
                  ><MsIcon :name="columnFilters[column.key].length ? 'filter_alt' : 'filter_list'" :size="15" /></button>
                </div>
                <ColumnFilterPopup
                  v-if="openFilter === column.key && filterAnchor"
                  :anchor="filterAnchor"
                  :col-label="column.label"
                  :selected="columnFilters[column.key]"
                  :fetch-values="() => columnValues(column.key)"
                  @apply="(values) => applyColumnFilter(column.key, values)"
                  @close="openFilter = null"
                />
              </th>
              <th scope="col" class="col-aksi">Aksi</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="filtered.length === 0">
              <td colspan="5" class="empty-cell">{{ cari || statusAktif || hasColumnFilters ? "Tidak ada karyawan yang cocok dengan pencarian atau filter." : "Tidak ada data PKWT." }}</td>
            </tr>
            <tr v-for="(r, i) in filtered" :key="`${r.Nik}`" :class="badgeClass(r.Sisa_Hari)">
              <td class="num">{{ i + 1 }}</td>
              <td class="col-karyawan">
                <div class="cell-primary employee-name">{{ r.Nama }}</div>
                <div class="cell-secondary cell-meta">
                  <span>{{ r.Nik }}</span>
                  <span>{{ r.Jabatan || "-" }}</span>
                  <span>{{ r.Bagian || "-" }}</span>
                </div>
              </td>
              <td class="col-kontrak">
                <div class="cell-primary">{{ r.Status_PKWT || "-" }}</div>
                <div class="cell-secondary cell-meta">
                  <span>{{ r.Pabrik || "-" }}</span>
                  <span>Berakhir {{ formatTglBerakhir(r.Tgl_Berakhir) }}</span>
                </div>
              </td>
              <td class="col-rok">
                <div class="status-stack">
                  <span class="remaining-days" :class="{ 'sisa-berakhir': Number(r.Sisa_Hari) < 0, 'sisa-kritis': Number(r.Sisa_Hari) >= 0 && Number(r.Sisa_Hari) <= 7 }">
                    {{ sisaHariTeks(r.Sisa_Hari) }} {{ Number(r.Sisa_Hari) > 0 ? "hari lagi" : "hari" }}
                  </span>
                  <span class="badge-rok" :class="badgeClass(r.Sisa_Hari)">{{ labelStatus(r.Sisa_Hari) }}</span>
                </div>
              </td>
              <td class="col-aksi">
                <button
                  type="button"
                  class="wa-btn"
                  :title="`Buka WhatsApp dengan pesan untuk ${r.Nama} (pilih penerima sendiri)`"
                  @click="kirimWa(r)"
                >
                  <svg class="wa-icon" viewBox="0 0 448 512" aria-hidden="true">
                    <path fill="currentColor" d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-97.8 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.5 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z" />
                  </svg>
                  <span>Kirim WhatsApp</span>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>


    </div>
  </div>
</template>

<style scoped>
.eksekusi-page {
  --pkwt-border: #e6eaf2;
  --pkwt-row-alt: #f8fafc;
  --pkwt-row-hover: #f0f4fa;
  --pkwt-danger-bg: #f3f4f6;
  --pkwt-danger-text: #4b5563;
  --pkwt-danger-border: #cbd0d8;
  --pkwt-warning-bg: #fef2f2;
  --pkwt-warning-text: #b91c1c;
  --pkwt-warning-border: #f5b5b5;
  --pkwt-upcoming-bg: #fffae5;
  --pkwt-upcoming-text: #854d0e;
  --pkwt-upcoming-border: #ebdda6;
  --pkwt-success-bg: #f2fbf6;
  --pkwt-success-text: #148a4b;
  --pkwt-success-border: #88cda8;
  /* Ringkasan ikut tergulir; header tabel melekat pada scroll halaman ini. */
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: auto;
  padding: 8px 6px 0;
}
:global(:root[data-theme="dark"] .eksekusi-page) {
  --pkwt-border: var(--ds-border-light);
  --pkwt-row-alt: var(--ds-row-alt);
  --pkwt-row-hover: var(--ds-row-hover);
  --pkwt-danger-bg: #293340;
  --pkwt-danger-text: #cbd5e1;
  --pkwt-danger-border: #64748b;
  --pkwt-warning-bg: #40262c;
  --pkwt-warning-text: #fca5a5;
  --pkwt-warning-border: #8f4650;
  --pkwt-upcoming-bg: #383321;
  --pkwt-upcoming-text: #fcd34d;
  --pkwt-upcoming-border: #71643a;
  --pkwt-success-bg: #183b32;
  --pkwt-success-text: #86efac;
  --pkwt-success-border: #387759;
}
.page-head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.page-head > div {
  min-width: 0;
}
.module-title {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 15px;
  font-weight: 800;
  color: #12224e;
  margin: 0 0 2px;
}
.module-sub {
  margin: 0;
  font-size: 10px;
  line-height: 1.5;
  color: var(--ds-text-secondary, #64748b);
}
.refresh-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid #dbe2ee;
  border-radius: 8px;
  background: #fff;
  color: #1b2d4a;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
}
.refresh-btn:hover {
  background: #f3f6fb;
}
.refresh-btn:disabled {
  opacity: 0.55;
  cursor: default;
}

/* Ringkasan */
.stat-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  flex-shrink: 0;
  gap: 10px;
  margin-bottom: 8px;
}
.stat-box {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 9px;
  border: 1px solid;
  text-align: left;
  font: inherit;
  cursor: pointer;
  transition: box-shadow 0.15s;
}
.stat-box:hover:not(:disabled),
.stat-box.selected {
  box-shadow: inset 0 0 0 1px currentColor;
}
.stat-box:focus-visible,
.reset-filter:focus-visible {
  outline: 2px solid var(--ds-primary, #3b5998);
  outline-offset: 2px;
}
.stat-box:disabled {
  opacity: 0.65;
  cursor: default;
}
.stat-val {
  flex-shrink: 0;
  font-size: 24px;
  font-weight: 800;
  line-height: 1.3;
  font-variant-numeric: tabular-nums;
}
.stat-description {
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.stat-label {
  font-size: 10px;
  font-weight: 600;
}
.stat-range {
  margin-top: 3px;
  font-size: 9px;
  line-height: 1.4;
}
.stat-box.berakhir {
  background: var(--pkwt-danger-bg);
  border-color: var(--pkwt-danger-border);
  color: var(--pkwt-danger-text);
}
.stat-box.segera {
  background: var(--pkwt-warning-bg);
  border-color: var(--pkwt-warning-border);
  color: var(--pkwt-warning-text);
}
.stat-box.akan {
  background: var(--pkwt-upcoming-bg);
  border-color: var(--pkwt-upcoming-border);
  color: var(--pkwt-upcoming-text);
}
.stat-box.aman {
  background: var(--pkwt-success-bg);
  border-color: var(--pkwt-success-border);
  color: var(--pkwt-success-text);
}
.summary-info {
  display: flex;
  flex-wrap: wrap;
  flex-shrink: 0;
  align-items: center;
  gap: 6px 12px;
  margin-bottom: 8px;
  font-size: 10px;
  color: var(--ds-text-secondary, #5a6a7e);
}
.reset-filter {
  color: var(--ds-primary, #3b5998);
  font: inherit;
  text-decoration: underline;
  cursor: pointer;
}
@media (max-width: 640px) {
  .stat-row { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
}

/* Card tabel */
.eksekusi-card {
  flex: 1 0 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--ds-surface-raised, #fff);
  border: 1px solid var(--pkwt-border);
  border-radius: 10px;
  padding: 12px 14px;
  box-shadow: 0 1px 3px rgba(18, 34, 78, 0.05);
}
.card-tool {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding-bottom: 10px;
}
.cari-input {
  width: 100%;
  max-width: 100%;
  padding: 6px 38px 6px 10px;
  border: 1px solid #dbe2ee;
  border-radius: 7px;
  font-size: 11.5px;
  color: #1b2d4a;
}
.cari-input:focus {
  outline: none;
  border-color: #3b5998;
}
.search-field {
  position: relative;
  width: 320px;
  max-width: 100%;
}
.search-button {
  position: absolute;
  right: 3px;
  top: 50%;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 26px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--ds-text-secondary, #5a6a7e);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.search-button:hover {
  background: var(--ds-primary-50, #e8edf5);
  color: var(--ds-primary, #3b5998);
}
.search-button:active { background: var(--ds-primary-100, #c5d0e6); }
.search-button:focus-visible {
  outline: 2px solid var(--ds-primary, #3b5998);
  outline-offset: 1px;
}
.cari-input::-webkit-search-cancel-button { margin-right: 2px; }
/* Satu area scroll menjaga header tetap sticky saat ringkasan tergulir. */
.tbl-wrap {
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: visible;
  border: 1px solid var(--pkwt-border);
  border-radius: 8px;
  scrollbar-gutter: stable;
}
/* Track scrollbar menyatu dengan latar card, bukan putih polos. */
.eksekusi-page::-webkit-scrollbar {
  width: 11px;
  height: 11px;
}
.eksekusi-page::-webkit-scrollbar-track {
  background: var(--ds-surface, #eef2f8);
}
.eksekusi-page::-webkit-scrollbar-thumb {
  background: var(--ds-border, #c4d0e4);
  border-radius: 8px;
  border: 3px solid var(--ds-surface, #eef2f8);
}
.tbl {
  width: 100%;
  min-width: 600px;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 12px;
  table-layout: fixed;
}
.tbl th {
  position: sticky;
  top: 0;
  z-index: 2;
  height: 38px;
  padding: 9px 14px;
  background: #3b5998;
  color: #fff;
  font-weight: 700;
  text-align: left;
  white-space: nowrap;
}
.th-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.column-filter-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border: 1px solid transparent;
  border-radius: 4px;
  color: inherit;
  background: transparent;
  cursor: pointer;
}
.column-filter-btn:hover,
.column-filter-btn.active { background: #ffffff26; border-color: currentColor; }
.column-filter-btn:focus-visible { outline: 2px solid currentColor; outline-offset: 1px; }
.tbl td.empty-cell { padding: 24px 12px; text-align: center; color: var(--ds-text-secondary, #5a6a7e); }
.tbl th.num { width: 48px; }
.tbl th.col-kontrak { width: 28%; }
.tbl th.col-rok { width: 120px; }
.tbl th.col-aksi { width: 144px; }
.tbl td {
  height: 66px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--pkwt-border);
  color: var(--ds-text, #1b2d4a);
  vertical-align: middle;
  line-height: 1.45;
  overflow-wrap: anywhere;
}
.tbl tbody tr:last-child td { border-bottom: 0; }
.tbl .num,
.tbl .col-rok,
.tbl .col-aksi { text-align: center; }
.tbl td.num {
  color: var(--ds-text-secondary, #5a6a7e);
  font-variant-numeric: tabular-nums;
}
.cell-primary {
  font-weight: 600;
  margin-bottom: 4px;
}
.employee-name { font-weight: 700; }
.cell-secondary {
  color: var(--ds-text-secondary, #5a6a7e);
  font-size: 10.5px;
  line-height: 1.6;
}
.cell-meta {
  display: flex;
  flex-wrap: wrap;
  column-gap: 6px;
  row-gap: 1px;
}
.cell-meta > span { min-width: 0; }
.cell-meta > span + span::before {
  content: "\00b7";
  margin-right: 6px;
  color: var(--ds-text-muted, #8494a7);
}
.status-stack {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.remaining-days {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.sisa-kritis { color: var(--pkwt-warning-text); font-weight: 700; }
.sisa-berakhir { color: var(--pkwt-danger-text); font-weight: 700; }
.tbl tbody tr:nth-child(even) { background: var(--pkwt-row-alt); }
.tbl tbody tr:hover { background: var(--pkwt-row-hover); }
.tbl tbody tr.rok-berakhir td:first-child { box-shadow: inset 3px 0 0 var(--pkwt-danger-border); }
.tbl tbody tr.rok-segera td:first-child { box-shadow: inset 3px 0 0 var(--pkwt-warning-text); }
.tbl tbody tr.rok-akan td:first-child { box-shadow: inset 3px 0 0 var(--pkwt-upcoming-border); }
@media (max-width: 760px) {
  .tbl th, .tbl td { padding-left: 10px; padding-right: 10px; }
  .tbl th.num { width: 38px; }
  .tbl th.col-kontrak { width: 180px; }
  .tbl th.col-rok { width: 104px; }
  .tbl th.col-aksi { width: 132px; }
}
.keadaan {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 2px 10px;
  font-size: 11.5px;
  color: #059669;
}
.keadaan.err {
  color: #b91c1c;
}

/* Badge status */
.badge-rok {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 76px;
  min-height: 22px;
  padding: 2px 8px;
  border-radius: 40px;
  font-size: 10.5px;
  font-weight: 700;
  white-space: nowrap;
  border: 1px solid transparent;
}
.badge-rok.rok-berakhir {
  background: var(--pkwt-danger-bg);
  color: var(--pkwt-danger-text);
  border-color: var(--pkwt-danger-border);
}
.badge-rok.rok-segera {
  background: var(--pkwt-warning-bg);
  color: var(--pkwt-warning-text);
  border-color: var(--pkwt-warning-border);
}
.badge-rok.rok-akan {
  background: var(--pkwt-upcoming-bg);
  color: var(--pkwt-upcoming-text);
  border-color: var(--pkwt-upcoming-border);
}
.badge-rok.rok-aman {
  background: var(--pkwt-success-bg);
  color: var(--pkwt-success-text);
  border-color: var(--pkwt-success-border);
}

/* Tombol WA per baris — compact: outline hijau, solid saat hover. */
.wa-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 72px;
  min-height: 30px;
  gap: 4px;
  padding: 2px 9px;
  border: 1px solid var(--pkwt-success-border);
  border-radius: 999px;
  background: var(--pkwt-success-bg);
  color: var(--pkwt-success-text);
  font-size: 10.5px;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
.wa-btn:focus-visible {
  outline: 2px solid var(--ds-primary, #3b5998);
  outline-offset: 3px;
}
.wa-btn:hover {
  background: #15803d;
  border-color: #15803d;
  color: #fff;
}
.wa-btn:active {
  background: #17a04b;
  border-color: #17a04b;
  color: #fff;
}
.wa-icon {
  width: 11px;
  height: 11px;
  flex: 0 0 auto;
}
</style>
