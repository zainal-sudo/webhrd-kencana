<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    name: string;
    size?: number | string;
    filled?: boolean;
    weight?: number;
    className?: string;
  }>(),
  {
    size: 18,
    filled: false,
    weight: 400,
    className: "",
  }
);
</script>

<template>
  <span
    class="material-symbols-outlined ms-icon"
    :class="className"
    :style="{
      fontSize: typeof props.size === 'number' ? `${props.size}px` : props.size,
      width: typeof props.size === 'number' ? `${props.size}px` : props.size,
      height: typeof props.size === 'number' ? `${props.size}px` : props.size,
      fontVariationSettings: `'FILL' ${props.filled ? 1 : 0}, 'wght' ${props.weight}`,
      userSelect: 'none',
    }"
    aria-hidden="true"
  >
    {{ props.name }}
  </span>
</template>

<style scoped>
.ms-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  overflow: hidden;
  white-space: nowrap;
  flex-shrink: 0;
}
</style>