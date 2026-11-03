<script setup lang="ts">
import { ref, watch, computed, onMounted , onActivated} from "vue";
import { useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import BaseBrowse from "@/components/BaseBrowse.vue";
import { returApi } from "@/api/transaksi/returApi";
import { exportReturPembelian } from "@/utils/exportExcel.ts";
import {
  IconReceiptRefund,
  IconPrinter,
  IconFileSpreadsheet,
  IconRefresh,
} from "@tabler/icons-vue";

const router = useRouter();
const toast = useToast();
const MENU_ID = "16"; // Menu ID khusus untuk Retur Supplier

// ── Pengaturan Periode Tanggal ────────────────────────────────────────
const STORAGE_KEY = "finance_periode_retur";
const fmt = (v: number) => new Intl.NumberFormat("id-ID").format(v || 0);
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

// ── Konfigurasi Tabel Data Retur ──────────────────────────────────────
const items = ref<any[]>([]);
const isLoading = ref(false);
const selected = ref<any[]>([]);

const selectedItem = computed(() => selected.value[0] ?? null);

const headers = [
  { title: "NOMOR RETUR", key: "Nomor", width: "160px", align: "center" },
  { title: "TANGGAL", key: "Tanggal", width: "110px", align: "center" },
  { title: "NOMOR INVOICE", key: "NomorInvoice", width: "160px", align: "center" },
  { title: "NAMA SUPPLIER", key: "Supplier", minWidth: "220px" },
  { title: "KETERANGAN / MEMO", key: "Memo", minWidth: "250px" },
  { title: "PAJAK", key: "Pajak", width: "90px", align: "center" },
  { title: "TOTAL RETUR", key: "Total", width: "140px", align: "end" },
  { title: "SUDAH DIBAYAR", key: "InvoiceSudahDibayar", width: "140px", align: "end" },
];

const loadData = async () => {
  isLoading.value = true;
  selected.value = [];
  try {
    items.value = await returApi.getBrowse(startDate.value, endDate.value);
  } catch (e: any) {
    toast.error(e.response?.data?.message || "Gagal memuat data Retur.");
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

onMounted(() => {
  loadData();
});

const expanded = ref<any[]>([]);
const detailMap = ref<Record<string, any[]>>({});
// 🐛 FIX: sebelumnya kalau returApi.getDetail(nomor) gagal SEKALI (race
// condition pas data baru saja disimpan, koneksi putus sesaat, dll), hasil
// kosong `[]` itu disimpan permanen di detailMap dan gak akan pernah dicoba
// ulang selama komponen belum di-unmount/refresh, walau datanya sebenarnya
// ADA di database. Makanya ditambah detailError untuk beda-in "sudah dicek
// beneran kosong" vs "gagal fetch, boleh dicoba lagi".
const detailError = ref<Record<string, boolean>>({});
const detailLoading = ref<Record<string, boolean>>({});

const getDetail = (nomor: string) => detailMap.value[nomor] ?? [];

const fetchDetail = async (nomor: string) => {
  detailLoading.value[nomor] = true;
  detailError.value[nomor] = false;
  try {
    detailMap.value[nomor] = await returApi.getDetail(nomor);
  } catch (e: any) {
    delete detailMap.value[nomor];
    detailError.value[nomor] = true;
    toast.error(e.response?.data?.message || `Gagal memuat detail Retur ${nomor}.`);
  } finally {
    detailLoading.value[nomor] = false;
  }
};

const retryDetail = (nomor: string) => {
  if (!nomor) return;
  fetchDetail(nomor);
};

const onUpdateExpanded = async (newExpanded: any[]) => {
  expanded.value = newExpanded;
  for (const entry of newExpanded) {
    // Robust: entry bisa berupa string nomor PO, atau row object
    const nomor = typeof entry === "string" ? entry : entry?.Nomor;
    if (!nomor) continue;
    if (detailMap.value[nomor] !== undefined) continue;
    if (detailLoading.value[nomor]) continue;
    await fetchDetail(nomor);
  }
};

// ── Logika Aksi Tombol Utama (CRUD) ───────────────────────────────────
const onBaru = () => {
  router.push({ name: "returCreate" });
};

const onUbah = () => {
  if (!selectedItem.value) {
    toast.warning("Pilih data terlebih dahulu.");
    return;
  }
  router.push({ 
    name: "returEdit", 
    params: { nomor: selectedItem.value.Nomor } 
  });
};

const onHapus = async () => {
  if (!selectedItem.value) {
    toast.warning("Pilih data terlebih dahulu.");
    return;
  }

  if (!confirm(`Hapus Transaksi Retur Supplier ${selectedItem.value.Nomor}?`)) return;

  try {
    await returApi.delete(selectedItem.value.Nomor);
    toast.success("Data Retur berhasil dihapus.");
    await loadData();
  } catch (e: any) {
    toast.error(e.response?.data?.message || "Gagal menghapus data.");
  }
};

const onCetak = () => {
  if (!selectedItem.value) {
    toast.warning("Pilih data terlebih dahulu.");
    return;
  }
  const routeData = router.resolve({ 
    name: "returPrint", 
    params: { nomor: selectedItem.value.Nomor } 
  });
  window.open(routeData.href, "_blank");
};

const search = ref("");
const filteredItems = computed(() => {
  if (!search.value) return items.value;
  const q = search.value.toLowerCase();
  return items.value.filter((item: any) => {
    return (
      item.Nomor?.toLowerCase().includes(q) ||
      item.Memo?.toLowerCase().includes(q) ||
      item.Supplier?.toLowerCase().includes(q)
    );
  });
});

const doExport = async () => {
  const exportItems = getExportItems();
  if (exportItems.length === 0) {
    toast.warning("Tidak ada data penjualan yang bisa di-export.");
    return;
  }
  try {
    await exportReturPembelian(
      exportItems,
      startDate.value, 
      endDate.value
    );
    toast.success("Berhasil mengeksport laporan penjualan ke Excel!");
  } catch (error) {
    console.error(error);
    toast.error("Gagal mengeksport data ke Excel.");
  }
};

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v || 0);
  
const rowPropsFn = (data: any) => {
  return { class: "" };
};  
const getExportItems = (): typeof items.value => browseRef.value?.getExportItems() ?? [];
</script>

<template>
  <BaseBrowse
  ref="browseRef"
    title="Retur Supplier"
    :icon="IconReceiptRefund"
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
      <v-btn size="small" color="primary" variant="flat" @click="onBaru">
        + Baru
      </v-btn>
      <v-btn size="small" variant="outlined" :disabled="!selectedItem" @click="onUbah">
        Ubah
      </v-btn>
      <v-btn size="small" color="error" variant="tonal" :disabled="!selectedItem" @click="onHapus">
        Hapus
      </v-btn>
      <v-btn size="small" variant="tonal" :disabled="!selectedItem" @click="onCetak">
        <template #prepend><IconPrinter :size="13" :stroke-width="1.8" /></template>
        Cetak
      </v-btn>
      <v-btn size="small" variant="tonal" color="success" @click="doExport">
        <template #prepend><IconFileSpreadsheet :size="13" :stroke-width="1.8" /></template>
        Export
      </v-btn>
    </template>

    <template #item.Nomor="{ item }">
      <span class="font-weight-medium text-blue-darken-3">{{ item.Nomor }}</span>
    </template>

    <template #item.Tanggal="{ item }">
      <div class="tc">{{ item.Tanggal }}</div>
    </template>

    <template #item.Total="{ item }">
      <div class="tr font-weight-bold text-blue-darken-4">{{ fmtCurrency(item.Total) }}</div>
    </template>

    <template #item.Pajak="{ item }">
      <div class="tc">
        <v-chip size="x-small" :color="item.Pajak === 'Ya' ? 'primary' : 'default'" variant="flat">
          {{ item.Pajak }}
        </v-chip>
      </div>
    </template>
	
    <template #detail="{ item }">
    <div class="detail-wrap">
      <table class="detail-tbl">
        <thead>
          <tr>
            <th style="width:36px" class="tc">No</th>
            <th style="width:130px">Barcode / Kode</th>
            <th style="min-width:220px">Nama Barang</th>
            <th style="width:80px" class="tc">Satuan</th>
            <th style="width:70px" class="tr">Qty</th>
            <th style="width:110px" class="tr">Harga Satuan</th>
            <th style="width:70px" class="tr">Disc (%)</th>
            <th style="width:120px" class="tr">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="detailLoading[item.nomor || item.Nomor]">
            <td colspan="8" class="tc" style="padding:16px">
              <v-progress-circular indeterminate size="20" width="2" color="primary" />
              <span style="margin-left:8px; color:#6b7280;">Memuat detail...</span>
            </td>
          </tr>
          <tr v-else-if="detailError[item.nomor || item.Nomor]">
            <td colspan="8" class="tc" style="padding:16px">
              <span style="color:#dc2626;">Gagal memuat detail barang.</span>
              <v-btn size="x-small" variant="tonal" color="primary" class="ml-2"
                     @click="retryDetail(item.nomor || item.Nomor)">
                <template #prepend><IconRefresh :size="12" /></template>
                Coba Lagi
              </v-btn>
            </td>
          </tr>
          <template v-else>
            <tr v-for="(d, idx) in getDetail(item.nomor || item.Nomor)" :key="idx">
              <td class="tc" style="color:#6b7280; font-weight:bold;">{{ idx + 1 }}</td>
              <td><span class="mono">{{ d.barcode || d.brgKode }}</span></td>
              <td class="font-weight-bold" style="color:#1f2937;">{{ d.brgNama || d.NamaBarang }}</td>
              <td class="tc">{{ d.satuan || d.Satuan }}</td>
              <td class="tr font-weight-bold text-blue">{{ d.qty || d.Qty }}</td>
              <td class="tr text-blue-darken-4">Rp {{ fmtCurrency(d.harga || d.Harga) }}</td>
              <td class="tr text-red">{{ d.discPr || d.DiscPr || 0 }}%</td>
              <td class="tr font-weight-bold" style="color:#374151;">
                Rp {{ fmtCurrency((d.qty || d.Qty) * (d.harga || d.Harga) - (((d.qty || d.Qty) * (d.harga || d.Harga) * (d.discPr || d.DiscPr || 0)) / 100)) }}
              </td>
            </tr>
            <tr v-if="!getDetail(item.nomor || item.Nomor).length">
              <td colspan="8" class="tc" style="color:#9e9e9e; font-style:italic; padding:12px">
                Tidak ada detail barang retur.
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </template>
  <template #summary-row="{ filteredItems }">
        <span class="summary-lbl" style="color: white; font-weight: bold;">Total Retur</span>
        <span class="summary-val" style="color: white; font-weight: bold;">
          {{
            fmt(
              filteredItems.reduce(
                (s: number, r: any) => s + Number(r.Total),
                0,
              ),
            )
          }}
        </span>
      </template>
  </BaseBrowse>
</template>

<style scoped>
.filter-group {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
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
  white-space: nowrap;
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
  border-color: #000089;
}

.tc {
  text-align: center;
}
.tr {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>
