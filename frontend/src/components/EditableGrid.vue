<script setup lang="ts">
import { ref } from "vue";
import { formatNumber } from "@/utils/format";

/**
 * Grid standar untuk form berbasis spreadsheet (Setting Gaji / Proses Gaji).
 *
 * Kolom bertipe `edit: "number"` merender input angka (request body disimpan
 * apa adanya); `edit: "check"` merender checkbox (nilai dipertahankan 1/0
 * seperti di Delphi). Sel yang diedit ditandai kuning dan memicu event
 * `update` — komponen induk memakai ini untuk menyesuaikan kolom turunan
 * (mis. Total pada Proses Gaji).
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
  }>(),
  { primaryKey: "nik", maxHeight: "62vh" }
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
              :style="{
                width: c.width || 'auto',
                textAlign: c.align || (c.edit === 'number' || c.money ? 'right' : 'left'),
              }"
              :title="c.title"
            >
              {{ c.label }}
            </th>
          </template>
        </tr>
      </thead>
      <tbody>
        <tr v-if="loading">
          <td class="status" :colspan="columns.length">Memuat data...</td>
        </tr>
        <tr v-else-if="!rows.length">
          <td class="status" :colspan="columns.length">Belum ada data.</td>
        </tr>
        <tr v-for="(row, i) in rows" :key="row[primaryKey] ?? i">
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