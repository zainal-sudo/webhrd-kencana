<script setup lang="ts">
import { computed } from "vue";
import { formatDateInput } from "@/utils/format";

const props = withDefaults(
  defineProps<{
    label: string;
    modelValue: string | Date | null | undefined;
    required?: boolean;
    disabled?: boolean;
  }>(),
  { required: false, disabled: false }
);

const emit = defineEmits<{ (e: "update:modelValue", v: string): void }>();

const val = computed(() => formatDateInput(props.modelValue));
</script>

<template>
  <div class="field">
    <label>
      {{ label }}
      <span v-if="required" class="req">*</span>
    </label>
    <input
      :value="val"
      type="date"
      :disabled="disabled"
      @change="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
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
.field input {
  height: 34px;
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