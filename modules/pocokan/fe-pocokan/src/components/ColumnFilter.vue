<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from "vue";
import { IconSearch, IconFilter, IconX } from "@tabler/icons-vue";

export type FilterType = "text" | "number" | "date" | "select";

export interface TextFilter {
  operator:
    | "contains"
    | "equals"
    | "not_contains"
    | "starts_with"
    | "ends_with"
    | "empty"
    | "not_empty";
  value: string;
}

export interface NumberFilter {
  operator: "=" | "!=" | "<" | ">" | "<=" | ">=" | "between";
  value: number | null;
  valueTo: number | null; // for "between"
}

export interface DateFilter {
  operator: "between" | "equals" | "before" | "after";
  value: string; // yyyy-mm-dd
  valueTo: string; // for "between"
}

export interface SelectFilter {
  allowed: Set<string>;
}

export type ColumnFilterValue = TextFilter | NumberFilter | DateFilter | SelectFilter;

const props = defineProps<{
  filterType: FilterType;
  columnKey: string;
  title: string;
  items: Record<string, any>[];
  modelValue: ColumnFilterValue | null;
  dropdownStyle?: Record<string, string>;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: ColumnFilterValue | null];
  close: [];
}>();

// ── Text filter state ────────────────────────────────────────────────────
const textOperator = ref<TextFilter["operator"]>("contains");
const textValue = ref("");

// ── Number filter state ──────────────────────────────────────────────────
const numOperator = ref<NumberFilter["operator"]>("=");
const numValue = ref<string>("");
const numValueTo = ref<string>("");

// ── Date filter state ────────────────────────────────────────────────────
const dateOperator = ref<DateFilter["operator"]>("between");
const dateValue = ref("");
const dateValueTo = ref("");

// ── Select filter state ──────────────────────────────────────────────────
const selectSearch = ref("");
const selectAllChecked = ref(true);
const selectValues = ref<Record<string, boolean>>({});

// Track last column key to only sync from model when column changes
const lastSyncedKey = ref("");

// Initialize from modelValue — only when column changes (not on every emit)
const initFromModel = () => {
  const v = props.modelValue;
  if (!v) {
    textOperator.value = "contains";
    textValue.value = "";
    numOperator.value = "=";
    numValue.value = "";
    numValueTo.value = "";
    dateOperator.value = "between";
    dateValue.value = "";
    dateValueTo.value = "";
    selectValues.value = {};
    selectAllChecked.value = true;
    return;
  }

  if (props.filterType === "text" && "operator" in v && "value" in v) {
    textOperator.value = (v as TextFilter).operator;
    textValue.value = (v as TextFilter).value;
  } else if (props.filterType === "number" && "operator" in v) {
    numOperator.value = (v as NumberFilter).operator;
    numValue.value = String((v as NumberFilter).value ?? "");
    numValueTo.value = String((v as NumberFilter).valueTo ?? "");
  } else if (props.filterType === "date" && "operator" in v) {
    dateOperator.value = (v as DateFilter).operator;
    dateValue.value = (v as DateFilter).value;
    dateValueTo.value = (v as DateFilter).valueTo;
  } else if (props.filterType === "select" && "allowed" in v) {
    const allowed = (v as SelectFilter).allowed;
    const newObj: Record<string, boolean> = {};
    for (const v2 of uniqueSelectValues.value) {
      newObj[v2] = allowed.has(v2);
    }
    selectValues.value = newObj;
    selectAllChecked.value = Object.values(newObj).every(Boolean);
  }
};

// ── Unique values for select ─────────────────────────────────────────────
const uniqueSelectValues = computed(() => {
  const vals = new Set<string>();
  for (const item of props.items) {
    vals.add(String(item[props.columnKey] ?? ""));
  }
  return Array.from(vals).sort((a, b) =>
    a.localeCompare(b, "id", { numeric: true }),
  );
});

// Ensure selectValues always has ALL unique values as keys
const ensureAllKeys = () => {
  const obj = { ...selectValues.value };
  let changed = false;
  for (const v of uniqueSelectValues.value) {
    if (!(v in obj)) {
      obj[v] = true;
      changed = true;
    }
  }
  if (changed) selectValues.value = obj;
};

// Initialize select values & sync from model when column changes
watch(
  () => [props.items, props.columnKey],
  () => {
    if (props.filterType === "select") {
      const newObj: Record<string, boolean> = {};
      for (const v of uniqueSelectValues.value) {
        newObj[v] = selectValues.value[v] ?? true;
      }
      selectValues.value = newObj;
      selectAllChecked.value = Object.values(newObj).every(Boolean);
    }
    ensureAllKeys();
    // Sync from model when column key changes (not on every model emit)
    if (props.columnKey !== lastSyncedKey.value) {
      lastSyncedKey.value = props.columnKey;
      initFromModel();
    }
  },
  { immediate: true },
);

