<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useRoute } from "vue-router";
import { useToast } from "vue-toastification";
import { poFormApi } from "@/api/transaksi/poFormApi";
import { useQzPrint } from "@/composables/useQzPrint";
import { useCompanyInfo } from "@/composables/useCompanyInfo";
import PrinterDialog from "@/components/PrinterDialog.vue";
import PrintPreviewDialog from "@/components/PrintPreviewDialog.vue";
import { IconPrinter, IconRefresh } from "@tabler/icons-vue";

const route = useRoute();
const toast = useToast();
const { connect, getSavedPrinter, printPages, generateEscPosPO } = useQzPrint();
const { companyInfo, fetchCompanyInfo } = useCompanyInfo();

// ── Info Perusahaan — diambil dari tabel tperusahaan via API ──
const perusahaan = computed(() => {
  const c = companyInfo.value;
  if (!c) return { nama: "", alamat: "", telp: "" };

  const alamatLengkap = [c.alamat, c.kota].filter((v) => v && v !== "-").join(", ");
  const telpFax = [c.notelp, c.nofax]
    .filter((v) => v && v !== "-")
    .filter((v, i, arr) => arr.indexOf(v) === i) // hilangkan duplikat kalau telp = fax
    .join(" / ");

  return {
    nama: c.nama,
    alamat: alamatLengkap || "-",
    telp: telpFax || "-",
  };
});

interface PrintDetailItem {
  no: number;
  kode: string;
  namaBarang: string;
  satuan: string;
  qty: number;
  harga: number;
  discPr: number;
  subtotal: number;
}

interface PrintData {
  nomor: string;
  tanggal_fmt: string;
  dateline_fmt: string;
  keterangan: string;
  supplier: string;
  alamatSupplier: string;
  pemesan: string;
  total: number;
  pajak: number;
  grandTotal: number;
  detail: PrintDetailItem[];
}

const data = ref<PrintData | null>(null);
const isLoading = ref(true);
const isPrinting = ref(false);
const showPrinterDialog = ref(false);
const showPreviewDialog = ref(false);
const previewLines = ref<string[]>([]);
const printerName = ref<string | null>(null);

// ── Terbilang (format Rupiah) ──────────────────────────────────────────
const terbilang = (n: number): string => {
  n = Math.floor(Math.abs(n || 0));

  const nomorSebut = [
    "", "Satu", "Dua", "Tiga", "Empat", "Lima", "Enam", "Tujuh",
    "Delapan", "Sembilan", "Sepuluh", "Sebelas",
  ];

  const convert = (num: number): string => {
    if (num < 12) return nomorSebut[num];
    if (num < 20) return (convert(num - 10) + " Belas").trim();
    if (num < 100) {
      const a = convert(Math.floor(num / 10));
      const b = convert(num % 10);
      return (a + " Puluh " + b).trim();
    }
    if (num < 200) return ("Seratus " + convert(num - 100)).trim();
    if (num < 1000) {
      const a = convert(Math.floor(num / 100));
      const b = convert(num % 100);
      return (a + " Ratus " + b).trim();
    }
    if (num < 2000) return ("Seribu " + convert(num - 1000)).trim();
    if (num < 1000000) {
      const a = convert(Math.floor(num / 1000));
      const b = convert(num % 1000);
      return (a + " Ribu " + b).trim();
    }
    if (num < 1000000000) {
      const a = convert(Math.floor(num / 1000000));
      const b = convert(num % 1000000);
      return (a + " Juta " + b).trim();
    }
    const a = convert(Math.floor(num / 1000000000));
    const b = convert(num % 1000000000);
    return (a + " Milyar " + b).trim();
  };

  const result = convert(n).replace(/\s+/g, " ").trim();
  return (result || "Nol").toUpperCase();
};

const fmt = (v: number) => new Intl.NumberFormat("id-ID").format(v || 0);

// ── Generate preview text (plain, tanpa kode ESC/POS) ──────────────────
// Layout dibuat semirip mungkin dengan report Delphi/FastReport aslinya:
// header 2 kolom (Nomor/Tanggal kiri, Pemasok kanan), tabel No-Kode-Nama-
// Satuan-Jml-Harga-Disc-Total, lalu footer Terbilang (kiri) + Total/Ppn/
// Grand Total (kanan), ditutup Memo + tanda tangan.
const ITEMS_PER_PAGE = 13;

