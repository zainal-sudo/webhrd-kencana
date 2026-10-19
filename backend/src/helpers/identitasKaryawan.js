/**
 * Utilitas pencocokan No. Identitas (KTP/SIM) pada Master Karyawan.
 *
 * Aturan penting:
 * - Normalisasi HANYA dipakai untuk perbandingan/pencocokan.
 *   Nilai yang dikirim ke database TIDAK BOLEH dinormalisasi.
 * - Data legacy memang mengandung kotoran tertentu: suffix rehire
 *   trailing seperti "3309... (2)" dan kurung pembungkus "(3309...)".
 *   Hanya kotoran itulah yang diabaikan — pembersihan dilakukan
 *   konservatif agar tidak memunculkan false positive.
 */

/** Suffix rehire trailing yang terdeteksi di data: (1), (2), (3). */
const SUFFIX_REHIRE = /\s*\(\d{1,2}\)\s*$/;

/**
 * Normalisasi konservatif untuk PERBANDINGAN saja.
 * @param {unknown} nilai nilai mentah dari user/database
 * @returns {string} nilai untuk pencocokan; tidak pernah mengubah input
 */
export function normalisasiIdentitas(nilai) {
    const s = String(nilai ?? '').trim();
    if (!s) return '';
    // 1. Abaikan suffix rehire trailing " (2)"/"(2)" bila masih ada nomor sisanya.
    const tanpaSuffix = s.replace(SUFFIX_REHIRE, '').trim();
    let hasil = tanpaSuffix || s;
    // 2. Abaikan kurung yang membungkus SELURUH nomor, bukan bagian di dalamnya.
    if (hasil.length > 2 && hasil.startsWith('(') && hasil.endsWith(')')) {
        hasil = hasil.slice(1, -1).trim();
    }
    return hasil;
}

/**
 * Kandidat nilai untuk dicocokkan persis (exact) ke database.
 * Urutan: nilai mentah (trim) lebih dulu, baru hasil normalisasi.
 * @returns {string[]} kandidat unik dan tidak kosong
 */
export function kandidatIdentitas(nilai) {
    const exact = String(nilai ?? '').trim();
    const norm = normalisasiIdentitas(nilai);
    return [...new Set([exact, norm].filter(Boolean))];
}

/**
 * Pola REGEXP (gaya MySQL) untuk fallback pencocokan normalisasi.
 * Mengabaikan spasi luar, kurung pembungkus, dan suffix rehire trailing.
 * Fallback hanya dipakai bila pencocokan exact tidak menemukan apa pun.
 * @param {unknown} nilai
 * @returns {string|null} pola atau null bila tidak ada nilai
 */
export function polaIdentitasLegacy(nilai) {
    const norm = normalisasiIdentitas(nilai);
    if (!norm) return null;
    const esc = norm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return `^[[:space:]]*\\(?[[:space:]]*${esc}[[:space:]]*\\)?[[:space:]]*(\\([[:space:]]*[0-9]{1,2}[[:space:]]*\\))?[[:space:]]*$`;
}