// ── Click outside to close ──────────────────────────────────────────────
const dropdownRef = ref<HTMLElement | null>(null);
const onDocClick = (e: MouseEvent) => {
  const target = e.target as HTMLElement;
  if (!target.closest(".cf-dropdown") && !target.closest(".col-filter-btn") && !target.closest(".vpf-filter-btn") && !target.closest(".vpf-popup")) {
    emit("close");
  }
};
onMounted(() => document.addEventListener("click", onDocClick));
onUnmounted(() => document.removeEventListener("click", onDocClick));

// ── Filtered unique values for select search ─────────────────────────────
const filteredSelectValues = computed(() => {
  const q = selectSearch.value.toLowerCase();
  const all = uniqueSelectValues.value;
  return q ? all.filter((v) => v.toLowerCase().includes(q)) : all;
});

// ── Select actions ───────────────────────────────────────────────────────
const toggleSelectAll = async () => {
  ensureAllKeys();
  await nextTick();
  const newVal = !selectAllChecked.value;
  selectAllChecked.value = newVal;
  const newObj: Record<string, boolean> = {};
  for (const v of uniqueSelectValues.value) {
    newObj[v] = newVal;
  }
  selectValues.value = newObj;
};

const toggleSelectVal = (val: string) => {
  ensureAllKeys();
  const newObj = { ...selectValues.value, [val]: !(selectValues.value[val] ?? true) };
  selectValues.value = newObj;
  selectAllChecked.value = Object.values(newObj).every(Boolean);
};

// ── Apply filter ─────────────────────────────────────────────────────────
const applyFilter = () => {
  if (props.filterType === "text") {
    if (!textValue.value && textOperator.value !== "empty" && textOperator.value !== "not_empty") {
      emit("update:modelValue", null);
    } else {
      emit("update:modelValue", {
        operator: textOperator.value,
        value: textValue.value,
      } as TextFilter);
    }
  } else if (props.filterType === "number") {
    const num = numValue.value !== "" ? Number(numValue.value) : null;
    if (num === null && numOperator.value !== "between") {
      emit("update:modelValue", null);
    } else if (numOperator.value === "between") {
      const to = numValueTo.value !== "" ? Number(numValueTo.value) : null;
      if (num === null && to === null) {
        emit("update:modelValue", null);
      } else {
        emit("update:modelValue", {
          operator: "between",
          value: num,
          valueTo: to,
        } as NumberFilter);
      }
    } else {
      emit("update:modelValue", {
        operator: numOperator.value,
        value: num,
        valueTo: null,
      } as NumberFilter);
    }
  } else if (props.filterType === "date") {
    if (!dateValue.value && dateOperator.value !== "between") {
      emit("update:modelValue", null);
    } else if (dateOperator.value === "between") {
      if (!dateValue.value && !dateValueTo.value) {
        emit("update:modelValue", null);
      } else {
        emit("update:modelValue", {
          operator: "between",
          value: dateValue.value,
          valueTo: dateValueTo.value,
        } as DateFilter);
      }
    } else {
      emit("update:modelValue", {
        operator: dateOperator.value,
        value: dateValue.value,
        valueTo: "",
      } as DateFilter);
    }
  } else if (props.filterType === "select") {
    const allCount = uniqueSelectValues.value.length;
    const entries = Object.entries(selectValues.value);
    const checkedCount = entries.filter(([, v]) => v).length;
    if (checkedCount === allCount) {
      emit("update:modelValue", null);
    } else {
      const allowed = new Set<string>();
      for (const [key, val] of entries) {
        if (val) allowed.add(key);
      }
      emit("update:modelValue", { allowed } as SelectFilter);
    }
  }
  emit("close");
};

const clearFilter = () => {
  emit("update:modelValue", null);
  emit("close");
};

const isActive = computed(() => props.modelValue !== null);

const textOperators = [
  { value: "contains", label: "Mengandung" },
  { value: "equals", label: "Sama dengan" },
  { value: "not_contains", label: "Tidak mengandung" },
  { value: "starts_with", label: "Diawali" },
  { value: "ends_with", label: "Diakhiri" },
  { value: "empty", label: "Kosong" },
  { value: "not_empty", label: "Tidak kosong" },
];