const generatePreviewPO = (d: PrintData): string[] => {
  const lines: string[] = [];
  // Lebar carriage landscape (mengikuti contoh report lama / kertas lebar).
  const totalW = 132;
  const colL = 70; // lebar kolom kiri (info nomor/tanggal)

  const padRight = (str: string, len: number): string =>
    str.length >= len ? str.substring(0, len) : str + " ".repeat(len - str.length);
  const padLeft = (str: string, len: number): string =>
    str.length >= len ? str.substring(0, len) : " ".repeat(len - str.length) + str;
  const center = (str: string, len: number): string => {
    if (str.length >= len) return str.substring(0, len);
    const totalPad = len - str.length;
    const left = Math.floor(totalPad / 2);
    return " ".repeat(left) + str + " ".repeat(totalPad - left);
  };
  // Pad kolom tapi PAKSA selalu ada minimal 1 spasi pemisah di akhir,
  // walaupun isinya sepanjang/lebih panjang dari lebar kolom (mencegah
  // teks kolom berikutnya nempel langsung, mis. "1012Botol...").
  const padRightGap = (str: string, len: number): string =>
    padRight(str, Math.max(len - 1, 0)) + " ";
  // Bungkus teks panjang jadi beberapa baris (word-wrap) selebar `len`.
  const wordWrap = (text: string, len: number): string[] => {
    const words = text.split(" ");
    const out: string[] = [];
    let cur = "";
    for (const w of words) {
      const candidate = cur ? `${cur} ${w}` : w;
      if (candidate.length > len) {
        if (cur) out.push(cur);
        cur = w;
      } else {
        cur = candidate;
      }
    }
    if (cur) out.push(cur);
    return out.length ? out : [""];
  };

  const hNo = 5, hKode = 11, hNama = 61, hSat = 9, hQty = 8, hHrg = 14, hDisc = 7, hSub = 17;

  // ── HEADER (diulang tiap halaman) ──
  const buildHeader = (pageNo: number, totalPages: number) => {
    lines.push(perusahaan.value.nama.toUpperCase());
    lines.push(perusahaan.value.alamat);
    lines.push("");
    const title = "PURCHASE ORDER";
    const pageTag = totalPages > 1 ? `Hal. ${pageNo}/${totalPages}` : "";
    lines.push(padRight(center(title, totalW - pageTag.length), totalW - pageTag.length) + pageTag);
    lines.push("");

    const supplierLines = [`Pemasok  : ${d.supplier}`, `           ${d.alamatSupplier}`];
    const infoLines = [
      `Nomor    : ${d.nomor}`,
      `Tanggal  : ${d.tanggal_fmt}`,
      `Perihal  : Purchase Order`,
      `Dateline : ${d.dateline_fmt}`,
    ];
    const maxRows = Math.max(infoLines.length, supplierLines.length);
    for (let i = 0; i < maxRows; i++) {
      lines.push(padRight(infoLines[i] || "", colL) + (supplierLines[i] || ""));
    }
    lines.push("");
    lines.push("=".repeat(totalW));

    lines.push(
      padRight("No", hNo) + padRight("Kode", hKode) + padRight("Nama Barang", hNama) +
      padRight("Satuan", hSat) + padLeft("Jml", hQty) + padLeft("Harga", hHrg) +
      padLeft("Disc", hDisc) + padLeft("Total", hSub)
    );
    lines.push("-".repeat(totalW));
  };

  // ── FOOTER TOTAL/TERBILANG/TTD (hanya di halaman terakhir) ──
  const buildFooter = () => {
    lines.push("");

    const totalBoxW = 48;
    // Jarak/margin sebelum kolom Total supaya terbilang panjang tidak nabrak.
    const gapW = 2;
    const terbilangW = totalW - totalBoxW - gapW;

    const totalLines: string[] = [];
    if (d.pajak > 0) {
      totalLines.push(padRight("Total", 14) + ": " + padLeft(fmt(d.total), totalBoxW - 16));
      totalLines.push(padRight("Ppn", 14) + ": " + padLeft(fmt(d.pajak), totalBoxW - 16));
    }
    totalLines.push(padRight("Grand Total", 14) + ": " + padLeft(fmt(d.grandTotal), totalBoxW - 16));

    const terbilangText = `Terbilang : ${terbilang(d.grandTotal)} RUPIAH`;
    const terbilangWrapped = wordWrap(terbilangText, terbilangW);

    const footerRows = Math.max(terbilangWrapped.length, totalLines.length);
    for (let i = 0; i < footerRows; i++) {
      const left = terbilangWrapped[i] || "";
      lines.push(padRight(left, terbilangW) + " ".repeat(gapW) + (totalLines[i] || ""));
    }
    lines.push("");
    lines.push(`Memo : ${d.keterangan || "-"}`);
    lines.push("");
    lines.push("");
    lines.push(
      padRight("", 24) + padRight("Dibuat Oleh,", 36) + padRight("Disetujui,", 36)
    );
    lines.push("");
    lines.push("");
    lines.push("");
    lines.push(
      padRight("", 24) + padRight("(............................)", 36) + padRight("(............................)", 36)
    );
  };

  // ── PECAH ITEM JADI HALAMAN, MASING-MASING MAKS 13 BARIS ──
  const pages: PrintDetailItem[][] = [];
  for (let i = 0; i < d.detail.length; i += ITEMS_PER_PAGE) {
    pages.push(d.detail.slice(i, i + ITEMS_PER_PAGE));
  }
  if (pages.length === 0) pages.push([]);
  const totalPages = pages.length;

  pages.forEach((pageItems, idx) => {
    const pageNo = idx + 1;
    buildHeader(pageNo, totalPages);

    for (const item of pageItems) {
      lines.push(
        padRight(String(item.no), hNo) +
        padRightGap(String(item.kode ?? "").trim(), hKode) +
        padRight(String(item.namaBarang ?? "").trim(), hNama) +
        padRight(String(item.satuan ?? "").trim(), hSat) +
        padLeft(fmt(item.qty), hQty) +
        padLeft(fmt(item.harga), hHrg) +
        padLeft(item.discPr ? item.discPr + "%" : "-", hDisc) +
        padLeft(fmt(item.subtotal), hSub)
      );
    }
    lines.push("-".repeat(totalW));

    if (pageNo === totalPages) {
      buildFooter();
    } else {
      lines.push("");
      lines.push(center(`... bersambung ke halaman ${pageNo + 1} dari ${totalPages} ...`, totalW));
      lines.push("\f"); // form feed — penanda ganti halaman untuk printer dot matrix
    }
  });

  return lines;
};

