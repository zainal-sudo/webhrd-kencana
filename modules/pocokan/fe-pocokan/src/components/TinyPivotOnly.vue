<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import {
  PivotConfig,
  PivotSkeleton,
  usePivotTable,
} from "@smallwebco/tinypivot-vue";
import "@smallwebco/tinypivot-vue/style.css";
import { IconFilter } from "@tabler/icons-vue";
import ColumnFilter, {
  type FilterType,
  type ColumnFilterValue,
  type TextFilter,
  type NumberFilter,
  type DateFilter,
  type SelectFilter,
} from "@/components/ColumnFilter.vue";

const props = withDefaults(
  defineProps<{
    data: Record<string, unknown>[];
    theme?: "light" | "dark";
    fontSize?: "xs" | "sm" | "base";
  }>(),
  { theme: "light", fontSize: "sm" },
);

const enableDrillDown = ref(true);

// ── Filter (type-aware) ──────────────────────────────────────────────────
const filters = ref<Record<string, ColumnFilterValue>>({});
const activeFilterField = ref<string | null>(null);
const filterDropdownStyle = ref<Record<string, string>>({});

// Auto-detect field type from data values
const detectFieldType = (field: string): FilterType => {
  if (!props.data.length) return "select";
  const sample = props.data.slice(0, 50);
  // Check if all non-empty values look like dates
  const datePattern = /^\d{4}-\d{2}-\d{2}/;
  const dateCount = sample.filter((item) => {
    const v = String((item as Record<string, unknown>)[field] ?? "");
    return v && datePattern.test(v);
  }).length;
  if (dateCount > sample.length * 0.7) return "date";
  // Check if all non-empty values are numeric
  const numCount = sample.filter((item) => {
    const v = String((item as Record<string, unknown>)[field] ?? "");
    return v !== "" && !isNaN(Number(v));
  }).length;
  if (numCount > sample.length * 0.7) return "number";
  // Default: select (checkbox)
  return "select";
};

const fieldFilterTypes = computed(() => {
  const result: Record<string, FilterType> = {};
  for (const field of fieldOrder.value) {
    result[field] = detectFieldType(field);
  }
  return result;
});

const uniqueValues = (field: string): string[] => {
  const vals = new Set<string>();
  for (const item of props.data)
    vals.add(String((item as Record<string, unknown>)[field] ?? ""));
  return Array.from(vals).sort((a, b) =>
    a.localeCompare(b, "id", { numeric: true }),
  );
};

const isActiveFilter = (field: string): boolean => {
  return filters.value[field] !== null && filters.value[field] !== undefined;
};

// Type-aware filter matching
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
  if (isNaN(n)) return false;
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
  const s = String(val ?? "").substring(0, 10);
  if (f.operator === "between") {
    return s >= (f.value || "0000-00-00") && s <= (f.valueTo || "9999-99-99");
  }
  if (f.operator === "equals") return s === f.value;
  if (f.operator === "before") return s < f.value;
  if (f.operator === "after") return s > f.value;
  return true;
};
const matchSelectFilter = (val: any, f: SelectFilter): boolean => {
  return f.allowed.has(String(val ?? ""));
};
const matchFilter = (val: any, filter: ColumnFilterValue): boolean => {
  if ("allowed" in filter) return matchSelectFilter(val, filter as SelectFilter);
  if ("operator" in filter) {
    const op = (filter as any).operator;
    if (["contains","equals","not_contains","starts_with","ends_with","empty","not_empty"].includes(op)) {
      return matchTextFilter(val, filter as TextFilter);
    }
    if (["between","before","after"].includes(op) && typeof (filter as any).value === "string") {
      return matchDateFilter(val, filter as DateFilter);
    }
    if (["=","!=","<",">","<=",">="].includes(op) || op === "between") {
      return matchNumberFilter(val, filter as NumberFilter);
    }
  }
  return true;
};

const applyFilters = (rows: Record<string, unknown>[]) => {
  let result = rows;
  for (const [field, filter] of Object.entries(filters.value)) {
    if (!isActiveFilter(field)) continue;
    result = result.filter((item) => matchFilter((item as Record<string, unknown>)[field], filter));
  }
  return result;
};

const tableData = computed(() => applyFilters(props.data));

const totalRowCount = computed(() => props.data.length);
const filteredRowCount = computed(() => tableData.value.length);

const {
  rowFields,
  columnFields,
  valueFields,
  showRowTotals,
  showColumnTotals,
  calculatedFields,
  availableFields,
  isConfigured,
  pivotResult,
  addRowField,
  removeRowField,
  addColumnField,
  removeColumnField,
  addValueField,
  removeValueField,
  updateValueFieldAggregation,
  clearConfig,
  addCalculatedField,
  removeCalculatedField,
  toggleCollapsedPath,
} = usePivotTable(tableData, enableDrillDown);

const fieldOrder = computed(() => {
  const names = availableFields.value.map((f) => f.field);
  const seen = new Set(names);
  for (const key of Object.keys(props.data[0] ?? {})) {
    if (!seen.has(key)) {
      names.push(key);
      seen.add(key);
    }
  }
  return names;
});

