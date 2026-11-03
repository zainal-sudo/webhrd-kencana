<script setup lang="ts">
import { ref, watch, computed, onMounted, onActivated } from "vue";
import { useRouter } from "vue-router";
import { useToast } from "vue-toastification";
import BaseBrowse from "@/components/BaseBrowse.vue";
import { invApi } from "@/api/transaksi/invApi";
import { exportToExcel } from "@/utils/exportExcel";
import { IconReceipt2, IconFileSpreadsheet, IconPrinter } from "@tabler/icons-vue";

import { useQzPrint } from "@/composables/useQzPrint";
import PrinterDialog from "@/components/PrinterDialog.vue";
import PrintPreviewDialog from "@/components/PrintPreviewDialog.vue";

const router = useRouter();
const toast = useToast();
const MENU_ID = "12";

const { connect, getSavedPrinter, printRaw } = useQzPrint();

// ── Periode ───────────────────────────────────────────────────────────
const STORAGE_KEY = "finance_periode_invoice";

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
const isSingleSelected = computed(() => selected.value.length === 1);

const headers = [
  { title: "NOMOR INVOICE", key: "Nomor",      width: "160px", align: "center" },
  { title: "NO. BUKTI",     key: "Nobukti",     width: "120px", align: "center" },
  { title: "TANGGAL",       key: "Tanggal",     width: "105px", align: "center" },
  { title: "JT. TEMPO",     key: "JatuhTempo",  width: "105px", align: "center" },
  { title: "NOMOR BPB",     key: "NomorBPB",    width: "150px", align: "center" },
  { title: "SUPPLIER",      key: "Supplier",    minWidth: "200px" },
  { title: "MEMO",          key: "Memo",        minWidth: "200px" },
  { title: "PAJAK",         key: "Pajak",       width: "80px",  align: "center" },
  { title: "TOTAL",         key: "Total",       width: "140px", align: "end" },
  { title: "RETUR",         key: "Retur",       width: "140px", align: "end" },
  { title: "PPN",           key: "Ppn",         width: "120px", align: "end" },
  { title: "BAYAR",         key: "Bayar",       width: "140px", align: "end" },
  { title: "FREIGHT",       key: "Freight",     width: "120px", align: "end" },
  { title: "STATUS BAYAR",  key: "StatusBayar", width: "110px", align: "center" },
];

const loadData = async () => {
  isLoading.value = true;
  selected.value = [];
  try {
    items.value = await invApi.getBrowse(startDate.value, endDate.value);
  } catch (e: any) {
    toast.error(e.response?.data?.message || "Gagal memuat data invoice.");
  } finally {
    isLoading.value = false;
  }
};

const browseRef = ref<any>(null);

onActivated(() => {
  console.log("Tab aktif kembali, melakukan refresh...");
  loadData();
});

onMounted(() => loadData());

// ── Detail expand ────────────────────────────────────────────────────
const expanded = ref<any[]>([]);
const detailMap = ref<Record<string, any[]>>({});
const detailLoading = ref<Record<string, boolean>>({});
const detailError = ref<Record<string, boolean>>({});

const getDetail = (nomor: string) => detailMap.value[nomor] ?? [];