// ── Cetak via QZ Tray (Raw ESC/POS) ────────────────────────────────────
// Alur: cek printer tersimpan → tampilkan preview → user konfirmasi cetak
const cetakPrinter = () => {
  if (!data.value) return;
  const savedPrinter = getSavedPrinter();
  if (!savedPrinter) {
    showPrinterDialog.value = true;
    return;
  }
  printerName.value = savedPrinter;
  previewLines.value = generatePreviewPO(data.value);
  showPreviewDialog.value = true;
};

const onPrinterSaved = (name: string) => {
  printerName.value = name;
  showPrinterDialog.value = false;
  if (data.value) {
    previewLines.value = generatePreviewPO(data.value);
    showPreviewDialog.value = true;
  }
};

const onPrintFromPreview = async (pageNumbers: number[]) => {
  if (!data.value) return;
  const savedPrinter = getSavedPrinter();
  if (!savedPrinter) {
    toast.warning("Printer belum diset.");
    showPreviewDialog.value = false;
    showPrinterDialog.value = true;
    return;
  }

  try {
    isPrinting.value = true;
    const connected = await connect();
    if (!connected) {
      toast.error("Gagal menghubungkan ke QZ Tray. Pastikan QZ Tray sudah berjalan di komputer.");
      return;
    }
    // generateEscPosPO mengembalikan array PER HALAMAN (string[][]).
    // printPages mengirim tiap halaman sebagai job print terpisah —
    // WAJIB dipakai, bukan printRaw, supaya semua halaman benar-benar
    // tercetak (lihat catatan form-feed di useQzPrint.ts).
    const pagesCommands = generateEscPosPO({
      perusahaan: perusahaan.value.nama,
      alamat: perusahaan.value.alamat,
      nomor: data.value.nomor,
      tanggal: data.value.tanggal_fmt,
      perihal: "Purchase Order",
      dateline: data.value.dateline_fmt,
      supplier: data.value.supplier,
      alamatSupplier: data.value.alamatSupplier,
      pemesan: data.value.pemesan,
      memo: data.value.keterangan,
      detail: data.value.detail,
      total: data.value.total,
      pajak: data.value.pajak,
      grandTotal: data.value.grandTotal,
      terbilang: terbilang(data.value.grandTotal),
    });
    // Kirim hanya halaman yang dipilih user di dialog preview.
    await printPages(savedPrinter, pagesCommands, pageNumbers);
    toast.success("Berhasil dikirim ke printer!");
    showPreviewDialog.value = false;
  } catch (e: any) {
    console.error("Print error:", e);
    toast.error(e.message || "Gagal mencetak ke printer.");
  } finally {
    isPrinting.value = false;
  }
};

