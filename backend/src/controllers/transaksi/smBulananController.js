import pool from '../../config/database.js'
import { success, error } from '../../helpers/response.js'
import { sendExcel } from '../../helpers/excel.js'

/**
 * Staff Movement Bulanan — cerminan ufrmProsesSMBulanan (`frmProsesSMBulanan`).
 *
 * refreshdata2 Delphi: baris dari tbudgetmpp (bm_pab_kode, bm_tahun,
 * bm_bagian); tiap kolom sub-select hitungan bulan berjalan:
 *
 *   - Baru      : tkaryawan (kar_tgl_masuk), CONCAT(jab_nama,' ',kar_bagian)
 *   - MutasiIn  : tmutasi sisi baru (mut_jab_kode2 + mut_bagian2,
 *                 mut_tanggal), pabrik = mut_pab_kode2
 *   - MutasiOut : tmutasi sisi lama (mut_jab_kode + mut_bagian), pabrik =
 *                 mut_pab_kode
 *   - keluar    : tkeluar + tkaryawan, berdasar kl_alasan; pabrik =
 *                 kar_pab_kode (Lain lain, Pindah ke perusahaan lain,
 *                 Melanjutkan study, Pensiun, Pemberhentian sementara,
 *                 Tidak lolos training, Kasus)
 *
 * `total` = baru + mutasiin; `total2` = jumlah pengurangan (8 alasan).
 * Kolom Masalah dengan Atasan / Rekan kerja tampil seperti grid Delphi
 * (tidak dihitung — tetap kosong) tapi tetap bisa diuji detailnya.
 * Form Delphi hanya baca; tidak ada penyimpanan.
 */

/** Nilai `kl_alasan` persis seperti teks di Delphi (LIKE `%...` pada detail). */
const KELUAR = {
    baru: null,
    mutasiin: null,
    mutasiout: null,
    pindah: 'Pindah ke perusahaan lain',
    study: 'Melanjutkan study',
    lainlain: 'Lain lain',
    tidaklolos: 'Tidak lolos training',
    sementara: 'Pemberhentian sementara',
    pensiun: 'Pensiun',
    kasus: 'Kasus',
    masalahatasan: 'Masalah dengan atasan',
    masalahrekan: 'Masalah dengan rekan kerja',
}

function bacaFilter(req) {
    const pabrik = String(req.query.pabrik || '').trim()
    const tahun = parseInt(req.query.tahun, 10)
    const bulan = parseInt(req.query.bulan, 10)
    if (!pabrik) return { err: 'Pabrik wajib dipilih' }
    if (!Number.isInteger(tahun) || tahun < 1990 || tahun > 2100) return { err: 'Tahun tidak valid' }
    if (!Number.isInteger(bulan) || bulan < 1 || bulan > 12) return { err: 'Bulan tidak valid' }
    return { pabrik, tahun, bulan }
}

/** refreshdata2 — rekap movement per bagian per bulan dari tbudgetmpp. */
export const getProsesSMBulanan = async (req, res, next) => {
    try {
        const cek = bacaFilter(req)
        if (cek.err) return error(res, cek.err, 400)
        const { pabrik, tahun, bulan } = cek

        const { sumber, rows } = await muatRekap(pabrik, tahun, bulan)

        const COLS = ['bagian', 'baru', 'mutasiin', 'total', 'pindah', 'study', 'lainlain',
            'mutasiout', 'tidaklolos', 'sementara', 'pensiun', 'kasus',
            'masalahatasan', 'masalahrekan', 'total2']
        if (req.query.export === 'xlsx') {
            return sendExcel(res, 'Staff Movement Bulanan', COLS, rows, { numericColumns: COLS.slice(1) })
        }
        success(res, { sumber, rows })
    } catch (err) {
        next(err)
    }
}

/**
 * Sumber baris bagian:
 *  - 'budget' : tbudgetmpp tahun+pabrik (persis Delphi). Kolom angka tetap
 *               tampil untuk bagian ber-budget walaupun movement-nya nol.
 *  - 'mutasi' : budget tahun itu belum diisi — daftar bagian diambil dari
 *               movement bulan tsb (karyawan baru, mutasi in/out, keluar),
 *               supaya rekap tetap terlihat tanpa Setting Budget MPP.
 */
export async function muatRekap(pabrik, tahun, bulan) {
    let [rows] = await pool.query(queryRekap(SUMBER_BUDGET), paramsRekap(pabrik, tahun, bulan, [pabrik, tahun]))
    if (!rows.length) {
        ;[rows] = await pool.query(queryRekap(SUMBER_MUTASI), paramsRekap(pabrik, tahun, bulan,
            [pabrik, bulan, tahun, pabrik, bulan, tahun, pabrik, bulan, tahun, pabrik, bulan, tahun]))
        return { sumber: 'mutasi', rows: rows.map(hitungTotal) || [] }
    }
    return { sumber: 'budget', rows: rows.map(hitungTotal) }
}

