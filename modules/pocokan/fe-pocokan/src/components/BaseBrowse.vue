<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from "vue";
import { useRoute } from "vue-router";
import { useLocale } from "vuetify";
import { sortItems } from "vuetify/lib/components/VDataTable/composables/sort.js";
import PageLayout from "@/components/PageLayout.vue";
import ColumnFilter, {
  type FilterType,
  type ColumnFilterValue,
  type TextFilter,
  type NumberFilter,
  type DateFilter,
  type SelectFilter,
} from "@/components/ColumnFilter.vue";
import {
  IconPlus,
  IconPencil,
  IconTrash,
  IconTable,
  IconFileSpreadsheet,
  IconX,
  IconRefresh,
  IconFilterOff,
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
  IconChevronUp,
  IconChevronDown,
  IconFilter,
  IconAdjustmentsHorizontal,
  IconSearch,
  IconSearchOff,
  IconDatabaseOff,
  IconAlertTriangle,
} from "@tabler/icons-vue";

const props = withDefaults(
  defineProps<{
    title: string;
    menuId?: string;
    icon?: any;
    headers: any[];
    items: any[];
    isLoading?: boolean;
    searchPlaceholder?: string;
    itemValue?: string;
    canInsert?: boolean;
    canEdit?: boolean;
    canDelete?: boolean;
    canExport?: boolean;
    selectStrategy?: "single" | "page" | "all";
    rowPropsFn?: (data: any) => any;
    showExpand?: boolean;
    expanded?: any[];
    selected?: any[];
    loadingDetails?: Set<string>;
    itemsPerPage?: number;
    filterState?: Record<string, any>;
    summaryKey?: string;
    summaryLabel?: string;
    exportFn?: () => void | Promise<void>;
    fixedLayout?: boolean;
    filterValues?: Record<string, any>;
    autoRefresh?: boolean;
    summaryColumns?: {
      key: string;
      label?: string;
      numFmt?: string;
      currency?: boolean;
      maxFractionDigits?: number;
      sumKey?: string;
      formatTotal?: (total: number) => string;
    }[];
  }>(),
  {
    icon: () => IconTable,
    isLoading: false,
    searchPlaceholder: "Cari data...",
    itemValue: "Kode",
    canInsert: false,
    canEdit: false,
    canDelete: false,
    canExport: false,
    selectStrategy: "single",
    selected: () => [],
    showExpand: false,
    expanded: () => [],
    loadingDetails: () => new Set<string>(),
    itemsPerPage: 50,
    filterState: () => ({}),
    exportFn: undefined,
    fixedLayout: true,
    filterValues: () => ({}),
    autoRefresh: true,
    summaryColumns: () => [],
  },
);

const emit = defineEmits([
  "refresh",
  "add",
  "edit",
  "delete",
  "row-click",
  "update:expanded",
  "update:selected",
  "update:filterState",
]);

let autoRefreshTimer: ReturnType<typeof setTimeout> | null = null;

watch(
  () => props.filterValues,
  () => {
    if (!props.autoRefresh) return;
    if (autoRefreshTimer) clearTimeout(autoRefreshTimer);
    autoRefreshTimer = setTimeout(() => {
      emit("refresh");
    }, 300);
  },
  { deep: true },
);

const route = useRoute();
const locale = useLocale();
const storageKey = computed(() => `finance_browse_${route.path}`);
const loadState = () => {
  try {
    return JSON.parse(sessionStorage.getItem(storageKey.value) || "null");
  } catch {
    return null;
  }
};
const saveState = () => {
  try {
    sessionStorage.setItem(
      storageKey.value,
      JSON.stringify({
        search: search.value,
        currentPage: currentPage.value,
        perPage: perPage.value,
        filterState: props.filterState,
      }),
    );
  } catch {
    /* storage penuh */
  }
};

const saved = loadState();
const search = ref<string>(saved?.search ?? "");
const currentPage = ref<number>(saved?.currentPage ?? 1);
const perPage = ref<number>(saved?.perPage ?? props.itemsPerPage);
const sortBy = ref<{ key: string; order?: "asc" | "desc" | boolean }[]>([]);
const deleteDialog = ref(false);
const pendingDeleteItem = ref<any>(null);

onMounted(() => {
  if (saved?.filterState && Object.keys(saved.filterState).length > 0)
    emit("update:filterState", saved.filterState);
  injectTfoot();
});
watch([search, currentPage, perPage, () => props.filterState], saveState, {
  flush: "post",
  deep: true,
});

const internalSelected = computed({
  get: () => props.selected || [],
  set: (val) => emit("update:selected", val),
});
const isSingleSelected = computed(() => internalSelected.value.length === 1);

const finalHeaders = computed(() => {
  if (!props.showExpand) return props.headers;
  return [
    { title: "", key: "data-table-expand", width: "48px", sortable: false },
    ...props.headers,
  ];
});

// ── Column Filters (type-aware) ──────────────────────────────────────────
const columnFilters = ref<Record<string, ColumnFilterValue>>({});
const activeFilterCol = ref<string | null>(null);
const filterDropdownStyle = ref<Record<string, string>>({});
const colWidths = ref<Record<string, number>>({});