const onGantiPrinter = () => {
  showPreviewDialog.value = false;
  showPrinterDialog.value = true;
};

const cetakBrowser = () => {
  window.print();
};

onMounted(async () => {
  try {
    isLoading.value = true;
    const nomor = decodeURIComponent(route.params.nomor as string);
    const [res] = await Promise.all([
      poFormApi.getDetailForm(nomor),
      fetchCompanyInfo(),
    ]);

    if (res) {
      const detail: PrintDetailItem[] = Array.isArray(res.detail)
        ? res.detail.map((d: any, index: number) => {
            const qty = Number(d.qty || 0);
            const harga = Number(d.harga || 0);
            const discPr = Number(d.discPr || 0);
            const subtotalItem = qty * harga - (qty * harga * discPr) / 100;
            return {
              no: d.no || index + 1,
              kode: d.barcode || d.brgKode || "-",
              namaBarang: d.brgNama || "",
              satuan: d.satuan || "",
              qty,
              harga,
              discPr,
              subtotal: subtotalItem,
            };
          })
        : [];

      // po_amount = nilai final (grand total, sudah termasuk pajak jika ada)
      // po_taxamount = nilai PPN
      // Total (sebelum pajak) = po_amount - po_taxamount
      const grandTotal = Number(res.amount || 0);
      const pajak = Number(res.taxAmount || 0);
      const total = grandTotal - pajak;

      data.value = {
        nomor: res.nomor || nomor,
        tanggal_fmt: res.tanggal || "",
        dateline_fmt: res.dateline || "-",
        keterangan: res.memo || "",
        supplier: res.supNama || "",
        alamatSupplier: res.supAlamat || "Alamat tidak tersedia",
        pemesan: res.pemesan || "-",
        total,
        pajak,
        grandTotal,
        detail,
      };

      const savedPrinter = getSavedPrinter();
      if (savedPrinter) {
        printerName.value = savedPrinter;
      }
    }
  } catch (e: any) {
    console.error(e);
    toast.error(e.response?.data?.message || "Gagal memuat dokumen cetak PO.");
  } finally {
    isLoading.value = false;
  }
});
</script>

