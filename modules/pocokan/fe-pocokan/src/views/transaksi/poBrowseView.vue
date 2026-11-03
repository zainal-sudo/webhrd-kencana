<script setup lang="ts">
import { ref, watch, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import BaseBrowse from "@/components/BaseBrowse.vue";
import { poApi } from "@/api/transaksi/poApi";
import { exportToExcel } from "@/utils/exportExcel";
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

const selectedItem = computed(() => selected.value[0] ?? null);
const isSingleSelected = computed(() => selected.value.length === 1);

const headers = [
  { title: "NOMOR", key: "Nomor", width: "150px", align: "center" },
  { title: "TANGGAL", key: "Tanggal", width: "110px", align: "center" },
  { title: "NAMA SUPPLIER", key: "Supplier", minWidth: "220px" },
  { title: "KETERANGAN / MEMO", key: "Memo", minWidth: "250px" },
  { title: "PAJAK", key: "Pajak", width: "90px", align: "center" },
  { title: "TOTAL BELANJA", key: "Total", width: "140px", align: "end" },
  { title: "PPN", key: "Ppn", width: "120px", align: "end" },
  { title: "STATUS", key: "Status", width: "100px", align: "center" },
  { title: "RECEIPT", key: "Receipt", width: "100px", align: "center" },
];

const loadData = async () => {
  isLoading.value = true;
  selected.value = [];
  try {
    items.value = await poApi.getBrowse(startDate.value, endDate.value);
  } catch (e: any) {
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
const detailError = ref<Record<string, boolean>>({});
const detailLoading = ref<Record<string, boolean>>({});

const getDetail = (nomor: string) => detailMap.value[nomor] ?? [];

const fetchDetail = async (nomor: string) => {
  detailLoading.value[nomor] = true;
  detailError.value[nomor] = false;
  try {
    detailMap.value[nomor] = await poApi.getDetail(nomor);
  } catch (e: any) {
    delete detailMap.value[nomor];
    detailError.value[nomor] = true;
    toast.error(e.response?.data?.message || `Gagal memuat detail PO ${nomor}.`);
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
    const nomor = typeof entry === "string" ? entry : entry?.Nomor;
    if (!nomor) continue;
    if (detailMap.value[nomor] !== undefined) continue;
    if (detailLoading.value[nomor]) continue;
    await fetchDetail(nomor);
  }
};

// ── Logika Aksi Tombol Utama (CRUD) ───────────────────────────────────
const onBaru = () => {
  router.push({ name: "poCreate" });
};

const onUbah = () => {
  if (!selectedItem.value) {
    toast.warning("Pilih data terlebih dahulu.");
    return;
  }
  if (selectedItem.value.Status === "Closed") {
    toast.error("PO berstatus 'Closed' tidak dapat diubah.");
    return;
  }
  router.push({
    name: "poEdit",
    params: { nomor: selectedItem.value.Nomor }
  });
};

const onHapus = async () => {
  if (!selectedItem.value) {
    toast.warning("Pilih data terlebih dahulu.");
    return;
  }
  if (selectedItem.value.Status === "Closed") {
    toast.error("PO berstatus 'Closed' tidak dapat dihapus.");
    return;
  }
  if (!confirm(`Hapus Purchase Order ${selectedItem.value.Nomor}?`)) return;

  try {
    await poApi.delete(selectedItem.value.Nomor);
    toast.success("Data PO berhasil dihapus.");
    await loadData();
  } catch (e: any) {
    toast.error(e.response?.data?.message || "Gagal menghapus data.");
  }
};

const onUpdateStatus = async () => {
  if (!selectedItem.value) {
    toast.warning("Pilih data terlebih dahulu.");
    return;
  }
  const current = selectedItem.value.Status;
  const target = current === "Closed" ? "Open" : "Closed";

  if (!confirm(`Ubah status PO ${selectedItem.value.Nomor} dari "${current}" menjadi "${target}"?`)) return;

  try {
    const res = await poApi.updateStatus(selectedItem.value.Nomor);
    toast.success(res.message || `Status PO berhasil diubah menjadi ${target}.`);
    await loadData();
  } catch (e: any) {
    toast.error(e.response?.data?.message || "Gagal mengubah status PO.");
  }
};

// ── Cetak PO (Dot Matrix / QZ Tray sama seperti SO) ───────────────────
const isPrinting = ref(false);
const showPrinterDialog = ref(false);
const showPreviewDialog = ref(false);
const previewLines = ref<string[]>([]);
const cachedPrintData = ref<POprintData | null>(null);

const LINES_PER_PAGE = 33;
const DATA_PER_PAGE = 13;
const totalW = 130;
const colNo = 3, colKode = 12, colNama = 40, colSat = 10, colQty = 10, colDisc = 10, colHrg = 14, colTotal = 15;

const padRight = (str: string, len: number): string => {
  return str.length >= len ? str.substring(0, len) : str + " ".repeat(len - str.length);
};
const padLeft = (str: string, len: number): string => {
  return str.length >= len ? str.substring(0, len) : " ".repeat(len - str.length) + str;
};
const fmtFloat = (v: number) => new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(v || 0);

const terbilang = (n: number): string => {
  const val = Math.floor(Math.abs(n));
  if (val === 0) return "NOL";
  
  const satuan = ["", "SATU", "DUA", "TIGA", "EMPAT", "LIMA", "ENAM", "TUJUH", "DELAPAN", "SEMBILAN", "SEPULUH", "SEBELAS"];
  
  const helper = (num: number): string => {
    if (num < 12) return " " + satuan[Math.floor(num)];
    if (num < 20) return helper(num - 10) + " BELAS";
    if (num < 100) return helper(Math.floor(num / 10)) + " PULUH" + helper(num % 10);
    if (num < 200) return " SERATUS" + helper(num - 100);
    if (num < 1000) return helper(Math.floor(num / 100)) + " RATUS" + helper(num % 100);
    if (num < 2000) return " SERIBU" + helper(num - 1000);
    if (num < 1000000) return helper(Math.floor(num / 1000)) + " RIBU" + helper(num % 1000);
    if (num < 1000000000) return helper(Math.floor(num / 1000000)) + " JUTA" + helper(num % 1000000);
    return helper(Math.floor(num / 1000000000)) + " MILYAR" + helper(num % 1000000000);
  };

  return helper(val).trim();
};

const formatHeaderLinesPO = (data: POprintData): string[] => {
  return [
    padRight(data.perusahaan.nama, 79) + " " + padRight("PURCHASE ORDER", 40),
    padRight(data.perusahaan.alamat + ", " + data.perusahaan.kota, totalW),
    padRight(data.perusahaan.notelp, totalW),
    "",
    padRight("Nomor      : " + data.nomor, 60) + " " + padRight("Supplier : " + data.sup_nama, 60),
    padRight("Tanggal    : " + data.tanggal, 60) + " " + padRight(data.sup_alamat, 60),
    padRight("Memo       : " + data.memo, 60) + " " + padRight(data.sup_telp || "", 60),
    "-".repeat(totalW),
    padRight("No", colNo) + " " + padRight("Kode", colKode) + " " + padRight("Nama", colNama) + " " + padRight("Satuan", colSat) + " " + padLeft("Jumlah", colQty) + " " + padLeft("Disc(%)", colDisc) + " " + padLeft("Harga", colHrg) + " " + padLeft("Total", colTotal),
    "-".repeat(totalW),
  ];
};

const formatDetailLinePO = (i: number, d: any): string => {
  const qty = Number(d.qty || d.Qty || 0);
  const harga = Number(d.harga || d.Harga || 0);
  const discpr = Number(d.discPr || d.DiscPr || 0);
  const sub = (100 - discpr) / 100 * harga * qty;
  const kode = d.barcode || d.brgKode || d.kode || "";
  const nama = d.brgNama || d.NamaBarang || d.nama || "";
  const satuan = d.satuan || d.Satuan || "";

  return (
    padRight(String(i), colNo) + " " +
    padRight(kode, colKode) + " " +
    padRight(nama.substring(0, colNama), colNama) + " " +
    padRight(satuan, colSat) + " " +
    padLeft(fmtFloat(qty), colQty) + " " +
    padLeft(fmtFloat(discpr), colDisc) + " " +
    padLeft(fmtFloat(harga), colHrg) + " " +
    padLeft(fmtFloat(sub), colTotal)
  );
};

const generatePreviewPO = (data: POprintData): string[] => {
  const lines: string[] = [];
  lines.push(...formatHeaderLinesPO(data));

  let i = 0;
  for (const d of data.detail) {
    i++;
    lines.push(formatDetailLinePO(i, d));
    if (i % DATA_PER_PAGE === 0 && i < data.detail.length) {
      lines.push("-".repeat(totalW));
      for (let a = 0; a < 5; a++) lines.push("");
      lines.push(...formatHeaderLinesPO(data));
    }
  }

  if (i % DATA_PER_PAGE !== 0) {
    for (let a = 0; a < DATA_PER_PAGE - (i % DATA_PER_PAGE); a++) lines.push("");
  }
  lines.push("-".repeat(totalW));

  const total = Number(data.total || 0);
  const nilai = Number(data.nilai || total);
  const taxamount = Number(data.taxamount || 0);
  const dp = Number(data.dp || 0);
  const discFaktur = Number(data.discFaktur || 0);

  const terbilangText = terbilang(Math.round(total));
  lines.push(
    padRight("Terbilang : " + terbilangText.substring(0, 80) + " RUPIAH", 81) + " " +
    padRight("Disc faktur   :", 15) + " " +
    padLeft(fmtFloat(discFaktur), 21)
  );
  lines.push(
    padRight(" ", 81) + " " +
    padRight("Total         :", 15) + " " +
    padLeft(fmtFloat(nilai), 21)
  );
  lines.push(
    padRight(" ", 81) + " " +
    padRight("Ppn           :", 15) + " " +
    padLeft(fmtFloat(taxamount), 21)
  );
  lines.push(
    padRight("", 20) + " " +
    padRight("Dibuat oleh,", 30) + " " +
    padRight("Mengetahui,", 29) + " " +
    padRight("Grand Total   :", 15) + " " +
    padLeft(fmtFloat(total), 21)
  );
 lines.push("");
  lines.push("");
  lines.push(
    padRight("", 21) + " " +
    padRight("(               )", 30) + " " +
    padRight("(               )", 30)
  );
  lines.push("");
  lines.push("");

  return lines;
};

const generateEscPosPO = (data: POprintData): string[] => {
  const NL = "\r\n";
  const ESC = "\x1B";
  const SI = "\x0F";
  const commands: string[] = [];

  commands.push(ESC + "@");
  commands.push(SI);
  commands.push(ESC + "2");
  commands.push(ESC + "C" + String.fromCharCode(LINES_PER_PAGE));
  commands.push(ESC + "d" + "\x00");

  for (const line of formatHeaderLinesPO(data)) {
    commands.push(line + NL);
  }

  let i = 0;
  for (const d of data.detail) {
    i++;
    commands.push(formatDetailLinePO(i, d) + NL);
    if (i % DATA_PER_PAGE === 0 && i < data.detail.length) {
      commands.push("-".repeat(totalW) + NL);
      for (let a = 0; a < 8; a++) {
        commands.push(NL);
      }
      for (const line of formatHeaderLinesPO(data)) {
        commands.push(line + NL);
      }
    }
  }

  if (i % DATA_PER_PAGE !== 0) {
    for (let a = 0; a < DATA_PER_PAGE - (i % DATA_PER_PAGE); a++) commands.push(NL);
  }
  commands.push("-".repeat(totalW) + NL);

  const total = Number(data.total || 0);
  const nilai = Number(data.nilai || total);
  const taxamount = Number(data.taxamount || 0);
  const dp = Number(data.dp || 0);
  const discFaktur = Number(data.discFaktur || 0);

  const terbilangText = terbilang(Math.round(total));
  commands.push(
    padRight("Terbilang : " + terbilangText.substring(0, 80) + " RUPIAH", 81) + " " +
    padRight("Disc faktur   :", 15) + " " +
    padLeft(fmtFloat(discFaktur), 21) + NL
  );
  commands.push(
    padRight(" ", 81) + " " +
    padRight("Total         :", 15) + " " +
    padLeft(fmtFloat(nilai), 21) + NL
  );
  commands.push(
    padRight(" ", 81) + " " +
    padRight("Ppn           :", 15) + " " +
    padLeft(fmtFloat(taxamount), 21) + NL
  );
  commands.push(
    padRight("", 20) + " " +
    padRight("Dibuat oleh,", 30) + " " +
    padRight("Mengetahui,", 30) + " " +
    padRight("Grand Total   :", 15) + " " +
    padLeft(fmtFloat(total), 21) + NL
  );
  commands.push(
    padRight("", 81) + " " +
    padRight("Uang Muka     :", 15) + " " +
    padLeft(fmtFloat(dp), 21) + NL
  );
  commands.push(NL);
  commands.push(
    padRight("", 21) + " " +
    padRight("(               )", 30) + " " +
    padRight("(               )", 30) + NL
  );
  commands.push(NL);
  commands.push(NL);

  return commands;
};

const doCetak = async () => {
  if (!isSingleSelected.value) {
    toast.warning("Pilih satu data PO terlebih dahulu.");
    return;
  }
  const item = selectedItem.value!;
  const savedPrinter = getSavedPrinter();
  if (!savedPrinter) {
    showPrinterDialog.value = true;
    return;
  }

  isPrinting.value = true;
  try {
    const data = await poApi.getPrintData(item.Nomor);
    cachedPrintData.value = data;
    previewLines.value = generatePreviewPO(data);
    showPreviewDialog.value = true;
  } catch (e: any) {
    toast.error(e.message || "Gagal memuat data cetak PO.");
  } finally {
    isPrinting.value = false;
  }
};

const onPrinterSaved = async () => {
  showPrinterDialog.value = false;
  if (isSingleSelected.value && cachedPrintData.value) {
    previewLines.value = generatePreviewPO(cachedPrintData.value);
    showPreviewDialog.value = true;
  }
};

const onPrintFromPreview = async () => {
  showPreviewDialog.value = false;
  const savedPrinter = getSavedPrinter();
  if (!savedPrinter || !cachedPrintData.value) {
    toast.warning("Printer belum diset.");
    return;
  }

  isPrinting.value = true;
  try {
    const commands = generateEscPosPO(cachedPrintData.value);
    await connect();
    await printRaw(savedPrinter, commands);
    toast.success("Berhasil dikirim ke printer!");
  } catch (e: any) {
    toast.error(e.message || "Gagal mencetak ke printer.");
  } finally {
    isPrinting.value = false;
    cachedPrintData.value = null;
  }
};

const doExport = async () => {
  const exportItems = getExportItems();
  if (exportItems.length === 0) return toast.warning("Tidak ada data untuk diexport.");
  try {
    await exportToExcel({
      title: "Purchase Order Bahan (PO)",
      filenamePrefix: "PO",
      sheetName: "PO",
      columns: [
        { header: "Nomor", key: "Nomor", width: 20 },
        { header: "Tanggal", key: "Tanggal", width: 14, align: "center" },
        { header: "Supplier", key: "Supplier", width: 28 },
        { header: "Memo", key: "Memo", width: 30 },
        { header: "Pajak", key: "Pajak", width: 10, align: "center" },
        { header: "Total", key: "Total", width: 18, currency: true },
        { header: "PPN", key: "Ppn", width: 16, currency: true },
        { header: "Status", key: "Status", width: 12, align: "center" },
        { header: "Receipt", key: "Receipt", width: 12, align: "center" },
      ],
      rows: exportItems,
    });
    toast.success("Berhasil export data PO ke Excel!");
  } catch (e) {
    console.error(e);
    toast.error("Gagal export data PO ke Excel.");
  }
};

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v || 0);

const rowPropsFn = (data: any) => {
  const row = data.item?.raw || data.item;
  if (!row) return { class: "" };
  let cls = "";
  if (row.Status === "Closed") cls += " row-closed";
  return { class: cls.trim() };
};
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
      <v-btn size="small" variant="tonal" color="info" :disabled="!selectedItem" @click="onUpdateStatus">
        <template #prepend><IconStatusChange :size="13" :stroke-width="1.8" /></template>
        Update Status
      </v-btn>
      <v-btn size="small" variant="tonal" color="primary" :loading="isPrinting" :disabled="!isSingleSelected" @click="doCetak">
        <template #prepend><IconPrinter :size="13" :stroke-width="1.8" /></template>
        Cetak
      </v-btn>
      <v-btn size="small" variant="tonal" color="success" @click="doExport">
        <template #prepend><IconFileSpreadsheet :size="13" :stroke-width="1.8" /></template>
        Export
      </v-btn>
    </template>

    <template #item.Nomor="{ item }">
      <span class="font-weight-medium">{{ item.Nomor }}</span>
    </template>

    <template #item.Tanggal="{ item }">
      <div class="tc">{{ item.Tanggal }}</div>
    </template>

    <template #item.Total="{ item }">
      <div class="tr font-weight-bold" :class="Number(item.Total) < 0 ? 'val-red' : 'val-green'">
        Rp {{ fmtCurrency(item.Total) }}
      </div>
    </template>

    <template #item.Ppn="{ item }">
      <div class="tr text-blue-darken-4">{{ fmtCurrency(item.Ppn) }}</div>
    </template>

    <template #item.Status="{ item }">
      <div class="tc">
        <span :class="item.Status === 'Closed' ? 'badge-closed' : 'badge-open'">
          {{ item.Status }}
        </span>
      </div>
    </template>

    <template #item.Receipt="{ item }">
      <div class="tc">
        <span :class="item.Receipt === 'Sudah' ? 'badge-open' : 'badge-closed'">
          {{ item.Receipt }}
        </span>
      </div>
    </template>

    <template #detail="{ item }">
      <div class="detail-wrap">
        <table class="detail-tbl">
          <thead>
            <tr>
              <th style="width:36px" class="tc">No</th>
              <th style="width:130px">Barcode / Kode</th>
              <th style="width:auto">Nama Barang</th>
              <th style="width:80px" class="tc">Satuan</th>
              <th style="width:70px" class="tr">Qty</th>
              <th style="width:80px" class="tr">Qty Terima</th>
              <th style="width:110px" class="tr">Harga Satuan</th>
              <th style="width:70px" class="tr">Disc (%)</th>
              <th style="width:120px" class="tr">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="detailLoading[item.nomor || item.Nomor]">
              <td colspan="9" class="tc" style="padding:16px">
                <v-progress-circular indeterminate size="20" width="2" color="primary" />
                <span style="margin-left:8px; color:#6b7280;">Memuat detail...</span>
              </td>
            </tr>
            <tr v-else-if="detailError[item.nomor || item.Nomor]">
              <td colspan="9" class="tc" style="padding:16px">
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
                <td class="tr font-weight-bold val-yellow">{{ d.qty || d.Qty }}</td>
                <td class="tr font-weight-bold text-blue-darken-3">
                  {{ d.QtyTerima || 0 }}
                </td>
                <td class="tr font-weight-bold" :class="(d.harga || d.Harga) < 0 ? 'val-red' : 'val-green'">
                  Rp {{ fmtCurrency(d.harga || d.Harga) }}
                </td>
                <td class="tr text-red">{{ d.discPr || d.DiscPr || 0 }}%</td>
                <td class="tr font-weight-bold"
                  :class="((d.qty || d.Qty) * (d.harga || d.Harga) - (((d.qty || d.Qty) * (d.harga || d.Harga) * (d.discPr || d.DiscPr || 0)) / 100)) < 0 ? 'val-red' : 'val-green'">
                  Rp {{ fmtCurrency((d.qty || d.Qty) * (d.harga || d.Harga) - (((d.qty || d.Qty) * (d.harga || d.Harga) * (d.discPr || d.DiscPr || 0)) / 100)) }}
                </td>
              </tr>
              <tr v-if="!getDetail(item.nomor || item.Nomor).length">
                <td colspan="9" class="tc" style="color:#9e9e9e; font-style:italic; padding:12px">
                  Tidak ada detail barang PO.
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </template>

    <template #summary-row="{ filteredItems }">
      <span class="summary-lbl" style="color: white; font-weight: bold;">Total PO</span>
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

  <!-- ── Printer Dialog ── -->
  <PrinterDialog
    v-model="showPrinterDialog"
    @saved="onPrinterSaved"
  />

  <!-- ── Print Preview Dialog ── -->
  <PrintPreviewDialog
    v-model="showPreviewDialog"
    title="Preview Purchase Order"
    :lines="previewLines"
    :is-loading="isPrinting"
    @print="onPrintFromPreview"
  />
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
  border-color: #3B5998;
}

.tc {
  text-align: center;
}
.tr {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.val-green { color: #15803d; }
.val-red { color: #dc2626; }
.val-yellow { color: #a16207; }

:deep(.row-closed td) {
  color: #9e9e9e !important;
}

.badge-closed {
  background: #e0e0e0;
  color: #616161;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 700;
}
.badge-open {
  background: #E8E8F5;
  color: #3B5998;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 700;
}
</style>
