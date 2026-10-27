<script setup lang="ts">
import { ref, reactive, shallowRef, onMounted, computed } from "vue";
import { useToast } from "vue-toastification";
import { useRoute } from "vue-router";
import MsIcon from "@/components/MsIcon.vue";
import ColumnFilterPopup from "@/components/ColumnFilterPopup.vue";
import { useTabsStore } from "@/stores/tabsStore";
import { safeGet, downloadFile } from "@/api";
import { api, getErrorMessage } from "@/api/axios";
import { formatTanggal, formatNumber } from "@/utils/format";
import { filterKey } from "@/utils/columnFilter";
import { nextSort, sortByKey, sortIconName, type SortDir } from "@/utils/table";
import { useTabNavigation } from "@/composables/useTabNavigation";

/**
 * Staff Movement Bulanan — padanan `ufrmProsesSMBulanan`.
 *
 * Rekap perpindahan karyawan per bagian per bulan: baris dari tbudgetmpp,
 * hitungan tkaryawan baru (kar_tgl_masuk), tmutasi (in/out) dan tkeluar
 * (kl_alasan). Read-only; klik sel angka membuka detail daftar NIK/Nama/
 * Tanggal (popup Tfrmbantuan di Delphi). Tidak ada tombol simpan.
 */
const toast = useToast();
const route = useRoute();
const tabsStore = useTabsStore();
const navigation = useTabNavigation();

const pabrikList = ref<{ Kode: string; Nama: string }[]>([]);
const pabrik = ref("");
const tahun = ref(new Date().getFullYear());
const bulan = ref(new Date().getMonth());
const rows = ref<Record<string, any>[]>([]);
const sumber = ref("");
const loading = ref(false);
let loadRequest = 0;

interface Kolom {
  key: string;
  label: string;
  detail?: boolean;
}
const GRUP_KOLOM: { key: "penambahan" | "pengurangan"; label: string; kolom: Kolom[] }[] = [
  {
    key: "penambahan",
    label: "Penambahan",
    kolom: [
      { key: "baru", label: "Karyawan Baru", detail: true },
      { key: "mutasiin", label: "Mutasi In", detail: true },
      { key: "total", label: "Total" },
    ],
  },
  {
    key: "pengurangan",
    label: "Pengurangan",
    kolom: [
      { key: "pindah", label: "Pindah Ke Perusahaan Lain", detail: true },
      { key: "study", label: "Melanjutkan Study", detail: true },
      { key: "lainlain", label: "Lain Lain", detail: true },
      { key: "mutasiout", label: "Mutasi Out", detail: true },
      { key: "tidaklolos", label: "Tidak Lolos", detail: true },
      { key: "sementara", label: "Pemberhentian Sementara", detail: true },
      { key: "pensiun", label: "Pensiun", detail: true },
      { key: "kasus", label: "Kasus", detail: true },
      { key: "masalahatasan", label: "Masalah dengan Atasan", detail: true },
      { key: "masalahrekan", label: "Masalah dengan Rekan kerja", detail: true },
      { key: "total2", label: "Total" },
    ],
  },
];
const SEMUA_ANGKA = ["baru", "mutasiin", "total", "pindah", "study", "lainlain", "mutasiout",
  "tidaklolos", "sementara", "pensiun", "kasus", "masalahatasan", "masalahrekan", "total2"];
const TOTAL_KOLOM = GRUP_KOLOM.reduce((n, g) => n + g.kolom.length, 0);

/* ── Filter per kolom di header (checklist nilai, sisi klien) ── */
interface KolomFilter {
  key: string;
  label: string;
  tipe: "string" | "number";
}
const DAFTAR_FILTER: KolomFilter[] = [
  { key: "bagian", label: "Bagian", tipe: "string" },
  ...GRUP_KOLOM.flatMap((g) =>
    g.kolom.map((k) => ({ key: k.key, label: `${g.label} — ${k.label}`, tipe: "number" as const }))
  ),
];
const filterSets = reactive<Record<string, string[]>>({});
const openFilter = ref<string | null>(null);
const filterAnchor = shallowRef<HTMLElement | null>(null);

const mapKolom = new Map(DAFTAR_FILTER.map((d) => [d.key, d]));
function mapFilter(key: string): KolomFilter {
  return mapKolom.get(key) || { key, label: key, tipe: "number" };
}

function isFilterActive(key: string): boolean {
  return !!filterSets[key]?.length;
}

function klikFilter(kf: KolomFilter, event: MouseEvent) {
  filterAnchor.value = event.currentTarget as HTMLElement;
  openFilter.value = openFilter.value === kf.key ? null : kf.key;
}

