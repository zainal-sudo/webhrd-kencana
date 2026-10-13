<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { clockTimeError, maskClockTime } from "@/utils/jam";

const props = withDefaults(defineProps<{
  modelValue?: string | number | null;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  compact?: boolean;
  /** Grid dengan navigasi sendiri menangani Enter melalui event bubbling. */
  navigateOnEnter?: boolean;
}>(), { label: "", required: false, disabled: false, placeholder: "HH:mm:ss", compact: false });
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const touched = ref(false);
const error = computed(() => clockTimeError(props.modelValue, props.required));
const editing = ref(false);
const dirty = ref(false);
const draft = ref("");
let lastEmitted: string | null = null;
const display = computed(() => editing.value ? draft.value : String(props.modelValue ?? ""));
// The suffix is only a visual guide, not editable text. More digits can be
// typed naturally without having to delete automatically supplied zeros.
const suffix = computed(() => editing.value && draft.value.replace(/\D/g, '').length >= 2
  ? complete(draft.value).slice(draft.value.length) : "");

function complete(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 6);
  if (!digits) return '';
  return maskClockTime(digits.length === 1 ? digits.padStart(2, '0').padEnd(6, '0') : digits.padEnd(6, '0'));
}
function update(value: string) {
  lastEmitted = value;
  emit("update:modelValue", value);
}
function focus(event: FocusEvent) {
  if (props.disabled) return;
  editing.value = true;
  dirty.value = false;
  draft.value = '';
  touched.value = false;
  lastEmitted = null;
  const target = event.target as HTMLInputElement;
  target.value = '';
  target.setSelectionRange(0, 0);
}
function blur() {
  if (editing.value && dirty.value) update(complete(draft.value));
  editing.value = false;
  touched.value = true;
}
watch(() => props.modelValue, value => {
  // Reset/load changes come from outside; own emissions retain the raw draft.
  if (editing.value && String(value ?? '') !== lastEmitted) {
    draft.value = '';
    dirty.value = false;
    lastEmitted = null;
  }
});

function input(event: Event) {
  if (props.disabled) return;
  const target = event.target as HTMLInputElement;
  const before = target.value;
  const digitsBeforeCaret = before.slice(0, target.selectionStart ?? before.length).replace(/\D/g, "").length;
  const value = maskClockTime(before);
  target.value = value;
  const caret = Math.min(value.length, digitsBeforeCaret + Math.floor(Math.max(0, digitsBeforeCaret - 1) / 2));
  target.setSelectionRange(caret, caret);
  draft.value = value;
  dirty.value = true;
  update(value.replace(/\D/g, '').length >= 2 ? complete(value) : value);
}
function beforeInput(event: InputEvent) {
  if (event.data && /[^0-9:]/.test(event.data)) event.preventDefault();
}
function paste(event: ClipboardEvent) {
  const text = event.clipboardData?.getData("text").trim() || "";
  if (/[^0-9:]/.test(text)) event.preventDefault();
}
async function keydown(event: KeyboardEvent) {
  const target = event.target as HTMLInputElement;
  if (event.key === "Enter") {
    if (props.navigateOnEnter === false) return;
    // Do not allow implicit form submission or parent Enter shortcuts.
    event.preventDefault();
    event.stopPropagation();
    if (props.disabled || event.isComposing || event.repeat) return;
    const changed = editing.value && dirty.value;
    const value = changed ? complete(draft.value) : String(props.modelValue ?? '');
    touched.value = true;
    if (changed) update(value);
    if (clockTimeError(value, props.required)) return;
    dirty.value = false;
    editing.value = false;
    target.value = value;
    await nextTick();
    // Stay within the current form/dialog; never focus Simpan or another tab.
    const scope = target.closest('form, .form-panel, [role="dialog"]');
    if (!scope) return;
    const fields = Array.from(scope.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea'));
    const index = fields.indexOf(target);
    if (index < 0) return;
    const candidates = event.shiftKey ? fields.slice(0, index).reverse() : fields.slice(index + 1);
    const next = candidates.find(field => !field.matches(':disabled, [readonly], [type="hidden"]')
      && field.tabIndex >= 0 && !field.closest('[hidden], [inert], [aria-hidden="true"]')
      && field.getClientRects().length > 0);
    next?.focus();
    return;
  }
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
    <span class="time-control">
    <input
      type="text" inputmode="numeric" autocomplete="off" spellcheck="false"
      :value="display" :disabled="disabled" :placeholder="editing ? '00:00:00' : placeholder" :required="required"
      :aria-label="label || 'Jam (HH:mm:ss)'" :aria-invalid="!!error"
      :title="error || 'Format 24 jam: HH:mm:ss'"
      @focus="focus" @beforeinput="beforeInput" @input="input" @paste="paste" @keydown="keydown" @blur="blur"
    />
    <span v-if="suffix" class="time-guide" aria-hidden="true"><span class="typed-guide">{{ draft }}</span>{{ suffix }}</span>
    </span>
    <small v-if="error && (touched || (!editing && String(modelValue ?? '').length >= 8))" role="alert">{{ error }}</small>
  </label>
</template>

<style scoped>
.time-field { display: flex; flex-direction: row; flex-wrap: wrap; align-items: center; gap: 4px 8px; min-width: 0; }
.time-label { flex: 0 0 140px; font-size: 11px; font-weight: 700; color: var(--ds-primary); }
.req, small { color: var(--ds-error); }
.time-control { position: relative; flex: 1; min-width: 0; }
input { width: 100%; box-sizing: border-box; min-width: 0; height: 30px; padding: 0 9px; border: 1px solid var(--ds-border); background: var(--ds-surface-raised); font-family: inherit; font-size: 12px; color: var(--ds-text); outline: none; }
.time-guide { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); font-family: inherit; font-size: 12px; white-space: pre; pointer-events: none; color: var(--ds-text-muted, var(--ds-text-secondary)); opacity: .65; }
.typed-guide { visibility: hidden; }
input::placeholder { color: var(--ds-text-muted, var(--ds-text-secondary)); opacity: .65; }
input:focus-visible { outline: 2px solid var(--ds-primary); outline-offset: 1px; }
input:focus { border-color: var(--ds-primary); }
input:disabled { background: var(--ds-surface-inset); color: var(--ds-text-secondary); }
input[aria-invalid="true"] { border-color: var(--ds-error); }
.compact input { height: 28px; padding: 0 4px; font-size: 11px; }
.compact .time-guide { left: 5px; font-size: 11px; }
small { flex: 1 1 100%; margin-left: 148px; font-size: 10px; font-weight: 400; }
</style>
