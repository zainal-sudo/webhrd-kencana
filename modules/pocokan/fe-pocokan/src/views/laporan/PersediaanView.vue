<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { useToast } from "vue-toastification";
import { isAuthExpiredError } from "@/api/axios";
import BaseBrowse from "@/components/BaseBrowse.vue";
import { IconList } from "@tabler/icons-vue";
import { persediaanApi } from "@/api/laporan/persediaanApi";

const toast = useToast();

// ── Periode / Filter Session Storage ──────────────────────────────────
const STORAGE_KEY = "finance_filter_persediaan";

const getLocal = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

const getSaved = () => {
  try {
    const s = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null");
    if (s?.startDate && s?.endDate) return s;
  } catch {
    /* silent */
  }
  return null;
};

const now = new Date();
const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
const saved = getSaved();

const startDate = ref(saved?.startDate ?? getLocal(firstDay));
const endDate = ref(saved?.endDate ?? getLocal(now));
const selectedGudang = ref("");

watch([startDate, endDate], ([s, e]) => {
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ startDate: s, endDate: e }),
    );
  } catch {
    /* silent */
  }
  loadData();
});

// ── Data ──────────────────────────────────────────────────────────────
const items = ref<any[]>([]);
const isLoading = ref(false);
const selected = ref<any[]>([]);
const expanded = ref<any[]>([]);

const filterValues = computed(() => ({
  startDate: startDate.value,
  endDate: endDate.value,
}));

// ── Headers ───────────────────────────────────────────────────────────
const headers = [
  { key: "gdg_nama", title: "Gudang", width: "180px" },
  { key: "brg_kode", title: "Kode Barang", width: "130px" },
  { key: "brg_nama", title: "Nama Barang" },
  { key: "brg_satuan", title: "Satuan", width: "90px", align: "center" as const },
  { key: "stok", title: "Stok", width: "110px", align: "right" as const },
  { key: "nilai", title: "Valuasi (Nilai)", width: "150px", align: "right" as const },
];

// ── Load Data ─────────────────────────────────────────────────────────
const loadData = async () => {
  isLoading.value = true;
  selected.value = [];
  expanded.value = [];
  try {
    const data = await persediaanApi.getLaporan(selectedGudang.value);
    items.value = data;
  } catch (e: any) {
    if (!isAuthExpiredError(e))
      toast.error(e.response?.data?.message ?? "Gagal memuat laporan persediaan.");
  } finally {
    isLoading.value = false;
  }
};

onMounted(loadData);

// ── Formatting ────────────────────────────────────────────────────────
const fmt = (v: number) =>
  new Intl.NumberFormat("id-ID").format(Number(v || 0));

const fmtCurrency = (val: number) =>
  new Intl.NumberFormat("id-ID", { 
    style: "currency", 
    currency: "IDR", 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  }).format(val || 0);
// ── Summary ───────────────────────────────────────────────────────────
const totalStok = computed(() =>
  items.value.reduce((s, r) => s + Number(r.stok || 0), 0),
);

const totalNilai = computed(() =>
  items.value.reduce((s, r) => s + Number(r.nilai || 0), 0),
);


</script>

<template>
  <BaseBrowse
    title="Laporan Persediaan Stok"
    :icon="IconList"
    menu-id="96"
    :headers="headers"
    :items="items"
    :is-loading="isLoading"
    :fixed-layout="false"
    item-value="brg_kode"
    v-model:selected="selected"
    :filter-values="filterValues"
    summary-key="nilai"
    summary-label="Total Value Keseluruhan"
    @refresh="loadData"
  >
    <!-- ── Filter Periode & Gudang ── -->
    <template #filter-left>
      <div class="filter-group">
        <span class="filter-lbl">Periode</span>
        <input v-model="startDate" type="date" class="date-inp" />
        <span class="filter-sep">s/d</span>
        <input v-model="endDate" type="date" class="date-inp" />
      </div>
    </template>

    <!-- ── Tombol Aksi Tambahan / Export ── -->
    <template #extra-actions>
      <v-btn size="small" variant="tonal" color="success" @click="toast.info('Fitur export Excel segera hadir.')">
        <template #prepend>
          <v-icon size="14">mdi-file-excel</v-icon>
        </template>
        Export
      </v-btn>
    </template>

    <!-- ── Custom Cells ── -->
    <template #item.stok="{ value }">
      <span :class="['num-cell', Number(value) < 0 ? 'text-error font-weight-bold' : '']">
        {{ fmt(Number(value)) }}
      </span>
    </template>

    <template #item.nilai="{ value }">
      <span class="num-cell text-primary font-weight-medium">
        {{ fmtCurrency(Number(value)) }}
      </span>
    </template>
  </BaseBrowse>
</template>

<style scoped>
.filter-group {
  display: flex;
  align-items: center;
  gap: 6px;
}
.filter-lbl {
  font-size: 12px;
  font-weight: 600;
  color: #374151;
  white-space: nowrap;
}
.filter-sep {
  font-size: 12px;
  color: #9ca3af;
}
.date-inp {
  height: 32px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 0 8px;
  font-size: 12px;
  outline: none;
  width: 130px;
}
.date-inp:focus {
  border-color: #3B5998;
}
.num-cell {
  font-variant-numeric: tabular-nums;
}
</style>