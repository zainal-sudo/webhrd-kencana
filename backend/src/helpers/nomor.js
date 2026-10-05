import pool from '../config/database.js'

/**
 * Pembuat nomor dokumen — meniru algoritma Delphi HRD agar nomor yang dibuat
 * oleh aplikasi web tidak bentrok dengan nomor yang sudah dibuat aplikasi Delphi.
 *
 * Dua pola yang dipakai program Delphi:
 *
 *  1. Pola "prefix.yyyymm.urut4"  (contoh: IJN.202301.0001, KEL.202609.0015)
 *     Delphi: select max(right(kolom,4)) from tabel where kolom like 'PRE.YYYYMM.%'
 *
 *  2. Pola "urut3/HRD/.../MM/YY"  (contoh: 131/HRD/PKAR/09/2026)
 *     Delphi: select max(left(kolom,3)) from tabel where year(tanggal)=YYYY
 */

const pad = (n, len) => String(n).padStart(len, '0')

/** yyyymm dari tanggal (default hari ini) */
export function yyyymm(dateStr) {
    const d = dateStr ? new Date(dateStr) : new Date()
    return `${d.getFullYear()}${pad(d.getMonth() + 1, 2)}`
}

/** mm / yy / yyyy dari tanggal */
export function mm(dateStr) {
    const d = dateStr ? new Date(dateStr) : new Date()
    return pad(d.getMonth() + 1, 2)
}
export function yy(dateStr) {
    const d = dateStr ? new Date(dateStr) : new Date()
    return pad(d.getFullYear() % 100, 2)
}
export function yyyy(dateStr) {
    const d = dateStr ? new Date(dateStr) : new Date()
    return String(d.getFullYear())
}

/**
 * Nomor berpola "PREFIX.yyyymm.urut" — increment per bulan.
 * @param {{ table: string, column: string, prefix: string }} opt
 * @param {string} [tanggal] tanggal acuan (default hari ini)
 * @returns {Promise<string>} mis. "IJN.202301.0002"
 */
export async function nomorBulanan({ table, column, prefix }, tanggal) {
    const per = yyyymm(tanggal)
    const like = `${prefix}.${per}.%`
    const [rows] = await pool.query(
        `SELECT MAX(RIGHT(\`${column}\`, 4)) AS m FROM \`${table}\` WHERE \`${column}\` LIKE ?`,
        [like]
    )
    const maxVal = rows[0]?.m ? parseInt(rows[0].m, 10) : 0
    return `${prefix}.${per}.${pad(maxVal + 1, 4)}`
}

/**
 * Nomor berpola "urut/HRD/.../MM/YY" — increment per tahun.
 * @param {{ table: string, column: string, dateColumn: string, template: string }} opt
 *   template memakai token {seq} {mm} {yy} {yyyy} contoh: '{seq}/HRD/PKAR/{mm}/{yyyy}'
 * @param {string} [tanggal]
 */
export async function nomorTahunan({ table, column, dateColumn, template }, tanggal) {
    const th = yyyy(tanggal)
    const [rows] = await pool.query(
        `SELECT MAX(LEFT(\`${column}\`, 3)) AS m FROM \`${table}\` WHERE YEAR(\`${dateColumn}\`) = ?`,
        [th]
    )
    const maxVal = rows[0]?.m ? parseInt(rows[0].m, 10) : 0
    return template
        .replace('{seq}', pad(maxVal + 1, 3))
        .replace('{mm}', mm(tanggal))
        .replace('{yy}', yy(tanggal))
        .replace('{yyyy}', th)
}

/**
 * NIK karyawan: 2 digit kode pabrik + mmyy + 4 digit urut (meniru Delphi).
 * @param {string} pabKode kode pabrik, mis. "P01"
 */
export async function nomorNik(pabKode, tanggal) {
    const [rows] = await pool.query('SELECT MAX(RIGHT(kar_Nik, 4)) AS m FROM tkaryawan')
    const maxVal = rows[0]?.m ? parseInt(rows[0].m, 10) : 0
    const d = tanggal ? new Date(tanggal) : new Date()
    const pab = String(pabKode || '00').substring(1, 3).padStart(2, '0')
    const mmyy = `${pad(d.getMonth() + 1, 2)}${yy(tanggal)}`
    return `${pab}${mmyy}${pad(maxVal + 1, 4)}`
}

/** Kode absensi (numerik, unik, dipakai mesin absensi) */
export async function nomorKodeAbsensi() {
    const [rows] = await pool.query('SELECT MAX(FLOOR(kar_kode_absensi)) AS m FROM tkaryawan')
    const maxVal = rows[0]?.m ? parseInt(rows[0].m, 10) : 0
    return String(maxVal + 1)
}