const activeFilterCount = computed(
  () => fieldOrder.value.filter(isActiveFilter).length,
);

const activeFilterInfo = computed(() => {
  const info: { column: string; valueCount: number; values: string[] }[] = [];
  for (const field of fieldOrder.value) {
    if (!isActiveFilter(field)) continue;
    info.push({ column: field, valueCount: 1, values: [JSON.stringify(filters.value[field])] });
  }
  return info;
});

const activeFilterFieldTitle = computed(() => activeFilterField.value || "");

const toggleFilterPopup = (event: MouseEvent) => {
  if (activeFilterField.value) {
    activeFilterField.value = null;
    return;
  }
  const fields = fieldOrder.value;
  if (!fields.length) return;
  activeFilterField.value = fields[0];
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  filterDropdownStyle.value = {
    position: "fixed",
    top: `${rect.bottom + 2}px`,
    left: `${rect.left}px`,
  };
};
const onFilterUpdate = (field: string, val: ColumnFilterValue | null) => {
  if (val === null) {
    const newFilters = { ...filters.value };
    delete newFilters[field];
    filters.value = newFilters;
  } else {
    filters.value = { ...filters.value, [field]: val };
  }
};
const clearFieldFilter = (field: string) => {
  const newFilters = { ...filters.value };
  delete newFilters[field];
  filters.value = newFilters;
  if (activeFilterField.value === field) activeFilterField.value = null;
};
const clearAllFilters = () => {
  filters.value = {};
  activeFilterField.value = null;
};
const closeFilterPopup = () => {
  activeFilterField.value = null;
};
const onDocClick = (e: MouseEvent) => {
  const t = e.target as HTMLElement;
  if (!t.closest(".cf-dropdown") && !t.closest(".vpf-filter-btn"))
    closeFilterPopup();
};
onMounted(() => document.addEventListener("click", onDocClick));
onUnmounted(() => document.removeEventListener("click", onDocClick));

const draggingField = ref<string | null>(null);

let defaultConfigApplied = false;
const applyDefaultConfig = () => {
  const names = availableFields.value.map((f) => f.field);
  if (names.includes("AccountName")) addRowField("AccountName");
  for (const col of ["Tahun", "Bulan", "Jenis"]) {
    if (names.includes(col)) addColumnField(col);
  }
  if (names.includes("Nilai")) addValueField("Nilai", "sum");
};

watch(
  () => props.data,
  (d) => {
    if (d.length && !defaultConfigApplied) {
      defaultConfigApplied = true;
      applyDefaultConfig();
    }
  },
  { immediate: true },
);

const onAddRowField = (...args: any[]) => addRowField(args[0]);
const onRemoveRowField = (...args: any[]) => removeRowField(args[0]);
const onAddColumnField = (...args: any[]) => addColumnField(args[0]);
const onRemoveColumnField = (...args: any[]) => removeColumnField(args[0]);
const onAddValueField = (...args: any[]) => addValueField(args[0], args[1]);
const onRemoveValueField = (...args: any[]) => removeValueField(args[0], args[1]);
const onUpdateAggregation = (...args: any[]) =>
  updateValueFieldAggregation(args[0], args[1], args[2]);
const onAddCalculatedField = (...args: any[]) => addCalculatedField(args[0]);
const onRemoveCalculatedField = (...args: any[]) => removeCalculatedField(args[0]);
const onUpdateCalculatedField = (...args: any[]) => {
  const f = args[0] as (typeof calculatedFields.value)[number];
  calculatedFields.value = calculatedFields.value.map((x) =>
    x.id === f.id ? f : x,
  );
};
const onReorderRowFields = (...args: any[]) => {
  rowFields.value = args[0];
};
const onReorderColumnFields = (...args: any[]) => {
  columnFields.value = args[0];
};
const onToggleCollapse = (...args: any[]) => {
  toggleCollapsedPath(args[0], args[1], rowFields.value, pivotResult.value);
};
</script>