<template>
  <div class="print-wrapper pa-6" v-if="data">
    <!-- Toolbar Cetak (hanya tampil di screen, tidak dicetak) -->
    <div class="print-toolbar no-print d-print-none">
      <v-btn color="primary" variant="flat" size="small" class="text-white" @click="cetakBrowser">
        <IconPrinter :size="16" class="mr-1" />
        Cetak (Browser)
      </v-btn>
      <v-btn color="success" variant="flat" size="small" class="text-white" :loading="isPrinting" @click="cetakPrinter">
        <IconPrinter :size="16" class="mr-1" />
        {{ isPrinting ? "Mencetak..." : "Cetak ke Printer" }}
      </v-btn>
      <v-btn v-if="printerName" variant="text" size="small" @click="onGantiPrinter">
        <IconRefresh :size="14" class="mr-1" />
        Ganti Printer ({{ printerName }})
      </v-btn>
    </div>

    <!-- ── HEADER PERUSAHAAN ── -->
    <div class="company-name">{{ perusahaan.nama }}</div>
    <div class="company-sub">{{ perusahaan.alamat }}</div>
    <div class="company-sub" v-if="perusahaan.telp && perusahaan.telp !== '-'">{{ perusahaan.telp }}</div>

    <div class="doc-title">P U R C H A S E &nbsp; O R D E R</div>

    <!-- ── INFO NOMOR / TANGGAL (kiri) & PEMASOK (kanan) ── -->
    <table class="w-100 info-table mb-2">
      <tr>
        <td style="width: 55%; vertical-align: top">
          <table class="meta-tbl">
            <tr><td class="meta-lbl">Nomor</td><td class="meta-colon">:</td><td class="meta-val">{{ data.nomor }}</td></tr>
            <tr><td class="meta-lbl">Tanggal</td><td class="meta-colon">:</td><td class="meta-val">{{ data.tanggal_fmt }}</td></tr>
            <tr><td class="meta-lbl">Perihal</td><td class="meta-colon">:</td><td class="meta-val">Purchase Order</td></tr>
            <tr><td class="meta-lbl">Dateline</td><td class="meta-colon">:</td><td class="meta-val">{{ data.dateline_fmt }}</td></tr>
          </table>
        </td>
        <td style="width: 45%; vertical-align: top">
          <table class="meta-tbl">
            <tr>
              <td class="meta-lbl" style="width: 60px">Pemasok</td>
              <td class="meta-colon">:</td>
              <td class="meta-val">
                {{ data.supplier }}<br />
                <span class="text-muted">{{ data.alamatSupplier }}</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- ── TABEL ITEM ── -->
    <table class="detail-tbl">
      <thead>
        <tr>
          <th style="width: 36px" class="tc">No.</th>
          <th style="width: 70px">Kode</th>
          <th>Nama</th>
          <th style="width: 65px" class="tc">Satuan</th>
          <th style="width: 50px" class="tr">Jml</th>
          <th style="width: 95px" class="tr">Harga</th>
          <th style="width: 50px" class="tc">Disc</th>
          <th style="width: 105px" class="tr">Total</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(item, idx) in data.detail" :key="idx">
          <td class="tc">{{ idx + 1 }}</td>
          <td class="mono">{{ item.kode }}</td>
          <td class="nama-cell">{{ item.namaBarang }}</td>
          <td class="tc">{{ item.satuan }}</td>
          <td class="tr">{{ fmt(item.qty) }}</td>
          <td class="tr">{{ fmt(item.harga) }}</td>
          <td class="tc">{{ item.discPr ? item.discPr + "%" : "-" }}</td>
          <td class="tr">{{ fmt(item.subtotal) }}</td>
        </tr>
        <tr v-if="data.detail.length === 0">
          <td colspan="8" class="tc pa-4 text-muted" style="font-style: italic">Tidak ada item barang.</td>
        </tr>
      </tbody>
    </table>

    <!-- ── FOOTER: TERBILANG + MEMO + TANDA TANGAN (kiri) & TOTAL / PPN / GRAND TOTAL (kanan) ── -->
    <table class="w-100 footer-table mt-3">
      <tr>
        <td style="width: 60%; vertical-align: top">
          <div class="terbilang-box">
            Terbilang : {{ terbilang(data.grandTotal) }} Rupiah
          </div>
        </td>
        <td style="width: 40%; vertical-align: top">
          <table class="total-tbl">
            <tr>
              <td class="total-lbl">Total</td>
              <td class="total-colon">:</td>
              <td class="total-val tr">{{ fmt(data.total) }}</td>
            </tr>
            <tr v-if="data.pajak > 0">
              <td class="total-lbl">Ppn</td>
              <td class="total-colon">:</td>
              <td class="total-val tr">{{ fmt(data.pajak) }}</td>
            </tr>
            <tr class="grand-row">
              <td class="total-lbl">Grand Total</td>
              <td class="total-colon">:</td>
              <td class="total-val tr">{{ fmt(data.grandTotal) }}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <table class="w-100 memo-sign-table mt-2">
      <tr>
        <td style="width: 34%; vertical-align: top">
          Memo : {{ data.keterangan || "-" }}
        </td>
        <td class="tc" style="width: 33%; vertical-align: top">
          Dibuat Oleh,<br /><br /><br /><br />
          ( ............................ )
        </td>
        <td class="tc" style="width: 33%; vertical-align: top">
          Disetujui,<br /><br /><br /><br />
          ( ............................ )
        </td>
      </tr>
    </table>
  </div>
  <div v-else-if="isLoading" class="pa-6 text-center text-muted">
    Menyiapkan Dokumen Cetak Purchase Order...
  </div>

  <PrinterDialog v-model="showPrinterDialog" @saved="onPrinterSaved" />

  <PrintPreviewDialog
    v-model="showPreviewDialog"
    title="Preview Cetak PO"
    :lines="previewLines"
    :is-loading="isPrinting"
    @print="onPrintFromPreview"
  />
