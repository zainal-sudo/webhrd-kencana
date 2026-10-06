<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import MsIcon from "@/components/MsIcon.vue";
import ColumnFilterPopup from "@/components/ColumnFilterPopup.vue";
import { api, getErrorMessage } from "@/api/axios";
import { useTabsStore } from "@/stores/tabsStore";
import { formatDateInput, todaySql } from "@/utils/format";
import { fotoUrl } from "@/utils/foto";
import type { BrowseColumn } from "@/types";

const props = withDefaults(
  defineProps<{
    moduleTitle: string;
    moduleSubtitle?: string;
    endpoint: string;
    columns: BrowseColumn[];
    searchPlaceholder?: string;
    hasPeriod?: boolean;
    periodStartKey?: string;
    periodEndKey?: string;
    primaryKey: string;
    addLabel?: string;
    addFormPath?: string;
    editFormPath?: string;
    canDelete?: boolean;
    /** tampilkan tombol print di tiap baris (emit 'print' dengan data baris) */
    printable?: boolean;
    defaultStart?: string;
    /** Jumlah baris per halaman. Naikkan turunkan sesuai kepadatan tabel. */
    perPage?: number;
  }>(),
  {
    moduleSubtitle: "",
    searchPlaceholder: "Cari...",
    hasPeriod: false,
    periodStartKey: "start_date",
    periodEndKey: "end_date",
    addLabel: "Tambah",
    canDelete: true,
    printable: false,
    perPage: 25,
  }
);

const emit = defineEmits<{
  (e: "print", row: Record<string, any>): void;
  /** Dipanggil saat thumbnail foto diklik. Kolom harus bertipe "image". */
  (e: "preview-image", row: Record<string, any>): void;
}>();

const router = useRouter();
const toast = useToast();
const tabsStore = useTabsStore();

const rows = ref<Record<string, any>[]>([]);
const loading = ref(false);
const search = ref("");
const startDate = ref(props.defaultStart || "");
const endDate = ref(todaySql());
const page = ref(1);
const perPage = ref(props.perPage);
const total = ref(0);
const lastPage = ref(1);

// ── Sort & filter per kolom (server-side, popup checklist di header) ──
const sortBy = ref<string | null>(null);
const sortDir = ref<"asc" | "desc" | null>(null);
const filterSets = reactive<Record<string, string[]>>({});
const openFilterKey = ref<string | null>(null);

const hasActiveFilters = computed(() =>
  Object.values(filterSets).some((arr) => Array.isArray(arr) && arr.length > 0)
);

function isSortable(col: BrowseColumn): boolean {
  return col.sortable !== false;
}

function isFilterable(col: BrowseColumn): boolean {
  return col.filterable !== false;
}

function toggleSort(col: BrowseColumn) {
  if (!isSortable(col)) return;
  if (sortBy.value !== col.key) {
    sortBy.value = col.key;
    sortDir.value = "asc";
  } else if (sortDir.value === "asc") {
    sortDir.value = "desc";
  } else {
    sortBy.value = null;
    sortDir.value = null;
  }
  page.value = 1;
  fetchData();
}

function sortIcon(col: BrowseColumn): string {
  if (sortBy.value !== col.key || !sortDir.value) return "unfold_more";
  return sortDir.value === "asc" ? "arrow_upward" : "arrow_downward";
}

function clearFilters() {
  for (const k of Object.keys(filterSets)) {
    delete filterSets[k];
  }
  page.value = 1;
  fetchData();
}

function toggleFilterPopup(col: BrowseColumn) {
  if (!isFilterable(col)) return;
  openFilterKey.value = openFilterKey.value === col.key ? null : col.key;
}

function isFilterActive(col: BrowseColumn): boolean {
  return !!filterSets[col.key] && filterSets[col.key].length > 0;
}

