<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { pickError, safeGet } from "@/api";
import { useToast } from "vue-toastification";
import MsIcon from "@/components/MsIcon.vue";
import ColumnFilterPopup from "@/components/ColumnFilterPopup.vue";
import { filterKey } from "@/utils/columnFilter";
import {
  formatTglBerakhir,
  type EksekusiRow,
} from "@/utils/pkwtWa";
import { kategoriPkwt } from "@/utils/pkwtMonitoring";
import { exportToExcel } from "@/views/pocokan/_lib/utils/exportExcel";

/**
 * Tampilan BACA-SAJA daftar lengkap "Masa PKWT Akan Habis".
 * Dibuka sebagai tab aplikasi dari tombol "Lihat semua" pada card dashboard.
 * Format tabel mengikuti file Excel yang diunduh (urutan kolom sama),
 * plus sort per kolom & filter per kolom; satu-satunya aksi adalah unduh
 * Excel yang menduplikat fitur unduh pada card dashboard.
 */

/** Kolom persis seperti file Excel (label = header Excel). */
const columns = [
  { key: "Nik", label: "NIK" },
  { key: "Nama", label: "Nama" },
  { key: "Jabatan", label: "Jabatan" },
  { key: "Status_PKWT", label: "Status Kerja" },
  { key: "Bagian", label: "Bagian" },
  { key: "Pabrik", label: "Pabrik" },
  { key: "Tgl_Berakhir", label: "Tgl Berakhir" },
] as const;
type SortKey = typeof columns[number]["key"];

const rows = ref<EksekusiRow[]>([]);
const loading = ref(false);
const gagal = ref("");
const cari = ref("");

/* ---- Sort per kolom (klik header: naik → turun → netral; default: Tgl Berakhir terdekat di atas) ---- */
const sortKey = ref<SortKey | null>("Tgl_Berakhir");
const sortDir = ref<1 | -1>(1);

function klikSort(key: SortKey) {
  if (sortKey.value !== key) {
    sortKey.value = key;
    sortDir.value = 1;
  } else if (sortDir.value === 1) {
    sortDir.value = -1;
  } else {
    /* Klik ketiga: netral — kembali ke urutan asli dari server. */
    sortKey.value = null;
    sortDir.value = 1;
  }
}

/* ---- Filter per kolom (popup pilihan nilai, pola halaman Eksekusi) ---- */
const columnFilters = ref<Record<string, string[]>>({});
const openFilter = ref<SortKey | null>(null);
const filterAnchor = ref<HTMLElement | null>(null);
const hasColumnFilters = computed(() => Object.values(columnFilters.value).some((v) => v.length > 0));

/** Tampilan satu sel — dipakai untuk isi tabel & daftar nilai filter. */
function cellText(row: EksekusiRow, key: SortKey): string {
  if (key === "Tgl_Berakhir") return formatTglBerakhir(row.Tgl_Berakhir);
  const v = row[key];
  return v === null || v === undefined || v === "" ? "-" : String(v);
}

function columnValues(key: SortKey): Promise<string[]> {
  return Promise.resolve(
    [...new Set(rows.value.map((row) => cellText(row, key)))].sort((a, b) =>
      a.localeCompare(b, "id", { numeric: true })
    )
  );
}

function toggleColumnFilter(key: SortKey, event: MouseEvent) {
  filterAnchor.value = event.currentTarget as HTMLElement;
  openFilter.value = openFilter.value === key ? null : key;
}

function applyColumnFilter(key: SortKey, values: string[]) {
  columnFilters.value = { ...columnFilters.value, [key]: values };
  openFilter.value = null;
}

function resetFilters() {
  columnFilters.value = {};
  openFilter.value = null;
}

/* ---- Baris hasil: cari + filter kolom + sort ---- */
const filtered = computed(() => {
  const q = cari.value.trim().toLowerCase();
  const hasil = rows.value.filter((r) => {
    const cocokCari =
      !q ||
      `${r.Nik} ${r.Nama} ${r.Jabatan || ""} ${r.Status_PKWT || ""} ${r.Bagian || ""} ${r.Pabrik || ""} ${formatTglBerakhir(r.Tgl_Berakhir)}`
        .toLowerCase()
        .includes(q);
    const cocokKolom = columns.every(
      ({ key }) =>
        !(columnFilters.value[key]?.length ?? 0) ||
        columnFilters.value[key].includes(filterKey(cellText(r, key)))
    );
    return cocokCari && cocokKolom;
  });
  if (!sortKey.value) return hasil;
  const key = sortKey.value;
  const arah = sortDir.value;
  return [...hasil].sort((a, b) => {
    const va = key === "Tgl_Berakhir" ? String(a.Tgl_Berakhir ?? "") : cellText(a, key);
    const vb = key === "Tgl_Berakhir" ? String(b.Tgl_Berakhir ?? "") : cellText(b, key);
    return va.localeCompare(vb, "id", { numeric: true }) * arah;
  });
});

