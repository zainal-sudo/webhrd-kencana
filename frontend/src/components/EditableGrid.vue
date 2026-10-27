<script setup lang="ts">
import { computed, reactive, ref, shallowRef, watch } from "vue";
import { formatNumber } from "@/utils/format";
import { filterKey } from "@/utils/columnFilter";
import { compareValues } from "@/utils/table";
import MsIcon from "@/components/MsIcon.vue";
import ColumnFilterPopup from "@/components/ColumnFilterPopup.vue";

/**
 * Grid standar untuk form berbasis spreadsheet (Setting Gaji / Proses Gaji).
 *
 * Kolom bertipe `edit: "number"` merender input angka (request body disimpan
 * apa adanya); `edit: "check"` merender checkbox (nilai dipertahankan 1/0
 * seperti di Delphi). Sel yang diedit ditandai kuning dan memicu event
 * `update` — komponen induk memakai ini untuk menyesuaikan kolom turunan
 * (mis. Total pada Proses Gaji).
 *
 * Prop opsional:
 *   sortable  -> klik header mengurutkan baris (klik berulang: naik/turun/mati)
 *   showTotal -> baris kaki berisi jumlah kolom angka + hitungan baris tampil
 *   filterable-> tombol filter di header; checklist nilai kolom (data sudah
 *                utuh di memori, jadi penyaringan berjalan di sisi klien).
 *                Baris tersaring tetap milik `rows` induk — penyimpanan
 *                induk tetap mengirim semuanya, seperti CDS Delphi.
 */

export interface GridCol {
  key: string;
  label: string;
  width?: string;
  align?: "left" | "center" | "right";
  edit?: "number" | "check";
  money?: boolean;
  title?: string;
}

export interface GridUpdate {
  row: Record<string, any>;
  col: GridCol;
  oldValue: any;
  newValue: any;
}

const props = withDefaults(
  defineProps<{
    columns: GridCol[];
    rows: Record<string, any>[];
    loading?: boolean;
    primaryKey?: string;
    maxHeight?: string;
    sortable?: boolean;
    showTotal?: boolean;
    filterable?: boolean;
  }>(),
  { primaryKey: "nik", maxHeight: "62vh", sortable: false, showTotal: false, filterable: false }
);

const emit = defineEmits<{ (e: "update", payload: GridUpdate): void }>();

const selDirty = ref<Set<string>>(new Set());
const meta = new Map<string, { col: GridCol; old: any }>();

function kunci(row: Record<string, any>, col: GridCol): string {
  return `${row[props.primaryKey]}|${col.key}`;
}

function tandai(row: Record<string, any>, col: GridCol) {
  const k = kunci(row, col);
  if (!meta.has(k)) meta.set(k, { col, old: row[col.key] });
  const s = new Set(selDirty.value);
  s.add(k);
  selDirty.value = s;
}

/**
 * Menandai sel kuning saat mengetik TANPA menyentuh state reaktif —
 * re-render (ganti Set / tulis row) menimpa kembali nilai input dari
 * binding :value dan ketikan jadi tidak bisa masuk. Reset kelas DOM
 * tidak masalah: sel tetap tersimpan di `selDirty` saat commit.
 */
function tandaiMengetik(ev: Event) {
  (ev.target as HTMLInputElement).closest("td")?.classList.add("dirty");
}

/**
 * Parsing angka format Indonesia pada editor teks: "50.000" -> 50000
 * (pemisah ribuan), "12,5" -> 12.5 (desimal koma), "1000" -> 1000.
 * Mengembalikan NaN jika bukan angka supaya commit memakih nilai lama.
 */
