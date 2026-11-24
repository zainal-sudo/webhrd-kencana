// Surat Panggilan Karyawan — PDF A4 (jsPDF) dari card Dashboard
// "Tidak Masuk 3–4 Hari Berturut-turut" / halaman Eksekusi Tidak Masuk.
//
// Isi, kop, nomor, dan blok tanda tangan mengikuti template di root repo:
//   `SURAT PANGGILAN KARYAWAN develop.docx`
//     · kop     → logo Kencana Print (img/kp.jpg) di KANAN ATAS agak mojok
//                 (8 mm dari tepi kertas, 70 mm lebar — posisi header Word)
//     · judul   → "SURAT PANGGILAN KARYAWAN" digarisbawahi gaya Word
//                 (garis MENEMPEL hurufnya, selebar teks judul),
//                 di bawah judul, di atas nomor surat
//     · nomor   → <urut per bulan>/HRD&GA/<bulan romawi>/<tahun>
//                 urut mulai 1 tiap bulan. Sumber utama: DATABASE
//                 (`tnomor_surat_panggilan` + `tsurat_panggilan_terbit` —
//                 nomor melekat pada nik + nama + rentang tanggal), lihat
//                 halaman Eksekusi; localStorage hanya cadangan bila server
//                 tak terjangkau (`nomorSuratDefault`/`catatSuratTerbit`).
//                 bulan & tahun ikut tanggal surat yang dipilih
//     · tahap 1 → "surat panggilan 1 (satu)"   (3 hari tidak masuk)
//     · tahap 2 → "surat panggilan 2 (dua)" + ancaman (MANGKIR) (4 hari)
//     · ttd     → tempat, tanggal, nama & jabatan HRD TETAP dicetak;
//                 hanya RUANG TENGAH (stempel/tanda tangan) yang DIKOSONGKAN
//                 ±26 mm untuk tanda tangan manual (permintaan revisi)
// Angka surat, pabrik, tanggal & pukul bisa diubah HR lewat dialog pratinjau.
// (Footer alamat pabrik dari dokumen Word TIDAK ikut — diminta hilang.)

import type { jsPDF } from "jspdf";

/** Isi satu surat panggilan (sudah siap cetak). */
export interface SuratPanggilan {
  /** 1 = Panggilan 1 (3 hari tidak masuk), 2 = Panggilan 2 (4 hari → MANGKIR). */
  tahap: 1 | 2;
  /** Nomor surat, mis. `39/HRD&GA/XI/2026` (lihat `nomorSuratDefault`). */
  nomor: string;
  nama: string;
  alamat: string;
  /** `tpabrik.pab_pabrik` — induk pabrik karyawan; berkode P = pabrik induk. */
  indukPabrik: string;
  /** `tpabrik.pab_nama` — bahan frasa "Kaosan cabang …" (bukan pabrik induk). */
  namaPabrik: string;
  /** Hari/tanggal kehadiran yang diminta (template: Today+1). */
  tanggalPanggilan: Date;
  /** Tanggal surat diterbitkan (template: today). */
  tanggalSurat: Date;
  /** Default `07.50 WIB` sesuai template. */
  pukul: string;
}

const A4_W = 210;
const A4_H = 297;
/** Margin 1" seperti dokumen Word-nya (pgMar 1440 twips). */
const MARGIN = 25.4;
const BATAS_BAWAH = A4_H - MARGIN;
/** Leading paragraf 12 pt — sedikit lebih longgar dari template (6,2 mm). */
const TINGGI_BARIS = 6.2;
/** Jarak baris blok tanda tangan — TETAP 5,6 mm (tidak ikut dilonggarkan). */
const TINGGI_TTD = 5.6;
/** Kolom TITIK DUA pada baris "Label : nilai" — sejajar antarbaris (mm dari indentasi). */
const LEBAR_LABEL = 32;
const INDENT = 12;

const ROMAWI = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

export const PUKUL_DEFAULT = "07.50 WIB";

