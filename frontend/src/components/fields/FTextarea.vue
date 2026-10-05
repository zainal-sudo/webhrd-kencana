<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string;
    modelValue: string | null | undefined;
    required?: boolean;
    disabled?: boolean;
    placeholder?: string;
    rows?: number;
  }>(),
  { required: false, disabled: false, placeholder: "", rows: 3 }
);
const emit = defineEmits<{ (e: "update:modelValue", v: string): void }>();
</script>

<template>
  <div class="field">
    <label>
      {{ label }}
      <span v-if="required" class="req">*</span>
    </label>
    <textarea
      :value="modelValue ?? ''"
      :rows="rows"
      :disabled="disabled"
      :placeholder="placeholder"
      @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    ></textarea>
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
.field textarea {
  padding: 7px 9px;
  border: 1px solid var(--ds-border, #b0b8c4);
  background: #fff;
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: 12px;
  color: var(--ds-on-surface, #1b2d4a);
  outline: none;
  resize: vertical;
}
.field textarea:focus {
  border-color: var(--ds-primary, #3b5998);
}
.field textarea:disabled {
  background: var(--ds-surface-variant, #e6e9ef);
  color: #6b7a90;
}
</style>