<template>
  <div class="vpg-pivot-wrap">
    <!-- Filter bar -->
    <div class="vpg-pivot-filterbar">
      <button
        class="vpf-filter-btn"
        :class="{ active: activeFilterCount > 0 }"
        @click.stop="toggleFilterPopup"
        title="Filter data pivot"
      >
        <IconFilter :size="12" :stroke-width="2" />
        Filter
        <span v-if="activeFilterCount > 0" class="vpf-badge">
          {{ activeFilterCount }}
        </span>
      </button>
      <span
        v-for="field in fieldOrder.filter(isActiveFilter)"
        :key="field"
        class="vpf-chip"
      >
        {{ field }}: filtered
        <button class="vpf-chip-x" @click="clearFieldFilter(field)">×</button>
      </span>
      <button
        v-if="activeFilterCount > 0"
        class="vpf-reset"
        @click="clearAllFilters"
      >
        Reset Filter
      </button>
    </div>

    <div class="vpg-pivot-container">
      <div class="vpg-pivot-config-panel">
        <PivotConfig
          :available-fields="availableFields"
          :row-fields="rowFields"
          :column-fields="columnFields"
          :value-fields="valueFields"
          :show-row-totals="showRowTotals"
          :show-column-totals="showColumnTotals"
          :calculated-fields="calculatedFields"
          :theme="theme"
          @update:show-row-totals="showRowTotals = $event"
          @update:show-column-totals="showColumnTotals = $event"
          @clear-config="clearConfig"
          @drag-start="draggingField = $event"
          @drag-end="draggingField = null"
          @update-aggregation="onUpdateAggregation"
          @add-row-field="onAddRowField"
          @remove-row-field="onRemoveRowField"
          @add-column-field="onAddColumnField"
          @remove-column-field="onRemoveColumnField"
          @add-value-field="onAddValueField"
          @remove-value-field="onRemoveValueField"
          @add-calculated-field="onAddCalculatedField"
          @remove-calculated-field="onRemoveCalculatedField"
          @update-calculated-field="onUpdateCalculatedField"
        />
      </div>
      <div class="vpg-pivot-main">
        <PivotSkeleton
          :row-fields="rowFields"
          :column-fields="columnFields"
          :value-fields="valueFields"
          :calculated-fields="calculatedFields"
          :is-configured="isConfigured"
          :dragging-field="draggingField"
          :pivot-result="pivotResult"
          :font-size="fontSize"
          :active-filters="activeFilterInfo"
          :total-row-count="totalRowCount"
          :filtered-row-count="filteredRowCount"
          :theme="theme"
          :enable-drill-down="enableDrillDown"
          :enable-drill-through="false"
          @add-row-field="onAddRowField"
          @remove-row-field="onRemoveRowField"
          @add-column-field="onAddColumnField"
          @remove-column-field="onRemoveColumnField"
          @add-value-field="onAddValueField"
          @remove-value-field="onRemoveValueField"
          @update-aggregation="onUpdateAggregation"
          @reorder-row-fields="onReorderRowFields"
          @reorder-column-fields="onReorderColumnFields"
          @toggle-collapse="onToggleCollapse"
        />
      </div>
    </div>
  </div>

  <Teleport to="body">
    <div
      v-if="activeFilterField"
      class="vpf-popup"
      :style="filterDropdownStyle"
      @click.stop
    >
      <div class="vpf-field-row">
        <select
          v-model="activeFilterField"
          class="vpf-field-select"
        >
          <option v-for="f in fieldOrder" :key="f" :value="f">{{ f }}</option>
        </select>
      </div>
      <ColumnFilter
        :filter-type="fieldFilterTypes[activeFilterField] ?? 'select'"
        :column-key="activeFilterField"
        :title="activeFilterFieldTitle"
        :items="data"
        :model-value="filters[activeFilterField] ?? null"
        @update:model-value="onFilterUpdate(activeFilterField, $event)"
        @close="closeFilterPopup"
      />
    </div>
  </Teleport>
</template>

<style scoped>
.vpg-pivot-wrap {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 0;
  flex: 1;
}
.vpg-pivot-filterbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  padding: 0 2px;
}
.vpf-filter-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 10px;
  border: 1px solid #d1d5db;
  border-radius: 0;
  background: #fff;
  font-size: 11px;
  font-weight: 600;
  color: #374151;
  cursor: pointer;
  transition: all 0.15s;
}
.vpf-filter-btn:hover {
  border-color: var(--ds-primary, #3B5998);
  color: var(--ds-primary, #3B5998);
}
.vpf-filter-btn.active {
  background: rgba(59, 89, 152, 0.1);
  border-color: var(--ds-primary, #3B5998);
  color: var(--ds-primary, #3B5998);
}
.vpf-badge {
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 0;
  background: var(--ds-primary, #3B5998);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}
.vpf-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  padding: 0 6px 0 8px;
  border-radius: 0;
  background: rgba(59, 89, 152, 0.1);
  border: 1px solid rgba(59, 89, 152, 0.35);
  font-size: 11px;
  font-weight: 600;
  color: var(--ds-primary, #3B5998);
}
.vpf-chip-x {
  border: none;
  background: none;
  color: var(--ds-primary, #3B5998);
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  padding: 0 2px;
}
.vpf-chip-x:hover {
  color: #c62828;
}
.vpf-reset {
  border: none;
  background: none;
  font-size: 11px;
  font-weight: 600;
  color: #c62828;
  cursor: pointer;
  padding: 2px 4px;
}
.vpf-reset:hover {
  text-decoration: underline;
}
</style>

<style>
/* Filter popup wrapper for field selector — global */
.vpf-popup {
  position: fixed;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  background: rgb(var(--v-theme-surface));
  border: 1px solid var(--ds-border, #A0AAB8);
  border-radius: 0;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}
.vpf-field-row {
  padding: 5px 6px;
  border-bottom: 1px solid var(--ds-border, #A0AAB8);
}
.vpf-field-select {
  width: 100%;
  height: 26px;
  border: 1px solid var(--ds-border, #A0AAB8);
  border-radius: 0;
  padding: 0 4px;
  font-size: 11px;
  font-weight: 600;
  outline: none;
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  cursor: pointer;
}
.vpf-field-select:focus {
  border-color: var(--ds-primary, #3B5998);
}
</style>