function parseAngka(raw: string): number {
  const s = raw.trim();
  if (!s) return 0;
  let t = s.replace(/[^\d.,eE+-]/g, "");
  if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  else if (t.includes(",")) t = t.replace(/\./g, "").replace(/,/g, ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

function commit(row: Record<string, any>, col: GridCol, ev: Event) {
  const k = kunci(row, col);
  const m = meta.get(k);
  const oldValue = m ? m.old : row[col.key];
  const nilai = parseAngka((ev.target as HTMLInputElement).value);
  row[col.key] = Number.isFinite(nilai) ? nilai : oldValue;
  tandai(row, col);
  emit("update", { row, col, oldValue, newValue: row[col.key] });
}

function commitCheck(ev: Event, row: Record<string, any>, col: GridCol) {
  const oldValue = Number(row[col.key]) ? 1 : 0;
  const newValue = (ev.target as HTMLInputElement).checked ? 1 : 0;
  row[col.key] = newValue;
  tandai(row, col);
  emit("update", { row, col, oldValue, newValue });
}

/** Nilai baris untuk penyaringan: checkbox dinormalisasi ke 1/0. */
function nilaiFilter(row: Record<string, any>, c: GridCol): string | number | null {
  if (c.edit === "check") return Number(row[c.key]) ? 1 : 0;
  const v = row[c.key];
  return v === undefined ? null : v;
}

const filterSets = reactive<Record<string, string[]>>({});
const openFilter = ref<string | null>(null);
const filterAnchor = shallowRef<HTMLElement | null>(null);

function isFilterActive(c: GridCol): boolean {
  return !!filterSets[c.key]?.length;
}

function toggleFilter(c: GridCol, event: MouseEvent) {
  filterAnchor.value = event.currentTarget as HTMLElement;
  openFilter.value = openFilter.value === c.key ? null : c.key;
}

function tipeFilter(c: GridCol) {
  return c.edit === "number" || c.money || c.align === "right" ? "number" : "string";
}

function nilaiKolom(c: GridCol): Promise<(string | number | null)[]> {
  const ada = new Set<(string | number | null)>();
  for (const r of props.rows) ada.add(nilaiFilter(r, c));
  // Daftar nilai diurutkan (angka menaik, NULL paling akhir) supaya nilai
  // kecil seperti 0 langsung terlihat tanpa menggulir.
  return Promise.resolve([...ada].sort(compareValues));
}

function terapkanFilter(c: GridCol, values: string[]) {
  if (values.length) filterSets[c.key] = values;
  else delete filterSets[c.key];
  openFilter.value = null;
}

function bersihkanFilter() {
  for (const k of Object.keys(filterSets)) delete filterSets[k];
  openFilter.value = null;
}

/**
 * Hasil filter dikunci (snapshot) saat filter diterapkan: mengedit nilai di
 * kolom yang sedang difilter TIDAK mengusir barisnya dari tampilan (seperti
 * cxGrid Delphi) — baris cukup ditandai kuning; data yang disimpan tetap semua.
 */
const cocok = ref<Set<Record<string, any>> | null>(null);

function bangunCocok() {
  const aktif = Object.entries(filterSets).filter(([, v]) => v.length > 0);
  if (!aktif.length) {
    cocok.value = null;
    return;
  }
  const byKey = new Map(props.columns.map((c) => [c.key, c]));
  const set = new Set<Record<string, any>>();
  for (const r of props.rows) {
    if (aktif.every(([key, values]) => {
      const c = byKey.get(key);
      if (!c) return true;
      return values.includes(filterKey(nilaiFilter(r, c)));
    })) {
      set.add(r);
    }
  }
  cocok.value = set;
}

watch([() => props.rows, () => JSON.stringify(filterSets)], bangunCocok, { immediate: true });

const tersaring = computed(() =>
  cocok.value ? props.rows.filter((r) => cocok.value!.has(r)) : props.rows
);

/** Urutan tampil: klik header -> naik -> turun -> semula (stabil). */
const sortKey = ref<string | null>(null);
const sortDir = ref<1 | -1>(1);

function klikHeader(c: GridCol) {
  if (!props.sortable) return;
  if (sortKey.value !== c.key) {
    sortKey.value = c.key;
    sortDir.value = 1;
  } else if (sortDir.value === 1) {
    sortDir.value = -1;
  } else {
    sortKey.value = null;
    sortDir.value = 1;
  }
}

function banding(a: any, b: any): number {
  const na = Number(a);
  const nb = Number(b);
  const angka =
    a !== "" && a !== null && a !== undefined && Number.isFinite(na) &&
    b !== "" && b !== null && b !== undefined && Number.isFinite(nb);
  if (angka) return na - nb;
  return String(a ?? "").localeCompare(String(b ?? ""), "id");
}

const tampil = computed(() => {
  if (!props.sortable || !sortKey.value) return tersaring.value;
  const salin = [...tersaring.value];
  const kunci = sortKey.value;
  const arah = sortDir.value;
  salin.sort((x, y) => banding(x[kunci], y[kunci]) * arah);
  return salin;
});

/** Kolom angka (dijumlahkan di kaki): uang, bisa diedit, atau rata kanan. */
function adalahAngka(c: GridCol): boolean {
  return !!c.money || !!c.edit || c.align === "right";
}

function jumlahKol(c: GridCol): number {
  let total = 0;
  for (const r of tampil.value) total += Number(r[c.key]) || 0;
  return total;
}

defineExpose({
  reset() {
    selDirty.value = new Set();
    meta.clear();
  },
  bersihkanFilter,
  hitungFilter() {
    return Object.values(filterSets).filter((v) => v.length > 0).length;
  },
});
</script>

<template>
  <div class="grid-wrap" :style="{ maxHeight: props.maxHeight }">
    <table class="grid">
      <thead>
        <tr>
          <template v-for="c in columns" :key="c.key">
            <th
              :class="{ sortable: props.sortable }"
              :style="{
                width: c.width || 'auto',
                textAlign: c.align || (c.edit === 'number' || c.money ? 'right' : 'left'),
              }"
              :title="c.title || (props.sortable ? 'Klik untuk mengurutkan' : undefined)"
              @click="klikHeader(c)"
            >
              <span class="th-line">
                <span class="th-label"
                  >{{ c.label }}<span v-if="props.sortable && sortKey === c.key" class="panah">{{
                    sortDir === 1 ? " ▲" : " ▼"
                  }}</span></span
                >
                <button
                  v-if="props.filterable"
                  type="button"
                  class="th-filter"
                  :class="{ aktif: isFilterActive(c) || openFilter === c.key }"
                  title="Filter kolom ini"
                  @click.stop="toggleFilter(c, $event)"
                >
                  <MsIcon :name="isFilterActive(c) ? 'filter_alt' : 'filter_list'" :size="12" />
                </button>
              </span>
              <ColumnFilterPopup
                v-if="props.filterable && openFilter === c.key && filterAnchor"
                :anchor="filterAnchor"
                :col-label="c.label"
                :column-type="tipeFilter(c)"
                :filter-value-type="tipeFilter(c)"
                combine-blank-values
                :selected="filterSets[c.key] || []"
                :fetch-values="() => nilaiKolom(c)"
                @apply="terapkanFilter(c, $event)"
                @close="openFilter = null"
                @click.stop
              />
            </th>
          </template>
        </tr>
      </thead>
      <tbody>
        <tr v-if="loading">
          <td class="status" :colspan="columns.length">Memuat data...</td>
        </tr>
        <tr v-else-if="!tampil.length">
          <td class="status" :colspan="columns.length">Belum ada data.</td>
        </tr>
          <tr v-for="(row, i) in tampil" :key="row[primaryKey] ?? i">
          <!--
            Sel edit: check = checkbox; number = input teks (bukan
            type="number", yang menghapus ketikan "50.000"/"12,5" saat blur).
          -->
          <template v-for="c in columns" :key="c.key">
            <td
              :class="[
                c.align || (c.edit === 'number' || c.money ? 'kanan' : ''),
                selDirty.has(`${row[primaryKey]}|${c.key}`) ? 'dirty' : '',
              ]"
              :style="{ width: c.width || 'auto' }"
            >
              <input
                v-if="c.edit === 'check'"
                type="checkbox"
                :checked="!!Number(row[c.key])"
                @change="commitCheck($event, row, c)"
              />
              <!--
                Editor teks (bukan type=number): browser menghapus ketikan
                "50.000"/"12,5" yang tidak valid pada blur. Input menampilkan
                semua tombol seperti cxGrid Delphi; parsing angka di commit.
              -->
              <input
                v-else-if="c.edit === 'number'"
                class="cel"
                type="text"
                inputmode="decimal"
                :value="row[c.key]"
                @input="tandaiMengetik"
                @change="commit(row, c, $event)"
              />
              <span v-else class="txt">{{ c.money ? formatNumber(row[c.key]) : row[c.key] ?? "" }}</span>
            </td>
          </template>
        </tr>
      </tbody>
      <tfoot v-if="props.showTotal && !loading">
        <tr>
          <template v-for="(c, ci) in columns" :key="c.key">
            <td
              :class="[c.align || (c.edit === 'number' || c.money ? 'kanan' : '')]"
              :style="{ width: c.width || 'auto' }"
            >
              <span v-if="ci === 0" class="txt total-label">{{ tampil.length }} baris</span>
              <span v-else-if="adalahAngka(c)" class="txt">{{ formatNumber(jumlahKol(c)) }}</span>
            </td>
          </template>
        </tr>
      </tfoot>
    </table>
  </div>
