<script setup lang="ts">
import { ref, watch } from "vue";
import { barcodeImageUrl, barcodeLabelCss, createEmployeeBarcode, printEmployeeBarcode } from "@/utils/employeeBarcode";
import type { EmployeeBarcode } from "@/utils/employeeBarcode";

const props = defineProps<{ employee: { nik: string; nama: string } }>();
const emit = defineEmits<{ (event: "close"): void }>();
const barcode = ref<EmployeeBarcode | null>(null);
const error = ref("");
const printing = ref(false);
watch(() => props.employee, employee => {
  barcode.value = null;
  error.value = "";
  try { barcode.value = createEmployeeBarcode(employee.nik, employee.nama); }
  catch (err) { error.value = err instanceof Error ? err.message : "Gagal membuat barcode karyawan."; }
}, { immediate: true });

async function print() {
  if (!barcode.value || printing.value) return;
  printing.value = true;
  error.value = "";
  try { await printEmployeeBarcode(barcode.value); }
  catch (err) { error.value = err instanceof Error ? err.message : "Gagal mencetak barcode karyawan."; }
  finally { printing.value = false; }
}
</script>

<template>
  <v-dialog class="employee-barcode-dialog" :model-value="true" max-width="480" @update:model-value="!$event && emit('close')">
    <v-card>
      <v-card-title>Cetak Barcode Karyawan</v-card-title>
      <v-card-text>
        <p class="employee-identifier">NIK {{ employee.nik || '—' }}</p>
        <div v-if="barcode" class="barcode-preview" aria-label="Preview barcode sesuai template Delphi">
          <component :is="'style'">{{ barcodeLabelCss }}</component>
          <div class="barcode-band">
            <img class="employee-barcode" :src="barcodeImageUrl(barcode)" alt="Barcode karyawan" />
            <p class="employee-name">{{ barcode.nama }}</p>
          </div>
        </div>
        <p v-if="error" class="barcode-error" role="alert">{{ error }}</p>
        <p class="print-hint">Kertas A4, skala 100%. Nonaktifkan header dan footer pada pengaturan cetak browser.</p>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="emit('close')">Tutup</v-btn>
        <v-btn color="primary" variant="flat" :disabled="!barcode || printing" :loading="printing" @click="print">Cetak</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
:global(.employee-barcode-dialog .v-overlay__content:focus-visible) { outline: none; }
.employee-identifier { margin: 0 0 12px; color: var(--ds-text-secondary, #5a6a7e); font-size: 12px; }
.barcode-preview { display: flex; justify-content: center; padding: 10px; border: 1px solid var(--ds-border-light, #d5dce6); border-radius: 8px; background: #fff; overflow: auto; }
.barcode-preview .barcode-band { flex: 0 0 46mm; width: 46mm; }
.barcode-error { margin-top: 12px; color: var(--ds-error, #dc2626); font-size: 12px; }
.print-hint { margin: 12px 0 0; font-size: 11px; line-height: 1.5; color: var(--ds-text-secondary, #5a6a7e); }
</style>