// Auto-detect filter type from header config or data
const resolveFilterType = (header: any): FilterType => {
  if (header.filterType) return header.filterType;
  const key = header.key || "";
  // Date patterns
  if (/^(Tanggal|JthTempo|Tanggal.*|Date|date)$/i.test(key)) return "date";
  // Number patterns (right-aligned columns or known numeric keys)
  if (header.align === "right") return "number";
  if (/^(Debet|Kredit|Stok|Total|Saldo|Nilai|Harga|Bayar|Potongan|Giro|Cash|Transfer|PPN|PPH|Mutasi|REAL_|Tambah|Kurang|Buku|Bank|Selisih|Het|HNA|Retur|Disc|Freight|CN|Kontrak|Biaya|Nominal|Avgs|TOR|Min|Disc_Salesman)$/i.test(key)) return "number";
  // Default: select (checkbox-based)
  return "select";
};

const colFilterType = (key: string): FilterType => {
  const h = props.headers.find((x: any) => x.key === key);
  return h ? resolveFilterType(h) : "select";
};

const colHasFilter = (key: string) => {
  return columnFilters.value[key] !== null && columnFilters.value[key] !== undefined;
};

const activeFilterCount = computed(
  () => Object.keys(columnFilters.value).filter((k) => colHasFilter(k)).length,
);

const openColFilter = (key: string, event: MouseEvent) => {
  if (activeFilterCol.value === key) {
    activeFilterCol.value = null;
    return;
  }
  const th = (event.currentTarget as HTMLElement).closest("th");
  if (th) {
    const rect = th.getBoundingClientRect();
    const screenWidth = window.innerWidth;
    const dropdownWidth = 190;
    let leftPos = rect.left;
    // Jika kolom berada di dekat tepi kanan layar (misal sisa ruang kurang dari dropdownWidth + 20px), posisikan popover sejajar rata kanan dengan th
    if (rect.right + dropdownWidth <= screenWidth - 10) {
      leftPos = rect.left;
    } else {
      leftPos = rect.right - dropdownWidth;
    }
    if (leftPos < 10) leftPos = 10;
    filterDropdownStyle.value = {
      position: "fixed",
      top: `${rect.bottom + 2}px`,
      left: `${leftPos}px`,
    };
  }
  activeFilterCol.value = key;
};
const closeColFilter = () => {
  activeFilterCol.value = null;
};
const onColFilterUpdate = (key: string, val: ColumnFilterValue | null) => {
  if (val === null) {
    const newFilters = { ...columnFilters.value };
    delete newFilters[key];
    columnFilters.value = newFilters;
  } else {
    columnFilters.value = { ...columnFilters.value, [key]: val };
  }
  currentPage.value = 1;
};
const activeFilterColTitle = computed(() => {
  if (!activeFilterCol.value) return "";
  const h = props.headers.find((x: any) => x.key === activeFilterCol.value);
  return h?.title || activeFilterCol.value;
});

// ── Column Resize ────────────────────────────────────────────────────────
let resizing: { key: string; startX: number; startW: number } | null = null;
const onResizeStart = (key: string, e: MouseEvent) => {
  e.preventDefault();
  e.stopPropagation();
  const th = (e.currentTarget as HTMLElement).closest("th") as HTMLElement;
  const currentW = th
    ? th.getBoundingClientRect().width
    : (colWidths.value[key] ?? 80);
  resizing = { key, startX: e.clientX, startW: currentW };
  const onMove = (ev: MouseEvent) => {
    if (!resizing) return;
    colWidths.value = {
      ...colWidths.value,
      [resizing.key]: Math.max(
        40,
        resizing.startW + ev.clientX - resizing.startX,
      ),
    };
  };
  const onUp = () => {
    resizing = null;
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  };
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
};
const colStyle = (col: any) => {
  const key = col.key;
  if (colWidths.value[key])
    return {
      width: `${colWidths.value[key]}px`,
      minWidth: `${colWidths.value[key]}px`,
    };
  if (col.width)
    return { width: col.width, minWidth: col.minWidth ?? col.width };
  if (col.minWidth) return { minWidth: col.minWidth };
  return {};
};

// ── Type-aware filter matching ──────────────────────────────────────────
const matchTextFilter = (val: string, f: TextFilter): boolean => {
  const s = String(val ?? "").toLowerCase();
  const fv = f.value.toLowerCase();
  switch (f.operator) {
    case "contains": return s.includes(fv);
    case "equals": return s === fv;
    case "not_contains": return !s.includes(fv);
    case "starts_with": return s.startsWith(fv);
    case "ends_with": return s.endsWith(fv);
    case "empty": return s === "";
    case "not_empty": return s !== "";
    default: return true;
  }
};

const matchNumberFilter = (val: any, f: NumberFilter): boolean => {
  const n = Number(val);
  if (isNaN(n) && f.operator !== "between") return false;
  switch (f.operator) {
    case "=": return n === f.value;
    case "!=": return n !== f.value;
    case "<": return n < (f.value ?? 0);
    case ">": return n > (f.value ?? 0);
    case "<=": return n <= (f.value ?? 0);
    case ">=": return n >= (f.value ?? 0);
    case "between": {
      const from = f.value ?? -Infinity;
      const to = f.valueTo ?? Infinity;
      return n >= from && n <= to;
    }
    default: return true;
  }
};

