import pool from '../../config/database.js'
import { success, error } from '../../helpers/response.js'
import { sendExcel } from '../../helpers/excel.js'

/**
 * Setting Budget MPP + Proses MPP Bulanan — cerminan unit Delphi:
 *
 *   ufrmSettingBudgetMPP (`frmSettingBudgetMPP`)
 *     tbudgetmpp (bm_pab_kode, bm_tahun, bm_bagian, bm_tetap, bm_pkwt,
 *                 bm_casual, bm_pihak3)
 *   ufrmProsesMPPBulanan (`frmprosesMPPBulanan`)
 *     tmppbulanan (mpp_pab_kode, mpp_tahun, mpp_periode, mpp_bagian,
 *                  mpp_tetap, mpp_pkwt, mpp_casual, mpp_pihak3   = budget,
 *                  mpp_tetap2, mpp_pkwt2, mpp_casual2, mpp_pihak32 = realisasi)
 *
 * Kode status kerja (persis query Delphi):
 *   7=Tetap, 1..6=PKWT, 8=Casual, 9=Pihak ke-3; aktif kar_status_aktif=1.
 */

/**
 * Dua blok sub-select hitungan karyawan aktif, satu persis query Delphi:
 *
 *  - HITUNG_KARYAWAN (fallback loaddataall Setting Budget): barisnya
 *    `SELECT DISTINCT` baris tkaryawan, hitungan mencocokkan
 *    `kar_bagian + kar_jab_kode` baris tersebut.
 *  - HITUNG_BAGIAN (refreshdata3 Proses MPP): barisnya tbudgetmpp,
 *    hitungan mencocokkan `CONCAT(jab_nama,' ',kar_bagian) = bm_bagian`.
 *
 * Kedua blok memakai 5 param `[pabrik]`.
 */
const HITUNG_KARYAWAN = `
    (SELECT COUNT(*) FROM tkaryawan a
       WHERE a.kar_bagian = x.kar_bagian AND a.kar_jab_kode = x.kar_jab_kode
         AND a.kar_status_kerja = 7 AND a.kar_pab_kode = ? AND a.kar_status_aktif = 1) AS tetap,
    (SELECT COUNT(*) FROM tkaryawan a
       WHERE a.kar_bagian = x.kar_bagian AND a.kar_jab_kode = x.kar_jab_kode
         AND a.kar_status_kerja IN (1,2,3,4,5,6) AND a.kar_pab_kode = ? AND a.kar_status_aktif = 1) AS pkwt,
    (SELECT COUNT(*) FROM tkaryawan a
       WHERE a.kar_bagian = x.kar_bagian AND a.kar_jab_kode = x.kar_jab_kode
         AND a.kar_status_kerja = 8 AND a.kar_pab_kode = ? AND a.kar_status_aktif = 1) AS casual,
    (SELECT COUNT(*) FROM tkaryawan a
       WHERE a.kar_bagian = x.kar_bagian AND a.kar_jab_kode = x.kar_jab_kode
         AND a.kar_status_kerja = 9 AND a.kar_pab_kode = ? AND a.kar_status_aktif = 1) AS pihak3,
    (SELECT COUNT(*) FROM tkaryawan a
       WHERE a.kar_bagian = x.kar_bagian AND a.kar_jab_kode = x.kar_jab_kode
         AND a.kar_pab_kode = ? AND a.kar_status_aktif = 1) AS total`

