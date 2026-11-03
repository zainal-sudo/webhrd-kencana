<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { IconPrinter, IconX, IconFileText } from "@tabler/icons-vue";

const props = defineProps<{
  modelValue: boolean;
  title?: string;
  lines: string[];
  isLoading?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [val: boolean];
  print: [pageNumbers: number[]];
}>();

const onClose = () => {
  emit("update:modelValue", false);
};

// Gabungkan lines jadi satu string untuk display.
// Baris "\f" (form feed) dari generator = penanda ganti halaman untuk
// printer dot matrix — di layar kita render sebagai divider putus-putus
// supaya kelihatan jelas, bukan karakter kontrol yang invisible.
const PAGE_BREAK_DIVIDER = "\n" + "·".repeat(132) + "\n";
const previewText = computed(() => {
  return props.lines
    .map((l) => (l === "\f" ? PAGE_BREAK_DIVIDER.trim() : l))
    .join("\n");
});

// Jumlah halaman = jumlah penanda form feed + 1 (mengikuti pagination asli
// dari generator, bukan estimasi baris per halaman).
const pageCount = computed(() => {
  const breaks = props.lines.filter((l) => l === "\f").length;
  return breaks + 1;
});

// ── Pilihan halaman yang mau dicetak ──
const printMode = ref<"all" | "range">("all");
const pageFrom = ref(1);
const pageTo = ref(1);

// Reset pilihan tiap kali dialog dibuka / jumlah halaman berubah
watch(
  () => [props.modelValue, pageCount.value] as const,
  ([open, total]) => {
    if (open) {
      printMode.value = "all";
      pageFrom.value = 1;
      pageTo.value = total;
    }
  },
  { immediate: true }
);

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

const onPrint = () => {
  const total = pageCount.value;
  let pageNumbers: number[];

  if (printMode.value === "all" || total <= 1) {
    pageNumbers = Array.from({ length: total }, (_, i) => i + 1);
  } else {
    const from = clamp(Math.floor(pageFrom.value) || 1, 1, total);
    const to = clamp(Math.floor(pageTo.value) || total, from, total);
    pageNumbers = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  }

  emit("print", pageNumbers);
};
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="onClose"
    max-width="1500"
    width="97vw"
    persistent
  >
    <v-card>
      <v-card-title class="d-flex align-center gap-2">
        <IconFileText :size="20" />
        <span>{{ title || "Preview Cetakan" }}</span>
        <v-chip size="x-small" variant="tonal" color="grey" class="ml-2">
          {{ lines.length }} baris · {{ pageCount }} halaman
        </v-chip>
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

      <v-card-text class="pa-0">
        <div v-if="isLoading" class="d-flex justify-center align-center py-8">
          <v-progress-circular indeterminate color="primary" size="28" />
          <span class="ml-3 text-caption text-grey">Memuat data cetak...</span>
        </div>
        <div v-else class="preview-scroll">
          <pre class="preview-content">{{ previewText }}</pre>
        </div>
      </v-card-text>

      <v-divider />

      <!-- ── Pilihan halaman yang mau dicetak (cuma muncul kalau > 1 halaman) ── -->
      <template v-if="!isLoading && pageCount > 1">
        <div class="page-range-bar px-4 py-3 d-flex align-center gap-4 flex-wrap">
          <span class="text-caption font-weight-medium">Cetak:</span>
          <v-radio-group v-model="printMode" inline hide-details density="compact" class="ma-0">
            <v-radio :value="'all'" :label="`Semua Halaman (1-${pageCount})`" />
            <v-radio :value="'range'" label="Rentang Halaman" />
          </v-radio-group>
          <div v-if="printMode === 'range'" class="d-flex align-center gap-2">
            <span class="text-caption">Dari</span>
            <v-text-field
              v-model.number="pageFrom"
              type="number"
              :min="1"
              :max="pageCount"
              density="compact"
              hide-details
              variant="outlined"
              style="width: 76px"
            />
            <span class="text-caption">s/d</span>
            <v-text-field
              v-model.number="pageTo"
              type="number"
              :min="1"
              :max="pageCount"
              density="compact"
              hide-details
              variant="outlined"
              style="width: 76px"
            />
            <span class="text-caption text-grey">dari {{ pageCount }} halaman</span>
          </div>
        </div>
        <v-divider />
      </template>

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
          class="text-white"
          :loading="isLoading"
          @click="onPrint"
        >
          <template #prepend>
            <IconPrinter :size="16" />
          </template>
          Cetak
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
/* Wrapper: yang menangani scroll, baik vertikal maupun horizontal
   kalau layar sempit dari lebar kertas landscape (110 kolom). */
.preview-scroll {
  max-height: 65vh;
  overflow: auto;
  padding: 16px 20px;
  background: #fafafa;
}

.page-range-bar {
  background: #fafafa;
}

.preview-content {
  font-family: "Courier New", Courier, monospace;
  font-size: 12px;
  line-height: 1.35;
  white-space: pre;
  margin: 0;
  color: #1a1a1a;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  padding: 12px 16px;
  background: #fff;
  tab-size: 8;
  /* Paksa kotak preview melebar mengikuti lebar dialog (kesan kertas landscape),
     tapi tetap tidak boleh menyusutkan isi teks di bawah lebar aslinya (110 kolom). */
  display: inline-block;
  min-width: 100%;
  width: fit-content;
  box-sizing: border-box;
}
</style>