function nilaiKolom(kf: KolomFilter): Promise<(string | number | null)[]> {
  const ada = new Set<(string | number | null)>();
  for (const r of rows.value) ada.add(r[kf.key] === undefined ? null : r[kf.key]);
  return Promise.resolve([...ada]);
}

function terapkanFilter(kf: KolomFilter, values: string[]) {
  if (values.length) filterSets[kf.key] = values;
  else delete filterSets[kf.key];
  openFilter.value = null;
}

function bersihkanFilter() {
  for (const k of Object.keys(filterSets)) delete filterSets[k];
  openFilter.value = null;
}

const barisTampil = computed(() => {
  const aktif = Object.entries(filterSets).filter(([, v]) => v.length > 0);
  let hasil = rows.value;
  if (aktif.length) {
    hasil = hasil.filter((r) =>
      aktif.every(([key, values]) => values.includes(filterKey(r[key] === undefined ? null : r[key])))
    );
  }
  if (sortKey.value && sortDir.value) {
    hasil = sortByKey(hasil, sortKey.value, sortDir.value, (r, k) =>
      r[k] === undefined ? null : r[k]
    );
  }
  return hasil;
});

/* ── Sort: klik header -> naik -> turun -> kembali urutan bawaan ── */
const sortKey = ref<string | null>(null);
const sortDir = ref<SortDir | null>(null);

function klikSort(key: string) {
  const next = nextSort(sortKey.value, sortDir.value, key);
  sortKey.value = next.key;
  sortDir.value = next.dir;
}

const NAMA_BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const TAHUN_OPSI = computed(() => {
  const akhir = new Date().getFullYear();
  const daftar: number[] = [];
  for (let y = akhir; y >= 2016; y--) daftar.push(y);
  return daftar;
});

const totalBaris = computed(() => {
  const t: Record<string, number> = {};
  for (const k of SEMUA_ANGKA) t[k] = 0;
  for (const r of barisTampil.value) for (const k of SEMUA_ANGKA) t[k] += Number(r[k]) || 0;
  return t;
});

async function muat() {
  const request = ++loadRequest;
  if (!pabrik.value) {
    rows.value = [];
    return;
  }
  loading.value = true;
  try {
    const r = await safeGet<{ sumber?: string; rows: Record<string, any>[] }>("/transaksi/sm/proses", {
      params: { pabrik: pabrik.value, tahun: tahun.value, bulan: bulan.value + 1 },
    });
    if (request === loadRequest) {
      rows.value = r.rows || [];
      sumber.value = r.sumber || "";
    }
  } catch (e: any) {
    if (request === loadRequest) {
      rows.value = [];
      sumber.value = "";
      toast.warning(getErrorMessage(e, "Gagal memuat data"));
    }
  } finally {
    if (request === loadRequest) loading.value = false;
  }
}

function gantiFilter() {
  void muat();
}

function tutup() {
  const activeId = tabsStore.activeTabId;
  if (activeId) void navigation.closeTab(activeId);
}

function ekspor() {
  if (!pabrik.value) return;
  downloadFile(
    `/transaksi/sm/proses?pabrik=${encodeURIComponent(pabrik.value)}&tahun=${tahun.value}&bulan=${bulan.value + 1}&export=xlsx`,
    `staff-movement-bulanan-${tahun.value}-${bulan.value + 1}.xlsx`
  ).catch((e) => toast.error(getErrorMessage(e, "Gagal mengekspor")));
}

/* ── Popup detail (LihatDetail1Click → Tfrmbantuan) ── */
const detailOpen = ref(false);
const detailInfo = ref<{ bagian: string; label: string } | null>(null);
const detailRows = ref<Record<string, any>[]>([]);
const detailLoading = ref(false);
let detailRequest = 0;

async function bukaDetail(row: Record<string, any>, kolom: Kolom) {
  if (!kolom.detail || !pabrik.value || loading.value) return;
  const request = ++detailRequest;
  detailInfo.value = { bagian: String(row.bagian ?? ""), label: kolom.label };
  detailRows.value = [];
  detailOpen.value = true;
  detailLoading.value = true;
  try {
    const r = await safeGet<{ rows: Record<string, any>[] }>("/transaksi/sm/detail", {
      params: { pabrik: pabrik.value, tahun: tahun.value, bulan: bulan.value + 1, bagian: row.bagian, kolom: kolom.key },
    });
    if (request === detailRequest) detailRows.value = r.rows || [];
  } catch (e) {
    if (request === detailRequest) toast.error(getErrorMessage(e, "Gagal memuat detail"));
  } finally {
    if (request === detailRequest) detailLoading.value = false;
  }
}