const HITUNG_BAGIAN = `
    (SELECT COUNT(*) FROM tkaryawan a INNER JOIN tjabatan j ON j.jab_kode = a.kar_jab_kode
       WHERE CONCAT(j.jab_nama, ' ', a.kar_bagian) = x.bm_bagian
         AND a.kar_status_kerja = 7 AND a.kar_pab_kode = ? AND a.kar_status_aktif = 1) AS tetap,
    (SELECT COUNT(*) FROM tkaryawan a INNER JOIN tjabatan j ON j.jab_kode = a.kar_jab_kode
       WHERE CONCAT(j.jab_nama, ' ', a.kar_bagian) = x.bm_bagian
         AND a.kar_status_kerja IN (1,2,3,4,5,6) AND a.kar_pab_kode = ? AND a.kar_status_aktif = 1) AS pkwt,
    (SELECT COUNT(*) FROM tkaryawan a INNER JOIN tjabatan j ON j.jab_kode = a.kar_jab_kode
       WHERE CONCAT(j.jab_nama, ' ', a.kar_bagian) = x.bm_bagian
         AND a.kar_status_kerja = 8 AND a.kar_pab_kode = ? AND a.kar_status_aktif = 1) AS casual,
    (SELECT COUNT(*) FROM tkaryawan a INNER JOIN tjabatan j ON j.jab_kode = a.kar_jab_kode
       WHERE CONCAT(j.jab_nama, ' ', a.kar_bagian) = x.bm_bagian
         AND a.kar_status_kerja = 9 AND a.kar_pab_kode = ? AND a.kar_status_aktif = 1) AS pihak3,
    (SELECT COUNT(*) FROM tkaryawan a INNER JOIN tjabatan j ON j.jab_kode = a.kar_jab_kode
       WHERE CONCAT(j.jab_nama, ' ', a.kar_bagian) = x.bm_bagian
         AND a.kar_pab_kode = ? AND a.kar_status_aktif = 1) AS total`

function bacaPabrikTahun(req) {
    const pabrik = String(req.query.pabrik || '').trim()
    const tahun = parseInt(req.query.tahun, 10)
    if (!pabrik) return { err: 'Pabrik wajib dipilih' }
    if (!Number.isInteger(tahun) || tahun < 1990 || tahun > 2100) return { err: 'Tahun tidak valid' }
    return { pabrik, tahun }
}

const num = (v) => {
    if (v === null || v === undefined || v === '') return 0
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
}

/* ── Setting Budget MPP ────────────────────────────────────────────────── */

/**
 * loaddataall — bila tbudgetmpp untuk tahun itu sudah ada, tampilkan isinya;
 * bila belum, tampilkan jumlah karyawan aktif sekarang sebagai titik awal.
 */
export const getBudgetMPP = async (req, res, next) => {
    try {
        const cek = bacaPabrikTahun(req)
        if (cek.err) return error(res, cek.err, 400)
        const { pabrik, tahun } = cek

        const COLS = ['bagian', 'tetap', 'pkwt', 'casual', 'pihak3', 'total']
        if (req.query.export === 'xlsx') {
            const [rows] = await pool.query(
                `SELECT bm_bagian AS bagian, bm_tetap AS tetap, bm_pkwt AS pkwt, bm_casual AS casual,
                        bm_pihak3 AS pihak3, bm_tetap + bm_pkwt + bm_casual + bm_pihak3 AS total
                   FROM tbudgetmpp WHERE bm_pab_kode = ? AND bm_tahun = ? ORDER BY bm_bagian`,
                [pabrik, tahun]
            )
            return sendExcel(res, 'Setting Budget MPP', COLS, rows)
        }

        const [rows] = await pool.query(
            `SELECT bm_bagian AS bagian, bm_tetap AS tetap, bm_pkwt AS pkwt, bm_casual AS casual,
                    bm_pihak3 AS pihak3, bm_tetap + bm_pkwt + bm_casual + bm_pihak3 AS total
               FROM tbudgetmpp WHERE bm_pab_kode = ? AND bm_tahun = ? ORDER BY bm_bagian`,
            [pabrik, tahun]
        )
        if (rows.length) return success(res, { sumber: 'budget', rows })

        const [aktual] = await pool.query(
            `SELECT DISTINCT CONCAT(j.jab_nama, ' ', x.kar_bagian) AS bagian,
                    ${HITUNG_KARYAWAN}
               FROM tkaryawan x INNER JOIN tjabatan j ON j.jab_kode = x.kar_jab_kode
              WHERE x.kar_pab_kode = ? AND x.kar_status_aktif = 1
              ORDER BY bagian`,
            [pabrik, pabrik, pabrik, pabrik, pabrik, pabrik]
        )
        for (const r of aktual) r.total = num(r.tetap) + num(r.pkwt) + num(r.casual) + num(r.pihak3)
        success(res, { sumber: aktual.length ? 'aktual' : 'kosong', rows: aktual })
    } catch (err) {
        next(err)
    }
}

