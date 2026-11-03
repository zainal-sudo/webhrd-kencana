<script setup lang="ts">
import { ref, watch, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import BaseBrowse from "@/components/BaseBrowse.vue";
import { poApi } from "@/api/transaksi/poApi";
import ExportDialog from "@/components/ExportDialog.vue";
import { exportToExcel } from "@/utils/exportExcel";
import { isAuthExpiredError } from "@/api/axios";
import {
  IconShoppingCart,
  IconPrinter,
  IconFileSpreadsheet,
  IconRefresh,
  IconStatusChange,
} from "@tabler/icons-vue";

import { useQzPrint } from "@/composables/useQzPrint";
import PrinterDialog from "@/components/PrinterDialog.vue";
import PrintPreviewDialog from "@/components/PrintPreviewDialog.vue";

const router = useRouter();
const toast = useToast();
const MENU_ID = "15";

const { connect, getSavedPrinter, printRaw } = useQzPrint();

// ── Pengaturan Periode Tanggal ────────────────────────────────────────
const STORAGE_KEY = "finance_periode_po";

const getLocal = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};
const fmt = (v: number) => new Intl.NumberFormat("id-ID").format(v || 0);
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

// ── Konfigurasi Tabel Data PO ─────────────────────────────────────────
const items = ref<any[]>([]);
const isLoading = ref(false);
const selected = ref<any[]>([]);

const headers = [
  { key: "Nomor", title: "Nomor", width: "150px" },
  { key: "Tanggal", title: "Tanggal", width: "100px", align: "center" as const },
  { key: "Supplier", title: "Nama Supplier", minWidth: "200px" },
  { key: "Memo", title: "Keterangan / Memo", width: "180px" },
  { key: "Pajak", title: "Pajak", width: "80px", align: "center" as const },
  { key: "Total", title: "Total Belanja", width: "130px", align: "right" as const },
  { key: "Ppn", title: "PPN", width: "100px", align: "right" as const },
  { key: "Status", title: "Status", width: "90px", align: "center" as const },
  { key: "Receipt", title: "Receipt", width: "90px", align: "center" as const },
];

const detailColumns = [
  { key: "brgKode", title: "Barcode / Kode", width: "140px" },
  { key: "Nama", title: "Nama Barang", minWidth: "250px" },
  { key: "Satuan", title: "Satuan", width: "90px", align: "center" as const },
  { key: "Qty", title: "Qty", width: "90px", align: "right" as const },
  { key: "QtyTerima", title: "Qty Terima", width: "100px", align: "right" as const },
  { key: "Harga", title: "Harga Satuan", width: "120px", align: "right" as const },
  { key: "Disc", title: "Disc (%)", width: "80px", align: "right" as const },
  { key: "Subtotal", title: "Subtotal", width: "130px", align: "right" as const },
];

const loadData = async () => {
  isLoading.value = true;
  try {
    const res = await poApi.getBrowse(startDate.value, endDate.value);
    items.value = res || [];
  } catch (e: any) {
    if (isAuthExpiredError(e)) return;
    toast.error(e.response?.data?.message || "Gagal memuat data PO.");
  } finally {
    isLoading.value = false;
  }
};

onMounted(() => {
  loadData();
});

const expanded = ref<any[]>([]);
const detailMap = ref<Record<string, any[]>>({});
const expandedLoading = ref<Record<string, boolean>>({});

const onUpdateExpanded = async (newExpanded: any[]) => {
  const keys = newExpanded.map((e) => (typeof e === "object" ? e.Nomor : e));
  expanded.value = newExpanded;

  for (const nomor of keys) {
    if (detailMap.value[nomor] || expandedLoading.value[nomor]) continue;
    expandedLoading.value = { ...expandedLoading.value, [nomor]: true };
    try {
      detailMap.value = { ...detailMap.value, [nomor]: await poApi.getDetail(nomor) };
    } catch (e: any) {
      if (isAuthExpiredError(e)) return;
      toast.error(`Gagal memuat rincian untuk ${nomor}`);
    } finally {
      expandedLoading.value = { ...expandedLoading.value, [nomor]: false };
    }
  }
};

const selectedItem = computed(() => selected.value[0] ?? null);
const isSingleSelected = computed(() => selected.value.length === 1);

// ── Logika Export (Header & Detail) ───────────────────────────────────
const showExportDialog = ref(false);
const isExporting = ref(false);

const handleExportClick = () => {
  const exportItems = getExportItems();
  if (exportItems.length === 0) {
    return toast.warning("Tidak ada data untuk diexport.");
  }
  showExportDialog.value = true;
};

const exportHeaderOnly = async () => {
  const exportItems = getExportItems();
  showExportDialog.value = false;
  isExporting.value = true;
  try {
    await exportToExcel({
      title: "Purchase Order Bahan (PO)",
      filenamePrefix: "PO_Header",
      sheetName: "PO",
      columns: headers.map(h => ({ header: h.title, key: h.key, width: 20, align: h.align })),
      rows: exportItems,
    });
    toast.success("Berhasil export header PO ke Excel!");
  } catch (e) {
    toast.error("Gagal export header PO ke Excel.");
  } finally {
    isExporting.value = false;
  }
};