async function fetchDistinct(col: BrowseColumn): Promise<(string | number)[]> {
  const params: Record<string, any> = { distinct: col.key };
  if (search.value.trim()) params.search = search.value.trim();
  if (props.hasPeriod && startDate.value && endDate.value) {
    params[props.periodStartKey] = startDate.value;
    params[props.periodEndKey] = endDate.value;
  }
  // Sertakan filter kolom lain agar daftar menyempit (seperti Excel),
  // kecuali kolom ini sendiri.
  for (const [k, arr] of Object.entries(filterSets)) {
    if (k !== col.key && Array.isArray(arr) && arr.length > 0) {
      params[`filterSet_${k}`] = arr;
    }
  }
  const { data } = await api.get(props.endpoint, { params });
  return (data.data || []) as (string | number)[];
}

function applyFilterSet(col: BrowseColumn, values: string[]) {
  if (values.length === 0) {
    delete filterSets[col.key];
  } else {
    filterSets[col.key] = values;
  }
  openFilterKey.value = null;
  page.value = 1;
  fetchData();
}

const deleteDialog = ref(false);
const deletingKey = ref<string | null>(null);
const deletingLabel = ref("");

async function fetchData() {
  loading.value = true;
  try {
    const params: Record<string, any> = { page: page.value, per_page: perPage.value };
    if (search.value.trim()) params.search = search.value.trim();
    if (sortBy.value && sortDir.value) {
      params.sort_by = sortBy.value;
      params.sort_dir = sortDir.value;
    }
    for (const [k, arr] of Object.entries(filterSets)) {
      if (Array.isArray(arr) && arr.length > 0) params[`filterSet_${k}`] = arr;
    }
    if (props.hasPeriod && startDate.value && endDate.value) {
      params[props.periodStartKey] = startDate.value;
      params[props.periodEndKey] = endDate.value;
    }
    const { data } = await api.get(props.endpoint, { params });
    rows.value = data.data || [];
    // Foto yang sebelumnya gagal dimuat dicoba ulang — berkasnya bisa saja
    // baru saja diunggah/diperbaiki di server bukti.
    for (const k of Object.keys(brokenFotos)) delete brokenFotos[k];
    const p = data.pagination;
    if (p) {
      total.value = p.total;
      page.value = p.page;
      perPage.value = p.per_page;
      lastPage.value = p.last_page || 1;
    }
  } catch (e: any) {
    toast.error(getErrorMessage(e));
  } finally {
    loading.value = false;
  }
}

const timeoutId = ref<number | undefined>(undefined);
function onSearch() {
  if (timeoutId.value) window.clearTimeout(timeoutId.value);
  timeoutId.value = window.setTimeout(() => {
    page.value = 1;
    fetchData();
  }, 350);
}

function refresh() {
  fetchData();
}

function goToPage(p: number) {
  page.value = p;
  fetchData();
}

function addNew() {
  if (!props.addFormPath) return;
  tabsStore.openTab({
    title: `Tambah ${props.addLabel}`,
    path: props.addFormPath,
    icon: "mdi mdi-plus-box-outline",
    closable: true,
  });
  router.push(props.addFormPath);
}

function editRow(row: Record<string, any>) {
  if (!props.editFormPath) return;
  const id = row[props.primaryKey];
  const query = { id };
  tabsStore.openTab({
    title: `Edit ${id}`,
    path: props.editFormPath,
    query,
    icon: "mdi mdi-pencil-box-outline",
    closable: true,
  });
  router.push({ path: props.editFormPath, query });
}

function confirmDelete(row: Record<string, any>) {
  deletingKey.value = row[props.primaryKey];
  deletingLabel.value = row[props.columns.find((c) => c.key === "Nama")?.key || props.primaryKey] || "";
  deleteDialog.value = true;
}

async function doDelete() {
  if (!deletingKey.value) return;
  try {
    await api.delete(`${props.endpoint}/${deletingKey.value}`);
    toast.success("Data berhasil dihapus");
    deleteDialog.value = false;
    if (rows.value.length === 1 && page.value > 1) {
      page.value -= 1;
    }
    fetchData();
  } catch (e: any) {
    toast.error(getErrorMessage(e));
  }
}

