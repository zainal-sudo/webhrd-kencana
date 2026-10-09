<script setup lang="ts">
import { computed, ref } from "vue";
import { clockTimeError, maskClockTime } from "@/utils/jam";

const props = withDefaults(defineProps<{
  modelValue?: string | number | null;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  compact?: boolean;
}>(), { label: "", required: false, disabled: false, placeholder: "HH:mm:ss", compact: false });
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const touched = ref(false);
const error = computed(() => clockTimeError(props.modelValue, props.required));

function input(event: Event) {
  const target = event.target as HTMLInputElement;
  const before = target.value;
  const digitsBeforeCaret = before.slice(0, target.selectionStart ?? before.length).replace(/\D/g, "").length;
  const value = maskClockTime(before);
  target.value = value;
  const caret = Math.min(value.length, digitsBeforeCaret + Math.floor(Math.max(0, digitsBeforeCaret - 1) / 2));
  target.setSelectionRange(caret, caret);
  emit("update:modelValue", value);
}
function beforeInput(event: InputEvent) {
  if (event.data && /[^0-9:]/.test(event.data)) event.preventDefault();
}
function paste(event: ClipboardEvent) {
  const text = event.clipboardData?.getData("text").trim() || "";
  if (/[^0-9:]/.test(text)) event.preventDefault();
}
function keydown(event: KeyboardEvent) {
  const target = event.target as HTMLInputElement;
  const start = target.selectionStart ?? 0;
  if (start !== target.selectionEnd) return;
  // Delete a digit rather than repeatedly deleting an automatically added colon.
  if (event.key === "Backspace" && target.value[start - 1] === ":") target.setSelectionRange(start - 1, start - 1);
  if (event.key === "Delete" && target.value[start] === ":") target.setSelectionRange(start + 1, start + 1);
}
</script>

<template>
  <label class="time-field" :class="{ compact }">
    <span v-if="label && !compact" class="time-label">{{ label }} <span v-if="required" class="req">*</span></span>
    <input
      type="text" inputmode="numeric" autocomplete="off" spellcheck="false"
      :value="modelValue ?? ''" :disabled="disabled" :placeholder="placeholder" :required="required"
      :aria-label="label || 'Jam (HH:mm:ss)'" :aria-invalid="!!error"
      :title="error || 'Format 24 jam: HH:mm:ss'"
      @beforeinput="beforeInput" @input="input" @paste="paste" @keydown="keydown" @blur="touched = true"
    />
    <small v-if="error && (touched || String(modelValue ?? '').length >= 8)" role="alert">{{ error }}</small>
  </label>
</template>

<style scoped>
.time-field { display: flex; flex-direction: row; flex-wrap: wrap; align-items: center; gap: 4px 8px; min-width: 0; }
.time-label { flex: 0 0 140px; font-size: 11px; font-weight: 700; color: var(--ds-primary); }
.req, small { color: var(--ds-error); }
input { flex: 1; min-width: 0; height: 30px; padding: 0 9px; border: 1px solid var(--ds-border); background: var(--ds-surface-raised); font-family: inherit; font-size: 12px; color: var(--ds-text); outline: none; }
input:focus { border-color: var(--ds-primary); }
input:disabled { background: var(--ds-surface-inset); color: var(--ds-text-secondary); }
input[aria-invalid="true"] { border-color: var(--ds-error); }
.compact input { height: 28px; padding: 0 4px; font-size: 11px; }
small { flex: 1 1 100%; margin-left: 148px; font-size: 10px; font-weight: 400; }
</style>
