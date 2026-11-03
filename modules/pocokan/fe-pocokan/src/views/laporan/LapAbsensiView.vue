<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useToast } from "vue-toastification";
import { IconList, IconDownload } from "@tabler/icons-vue";

import BaseBrowse from "@/components/BaseBrowse.vue";
import { unitApi, type Unit } from "@/api/master/unitApi";
import { lapAbsensiApi, type LapAbsensiItem } from "@/api/laporan/lapAbsensiApi";
import { exportToExcel } from "@/utils/exportExcel";

const toast = useToast();

const getTodayFormatted = () => {
  const d = new Date();
  return d.toISOString().split("T")[0];
};

// Filter — seperti gambar: Tanggal Awal sd Tanggal Akhir + Load
const periode1 = ref(getTodayFormatted());
const periode2 = ref(getTodayFormatted());

const unitList = ref<Unit[]>([]);
const selectedUnit = ref("");

// Data laporan
const items = ref<LapAbsensiItem[]>([]);
const isLoading = ref(false);

onMounted(async () => {
  try {
    unitList.value = await unitApi.getAll();
  } catch (e) {
    toast.error("Gagal memuat daftar unit.");
  }
});

const headers = [
  { title: "Pabrik", key: "pabrik", width: "90px", align: "center" as const },
  { title: "Tanggal", key: "tanggal", width: "130px", align: "center" as const },
  { title: "Nama", key: "nama", minWidth: "200px", align: "start" as const },
  { title: "Bagian", key: "bagian", width: "150px", align: "start" as const },
  { title: "Hari", key: "hari", width: "110px", align: "start" as const },
  { title: "Kehadiran", key: "kehadiran", width: "120px", align: "end" as const },
];

const totalKehadiran = computed(() =>
  items.value.reduce((sum, row) => sum + Number(row.kehadiran || 0), 0)
);

// Auto refresh saat filter berubah (pola browse)
const filterValues = computed(() => ({
  periode1: periode1.value,
  periode2: periode2.value,
  selectedUnit: selectedUnit.value,
}));

const summaryColumns = [{ key: "kehadiran" }];

const loadData = async () => {
  if (!periode1.value || !periode2.value) {
    toast.warning("Tanggal awal dan tanggal akhir wajib diisi.");
    return;
  }

  isLoading.value = true;
  try {
    items.value = await lapAbsensiApi.getData(
      selectedUnit.value,
      periode1.value,
      periode2.value
    );
    if (items.value.length === 0) {
      toast.info("Tidak ada data absensi pada rentang periode ini.");
    }
  } catch (e: any) {
    toast.error(e.response?.data?.message ?? "Gagal memuat laporan absensi.");
  } finally {
    isLoading.value = false;
  }
};

const formatKehadiran = (value: number) => {
  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
};

const exportExcelData = () => {
  const exportItems = getExportItems();
  if (!exportItems.length) {
    toast.warning("Tidak ada data untuk diekspor.");
    return;
  }

  exportToExcel({
    title: `Laporan Absensi ${periode1.value} s/d ${periode2.value}`,
    filenamePrefix: `laporan-absensi-${periode1.value}-${periode2.value}`,
    columns: [
      { header: "Pabrik", key: "pabrik", width: 12, align: "center" },
      { header: "Tanggal", key: "tanggal", width: 15, align: "center" },
      { header: "Nama", key: "nama", width: 30 },
      { header: "Bagian", key: "bagian", width: 20 },
      { header: "Hari", key: "hari", width: 14 },
      { header: "Kehadiran", key: "kehadiran", width: 14, align: "right" },
    ],
    rows: [
      ...exportItems,
      {
        pabrik: "",
        tanggal: "",
        nama: "",
        bagian: "",
        hari: "TOTAL",
        kehadiran: exportItems.reduce((sum, row) => sum + (Number(row.kehadiran) || 0), 0),
      } as any,
    ],
  });
};
const browseRef = ref<InstanceType<typeof BaseBrowse> | null>(null);
const getExportItems = (): typeof items.value => browseRef.value?.getExportItems() ?? [];
</script>

<template>
  <BaseBrowse
    ref="browseRef"
    title="Laporan Absensi"
    :icon="IconList"
    :headers="headers"
    :items="items"
    :is-loading="isLoading"
    item-value="no"
    :summary-columns="summaryColumns"
    :filter-values="filterValues"
    @refresh="loadData"
    search-placeholder="Cari pabrik, nama, bagian atau hari..."
  >
    <!-- ── Filter: Tanggal Awal sd Tanggal Akhir + Unit + Load ── -->
    <template #filter-left>
      <div class="filter-group">
        <span class="filter-lbl">Tanggal Awal</span>
        <input v-model="periode1" type="date" class="date-inp" />
        <span class="filter-sep">sd</span>
        <input v-model="periode2" type="date" class="date-inp" />
      </div>

      <div class="filter-group">
        <span class="filter-lbl">Unit</span>
        <select v-model="selectedUnit" class="select-inp">
          <option value="">SEMUA</option>
          <option v-for="u in unitList" :key="u.kode" :value="u.kode">
            {{ u.kode }} — {{ u.nama }}
          </option>
        </select>
      </div>

      <v-btn size="small" color="primary" variant="flat" @click="loadData" :loading="isLoading">
        Load
      </v-btn>
    </template>

    <!-- ── Export ── -->
    <template #extra-actions>
      <v-btn
        size="small"
        variant="tonal"
        color="success"
        @click="exportExcelData"
        :disabled="!items.length"
      >
        <IconDownload :size="16" class="mr-1" />
        Export
      </v-btn>
    </template>

    <!-- ── Format kehadiran 2 desimal seperti 1.00 ── -->
    <template #item.kehadiran="{ value }">
      <span class="num-cell">{{ formatKehadiran(value) }}</span>
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
  background: #fff;
}
.date-inp:focus {
  border-color: #3b5998;
}
.select-inp {
  height: 32px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 0 8px;
  font-size: 12px;
  outline: none;
  min-width: 180px;
  background: #fff;
  cursor: pointer;
}
.select-inp:focus {
  border-color: #3b5998;
}
.num-cell {
  font-variant-numeric: tabular-nums;
}
</style>