function cellText(row: Record<string, any>, col: BrowseColumn): string {
  let v = row[col.key];
  if (v === null || v === undefined) return "";
  if (col.type === "image") return "";
  if (col.type === "date") {
    return typeof v === "string" ? v.slice(0, 10) : formatDateInput(v);
  }
  if (col.type === "datetime") {
    return typeof v === "string" ? v.replace("T", " ").slice(0, 16) : String(v);
  }
  return String(v);
}

// ── Thumbnail foto ──
// `brokenFotos` diisi saat <img> gagal dimuat (nama file ada di DB tapi berkas
// tidak ada di server bukti/) supaya menampilkan ikon, bukan gambar rusak.
const brokenFotos = reactive<Record<string, boolean>>({});

function thumbKey(row: Record<string, any>, col: BrowseColumn): string {
  return `${row[props.primaryKey] ?? ""}|${col.key}`;
}

function isBroken(row: Record<string, any>, col: BrowseColumn): boolean {
  return !!brokenFotos[thumbKey(row, col)];
}

function markBroken(row: Record<string, any>, col: BrowseColumn) {
  brokenFotos[thumbKey(row, col)] = true;
}

function openFoto(row: Record<string, any>, col: BrowseColumn) {
  if (!row[col.key] || isBroken(row, col)) return;
  emit("preview-image", row);
}

const fromRow = ref(0);
watch(
  () => [page.value, perPage.value, total.value],
  () => {
    if (total.value === 0) {
      fromRow.value = 0;
      return;
    }
    fromRow.value = (page.value - 1) * perPage.value + 1;
  },
  { immediate: true }
);

const toRow = ref(0);
watch(
  () => [page.value, perPage.value, total.value],
  () => {
    toRow.value = Math.min(page.value * perPage.value, total.value);
  },
  { immediate: true }
);

onMounted(() => {
  fetchData();
});
</script>

