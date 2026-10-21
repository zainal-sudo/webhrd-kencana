// Util halaman Eksekusi PKWT — dibangun mengikuti prototipe "hr kontrak.html".
// Pesan WA hanya ditampilkan di WhatsApp Web/aplikasi; TIDAK ada backend
// pengirim dan TIDAK ada nomor di URL — HR memilih penerima sendiri.

/** Link form penilaian (konfigurasi per prototipe `hr kontrak.html`). */
export const LINK_TANPA_BAWAHAN = "https://peniliantanpabawahan.netlify.app/";
export const LINK_DENGAN_BAWAHAN = "https://penilaiankaryawandenganbawahan.netlify.app/";

/** Baris daftar Eksekusi PKWT (dari `GET /dashboard/eksekusi-pkwt`). */
export interface EksekusiRow {
  Nik: string;
  Nama: string;
  Jabatan: string | null;
  Status_PKWT: string | null;
  Bagian: string | null;
  Pabrik: string | null;
  Tgl_Mulai: string | null;
  Tgl_Berakhir: string | null;
  Sisa_Hari: number;
}

/** Aturan prototipe: OPERATOR/STAF menilai tanpa bawahan, lainnya dengan bawahan. */
export function getLinkPenilaian(jabatan: string | null | undefined): string {
  const jabatanUpper = String(jabatan || "").trim().toUpperCase();
  if (jabatanUpper === "OPERATOR" || jabatanUpper === "STAF") return LINK_TANPA_BAWAHAN;
  return LINK_DENGAN_BAWAHAN;
}

/** "YYYY-MM-DD" dari DB (dateStrings) → objek Date lokal tanpa geser zona. */
function parseTgl(str: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(str || ""));
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function tglDdmmyyyy(d: Date): string {
  const hari = String(d.getDate()).padStart(2, "0");
  const bulan = String(d.getMonth() + 1).padStart(2, "0");
  return `${hari}/${bulan}/${d.getFullYear()}`;
}

/** Tanggal berakhir dalam dd/mm/yyyy — tahun aneh (mis. 1899) tetap apa adanya. */
export function formatTglBerakhir(str: string | null | undefined): string {
  const d = parseTgl(str);
  return d ? tglDdmmyyyy(d) : String(str || "-");
}

/** Form kontrak dikirim HR 3 hari setelah tanggal akhir (aturan prototipe H+3). */
export function formatHPlus3(str: string | null | undefined): string {
  const d = parseTgl(str);
  if (!d) return "-";
  d.setDate(d.getDate() + 3);
  return tglDdmmyyyy(d);
}

/** Label badge sesuai `getStatusText` prototipe. */
export function statusBerakhir(sisaHari: number | null | undefined): string {
  const diff = Number(sisaHari ?? 0);
  if (diff < 0) return "Berakhir";
  if (diff <= 7) return "Segera!";
  if (diff <= 30) return "Akan habis";
  return "Aman";
}

/** Teks sisa hari di kolom tabel: negatif ditulis 0 seperti prototipe. */
export function sisaHariTeks(sisaHari: number | null | undefined): string {
  const diff = Number(sisaHari ?? 0);
  return String(diff >= 0 ? diff : 0);
}

/** Teks sisa hari di pesan WA, sesuai prototipe. */
export function sisaHariPesan(sisaHari: number | null | undefined): string {
  const diff = Number(sisaHari ?? 0);
  return diff >= 0 ? `${diff} hari lagi` : "Sudah berakhir";
}

const kosong = (v: string | null | undefined) => String(v || "-").trim() || "-";

/** Rangka pesan WA per karyawan — teks prototipe dipertahankan apa adanya. */
export function buatPesanWa(row: EksekusiRow): string {
  const jabatan = kosong(row.Jabatan);
  return `*HR Kontrak - Notifikasi PKWT*

Kepada Yth. Atasan

Karyawan: ${kosong(row.Nama)}
Jabatan: ${jabatan}
Bagian: ${kosong(row.Bagian)}
Status: ${kosong(row.Status_PKWT)}
Kontrak berakhir: ${formatTglBerakhir(row.Tgl_Berakhir)} (${sisaHariPesan(row.Sisa_Hari)})

Mohon segera lakukan evaluasi dan penilaian kinerja karyawan melalui metode berikut:
1. ${getLinkPenilaian(jabatan)}
2. Form penilaian prestasi kerja (yang akan dikirimkan HR pada tanggal ${formatHPlus3(row.Tgl_Berakhir)})

☝️ Silahkan pilih salah satu form penilaian di atas. ☝️

Ketentuan:
1. Apabila menggunakan link (pilihan no 1) hasil dikirimkan ke Karyawan Ybs untuk di tandatangani, lalu di kirim balik ke atasan/ leader
2. Leader TTD pada PDF lalu di kirimkan ke SPV untuk ditandatangani oleh SPV
3. SPV TTD pada PDF lalu di kirimkan ke Manager
4. Manager berhak merevisi penilaian dari atasan jika tidak sesuai (menggunakan edit PDF)
5. Jika Manager sudah approve maka harus TTD di PDF, lalu hasilnya di kirimkan ke HR bersangkutan
--
HR Departemen`;
}

/**
 * Buka WhatsApp Web dengan pesan terisi — TANPA nomor penerima
 * (`wa.me/?text=...`); HR memilih kontak sendiri, tidak ada pengiriman daring.
 */
export function kirimWa(row: EksekusiRow): void {
  const url = `https://wa.me/?text=${encodeURIComponent(buatPesanWa(row))}`;
  window.open(url, "_blank", "noopener");
}