/* ---- Warna baris mengikuti tingkat mendesak (sumber Sisa_Hari dari API) ---- */
function badgeClass(sisaHari: number): string {
  return `rok-${kategoriPkwt(Number(sisaHari))}`;
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

/** Unduh Excel — isi file mengikuti TAMPILAN tabel saat ini: hasil pencarian,
 *  filter kolom & urutan sort yang sedang aktif, dengan kolom & label yang sama
 *  seperti yang terlihat di tabel. */ 
const exporting = ref(false);
async function unduhExcel() {
  if (exporting.value || rows.value.length === 0) return;
  exporting.value = true;
  try {
    await exportToExcel({
      title: "Masa PKWT Akan Habis",
      filenamePrefix: "Masa-PKWT-Akan-Habis",
      sheetName: "PKWT Akan Habis",
      columns: [
        { header: "No", key: "No", width: 6, align: "center" },
        { header: "NIK", key: "Nik", width: 14 },
        { header: "Nama", key: "Nama", width: 30 },
        { header: "Jabatan", key: "Jabatan", width: 18 },
        { header: "Status Kerja", key: "Status_Kerja", width: 16 },
        { header: "Bagian", key: "Bagian", width: 16 },
        { header: "Pabrik", key: "Pabrik", width: 10 },
        { header: "Tgl Berakhir", key: "Tgl_Berakhir", width: 14 },
      ],
      rows: filtered.value.map((r, i) => ({
        No: i + 1,
        Nik: cellText(r, "Nik"),
        Nama: cellText(r, "Nama"),
        Jabatan: cellText(r, "Jabatan"),
        Status_Kerja: cellText(r, "Status_PKWT"),
        Bagian: cellText(r, "Bagian"),
        Pabrik: cellText(r, "Pabrik"),
        Tgl_Berakhir: cellText(r, "Tgl_Berakhir"),
      })),
    });
    toast.success("Berkas Excel berhasil diunduh");
  } catch (e) {
    toast.error(pickError(e));
  } finally {
    exporting.value = false;
  }
}

const toast = useToast();
onMounted(load);
</script>

<template>
  <div class="page pkwt-readonly-page">
    <div class="page-head">
      <div>
        <h2 class="module-title"><MsIcon name="contract" :size="18" /> Masa PKWT Akan Habis</h2>
      </div>
      <div class="head-actions">
        <button type="button" class="refresh-btn" :disabled="loading" @click="load">
          <MsIcon name="refresh" :size="15" /> Muat Ulang
        </button>
        <button
          type="button"
          class="refresh-btn excel-btn"
          :disabled="loading || exporting || filtered.length === 0"
          title="Unduh daftar ini sebagai Excel (sama dengan tombol Excel di card dashboard)"
          @click="unduhExcel"
        >
          <MsIcon :name="exporting ? 'progress_activity' : 'download'" :size="15" />
          {{ exporting ? "Menyiapkan..." : "Excel" }}
        </button>
      </div>
    </div>

    <div class="summary-info" aria-live="polite">
      <span>Menampilkan {{ loading ? "—" : filtered.length }} dari {{ rows.length }} karyawan</span>
      <button
        v-if="hasColumnFilters || cari"
        type="button"
        class="reset-filter"
        @click="resetFilters(); cari = ''"
      >
        <MsIcon name="filter_alt_off" :size="14" /> Bersihkan filter
      </button>
    </div>

    <div class="list-card">
      <div class="card-tool">
        <div class="search-field">
          <MsIcon name="search" :size="16" />
          <input
            v-model="cari"
            type="search"
            class="cari-input browse-search-input"
            aria-label="Cari karyawan berdasarkan NIK, nama, bagian, jabatan, atau pabrik"
            placeholder="Cari NIK, nama, bagian, jabatan..."
          />
        </div>
      </div>

      <div v-if="loading" class="keadaan"><MsIcon name="hourglass_top" :size="16" /> Memuat daftar...</div>
      <div v-else-if="gagal" class="keadaan err"><MsIcon name="error" :size="16" /> {{ gagal }}</div>

      <div v-else class="tbl-wrap">
        <table class="tbl">
          <colgroup>
            <col class="col-no" />
            <col class="col-nik" />
            <col />
            <col class="col-jabatan" />
            <col class="col-status" />
            <col class="col-bagian" />
            <col class="col-pabrik" />
            <col class="col-tgl" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col" class="num">No</th>
              <th
                v-for="column in columns"
                :key="column.key"
                scope="col"
                :class="{ sorted: sortKey === column.key }"
              >
                <div class="th-content">
                  <button
                    type="button"
                    class="sort-btn"
                    :title="sortKey === column.key ? (sortDir === 1 ? `Sort ${column.label}: turun (klik lagi → netral)` : `Hapus sort ${column.label}`) : `Sort ${column.label}: naik`"
                    @click="klikSort(column.key)"
                  >
                    <span>{{ column.label }}</span>
                    <MsIcon
                      :name="sortKey === column.key ? (sortDir === 1 ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'"
                      :size="14"
                      :class="['sort-ic', { on: sortKey === column.key }]"
                    />
                  </button>
                  <button
                    type="button"
                    class="column-filter-btn"
                    :class="{ active: (columnFilters[column.key]?.length ?? 0) > 0 }"
                    :aria-label="`Filter ${column.label}`"
                    :aria-expanded="openFilter === column.key"
                    aria-haspopup="dialog"
                    @click="toggleColumnFilter(column.key, $event)"
                  ><MsIcon :name="(columnFilters[column.key]?.length ?? 0) ? 'filter_alt' : 'filter_list'" :size="15" /></button>
                  <ColumnFilterPopup
                    v-if="openFilter === column.key && filterAnchor"
                    :anchor="filterAnchor"
                    :col-label="column.label"
                    :selected="columnFilters[column.key] ?? []"
                    :fetch-values="() => columnValues(column.key)"
                    @apply="(values: string[]) => applyColumnFilter(column.key, values)"
                    @close="openFilter = null"
                  />
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="filtered.length === 0">
              <td colspan="8" class="empty-cell">
                {{ cari || hasColumnFilters ? "Tidak ada karyawan yang cocok dengan pencarian atau filter." : "Tidak ada data PKWT." }}
              </td>
            </tr>
            <tr v-for="(r, i) in filtered" :key="r.Nik" :class="badgeClass(r.Sisa_Hari)">
              <td class="num">{{ i + 1 }}</td>
              <td v-for="column in columns" :key="column.key" :class="{ 'cell-name': column.key === 'Nama' }" :title="cellText(r, column.key)">
                {{ cellText(r, column.key) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Halaman mengisi penuh area konten tab: judul/ringkasan/search tetap di atas,
 * hanya tabel yang menggulir di dalam card — tepi bawah tabel selalu kelihatan. */
.page { padding: 14px 20px 16px; height: 100%; min-height: 0; display: flex; flex-direction: column; max-width: 1400px; margin: 0 auto; }
.page-head { flex: 0 0 auto; display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
.module-title { display: flex; align-items: center; gap: 8px; font-size: 18px; font-weight: 800; color: #1e293b; margin: 0 0 4px; }
.head-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.refresh-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border: 1px solid #dbe3ef; border-radius: 10px; background: white; color: #334155; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease, transform 0.1s ease; }
.refresh-btn:disabled { opacity: 0.6; cursor: default; }
/* Hover: tombol jelas terasa "hidup" di bawah kursor. */
.refresh-btn:not(:disabled):hover {
  background: #eef2f9;
  border-color: #b9c8e4;
  box-shadow: 0 2px 6px rgba(59, 89, 152, 0.12);
}
.refresh-btn:not(:disabled):active { transform: translateY(1px); box-shadow: none; }
/* Ikon refresh berputar pelan saat tombol disorot. */
.refresh-btn:not(:disabled):hover .ms-icon { transform: rotate(90deg); }
.refresh-btn .ms-icon { transition: transform 0.3s ease; }
.excel-btn { color: #166534; border-color: #bfe3cb; }
.excel-btn:not(:disabled):hover { background: #e8f6ec; border-color: #93cfa8; box-shadow: 0 2px 6px rgba(22, 101, 52, 0.14); }
.excel-btn:disabled { color: #94a3b8; border-color: #dbe3ef; }

.summary-info { flex: 0 0 auto; display: flex; align-items: center; gap: 14px; font-size: 12.5px; color: #475569; margin: 14px 0 10px; }
.reset-filter { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border: 1px solid #dbe3ef; border-radius: 999px; background: white; color: #3b5998; font: inherit; font-size: 11.5px; font-weight: 600; cursor: pointer; transition: background 0.15s ease, border-color 0.15s ease; }
.reset-filter:hover { background: #eef2f9; border-color: #b9c8e4; }

.list-card { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; background: white; border: 1px solid #e2e8f0; border-radius: 14px; padding: 12px 14px 12px; }
.card-tool { flex: 0 0 auto; display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
.search-field { display: inline-flex; align-items: center; gap: 8px; border: 1px solid #dbe3ef; border-radius: 10px; padding: 6px 12px; color: #64748b; background: #f8fafc; min-width: 280px; transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease; }
/* Fokus ditandai di pil luar, bukan kotak dalam di input. */
.search-field:focus-within { border-color: #9dbcf3; background: white; box-shadow: 0 0 0 3px rgba(29, 78, 216, 0.08); }
.cari-input { border: 0; outline: none; -webkit-appearance: none; appearance: none; background: transparent; font: inherit; font-size: 13px; color: #1e293b; flex: 1; width: 100%; min-width: 0; }

.keadaan { display: flex; align-items: center; gap: 8px; padding: 26px 10px; color: #64748b; font-size: 13px; }
.keadaan.err { color: #b91c1c; }

/* Area tabel menggulir sendiri; header kolom menempel di atasnya. */
.tbl-wrap { flex: 1 1 auto; min-height: 0; overflow: auto; }
/* Layout fixed: lebar kolom pasti (rapat & konsisten), sisanya untuk Nama. */
.tbl { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 13px; }
.col-no { width: 44px; }
.col-nik { width: 110px; }
.col-jabatan { width: 150px; }
.col-status { width: 130px; }
.col-bagian { width: 120px; }
.col-pabrik { width: 80px; }
.col-tgl { width: 115px; }
.tbl th {
  text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b;
  padding: 8px 10px; border-bottom: 2px solid #e2e8f0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  position: sticky; top: 0; z-index: 1; background: white;
}
/* Header bisa disort: terasa interaktif di bawah kursor. */
.tbl th.sorted { color: #3b5998; }
.th-content { display: inline-flex; align-items: center; gap: 2px; }
.sort-btn { display: inline-flex; align-items: center; gap: 3px; padding: 2px 4px; margin: -2px -2px; border: 0; background: transparent; color: inherit; font: inherit; font-size: inherit; font-weight: inherit; text-transform: inherit; letter-spacing: inherit; border-radius: 6px; cursor: pointer; transition: background 0.15s ease; }
.sort-btn:hover { background: #eef2f9; }
.sort-btn:hover .sort-ic { color: #3b5998; }
.sort-ic { color: #cbd5e1; transition: color 0.15s ease, transform 0.2s ease; }
.sort-ic.on { color: #3b5998; }
.column-filter-btn { display: inline-flex; align-items: center; justify-content: center; padding: 2px; border: 0; background: transparent; color: #94a3b8; border-radius: 6px; cursor: pointer; transition: background 0.15s ease, color 0.15s ease; }
.column-filter-btn:hover { background: #eef2f9; color: #3b5998; }
.column-filter-btn.active { color: #3b5998; background: #e3ecfd; }

/* Tinggi baris seragam: satu baris teks, kelebihan dipotong (lengkap via title). */
.tbl td {
  padding: 9px 10px; border-bottom: 1px solid #eef2f7; vertical-align: middle; color: #334155;
  height: 40px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
/* Selang-seling lembut biar baris mudah dilacak ke samping. */
.tbl tbody tr:nth-child(even) td { background: #f6f8fb; }
.tbl tbody tr:hover td { background: #eef4fb; }
.tbl .num { color: #94a3b8; }
.cell-name { font-weight: 700; color: #1e293b; }
.empty-cell { text-align: center; color: #94a3b8; padding: 22px 8px; }

/* Baris kategori: garis aksen kiri sesuai tingkat mendesak. */
.tbl tbody tr.rok-berakhir td:first-child { box-shadow: inset 3px 0 0 #dc2626; }
.tbl tbody tr.rok-segera td:first-child { box-shadow: inset 3px 0 0 #ea580c; }
.tbl tbody tr.rok-akan td:first-child { box-shadow: inset 3px 0 0 #d97706; }
</style>