<template>
  <div class="browse-panel">
    <!-- Toolbar -->
    <div class="toolbar">
      <div class="toolbar-left">
        <span class="module-icon">
          <MsIcon name="table_view" :size="16" />
        </span>
        <span class="module-title">{{ moduleTitle }}</span>
        <span v-if="moduleSubtitle" class="module-sub">{{ moduleSubtitle }}</span>
      </div>
      <div class="toolbar-right">
        <div v-if="hasPeriod" class="period-fields">
          <label>Dari</label>
          <input v-model="startDate" type="date" @change="refresh" />
          <label>Sampai</label>
          <input v-model="endDate" type="date" @change="refresh" />
        </div>

        <div class="search-box">
          <MsIcon name="search" :size="15" />
          <input
            v-model="search"
            type="text"
            :placeholder="searchPlaceholder"
            @input="onSearch"
          />
        </div>

        <button
          v-if="hasActiveFilters"
          class="tool-btn ghost active"
          title="Bersihkan semua filter kolom"
          @click="clearFilters"
        >
          <MsIcon name="filter_list_off" :size="15" />
          <span class="filter-dot"></span>
        </button>

        <button class="tool-btn ghost" title="Muat ulang" @click="refresh">
          <MsIcon name="refresh" :size="15" />
        </button>

        <button v-if="addFormPath" class="tool-btn primary" @click="addNew">
          <MsIcon name="add" :size="15" />
          <span>{{ addLabel }}</span>
        </button>

        <!-- Tombol tambahan modul (mis. Ijin: tombol Kolektif V2 ala Delphi) -->
        <slot name="toolbar-extra"></slot>
      </div>
    </div>

    <!-- Table -->
    <div class="table-wrap">
      <table class="browse-table" :style="{ minWidth: columns.length * 130 + 'px' }">
        <thead>
          <tr>
            <th class="num-col">No</th>
            <th
              v-for="(col, idx) in columns"
              :key="col.key"
              :style="{ textAlign: col.align || 'left' }"
              :class="{ sortable: isSortable(col), sorted: sortBy === col.key }"
              :title="isSortable(col) ? 'Klik untuk mengurutkan' : ''"
              @click="toggleSort(col)"
            >
              <span class="th-label">{{ col.label }}</span>
              <MsIcon
                v-if="isSortable(col)"
                :name="sortIcon(col)"
                :size="13"
                className="th-sort"
              />
              <button
                v-if="isFilterable(col)"
                class="th-filter"
                :class="{ active: isFilterActive(col) || openFilterKey === col.key }"
                title="Filter kolom ini"
                @click.stop="toggleFilterPopup(col)"
              >
                <MsIcon :name="isFilterActive(col) ? 'filter_alt' : 'filter_list'" :size="13" />
                <span v-if="isFilterActive(col)" class="filter-dot"></span>
              </button>
              <ColumnFilterPopup
                v-if="openFilterKey === col.key"
                :class="{ 'align-right': idx > columns.length / 2 }"
                :col-label="col.label"
                :selected="filterSets[col.key] || []"
                :fetch-values="() => fetchDistinct(col)"
                @apply="(vals) => applyFilterSet(col, vals)"
                @close="openFilterKey = null"
                @click.stop
              />
            </th>
            <th class="action-col">Aksi</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td class="state-cell" :colspan="columns.length + 2">
              <span class="spinner"></span> Memuat data...
            </td>
          </tr>
          <tr v-else-if="rows.length === 0">
            <td class="state-cell" :colspan="columns.length + 2">
              <MsIcon name="inbox" :size="20" />
              Tidak ada data ditemukan
            </td>
          </tr>
          <tr
            v-for="(row, idx) in rows"
            :key="row[primaryKey] ?? idx"
            :class="{ odd: idx % 2 === 1 }"
          >
            <td class="num-col">{{ (page - 1) * perPage + idx + 1 }}</td>
            <td
              v-for="col in columns"
              :key="col.key"
              :class="{ 'foto-cell': col.type === 'image' }"
              :style="{ textAlign: col.align || 'left' }"
            >
              <!-- Kolom foto: thumbnail lazy-load, klik untuk preview penuh -->
              <template v-if="col.type === 'image'">
                <button
                  v-if="row[col.key] && !isBroken(row, col)"
                  class="foto-thumb"
                  title="Lihat foto"
                  @click="openFoto(row, col)"
                >
                  <img
                    :src="fotoUrl(row[col.key])"
                    :alt="row[col.key]"
                    loading="lazy"
                    decoding="async"
                    @error="markBroken(row, col)"
                  />
                </button>
                <span v-else-if="row[col.key]" class="foto-missing" title="Berkas tidak ditemukan">
                  <MsIcon name="broken_image" :size="16" />
                </span>
                <span v-else class="foto-empty-cell">-</span>
              </template>
              <template v-else>{{ cellText(row, col) }}</template>
            </td>
            <td class="action-col">
              <div class="row-actions">
                <slot name="row-actions" :row="row"></slot>
                <button
                  v-if="printable"
                  class="row-btn print"
                  title="Cetak"
                  @click="emit('print', row)"
                >
                  <MsIcon name="print" :size="14" />
                </button>
                <button
                  v-if="editFormPath"
                  class="row-btn edit"
                  title="Edit"
                  @click="editRow(row)"
                >
                  <MsIcon name="edit" :size="14" />
                </button>
                <button
                  v-if="canDelete"
                  class="row-btn del"
                  title="Hapus"
                  @click="confirmDelete(row)"
                >
                  <MsIcon name="delete" :size="14" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Footer -->
    <div class="browse-foot">
      <div class="foot-info">
        Menampilkan <strong>{{ fromRow }}-{{ toRow }}</strong> dari
        <strong>{{ total }}</strong> data
      </div>
      <div class="pager">
        <button
          class="page-btn"
          :disabled="page <= 1"
          @click="goToPage(page - 1)"
        >
          <MsIcon name="chevron_left" :size="14" />
        </button>
        <span class="page-info">Hal {{ page }} / {{ lastPage || 1 }}</span>
        <button
          class="page-btn"
          :disabled="page >= lastPage"
          @click="goToPage(page + 1)"
        >
          <MsIcon name="chevron_right" :size="14" />
        </button>
      </div>
    </div>

    <!-- Hapus -> konfirmasi -->
    <v-dialog v-model="deleteDialog" max-width="400" persistent>
      <v-card rounded="false">
        <v-card-item class="py-3">
          <div class="d-flex align-center">
            <span class="material-symbols-outlined" style="color: #dc2626; margin-right: 8px">delete</span>
            <v-card-title class="text-body-1 font-weight-bold pa-0">Hapus Data</v-card-title>
          </div>
        </v-card-item>
        <v-card-text class="text-body-2">
          Apakah Anda yakin ingin menghapus data
          <strong>{{ deletingLabel }}</strong>? Tindakan ini tidak dapat dibatalkan.
        </v-card-text>
        <v-card-actions class="pa-4 pt-2">
          <v-spacer />
          <v-btn variant="text" color="grey-darken-2" @click="deleteDialog = false">Batal</v-btn>
          <v-btn color="error" variant="flat" @click="doDelete">Hapus</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.browse-panel {
  border: 1px solid var(--ds-border, #b0b8c4);
  background: var(--ds-surface, #f0f3f8);
  display: flex;
  flex-direction: column;
}
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  background: var(--ds-surface-variant, #e0e4ea);
  border-bottom: 1px solid var(--ds-border, #b0b8c4);
  flex-wrap: wrap;
}
.toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.module-icon {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ds-primary, #3b5998);
  color: #fff;
}
.module-title {
  font-size: 13px;
  font-weight: 800;
  color: var(--ds-on-surface, #1b2d4a);
}
.module-sub {
  font-size: 11px;
  color: #6b7a90;
  border-left: 1px solid #b0b8c4;
  padding-left: 8px;
}
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.period-fields {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border: 1px solid var(--ds-border, #b0b8c4);
  background: #fff;
}
.period-fields label {
  font-size: 10px;
  font-weight: 700;
  color: #55637a;
  text-transform: uppercase;
}
.period-fields input {
  border: 1px solid #c3cad4;
  padding: 3px 6px;
  font-size: 11px;
  font-family: "Plus Jakarta Sans", sans-serif;
  background: #fff;
}
.search-box {
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--ds-border, #b0b8c4);
  background: #fff;
  padding: 0 8px;
  height: 28px;
  color: #6b7a90;
}
.search-box input {
  border: none;
  outline: none;
  font-size: 12px;
  font-family: "Plus Jakarta Sans", sans-serif;
  width: 180px;
  background: transparent;
}
.tool-btn {
  height: 28px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  border: 1px solid var(--ds-border, #b0b8c4);
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  border-radius: 0;
}
.tool-btn.ghost {
  background: #fff;
  color: var(--ds-on-surface, #1b2d4a);
}
.tool-btn.ghost:hover {
  background: var(--ds-surface-variant, #e0e4ea);
}
.tool-btn.primary {
  background: var(--ds-primary, #3b5998);
  border-color: var(--ds-primary-dark, #2c4472);
  color: #fff;
}
.tool-btn.primary:hover {
  background: var(--ds-primary-darken-1, #2c4472);
}
.table-wrap {
  overflow: auto;
  flex: 1;
}
.browse-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.browse-table th {
  background: var(--ds-primary-dark, #243656);
  color: #fff;
  font-weight: 700;
  padding: 6px 8px;
  text-align: left;
  white-space: nowrap;
  border: 1px solid #1b2d4a;
  position: sticky;
  top: 0;
  z-index: 2;
}
.browse-table th.sortable {
  cursor: pointer;
  user-select: none;
}
.browse-table th.sortable:hover {
  background: #2e4468;
}
.browse-table th.sorted {
  background: #31496f;
}
.th-label {
  vertical-align: middle;
}
.th-sort {
  vertical-align: middle;
  margin-left: 4px;
  opacity: 0.55;
}
th.sorted .th-sort {
  opacity: 1;
}
.th-filter {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  margin-left: 2px;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.55);
  cursor: pointer;
  vertical-align: middle;
  position: relative;
  border-radius: 3px;
}
.th-filter:hover {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
}
.th-filter.active {
  color: #ffd28a;
}
.th-filter .filter-dot {
  position: absolute;
  top: 1px;
  right: 1px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #e8871e;
}
.tool-btn.active {
  background: #dbe4f3;
  border-color: var(--ds-primary, #3b5998);
  color: var(--ds-primary, #3b5998);
  position: relative;
}
.filter-dot {
  position: absolute;
  top: 3px;
  right: 3px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #e8871e;
}
.browse-table td {
  padding: 5px 8px;
  border: 1px solid #d7dde5;
  color: var(--ds-on-surface, #1b2d4a);
  white-space: nowrap;
}
/* ── Kolom foto ──
   Thumbnail sengaja kecil (40x30) dan padding sel diperketat supaya baris
   hanya tumbuh ~10px dari baris biasa. Kolom ini diletakkan paling depan di
   view masing-masing supaya tidak perlu scroll horizontal. */
.foto-cell {
  text-align: center !important;
  width: 52px;
  min-width: 52px;
  padding: 2px 6px !important;
}
.foto-thumb {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 30px;
  padding: 0;
  border: 1px solid var(--ds-border, #b0b8c4);
  border-radius: 3px;
  background: #fff;
  overflow: hidden;
  cursor: zoom-in;
}
.foto-thumb:hover {
  border-color: var(--ds-primary, #3b5998);
  box-shadow: 0 0 0 2px rgba(59, 89, 152, 0.2);
}
.foto-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.foto-missing {
  display: inline-flex;
  color: #94a3b8;
  cursor: not-allowed;
}
.foto-empty-cell {
  color: #9aa7b8;
}
.browse-table tbody tr:nth-child(even) {
  background: #fff;
}
.browse-table tbody tr:nth-child(odd) {
  background: #eef1f6;
}
.browse-table tbody tr:hover {
  background: var(--ds-primary-lighten-1, #dbe4f3) !important;
}
.num-col {
  text-align: center;
  width: 42px;
  color: #6b7a90;
}
.action-col {
  text-align: center;
  width: 80px;
  min-width: 80px;
  /* Tempel di kanan agar ikon Edit/Hapus selalu terlihat
     walau tabel lebar (mis. Karyawan 10 kolom) dan harus scroll horizontal */
  position: sticky;
  right: 0;
  z-index: 1;
}
thead th.action-col {
  z-index: 3;
  background: var(--ds-primary-dark, #243656);
}
tbody td.action-col {
  background: #fff;
  border-left: 1px solid #b0b8c4;
  box-shadow: -2px 0 5px rgba(15, 26, 46, 0.08);
}
tbody tr.odd td.action-col {
  background: #eef1f6;
}
tbody tr:hover td.action-col {
  background: var(--ds-primary-lighten-1, #dbe4f3) !important;
}
.row-actions {
  display: flex;
  justify-content: center;
  gap: 4px;
}
.row-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  background: transparent;
  cursor: pointer;
  border-radius: 0;
}
.row-btn.edit {
  color: var(--ds-primary, #3b5998);
}
.row-btn.edit:hover {
  background: rgba(59, 89, 152, 0.14);
}
.row-btn.print {
  color: #0f766e;
}
.row-btn.print:hover {
  background: rgba(15, 118, 110, 0.12);
}
.row-btn.del {
  color: #dc2626;
}
.row-btn.del:hover {
  background: rgba(220, 38, 38, 0.12);
}
.state-cell {
  text-align: center;
  padding: 34px !important;
  color: #6b7a90;
  font-size: 12px;
}
.spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid var(--ds-border, #b0b8c4);
  border-top-color: var(--ds-primary, #3b5998);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  vertical-align: -2px;
  margin-right: 6px;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.browse-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-top: 1px solid var(--ds-border, #b0b8c4);
  background: var(--ds-surface-variant, #e0e4ea);
}
.foot-info {
  font-size: 11px;
  color: #55637a;
}
.pager {
  display: flex;
  align-items: center;
  gap: 6px;
}
.page-btn {
  width: 26px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--ds-border, #b0b8c4);
  background: #fff;
  cursor: pointer;
  color: var(--ds-on-surface, #1b2d4a);
}
.page-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.page-info {
  font-size: 11px;
  color: #55637a;
}
</style>