const exportDetailOnly = async () => {
  const exportItems = getExportItems();
  showExportDialog.value = false;
  isExporting.value = true;
  try {
    const flatRows: any[] = [];
    for (const item of exportItems) {
      let details = detailMap.value[item.Nomor];
      if (!details) {
        try {
          details = await poApi.getDetail(item.Nomor);
          detailMap.value[item.Nomor] = details;
        } catch {
          details = [];
        }
      }

      if (details && details.length > 0) {
        details.forEach((det: any, idx: number) => {
          flatRows.push({
            Nomor: idx === 0 ? item.Nomor : "",
            Tanggal: idx === 0 ? item.Tanggal : "",
            Supplier: idx === 0 ? item.Supplier : "",
            Memo: idx === 0 ? item.Memo : "",
            Pajak: idx === 0 ? item.Pajak : "",
            Total: idx === 0 ? item.Total : "",
            Ppn: idx === 0 ? item.Ppn : "",
            Status: idx === 0 ? item.Status : "",
            Receipt: idx === 0 ? item.Receipt : "",
            Barcode: det.brgKode,
            Nama: det.brgNama,
            Satuan: det.satuan,
            Qty: det.qty,
            QtyTerima: det.QtyTerima,
            Harga: det.harga,
            Disc: det.discPr,
            Subtotal: det.Subtotal,
          });
        });
      } else {
        flatRows.push({
          Nomor: item.Nomor,
          Tanggal: item.Tanggal,
          Supplier: item.Supplier,
          Memo: item.Memo,
          Pajak: item.Pajak,
          Total: item.Total,
          Ppn: item.Ppn,
          Status: item.Status,
          Receipt: item.Receipt,
          Barcode: "",
          Nama: "(Tidak ada detail)",
          Satuan: "",
          Qty: 0,
          QtyTerima: 0,
          Harga: 0,
          Disc: 0,
          Subtotal: 0,
        });
      }
    }

    const combinedColumns = [
      ...headers.map(h => ({ header: h.title, key: h.key, width: 18, align: h.align })),
      ...detailColumns.map(d => ({ header: d.title, key: d.key, width: 18, align: d.align })),
    ];

    await exportToExcel({
      title: "Purchase Order Bahan (PO) - Detail",
      filenamePrefix: "PO_Detail",
      sheetName: "PO Detail",
      columns: combinedColumns,
      rows: flatRows,
    });
    toast.success("Berhasil export detail PO ke Excel!");
  } catch (e) {
    toast.error("Gagal export detail PO ke Excel.");
  } finally {
    isExporting.value = false;
  }
};

// ── CRUD & Aksi Lainnya ───────────────────────────────────────────────
const onBaru = () => router.push("/transaksi/po/create");
const onUbah = () => {
  if (!selectedItem.value) return toast.warning("Pilih data terlebih dahulu.");
  router.push(`/transaksi/po/edit/${encodeURIComponent(selectedItem.value.Nomor)}`);
};
const onHapus = async () => {
  if (!selectedItem.value) return toast.warning("Pilih data terlebih dahulu.");
  if (!confirm(`Hapus PO ${selectedItem.value.Nomor}?`)) return;
  try {
    await poApi.delete(selectedItem.value.Nomor);
    toast.success("PO berhasil dihapus.");
    await loadData();
  } catch (e: any) {
    toast.error(e.response?.data?.message || "Gagal menghapus PO.");
  }
};

const fmtDate = (val: string) => {
  if (!val) return "-";
  const [y, m, d] = val.split("-");
  return `${d}-${m}-${y}`;
};
const fmtQty = (v: number) => Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const browseRef = ref<InstanceType<typeof BaseBrowse> | null>(null);
const getExportItems = (): typeof items.value => browseRef.value?.getExportItems() ?? [];
</script>