const numberOperators = [
  { value: "=", label: "=" },
  { value: "!=", label: "≠" },
  { value: "<", label: "<" },
  { value: ">", label: ">" },
  { value: "<=", label: "≤" },
  { value: ">=", label: "≥" },
  { value: "between", label: "Antara" },
];

const dateOperators = [
  { value: "between", label: "Antara" },
  { value: "equals", label: "Sama dengan" },
  { value: "before", label: "Sebelum" },
  { value: "after", label: "Sesudah" },
];
</script>

<template>
  <div
    class="cf-dropdown"
    :style="dropdownStyle"
    @click.stop
  >
      <!-- Header -->
      <div class="cf-header">
        <IconFilter :size="12" :stroke-width="2" class="cf-header-icon" />
        <span class="cf-header-title">{{ title }}</span>
        <button v-if="isActive" class="cf-clear-btn" @click="clearFilter" title="Hapus filter">
          <IconX :size="12" :stroke-width="2" />
        </button>
      </div>

      <!-- TEXT filter -->
      <template v-if="filterType === 'text'">
        <div class="cf-body">
          <div class="cf-row">
            <select v-model="textOperator" class="cf-select">
              <option v-for="op in textOperators" :key="op.value" :value="op.value">
                {{ op.label }}
              </option>
            </select>
          </div>
          <div v-if="textOperator !== 'empty' && textOperator !== 'not_empty'" class="cf-row">
            <input
              v-model="textValue"
              type="text"
              class="cf-input"
              placeholder="Nilai..."
              @keydown.enter="applyFilter"
            />
          </div>
        </div>
      </template>

      <!-- NUMBER filter -->
      <template v-else-if="filterType === 'number'">
        <div class="cf-body">
          <div class="cf-row">
            <select v-model="numOperator" class="cf-select">
              <option v-for="op in numberOperators" :key="op.value" :value="op.value">
                {{ op.label }}
              </option>
            </select>
          </div>
          <div v-if="numOperator !== 'between'" class="cf-row">
            <input
              v-model="numValue"
              type="number"
              class="cf-input"
              placeholder="Nilai..."
              @keydown.enter="applyFilter"
            />
          </div>
          <div v-else class="cf-row-between">
            <label class="cf-label">Dari</label>
            <input
              v-model="numValue"
              type="number"
              class="cf-input"
              placeholder="0"
              @keydown.enter="applyFilter"
            />
            <label class="cf-label">Sampai</label>
            <input
              v-model="numValueTo"
              type="number"
              class="cf-input"
              placeholder="0"
              @keydown.enter="applyFilter"
            />
          </div>
        </div>
      </template>

      <!-- DATE filter -->
      <template v-else-if="filterType === 'date'">
        <div class="cf-body">
          <div class="cf-row">
            <select v-model="dateOperator" class="cf-select">
              <option v-for="op in dateOperators" :key="op.value" :value="op.value">
                {{ op.label }}
              </option>
            </select>
          </div>
          <div v-if="dateOperator !== 'between'" class="cf-row">
            <input
              v-model="dateValue"
              type="date"
              class="cf-input"
              @keydown.enter="applyFilter"
            />
          </div>
          <div v-else class="cf-row-between">
            <label class="cf-label">Dari</label>
            <input
              v-model="dateValue"
              type="date"
              class="cf-input"
              @keydown.enter="applyFilter"
            />
            <label class="cf-label">Sampai</label>
            <input
              v-model="dateValueTo"
              type="date"
              class="cf-input"
              @keydown.enter="applyFilter"
            />
          </div>
        </div>
      </template>

      <!-- SELECT filter (checkbox) -->
      <template v-else-if="filterType === 'select'">
        <div class="cf-body cf-body-select">
          <div class="cf-search-row">
            <IconSearch :size="12" class="cf-search-icon" />
            <input
              v-model="selectSearch"
              type="text"
              class="cf-search-input"
              placeholder="Cari..."
            />
          </div>
          <div class="cf-select-actions">
            <button class="cf-action-btn" @click="toggleSelectAll">
              {{ selectAllChecked ? "Sembunyikan Semua" : "Tampilkan Semua" }}
            </button>
          </div>
          <div class="cf-divider" />
          <div class="cf-select-list">
            <label
              v-for="val in filteredSelectValues"
              :key="val"
              class="cf-select-item"
            >
              <input
                type="checkbox"
                :checked="selectValues[val]"
                @change="toggleSelectVal(val)"
              />
              <span class="cf-select-val">{{ val === "" ? "(Kosong)" : val }}</span>
            </label>
            <div v-if="filteredSelectValues.length === 0" class="cf-select-empty">
              Tidak ada hasil
            </div>
          </div>
        </div>
      </template>

      <!-- Footer -->
      <div class="cf-footer">
        <button class="cf-ok-btn" @click="applyFilter">OK</button>
      </div>
    </div>
