<script setup lang="ts">
import { computed, getCurrentInstance } from "vue";

const props = withDefaults(
  defineProps<{
    label: string;
    modelValue: string | null | undefined;
    required?: boolean;
    disabled?: boolean;
    placeholder?: string;
    /** native input type: text | password | number */
    type?: string;
    /** daftar saran (datalist); nilai bebas di luar daftar tetap boleh */
    suggestions?: string[];
  }>(),
  { required: false, disabled: false, placeholder: "", type: "text", suggestions: undefined }
);
const emit = defineEmits<{ (e: "update:modelValue", v: string): void }>();
const listId = props.suggestions?.length ? `ftext-datalist-${getCurrentInstance()?.uid}` : undefined;
</script>

<template>
  <div class="field">
    <label>
      {{ label }}
      <span v-if="required" class="req">*</span>
    </label>
    <input
      :value="modelValue ?? ''"
      :type="type"
      :disabled="disabled"
      :placeholder="placeholder"
      :list="listId"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <datalist v-if="listId" :id="listId">
      <option v-for="s in suggestions" :key="s" :value="s" />
    </datalist>
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