const matchDateFilter = (val: any, f: DateFilter): boolean => {
  const s = String(val ?? "").substring(0, 10); // extract yyyy-mm-dd part
  if (f.operator === "between") {
    const from = f.value || "0000-00-00";
    const to = f.valueTo || "9999-99-99";
    return s >= from && s <= to;
  }
  if (f.operator === "equals") return s === f.value;
  if (f.operator === "before") return s < f.value;
  if (f.operator === "after") return s > f.value;
  return true;
};

const matchSelectFilter = (val: any, f: SelectFilter): boolean => {
  return f.allowed.has(String(val ?? ""));
};

const matchColumnFilter = (val: any, filter: ColumnFilterValue): boolean => {
  if ("operator" in filter && "value" in filter && "valueTo" in filter && typeof (filter as any).value === "string") {
    // Check if it's a DateFilter (value is string)
    if (typeof filter.value === "string" && ("valueTo" in filter)) {
      // Could be date or text. Distinguish by checking if operator is a date operator
      const dateOps = ["between", "equals", "before", "after"];
      if (dateOps.includes(filter.operator as string)) {
        return matchDateFilter(val, filter as DateFilter);
      }
    }
  }
  if ("allowed" in filter) return matchSelectFilter(val, filter as SelectFilter);
  if ("operator" in filter && "value" in filter) {
    const f = filter as TextFilter | NumberFilter;
    if (typeof f.value === "number" || (!isNaN(Number(f.value)) && f.value !== "")) {
      return matchNumberFilter(val, filter as NumberFilter);
    }
    return matchTextFilter(val, filter as TextFilter);
  }
  return true;
};

// Filter here; VDataTable sorts the full result before its own pagination.
const filteredItems = computed(() => {
  let result = props.items;
  if (search.value) {
    const q = search.value.toLowerCase();
    result = result.filter((item) =>
      Object.values(item).some((v) =>
        String(v ?? "")
          .toLowerCase()
          .includes(q),
      ),
    );
  }
  for (const [key, filter] of Object.entries(columnFilters.value)) {
    if (!filter) continue;
    result = result.filter((item) => matchColumnFilter(item[key], filter));
  }
  return result;
});

const onTableWrapClick = (e: MouseEvent) => {
  const target = e.target as HTMLElement;
  if (
    !target.closest(".cf-dropdown") &&
    !target.closest(".col-filter-btn")
  )
    closeColFilter();
};

// ── Summary (tfoot inside table) ───────────────────────────────────
const tableWrapRef = ref<HTMLElement | null>(null);
const dataTableRef = ref<any>(null);
const summaryBarRef = ref<HTMLElement | null>(null);
const onTableScroll = () => {
  /* no-op, tfoot scrolls with table */
};
const summaryTotal = computed(() => {
  if (!props.summaryKey) return 0;
  return filteredItems.value.reduce(
    (sum, item) => sum + (Number(item[props.summaryKey!]) || 0),
    0,
  );
});
const summaryFormatted = computed(() =>
  new Intl.NumberFormat("id-ID").format(summaryTotal.value),
);

// Calculate totals for summaryColumns
const summaryTotals = computed(() => {
  const result: Record<string, string> = {};
  for (const col of props.summaryColumns) {
    const total = filteredItems.value.reduce(
      (sum, item) => sum + (Number(item[col.sumKey ?? col.key]) || 0),
      0,
    );
    result[col.key] = col.formatTotal
      ? col.formatTotal(total)
      : new Intl.NumberFormat("id-ID", {
          maximumFractionDigits: col.maxFractionDigits ?? 3,
        }).format(total);
  }
  return result;
});
const hasSummaryRow = computed(
  () => props.summaryColumns.length > 0 || !!props.summaryKey || false,
);

// Inject <tfoot> into the actual <table> element
const injectTfoot = () => {
  if (!hasSummaryRow.value) return;
  nextTick(() => {
    const wrapper = tableWrapRef.value?.querySelector(
      ".v-table__wrapper",
    ) as HTMLElement | null;
    if (!wrapper) return;
    const table = wrapper.querySelector("table") as HTMLTableElement | null;
    if (!table) return;

    // Remove old tfoot if exists
    const oldTfoot = table.querySelector("tfoot");
    if (oldTfoot) oldTfoot.remove();

    // Build tfoot
    const tfoot = document.createElement("tfoot");
    const tr = document.createElement("tr");
    tr.className = "summary-tfoot-row";

    // Get all <th> from thead to know how many columns
    const ths = table.querySelectorAll("thead th");
    const totalCols = ths.length;

    // Map summaryColumns by key for quick lookup
    const summaryMap: Record<string, { value: string; currency?: boolean; text?: boolean }> = {};
    for (const col of props.summaryColumns) {
      summaryMap[col.key] = {
        value: summaryTotals.value[col.key] || "0",
        currency: col.currency,
        text: !!col.formatTotal,
      };
    }

    // Find which header keys map to which column index
    const headerKeys: string[] = [];
    ths.forEach((th) => {
      // Vuetify stores the column key in data attribute or we can match by title
      const text = (th as HTMLElement).textContent?.trim() || "";
      headerKeys.push(text);
    });

    // Get the actual header keys from props.headers
    const colKeys = props.headers.map((h: any) => h.key);

    for (let i = 0; i < totalCols; i++) {
      const td = document.createElement("td");
      td.className = "summary-tfoot-td";

      // Check if this column has a summary value
      const key = colKeys[i] || "";
      if (summaryMap[key]) {
        if (summaryMap[key].currency) {
          const content = document.createElement("span");
          content.className = "summary-tfoot-currency";
          const prefix = document.createElement("span");
          prefix.textContent = "Rp";
          const amount = document.createElement("span");
          amount.textContent = summaryMap[key].value;
          content.append(prefix, amount);
          td.appendChild(content);
        } else {
          td.textContent = summaryMap[key].value;
        }
        td.classList.add("summary-tfoot-val");
        if (summaryMap[key].text) td.classList.add("summary-tfoot-text");
      } else if (i === 0) {
        td.textContent = "TOTAL";
        td.classList.add("summary-tfoot-label");
      }

      tr.appendChild(td);
    }

    tfoot.appendChild(tr);
    table.appendChild(tfoot);
  });
};

