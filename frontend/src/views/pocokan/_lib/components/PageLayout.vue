<script setup lang="ts">
import { computed } from "vue";
import { IconFileText, IconReload } from "@tabler/icons-vue";

interface Props {
  title: string;
  menuId?: string;
  icon?: any;
  loading?: boolean;
  desktopMode?: boolean;
  maxWidth?: string;
}

const props = withDefaults(defineProps<Props>(), {
  icon: IconFileText,
  loading: false,
  desktopMode: true,
  maxWidth: "100%",
});

const isTablerIcon = computed(() => typeof props.icon !== "string");

const emit = defineEmits<{ "update:loading": [value: boolean] }>();

const containerClass = computed(() => ({
  "page-container": true,
  "desktop-mode": props.desktopMode,
  "modern-mode": !props.desktopMode,
}));

const loadingModel = computed({
  get: () => props.loading,
  set: (v: boolean) => emit("update:loading", v),
});

// ── Reload halaman penuh ─────────────────────────────────────────────
// Dipasang di semua halaman (master & transaksi) lewat PageLayout supaya
// user punya cara pasti untuk "mulai dari awal" kalau ada field/lookup
// yang gagal kemuat (dropdown kosong, data nyangkut, dsb) tanpa harus
// navigasi manual keluar-masuk menu.
const reloadPage = () => {
  window.location.reload();
};
</script>

<template>
  <div :class="containerClass" :style="{ maxWidth: maxWidth }">
    <!-- ── Title bar ── -->
    <div class="page-header">
      <div class="page-title-section">
        <div class="title-icon-wrap">
          <component
            v-if="isTablerIcon"
            :is="icon"
            :size="16"
            :stroke-width="1.8"
          />
          <v-icon v-else size="small">{{ icon }}</v-icon>
        </div>
        <h1 class="page-title">{{ title }}</h1>
      </div>
      <div class="header-actions" v-if="$slots['header-actions']">
        <slot name="header-actions" />
        <v-btn
          size="small"
          variant="outlined"
          title="Reload halaman ini (kalau ada data/dropdown yang gagal kemuat)"
          @click="reloadPage"
        >
          <IconReload :size="14" :stroke-width="1.8" />
        </v-btn>
      </div>
    </div>

    <!-- ── Content area ── -->
    <div class="content-area">
      <v-overlay
        v-model="loadingModel"
        contained
        persistent
        class="d-flex align-center justify-center"
      >
        <v-progress-circular indeterminate color="primary" />
      </v-overlay>

      <div class="content-wrapper">
        <slot />
      </div>

      <div v-if="$slots.footer" class="content-footer">
        <slot name="footer" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-container {
  display: flex;
  flex-direction: column;
  margin: 0 auto;
  width: 100%;
  height: 100%;
  min-height: 0;
}
.desktop-mode {
  padding: 8px 12px;
  gap: 6px;
}
.modern-mode {
  height: auto;
  padding: 20px 24px;
  gap: 16px;
  min-height: 100%;
}
.modern-mode .content-area,
.modern-mode .content-wrapper {
  flex: 1 0 auto;
}

/* ── Header ── */
.page-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 36px;
  flex-wrap: wrap; /* ← wrap jika actions terlalu banyak */
  row-gap: 4px;
}
.page-title-section {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.title-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: rgba(46, 46, 125, 0.1);
  color: #3B5998;
  flex-shrink: 0;
}
.page-title {
  font-size: 0.95rem;
  font-weight: 700;
  color: rgb(var(--v-theme-on-surface));
  margin: 0;
  letter-spacing: 0.01em;
  white-space: nowrap;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap; /* ← tombol bisa wrap */
  flex-shrink: 1;
}

/* ── Content area ── */
.content-area {
  flex: 1 1 auto;
  min-height: 0;
  position: relative;
  display: flex;
  flex-direction: column;
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 6px;
  overflow: hidden;
  border-top: 3px solid #3B5998;
}
.content-wrapper {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: var(--wrapper-padding, 16px);
  overflow: hidden;
}
.desktop-mode .content-wrapper {
  --wrapper-padding: 0;
}
.content-footer {
  flex-shrink: 0;
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

/* ── Responsif PageLayout ── */
@media (max-width: 1280px) {
  .desktop-mode {
    padding: 6px 10px;
    gap: 5px;
  }
  .page-title {
    font-size: 0.88rem;
  }
  .title-icon-wrap {
    width: 26px;
    height: 26px;
  }
}

@media (max-width: 1024px) {
  .desktop-mode {
    padding: 5px 8px;
    gap: 4px;
  }
  .page-header {
    min-height: 32px;
    gap: 6px;
  }
  .page-title {
    font-size: 0.85rem;
  }
  /* Tombol header lebih kecil */
  .header-actions :deep(.v-btn) {
    font-size: 11px !important;
  }
  .header-actions :deep(.v-btn .v-btn__content) {
    gap: 2px !important;
  }
}

@media (max-width: 768px) {
  .desktop-mode {
    padding: 4px 6px;
    gap: 3px;
  }
  .modern-mode {
    padding: 12px;
    gap: 10px;
  }
  .page-header {
    min-height: 28px;
  }
  .page-title {
    font-size: 0.8rem;
  }
  .title-icon-wrap {
    width: 22px;
    height: 22px;
  }
  /* Sembunyikan teks tombol Tutup di mobile, sisakan ikon */
  .header-actions :deep(.v-btn--variant-text span:not(.v-icon)) {
    display: none;
  }
}
</style>
