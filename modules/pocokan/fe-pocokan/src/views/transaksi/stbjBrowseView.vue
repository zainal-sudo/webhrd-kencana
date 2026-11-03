<script setup lang="ts">
import { ref, watch, computed, onMounted, onActivated } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import BaseBrowse from "@/components/BaseBrowse.vue";
import { stbjApi } from "@/api/transaksi/stbjApi";
import { exportToExcel } from "@/utils/exportExcel";
import { IconPackage, IconFileSpreadsheet } from "@tabler/icons-vue";

const router = useRouter();
const toast = useToast();
const MENU_ID = "40";

const STORAGE_KEY = "inv_periode_stbj";
const getLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const getSavedPeriode = () => {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null");
    if (saved?.startDate && saved?.endDate) return saved;
  } catch {}
  const now = new Date();
  return { startDate: getLocal(new Date(now.getFullYear(), now.getMonth(), 1)), endDate: getLocal(now) };
};

const p = getSavedPeriode();
const startDate = ref(p.startDate);
const endDate = ref(p.endDate);

watch([startDate, endDate], ([s, e]) => {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ startDate: s, endDate: e })); } catch {}
  loadData();
});

const items = ref<any[]>([]);
const isLoading = ref(false);
const selected = ref<any[]>([]);
const selectedItem = computed(() => selected.value[0] ?? null);

const headers = [
  { title: "NOMOR STBJ", key: "Nomor", width: "170px", align: "center" },
  { title: "TANGGAL", key: "Tanggal", width: "110px", align: "center" },
  { title: "GUDANG", key: "Gudang", width: "150px" },
  { title: "KETERANGAN", key: "Memo", minWidth: "200px" },
  { title: "JML ITEM", key: "JumlahItem", width: "90px", align: "center" },
];

const loadData = async () => {
  isLoading.value = true;
  selected.value = [];
  try {
    items.value = await stbjApi.getBrowse(startDate.value, endDate.value);
  } catch (e: any) {
    toast.error(e.response?.data?.message || "Gagal memuat data STBJ.");
  } finally {
    isLoading.value = false;
  }
};

const browseRef = ref<any>(null);

onActivated(() => {
  sessionStorage.removeItem(STORAGE_KEY);
  const p = getSavedPeriode();
  startDate.value = p.startDate;
  endDate.value = p.endDate;
  if (browseRef.value) browseRef.value.search = '';
  loadData();
});
onMounted(() => loadData());

const expanded = ref<any[]>([]);
const detailMap = ref<Record<string, any[]>>({});
const getDetail = (nomor: string) => detailMap.value[nomor] ?? [];

const onUpdateExpanded = async (newExpanded: any[]) => {
  expanded.value = newExpanded;
  for (const item of newExpanded) {
    const nomor = item.Nomor;
    if (detailMap.value[nomor] !== undefined) continue;
    try {
      detailMap.value[nomor] = await stbjApi.getDetail(nomor);
    } catch {
      detailMap.value[nomor] = [];
    }
  }
};

const onBaru = () => router.push({ name: "stbjCreate" });
const onUbah = () => {
  if (!selectedItem.value) return toast.warning("Pilih data terlebih dahulu.");
  router.push({ name: "stbjEdit", params: { nomor: selectedItem.value.Nomor } });
};

const onHapus = async () => {
  if (!selectedItem.value) return toast.warning("Pilih data terlebih dahulu.");
  if (!confirm(`Hapus STBJ ${selectedItem.value.Nomor}?`)) return;
  try {
    await stbjApi.delete(selectedItem.value.Nomor);
    toast.success("STBJ berhasil dihapus.");
    await loadData();
  } catch (e: any) {
    toast.error(e.response?.data?.message || "Gagal menghapus data.");
  }
};

const doExport = async () => {
  const exportItems = getExportItems();
  if (exportItems.length === 0) return toast.warning("Tidak ada data untuk diexport.");
  await exportToExcel({
    title: "Surat Terima Barang Jadi (STBJ)",
    filenamePrefix: "STBJ",
    sheetName: "STBJ",
    columns: [
      { header: "Nomor STBJ", key: "Nomor", width: 20 },
      { header: "Tanggal", key: "Tanggal", width: 14, align: "center" },
      { header: "Gudang", key: "Gudang", width: 20 },
      { header: "Keterangan", key: "Memo", width: 30 },
      { header: "Jml Item", key: "JumlahItem", width: 10, align: "center" },
    ],
    rows: exportItems,
  });
};
const getExportItems = (): typeof items.value => browseRef.value?.getExportItems() ?? [];
</script>

<template>
  <BaseBrowse
    ref="browseRef"
    title="Surat Terima Barang Jadi (STBJ)"
    :icon="IconPackage"
    :menu-id="MENU_ID"
    :headers="headers"
    :items="items"
    :is-loading="isLoading"
    :show-expand="true"
    :expanded="expanded"
    id-key="Nomor"
    item-value="Nomor"
    @update:expanded="onUpdateExpanded"
    v-model:selected="selected"
    @refresh="loadData"
  >
    <template #filter-left>
      <div class="filter-group">
        <span class="filter-lbl">Periode</span>
        <input type="date" v-model="startDate" class="date-inp" />
        <span class="filter-sep">s/d</span>
        <input type="date" v-model="endDate" class="date-inp" />
      </div>
    </template>

    <template #extra-actions>
      <v-btn size="small" color="primary" variant="flat" @click="onBaru">+ Baru</v-btn>
      <v-btn size="small" variant="outlined" :disabled="!selectedItem" @click="onUbah">Ubah</v-btn>
      <v-btn size="small" color="error" variant="tonal" :disabled="!selectedItem" @click="onHapus">Hapus</v-btn>
      <v-btn size="small" variant="tonal" color="success" @click="doExport">
        <template #prepend><IconFileSpreadsheet :size="13" /></template>
        Export
      </v-btn>
    </template>

    <template #item.Nomor="{ item }">
      <span class="font-weight-bold text-primary">{{ item.Nomor }}</span>
    </template>

    <template #detail="{ item }">
      <div class="detail-wrap">
        <table class="detail-tbl">
          <thead>
            <tr>
              <th style="width:130px">Barcode / Kode</th>
              <th style="min-width:220px">Nama Barang</th>
              <th style="width:90px" class="tr">Jumlah</th>
              <th style="width:90px" class="tr">Koli</th>
              <th>Keterangan</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in getDetail(item.Nomor)" :key="d.Barcode">
              <td><span class="mono">{{ d.Barcode }}</span></td>
              <td>{{ d.NamaBarang }}</td>
              <td class="tr font-weight-bold">{{ d.Jumlah }}</td>
              <td class="tr">{{ d.Koli }}</td>
              <td>{{ d.Keterangan }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </BaseBrowse>
</template>

<style scoped>
.filter-group { display: flex; align-items: center; gap: 6px; }
.filter-lbl { font-size: 12px; font-weight: 600; color: #374151; }
.filter-sep { font-size: 12px; color: #9ca3af; }
.date-inp { height: 32px; border: 1px solid #d1d5db; border-radius: 6px; padding: 0 8px; font-size: 12px; width: 130px; }
.mono { font-family: monospace; font-size: 10px; color: #6b7280; }
</style>