/** total & total2 dihitung di aplikasi, persis penjumlahan CDSLembur Delphi. */
const num = (v) => {
    if (v === null || v === undefined || v === '') return 0
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
}

const hitungTotal = (r) => ({
    ...r,
    total: num(r.baru) + num(r.mutasiin),
    total2: ['pindah', 'study', 'lainlain', 'mutasiout', 'tidaklolos', 'sementara', 'pensiun', 'kasus']
        .reduce((sum, k) => sum + num(r[k]), 0),
})

const hitungKaryawan = (kolomTanggal) => `
        (SELECT COUNT(*) FROM tkaryawan k INNER JOIN tjabatan j ON j.jab_kode = k.kar_jab_kode
           WHERE CONCAT(j.jab_nama, ' ', k.kar_bagian) = x.bagian
             AND MONTH(k.${kolomTanggal}) = ? AND YEAR(k.${kolomTanggal}) = ?
             AND k.kar_pab_kode = ?)`

const hitungMutasi = (sisiBaru) => sisiBaru
    ? `
        (SELECT COUNT(*) FROM tmutasi m INNER JOIN tjabatan j ON j.jab_kode = m.mut_jab_kode2
           WHERE CONCAT(j.jab_nama, ' ', m.mut_bagian2) = x.bagian
             AND MONTH(m.mut_tanggal) = ? AND YEAR(m.mut_tanggal) = ?
             AND m.mut_pab_kode2 = ?)`
    : `
        (SELECT COUNT(*) FROM tmutasi m INNER JOIN tjabatan j ON j.jab_kode = m.mut_jab_kode
           WHERE CONCAT(j.jab_nama, ' ', m.mut_bagian) = x.bagian
             AND MONTH(m.mut_tanggal) = ? AND YEAR(m.mut_tanggal) = ?
             AND m.mut_pab_kode = ?)`

const hitungKeluar = (alasan) => `
        (SELECT COUNT(*) FROM tkeluar kl INNER JOIN tkaryawan k ON k.kar_nik = kl.kl_nik
           INNER JOIN tjabatan j ON j.jab_kode = k.kar_jab_kode
          WHERE CONCAT(j.jab_nama, ' ', k.kar_bagian) = x.bagian
            AND MONTH(kl.kl_tanggal) = ? AND YEAR(kl.kl_tanggal) = ?
            AND k.kar_pab_kode = ?
            AND kl.kl_alasan LIKE ?)`

/** tbudgetmpp tahun+pabrik — sumber baris bawaan (persis Delphi). */
const SUMBER_BUDGET = `(SELECT bm_bagian AS bagian FROM tbudgetmpp
             WHERE bm_pab_kode = ? AND bm_tahun = ? AND bm_bagian <> '') x`

/** Fallback: union semua bagian yang kena movement pada bulan tsb. */
const SUMBER_MUTASI = `(SELECT CONCAT(j.jab_nama, ' ', k.kar_bagian) AS bagian
             FROM tkaryawan k INNER JOIN tjabatan j ON j.jab_kode = k.kar_jab_kode
            WHERE k.kar_pab_kode = ?
              AND MONTH(k.kar_tgl_masuk) = ? AND YEAR(k.kar_tgl_masuk) = ?
              AND k.kar_status_aktif = 1
             UNION
            SELECT CONCAT(j.jab_nama, ' ', m.mut_bagian2)
              FROM tmutasi m INNER JOIN tjabatan j ON j.jab_kode = m.mut_jab_kode2
             WHERE m.mut_pab_kode2 = ?
               AND MONTH(m.mut_tanggal) = ? AND YEAR(m.mut_tanggal) = ?
             UNION
            SELECT CONCAT(j.jab_nama, ' ', m.mut_bagian)
              FROM tmutasi m INNER JOIN tjabatan j ON j.jab_kode = m.mut_jab_kode
             WHERE m.mut_pab_kode = ?
               AND MONTH(m.mut_tanggal) = ? AND YEAR(m.mut_tanggal) = ?
             UNION
            SELECT CONCAT(j.jab_nama, ' ', k.kar_bagian)
              FROM tkeluar kl INNER JOIN tkaryawan k ON k.kar_nik = kl.kl_nik
                INNER JOIN tjabatan j ON j.jab_kode = k.kar_jab_kode
             WHERE k.kar_pab_kode = ?
               AND MONTH(kl.kl_tanggal) = ? AND YEAR(kl.kl_tanggal) = ?) x`