// ── Pagination ────────────────────────────────────────────────────────────
const totalItems = computed(() => filteredItems.value.length);
const totalPages = computed(() =>
  Math.max(1, Math.ceil(totalItems.value / perPage.value)),
);
const pageStart = computed(() =>
  totalItems.value === 0 ? 0 : (currentPage.value - 1) * perPage.value + 1,
);
const pageEnd = computed(() =>
  Math.min(currentPage.value * perPage.value, totalItems.value),
);
const visiblePages = computed(() => {
  const total = totalPages.value,
    cur = currentPage.value;
  if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
  let start = Math.max(1, cur - 2),
    end = Math.min(total, start + 4);
  if (end - start < 4) start = Math.max(1, end - 4);
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
});
const goToPage = (p: number) => {
  currentPage.value = Math.max(1, Math.min(p, totalPages.value));
};
const jumpPageInput = ref<number | null>(null);
const onJumpPage = () => {
  if (jumpPageInput.value) {
    goToPage(jumpPageInput.value);
    jumpPageInput.value = null;
  }
};
const onSearch = (val: string | null) => {
  search.value = val ?? "";
  currentPage.value = 1;
};

watch(
  [search, columnFilters, sortBy, perPage],
  () => {
    currentPage.value = 1;
  },
  { deep: true },
);

// Inject tfoot whenever data changes or table re-renders
watch(
  () => [
    filteredItems.value,
    currentPage.value,
    perPage.value,
    sortBy.value,
    hasSummaryRow.value,
    props.summaryColumns,
    props.items,
  ],
  () => injectTfoot(),
  { deep: true },
);

// ── Row click ───────────────────────────────────────────────────────────
const handleRowClick = (event: PointerEvent, { item }: { item: any }) => {
  const raw = item?.raw || item;
  if (props.selectStrategy === "single") {
    internalSelected.value =
      internalSelected.value.length > 0 &&
      internalSelected.value[0][props.itemValue] === raw[props.itemValue]
        ? []
        : [raw];
  }
  emit("row-click", raw);
};
const resolvedRowProps = (data: any) => {
  let customProps: any = props.rowPropsFn ? props.rowPropsFn(data) : {};
  const raw = data?.item?.raw ?? data?.item ?? data;
  const isSelected = internalSelected.value.some(
    (s) => s[props.itemValue] === raw[props.itemValue],
  );
  return {
    ...customProps,
    class: (
      (customProps.class || "") + (isSelected ? " row-selected" : "")
    ).trim(),
    // Gabung style dari rowPropsFn dengan cursor pointer
    style: "cursor:pointer;" + (customProps.style || ""),
  };
};

// ── Delete confirm ───────────────────────────────────────────────────────
const requestDelete = (item: any) => {
  pendingDeleteItem.value = item;
  deleteDialog.value = true;
};
const confirmDelete = () => {
  emit("delete", pendingDeleteItem.value);
  deleteDialog.value = false;
  pendingDeleteItem.value = null;
};

// ── Empty state ──────────────────────────────────────────────────────────
const emptyStateText = computed(() =>
  search.value
    ? `Tidak ada hasil untuk "${search.value}"`
    : "Belum ada data tersedia",
);
const emptyStateSubtext = computed(() =>
  search.value
    ? "Coba kata kunci lain atau hapus filter"
    : "Klik tombol + Baru untuk menambah data pertama",
);

const clearSelection = () => {
  internalSelected.value = [];
};

const tableLayout = computed(() => (props.fixedLayout ? "fixed" : "auto"));
const tdMaxWidth = computed(() => (props.fixedLayout ? "0" : "none"));

// Export all matching rows using the same sorter and locale as VDataTable,
// before pagination so changing pages does not change the exported dataset.
const getExportItems = () => {
  const rows = filteredItems.value.map((raw, value) => ({ raw, value }));
  return sortItems(rows, sortBy.value, locale.current.value, {
    transform: (item) => item.raw,
    sortFunctions: Object.fromEntries(
      props.headers.filter((header) => header.sort).map((header) => [header.key, header.sort]),
    ),
    sortRawFunctions: Object.fromEntries(
      props.headers.filter((header) => header.sortRaw).map((header) => [header.key, header.sortRaw]),
    ),
  }).map((item) => item.raw);
};