function tutupDetail() {
  ++detailRequest;
  detailOpen.value = false;
  detailRows.value = [];
  detailInfo.value = null;
}

onMounted(async () => {
  try {
    const { data } = await api.get("/master/pabrik/options");
    pabrikList.value = (data.data || []).map((p: any) => ({ Kode: p.Kode, Nama: p.Nama }));
  } catch (e) {
    toast.error(getErrorMessage(e, "Gagal memuat daftar pabrik"));
  }
});
</script>

<template>
  <div class="panel">
    <div class="toolbar">
      <div class="tb-left">
        <span class="tool-icon"><MsIcon name="fact_check" :size="16" /></span>
        <span class="tool-title">Staff Movement Bulanan</span>
        <span class="tool-sub">Rekap perpindahan karyawan per bagian — meniru ufrmProsesSMBulanan</span>
      </div>
      <div class="tb-right">
        <label class="fld">
          Pabrik
          <select v-model="pabrik" :disabled="loading" @change="gantiFilter">
            <option value="">— pilih pabrik —</option>
            <option v-for="p in pabrikList" :key="p.Kode" :value="p.Kode">{{ p.Kode }} — {{ p.Nama }}</option>
          </select>
        </label>
        <label class="fld">
          Tahun
          <select v-model="tahun" :disabled="loading" @change="gantiFilter">
            <option v-for="y in TAHUN_OPSI" :key="y" :value="y">{{ y }}</option>
          </select>
        </label>
        <label class="fld">
          Bulan
          <select v-model="bulan" :disabled="loading" @change="gantiFilter">
            <option v-for="(n, i) in NAMA_BULAN" :key="n" :value="i">{{ n }}</option>
          </select>
        </label>
        <button class="btn" title="Muat data" :disabled="loading" @click="muat"><MsIcon name="refresh" :size="15" /></button>
        <button class="btn" title="Export Excel" :disabled="!pabrik || loading" @click="ekspor"><MsIcon name="file_download" :size="15" /></button>
        <button class="btn" title="Tutup" @click="tutup"><MsIcon name="close" :size="15" /></button>
      </div>
    </div>

    <div class="body">
      <div v-if="pabrik" class="grid-wrap">
        <table class="sm-grid">
          <thead>
            <tr>
              <th rowspan="2" class="bagian klik-sort" :class="{ terurut: sortKey === 'bagian' }" title="Klik untuk mengurutkan" @click="klikSort('bagian')">
                <span class="th-line">
                  <span>Bagian<MsIcon v-if="sortKey === 'bagian'" :name="sortIconName('bagian', sortKey, sortDir)" :size="11" /></span>
                  <button
                    type="button"
                    class="th-filter"
                    :class="{ aktif: isFilterActive('bagian') || openFilter === 'bagian' }"
                    title="Filter bagian"
                    @click.stop="klikFilter(DAFTAR_FILTER[0], $event)"
                  >
                    <MsIcon :name="isFilterActive('bagian') ? 'filter_alt' : 'filter_list'" :size="12" />
                  </button>
                  <ColumnFilterPopup
                    v-if="openFilter === 'bagian' && filterAnchor"
                    :anchor="filterAnchor"
                    col-label="Bagian"
                    column-type="string"
                    filter-value-type="string"
                    combine-blank-values
                    :selected="filterSets['bagian'] || []"
                    :fetch-values="() => nilaiKolom(DAFTAR_FILTER[0])"
                    @apply="terapkanFilter(DAFTAR_FILTER[0], $event)"
                    @close="openFilter = null"
                    @click.stop
                  />
                </span>
              </th>
              <th v-for="g in GRUP_KOLOM" :key="g.key" :colspan="g.kolom.length" class="grup">{{ g.label }}</th>
            </tr>
            <tr>
              <template v-for="g in GRUP_KOLOM" :key="g.key">
                <th v-for="k in g.kolom" :key="k.key" class="klik-sort" :class="{ terurut: sortKey === k.key }" title="Klik untuk mengurutkan" @click="klikSort(k.key)">
                  <span class="th-line">
                    <span>{{ k.label }}<MsIcon v-if="sortKey === k.key" :name="sortIconName(k.key, sortKey, sortDir)" :size="11" /></span>
                    <button
                      type="button"
                      class="th-filter"
                      :class="{ aktif: isFilterActive(k.key) || openFilter === k.key }"
                      title="Filter kolom ini"
                      @click.stop="klikFilter(mapFilter(k.key), $event)"
                    >
                      <MsIcon :name="isFilterActive(k.key) ? 'filter_alt' : 'filter_list'" :size="12" />
                    </button>
                  </span>
                  <ColumnFilterPopup
                    v-if="openFilter === k.key && filterAnchor"
                    :anchor="filterAnchor"
                    :col-label="mapFilter(k.key).label"
                    column-type="number"
                    filter-value-type="number"
                    :selected="filterSets[k.key] || []"
                    :fetch-values="() => nilaiKolom(mapFilter(k.key))"
                    @apply="terapkanFilter(mapFilter(k.key), $event)"
                    @close="openFilter = null"
                    @click.stop
                  />
                </th>
              </template>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td :colspan="TOTAL_KOLOM + 1" class="empty">Memuat…</td>
            </tr>
            <tr v-else-if="rows.length && !barisTampil.length">
              <td :colspan="TOTAL_KOLOM + 1" class="empty">
                Tidak ada baris yang cocok dengan filter.
                <button class="btn-mini" @click="bersihkanFilter">Bersihkan filter</button>
              </td>
            </tr>
            <tr v-else-if="!rows.length">
              <td :colspan="TOTAL_KOLOM + 1" class="empty">Tidak ada data — tahun ini belum punya budget MPP dan tidak ada movement pada {{ NAMA_BULAN[bulan] }} {{ tahun }}.</td>
            </tr>
            <template v-else>
              <tr v-for="r in barisTampil" :key="r.bagian">
                <td class="bagian">{{ r.bagian }}</td>
                <template v-for="g in GRUP_KOLOM" :key="g.key">
                  <td v-for="k in g.kolom" :key="k.key" class="num" :class="{ klik: k.detail }" @click="bukaDetail(r, k)">
                    {{ formatNumber(r[k.key]) }}
                  </td>
                </template>
              </tr>
            </template>
          </tbody>
          <tfoot v-if="barisTampil.length">
            <tr>
              <td class="bagian">Total</td>
              <template v-for="g in GRUP_KOLOM" :key="g.key">
                <td v-for="k in g.kolom" :key="k.key" class="num">{{ formatNumber(totalBaris[k.key]) }}</td>
              </template>
            </tr>
          </tfoot>
        </table>
        <p v-if="rows.length && sumber === 'mutasi'" class="hint warn">
          Budget MPP {{ tahun }} belum diisi — daftar bagian diambil dari movement Karyawan Baru / Mutasi / Keluar pada {{ NAMA_BULAN[bulan] }} {{ tahun }}. Isi Setting Budget MPP untuk rekap lengkap semua bagian.
        </p>
        <p v-else class="hint">Klik sel angka untuk melihat daftar NIK / Nama / Tanggal di balik hitungan itu.</p>
      </div>
      <p v-else class="empty">Pilih pabrik untuk menampilkan data.</p>

      <div v-if="detailOpen" class="overlay" @click.self="tutupDetail">
        <section class="dialog" role="dialog" aria-modal="true">
          <header>
            <h3>
              {{ detailInfo?.label }} — {{ detailInfo?.bagian }}
              <small>{{ NAMA_BULAN[bulan] }} {{ tahun }}</small>
            </h3>
            <button class="btn" @click="tutupDetail"><MsIcon name="close" :size="16" /></button>
          </header>
          <div class="dialog-body">
            <p v-if="detailLoading" class="empty">Memuat…</p>
            <p v-else-if="!detailRows.length" class="empty">Tidak ada data.</p>
            <table v-else class="detail-grid">
              <thead>
                <tr><th>NIK</th><th>Nama</th><th>Tanggal</th></tr>
              </thead>
              <tbody>
                <tr v-for="(d, i) in detailRows" :key="`${d.nik}-${i}`">
                  <td>{{ d.nik }}</td>
                  <td>{{ d.nama }}</td>
                  <td>{{ formatTanggal(d.tanggal) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.panel {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--ds-border, #b0b8c4);
  background: var(--ds-surface, #f0f3f8);
}
.toolbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  background: var(--ds-surface-variant, #e0e4ea);
  border-bottom: 1px solid var(--ds-border, #b0b8c4);
  flex-wrap: wrap;
}
.tb-left,
.tb-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.tool-icon {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ds-primary, #3b5998);
  color: #fff;
}
.tool-title {
  font-size: 13px;
  font-weight: 800;
  color: var(--ds-on-surface, #1b2d4a);
}
.tool-sub {
  font-size: 11px;
  color: #6b7a90;
  border-left: 1px solid #b0b8c4;
  padding-left: 8px;
}
.fld {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  font-weight: 700;
  color: #55637a;
  text-transform: uppercase;
}
.fld select,
.fld input {
  border: 1px solid #c3cad4;
  padding: 4px 7px;
  font-size: 11.5px;
  font-family: "Plus Jakarta Sans", sans-serif;
  background: #fff;
  color: var(--ds-on-surface, #1b2d4a);
}
.btn {
  height: 28px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  border: 1px solid var(--ds-border, #b0b8c4);
  background: #fff;
  cursor: pointer;
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: 11.5px;
  font-weight: 700;
  color: var(--ds-on-surface, #1b2d4a);
}
.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.body {
  padding: 12px;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.grid-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
  background: #fff;
  border: 1px solid var(--ds-border, #b0b8c4);
}
.sm-grid {
  border-collapse: collapse;
  font-size: 11.5px;
  white-space: nowrap;
  width: max-content;
  min-width: 100%;
}
.sm-grid th {
  position: sticky;
  background: var(--ds-primary, #3b5998);
  color: #fff;
  font-weight: 700;
  padding: 5px 9px;
  border: 1px solid #2c4472;
  text-align: center;
}
.sm-grid thead tr:nth-child(2) th {
  background: #4a67a8;
}
.sm-grid td {
  border: 1px solid #d9dee8;
  padding: 4px 9px;
}
.sm-grid td.bagian,
.sm-grid th.bagian {
  min-width: 180px;
  text-align: left;
  background: #eef1f6;
  font-weight: 700;
  position: sticky;
  left: 0;
  z-index: 1;
}
/* Header bagian harus kontras — dulu teks putih jatuh di atas abu muda. */
.sm-grid th.bagian {
  color: #fff;
  background: #3f5c9e;
  z-index: 3;
}
.sm-grid tfoot td.bagian {
  background: #e0e4ea;
}
.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
  min-width: 60px;
}
.klik {
  cursor: pointer;
}
.klik:hover {
  background: rgba(59, 89, 152, 0.12);
}
.th-line {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.klik-sort {
  cursor: pointer;
  user-select: none;
}
.klik-sort:hover {
  filter: brightness(1.08);
}
.klik-sort.terurut {
  text-decoration: underline;
  text-underline-offset: 3px;
}
.th-filter {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  padding: 0;
  margin-left: 4px;
  border: 1px solid transparent;
  border-radius: 3px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.th-filter:hover {
  background: #fff;
  color: var(--ds-primary, #3b5998);
}
.th-filter.aktif {
  background: #fff;
  color: var(--ds-primary, #3b5998);
}
.btn-mini {
  border: 1px solid var(--ds-border, #b0b8c4);
  background: #fff;
  cursor: pointer;
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: 11px;
  font-weight: 700;
  color: var(--ds-primary, #3b5998);
  padding: 2px 8px;
  margin-left: 6px;
}
tfoot .num {
  font-weight: 800;
  background: #eef1f6;
}
.empty {
  text-align: center;
  color: #8995a6;
  font-size: 12px;
  padding: 10px;
}
.hint {
  flex-shrink: 0;
  margin: 8px 0 0;
  color: #8995a6;
  font-size: 11px;
}
.hint.warn {
  color: #a2701c;
  background: #fdf4dd;
  border: 1px solid #ecd9a0;
  padding: 6px 10px;
}
.overlay {
  position: fixed;
  inset: 0;
  background: rgb(15 27 47 / 45%);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 60;
  padding: 16px;
}
.dialog {
  width: min(520px, 100%);
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  background: #fff;
  border: 1px solid var(--ds-border, #b0b8c4);
}
.dialog > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--ds-border, #b0b8c4);
  background: var(--ds-surface-variant, #e0e4ea);
}
.dialog h3 {
  margin: 0;
  font-size: 13px;
  color: var(--ds-on-surface, #1b2d4a);
}
.dialog h3 small {
  display: block;
  font-weight: 600;
  color: #6b7a90;
}
.dialog-body {
  overflow: auto;
  padding: 12px;
}
.detail-grid {
  border-collapse: collapse;
  width: 100%;
  font-size: 11.5px;
}
.detail-grid th {
  background: #eef1f6;
  border: 1px solid #d9dee8;
  padding: 4px 8px;
  text-align: left;
  font-weight: 800;
  color: var(--ds-on-surface, #1b2d4a);
}
.detail-grid td {
  border: 1px solid #d9dee8;
  padding: 4px 8px;
}
</style>
