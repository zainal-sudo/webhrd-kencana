<script setup lang="ts">
import { ref, watch } from "vue";
import { IconCheck, IconRefresh, IconX } from "@tabler/icons-vue";

const props = defineProps<{
  modelValue: boolean;
  label: string;
  nomor: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", val: boolean): void;
  (e: "stay"): void;
  (e: "close"): void;
}>();

const showConfetti = ref(false);

watch(
  () => props.modelValue,
  (val) => {
    if (val) {
      showConfetti.value = true;
      setTimeout(() => (showConfetti.value = false), 1200);
    }
  },
);

const handleStay = () => {
  emit("stay");
};

const handleClose = () => {
  emit("close");
};
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    max-width="380"
    persistent
    :scrim-opacity="0.4"
  >
    <v-card
      rounded="false"
      class="after-save-card"
    >
      <!-- Success Icon with confetti -->
      <div class="success-icon-wrap">
        <div class="success-circle">
          <IconCheck :size="32" :stroke-width="2.5" />
        </div>
        <div v-if="showConfetti" class="confetti">
          <span v-for="i in 8" :key="i" class="confetti-dot" :style="{ '--i': i }" />
        </div>
      </div>

      <!-- Content -->
      <v-card-text class="text-center pa-5">
        <div class="success-title">{{ label }} Berhasil Disimpan</div>
        <div class="success-nomor">
          <span class="nomor-label">Nomor</span>
          <span class="nomor-value">{{ nomor }}</span>
        </div>
      </v-card-text>

      <!-- Actions -->
      <v-card-actions class="pa-4 pt-0 justify-center gap-3">
        <v-btn
          variant="outlined"
          size="default"
          class="action-btn action-btn-stay"
          @click="handleStay"
        >
          <template #prepend><IconRefresh :size="15" /></template>
          Tetap Disini
        </v-btn>
        <v-btn
          color="white"
          bg-color="primary"
          size="default"
          class="action-btn action-btn-close"
          @click="handleClose"
        >
          <template #prepend><IconX :size="15" /></template>
          Tutup
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
/* ── Card ── */
.after-save-card {
  overflow: visible !important;
  border: 1px solid var(--ds-border, #A0AAB8);
}

/* ── Success Icon ── */
.success-icon-wrap {
  display: flex;
  justify-content: center;
  padding-top: 24px;
  position: relative;
}

.success-circle {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--ds-success, #059669);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ── Confetti ── */
.confetti {
  position: absolute;
  top: 24px;
  left: 50%;
  width: 0;
  height: 0;
  pointer-events: none;
}

.confetti-dot {
  position: absolute;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  animation: confettiBurst 0.8s ease-out both;
  animation-delay: calc(var(--i) * 0.04s);
}

.confetti-dot:nth-child(1) { background: #4caf50; --angle: 0deg; }
.confetti-dot:nth-child(2) { background: #ff9800; --angle: 45deg; }
.confetti-dot:nth-child(3) { background: #2196f3; --angle: 90deg; }
.confetti-dot:nth-child(4) { background: #e91e63; --angle: 135deg; }
.confetti-dot:nth-child(5) { background: #ffc107; --angle: 180deg; }
.confetti-dot:nth-child(6) { background: #9c27b0; --angle: 225deg; }
.confetti-dot:nth-child(7) { background: #00bcd4; --angle: 270deg; }
.confetti-dot:nth-child(8) { background: #8bc34a; --angle: 315deg; }

@keyframes confettiBurst {
  0% {
    transform: rotate(var(--angle)) translateY(0) scale(1);
    opacity: 1;
  }
  100% {
    transform: rotate(var(--angle)) translateY(-40px) scale(0);
    opacity: 0;
  }
}

/* ── Text ── */
.success-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--ds-primary-dark, #2C4472);
  margin-bottom: 12px;
}

.success-nomor {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: var(--ds-primary-50, #E8EDF5);
  border: 1px solid var(--ds-border, #A0AAB8);
  border-radius: 0;
  padding: 6px 16px;
}

.nomor-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--ds-text-muted, #8494A7);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.nomor-value {
  font-size: 14px;
  font-weight: 800;
  color: var(--ds-primary, #3B5998);
  font-family: var(--ds-font-mono, "Consolas", monospace);
}

/* ── Buttons ── */
.action-btn {
  font-weight: 600 !important;
  letter-spacing: 0.3px;
  text-transform: none !important;
}

.action-btn-stay {
  border-color: var(--ds-border, #A0AAB8) !important;
  color: var(--ds-primary, #3B5998) !important;
}

.action-btn-stay:hover {
  background: var(--ds-primary-50, #E8EDF5) !important;
  border-color: var(--ds-primary-100, #C5D0E6) !important;
}

.action-btn-close {
  background: var(--ds-primary, #3B5998) !important;
  color: white !important;
}

.action-btn-close:hover {
  background: var(--ds-primary-dark, #2C4472) !important;
}
</style>