</template>

<style scoped>
/* Minimal scoped styles for non-select parts */
</style>

<style>
/* ── ColumnFilter Dropdown — global (teleported to body) ── */
.cf-dropdown {
  background: rgb(var(--v-theme-surface));
  border: 1px solid var(--ds-border, #A0AAB8);
  border-radius: 0;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  width: 190px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-family: "Plus Jakarta Sans", system-ui, sans-serif;
  z-index: 9999;
}
.cf-header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 8px;
  background: #F0F3F8;
  border-bottom: 1px solid var(--ds-border, #A0AAB8);
}
.cf-header-icon {
  color: var(--ds-primary, #3B5998);
}
.cf-header-title {
  font-size: 10px;
  font-weight: 700;
  color: #374151;
  flex: 1;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.cf-clear-btn {
  border: none;
  background: none;
  color: #c62828;
  cursor: pointer;
  padding: 1px;
  display: flex;
  align-items: center;
}
.cf-clear-btn:hover {
  background: rgba(198, 40, 40, 0.1);
  border-radius: 2px;
}

/* Body */
.cf-body {
  padding: 5px 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.cf-body-select {
  padding: 0;
}
.cf-row {
  display: flex;
}
.cf-row-between {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.cf-label {
  font-size: 10px;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.55);
  text-transform: uppercase;
  letter-spacing: 0.02em;
}
.cf-sep {
  display: none;
}

/* Inputs */
.cf-input {
  width: 100%;
  height: 26px;
  border: 1px solid var(--ds-border, #A0AAB8);
  border-radius: 0;
  padding: 0 6px;
  font-size: 11px;
  outline: none;
  box-sizing: border-box;
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
}
.cf-input:focus {
  border-color: var(--ds-primary, #3B5998);
}
.cf-input-half {
  width: 100%;
}
.cf-select {
  width: 100%;
  height: 26px;
  border: 1px solid var(--ds-border, #A0AAB8);
  border-radius: 0;
  padding: 0 4px;
  font-size: 11px;
  outline: none;
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  cursor: pointer;
}
.cf-select:focus {
  border-color: var(--ds-primary, #3B5998);
}

/* Search row (select type) */
.cf-search-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 6px 3px;
}
.cf-search-icon {
  color: rgba(var(--v-theme-on-surface), 0.35);
  flex-shrink: 0;
}
.cf-search-input {
  flex: 1;
  height: 24px;
  border: 1px solid var(--ds-border, #A0AAB8);
  border-radius: 0;
  padding: 0 6px;
  font-size: 11px;
  outline: none;
  box-sizing: border-box;
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
}
.cf-search-input:focus {
  border-color: var(--ds-primary, #3B5998);
}

/* Select actions */
.cf-select-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px 3px;
}
.cf-action-btn {
  background: none;
  border: none;
  font-size: 10px;
  color: var(--ds-primary, #3B5998);
  cursor: pointer;
  padding: 1px 0;
}
.cf-action-btn:hover {
  text-decoration: underline;
}

/* Divider */
.cf-divider {
  height: 1px;
  background: var(--ds-border, #A0AAB8);
}

/* Select list */
.cf-select-list {
  max-height: 70px;
  min-height: 35px;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 2px 0;
}
.cf-select-item {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px;
  cursor: pointer;
  font-size: 11px;
  color: rgb(var(--v-theme-on-surface));
  transition: background 0.1s;
}
.cf-select-item:hover {
  background: #E8EDF5;
}
.cf-select-item input[type="checkbox"] {
  width: 12px;
  height: 12px;
  cursor: pointer;
  flex-shrink: 0;
  accent-color: var(--ds-primary, #3B5998);
}
.cf-select-val {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cf-select-empty {
  padding: 6px 8px;
  font-size: 10px;
  color: rgba(var(--v-theme-on-surface), 0.4);
  text-align: center;
}

/* Footer */
.cf-footer {
  padding: 4px 6px;
  border-top: 1px solid var(--ds-border, #A0AAB8);
  display: flex;
  justify-content: flex-end;
}
.cf-ok-btn {
  background: var(--ds-primary, #3B5998);
  color: white;
  border: none;
  border-radius: 0;
  padding: 3px 12px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}
.cf-ok-btn:hover {
  opacity: 0.88;
}
</style>
