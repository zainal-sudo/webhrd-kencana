<script setup lang="ts">
import { ref, watch, computed, onMounted, onActivated } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import BaseBrowse from "@/components/BaseBrowse.vue";
import { bpbApi } from "@/api/transaksi/bpbApi";
import { exportToExcel } from "@/utils/exportExcel";
import { IconPackageImport, IconFileSpreadsheet } from "@tabler/icons-vue";



const router = useRouter();
const toast = useToast();
const MENU_ID = "17";

// ── Periode ───────────────────────────────────────────────────────────
const STORAGE_KEY = "inv_periode_bpb";

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
  return { startDate: getLocal(new Date(now.getFullYear(), now.getMonth(), 1)), endDate: getLocal(now) };
};

const p = getSavedPeriode();
const startDate = ref(p.startDate);
const endDate = ref(p.endDate);

watch([startDate, endDate], ([s, e]) => {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ startDate: s, endDate: e })); } catch {}
  loadData();
});

// ── Tabel ─────────────────────────────────────────────────────────────
const items = ref<any[]>([]);
const isLoading = ref(false);
const selected = ref<any[]>([]);
const selectedItem = computed(() => selected.value[0] ?? null);

const headers = [
  { title: "NOMOR BPB",  key: "Nomor",       width: "170px", align: "center" },
  { title: "TANGGAL",    key: "Tanggal",      width: "110px", align: "center" },
  { title: "NOMOR PO",   key: "NomorPO",      width: "160px", align: "center" },
  { title: "GUDANG",     key: "Gudang",       width: "150px" },
  { title: "KETERANGAN", key: "Memo",         minWidth: "200px" },
  { title: "INVOICE",    key: "IsInvoice",    width: "80px",  align: "center" },
  { title: "JML ITEM",   key: "JumlahItem",   width: "90px",  align: "center" },
];

const loadData = async () => {
  isLoading.value = true;
  selected.value = [];
  try {
    items.value = await bpbApi.getBrowse(startDate.value, endDate.value);
  } catch (e: any) {
    toast.error(e.response?.data?.message || "Gagal memuat data BPB.");
  } finally {
    isLoading.value = false;
  }
};
const browseRef = ref<any>(null);

const filter = ref({
  search: '',
  status: 'semua'
});

onActivated(() => {
  console.log("Tab aktif kembali, melakukan refresh...");
  
  // Kosongkan filter di halaman PO
  filter.value.search = '';
  filter.value.status = 'semua';
  sessionStorage.removeItem(STORAGE_KEY); // Hapus memori tanggal lama
  const p = getSavedPeriode();
  startDate.value = p.startDate;
  endDate.value = p.endDate;
  // 2. Kosongkan juga search internal di dalam BaseBrowse menggunakan expose
  if (browseRef.value) {
    browseRef.value.search = '';
  }
  
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
      detailMap.value[nomor] = await bpbApi.getDetail(nomor);
    } catch {
      detailMap.value[nomor] = [];
    }
  }
};
// ── Aksi ──────────────────────────────────────────────────────────────
const onBaru  = () => router.push({ name: "bpbCreate" });

const onUbah  = () => {
  if (!selectedItem.value) return toast.warning("Pilih data terlebih dahulu.");
  router.push({ name: "bpbEdit", params: { nomor: selectedItem.value.Nomor } });
};

const onHapus = async () => {
  if (!selectedItem.value) return toast.warning("Pilih data terlebih dahulu.");
  if (!confirm(`Hapus BPB ${selectedItem.value.Nomor}?\nQty di PO akan dikembalikan.`)) return;
  try {
    await bpbApi.delete(selectedItem.value.Nomor);
    toast.success("BPB berhasil dihapus.");
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
      title: "Bukti Penerimaan Barang (BPB)",
      filenamePrefix: "BPB",
      sheetName: "BPB",
      columns: [
        { header: "Nomor BPB", key: "Nomor", width: 20 },
        { header: "Tanggal", key: "Tanggal", width: 14, align: "center" },
        { header: "Nomor PO", key: "NomorPO", width: 18, align: "center" },
        { header: "Gudang", key: "Gudang", width: 20 },
        { header: "Keterangan", key: "Memo", width: 30 },
        { header: "Invoice", key: "IsInvoice", width: 10, align: "center" },
        { header: "Jml Item", key: "JumlahItem", width: 10, align: "center" },
      ],
      rows: exportItems,
    });
    toast.success("Berhasil export data BPB ke Excel!");
  } catch (e) {
    console.error(e);
    toast.error("Gagal export data BPB ke Excel.");
  }
};
const getExportItems = (): typeof items.value => browseRef.value?.getExportItems() ?? [];
</script>

<template>
  <BaseBrowse
   ref="browseRef"
    title="Bukti Penerimaan Barang (BPB)"
    :icon="IconPackageImport"
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
        <template #prepend><IconFileSpreadsheet :size="13" :stroke-width="1.8" /></template>
        Export
      </v-btn>
    </template>

    <template #item.Nomor="{ item }">
      <span class="font-weight-bold text-primary">{{ item.Nomor }}</span>
    </template>
    <template #item.Tanggal="{ item }">
      <div class="tc">{{ item.Tanggal }}</div>
    </template>
    <template #item.NomorPO="{ item }">
      <div class="tc text-grey-darken-1 text-caption">{{ item.NomorPO }}</div>
    </template>
    <template #item.IsInvoice="{ item }">
      <div class="tc">
        <span :class="item.IsInvoice === 'Ya' ? 'badge-yes' : 'badge-no'">{{ item.IsInvoice }}</span>
      </div>
    </template>
    <template #item.JumlahItem="{ item }">
      <div class="tc font-weight-bold">{{ item.JumlahItem }}</div>
    </template>
	
<template #detail="{ item }">
    <div class="detail-wrap">
      <table class="detail-tbl">
        <thead>
          <tr>
            <th style="width:36px">No</th>
            <th style="width:130px">Barcode</th>
            <th style="min-width:220px">Nama Barang</th>
            <th style="width:80px">Satuan</th>
            <th style="width:90px">Qty</th>
            <th style="width:120px">Tgl Expired</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in getDetail(item.Nomor)" :key="d.NoUrut">
            <td class="tc">{{ d.NoUrut }}</td>
            <td><span class="mono">{{ d.Barcode }}</span></td>
            <td>{{ d.NamaBarang }}</td>
            <td class="tc">{{ d.Satuan }}</td>
            <td class="tr font-weight-bold">{{ d.Qty }}</td>
            <td class="tc">{{ d.TglExpired }}</td>
          </tr>
          <tr v-if="!getDetail(item.Nomor).length">
            <td colspan="6" class="tc" style="color:#9e9e9e;font-style:italic;padding:8px">
              Tidak ada detail.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </template>
  </BaseBrowse>
</template>

<style scoped>
.filter-group { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.filter-lbl   { font-size: 12px; font-weight: 600; color: #374151; white-space: nowrap; }
.filter-sep   { font-size: 12px; color: #9ca3af; white-space: nowrap; }
.date-inp {
  height: 32px; border: 1px solid #d1d5db; border-radius: 6px;
  padding: 0 8px; font-size: 12px; outline: none; width: 130px;
}
.date-inp:focus { border-color: #1976d2; }
.tc { text-align: center; }
.badge-yes { background:#e8e8f5; color:#3B5998; padding:1px 8px; border-radius:10px; font-size:10px; font-weight:700; }
.badge-no  { background:#f5f5f5; color:#9e9e9e; padding:1px 8px; border-radius:10px; font-size:10px; font-weight:700; }
</style>