<template>
  <BaseBrowse
    ref="browseRef"
    title="Purchase Order Bahan (PO)"
    :icon="IconShoppingCart"
    :menu-id="MENU_ID"
    :headers="headers"
    :items="items"
    :is-loading="isLoading"
    :fixed-layout="false"
    :show-expand="true"
    :expanded="expanded"
    @update:expanded="onUpdateExpanded"
    item-value="Nomor"
    v-model:selected="selected"
    @refresh="loadData"
    @add="onBaru"
    @edit="onUbah"
    @delete="onHapus"
  >
    <template #filter-left>
      <div class="filter-group">
        <span class="filter-lbl">Periode</span>
        <input v-model="startDate" type="date" class="date-inp" />
        <span class="filter-sep">s/d</span>
        <input v-model="endDate" type="date" class="date-inp" />
      </div>
    </template>

    <template #extra-actions>
      <v-btn size="small" color="primary" variant="flat" @click="onBaru">+ Baru</v-btn>
      <v-btn size="small" variant="outlined" :disabled="!selectedItem" @click="onUbah">Ubah</v-btn>
      <v-btn size="small" color="error" variant="tonal" :disabled="!selectedItem" @click="onHapus">Hapus</v-btn>
      <v-btn size="small" variant="tonal" color="success" @click="handleExportClick" :loading="isExporting">
        <template #prepend><IconFileSpreadsheet :size="13" :stroke-width="1.8" /></template>
        Export
      </v-btn>
    </template>

   <template #item.Tanggal="{ value }">{{ fmtDate(value) }}</template>
    <template #item.Total="{ value }"><span class="num-cell">Rp {{ fmt(value) }}</span></template>
    <template #item.Ppn="{ value }"><span class="num-cell">{{ fmt(value) }}</span></template>

    <template #item.Status="{ value }">
      <span :class="value === 'Closed' ? 'badge-closed' : 'badge-open'">{{ value }}</span>
    </template>
    <template #item.Receipt="{ value }">
      <span :class="value === 'Sudah' ? 'badge-sudah' : 'badge-belum'">{{ value }}</span>
    </template>

    <template #detail="{ item }">
      <div class="detail-wrap">
        <div v-if="expandedLoading[item.Nomor]" class="detail-loading">
          <v-progress-circular indeterminate color="primary" size="18" />
          <span>Memuat rincian...</span>
        </div>
        <table v-else class="detail-tbl">
          <thead>
            <tr>
              <th style="width: 140px">Barcode / Kode</th>
              <th style="min-width: 220px">Nama Barang</th>
              <th style="width: 90px" class="tc">Satuan</th>
              <th style="width: 90px" class="tr">Qty</th>
              <th style="width: 100px" class="tr">Qty Terima</th>
              <th style="width: 120px" class="tr">Harga Satuan</th>
              <th style="width: 80px" class="tr">Disc (%)</th>
              <th style="width: 130px" class="tr">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(d, idx) in detailMap[item.Nomor] || []" :key="idx">
              <td class="mono">{{ d.brgKode || d.Kode }}</td>
              <td class="bold">{{ d.brgNama }}</td>
              <td class="tc">{{ d.satuan }}</td>
              <td class="tr">{{ fmtQty(d.qty) }}</td>
              <td class="tr accent bold">{{ fmtQty(d.QtyTerima) }}</td>
              <td class="tr">Rp {{ fmt(d.harga) }}</td>
              <td class="tr">{{ d.discPr }}%</td>
              <td class="tr bold accent">Rp {{ fmt(d.Subtotal) }}</td>
            </tr>
            <tr v-if="!detailMap[item.Nomor]?.length">
              <td colspan="8" class="empty-td">Tidak ada detail barang.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </BaseBrowse>

  <!-- Export Dialog untuk memilih Header atau Detail -->
  <ExportDialog
    v-model="showExportDialog"
    :has-detail="true"
    @export-header="exportHeaderOnly"
    @export-detail="exportDetailOnly"
  />
</template>

<style scoped>
.filter-group { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.filter-lbl { font-size: 12px; font-weight: 600; color: #374151; white-space: nowrap; }
.filter-sep { font-size: 12px; color: #9ca3af; white-space: nowrap; }
.date-inp { height: 32px; border: 1px solid var(--ds-border, #A0AAB8); border-radius: 0; padding: 0 8px; font-size: 12px; outline: none; width: 130px; }
.date-inp:focus { border-color: var(--ds-primary, #3B5998); }

.tc { text-align: center; }
.tr { text-align: right; font-variant-numeric: tabular-nums; }
.mono { font-family: monospace; }
.bold { font-weight: 700; }
.accent { color: var(--ds-primary, #3B5998); }
.num-cell { font-variant-numeric: tabular-nums; }

.badge-closed { background: #E0E4EA; color: var(--ds-text-secondary, #5A6A7E); padding: 1px 8px; font-size: 10px; font-weight: 700; }
.badge-open { background: #E8EDF5; color: var(--ds-primary, #3B5998); padding: 1px 8px; font-size: 10px; font-weight: 700; }
.badge-sudah { background: #E8F5E9; color: #2e7d32; padding: 1px 8px; font-size: 10px; font-weight: 700; }
.badge-belum { background: #FFF3E0; color: #e65100; padding: 1px 8px; font-size: 10px; font-weight: 700; }

.detail-wrap { padding: 4px 0; }
.detail-loading { display: flex; align-items: center; gap: 8px; padding: 10px; font-size: 12px; color: #6b7280; }
.detail-tbl { width: 100%; border-collapse: collapse; font-size: 11px; }
.detail-tbl thead tr { background: var(--ds-primary, #3B5998); }
.detail-tbl th { color: white; font-weight: 700; padding: 4px 8px; white-space: nowrap; text-align: left; }
.detail-tbl td { padding: 3px 8px; border-bottom: 1px solid var(--ds-border-light, #C4CAD3); white-space: nowrap; }
.detail-tbl tbody tr:hover td { background: rgba(59, 89, 152, 0.05); }
.empty-td { text-align: center; color: #9e9e9e; font-style: italic; padding: 12px; }
</style>