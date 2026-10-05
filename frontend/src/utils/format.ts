export function formatDateToSql(d: Date | string | null): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatDateInput(d?: string | Date | null): string {
  if (!d) return "";
  return formatDateToSql(d);
}

export function todaySql(): string {
  return formatDateToSql(new Date());
}

export function firstDayOfMonth(offsetMonths = 0): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offsetMonths);
  return formatDateToSql(d);
}

export function nonNullable(value: any): any {
  return value === null || value === undefined ? "" : value;
}

export function formatNumber(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === "") return "";
  const num = Number(n);
  if (isNaN(num)) return String(n);
  return num.toLocaleString("id-ID");
}

export function parseDateOnly(sql: string | null): Date | null {
  if (!sql) return null;
  const d = new Date(sql);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Format tanggal SQL (`YYYY-MM-DD`, bisa diikuti waktu) menjadi `DD MMM YYYY`
 * versi Indonesia. Nilai kosong menghasilkan string kosong — bukan "-", supaya
 * sel tabel browse tetap rapat.
 */
export function formatTanggal(sql: string | Date | null | undefined): string {
  const d = toLocalDate(sql);
  if (!d) return "";
  const bulan = [
    "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
    "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
  ];
  const day = String(d.getDate()).padStart(2, "0");
  return `${day} ${bulan[d.getMonth()]} ${d.getFullYear()}`;
}

/** Versi formatTanggal dengan placeholder untuk sel yang tidak terisi. */
export function formatTanggalOr(sql: string | Date | null | undefined, fallback = "-"): string {
  return formatTanggal(sql) || fallback;
}

export interface MasaKerja {
  tahun: number;
  bulan: number;
  hari: number;
}

/**
 * Ubah input tanggal (string SQL / Date) menjadi Date tengah malam waktu
 * lokal. Sengaja TIDAK memakai `new Date("YYYY-MM-DD")` karena string
 * tersebut di-parse sebagai UTC, sedangkan getFullYear()/getDate() membaca
 * waktu lokal -> tanggal bisa bergeser 1 hari di zona waktu negatif.
 */
function toLocalDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const text = String(value).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(text);
  if (isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Hitung masa kerja (tahun/bulan/hari) dengan aritmetika kalender.
 *
 * Selisih bulan dihitung penuh, lalu dikurangi 1 bila tanggal hari ini
 * belum melewati tanggal masuk pada bulan berjalan. Sisa hari =
 * selisih hari dari tanggal anniversary.
 * Contoh: masuk 2025-01-10, hari ini 2025-10-20 -> 0 thn 9 bln 10 hr.
 */
export function hitungMasaKerja(
  mulai: string | Date | null | undefined,
  selesai: string | Date | null | undefined = null
): MasaKerja | null {
  const start = toLocalDate(mulai);
  if (!start) return null;
  const end = toLocalDate(selesai) || toLocalDate(new Date());
  if (!end) return null;
  if (end.getTime() < start.getTime()) return { tahun: 0, bulan: 0, hari: 0 };

  let totalBulan =
    (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end.getDate() < start.getDate()) totalBulan -= 1;
  if (totalBulan < 0) totalBulan = 0;

  // Tanggal anniversary, dijepit ke akhir bulan bila tanggal masuk > jumlah
  // hari bulan tujuan (mis. 31 Jan + 1 bln -> 28/29 Feb).
  const anchor = new Date(start.getFullYear(), start.getMonth() + totalBulan, 1);
  const lastDay = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
  anchor.setDate(Math.min(start.getDate(), lastDay));

  return {
    tahun: Math.floor(totalBulan / 12),
    bulan: totalBulan % 12,
    // Math.round aman terhadap pergeseran DST (±1 jam).
    hari: Math.round((end.getTime() - anchor.getTime()) / 86400000),
  };
}

/** Format "0 thn 9 bln 10 hr" — mengikuti format laporan Kontrak. */
export function formatMasaKerja(
  mulai: string | Date | null | undefined,
  selesai: string | Date | null | undefined = null
): string {
  const m = hitungMasaKerja(mulai, selesai);
  if (!m) return "";
  return `${m.tahun} thn ${m.bulan} bln ${m.hari} hr`;
}