/** Penanda tangan surat (persis blok tanda tangan di dokumen Word). */
export const PENANDATANGAN = {
  kota: "Boyolali",
  nama: "Muhammad Fahrun Ali Syaifuddin",
  jabatan: "HRD",
};

/** "Senin, 16 November 2026" — format tanggal panjang locale id-ID. */
export function tanggalPanjang(d: Date): string {
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

/** "16 November 2026" — tanggal polos locale id-ID. */
export function tanggalPolos(d: Date): string {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(d);
}

/** Penyimpanan nomor urut surat per bulan di BROWSER (localStorage) —
 * sengaja bukan database (fitur ini tanpa penyimpanan riwayat). Key: "YYYY-MM". */
const KUNCI_URUT_SURAT = "kencana_surat_panggilan_urut";

function kunciBulan(t: Date): string {
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`;
}

/** Baca penyimpanan urut (aman di lingkungan tanpa localStorage — mis. test). */
function bacaUrut(): Record<string, number> {
  try {
    if (typeof localStorage === "undefined") return {};
    const data = JSON.parse(localStorage.getItem(KUNCI_URUT_SURAT) || "{}");
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

/** Jumlah surat panggilan yang sudah dibuat untuk bulan `tanggal` (0 bila belum ada). */
export function urutSuratBulan(tanggal: Date = new Date()): number {
  return Number(bacaUrut()[kunciBulan(tanggal)]) || 0;
}

/** Nomor surat dari urut per bulan: `<urut>/HRD&GA/<bulan romawi>/<tahun>`
 *  — dipakai hasil counter database maupun cadangan lokal. */
export function nomorDariUrut(urut: number, tanggal: Date = new Date()): string {
  const n = Math.max(1, Math.trunc(Number(urut) || 1));
  return `${n}/HRD&GA/${ROMAWI[tanggal.getMonth()]}/${tanggal.getFullYear()}`;
}

/** Nomor surat bawaan: urut BERIKUTNYA per bulan + bulan romawi + tahun
 *  (bulan & tahun ikut tanggal surat yang dipilih, bukan hardcoded 39).
 *  Ini cadangan bila endpoint database tidak terjangkau — sumber utama
 *  nomor urut ada di `tnomor_surat_panggilan` (lihat view Eksekusi). */
export function nomorSuratDefault(tanggal: Date = new Date()): string {
  return nomorDariUrut(urutSuratBulan(tanggal) + 1, tanggal);
}

/** Catat satu surat terbit → urut bulan tersebut naik 1 (panggil setelah PDF jadi). */
export function catatSuratTerbit(tanggal: Date = new Date()): void {
  try {
    if (typeof localStorage === "undefined") return;
    const data = bacaUrut();
    const k = kunciBulan(tanggal);
    data[k] = (Number(data[k]) || 0) + 1;
    localStorage.setItem(KUNCI_URUT_SURAT, JSON.stringify(data));
  } catch {
    /* penyimpanan penuh/diizinkan — nomor berikutnya tetap terpakai */
  }
}

/** Judul kata: huruf besar di awal kata, sisanya kecil
 *  ("STORE SALE" → "Store Sale", "PABRIK 4 (JERON)" → "Pabrik 4 (Jeron)"). */
export function judulKata(teks: string | null | undefined): string {
  return String(teks || "")
    .trim()
    .toLowerCase()
    .replace(/(^|[^\p{L}])(\p{L})/gu, (_c, awal: string, huruf: string) => awal + huruf.toUpperCase());
}

/**
 * Tujuan surat: "Untuk masuk kerja kembali di … pada:" (template Word:
 * `di CV. Kencana Print/<atau>Kaosan cabang <xxx> pada:`).
 * **SEMUA versi memuat kata "cabang" + nama pabrik karyawan SENDIRI**
 * (`tpabrik.pab_nama`, dijadikan HURUF BESAR semua) — permintaan HRD:
 * · Induk pabrik berkode P (P01/P02/P04 — termasuk anaknya P012, P03, P042,
 *   P05 dan HO) → **"CV. Kencana Print cabang <nama pabrik>"**
 *   (mis. "CV. Kencana Print cabang Pabrik 4 (Jeron)").
 * · Selain P (K01–K13, KBD, SL1/STORE SALE, …) → **"Kaosan cabang <nama>"**
 *   (mis. "Kaosan cabang Boyolali").
 * Aturan ditegaskan HRD: "kalau SL1 ikutnya kaosan; selain kode pabrik
 * induk P itu kaosan".
 */
export function teksTujuan(s: Pick<SuratPanggilan, "indukPabrik" | "namaPabrik">): string {
  // Nama pabrik setelah kata "cabang" ditulis HURUF BESAR semua (permintaan).
  const nama = String(s.namaPabrik || "").trim().toUpperCase();
  const indukP = String(s.indukPabrik || "").trim().toUpperCase().startsWith("P");
  if (indukP) return nama ? `CV. Kencana Print cabang ${nama}` : "CV. Kencana Print";
  return nama ? `Kaosan cabang ${nama}` : "Kaosan";
}

/** Tanggal `+1 hari` (acuan hari/tanggal pada surat). */
export function besok(d: Date = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
}

/** "YYYY-MM-DD" (untuk `<input type="date">`) dari Date lokal. */
export function sqlTanggal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Date lokal dari "YYYY-MM-DD" (tanpa geser zona). */
export function tanggalDariSql(v: string): Date {
  const [y, m, d] = String(v || "").split("-").map(Number);
  return new Date(y || new Date().getFullYear(), (m || 1) - 1, d || 1);
}

/** Berkas hasil unduhan: Surat_Panggilan_2_NAMA_20261116.pdf */
export function namaBerkasSurat(s: SuratPanggilan): string {
  const nama = String(s.nama || "karyawan")
    .replace(/[\\/:*?"<>|]/g, "")
    .trim()
    .replace(/\s+/g, "_");
  return `Surat_Panggilan_${s.tahap}_${nama || "karyawan"}_${sqlTanggal(s.tanggalSurat).replace(/-/g, "")}.pdf`;
}

/** URL aset di folder publik (menghormati BASE_URL build). */function asetPublik(nama: string): string {
  try {
    return new URL(`${import.meta.env.BASE_URL || "/"}img/${nama}`, window.location.href).href;
  } catch {
    return `${window.location.origin}/img/${nama}`;
  }
}

/** Muat gambar publik → data URL + ukuran piksel (untuk jaga rasio). */
async function muatGambar(nama: string): Promise<{ data: string; w: number; h: number }> {
  const res = await fetch(asetPublik(nama));
  if (!res.ok) throw new Error(`Gambar ${nama} tidak dapat dimuat (HTTP ${res.status})`);
  const blob = await res.blob();
  const data = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error(`Gagal membaca gambar ${nama}`));
    fr.readAsDataURL(blob);
  });
  const ukuran = await new Promise<{ w: number; h: number }>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error(`Gambar ${nama} rusak`));
    img.src = data;
  });
  return { data, w: ukuran.w, h: ukuran.h };
}

/**
 * Lebar teks SEBAGAIMANA di-render jsPDF — yaitu **tanpa kerning**.
 * `doc.getTextWidth()` memakai kerning (98,6 mm untuk judul surat ini) padahal
 * saat mencetak & menggeser rata tengah jsPDF memakai lebar tanpa kerning
 * (102,04 mm) → kalau pakai `getTextWidth`, garis underline jadi ~3,4% lebih
 * pendek daripada teksnya. Fungsi ini dipakai agar garis underline selebar
 * persis teks judul (seperti underline di Word).
 */
function lebarRender(doc: jsPDF, teks: string): number {
  // `getFont`/`getFontSize` ada di runtime jsPDF tapi tidak dideklarasikan
  // pada tipe `internal` → dipetakan ke struktur minimal.
  const internal = doc.internal as unknown as {
    scaleFactor: number;
    getFont(): unknown;
    getFontSize(): number;
  };
  const unit = doc.getStringUnitWidth(teks, {
    font: internal.getFont(),
    charSpace: 0,
    fontSize: internal.getFontSize(),
    doKerning: false,
  });
  return (unit * internal.getFontSize()) / internal.scaleFactor;
}

/**
 * Susun & unduh Surat Panggilan Karyawan (A4, satu halaman).
 * Melempar bila gambar kop/stempel tidak dapat dimuat — penelepon menampilkan
 * pesan galat, jadi HR tidak menerima surat tanpa kop.
 */
export async function unduhSuratPanggilan(s: SuratPanggilan): Promise<string> {
  const { jsPDF } = await import("jspdf");
  // Hanya logo kop yang dicetak — stempel HRD tidak lagi dipakai (blok tanda
  // tangan dikosongkan, lihat bawah).
  const logo = await muatGambar("kp.jpg");

  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const kiri = MARGIN;
  const kanan = A4_W - MARGIN;
  const lebar = kanan - kiri;

  // ── Kop: logo Kencana Print di KANAN ATAS agak mojok (8 mm dari tepi
  //    kertas kanan & atas — permintaan revisi; lebar 70 mm tetap seperti Word) ──
  const lebarLogo = 70;
  const tepi = 8;
  doc.addImage(logo.data, "JPEG", A4_W - tepi - lebarLogo, tepi, lebarLogo, (lebarLogo * logo.h) / logo.w);

  // ── Judul (rata tengah, 18 pt bold — seperti template) + UNDERLINE ──
  doc.setTextColor(0);
  doc.setFont("times", "bold");
  doc.setFontSize(18);
  const JUDUL = "SURAT PANGGILAN KARYAWAN";
  doc.text(JUDUL, A4_W / 2, 46, { align: "center" });
  // Underline gaya Word: SEDIKIT JARAK (0,6 mm) antara baseline huruf dan
  // sisi atas garis; tebal 0,5 mm (≈1,4 pt seperti underline Word 18 pt).
  // LEBAR memakai `lebarRender` (tanpa kerning) — persis lebar yang dipakai
  // jsPDF saat menggeser teks rata tengah, jadi garis SESUAI selebar teks.
  const lebarJudul = lebarRender(doc, JUDUL);
  const TEBAL_GARIS = 0.5;
  const JARAK_UNDERLINE = 0.6; // baseline huruf → sisi atas garis (mm)
  const yGaris = 46 + JARAK_UNDERLINE + TEBAL_GARIS / 2;
  doc.setLineWidth(TEBAL_GARIS);
  doc.line(A4_W / 2 - lebarJudul / 2, yGaris, A4_W / 2 + lebarJudul / 2, yGaris);

  // ── Nomor surat: urut per bulan + bulan romawi + tahun ikut tanggal surat.
  //    Diletakkan TEPAT DI BAWAH header (garis underline) dengan jarak sedikit
  //    saja — mengikuti referensi dokumen Word. ──
  doc.setFont("times", "normal");
  doc.setFontSize(12);
  doc.text(s.nomor, A4_W / 2, 51.5, { align: "center" });

  doc.setFont("times", "normal");
  doc.setFontSize(12);
  let y = 68;

  /** Paragraf rata kiri-kanan (justify) selebar kolom teks. */
  const paragraf = (teks: string, indent = 0): void => {
    const x = kiri + indent;
    const w = lebar - indent;
    const baris = doc.splitTextToSize(teks, w) as string[];
    doc.text(baris, x, y, { align: "justify", maxWidth: w });
    y += baris.length * TINGGI_BARIS;
  };

  /** Baris "Label : nilai" gaya dokumen Word (pakai tab): LABEL di kiri,
   *  TITIK DUA di kolom tetap (sejajar antarbaris), keterangan BARU MULAI
   *  tepat setelah titik dua — jadi rapi. Nilai mengalir & membungkus.
   *  `italic` → keterangan dicetak miring (dipakai isi "Keperluan"). */
  const barisLabel = (label: string, nilai: string, italic = false): void => {
    const x = kiri + INDENT;
    const xKolon = x + LEBAR_LABEL; // kolom titik dua sejajar (Nama/Alamat/Hari/tanggal/Pukul/Keperluan)
    const xNilai = xKolon + 3; // keterangan langsung setelah ":"
    doc.text(label, x, y);
    doc.text(":", xKolon, y);
    const baris = doc.splitTextToSize(nilai, kanan - xNilai) as string[];
    if (italic) doc.setFont("times", "italic");
    doc.text(baris, xNilai, y);
    if (italic) doc.setFont("times", "normal");
    y += baris.length * TINGGI_BARIS;
  };

  // ── Isi surat (template: paragraf justifikasi + blok berlabel) ──
  paragraf(
    `Bersama dengan surat panggilan ${s.tahap === 2 ? "2 (dua)" : "1 (satu)"} ini, ` +
    "Divisi HR Kencana Print memanggil Anda sebagai karyawan CV. Kencana Print atas nama:",
  );
  barisLabel("Nama", s.nama || "-");
  barisLabel("Alamat", s.alamat || "-");
  y += 4;

  paragraf(`Untuk masuk kerja kembali di ${teksTujuan(s)} pada:`);
  barisLabel("Hari/tanggal", tanggalPanjang(s.tanggalPanggilan));
  barisLabel("Pukul", s.pukul || PUKUL_DEFAULT);
  barisLabel(
    "Keperluan",
    "Memberikan penjelasan atas ketidak hadirannya di tempat kerja dan kembali bekerja",
    true, // huruf miring — mengikuti penekanan pada template Word
  );
  y += 6;

  paragraf(
    s.tahap === 2
      ? "Demikian surat panggilan ini dibuat untuk dilaksanakan. Apabila tidak hadir maka kami " +
      "anggap mengundurkan diri tanpa prosedur (MANGKIR). Terima kasih."
      : "Demikian surat panggilan ini dibuat untuk dilaksanakan. Terima kasih.",
  );

  // ── Blok tanda tangan (kolom kanan ±65 mm seperti tabel di Word):
  //    "Boyolali, <tanggal>" → RUANG TENGAH KOSONG (±18 mm untuk stempel/
  //    tanda tangan manual) → nama & jabatan. Hanya bagian tengah yang
  //    dikosongkan (permintaan revisi). ──
  const lebarTtd = 64.8;
  const pusatTtd = kanan - lebarTtd / 2;
  /** Jarak kosong antara "Boyolali, <tanggal>" dan nama+jabatan (stempel/ttd). */
  const RUANG_TTD = 26;
  const tinggiBlok = TINGGI_TTD + RUANG_TTD + TINGGI_TTD;
  if (y + 16 + tinggiBlok > BATAS_BAWAH) {
    doc.addPage();
    y = 60;
  } else {
    y += 16;
  }

  doc.text(`${PENANDATANGAN.kota}, ${tanggalPolos(s.tanggalSurat)}`, pusatTtd, y, { align: "center" });
  y += TINGGI_TTD + RUANG_TTD; // ruang tengah: sengaja kosong utk ttd
  doc.text(PENANDATANGAN.nama, pusatTtd, y, { align: "center" });
  // Nama digarisbawahi seperti judul, tetapi garisnya TIPIS (bukan tebal/bold):
  // 0,2 mm (≈0,57 pt — underline normal Word untuk teks 12 pt), gap 0,6 mm.
  const TEBAL_GARIS_NAMA = 0.2;
  const lebarNama = lebarRender(doc, PENANDATANGAN.nama);
  const yGarisNama = y + JARAK_UNDERLINE + TEBAL_GARIS_NAMA / 2;
  doc.setLineWidth(TEBAL_GARIS_NAMA);
  doc.line(pusatTtd - lebarNama / 2, yGarisNama, pusatTtd + lebarNama / 2, yGarisNama);
  y += TINGGI_TTD;
  doc.text(PENANDATANGAN.jabatan, pusatTtd, y, { align: "center" });

  // Footer alamat pabrik dari dokumen Word sengaja TIDAK dibuat (permintaan).

  const berkas = namaBerkasSurat(s);
  doc.save(berkas);
  return berkas;
}
