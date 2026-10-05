/** Utilitas jam — mencerminkan bentuk data di Delphi (TcxTimeEdit) & kolom `time` MySQL. */

/**
 * Normalisasi input jam menjadi "HH:MM:SS".
 * Menerima "8:5", "08:05", "08:05:00", "080500", "0805", atau objek Date.
 * Nilai kosong menjadi "00:00:00" — sama dengan default program Delphi.
 */
export function normJam(v: string | number | Date | null | undefined): string {
  if (v === null || v === undefined) return "00:00:00";
  if (v instanceof Date) return jamDariDate(v);
  const s = String(v).trim();
  if (s === "") return "00:00:00";

  if (/^\d{1,2}:\d{1,2}(:\d{1,2})?$/.test(s)) {
    const [h, m, d] = s.split(":");
    return `${p2(h)}:${p2(m)}:${p2(d ?? 0)}`;
  }
  if (/^\d{6}$/.test(s)) return `${s.slice(0, 2)}:${s.slice(2, 4)}:${s.slice(4, 6)}`;
  if (/^\d{1,8}$/.test(s)) {
    if (s.length <= 2) return `${p2(s)}:00:00`;
    if (s.length <= 4) return `${p2(s.slice(0, -2))}:${p2(s.slice(-2))}:00`;
    return `${p2(s.slice(0, -4))}:${p2(s.slice(-4, -2))}:${p2(s.slice(-2))}`;
  }
  return s;
}

/**
 * Nilai kolom `time` MySQL bisa sampai ke driver sebagai objek Date (zona waktu
 * lokal) atau string "HH:MM:SS". Keduanya dinormalkan ke "HH:MM:SS".
 */
export function jamDariDate(d: Date): string {
  if (isNaN(d.getTime())) return "00:00:00";
  return `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
}

/** Jumlah hari antara tanggal acuan dan hari ini (DATEDIFF(NOW(), tgl)). */
export function selisihHari(tanggal: string | Date | null | undefined): number {
  if (!tanggal) return 0;
  const d = tanggal instanceof Date ? tanggal : new Date(String(tanggal).slice(0, 10));
  if (isNaN(d.getTime())) return 0;
  const now = new Date();
  const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((b - a) / 86400000);
}

function p2(x: string | number): string {
  return String(x).padStart(2, "0");
}