defineExpose({ clearSelection, search, getExportItems });
watch(
  () => filteredItems.value.length,
  () => {
    if (currentPage.value > totalPages.value) currentPage.value = 1;
  },
);
</script>

<template>
  <PageLayout :title="title" :menu-id="menuId" :icon="icon">
    <template #header-actions>
      <v-btn v-if="canInsert" size="small" color="primary" @click="emit('add')">
        <template #prepend
          ><IconPlus :size="14" :stroke-width="2.2"
        /></template>
        Baru
      </v-btn>
      <v-btn
        v-if="canEdit"
        size="small"
        :disabled="!isSingleSelected"
        @click="emit('edit', internalSelected[0])"
      >
        <template #prepend
          ><IconPencil :size="14" :stroke-width="1.8"
        /></template>
        Ubah
      </v-btn>
      <v-btn
        v-if="canDelete"
        size="small"
        color="error"
        :disabled="!isSingleSelected"
        @click="requestDelete(internalSelected[0])"
      >
        <template #prepend
          ><IconTrash :size="14" :stroke-width="1.8"
        /></template>
        Hapus
      </v-btn>
      <v-btn
        v-if="canExport && props.exportFn"
        size="small"
        color="success"
        @click="props.exportFn?.()"
      >
        <template #prepend>
          <IconFileSpreadsheet :size="14" :stroke-width="1.8" />
        </template>
        Export
      </v-btn>
      <slot name="extra-actions" :selected="internalSelected" />
    </template>

    <div class="browse-content">
      <!-- Filter Bar -->
      <div class="filter-bar">
        <slot name="filter-left" />
        <slot name="filter-right-prepend" />
        <v-text-field
          :model-value="search"
          @update:model-value="onSearch"
          :placeholder="searchPlaceholder"
          variant="outlined"
          density="compact"
          hide-details
          clearable
          class="search-field"
        >
          <template #prepend-inner>
            <IconSearch
              :size="14"
              :stroke-width="1.8"
              style="opacity: 0.5; margin-top: 1px"
            />
          </template>
        </v-text-field>
        <v-btn
          @click="emit('refresh')"
          color="primary"
          variant="text"
          :loading="isLoading"
          size="small"
          icon
        >
          <IconRefresh :size="17" :stroke-width="1.8" />
        </v-btn>
        <v-btn
          v-if="activeFilterCount > 0"
          size="small"
          color="warning"
          variant="tonal"
          @click="columnFilters = {}"
        >
          <template #prepend
            ><IconFilterOff :size="14" :stroke-width="1.8"
          /></template>
          Reset Filter ({{ activeFilterCount }})
        </v-btn>
        <v-spacer />
        <slot name="filter-right" />
      </div>

      <!-- Table + Summary -->
      <div class="table-section">
        <div
          class="table-wrap"
          ref="tableWrapRef"
          @click="onTableWrapClick"
          @scroll.passive="onTableScroll"
        >
          <v-data-table
            v-model="internalSelected"
            v-model:page="currentPage"
            v-model:sort-by="sortBy"
            :headers="finalHeaders"
            :items="filteredItems"
            :loading="isLoading"
            :item-value="itemValue"
            :select-strategy="selectStrategy"
            :expanded="expanded"
            @update:expanded="emit('update:expanded', $event)"
            return-object
            density="compact"
            fixed-header
            hide-default-footer
            :items-per-page="perPage"
            class="base-table"
            :row-props="resolvedRowProps"
            @click:row="handleRowClick"
            sort-asc-icon=""
            sort-desc-icon=""
            :cell-props="({ value }) => ({ title: value ?? '' })"
          >
            <template #headers="{ columns, isSorted, toggleSort }">
              <tr>
                <template
                  v-for="col in columns"
                  :key="String(col.key ?? col.title ?? '')"
                >
                  <th
                    :style="colStyle(col)"
                    :class="['base-th', col.align ? `text-${col.align}` : '']"
                  >
                    <div class="th-inner">
                      <span
                        class="th-title"
                        :class="{ sortable: col.sortable !== false }"
                        @click="col.sortable !== false && toggleSort(col)"
                      >
                        {{ col.title }}
                        <IconChevronUp
                          v-if="
                            isSorted(col) &&
                            sortBy.find((sort) => sort.key === col.key)?.order === 'asc'
                          "
                          :size="12"
                          :stroke-width="2.2"
                          class="sort-icon"
                        />
                        <IconChevronDown
                          v-else-if="isSorted(col)"
                          :size="12"
                          :stroke-width="2.2"
                          class="sort-icon"
                        />
                      </span>
                      <button
                        v-if="col.key && col.key !== 'data-table-expand'"
                        class="col-filter-btn"
                        :class="{ active: colHasFilter(col.key) }"
                        @click.stop="openColFilter(col.key, $event)"
                        :title="`Filter ${col.title}`"
                      >
                        <IconFilter
                          v-if="colHasFilter(col.key)"
                          :size="9"
                          :stroke-width="2.2"
                        />
                        <IconAdjustmentsHorizontal
                          v-else
                          :size="9"
                          :stroke-width="2.2"
                        />
                      </button>
                    </div>
                    <div
                      v-if="col.key && col.key !== 'data-table-expand'"
                      class="col-resize-handle"
                      @mousedown.stop="onResizeStart(col.key, $event)"
                    />
                  </th>
                </template>
              </tr>
            </template>

            <template
              v-for="slotName in Object.keys($slots).filter(
                (k) =>
                  ![
                    'extra-actions',
                    'filter-left',
                    'filter-right-prepend',
                    'filter-right',
                    'detail',
                    'summary-row',
                  ].includes(k),
              )"
              v-slot:[slotName]="slotProps"
            >
              <slot :name="slotName" v-bind="slotProps" />
            </template>
            <template #loading
              ><v-skeleton-loader type="table-row@10"
            /></template>
            <template #no-data>
              <div class="empty-state">
                <IconSearchOff
                  v-if="search"
                  :size="38"
                  :stroke-width="1.3"
                  class="empty-icon"
                />
                <IconDatabaseOff
                  v-else
                  :size="38"
                  :stroke-width="1.3"
                  class="empty-icon"
                />
                <div class="empty-text">{{ emptyStateText }}</div>
                <div class="empty-subtext">{{ emptyStateSubtext }}</div>
                <v-btn
                  v-if="search"
                  size="small"
                  variant="text"
                  color="primary"
                  @click="search = ''"
                  >Hapus Pencarian</v-btn
                >
              </div>
            </template>
            <template #expanded-row="{ columns, item }">
              <tr>
                <td :colspan="columns.length" class="expanded-cell">
                  <div class="expanded-inner">
                    <slot name="detail" :item="item.raw || item" />
                  </div>
                </td>
              </tr>
            </template>

          </v-data-table>
        </div>
      </div>

      <!-- Pagination -->
      <div class="pagination-bar">
        <span class="page-info"
          >{{ pageStart }}–{{ pageEnd }} dari {{ totalItems }} data</span
        >
        <v-spacer />
        <div class="page-controls">
          <button
            class="page-btn icon-btn"
            :disabled="currentPage === 1"
            @click="goToPage(1)"
          >
            <IconChevronsLeft :size="14" :stroke-width="2" />
          </button>
          <button
            class="page-btn icon-btn"
            :disabled="currentPage === 1"
            @click="goToPage(currentPage - 1)"
          >
            <IconChevronLeft :size="14" :stroke-width="2" />
          </button>
          <button
            v-for="p in visiblePages"
            :key="p"
            class="page-btn"
            :class="{ active: p === currentPage }"
            @click="goToPage(p)"
          >
            {{ p }}
          </button>
          <button
            class="page-btn icon-btn"
            :disabled="currentPage === totalPages"
            @click="goToPage(currentPage + 1)"
          >
            <IconChevronRight :size="14" :stroke-width="2" />
          </button>
          <button
            class="page-btn icon-btn"
            :disabled="currentPage === totalPages"
            @click="goToPage(totalPages)"
          >
            <IconChevronsRight :size="14" :stroke-width="2" />
          </button>
          <input
            v-model.number="jumpPageInput"
            type="number"
            class="jump-input"
            :placeholder="String(currentPage)"
            :min="1"
            :max="totalPages"
            @keydown.enter="onJumpPage"
            @blur="onJumpPage"
          />
          <span class="page-of">/ {{ totalPages }}</span>
        </div>
        <v-spacer />
        <div class="per-page-wrap">
          <span class="page-info">Per hal.</span>
          <select
            v-model="perPage"
            class="per-page-select"
            @change="currentPage = 1"
          >
            <option v-for="n in [25, 50, 100, 200]" :key="n" :value="n">
              {{ n }}
            </option>
          </select>
        </div>
      </div>
    </div>

    <!-- Delete Dialog -->
    <v-dialog v-model="deleteDialog" max-width="400" persistent>
      <v-card rounded="false">
        <v-card-item>
          <template #prepend>
            <v-avatar color="error" variant="tonal" size="38">
              <IconAlertTriangle
                :size="20"
                :stroke-width="1.8"
                color="#c62828"
              />
            </v-avatar>
          </template>
          <v-card-title class="text-body-1 font-weight-bold"
            >Hapus Data</v-card-title
          >
        </v-card-item>
        <v-card-text class="text-body-2 pb-1"
          >Apakah kamu yakin ingin menghapus data ini? Tindakan ini
          <strong>tidak dapat dibatalkan</strong>.</v-card-text
        >
        <v-card-actions class="pa-4 pt-2">
          <v-spacer />
          <v-btn variant="text" @click="deleteDialog = false">Batal</v-btn>
          <v-btn color="error" variant="flat" @click="confirmDelete"
            >Ya, Hapus</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>

  <Teleport to="body">
    <ColumnFilter
      v-if="activeFilterCol"
      :filter-type="colFilterType(activeFilterCol)"
      :column-key="activeFilterCol"
      :title="activeFilterColTitle"
      :items="items"
      :model-value="columnFilters[activeFilterCol] ?? null"
      :dropdown-style="filterDropdownStyle"
      @update:model-value="onColFilterUpdate(activeFilterCol, $event)"
      @close="closeColFilter"
    />
  </Teleport>
