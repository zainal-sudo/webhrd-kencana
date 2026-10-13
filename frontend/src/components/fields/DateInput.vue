<script setup lang="ts">
import { ref, watch } from "vue";
import { formatTanggal, parseTanggalInput } from "@/utils/format";

defineOptions({ inheritAttrs: false });
const props = defineProps<{
  modelValue?: string | Date | null;
  disabled?: boolean;
  required?: boolean;
  min?: string;
  max?: string;
}>();
const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
  (e: "change", event: Event): void;
}>();
const text = ref(formatTanggal(props.modelValue));
const input = ref<HTMLInputElement>();
const picker = ref<HTMLInputElement>();
watch(() => props.modelValue, value => {
  text.value = formatTanggal(value);
  input.value?.setCustomValidity("");
});
function commit(event: Event) {
  const value = parseTanggalInput(text.value);
  const valid = value !== null && (!value || ((!props.min || value >= props.min) && (!props.max || value <= props.max)));
  input.value?.setCustomValidity(valid ? "" : "Masukkan tanggal valid dalam format dd/mm/yyyy dan rentang yang diizinkan.");
  if (!valid) {
    // Jangan biarkan nilai lama tersimpan saat pengguna mengetik tanggal invalid.
    emit("update:modelValue", "");
    input.value?.reportValidity();
    return;
  }
  text.value = formatTanggal(value);
  emit("update:modelValue", value!);
  emit("change", event);
}
function pick(event: Event) {
  text.value = formatTanggal((event.target as HTMLInputElement).value);
  commit(event);
}
function openPicker() {
  if (picker.value?.showPicker) picker.value.showPicker();
  else picker.value?.click();
}
</script>

<template>
  <span class="date-input">
    <input ref="input" v-bind="$attrs" v-model="text" type="text" placeholder="dd/mm/yyyy" maxlength="10"
      :disabled="disabled" :required="required" @change="commit" />
    <button type="button" class="calendar-button" :disabled="disabled" aria-label="Pilih tanggal" @click="openPicker">
      <svg class="calendar-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1" aria-hidden="true" focusable="false">
        <rect x="2.5" y="3.5" width="11" height="11" rx=".5" />
        <path d="M5 1.5v3M11 1.5v3" />
        <path d="M3 4h10v2H3z" fill="currentColor" stroke="none" />
      </svg>
    </button>
    <input ref="picker" class="native-picker" type="date" tabindex="-1" aria-hidden="true"
      :value="typeof modelValue === 'string' ? modelValue.slice(0, 10) : parseTanggalInput(formatTanggal(modelValue)) || ''"
      :disabled="disabled" :min="min" :max="max" @change="pick" />
  </span>
</template>

<style scoped>
.date-input { position: relative; display: inline-flex; min-width: 0; flex: 1; }
.date-input > input[type="text"] { width: 100%; min-width: 0; padding-right: 28px; box-sizing: border-box; }
.calendar-button { position: absolute; right: 2px; top: 2px; bottom: 2px; display: inline-flex; align-items: center; justify-content: center; width: 24px; padding: 0; border: 0; background: transparent; color: var(--ds-text, #1b2d4a); cursor: pointer; }
.calendar-icon { display: block; width: 14px; height: 14px; flex-shrink: 0; }
.calendar-button:not(:disabled):hover { background: var(--ds-surface-inset, #e8edf4); }
.calendar-button:focus-visible { outline: 2px solid var(--ds-primary, #3b5998); outline-offset: -2px; }
.calendar-button:disabled { cursor: default; opacity: .5; }
.native-picker { position: absolute; right: 0; bottom: 0; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
</style>
