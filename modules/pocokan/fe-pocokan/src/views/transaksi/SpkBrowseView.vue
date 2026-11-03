<script setup lang="ts">
import { ref, watch, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import BaseBrowse from "@/components/BaseBrowse.vue";
import { spkApi } from "@/api/transaksi/spkApi";
import { exportToExcel } from "@/utils/exportExcel";
import { IconClipboardList, IconFileSpreadsheet } from "@tabler/icons-vue";

const router = useRouter();
const toast = useToast();
const MENU_ID = "60"; // ⚠️ Samakan dengan menuId di spkRoutes.js / spkFormRoutes.js backend

const STORAGE_KEY = "finance_periode_spk";

const getLocal = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};
const getSavedPeriode = () => {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null");
    if (saved?.startDate && saved?.endDate) return saved;
  } catch {}
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  return { startDate: getLocal(firstDay), endDate: getLocal(now) };
};

const p = getSavedPeriode();
const startDate = ref(p.startDate);
const endDate = ref(p.endDate);

watch([startDate, endDate], ([s, e]) => {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ startDate: s, endDate: e }));
  } catch {}
  loadData();
});

const items = ref<any[]>([]);
const isLoading = ref(false);
const selected = ref<any[]>([]);
const selectedItem = computed(() => selected.value[0] ?? null);

const headers = [
  { title: "NOMOR", key: "Nomor", width: "150px", align: "center" },
  { title: "NAMA SPK", key: "Nama", minWidth: "200px" },
  { title: "TANGGAL", key: "Tanggal", width: "110px", align: "center" },
  { title: "DATELINE", key: "DateLine", width: "110px", align: "center" },
  { title: "BARANG", key: "Barang", minWidth: "200px" },
  { title: "CUSTOMER", key: "Customer", minWidth: "180px" },
  { title: "ID BATCH", key: "IdBatch", width: "110px" },
  { title: "TARGET", key: "Jumlah", width: "100px", align: "end" },
  { title: "JADI", key: "JumlahJadi", width: "100px", align: "end" },
  { title: "KIRIM", key: "JumlahKirim", width: "100px", align: "end" },
  { title: "STATUS", key: "StatusView", width: "100px", align: "center" },
];

// Status di-turunkan dari perbandingan Jadi vs Target — tspk tidak
// menyimpan kolom status di database.
const withStatus = (rows: any[]) =>
  rows.map((r) => ({
    ...r,
    StatusView:
      Number(r.JumlahJadi || 0) >= Number(r.Jumlah || 0) && Number(r.Jumlah || 0) > 0
        ? "Selesai"
        : "Proses",
  }));

const loadData = async () => {
  isLoading.value = true;
  selected.value = [];
  try {
    items.value = withStatus(await spkApi.getBrowse(startDate.value, endDate.value));
  } catch (e: any) {
    toast.error(e.response?.data?.message || "Gagal memuat data SPK.");
  } finally {
    isLoading.value = false;
  }
};

onMounted(() => {
  loadData();
});

const onBaru = () => {
  router.push({ name: "spkCreate" });
};

const onUbah = () => {
  if (!selectedItem.value) {
    toast.warning("Pilih data terlebih dahulu.");
    return;
  }
  router.push({ name: "spkEdit", params: { nomor: selectedItem.value.Nomor } });
};

const onHapus = async () => {
  if (!selectedItem.value) {
    toast.warning("Pilih data terlebih dahulu.");
    return;
  }
  if (!confirm(`Hapus SPK ${selectedItem.value.Nomor}?`)) return;
  try {
    await spkApi.delete(selectedItem.value.Nomor);
    toast.success("Data SPK berhasil dihapus.");
    await loadData();
  } catch (e: any) {
    toast.error(e.response?.data?.message || "Gagal menghapus data.");
  }
};

const doExport = async () => {
  const exportItems = getExportItems();
  if (exportItems.length === 0) return toast.warning("Tidak ada data untuk diexport.");
  try {
    await exportToExcel({
      title: "Surat Perintah Kerja (SPK)",
      filenamePrefix: "SPK",
      sheetName: "SPK",
      columns: [
        { header: "Nomor", key: "Nomor", width: 20 },
        { header: "Nama SPK", key: "Nama", width: 28 },
        { header: "Tanggal", key: "Tanggal", width: 14, align: "center" },
        { header: "Dateline", key: "DateLine", width: 14, align: "center" },
        { header: "Barang", key: "Barang", width: 28 },
        { header: "Customer", key: "Customer", width: 24 },
        { header: "Id Batch", key: "IdBatch", width: 16 },
        { header: "Target", key: "Jumlah", width: 12, align: "end" },
        { header: "Jadi", key: "JumlahJadi", width: 12, align: "end" },
        { header: "Kirim", key: "JumlahKirim", width: 12, align: "end" },
        { header: "Status", key: "StatusView", width: 12, align: "center" },
      ],
      rows: exportItems,
    });
  } catch {
    toast.error("Gagal melakukan export Excel.");
  }
};

const fmt = (v: number) => new Intl.NumberFormat("id-ID").format(v || 0);
const browseRef = ref<InstanceType<typeof BaseBrowse> | null>(null);
const getExportItems = (): typeof items.value => browseRef.value?.getExportItems() ?? [];
</script>

<template>
  <BaseBrowse
    ref="browseRef"
    title="Surat Perintah Kerja (SPK)"
    :icon="IconClipboardList"
    :menu-id="MENU_ID"
    :headers="headers"
    :items="items"
    :is-loading="isLoading"
    id-key="Nomor"
    item-value="Nomor"
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
        <template #prepend><IconFileSpreadsheet :size="13" :stroke-width="1.8" /></template>
        Export
      </v-btn>
    </template>

    <template #item.Nomor="{ item }">
      <span class="font-weight-medium">{{ item.Nomor }}</span>
    </template>

    <template #item.Tanggal="{ item }"><div class="tc">{{ item.Tanggal }}</div></template>
    <template #item.DateLine="{ item }"><div class="tc">{{ item.DateLine || "-" }}</div></template>
    <template #item.Jumlah="{ item }"><div class="tr">{{ fmt(item.Jumlah) }}</div></template>
    <template #item.JumlahJadi="{ item }"><div class="tr font-weight-bold text-blue-darken-4">{{ fmt(item.JumlahJadi) }}</div></template>
    <template #item.JumlahKirim="{ item }"><div class="tr">{{ fmt(item.JumlahKirim) }}</div></template>

    <template #item.StatusView="{ item }">
      <div class="tc">
        <span :class="item.StatusView === 'Selesai' ? 'badge-open' : 'badge-closed'">
          {{ item.StatusView }}
        </span>
      </div>
    </template>
  </BaseBrowse>
</template>

<style scoped>
.filter-group { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.filter-lbl { font-size: 12px; font-weight: 600; color: #374151; white-space: nowrap; }
.filter-sep { font-size: 12px; color: #9ca3af; white-space: nowrap; }
.date-inp { height: 32px; border: 1px solid #d1d5db; border-radius: 6px; padding: 0 8px; font-size: 12px; outline: none; width: 130px; }
.date-inp:focus { border-color: #3B5998; }
.tc { text-align: center; }
.tr { text-align: right; font-variant-numeric: tabular-nums; }
.badge-closed { background: #e0e0e0; color: #616161; padding: 1px 8px; border-radius: 10px; font-size: 10px; font-weight: 700; }
.badge-open { background: #e8e8f5; color: #3B5998; padding: 1px 8px; border-radius: 10px; font-size: 10px; font-weight: 700; }
</style>