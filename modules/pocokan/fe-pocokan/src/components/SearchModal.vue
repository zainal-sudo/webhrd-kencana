<script setup lang="ts">
import { ref, computed, watch } from "vue";
import {
  IconSearch,
  IconX,
  IconChevronLeft,
  IconChevronRight,
} from "@tabler/icons-vue";

export interface SearchColumn {
  key: string;
  title: string;
  width?: string;
  align?: "left" | "center" | "right";
}

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    title: string;
    columns: SearchColumn[];
    items: any[];
    loading?: boolean;
    searchable?: boolean;
    searchPlaceholder?: string;
    searchKeys?: string[]; // kolom yang ikut disearch, default semua
    serverSearch?: boolean; // true = search dikirim ke parent via @search
    itemsPerPage?: number;
  }>(),
  {
    loading: false,
    searchable: true,
    searchPlaceholder: "Cari...",
    searchKeys: () => [],
    serverSearch: false,
    itemsPerPage: 50,
  },
);

const emit = defineEmits<{
  "update:modelValue": [val: boolean];
  select: [item: any];
  search: [query: string]; // hanya emit kalau serverSearch=true
}>();

const searchQuery = ref("");
const currentPage = ref(1);

const filteredItems = computed(() => {
  if (props.serverSearch || !searchQuery.value) return props.items;
  const q = searchQuery.value.toLowerCase();
  const keys = props.searchKeys.length
    ? props.searchKeys
    : props.columns.map((c) => c.key);
  return props.items.filter((item) =>
    keys.some((k) =>
      String(item[k] ?? "")
        .toLowerCase()
        .includes(q),
    ),
  );
});

// Hitung total halaman
const totalPages = computed(() => {
  return Math.ceil(filteredItems.value.length / props.itemsPerPage) || 1;
});

// Potong data sesuai halaman aktif
const paginatedItems = computed(() => {
  const start = (currentPage.value - 1) * props.itemsPerPage;
  const end = start + props.itemsPerPage;
  return filteredItems.value.slice(start, end);
});

// Reset halaman ketika pencarian berubah
watch(searchQuery, () => {
  currentPage.value = 1;
});

// Reset halaman & pencarian ketika modal dibuka
watch(
  () => props.modelValue,
  (val) => {
    if (val) {
      searchQuery.value = "";
      currentPage.value = 1;
    }
  },
);

const onSearchInput = () => {
  if (props.serverSearch) emit("search", searchQuery.value);
};

const close = () => {
  searchQuery.value = "";
  emit("update:modelValue", false);
};

const select = (item: any) => {
  emit("select", item);
  searchQuery.value = "";
};

const prevPage = () => {
  if (currentPage.value > 1) currentPage.value--;
};

const nextPage = () => {
  if (currentPage.value < totalPages.value) currentPage.value++;
};

const formatValue = (val: any) => {
  if (typeof val === "number") {
    return new Intl.NumberFormat("id-ID").format(val);
  }
  return val ?? "";
};
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="close"
    max-width="850"
    scrollable
  >
    <v-card rounded="lg" class="search-modal-card">
      <!-- Header -->
      <div class="sm-header">
        <IconSearch :size="15" :stroke-width="1.8" class="sm-header-icon" />
        <span class="sm-header-title">{{ title }}</span>
        <button class="sm-close-btn" @click="close">
          <IconX :size="14" :stroke-width="2.2" />
        </button>
      </div>

      <!-- Search input -->
      <div v-if="searchable" class="sm-search-bar">
        <div class="sm-search-wrap">
          <IconSearch :size="13" :stroke-width="1.8" class="sm-search-icon" />
          <input
            v-model="searchQuery"
            type="text"
            :placeholder="searchPlaceholder"
            class="sm-search-input"
            @input="onSearchInput"
            autofocus
          />
        </div>
      </div>

      <!-- Table -->
      <v-card-text class="sm-body pa-0">
        <table class="sm-table">
          <thead>
            <tr>
              <th
                v-for="col in columns"
                :key="col.key"
                :style="{ width: col.width, textAlign: col.align || 'left' }"
              >
                {{ col.title }}
              </th>
            </tr>
          </thead>
          <tbody>
            <!-- Loading state — tampil di dalam tabel, bukan replace tabel -->
            <tr v-if="loading">
              <td :colspan="columns.length" class="sm-empty">
                <div class="d-flex align-center justify-center gap-2">
                  <v-progress-circular
                    indeterminate
                    color="primary"
                    size="16"
                    width="2"
                  />
                  <span>Memuat data...</span>
                </div>
              </td>
            </tr>
            <tr
              v-else
              v-for="(item, idx) in paginatedItems"
              :key="idx"
              class="sm-row"
              @click="select(item)"
            >
              <td
                v-for="col in columns"
                :key="col.key"
                :style="{ textAlign: col.align || 'left' }"
              >
                <slot
                  :name="`cell.${col.key}`"
                  :item="item"
                  :value="item[col.key]"
                >
                  {{ formatValue(item[col.key]) }}
                </slot>
              </td>
            </tr>
            <tr v-if="!loading && !paginatedItems.length">
              <td :colspan="columns.length" class="sm-empty">
                Tidak ada data{{
                  searchQuery ? ` untuk "${searchQuery}"` : ""
                }}.
              </td>
            </tr>
          </tbody>
        </table>
      </v-card-text>

      <!-- Footer info -->
      <div class="sm-footer">
        <span class="sm-count" v-if="loading">Memuat...</span>
        <span class="sm-count" v-else-if="filteredItems.length > 0">
          {{ (currentPage - 1) * itemsPerPage + 1 }} -
          {{ Math.min(currentPage * itemsPerPage, filteredItems.length) }}
          dari {{ filteredItems.length }}
        </span>
        <span class="sm-count" v-else>0 data</span>

        <div class="sm-pagination" v-if="totalPages > 1">
          <button
            class="page-btn"
            :disabled="currentPage === 1"
            @click="prevPage"
          >
            <IconChevronLeft :size="16" />
          </button>
          <span class="page-info"
            >Hal {{ currentPage }} / {{ totalPages }}</span
          >
          <button
            class="page-btn"
            :disabled="currentPage === totalPages"
            @click="nextPage"
          >
            <IconChevronRight :size="16" />
          </button>
        </div>

        <v-btn size="small" variant="text" @click="close">Tutup</v-btn>
      </div>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.search-modal-card {
  overflow: hidden;
}