const fetchDetail = async (nomor: string) => {
  detailLoading.value[nomor] = true;
  detailError.value[nomor] = false;
  try {
    detailMap.value[nomor] = await invApi.getDetail(nomor);
  } catch (e: any) {
    delete detailMap.value[nomor];
    detailError.value[nomor] = true;
    toast.error(e.response?.data?.message || `Gagal memuat detail invoice ${nomor}.`);
  } finally {
    detailLoading.value[nomor] = false;
  }
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

// ── Aksi CRUD ─────────────────────────────────────────────────────────
const onBaru = () => router.push({ name: "invCreate" });

const onUbah = () => {
  if (!selectedItem.value) return toast.warning("Pilih data terlebih dahulu.");
  if (selectedItem.value.StatusBayar === "Lunas") {
    toast.error("Invoice yang sudah lunas tidak dapat diubah.");
    return;
  }
  router.push({ name: "invEdit", params: { nomor: selectedItem.value.Nomor } });
};

const onHapus = async () => {
  if (!selectedItem.value) return toast.warning("Pilih data terlebih dahulu.");
  if (selectedItem.value.StatusBayar === "Lunas") {
    toast.error("Invoice yang sudah lunas tidak dapat dihapus.");
    return;
  }
  if (!confirm(`Hapus Invoice ${selectedItem.value.Nomor}?\nBPB terkait akan bisa di-invoice ulang.`)) return;
  try {
    await invApi.delete(selectedItem.value.Nomor);
    toast.success("Invoice berhasil dihapus.");
    await loadData();
  } catch (e: any) {
    toast.error(e.response?.data?.message || "Gagal menghapus data.");
  }
};

// ── Logika Cetak Invoice (Merujuk ke PO) ──────────────────────────────
const isPrinting = ref(false);
const showPrinterDialog = ref(false);
const showPreviewDialog = ref(false);
const previewLines = ref<string[]>([]);
const cachedPrintData = ref<any | null>(null);

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

const formatHeaderLinesInv = (data: any): string[] => {
  return [
    padRight(data.perusahaan?.nama || "", 79) + " " + padRight("INVOICE PEMBELIAN", 40),
    padRight((data.perusahaan?.alamat || "") + ", " + (data.perusahaan?.kota || ""), totalW),
    padRight(data.perusahaan?.notelp || "", totalW),
    "",
    padRight("Nomor Inv  : " + (data.nomor || ""), 60) + " " + padRight("Supplier : " + (data.sup_nama || ""), 60),
    padRight("Tanggal    : " + (data.tanggal || ""), 60) + " " + padRight(data.sup_alamat || "", 60),
    padRight("Jt. Tempo  : " + (data.jatuhtempo || ""), 60) + " " + padRight("No. BPB  : " + (data.nomorbpb || ""), 60),
    "-".repeat(totalW),
    padRight("No", colNo) + " " + padRight("Kode", colKode) + " " + padRight("Nama", colNama) + " " + padRight("Satuan", colSat) + " " + padLeft("Jumlah", colQty) + " " + padLeft("Disc(%)", colDisc) + " " + padLeft("Harga", colHrg) + " " + padLeft("Total", colTotal),
    "-".repeat(totalW),
  ];
};

const formatDetailLineInv = (i: number, d: any): string => {
  const qty = Number(d.qty || d.Qty || 0);
  const harga = Number(d.harga || d.Harga || 0);
  const discpr = Number(d.discPr || d.DiscPr || 0);
  const sub = (100 - discpr) / 100 * harga * qty;
  const kode = d.barcode || d.Barcode || d.brgKode || "";
  const nama = d.brgNama || d.NamaBarang || "";
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

const generatePreviewInv = (data: any): string[] => {
  const lines: string[] = [];
  lines.push(...formatHeaderLinesInv(data));

  let i = 0;
  for (const d of data.detail) {
    i++;
    lines.push(formatDetailLineInv(i, d));
    if (i % DATA_PER_PAGE === 0 && i < data.detail.length) {
      lines.push("-".repeat(totalW));
      for (let a = 0; a < 5; a++) lines.push("");
      lines.push(...formatHeaderLinesInv(data));
    }
  }

  if (i % DATA_PER_PAGE !== 0) {
    for (let a = 0; a < DATA_PER_PAGE - (i % DATA_PER_PAGE); a++) lines.push("");
  }
  lines.push("-".repeat(totalW));

  const total = Number(data.total || 0);
  const taxamount = Number(data.taxamount || data.Ppn || 0);
  const freight = Number(data.freight || 0);
  const retur = Number(data.retur || 0);

  const terbilangText = terbilang(Math.round(total));
  lines.push(
    padRight("Terbilang : " + terbilangText.substring(0, 80) + " RUPIAH", 81) + " " +
    padRight("Retur         :", 15) + " " +
    padLeft(fmtFloat(retur), 21)
  );
  lines.push(
    padRight(" ", 81) + " " +
    padRight("Freight       :", 15) + " " +
    padLeft(fmtFloat(freight), 21)
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
  return lines;
};

const generateEscPosInv = (data: any): string[] => {
  const NL = "\r\n";
  const ESC = "\x1B";
  const SI = "\x0F";
  const commands: string[] = [];

  commands.push(ESC + "@");
  commands.push(SI);
  commands.push(ESC + "2");
  commands.push(ESC + "C" + String.fromCharCode(LINES_PER_PAGE));
  commands.push(ESC + "d" + "\x00");

  for (const line of formatHeaderLinesInv(data)) {
    commands.push(line + NL);
  }

  let i = 0;
  for (const d of data.detail) {
    i++;
    commands.push(formatDetailLineInv(i, d) + NL);
    if (i % DATA_PER_PAGE === 0 && i < data.detail.length) {
      commands.push("-".repeat(totalW) + NL);
      for (let a = 0; a < 8; a++) commands.push(NL);
      for (const line of formatHeaderLinesInv(data)) {
        commands.push(line + NL);
      }
    }
  }

  if (i % DATA_PER_PAGE !== 0) {
    for (let a = 0; a < DATA_PER_PAGE - (i % DATA_PER_PAGE); a++) commands.push(NL);
  }
  commands.push("-".repeat(totalW) + NL);

  const total = Number(data.total || 0);
  const taxamount = Number(data.taxamount || data.Ppn || 0);
  const freight = Number(data.freight || 0);
  const retur = Number(data.retur || 0);

  const terbilangText = terbilang(Math.round(total));
  commands.push(
    padRight("Terbilang : " + terbilangText.substring(0, 80) + " RUPIAH", 81) + " " +
    padRight("Retur         :", 15) + " " +
    padLeft(fmtFloat(retur), 21) + NL
  );
  commands.push(
    padRight(" ", 81) + " " +
    padRight("Freight       :", 15) + " " +
    padLeft(fmtFloat(freight), 21) + NL
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
  commands.push(NL);
  commands.push(
    padRight("", 21) + " " +
    padRight("(               )", 30) + " " +
    padRight("(               )", 30) + NL
  );

  return commands;
};

const doCetak = async () => {
  if (!isSingleSelected.value) {
    toast.warning("Pilih satu data Invoice terlebih dahulu.");
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
    const data = await invApi.getPrintData(item.Nomor);
    cachedPrintData.value = data;
    previewLines.value = generatePreviewInv(data);
    showPreviewDialog.value = true;
  } catch (e: any) {
    toast.error(e.message || "Gagal memuat data cetak Invoice.");
  } finally {
    isPrinting.value = false;
  }
};

const onPrinterSaved = async () => {
  showPrinterDialog.value = false;
  if (isSingleSelected.value && cachedPrintData.value) {
    previewLines.value = generatePreviewInv(cachedPrintData.value);
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
    const commands = generateEscPosInv(cachedPrintData.value);
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
      title: "Invoice Pembelian",
      filenamePrefix: "Invoice",
      sheetName: "Invoice",
      columns: [
        { header: "Nomor", key: "Nomor", width: 20 },
        { header: "Tanggal", key: "Tanggal", width: 14, align: "center" },
        { header: "Jatuh Tempo", key: "JatuhTempo", width: 14, align: "center" },
        { header: "Nomor BPB", key: "NomorBPB", width: 18, align: "center" },
        { header: "Supplier", key: "Supplier", width: 28 },
        { header: "Memo", key: "Memo", width: 28 },
        { header: "Pajak", key: "Pajak", width: 10, align: "center" },
        { header: "Total", key: "Total", width: 18, currency: true },
        { header: "PPN", key: "Ppn", width: 16, currency: true },
        { header: "Status Bayar", key: "StatusBayar", width: 14, align: "center" },
      ],
      rows: exportItems,
    });
    toast.success("Berhasil export data Invoice ke Excel!");
  } catch (e) {
    console.error(e);
    toast.error("Gagal export data Invoice ke Excel.");
  }
};

const doExportWithDetail = async () => {
  const exportItems = getExportItems();
  if (!exportItems.length) return toast.warning("Tidak ada data untuk diexport.");
  try {
    toast.info("Mengambil data export beserta detail...");
    const response = await invApi.getExportDetail(startDate.value, endDate.value);
    const rawData = response.data || response; // Menyesuaikan jika langsung array atau dibungkus objek data

    if (!rawData || rawData.length === 0) {
      return toast.warning("Tidak ada data untuk diexport.");
    }

    const detailsByNomor = new Map<string, any[]>();
    for (const detail of rawData) {
      const rows = detailsByNomor.get(detail.Nomor) ?? [];
      rows.push(detail);
      detailsByNomor.set(detail.Nomor, rows);
    }
    const detailedRows = exportItems
      .flatMap((item) => detailsByNomor.get(item.Nomor) ?? [])
      .map((d: any) => {
        const qty = Number(d.Qty || 0);
        const harga = Number(d.Harga || 0);
        const discPr = Number(d.DiscPr || 0);

        return {
          Nomor: d.Nomor,
          Nobukti: d.Nobukti,
          Tanggal: d.Tanggal,
          JatuhTempo: d.JatuhTempo,
          NomorBPB: d.NomorBPB,
          Supplier: d.Supplier,
          Memo: d.Memo,
          StatusBayar: d.StatusBayar,
          NoUrut: d.NoUrut || "-",
          Barcode: d.Barcode || "-",
          NamaBarang: d.NamaBarang || "-",
          Satuan: d.Satuan || "-",
          Qty: qty,
          Harga: harga,
          DiscPr: discPr,
          Subtotal: qty * harga - (qty * harga * discPr) / 100,
        };
      });

  if (!detailedRows.length) return toast.warning("Tidak ada data detail untuk diexport.");
  await exportToExcel({
    title: "Invoice Pembelian (With Detail)",
      filenamePrefix: "Invoice_Detail",
      sheetName: "Invoice Detail",
      columns: [
        { header: "No. Invoice", key: "Nomor", width: 18 },
        { header: "No. Bukti", key: "Nobukti", width: 14 },
        { header: "Tanggal", key: "Tanggal", width: 12, align: "center" },
        { header: "Jatuh Tempo", key: "JatuhTempo", width: 12, align: "center" },
        { header: "No. BPB", key: "NomorBPB", width: 16 },
        { header: "Supplier", key: "Supplier", width: 25 },
        { header: "Memo", key: "Memo", width: 20 },
        { header: "Status Bayar", key: "StatusBayar", width: 12, align: "center" },
        { header: "No", key: "NoUrut", width: 6, align: "center" },
        { header: "Barcode / Kode", key: "Barcode", width: 15 },
        { header: "Nama Barang", key: "NamaBarang", width: 30 },
        { header: "Satuan", key: "Satuan", width: 8, align: "center" },
        { header: "Qty", key: "Qty", width: 10 },
        { header: "Harga", key: "Harga", width: 15, currency: true },
        { header: "Disc (%)", key: "DiscPr", width: 10, align: "center" },
        { header: "Subtotal", key: "Subtotal", width: 18, currency: true },
      ],
      rows: detailedRows,
    });

    toast.success("Berhasil export data Invoice dengan detail!");
  } catch (e) {
    console.error(e);
    toast.error("Gagal export data Invoice dengan detail.");
  }
};
const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v || 0);
const fmt = (v: number) => new Intl.NumberFormat("id-ID").format(v || 0);
const getExportItems = (): typeof items.value => browseRef.value?.getExportItems() ?? [];
</script>

<template>
  <BaseBrowse
    ref="browseRef"
    title="Invoice Pembelian"
    :icon="IconReceipt2"
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
      <v-btn size="small" variant="tonal" color="primary" :loading="isPrinting" :disabled="!isSingleSelected" @click="doCetak">
        <template #prepend><IconPrinter :size="13" :stroke-width="1.8" /></template>
        Cetak
      </v-btn>
      <v-btn size="small" variant="tonal" color="success" @click="doExport">
        <template #prepend><IconFileSpreadsheet :size="13" :stroke-width="1.8" /></template>
        Export
      </v-btn>
      <v-btn size="small" variant="tonal" color="success" @click="doExportWithDetail">
    <template #prepend><IconFileSpreadsheet :size="13" :stroke-width="1.8" /></template>
    Export Detail
  </v-btn>
    </template>

    <template #item.Nomor="{ item }">
      <span class="font-weight-bold text-primary">{{ item.Nomor }}</span>
    </template>
    <template #item.Tanggal="{ item }"><div class="tc">{{ item.Tanggal }}</div></template>
    <template #item.JatuhTempo="{ item }"><div class="tc">{{ item.JatuhTempo }}</div></template>
    <template #item.NomorBPB="{ item }">
      <div class="tc text-grey-darken-1 text-caption">{{ item.NomorBPB }}</div>
    </template>
    <template #item.Total="{ item }">
      <div class="tr font-weight-bold text-blue-darken-4">{{ fmtCurrency(item.Total) }}</div>
    </template>
    <template #item.Ppn="{ item }">
      <div class="tr text-blue-darken-4">{{ fmtCurrency(item.Ppn) }}</div>
    </template>
    <template #item.StatusBayar="{ item }">
      <div class="tc">
        <span :class="item.StatusBayar === 'Lunas' ? 'badge-yes' : 'badge-no'">{{ item.StatusBayar }}</span>
      </div>
    </template>

    <template #detail="{ item }">
      <div class="detail-wrap">
        <table class="detail-tbl">
          <thead>
            <tr>
              <th style="width:36px" class="tc">No</th>
              <th style="width:130px">Kode Bahan</th>
              <th>Nama Barang</th>
              <th style="width:80px" class="tc">Satuan</th>
              <th style="width:80px" class="tr">Qty</th>
              <th style="width:110px" class="tr">Harga</th>
              <th style="width:70px" class="tr">Disc (%)</th>
              <th style="width:130px" class="tr">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="detailLoading[item.Nomor]">
              <td colspan="8" class="tc" style="padding:16px">
                <v-progress-circular indeterminate size="20" width="2" color="primary" />
                <span style="margin-left:8px;color:#6b7280;">Memuat detail...</span>
              </td>
            </tr>
            <template v-else>
              <tr v-for="(d, idx) in getDetail(item.Nomor)" :key="idx">
                <td class="tc" style="color:#6b7280;font-weight:bold;">{{ idx + 1 }}</td>
                <td><span class="mono">{{ d.Barcode }}</span></td>
                <td class="font-weight-bold" style="color:#1f2937;">{{ d.NamaBarang }}</td>
                <td class="tc">{{ d.Satuan }}</td>
                <td class="tr font-weight-bold text-blue">{{ fmt(d.Qty) }}</td>
                <td class="tr text-blue-darken-4">Rp {{ fmtCurrency(d.Harga) }}</td>
                <td class="tr text-red">{{ d.DiscPr || 0 }}%</td>
                <td class="tr font-weight-bold" style="color:#374151;">
                  Rp {{ fmtCurrency(d.Qty * d.Harga - (d.Qty * d.Harga * (d.DiscPr || 0)) / 100) }}
                </td>
              </tr>
              <tr v-if="!getDetail(item.Nomor).length">
                <td colspan="8" class="tc" style="color:#9e9e9e;font-style:italic;padding:12px">
                  Tidak ada detail barang.
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </template>

    <template #summary-row="{ filteredItems }">
      <span class="summary-lbl" style="color:white;font-weight:bold;">Total Invoice</span>
      <span class="summary-val" style="color:white;font-weight:bold;">
        {{ fmt(filteredItems.reduce((s: number, r: any) => s + Number(r.Total), 0)) }}
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
    title="Preview Invoice Pembelian"
    :lines="previewLines"
    :is-loading="isPrinting"
    @print="onPrintFromPreview"
  />
</template>

<style scoped>
.filter-group { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.filter-lbl { font-size: 12px; font-weight: 600; color: #374151; white-space: nowrap; }
.filter-sep { font-size: 12px; color: #9ca3af; white-space: nowrap; }
.date-inp {
  height: 32px; border: 1px solid #d1d5db; border-radius: 6px;
  padding: 0 8px; font-size: 12px; outline: none; width: 130px;
}
.date-inp:focus { border-color: #3B5998; }
.tc { text-align: center; }
.tr { text-align: right; font-variant-numeric: tabular-nums; }
.badge-yes { background:#e0f2e9; color:#2e7d32; padding:1px 8px; border-radius:10px; font-size:10px; font-weight:700; }
.badge-no  { background:#fdecea; color:#c62828; padding:1px 8px; border-radius:10px; font-size:10px; font-weight:700; }
.mono { font-family: monospace; font-size: 10px; color: #6b7280; }
</style>
