<script setup lang="ts">
import { ref, watch, computed, onMounted, onActivated } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import BaseBrowse from "@/components/BaseBrowse.vue";
import { mutasiApi } from "@/api/transaksi/mutasiApi";
import { exportToExcel } from "@/utils/exportExcel";
import { IconArrowsTransferDown, IconFileSpreadsheet } from "@tabler/icons-vue";

const router = useRouter();
const toast = useToast();
const MENU_ID = "41"; // Sesuaikan Menu ID Mutasi Gudang

const STORAGE_KEY = "inv_periode_mutasi";
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
  { title: "NOMOR MUTASI", key: "Nomor", width: "170px", align: "center" },
  { title: "TANGGAL", key: "Tanggal", width: "110px", align: "center" },
  { title: "GUDANG ASAL", key: "GudangAsal", width: "150px" },
  { title: "GUDANG TUJUAN", key: "GudangTujuan", width: "150px" },
  { title: "KETERANGAN", key: "Memo", minWidth: "200px" },
  { key: "Status", title: "STATUS", width: "110px", align: "center" }, 
  { title: "JML ITEM", key: "JumlahItem", width: "90px", align: "center" },

];

const loadData = async () => {
  isLoading.value = true;
  selected.value = [];
  try {
    items.value = await mutasiApi.getBrowse(startDate.value, endDate.value);
  } catch (e: any) {
    toast.error(e.response?.data?.message || "Gagal memuat data Mutasi Gudang.");
  } finally {
    isLoading.value = false;
  }
};

const browseRef = ref<any>(null);
onActivated(() => { loadData(); });
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
      detailMap.value[nomor] = await mutasiApi.getDetail(nomor);
    } catch {
      detailMap.value[nomor] = [];
    }
  }
};
const onRealisasi = async () => {
  if (!selectedItem.value) return toast.warning("Pilih data terlebih dahulu.");
  if (selectedItem.value.Status === 1) return toast.warning("Mutasi ini sudah direalisasi.");
  
  if (!confirm(`Realisasikan Mutasi Gudang nomor ${selectedItem.value.Nomor}?`)) return;
  try {
    await mutasiApi.realisasi(selectedItem.value.Nomor); // Panggil API realisasi
    toast.success("Mutasi gudang berhasil direalisasi.");
    await loadData();
  } catch (e: any) {
    toast.error(e.response?.data?.message || "Gagal merealisasikan data.");
  }
};
const onBaru = () => router.push({ name: "mutasiCreate" });
const onUbah = () => {
  if (!selectedItem.value) return toast.warning("Pilih data terlebih dahulu.");
  router.push({ name: "mutasiEdit", params: { nomor: selectedItem.value.Nomor } });
};

const onHapus = async () => {
  if (!selectedItem.value) return toast.warning("Pilih data terlebih dahulu.");
  if (!confirm(`Hapus Mutasi ${selectedItem.value.Nomor}?`)) return;
  try {
    await mutasiApi.delete(selectedItem.value.Nomor);
    toast.success("Mutasi berhasil dihapus.");
    await loadData();
  } catch (e: any) {
    toast.error(e.response?.data?.message || "Gagal menghapus data.");
  }
};
</script>

<template>
  <BaseBrowse
    ref="browseRef"
    title="Mutasi Gudang"
    :icon="IconArrowsTransferDown"
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
      <v-btn size="small" color="success" variant="flat" :disabled="!selectedItem || selectedItem.Status === 1" @click="onRealisasi">
    Realisasi
  </v-btn>
      <v-btn size="small" color="primary" variant="flat" @click="onBaru">+ Baru</v-btn>
      <v-btn size="small" variant="outlined" :disabled="!selectedItem" @click="onUbah">Ubah</v-btn>
      <v-btn size="small" color="error" variant="tonal" :disabled="!selectedItem" @click="onHapus">Hapus</v-btn>
    </template>

    <template #item.Nomor="{ item }">
      <span class="font-weight-bold text-primary">{{ item.Nomor }}</span>
    </template>
    <template #item.Status="{ item }">
      <span :class="['badge-status', item.Status === 1 ? 'badge-success' : 'badge-warning']">
        {{ item.Status === 1 ? 'REALISASI' : 'PENDING' }}
      </span>
    </template>
    <template #detail="{ item }">
      <div class="detail-wrap">
        <table class="detail-tbl">
          <thead>
            <tr>
              <th style="width:130px">Barcode</th>
              <th style="min-width:220px">Nama Barang</th>
              <th style="width:90px" class="tr">Qty</th>
              <th style="width:110px" class="tc">Expired</th>
              <th>Keterangan</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in getDetail(item.Nomor)" :key="d.Barcode">
              <td><span class="mono">{{ d.Barcode }}</span></td>
              <td>{{ d.NamaBarang }}</td>
              <td class="tr font-weight-bold">{{ d.Qty }}</td>
              <td class="tc">{{ d.Expired }}</td>
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