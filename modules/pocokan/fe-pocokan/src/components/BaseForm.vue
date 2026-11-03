<script setup lang="ts">
import PageLayout from "@/components/PageLayout.vue";
import {
  IconDeviceFloppy,
  IconX,
  IconAlertTriangle,
  IconCircleX,
} from "@tabler/icons-vue";

const props = defineProps<{
  title: string;
  menuId: string;
  icon?: any;
  isLoading?: boolean;
  isSaving?: boolean;
  itemName?: string;
  isEditMode?: boolean;
}>();

const showSaveDialog = defineModel<boolean>("showSaveDialog");
const showCancelDialog = defineModel<boolean>("showCancelDialog");
const showCloseDialog = defineModel<boolean>("showCloseDialog");

const emit = defineEmits([
  "validate-save",
  "confirm-save",
  "confirm-cancel",
  "confirm-close",
]);
</script>

<template>
  <PageLayout :title="title" :icon="icon" :menu-id="menuId" desktop-mode>
    <template #header-actions>
      <v-btn
        size="small"
        color="primary"
        @click="emit('validate-save')"
        :loading="isSaving"
        :disabled="isSaving"
      >
        <template #prepend
          ><IconDeviceFloppy :size="14" :stroke-width="1.8"
        /></template>
        Simpan
      </v-btn>
      <v-btn size="small" variant="outlined" @click="showCancelDialog = true">
        Batal
      </v-btn>
      <v-btn
        size="small"
        variant="tonal"
        color="error"
        @click="showCloseDialog = true"
      >
        <template #prepend><IconX :size="14" :stroke-width="2.2" /></template>
        Tutup
      </v-btn>
    </template>

    <v-overlay
      :model-value="isLoading"
      class="align-center justify-center"
      persistent
      scroll-strategy="none"
    >
      <v-progress-circular indeterminate color="primary" size="56" />
    </v-overlay>

    <div
      v-if="!isLoading"
      :class="[
        'form-grid-container',
        $slots['left-column'] &&
        $slots['center-column'] &&
        $slots['right-column']
          ? 'three-column'
          : $slots['left-column'] && $slots['right-column']
            ? 'two-column'
            : !$slots['left-column'] && $slots['right-column']
              ? 'single-column'
              : 'custom-layout',
      ]"
    >
      <template v-if="$slots['left-column'] || $slots['right-column']">
        <aside class="left-column" v-if="$slots['left-column']">
          <slot name="left-column" />
        </aside>
        <main class="center-column" v-if="$slots['center-column']">
          <slot name="center-column" />
        </main>
        <main class="right-column" v-if="$slots['right-column']">
          <slot name="right-column" />
        </main>
      </template>
      <template v-else>
        <main class="full-column"><slot /></main>
      </template>
    </div>

    <!-- Dialog Simpan -->
    <v-dialog v-model="showSaveDialog" max-width="400px">
      <v-card rounded="lg">
        <v-card-title class="text-body-1 font-weight-bold pa-4"
          >Konfirmasi Simpan</v-card-title
        >
        <v-card-text class="pa-4 pt-0">
          Yakin ingin menyimpan
          {{ itemName ? `data ${itemName}` : "data ini" }}?
          <slot name="dialog-warning" />
        </v-card-text>
        <v-card-actions class="pa-4">
          <v-spacer />
          <v-btn variant="text" @click="showSaveDialog = false" :disabled="isSaving">Batal</v-btn>
          <v-btn
            color="primary"
            variant="flat"
            @click="emit('confirm-save')"
            :loading="isSaving"
            :disabled="isSaving"
            >Ya, Simpan</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog Batal -->
    <v-dialog v-model="showCancelDialog" max-width="400px">
      <v-card rounded="lg">
        <v-card-title
          class="text-body-1 font-weight-bold pa-4 d-flex align-center gap-2"
        >
          <IconAlertTriangle :size="18" :stroke-width="1.8" color="#f57c00" />
          Konfirmasi Batal
        </v-card-title>
        <v-card-text class="pa-4 pt-0">
          Yakin ingin membatalkan perubahan?
          <span v-if="!isEditMode">Form akan dikosongkan.</span>
          <span v-else>Data akan dikembalikan ke kondisi semula.</span>
        </v-card-text>
        <v-card-actions class="pa-4">
          <v-spacer />
          <v-btn variant="text" @click="showCancelDialog = false">Tidak</v-btn>
          <v-btn color="warning" variant="flat" @click="emit('confirm-cancel')">
            Ya, Batalkan
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog Tutup -->
    <v-dialog v-model="showCloseDialog" max-width="400px">
      <v-card rounded="lg">
        <v-card-title
          class="text-body-1 font-weight-bold pa-4 d-flex align-center gap-2"
        >
          <IconCircleX :size="18" :stroke-width="1.8" color="#c62828" />
          Konfirmasi Tutup
        </v-card-title>
        <v-card-text class="pa-4 pt-0"
          >Yakin ingin keluar? Pastikan data sudah disimpan.</v-card-text
        >
        <v-card-actions class="pa-4">
          <v-spacer />
          <v-btn variant="text" @click="showCloseDialog = false">Batal</v-btn>
          <v-btn color="error" variant="flat" @click="emit('confirm-close')"
            >Ya, Keluar</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
