<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string;
    modelValue: number | null | undefined;
    required?: boolean;
    disabled?: boolean;
    placeholder?: string;
    min?: number;
  }>(),
  { required: false, disabled: false, placeholder: "0", min: undefined }
);

const emit = defineEmits<{ (e: "update:modelValue", v: number | null): void }>();

function onInput(e: Event) {
  const raw = (e.target as HTMLInputElement).value;
  if (raw === "") {
    emit("update:modelValue", null);
    return;
  }
  const n = Number(raw);
  emit("update:modelValue", isNaN(n) ? null : n);
}
</script>

<template>
  <div class="field">
    <label>
      {{ label }}
      <span v-if="required" class="req">*</span>
    </label>
    <input
      :value="modelValue === null || modelValue === undefined ? '' : modelValue"
      type="number"
      :disabled="disabled"
      :placeholder="placeholder"
      :min="min"
      @input="onInput"
    />
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
.field input {
  flex: 1;
  min-width: 0;
  height: 30px;
  padding: 0 9px;
  border: 1px solid var(--ds-border, #b0b8c4);
  background: #fff;
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: 12px;
  color: var(--ds-on-surface, #1b2d4a);
  outline: none;
}
.field input:focus {
  border-color: var(--ds-primary, #3b5998);
}
.field input:disabled {
  background: var(--ds-surface-variant, #e6e9ef);
  color: #6b7a90;
}
</style>