/* Header */
.sm-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px 10px;
  border-top: 3px solid #3B5998;
  background: rgb(var(--v-theme-surface));
  flex-shrink: 0;
}
.sm-header-icon {
  color: #3B5998;
  flex-shrink: 0;
}
.sm-header-title {
  font-size: 13px;
  font-weight: 700;
  color: rgb(var(--v-theme-on-surface));
  flex: 1;
}
.sm-close-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: rgba(var(--v-theme-on-surface), 0.45);
  display: flex;
  align-items: center;
  padding: 2px;
  border-radius: 4px;
  transition: all 0.15s;
}
.sm-close-btn:hover {
  background: rgba(var(--v-theme-on-surface), 0.07);
  color: #c62828;
}

/* Search bar */
.sm-search-bar {
  padding: 8px 12px;
  background: rgba(var(--v-theme-on-surface), 0.02);
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  flex-shrink: 0;
}
.sm-search-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 6px;
  padding: 0 8px;
  height: 32px;
  background: rgb(var(--v-theme-surface));
  transition: border-color 0.15s;
}
.sm-search-wrap:focus-within {
  border-color: #3B5998;
}
.sm-search-icon {
  color: rgba(var(--v-theme-on-surface), 0.4);
  flex-shrink: 0;
}
.sm-search-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 12px;
  color: rgb(var(--v-theme-on-surface));
}

/* Body */
.sm-body {
  overflow-y: auto;
  max-height: 380px;
  min-height: 120px;
}
.sm-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 24px;
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), 0.5);
  justify-content: center;
}

/* Table */
.sm-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.sm-table thead tr {
  background: #3B5998;
  position: sticky;
  top: 0;
  z-index: 1;
}
.sm-table th {
  color: white;
  font-weight: 700;
  font-size: 11px;
  padding: 6px 10px;
  white-space: nowrap;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.sm-table td {
  padding: 5px 10px;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  color: rgb(var(--v-theme-on-surface));
  vertical-align: middle;
  white-space: nowrap;
}
.sm-row {
  cursor: pointer;
  transition: background 0.1s;
}
.sm-row:hover td {
  background: rgba(46, 46, 125, 0.07);
}
.sm-row:active td {
  background: rgba(46, 46, 125, 0.14);
}

/* Zebra */
.sm-table tbody tr:nth-of-type(even) td {
  background: rgba(var(--v-theme-on-surface), 0.015);
}
.sm-table tbody tr:nth-of-type(even):hover td {
  background: rgba(46, 46, 125, 0.07);
}

.sm-empty {
  text-align: center;
  padding: 24px;
  color: rgba(var(--v-theme-on-surface), 0.4);
  font-style: italic;
  font-size: 12px;
}

/* Footer */
.sm-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  background: rgba(var(--v-theme-on-surface), 0.02);
  flex-shrink: 0;
}
.sm-count {
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.45);
}

/* Pagination di Footer */
.sm-pagination {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 4px;
  padding: 2px;
}
.page-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 2px;
  border-radius: 3px;
  color: rgb(var(--v-theme-on-surface));
  transition: background 0.15s;
}
.page-btn:hover:not(:disabled) {
  background: rgba(var(--v-theme-on-surface), 0.08);
}
.page-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
.page-info {
  font-size: 11px;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.7);
  padding: 0 4px;
}
</style>