</template>

<style scoped>
.print-wrapper *:not(.print-toolbar):not(.print-toolbar *) {
  color: #000 !important;
  text-decoration: none;
}

.print-toolbar .text-white,
.print-toolbar .text-white * {
  color: #fff !important;
}

.print-wrapper {
  background: white;
  font-family: "Courier New", Courier, monospace;
  font-size: 10.5pt;
  max-width: 900px;
  margin: 0 auto;
}

.print-toolbar {
  position: fixed;
  top: 10px;
  right: 10px;
  z-index: 1000;
  display: flex;
  gap: 8px;
  background: white;
  padding: 8px 12px;
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
}

@media print {
  .no-print {
    display: none !important;
  }
}

.w-100 { width: 100%; }
.tc { text-align: center; }
.tr { text-align: right; }
.mono { font-family: "Courier New", monospace; }
.text-muted { font-size: 9.5pt; }

.company-name {
  font-size: 13pt;
  font-weight: bold;
  line-height: 1.3;
}
.company-sub {
  font-size: 10pt;
  line-height: 1.3;
}
.doc-title {
  text-align: center;
  font-size: 13pt;
  font-weight: bold;
  letter-spacing: 3px;
  margin: 8px 0 12px 0;
}

.meta-tbl {
  border-collapse: collapse;
  font-size: 10pt;
  width: 100%;
}
.meta-tbl td {
  padding: 1px 4px;
  vertical-align: top;
}
.meta-lbl {
  width: 65px;
  font-weight: bold;
  white-space: nowrap;
}
.meta-colon {
  width: 10px;
}

/* ── Tabel Item ── */
.detail-tbl,
.detail-tbl th,
.detail-tbl td,
.detail-tbl td.tc,
.detail-tbl td.tr,
.detail-tbl td.mono {
  color: #000 !important;
}
.detail-tbl {
  width: 100%;
  border-collapse: collapse;
  margin-top: 10px;
  font-size: 9.5pt;
  table-layout: fixed;
}
.detail-tbl th,
.detail-tbl td {
  border: 1px solid #000;
  overflow-wrap: break-word;
}
.detail-tbl thead th {
  padding: 5px 4px;
  background: #f0f0f0;
  font-weight: bold;
  font-size: 9pt;
  white-space: nowrap;
}
.detail-tbl tbody td {
  padding: 3px 6px;
  line-height: 1.35;
  vertical-align: top;
}
.nama-cell {
  word-break: break-word;
}

/* ── Footer Total ── */
.footer-table {
  border-collapse: collapse;
  margin-top: 10px;
}
.terbilang-box {
  font-size: 10pt;
  padding: 3px 0;
}

.total-tbl {
  width: 100%;
  border-collapse: collapse;
  font-size: 10pt;
}
.total-tbl td {
  padding: 1px 4px;
}
.total-lbl {
  width: 90px;
  font-weight: 600;
  white-space: nowrap;
}
.total-colon {
  width: 10px;
}
.total-val {
  font-weight: 600;
  min-width: 110px;
}
.grand-row .total-lbl,
.grand-row .total-val {
  font-weight: bold;
  font-size: 11pt;
  border-top: 1px solid #000;
  padding-top: 3px;
}

.memo-sign-table {
  font-size: 10pt;
}

@media print {
  body { background: white; }
  .print-wrapper { padding: 0; max-width: 100%; }
  @page {
    size: A4 portrait;
    margin: 12mm;
  }
}
</style>