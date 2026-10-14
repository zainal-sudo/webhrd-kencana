<script setup lang="ts">
import { ref } from "vue";
import { useToast } from "vue-toastification";
import MsIcon from "@/components/MsIcon.vue";

const props = withDefaults(defineProps<{
  value: string;
  label?: string;
  disabled?: boolean;
  iconOnly?: boolean;
  successMessage?: string;
}>(), { label: "Salin Kode", disabled: false, iconOnly: false, successMessage: "Kode berhasil disalin" });

const toast = useToast();
const copying = ref(false);

async function copy() {
  if (!props.value || props.disabled || copying.value) return;
  copying.value = true;
  const value = props.value;
  try {
    let copied = false;
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(value);
        copied = true;
      } catch {
        // Coba cara lama jika izin clipboard ditolak oleh browser.
      }
    }
    if (!copied) {
      // Mendukung aplikasi yang dibuka melalui HTTP di jaringan lokal.
      const active = document.activeElement as HTMLElement | null;
      const input = document.createElement("textarea");
      input.value = value;
      input.readOnly = true;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      try {
        input.select();
        copied = document.execCommand("copy");
      } finally {
        input.remove();
        active?.focus({ preventScroll: true });
      }
    }
    if (!copied) throw new Error("Clipboard tidak tersedia");
    toast.success(props.successMessage, { timeout: 3000 });
  } catch {
    toast.error("Kode belum berhasil disalin. Silakan pilih dan salin kode secara manual.");
  } finally {
    copying.value = false;
  }
}
</script>

<template>
  <button class="copy-code" :class="{ 'icon-only': iconOnly }" type="button" :disabled="disabled || !value || copying" :aria-label="label" :title="label" @click="copy">
    <MsIcon name="content_copy" :size="14" />
    <span v-if="!iconOnly">{{ copying ? "Menyalin..." : label }}</span>
  </button>
</template>

<style scoped>
.copy-code {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 27px;
  padding: 4px 10px;
  border: 1px solid var(--ds-primary, #3b5998);
  border-radius: 4px;
  background: var(--ds-surface, #fff);
  color: var(--ds-primary, #3b5998);
  font: inherit;
  font-size: 11.5px;
  font-weight: 700;
  cursor: pointer;
}
.copy-code:focus-visible { outline: 2px solid var(--ds-primary, #3b5998); outline-offset: 2px; }
.copy-code:disabled { opacity: 0.6; cursor: not-allowed; }
.copy-code.icon-only { flex-shrink: 0; width: 24px; min-height: 24px; padding: 3px; background: transparent; }
</style>