.form-grid-container :deep(*) {
  font-size: 11px !important;
}
.form-grid-container {
  padding: 12px;
  height: 100%;
  min-height: 0;
  flex: 1 1 0;
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 16px;
  background: #f1f1f8;
}
.form-grid-container.three-column {
  grid-template-columns: 280px 1fr 200px;
}
.form-grid-container.single-column {
  grid-template-columns: 1fr;
}
.form-grid-container.custom-layout {
  display: block;
  padding: 0;
  height: 100%;
  overflow: hidden;
}

.left-column,
.right-column {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.right-column {
  flex-grow: 1;
  overflow: hidden;
  min-width: 0;
}
.center-column {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex-grow: 1;
}
.full-column {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  overflow-y: auto; /* fix: sebelumnya tidak bisa di-scroll saat konten
                        (mis. tabel invoice di form Bayar Supplier) lebih
                        tinggi dari area layar yang tersedia */
  min-height: 0; /* wajib agar flex child (height:100% dari parent fixed)
                    bisa benar-benar scroll, bukan malah stretch/overflow */
}

/* Section card di dalam form — Finance pakai garis hijau */
:deep(.desktop-form-section) {
  padding: 14px 16px;
  border: 1px solid #c8c8e6;
  border-radius: 8px;
  background: white !important;
  margin-bottom: 12px;
  box-shadow: 0 1px 4px rgba(46, 46, 125, 0.08) !important;
}
:deep(.header-section) {
  border-top: 3px solid #3B5998 !important;
}

.form-left-col {
  overflow-y: auto;
  height: 100%;
  min-height: 0; /* ← wajib agar flex child bisa scroll */
}

/* ── Responsif ── */

/* Tablet landscape (≤1280px) */
@media (max-width: 1280px) {
  .form-grid-container {
    grid-template-columns: 280px 1fr;
    gap: 12px;
    padding: 10px;
  }
  .form-grid-container.three-column {
    grid-template-columns: 240px 1fr 180px;
  }
}

/* Tablet portrait (≤1024px) */
@media (max-width: 1024px) {
  .form-grid-container {
    /* Stack kolom vertikal */
    grid-template-columns: 1fr !important;
    grid-template-rows: auto;
    height: 100%;
    min-height: 0;
    overflow-y: auto;
    padding: 8px;
    gap: 10px;
  }
  .form-grid-container.three-column {
    grid-template-columns: 1fr !important;
  }
  .full-column {
    height: auto;
    min-height: 400px;
    overflow: visible;
  }
  /* Kolom kiri tidak lagi fixed width */
  .left-column {
    min-height: unset;
  }
  .form-left-col {
    height: auto;
    overflow: visible;
  }
  .right-column {
    min-width: unset;
  }
  /* Section card lebih kompak */
  :deep(.desktop-form-section) {
    padding: 10px 12px;
    margin-bottom: 8px;
  }
}

/* Mobile (≤768px) */
@media (max-width: 768px) {
  .form-grid-container {
    padding: 4px;
    gap: 6px;
  }
  /* Font sedikit lebih kecil */
  .form-grid-container :deep(*) {
    font-size: 10px !important;
  }
  :deep(.desktop-form-section) {
    padding: 8px 10px;
    margin-bottom: 6px;
    border-radius: 6px;
  }
  /* Header action lebih ringkas */
}
</style>
