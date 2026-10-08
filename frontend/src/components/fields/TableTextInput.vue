<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onUnmounted } from "vue";

const props = defineProps<{
  modelValue: string | number | null | undefined;
  label: string;
}>();
const emit = defineEmits<{ (e: "update:modelValue", value: string): void }>();
const input = ref<HTMLTextAreaElement | null>(null);
let observer: ResizeObserver | undefined;
let previousWidth = 0;

function fit() {
  const element = input.value;
  if (!element || !element.clientWidth) return;
  element.style.height = "auto";
  element.style.height = `${Math.max(34, element.scrollHeight + 2)}px`;
}

function update(event: Event) {
  emit("update:modelValue", (event.target as HTMLTextAreaElement).value);
  fit();
}

watch(() => props.modelValue, async () => {
  await nextTick();
  fit();
});

onMounted(() => {
  fit();
  observer = new ResizeObserver(() => {
    const width = input.value?.clientWidth || 0;
    if (width !== previousWidth) {
      previousWidth = width;
      fit();
    }
  });
  if (input.value) observer.observe(input.value);
});

onUnmounted(() => observer?.disconnect());
</script>

<template>
  <div class="field table-text-field">
    <textarea ref="input" :value="modelValue ?? ''" :aria-label="label" rows="1" @input="update"></textarea>
  </div>
</template>

<style scoped>
.table-text-field { min-width: 0; width: 100%; }
textarea {
  display: block;
  width: 100%;
  min-width: 0;
  min-height: 34px;
  box-sizing: border-box;
  padding: 7px 5px;
  border: 1px solid var(--ds-border, #b0b8c4);
  background: #fff;
  color: var(--ds-on-surface, #1b2d4a);
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  overflow: hidden;
  overflow-wrap: anywhere;
  resize: none;
}
textarea:focus { outline: none; border-color: var(--ds-primary, #3b5998); }
</style>
