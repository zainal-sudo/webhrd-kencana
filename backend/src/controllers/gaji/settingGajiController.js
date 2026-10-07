import pool from '../../config/database.js'
import { success, error } from '../../helpers/response.js'
import { sendExcel } from '../../helpers/excel.js'

/**
 * Setting Gaji — cerminan unit Delphi `ufrmSettingGaji` (`frmSettingGaji`).
 *
 * Grid menampilkan karyawan aktif ber-sistem gaji Harian/Bulanan pada satu
 * pabrik; kolomnya persis `loaddataall` di Delphi. Simpan (`simpandata`)
 * menyalin tiap baris ke kolom tunjangan pada `tkaryawan`.
 *
 *   GET  /gaji/setting?pabrik=P01[&search=..&export=xlsx]
 *   PUT  /gaji/setting   body: { rows: [ { nik, gapok, premi, ... } ] }
 */

const SELECT_SQL = `SELECT k.kar_nik AS nik,
    k.kar_nama AS nama,
    IFNULL(j.jab_nama, '') AS jabatan,
    k.kar_gapok AS gapok,
    k.kar_t_hadir AS premi,
    IFNULL(k.kar_status_premi, 0) AS status_premi,
    k.kar_t_makan AS makan,
    k.kar_t_jabatan AS tjabatan,
    k.kar_t_lain AS lain,
    k.kar_t_transport AS transport,
    k.kar_t_bpjs AS bpjs
  FROM tkaryawan k
  LEFT JOIN tjabatan j ON j.jab_kode = k.kar_jab_kode`

/** Kolom grid sesuai urutan `ufrmSettingGaji.dfm`. */
const COLUMNS = ['nik', 'nama', 'jabatan', 'gapok', 'premi', 'status_premi', 'makan', 'tjabatan', 'lain', 'transport', 'bpjs']

function baseWhere(req) {
    const pabrik = String(req.query.pabrik || '').trim()
    if (!pabrik) return null

    let where = ` WHERE k.kar_pab_kode = ?
        AND k.kar_status_aktif = 1
        AND k.kar_sistem_gaji IN ('Harian','Bulanan')`
    const params = [pabrik]

    const search = String(req.query.search || '').trim()
    if (search) {
        where += ' AND (k.kar_nik LIKE ? OR k.kar_nama LIKE ? OR IFNULL(j.jab_nama,\'\') LIKE ?)'
        params.push(`%${search}%`, `%${search}%`, `%${search}%`)
    }
    return [where, params]
}

/** loaddataall + ExportGridToExcel. */
export const getSettingGajiList = async (req, res, next) => {
    try {
        const scope = baseWhere(req)
        if (!scope) return error(res, 'Pabrik wajib dipilih', 400)
        const [where, params] = scope

        if (req.query.export === 'xlsx') {
            const [rows] = await pool.query(`${SELECT_SQL}${where} ORDER BY k.kar_nik`, params)
            return sendExcel(res, 'Setting Gaji', COLUMNS, rows)
        }

        const [rows] = await pool.query(`${SELECT_SQL}${where} ORDER BY k.kar_nik`, params)
        success(res, rows, 'Success', 200)
    } catch (err) {
        next(err)
    }
}

const num = (v) => {
    if (v === null || v === undefined || v === '') return 0
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
}

/**
 * simpandata — satu UPDATE `tkaryawan` per baris, dalam satu transaksi
 * (Delphi mengeksekusi daftar statement lalu commit sekali di akhir).
 */
export const saveSettingGaji = async (req, res, next) => {
    try {
        const rows = Array.isArray(req.body?.rows) ? req.body.rows : null
        if (!rows || rows.length === 0) return error(res, 'Tidak ada data untuk disimpan', 400)

        const conn = await pool.getConnection()
        let jml = 0
        try {
            await conn.beginTransaction()
            for (const r of rows) {
                const nik = String(r?.nik ?? '').trim()
                if (!nik) continue
                await conn.query(
                    `UPDATE tkaryawan SET
                        kar_gapok = ?, kar_t_makan = ?, kar_t_hadir = ?,
                        kar_status_premi = ?, kar_t_jabatan = ?, kar_t_lain = ?,
                        kar_t_transport = ?, kar_t_bpjs = ?
                     WHERE kar_nik = ?`,
                    [
                        num(r.gapok),
                        num(r.makan),
                        num(r.premi),
                        num(r.status_premi),
                        num(r.tjabatan),
                        num(r.lain),
                        num(r.transport),
                        num(r.bpjs),
                        nik,
                    ]
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

        success(res, { jumlah: jml }, `${jml} karyawan berhasil disimpan`)
    } catch (err) {
        next(err)
    }
}
