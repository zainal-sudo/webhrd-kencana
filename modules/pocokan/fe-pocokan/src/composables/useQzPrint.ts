import { ref } from "vue";

// Declare global qz from CDN
declare global {
  interface Window {
    qz: any;
  }
}

const PRINTER_STORAGE_KEY = "printer_name";
const isConnecting = ref(false);
const isConnected = ref(false);
const printers = ref<string[]>([]);

/**
 * Composable untuk integrasi QZ Tray (cetak langsung ke printer)
 * Menggunakan Raw ESC/POS untuk printer dot matrix
 */
export function useQzPrint() {
  /**
   * Load script qz-tray.js dari CDN jika belum ada
   */
  const loadQzScript = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      // Sudah ada script qz-tray
      if (window.qz) {
        resolve();
        return;
      }

      // Sudah ada script tag tapi belum loaded
      const existing = document.querySelector('script[src*="qz-tray"]');
      if (existing) {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () => reject(new Error("Gagal load qz-tray.js")));
        return;
      }

      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/qz-tray/qz-tray.js";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Gagal load qz-tray.js dari CDN"));
      document.head.appendChild(script);
    });
  };

  /**
   * Hubungkan ke QZ Tray via WebSocket
   */
  const connect = async (): Promise<boolean> => {
    if (isConnected.value) return true;

    try {
      isConnecting.value = true;
      await loadQzScript();

      // QZ Tray default port: 8181
      await window.qz.websocket.connect();
      isConnected.value = true;
      return true;
    } catch (e: any) {
      console.error("QZ Tray connection error:", e);
      isConnected.value = false;
      return false;
    } finally {
      isConnecting.value = false;
    }
  };

  /**
   * Putuskan koneksi ke QZ Tray
   */
  const disconnect = async (): Promise<void> => {
    try {
      if (isConnected.value && window.qz) {
        await window.qz.websocket.disconnect();
      }
    } catch (e) {
      console.error("QZ Tray disconnect error:", e);
    } finally {
      isConnected.value = false;
    }
  };

  /**
   * Ambil list semua printer yang terinstall di komputer
   */
  const getPrinters = async (): Promise<string[]> => {
    if (!isConnected.value) {
      const ok = await connect();
      if (!ok) return [];
    }

    try {
      const list = await window.qz.printers.find();
      printers.value = Array.isArray(list) ? list : [];
      return printers.value;
    } catch (e: any) {
      console.error("Gagal mengambil list printer:", e);
      printers.value = [];
      return [];
    }
  };

  /**
   * Cetak data Raw ESC/POS ke printer
   * @param printerName - nama printer dari OS (harus persis)
   * @param rawData - array of raw ESC/POS commands
   */
  const printRaw = async (printerName: string, rawData: string[]): Promise<boolean> => {
    if (!isConnected.value) {
      const ok = await connect();
      if (!ok) return false;
    }

    try {
      const config = window.qz.configs.create(printerName);
      await window.qz.print(config, rawData);
      return true;
    } catch (e: any) {
      console.error("QZ Tray print error:", e);
      throw e;
    }
  };

  /**
   * Simpan nama printer ke localStorage
   */
  const savePrinter = (name: string): void => {
    localStorage.setItem(PRINTER_STORAGE_KEY, name);
  };

  /**
   * Ambil nama printer dari localStorage
   */
  const getSavedPrinter = (): string | null => {
    return localStorage.getItem(PRINTER_STORAGE_KEY);
  };

  /**
   * Hapus setting printer dari localStorage
   */
  const clearPrinter = (): void => {
    localStorage.removeItem(PRINTER_STORAGE_KEY);
  };

  /**
   * Generate perintah ESC/POS untuk cetak PO.
   *
   * PENTING: layout di sini HARUS selalu sinkron 1:1 dengan `generatePreviewPO`
   * di poPrintView.vue (lebar kolom, urutan field, pagination, dst) — karena
   * ini yang benar-benar dikirim ke kertas, sedangkan generatePreviewPO cuma
   * untuk ditampilkan di layar. Kalau salah satu diubah, ubah juga yang lain.
   *
   * PENTING #2: mengembalikan ARRAY PER HALAMAN (string[][]), BUKAN satu
   * array gabungan dengan form-feed di tengah. Alasannya: banyak driver
   * printer/OS menganggap form-feed (\x0C) sebagai penanda akhir dokumen,
   * jadi kalau semua halaman digabung jadi satu job raw, printer/driver
   * cuma memproses sampai form-feed pertama lalu job dianggap selesai —
   * sisa halaman kebuang. Dengan memisah tiap halaman jadi job print
   * tersendiri (dipanggil printRaw() berkali-kali oleh caller), setiap
   * halaman dijamin benar-benar tercetak, dan caller juga bisa memilih
   * mau cetak halaman berapa saja.
   */
  const generateEscPosPO = (poData: {
    perusahaan: string;
    alamat: string;
    nomor: string;
    tanggal: string;
    perihal: string;
    dateline: string;
    supplier: string;
    alamatSupplier: string;
    pemesan: string;
    memo: string;
    detail: {
      no: number;
      kode: string;
      namaBarang: string;
      satuan: string;
      qty: number;
      harga: number;
      discPr: number;
      subtotal: number;
    }[];
    total: number;
    pajak: number;
    grandTotal: number;
    terbilang: string;
  }): string[][] => {
    const NL = "\r\n";
    const ESC = "\x1B";

    // ── Helper — SAMA PERSIS dengan yang di generatePreviewPO ──
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
    const padRightGap = (str: string, len: number): string =>
      padRight(str, Math.max(len - 1, 0)) + " ";
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
    const fmt = (v: number) => new Intl.NumberFormat("id-ID").format(v || 0);

    // ── Konstanta layout — SAMA PERSIS dengan generatePreviewPO ──
    const totalW = 132;
    const colL = 70;
    const hNo = 5, hKode = 11, hNama = 61, hSat = 9, hQty = 8, hHrg = 14, hDisc = 7, hSub = 17;
    const ITEMS_PER_PAGE = 13;

    // ── Pecah item jadi halaman, maksimal 13 baris per halaman ──
    const pages: typeof poData.detail[] = [];
    for (let i = 0; i < poData.detail.length; i += ITEMS_PER_PAGE) {
      pages.push(poData.detail.slice(i, i + ITEMS_PER_PAGE));
    }
    if (pages.length === 0) pages.push([]);
    const totalPages = pages.length;

    const pagesCommands: string[][] = [];

    pages.forEach((pageItems, idx) => {
      const pageNo = idx + 1;
      const commands: string[] = [];
      const push = (line: string) => commands.push(line + NL);

      // Setiap halaman = job print tersendiri → wajib inisialisasi printer
      // sendiri-sendiri di setiap halaman (init, line spacing, alignment).
      commands.push(ESC + "@"); // initialize printer

      // Line spacing — sebelumnya 24/180" (0x18), terlalu rapat dibanding
      // preview di layar (line-height 1.35). Dinaikkan ke 36/180" (0x24)
      // supaya jarak antar baris lebih longgar dan sesuai preview.
      // Kalau di printer kamu masih kerasa rapat/longgar, angka ini yang
      // perlu disetel lagi (semakin besar semakin renggang).
      commands.push(ESC + "3" + "\x24");

      // Condensed font supaya 132 kolom muat secara fisik di kertas
      // continuous-form (cek dulu printer kamu support mode ini).
      commands.push(ESC + "\x0F");

      // Left align (semua teks kita atur alignment manual via padding)
      commands.push(ESC + "a" + "\x00");

      push(poData.perusahaan.toUpperCase());
      push(poData.alamat);
      push("");

      const title = "PURCHASE ORDER";
      const pageTag = totalPages > 1 ? `Hal. ${pageNo}/${totalPages}` : "";
      push(padRight(center(title, totalW - pageTag.length), totalW - pageTag.length) + pageTag);
      push("");

      const supplierLines = [`Pemasok  : ${poData.supplier}`, `           ${poData.alamatSupplier}`];
      const infoLines = [
        `Nomor    : ${poData.nomor}`,
        `Tanggal  : ${poData.tanggal}`,
        `Perihal  : ${poData.perihal || "Purchase Order"}`,
        `Dateline : ${poData.dateline}`,
      ];
      const maxRows = Math.max(infoLines.length, supplierLines.length);
      for (let i = 0; i < maxRows; i++) {
        push(padRight(infoLines[i] || "", colL) + (supplierLines[i] || ""));
      }
      push("");
      push("=".repeat(totalW));

      push(
        padRight("No", hNo) + padRight("Kode", hKode) + padRight("Nama Barang", hNama) +
        padRight("Satuan", hSat) + padLeft("Jumlah", hQty) + padLeft("Harga", hHrg) +
        padLeft("Disc", hDisc) + padLeft("Total", hSub)
      );
      push("-".repeat(totalW));

      for (const item of pageItems) {
        push(
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
      push("-".repeat(totalW));

      if (pageNo === totalPages) {
        push("");

        const totalBoxW = 48;
        const gapW = 2;
        const terbilangW = totalW - totalBoxW - gapW;

        const totalLines: string[] = [];
        if (poData.pajak > 0) {
          totalLines.push(padRight("Total", 14) + ": " + padLeft(fmt(poData.total), totalBoxW - 16));
          totalLines.push(padRight("Ppn", 14) + ": " + padLeft(fmt(poData.pajak), totalBoxW - 16));
        }
        totalLines.push(padRight("Grand Total", 14) + ": " + padLeft(fmt(poData.grandTotal), totalBoxW - 16));

        const terbilangText = `Terbilang : ${poData.terbilang} RUPIAH`;
        const terbilangWrapped = wordWrap(terbilangText, terbilangW);

        const footerRows = Math.max(terbilangWrapped.length, totalLines.length);
        for (let i = 0; i < footerRows; i++) {
          const left = terbilangWrapped[i] || "";
          push(padRight(left, terbilangW) + " ".repeat(gapW) + (totalLines[i] || ""));
        }
        push("");
        push(`Memo : ${poData.memo || "-"}`);
        push("");
        push("");
        push(padRight("", 24) + padRight("Dibuat Oleh,", 36) + padRight("Disetujui,", 36));
        push("");
        push("");
        push("");
        push(
          padRight("", 24) +
            padRight("(............................)", 36) +
            padRight("(............................)", 36)
        );
      } else {
        push("");
        push(center(`... bersambung ke halaman ${pageNo + 1} dari ${totalPages} ...`, totalW));
      }

      // Feed beberapa baris di akhir tiap halaman (tear-off continuous form).
      commands.push(NL + NL + NL);

      pagesCommands.push(commands);
    });

    return pagesCommands;
  };

  /**
   * Generate perintah ESC/POS untuk cetak SPK.
   * Layout HARUS sinkron dengan generatePreviewSPK di SpkPrintView.vue.
   */
  const generateEscPosSPK = (spkData: {
    perusahaan: string;
    alamat: string;
    nomor: string;
    nama: string;
    brgNama: string;
    satuan: string;
    custNama: string;
    tanggal: string;
    dateline: string;
    idBatch: string;
    jumlah: number;
    keterangan: string;
    komposisi: { bahanNama: string; qtyPerUnit: number; totalQty: number; satuan: string }[];
    history: {
      nomor: string;
      tanggal: string;
      urutan: number;
      tahap: string;
      jumlah: number;
      mesin: string;
      operator: string;
    }[];
  }): string[][] => {
    const NL = "\r\n";
    const ESC = "\x1B";

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
    const fmt = (v: number) => new Intl.NumberFormat("id-ID").format(v || 0);
    const fmtQty = (v: number) =>
      new Intl.NumberFormat("id-ID", { maximumFractionDigits: 6 }).format(v || 0);

    const totalW = 132;
    const colL = 66;

    const commands: string[] = [];
    const push = (line: string) => commands.push(line + NL);

    commands.push(ESC + "@");
    commands.push(ESC + "3" + "\x24");
    commands.push(ESC + "\x0F");
    commands.push(ESC + "a" + "\x00");

    push(spkData.perusahaan.toUpperCase());
    push(spkData.alamat);
    push("");
    push(center("SURAT PERINTAH KERJA", totalW));
    push("");

    const infoLines = [
      `No. SPK  : ${spkData.nomor}`,
      `Nama SPK : ${spkData.nama}`,
      `Tanggal  : ${spkData.tanggal}`,
      `Dateline : ${spkData.dateline}`,
    ];
    const infoLines2 = [
      `Barang   : ${spkData.brgNama}`,
      `Customer : ${spkData.custNama}`,
      `ID Batch : ${spkData.idBatch}`,
      `Target   : ${fmt(spkData.jumlah)} ${spkData.satuan}`,
    ];
    for (let i = 0; i < 4; i++) {
      push(padRight(infoLines[i] || "", colL) + (infoLines2[i] || ""));
    }
    push("");
    push("=".repeat(totalW));

    // ── Bahan Baku & Kemasan ──
    push("BAHAN BAKU & KEMASAN");
    push("-".repeat(totalW));
    const bNo = 4, bNama = 55, bLot = 25, bQty = 15, bTot = 18, bSat = 10;
    push(
      padRight("No", bNo) + padRight("Bahan Baku", bNama) + padRight("LOT", bLot) +
      padLeft("Qty/Box", bQty) + padLeft("Total Qty", bTot) + padLeft("Satuan", bSat)
    );
    push("-".repeat(totalW));
    if (spkData.komposisi.length === 0) {
      push(center("(belum ada data komposisi bahan)", totalW));
    } else {
      spkData.komposisi.forEach((row, idx) => {
        push(
          padRight(String(idx + 1), bNo) +
          padRight(row.bahanNama, bNama) +
          padRight("", bLot) +
          padLeft(fmtQty(row.qtyPerUnit), bQty) +
          padLeft(fmtQty(row.totalQty), bTot) +
          padLeft(row.satuan, bSat)
        );
      });
    }
    push("-".repeat(totalW));
    push("");

    // ── Proses Produksi ──
    push("PROSES PRODUKSI");
    push("-".repeat(totalW));
    const pNo = 4, pNomor = 16, pTgl = 12, pTahap = 40, pJml = 13, pMesin = 22, pOp = 20;
    push(
      padRight("No", pNo) + padRight("Nomor LHK", pNomor) + padRight("Tanggal", pTgl) +
      padRight("Tahap", pTahap) + padLeft("Jml Lolos", pJml) + " " +
      padRight("Mesin", pMesin) + padRight("Operator", pOp)
    );
    push("-".repeat(totalW));
    if (spkData.history.length === 0) {
      push(center("(belum ada laporan LHK)", totalW));
    } else {
      spkData.history.forEach((row, idx) => {
        push(
          padRight(String(idx + 1), pNo) +
          padRight(row.nomor, pNomor) +
          padRight(row.tanggal, pTgl) +
          padRight(`${row.urutan}. ${row.tahap}`, pTahap) +
          padLeft(fmt(row.jumlah), pJml) + " " +
          padRight(row.mesin || "-", pMesin) +
          padRight(row.operator || "-", pOp)
        );
      });
    }
    push("-".repeat(totalW));
    push("");

    push(`Keterangan : ${spkData.keterangan || "-"}`);
    push("");
    push("");
    const signColW = Math.floor(totalW / 3);
    push(
      padRight(center("Dibuat,", signColW), signColW) +
      padRight(center("Diperiksa,", signColW), signColW) +
      center("Disetujui,", signColW)
    );
    push("");
    push("");
    push("");
    push(
      padRight(center("(............................)", signColW), signColW) +
      padRight(center("(............................)", signColW), signColW) +
      center("(............................)", signColW)
    );

    commands.push(NL + NL + NL);

    return [commands]; // 1 halaman saja (SPK biasanya muat 1 halaman)
  };

  /**
   * Kirim beberapa halaman (hasil generateEscPosPO) ke printer sebagai
   * JOB TERPISAH satu per satu, bukan digabung jadi satu kiriman.
   * Ini yang memastikan semua halaman benar-benar tercetak (lihat catatan
   * di generateEscPosPO soal bug form-feed dianggap akhir dokumen).
   *
   * @param printerName - nama printer
   * @param pagesCommands - array per halaman dari generateEscPosPO
   * @param pageNumbers - nomor halaman (1-based) yang ingin dicetak, urut.
   *                      Kalau tidak diisi, semua halaman dicetak.
   */
  const printPages = async (
    printerName: string,
    pagesCommands: string[][],
    pageNumbers?: number[]
  ): Promise<void> => {
    const targets = pageNumbers && pageNumbers.length > 0
      ? pageNumbers
      : pagesCommands.map((_, i) => i + 1);

    for (const pageNo of targets) {
      const cmds = pagesCommands[pageNo - 1];
      if (!cmds) continue;
      await printRaw(printerName, cmds);
      // Jeda singkat antar halaman supaya buffer printer dot matrix tidak
      // numpuk/bertabrakan antar job yang berurutan.
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  };

  return {
    // State
    isConnecting,
    isConnected,
    printers,

    // Methods
    loadQzScript,
    connect,
    disconnect,
    getPrinters,
    printRaw,
    printPages,
    savePrinter,
    getSavedPrinter,
    clearPrinter,
    generateEscPosPO,
    generateEscPosSPK,
  };
}