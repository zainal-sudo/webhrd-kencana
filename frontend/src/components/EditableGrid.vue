<script setup lang="ts">
import { computed, ref } from "vue";
import { formatNumber } from "@/utils/format";

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
  }>(),
  { primaryKey: "nik", maxHeight: "62vh", sortable: false, showTotal: false }
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

function commit(row: Record<string, any>, col: GridCol, ev: Event) {
  const k = kunci(row, col);
  const m = meta.get(k);
  const oldValue = m ? m.old : row[col.key];
  const raw = (ev.target as HTMLInputElement).value;
  const nilai = raw === "" ? 0 : Number(raw);
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
  if (!props.sortable || !sortKey.value) return props.rows;
  const salin = [...props.rows];
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
              {{ c.label }}<span v-if="props.sortable && sortKey === c.key" class="panah">{{
                sortDir === 1 ? " ▲" : " ▼"
              }}</span>
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
              <input
                v-else-if="c.edit === 'number'"
                class="cel"
                type="number"
                step="any"
                :value="row[c.key]"
                @input="tandai(row, c)"
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
  border-collapse: collapse;
  font-size: 11.5px;
  white-space: nowrap;
}
.grid th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--ds-surface-variant, #e0e4ea);
  border: 1px solid var(--ds-border, #b0b8c4);
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
  padding: 3px 7px;
  min-width: 40px;
  background: #fff;
}
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