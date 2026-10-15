<script setup lang="ts">
import { computed, getCurrentInstance } from "vue";
import MsIcon from "@/components/MsIcon.vue";

interface Option {
  label: string;
  value: string | number;
}

const props = withDefaults(
  defineProps<{
    label: string;
    modelValue: string | number | null | undefined;
    options: Option[];
    required?: boolean;
    disabled?: boolean;
    placeholder?: string;
    showClear?: boolean;
    searchable?: boolean;
  }>(),
  {
    required: false,
    disabled: false,
    placeholder: "Pilih...",
    showClear: false,
    searchable: false,
  }
);

const emit = defineEmits<{ (e: "update:modelValue", v: any): void }>();
const inputId = `fselect-${getCurrentInstance()?.uid}`;
const searchItems = computed(() => props.options.map(option => ({ title: option.label, value: String(option.value) })));
const searchValue = computed(() => props.modelValue == null || props.modelValue === "" ? null : String(props.modelValue));

function onAutocompleteChange(value: string | null) {
  if (props.disabled) return;
  if (value == null || value === "") {
    if (props.showClear) emit("update:modelValue", null);
    return;
  }
  // Match native select payloads: option values are strings, including "0".
  if (searchItems.value.some(option => option.value === String(value))) emit("update:modelValue", String(value));
}

function onChange(e: Event) {
  const el = e.target as HTMLSelectElement;
  emit("update:modelValue", el.value === "" ? null : el.value);
}
</script>

<template>
  <div class="field" :class="{ 'searchable-field': searchable }">
    <label :for="inputId">
      {{ label }}
      <span v-if="required" class="req">*</span>
    </label>
    <v-autocomplete
      v-if="searchable"
      :id="inputId"
      class="searchable-select"
      :model-value="searchValue"
      :items="searchItems"
      :disabled="disabled"
      :clearable="showClear"
      :aria-label="label || 'Pilih opsi'"
      :aria-required="required"
      :placeholder="placeholder === 'Pilih...' ? 'Cari / pilih...' : placeholder"
      no-data-text="Tidak ditemukan"
      :menu-props="{ maxHeight: 260, maxWidth: 'min(380px, calc(100vw - 24px))', contentClass: 'employee-select-menu' }"
      :list-props="{ density: 'compact' }"
      density="compact"
      variant="outlined"
      menu-icon="mdi-chevron-down"
      hide-details
      autocomplete="off"
      @update:model-value="onAutocompleteChange"
    >
      <template #prepend-inner><MsIcon name="search" :size="14" /></template>
    </v-autocomplete>
    <div v-else class="select-wrap">
      <select
        :id="inputId"
        :value="modelValue === null || modelValue === undefined ? '' : String(modelValue)"
        :disabled="disabled"
        @change="onChange"
      >
        <option value="" :disabled="!showClear">{{ placeholder }}</option>
        <option v-for="opt in options" :key="String(opt.value)" :value="String(opt.value)">
          {{ opt.label }}
        </option>
      </select>
      <span class="select-chev material-symbols-outlined">expand_more</span>
    </div>
  </div>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
}
.field label {
  flex: 0 0 140px;
  font-size: 11px;
  font-weight: 700;
  color: var(--ds-primary, #3b5998);
}
.req {
  color: #dc2626;
}
.select-wrap {
  position: relative;
  flex: 1;
  min-width: 0;
}
.select-wrap select {
  width: 100%;
  height: 30px;
  padding: 0 28px 0 9px;
  border: 1px solid var(--ds-border, #b0b8c4);
  background: #fff;
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: 12px;
  color: var(--ds-on-surface, #1b2d4a);
  outline: none;
  -webkit-appearance: none;
  appearance: none;
}
.select-wrap select:focus {
  border-color: var(--ds-primary, #3b5998);
}
.select-wrap select:disabled {
  background: var(--ds-surface-variant, #e6e9ef);
  color: #6b7a90;
}
.select-chev {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 16px;
  color: #6b7a90;
  pointer-events: none;
}
.searchable-field { min-width: 0; }
.searchable-select { flex: 1; min-width: 0; font-size: 11px; --v-input-control-height: 30px; }
.searchable-select :deep(.v-field) { font-size: 11px; background: var(--ds-surface-raised, #fff); color: var(--ds-text, #1b2d4a); --v-field-padding-start: 8px; --v-field-padding-end: 6px; --v-field-border-width: 1px; border-radius: 8px !important; }
.searchable-select :deep(.v-field__input) { min-height: 30px; padding: 0 4px; gap: 0; }
.searchable-select :deep(input[id^="fselect-"]) { --field-focus-color: transparent !important; border: 0 !important; border-radius: 0 !important; outline: none !important; box-shadow: none !important; background: transparent !important; padding: 0 !important; height: 30px; min-width: 0; font: inherit; }
.searchable-select :deep(.v-field:focus-within), .searchable-select :deep(.v-field__input:focus-within) { outline: none !important; box-shadow: none !important; }
.searchable-select :deep(.v-field__outline) { --v-field-border-width: 1px; }
.searchable-select :deep(.v-field__prepend-inner), .searchable-select :deep(.v-field__append-inner), .searchable-select :deep(.v-field__clearable) { padding-top: 0; align-items: center; }
.searchable-select :deep(.v-field__prepend-inner) { color: var(--ds-text-secondary, #5a6a7e); }
.searchable-select :deep(.v-field__append-inner .v-icon), .searchable-select :deep(.v-field__clearable .v-icon) { font-size: 16px; }
.searchable-select :deep(.v-autocomplete__selection) { max-width: 100%; font-size: 11px; }
.searchable-select :deep(.v-autocomplete__selection-text) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
:global(.employee-select-menu .v-list) { padding: 4px !important; background: var(--ds-surface-raised, #fff) !important; color: var(--ds-text, #1b2d4a); border: 1px solid var(--ds-border-light, #d5dce6); border-radius: 8px !important; }
:global(.employee-select-menu .v-list-item) { min-height: 32px !important; padding: 6px 10px !important; border-radius: 5px !important; font-size: 11px; }
:global(.employee-select-menu .v-list-item-title) { font-size: 11px !important; line-height: 1.45 !important; white-space: normal; overflow-wrap: anywhere; }
</style>