</template>

<style scoped>
.grid-wrap {
  overflow: auto;
  border: 1px solid var(--ds-border, #b0b8c4);
  background: #fff;
}
.grid {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 11.5px;
  white-space: nowrap;
}
.grid th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--ds-surface-variant, #e0e4ea);
  border: 1px solid var(--ds-border, #b0b8c4);
  border-left-width: 0;
  background-clip: border-box;
  padding: 5px 7px;
  font-weight: 800;
  color: var(--ds-on-surface, #1b2d4a);
}
.grid th.sortable {
  cursor: pointer;
  user-select: none;
}
.grid th.sortable:hover {
  background: #d3d9e2;
}
.grid th .panah {
  font-size: 10px;
}
.th-line {
  display: inline-flex;
  align-items: center;
  gap: 4px;
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
  border-color: var(--ds-border, #b0b8c4);
  background: #fff;
}
.th-filter.aktif {
  background: var(--ds-primary, #3b5998);
  border-color: var(--ds-primary-dark, #2c4472);
  color: #fff;
}
.grid tfoot td {
  position: sticky;
  bottom: 0;
  z-index: 1;
  background: var(--ds-surface-variant, #e0e4ea);
  border: 1px solid var(--ds-border, #b0b8c4);
  border-top: 2px solid var(--ds-primary, #3b5998);
  padding: 5px 7px;
  font-weight: 800;
  color: var(--ds-on-surface, #1b2d4a);
}
.grid tfoot .total-label {
  font-weight: 800;
}
.grid td {
  border: 1px solid #d5dbe3;
  border-top-width: 0;
  border-left-width: 0;
  padding: 3px 7px;
  min-width: 40px;
  background: #fff;
}
.grid tr > :first-child { border-left-width: 1px; }
/* Keep totals above the dedicated horizontal scrollbar, not underneath it. */
.grid-wrap.split-scrollbar .grid tfoot td { bottom: var(--ds-horizontal-scrollbar-size, 14px); }
.grid td.kanan {
  text-align: right;
}
.grid td.dirty {
  background: #fff7d6;
}
.grid td.dirty .cel,
.grid td.dirty .txt {
  background: #fff7d6;
}
.grid .txt {
  display: inline-block;
  min-height: 18px;
}
.grid .cel {
  width: 100%;
  min-width: 64px;
  border: 1px solid transparent;
  background: transparent;
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: 11.5px;
  padding: 1px 3px;
  text-align: right;
  box-sizing: border-box;
}
.grid .cel:focus {
  outline: 1px solid var(--ds-primary, #3b5998);
  border-color: var(--ds-primary, #3b5998);
  background: #fff;
}
.grid td.status {
  text-align: center;
  padding: 24px;
  color: #8995a6;
}
</style>