function queryRekap(sumberBagian) {
    return `SELECT x.bagian AS bagian,${hitungKaryawan('kar_tgl_masuk')} AS baru,${hitungMutasi(true)} AS mutasiin,${hitungMutasi(false)} AS mutasiout${
        Object.entries(KELUAR)
            .filter(([k, a]) => a)
            .map(([k, a]) => `,${hitungKeluar(a)} AS ${k}`)
            .join('')
    }
          FROM ${sumberBagian}
          ORDER BY x.bagian`
}

/** Param sub-select hitung (urut sesuai SELECT) + param sumber bagian di akhir. */
function paramsRekap(pabrik, tahun, bulan, sumberParams) {
    const params = []
    for (const key of Object.keys(KELUAR)) {
        if (key === 'baru') params.push(bulan, tahun, pabrik)
        else if (key === 'mutasiin') params.push(bulan, tahun, pabrik)
        else if (key === 'mutasiout') params.push(bulan, tahun, pabrik)
        else params.push(bulan, tahun, pabrik, `${KELUAR[key]}%`)
    }
    params.push(...sumberParams)
    return params
}

/**
 * LihatDetail — daftar NIK/Nama/Tanggal di balik sebuah sel.
 * Param: pabrik, tahun, bulan (1..12), bagian, kolom (mis. `ketidakhadiran`).
 */
export const getDetailSMBulanan = async (req, res, next) => {
    try {
        const cek = bacaFilter(req)
        if (cek.err) return error(res, cek.err, 400)
        const { pabrik, tahun, bulan } = cek
        const bagian = String(req.query.bagian || '').trim()
        const kolom = String(req.query.kolom || '').trim()
        if (!bagian) return error(res, 'Bagian wajib dipilih', 400)
        if (!KELUAR.hasOwnProperty(kolom)) return error(res, 'Kolom tidak dikenal', 400)

        let sql
        const p = [bulan, tahun]
        if (kolom === 'baru') {
            // Band 'Karyawan Baru': karyawan dengan tanggal masuk pada bulan itu.
            sql = `SELECT k.kar_nik AS nik, k.kar_nama AS nama, k.kar_tgl_masuk AS tanggal
                 FROM tkaryawan k INNER JOIN tjabatan j ON j.jab_kode = k.kar_jab_kode
                WHERE MONTH(k.kar_tgl_masuk) = ? AND YEAR(k.kar_tgl_masuk) = ?
                  AND k.kar_pab_kode = ?
                  AND CONCAT(j.jab_nama, ' ', k.kar_bagian) = ?
                ORDER BY k.kar_tgl_masuk, k.kar_nik`
            p.push(pabrik, bagian)
        } else if (kolom === 'mutasiin' || kolom === 'mutasiout') {
            const baru = kolom === 'mutasiin'
            sql = `SELECT m.mut_nik AS nik, k.kar_nama AS nama, m.mut_tanggal AS tanggal
                 FROM tmutasi m INNER JOIN tkaryawan k ON k.kar_nik = m.mut_nik
                   INNER JOIN tjabatan j ON j.jab_kode = ${baru ? 'm.mut_jab_kode2' : 'm.mut_jab_kode'}
                WHERE MONTH(m.mut_tanggal) = ? AND YEAR(m.mut_tanggal) = ?
                  AND ${baru ? 'm.mut_pab_kode2 = ?' : 'm.mut_pab_kode = ?'}
                  AND CONCAT(j.jab_nama, ' ', ${baru ? 'm.mut_bagian2' : 'm.mut_bagian'}) = ?
                ORDER BY m.mut_tanggal, m.mut_nik`
            p.push(pabrik, bagian)
        } else {
            sql = `SELECT kl.kl_nik AS nik, k.kar_nama AS nama, kl.kl_tanggal AS tanggal
                 FROM tkeluar kl INNER JOIN tkaryawan k ON k.kar_nik = kl.kl_nik
                   INNER JOIN tjabatan j ON j.jab_kode = k.kar_jab_kode
                WHERE MONTH(kl.kl_tanggal) = ? AND YEAR(kl.kl_tanggal) = ?
                  AND k.kar_pab_kode = ?
                  AND CONCAT(j.jab_nama, ' ', k.kar_bagian) = ?
                  AND kl.kl_alasan LIKE ?
                ORDER BY kl.kl_tanggal, kl.kl_nik`
            p.push(pabrik, bagian, `${KELUAR[kolom]}%`)
        }

        const [rows] = await pool.query(sql, p)
        success(res, { kolom, bagian, jumlah: rows.length, rows })
    } catch (err) {
        next(err)
    }
}
