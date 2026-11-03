<script setup lang="ts">
import {
  IconFileSpreadsheet,
  IconTableFilled,
  IconStack2,
} from "@tabler/icons-vue";

defineProps<{
  modelValue: boolean;
  hasDetail: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  "export-header": [];
  "export-detail": [];
}>();

const close = () => {
  emit("update:modelValue", false);
};

const onExportHeader = () => {
  emit("export-header");
  close();
};

const onExportDetail = () => {
  emit("export-detail");
  close();
};
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    max-width="400"
    persistent
  >
    <v-card rounded="false">
      <v-card-item>
        <template #prepend>
          <v-avatar color="success" variant="tonal" size="42">
            <IconFileSpreadsheet :size="22" :stroke-width="1.8" />
          </v-avatar>
        </template>
        <v-card-title class="text-body-1 font-weight-bold">
          Export Excel
        </v-card-title>
        <v-card-subtitle class="text-body-2">
          Pilih jenis data yang ingin diexport
        </v-card-subtitle>
      </v-card-item>

      <v-card-text class="pb-2">
        <div class="export-options">
          <!-- Header Only -->
          <button class="export-option" @click="onExportHeader">
            <v-avatar color="primary" variant="tonal" size="38">
              <IconTableFilled :size="20" :stroke-width="1.8" />
            </v-avatar>
            <div class="export-option-text">
              <div class="export-option-title">Export Header</div>
              <div class="export-option-desc">
                Export data utama (kolom tabel utama)
              </div>
            </div>
          </button>

          <!-- Header + Detail -->
          <button class="export-option" @click="onExportDetail">
            <v-avatar color="success" variant="tonal" size="38">
              <IconStack2 :size="20" :stroke-width="1.8" />
            </v-avatar>
            <div class="export-option-text">
              <div class="export-option-title">Export Detail</div>
              <div class="export-option-desc">
                Export data utama beserta rincian/detail barang
              </div>
            </div>
          </button>
        </div>
      </v-card-text>

      <v-card-actions class="pa-4 pt-0">
        <v-spacer />
        <v-btn variant="text" @click="close">Batal</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.export-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.export-option {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 0;
  background: rgb(var(--v-theme-surface));
  cursor: pointer;
  transition: all 0.15s;
  text-align: left;
  width: 100%;
}

.export-option:hover {
  border-color: var(--ds-primary, #3B5998);
  background: rgba(59, 89, 152, 0.04);
}

.export-option-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.export-option-title {
  font-size: 13px;
  font-weight: 600;
  color: rgb(var(--v-theme-on-surface));
}

.export-option-desc {
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.55);
}
</style>
