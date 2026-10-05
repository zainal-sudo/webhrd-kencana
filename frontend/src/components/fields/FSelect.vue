<script setup lang="ts">
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
  }>(),
  {
    required: false,
    disabled: false,
    placeholder: "Pilih...",
    showClear: false,
  }
);

const emit = defineEmits<{ (e: "update:modelValue", v: any): void }>();

function onChange(e: Event) {
  const el = e.target as HTMLSelectElement;
  emit("update:modelValue", el.value === "" ? null : el.value);
}
</script>

<template>
  <div class="field">
    <label>
      {{ label }}
      <span v-if="required" class="req">*</span>
    </label>
    <div class="select-wrap">
      <select
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
  flex-direction: column;
  gap: 4px;
}
.field label {
  font-size: 11px;
  font-weight: 700;
  color: var(--ds-primary, #3b5998);
}
.req {
  color: #dc2626;
}
.select-wrap {
  position: relative;
}
.select-wrap select {
  width: 100%;
  height: 34px;
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
</style>