/** simpandata — hapus tahun+pabrik lalu sisipkan ulang tiap baris. */
export const saveBudgetMPP = async (req, res, next) => {
    try {
        const pabrik = String(req.body?.pabrik || '').trim()
        const tahun = parseInt(req.body?.tahun, 10)
        const rows = Array.isArray(req.body?.rows) ? req.body.rows : []
        if (!pabrik) return error(res, 'Pabrik wajib dipilih', 400)
        if (!Number.isInteger(tahun) || tahun < 1990 || tahun > 2100) return error(res, 'Tahun tidak valid', 400)
        if (!rows.length) return error(res, 'Tidak ada data untuk disimpan', 400)

        const conn = await pool.getConnection()
        let jml = 0
        try {
            await conn.beginTransaction()
            await conn.query('DELETE FROM tbudgetmpp WHERE bm_pab_kode = ? AND bm_tahun = ?', [pabrik, tahun])
            for (const r of rows) {
                const bagian = String(r?.bagian ?? '').trim()
                if (!bagian) continue
                await conn.query(
                    `INSERT INTO tbudgetmpp (bm_pab_kode, bm_tahun, bm_bagian, bm_tetap, bm_pkwt, bm_casual, bm_pihak3)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [pabrik, tahun, bagian, num(r.tetap), num(r.pkwt), num(r.casual), num(r.pihak3)]
                )
                jml += 1
            }
            await conn.commit()
        } catch (err) {
            await conn.rollback().catch(() => {})
            throw err
        } finally {
            conn.release()
        }
        success(res, { jumlah: jml }, `${jml} baris budget MPP tersimpan`)
    } catch (err) {
        next(err)
    }
}

/* ── Proses MPP Bulanan ────────────────────────────────────────────────── */

/**
 * refreshdata2 (?sumber=simpan) — data tmppbulanan yang tersimpan.
 * refreshdata3 (tanpa param)  — proses ulang dari tbudgetmpp + hitungan
 * karyawan aktif; `kurang` = total budget − jumlah karyawan aktif.
 */
export const getProsesMPP = async (req, res, next) => {
    try {
        const cek = bacaPabrikTahun(req)
        if (cek.err) return error(res, cek.err, 400)
        const { pabrik, tahun } = cek
        const periode = parseInt(req.query.periode, 10)
        if (!Number.isInteger(periode) || periode < 1 || periode > 12) return error(res, 'Bulan tidak valid', 400)

        const COLS = ['bagian', 'tetap', 'pkwt', 'casual', 'pihak3', 'totalbudget',
            'tetap2', 'pkwt2', 'casual2', 'pihak32', 'total2', 'kurang']
        if (req.query.export === 'xlsx' || String(req.query.sumber || '') === 'simpan') {
            const [rows] = await pool.query(
                `SELECT mpp_bagian AS bagian, mpp_tetap AS tetap, mpp_pkwt AS pkwt, mpp_casual AS casual,
                        mpp_pihak3 AS pihak3, mpp_pkwt + mpp_casual + mpp_tetap + mpp_pihak3 AS totalbudget,
                        mpp_tetap2, mpp_pkwt2, mpp_casual2, mpp_pihak32,
                        mpp_pkwt2 + mpp_casual2 + mpp_tetap2 + mpp_pihak32 AS total2,
                        (mpp_pkwt + mpp_casual + mpp_tetap + mpp_pihak3)
                            - (mpp_pkwt2 + mpp_casual2 + mpp_tetap2 + mpp_pihak32) AS kurang
                   FROM tmppbulanan
                  WHERE mpp_pab_kode = ? AND mpp_tahun = ? AND mpp_periode = ?
                  ORDER BY mpp_bagian`,
                [pabrik, tahun, periode]
            )
            if (req.query.export === 'xlsx') return sendExcel(res, 'Proses MPP Bulanan', COLS, rows)
            return success(res, { sumber: 'simpan', rows })
        }

        const [[adaBudget]] = await pool.query(
            'SELECT COUNT(*) AS n FROM tbudgetmpp WHERE bm_pab_kode = ? AND bm_tahun = ?',
            [pabrik, tahun]
        )
        if (!adaBudget.n) return error(res, 'Data budget belum ada', 400)

        const [rows] = await pool.query(
            `SELECT bm_bagian AS bagian,
                    bm_tetap + bm_pkwt + bm_casual + bm_pihak3 AS totalbudget,
                    ${HITUNG_BAGIAN}
               FROM tbudgetmpp x
              WHERE x.bm_pab_kode = ? AND x.bm_tahun = ?
              ORDER BY x.bm_bagian`,
            [pabrik, pabrik, pabrik, pabrik, pabrik, pabrik, tahun]
        )
        const hasil = rows
            .filter((r) => String(r.bagian || '').trim() !== '')
            .map((r) => ({
                bagian: r.bagian,
                tetap: num(r.tetap),
                pkwt: num(r.pkwt),
                casual: num(r.casual),
                pihak3: num(r.pihak3),
                totalbudget: num(r.totalbudget),
                tetap2: num(r.tetap),
                pkwt2: num(r.pkwt),
                casual2: num(r.casual),
                pihak32: num(r.pihak3),
                total2: num(r.total),
                kurang: num(r.totalbudget) - num(r.total),
            }))
        success(res, { sumber: 'proses', rows: hasil })
    } catch (err) {
        next(err)
    }
}

/** simpandata — hapus periode tersebut lalu sisipkan ulang baris non-kosong. */
export const saveProsesMPP = async (req, res, next) => {
    try {
        const pabrik = String(req.body?.pabrik || '').trim()
        const tahun = parseInt(req.body?.tahun, 10)
        const periode = parseInt(req.body?.periode, 10)
        const rows = Array.isArray(req.body?.rows) ? req.body.rows : []
        if (!pabrik) return error(res, 'Pabrik wajib dipilih', 400)
        if (!Number.isInteger(tahun) || tahun < 1990 || tahun > 2100) return error(res, 'Tahun tidak valid', 400)
        if (!Number.isInteger(periode) || periode < 1 || periode > 12) return error(res, 'Bulan tidak valid', 400)
        if (!rows.length) return error(res, 'Tidak ada data untuk disimpan', 400)

        const conn = await pool.getConnection()
        let jml = 0
        try {
            await conn.beginTransaction()
            await conn.query(
                'DELETE FROM tmppbulanan WHERE mpp_pab_kode = ? AND mpp_tahun = ? AND mpp_periode = ?',
                [pabrik, tahun, periode]
            )
            for (const r of rows) {
                const bagian = String(r?.bagian ?? '').trim()
                if (!bagian) continue
                await conn.query(
                    `INSERT INTO tmppbulanan (mpp_pab_kode, mpp_tahun, mpp_periode, mpp_bagian,
                        mpp_tetap, mpp_pkwt, mpp_casual, mpp_pihak3,
                        mpp_tetap2, mpp_pkwt2, mpp_casual2, mpp_pihak32)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [pabrik, tahun, periode, bagian,
                        num(r.tetap), num(r.pkwt), num(r.casual), num(r.pihak3),
                        num(r.tetap2), num(r.pkwt2), num(r.casual2), num(r.pihak32)]
                )
                jml += 1
            }
            await conn.commit()
        } catch (err) {
            await conn.rollback().catch(() => {})
            throw err
        } finally {
            conn.release()
        }
        success(res, { jumlah: jml }, `${jml} baris MPP bulan ${periode} tersimpan`)
    } catch (err) {
        next(err)
    }
}