</template>

<style scoped>
.browse-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  flex: 1 1 0;
  min-height: 0;
  gap: 8px;
  padding: 8px;
  overflow: hidden;
}

/* Filter bar */
.filter-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--ds-surface, #F0F3F8);
  border: 1px solid var(--ds-border, #A0AAB8);
  border-radius: 0;
  padding: 6px 12px;
  flex-shrink: 0;
  min-height: 44px;
  flex-wrap: wrap;
  row-gap: 4px;
  column-gap: 8px;
  box-shadow: none;
}
.search-field {
  width: 160px;
  min-width: 120px;
  flex-shrink: 0;
}
.search-field :deep(.v-field) {
  height: 32px;
  font-size: 12px;
  border-radius: 0;
}
.search-field :deep(.v-field__input) {
  padding-top: 0;
  padding-bottom: 0;
  min-height: unset;
  font-size: 12px;
  align-self: center;
}
.search-field :deep(.v-field__prepend-inner),
.search-field :deep(.v-field__clearable) {
  align-items: center;
  align-self: center;
  padding-top: 0;
}

/* Table section */
.table-section {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--ds-border, #A0AAB8);
  border-radius: 0;
  overflow: hidden;
  flex: 1;
  min-height: 0;
  background: var(--ds-surface, #ffffff);
  box-shadow: none;
}
.table-wrap {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.base-table {
  font-size: 12px;
  height: 100%;
}
.base-table :deep(.v-table__wrapper) {
  overflow: auto;
  overscroll-behavior: contain;
  flex: 1;
  min-height: 0;
}

/* Header tabel */
.base-table :deep(thead th) {
  background: #3B5998 !important;
  color: white !important;
  font-size: 10.5px !important;
  font-weight: 700 !important;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  height: 32px !important;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  border-bottom: 2px solid #2C4472 !important;
  box-shadow: none;
}
.base-table :deep(tbody td) {
  font-size: 12px;
  height: 28px !important;
  padding: 0 8px !important;
  border-bottom: 1px solid var(--ds-border, #A0AAB8) !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
}
.base-table :deep(tbody tr:nth-child(even)) {
  background-color: #F0F3F8;
}
.base-table :deep(tbody tr:hover) {
  background-color: var(--ds-primary-50, #E8EDF5) !important;
}
.base-table :deep(tbody tr.row-selected) {
  background-color: #D6E4F0 !important;
  color: #1B2D4A !important;
}
.base-table :deep(tbody tr.row-selected:hover) {
  background-color: #C0D4E8 !important;
}
.base-table :deep(table) {
  table-layout: v-bind(tableLayout) !important;
  width: 100% !important;
}
.base-table :deep(tbody td) {
  max-width: v-bind(tdMaxWidth) !important;
}
.base-table :deep(tbody tr) {
  height: 28px !important;
  max-height: 28px !important;
}

/* Empty state */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 16px;
  gap: 6px;
}
.empty-icon {
  color: rgba(var(--v-theme-on-surface), 0.25);
  margin-bottom: 4px;
}
.empty-text {
  font-size: 13px;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.55);
}
.empty-subtext {
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.4);
}

/* Expanded row */
.expanded-cell {
  padding: 0 !important;
  background-color: #F0F3F8 !important;
}
.expanded-inner {
  padding: 6px 10px;
  display: flex;
  justify-content: flex-start;
}

/* ── Tfoot summary row — real <tfoot> inside <table> ── */
.base-table :deep(tfoot tr.summary-tfoot-row) {
  background: #E8EDF5;
  border-top: 2px solid #3B5998;
}
.base-table :deep(tfoot td.summary-tfoot-td) {
  font-size: 12px;
  height: 30px;
  padding: 0 8px !important;
  border-bottom: none !important;
  white-space: nowrap;
  position: sticky;
  bottom: 0;
  z-index: 2;
  background: inherit;
}
.base-table :deep(tfoot td.summary-tfoot-label) {
  font-weight: 700;
  color: var(--ds-primary-dark, #2C4472);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  font-size: 11px;
}
.base-table :deep(tfoot td.summary-tfoot-val) {
  font-weight: 700;
  color: var(--ds-primary-dark, #2C4472);
  font-family: monospace;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.base-table :deep(tfoot td.summary-tfoot-text) {
  text-align: left;
  font-style: italic;
}
.base-table :deep(tfoot .summary-tfoot-currency) {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

/* Pagination */
.pagination-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  flex-shrink: 0;
  border-top: 1px solid var(--ds-border, #A0AAB8);
  background: var(--ds-surface, #F0F3F8);
  min-height: 30px;
}
.page-info {
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), 0.5);
  white-space: nowrap;
}
.page-controls {
  display: flex;
  align-items: center;
  gap: 3px;
}
.page-btn {
  min-width: 28px;
  height: 28px;
  padding: 0 6px;
  border: 1px solid var(--ds-border, #A0AAB8);
  border-radius: 0;
  background: var(--ds-surface, #ffffff);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.page-btn:hover:not(:disabled) {
  background: #E8EDF5;
  border-color: var(--ds-primary, #3B5998);
  color: var(--ds-primary, #3B5998);
}
.page-btn.active {
  background: var(--ds-primary, #3B5998);
  border-color: var(--ds-primary, #3B5998);
  color: white;
  font-weight: 700;
}
.page-btn:disabled {
  opacity: 0.3;
  cursor: default;
}
.jump-input {
  width: 42px;
  height: 28px;
  border: 1px solid var(--ds-border, #A0AAB8);
  border-radius: 0;
  text-align: center;
  font-size: 12px;
  background: var(--ds-surface, #ffffff);
  outline: none;
  margin-left: 6px;
  -moz-appearance: textfield;
  appearance: textfield;
}
.jump-input::-webkit-inner-spin-button,
.jump-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
}
.jump-input:focus {
  border-color: var(--ds-primary, #3B5998);
}
.page-of {
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface), 0.4);
  margin-left: 4px;
}
.per-page-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
}
.per-page-select {
  height: 28px;
  padding: 0 4px;
  border: 1px solid var(--ds-border, #A0AAB8);
  border-radius: 0;
  font-size: 12px;
  background: var(--ds-surface, #ffffff);
  cursor: pointer;
  outline: none;
}
.per-page-select:focus {
  border-color: var(--ds-primary, #3B5998);
}

/* Custom header th */
.base-th {
  background-color: #3B5998 !important;
  color: white !important;
  font-size: 11px !important;
  font-weight: 700 !important;
  text-transform: uppercase;
  height: 34px !important;
  padding: 0 8px !important;
  user-select: none;
  position: relative;
  overflow: visible !important;
}
.th-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  width: 100%;
  padding-right: 6px;
}
.th-title {
  flex: 1;
  white-space: nowrap;
}
.th-title.sortable {
  cursor: pointer;
}
.sort-icon {
  display: inline-block;
  vertical-align: middle;
  margin-left: 2px;
  flex-shrink: 0;
}
.col-filter-btn {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 0;
  background: transparent;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
.col-filter-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  color: white;
}
.col-filter-btn.active {
  background: #ffd54f;
  border-color: #ffd54f;
  color: #1a1a1a;
}
.col-resize-handle {
  position: absolute;
  right: 0;
  top: 0;
  width: 5px;
  height: 100%;
  cursor: col-resize;
  z-index: 10;
  border-right: 2px solid rgba(255, 255, 255, 0.25);
}
.col-resize-handle:hover,
.col-resize-handle:active {
  border-right-color: rgba(255, 255, 255, 0.85);
}
</style>

<style>
/* Column filter styles now in ColumnFilter.vue */

/* ── Responsif ── */

/* Tablet landscape (≤1280px) */
@media (max-width: 1280px) {
  .browse-content {
    padding: 6px;
    gap: 6px;
  }
  .filter-bar {
    padding: 6px 10px;
    min-height: 46px;
    gap: 8px;
  }
  .search-field {
    width: 140px;
    min-width: 100px;
  }
  .base-table :deep(thead th) {
    font-size: 10px !important;
    height: 30px !important;
  }
  .base-table :deep(tbody td) {
    font-size: 11px;
    height: 26px !important;
  }
  .base-table :deep(tfoot td.summary-tfoot-td) {
    height: 28px;
    font-size: 11px;
  }
  .pagination-bar {
    padding: 3px 6px;
    gap: 6px;
  }
  .page-btn {
    min-width: 26px;
    height: 26px;
    font-size: 11px;
  }
  .page-info {
    font-size: 11px;
  }
}

/* Tablet portrait (≤1024px) */
@media (max-width: 1024px) {
  .browse-content {
    padding: 4px;
    gap: 4px;
  }
  .filter-bar {
    padding: 5px 8px;
    min-height: 40px;
    gap: 6px;
    row-gap: 5px;
  }
  .search-field {
    width: 120px;
    min-width: 90px;
  }
  /* Sembunyikan jump input dan page-of */
  .jump-input,
  .page-of {
    display: none;
  }
  /* Pagination ringkas — hanya ikon + halaman aktif */
  .page-btn:not(.icon-btn):not(.active) {
    display: none;
  }
  .page-btn.active {
    display: flex;
  }
  .per-page-wrap .page-info {
    display: none;
  }
}

/* Mobile (≤768px) */
@media (max-width: 768px) {
  .browse-content {
    padding: 2px;
    gap: 3px;
  }
  .filter-bar {
    padding: 5px 6px;
    min-height: unset;
    gap: 5px;
    row-gap: 4px;
  }
  .search-field {
    width: 100px;
    min-width: 80px;
  }
  .base-table :deep(tfoot td.summary-tfoot-td) {
    height: 26px;
    font-size: 10px;
    padding: 0 5px !important;
  }
  /* Pagination ringkas */
  .pagination-bar {
    flex-wrap: wrap;
    gap: 3px;
    padding: 3px 4px;
  }
  .per-page-select {
    height: 26px;
    font-size: 11px;
  }
  .page-btn {
    min-width: 24px;
    height: 24px;
    font-size: 10px;
  }
  /* Header tabel lebih kompak */
  .base-table :deep(thead th) {
    font-size: 9px !important;
    height: 28px !important;
    padding: 0 5px !important;
  }
  .base-table :deep(tbody td) {
    font-size: 10px;
    height: 24px !important;
    padding: 0 5px !important;
  }
}
</style>
