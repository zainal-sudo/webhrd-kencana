<script setup lang="ts">
import { ref, watch } from "vue";
import { useQzPrint } from "@/composables/useQzPrint";
import { IconPrinter, IconRefresh, IconCheck, IconX } from "@tabler/icons-vue";

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [val: boolean];
  saved: [printerName: string];
}>();

const { connect, getPrinters, savePrinter, printers, isConnected, isConnecting } =
  useQzPrint();

const selectedPrinter = ref<string | null>(null);
const isLoading = ref(false);
const errorMessage = ref("");

// Reset state saat dialog dibuka
watch(
  () => props.modelValue,
  async (val) => {
    if (val) {
      selectedPrinter.value = null;
      errorMessage.value = "";
      await fetchPrinters();
    }
  },
);

const fetchPrinters = async () => {
  isLoading.value = true;
  errorMessage.value = "";
  try {
    const list = await getPrinters();
    if (list.length === 0) {
      errorMessage.value =
        "Tidak ditemukan printer. Pastikan QZ Tray sudah berjalan dan printer sudah terinstall di komputer.";
    }
  } catch (e: any) {
    errorMessage.value =
      e.message || "Gagal menghubungkan ke QZ Tray. Pastikan QZ Tray sudah berjalan.";
  } finally {
    isLoading.value = false;
  }
};

const onSimpan = () => {
  if (!selectedPrinter.value) return;
  savePrinter(selectedPrinter.value);
  emit("saved", selectedPrinter.value);
  emit("update:modelValue", false);
};

const onClose = () => {
  emit("update:modelValue", false);
};
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="onClose"
    max-width="500"
    persistent
  >
    <v-card>
      <v-card-title class="d-flex align-center gap-2">
        <IconPrinter :size="22" />
        <span>Pilih Printer</span>
        <v-spacer />
        <v-btn
          variant="text"
          size="small"
          icon
          @click="onClose"
        >
          <IconX :size="18" />
        </v-btn>
      </v-card-title>

      <v-divider />

      <v-card-text>
        <v-alert
          v-if="errorMessage"
          type="error"
          variant="tonal"
          class="mb-4"
          closable
          @click:close="errorMessage = ''"
        >
          {{ errorMessage }}
        </v-alert>

        <v-alert type="info" variant="tonal" class="mb-4">
          Pilih printer yang ingin digunakan untuk cetak dokumen. Setting ini hanya perlu dilakukan sekali.
        </v-alert>

        <div class="d-flex align-center gap-2 mb-4">
          <v-select
            v-model="selectedPrinter"
            :items="printers"
            label="Printer"
            placeholder="Pilih printer..."
            :loading="isLoading"
            :disabled="isLoading"
            density="comfortable"
            variant="outlined"
            hide-details
            class="flex-grow-1"
          />
          <v-btn
            icon
            variant="text"
            size="small"
            :loading="isLoading"
            @click="fetchPrinters"
            title="Refresh list printer"
          >
            <IconRefresh :size="18" />
          </v-btn>
        </div>

        <div v-if="isConnected" class="text-caption text-success">
          <IconCheck :size="14" class="mr-1" />
          QZ Tray terhubung
        </div>
        <div v-else-if="isConnecting" class="text-caption text-warning">
          Menghubungkan ke QZ Tray...
        </div>
      </v-card-text>

      <v-divider />

      <v-card-actions class="pa-4">
        <v-spacer />
        <v-btn
          variant="text"
          @click="onClose"
        >
          Batal
        </v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :disabled="!selectedPrinter"
          @click="onSimpan"
        >
          Simpan
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
