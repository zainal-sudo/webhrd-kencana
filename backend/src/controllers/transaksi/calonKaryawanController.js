import pool from '../../config/database.js'
import { success, error, paginated } from '../../helpers/response.js'
import { buildOrderBy, applyAllColumnFilters } from '../../helpers/browse.js'
import { sendExcel } from '../../helpers/excel.js'

/**
 * Modul Rekruitmen (Panggilan) — cerminan unit Delphi:
 *   ufrmBrowseCalonKaryawan -> daftar per periode + hapus
 *   ufrmCalonKaryawan       -> form panggilan: pelamar dari bank + nilai tes
 *
 * Tabel: `tcalonkaryawan` (ck_nomor PK `NNN/HRD/CK/MM/yy`),
 *        `tcalonkaryawan_dtl` (ckd_ck_nomor, ckd_rkt_nomor -> bank,
 *        ckd_jam, ckd_pab_kode, ckd_status), `trekruitmen` (bank),
 *        `trekruitmentes` (rtt_ck_nomor + rtt_rkt_nomor + rtt_id_tes),
 *        `talattes`, `tpabrik`.
 *
 * Aturan Delphi yang diduplikasi:
 * - Nomor: 3 digit urut per TAHUN berjalan + `/HRD/CK/` + MM/yy.
 * - Pelamar diambil dari bank dengan rkt_status <> 2; status awal baris
 *   'Belum Diputuskan'; duplikat pelamar dalam satu dokumen ditolak.
 * - Nilai tes per (panggilan, pelamar) disimpan lewat tombol tersendiri.
 *
 * PERBAIKAN dari Delphi: hapus browse Delphi salah sasaran (query
 * `delete ... where dep_kode`), versi web menghapus panggilan + detail +
 * nilai tesnya. Simpan detail + header dalam satu transaksi.
 */

const LIST_COLUMNS = {
    Nomor: 'c.ck_nomor',
    Tanggal: 'c.ck_tanggal',
    Tgl_Panggil: 'c.ck_tanggalpanggil',
    Keterangan: 'c.ck_keterangan',
    Jml_Pelamar: '(SELECT COUNT(*) FROM tcalonkaryawan_dtl d WHERE d.ckd_ck_nomor = c.ck_nomor)',
}

const FROM_SQL = 'FROM tcalonkaryawan c'

const SELECT_SQL = `SELECT ${Object.entries(LIST_COLUMNS)
    .map(([alias, expr]) => `${expr} AS \`${alias}\``)
    .join(', ')} ${FROM_SQL}`

const STATUS_PANGGIL = 'Belum Diputuskan'

function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
    const date = new Date(`${value}T00:00:00Z`)
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && value >= '1000-01-01'
}

function validTime(value) {
    if (value === null || value === undefined || value === '') return true
    return typeof value === 'string' && /^\d{2}:\d{2}(:\d{2})?$/.test(value)
}

/** Nomor berikutnya: NNN/HRD/CK/MM/yy (getmaxnomor). */
export async function nomorBerikut(tanggal) {
    const s = String(tanggal).slice(0, 10)
    const d = new Date(`${s}T00:00:00Z`)
    const tahun = d.getUTCFullYear()
    const suffix = `/HRD/CK/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(tahun).slice(-2)}`
    const [rows] = await pool.query(
        'SELECT MAX(LEFT(ck_nomor, 3)) AS m FROM tcalonkaryawan WHERE YEAR(ck_tanggal) = ?',
        [tahun]
    )
    const m = rows[0]?.m ? parseInt(rows[0].m, 10) : 0
    return `${String(1000 + m + 1).slice(-3)}${suffix}`
}

/** Daftar panggilan per periode (default bulan berjalan). */
export const getCalonList = async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1)
        const perPage = Math.min(500, parseInt(req.query.per_page) || 25)
        const offset = (page - 1) * perPage
        const today = new Date().toISOString().slice(0, 10)
        const start = req.query.start_date || `${today.slice(0, 7)}-01`
        const end = req.query.end_date || today
        if (!validDate(start) || !validDate(end) || start > end) return error(res, 'Periode tidak valid', 400)

        let where = ' WHERE c.ck_tanggal BETWEEN ? AND ?'
        let params = [start, end]
        if (req.query.search) {
            where += ' AND (c.ck_nomor LIKE ? OR c.ck_keterangan LIKE ?)'
            params = [...params, ...Array(2).fill(`%${req.query.search}%`)]
        }

        if (req.query.distinct && LIST_COLUMNS[req.query.distinct]) {
            const col = LIST_COLUMNS[req.query.distinct]
            const f = applyAllColumnFilters(where, params, req.query, LIST_COLUMNS, req.query.distinct)
            const [rows] = await pool.query(
                `SELECT DISTINCT ${col} AS value, OCTET_LENGTH(${col}) AS value_length ${FROM_SQL}${f.clause} ORDER BY value`,
                f.params
            )
            return success(res, rows.map((row) => row.value))
        }

        const f = applyAllColumnFilters(where, params, req.query, LIST_COLUMNS)
        const order = buildOrderBy(req.query, LIST_COLUMNS, 'ORDER BY c.ck_tanggal DESC, c.ck_nomor DESC')
        if (req.query.export === 'xlsx') {
            const [rows] = await pool.query(`${SELECT_SQL}${f.clause} ${order} LIMIT 50000`, f.params)
            // Export = tampilan web: Keterangan pindah ke akhir (setelah
            // Jml_Pelamar) dan label sesuai RekrutmenView.
            return sendExcel(res, 'Rekrutmen-Panggilan',
                ['Nomor', 'Tanggal', 'Tgl_Panggil', 'Jml_Pelamar', 'Keterangan'],
                rows,
                { headLabels: { Tgl_Panggil: 'Tgl Panggil', Jml_Pelamar: 'Pelamar' } })
        }
        const [count] = await pool.query(`SELECT COUNT(*) AS total ${FROM_SQL}${f.clause}`, f.params)
        const total = Number(count[0].total)
        const [rows] = await pool.query(
            `${SELECT_SQL}${f.clause} ${order} LIMIT ? OFFSET ?`,
            [...f.params, perPage, offset]
        )
        paginated(res, rows, { page, per_page: perPage, total, last_page: Math.ceil(total / perPage) })
    } catch (err) { next(err) }
}

/** Nomor preview untuk tanggal tertentu. */
export const getNomor = async (req, res, next) => {
    try {
        const tanggal = String(req.query.tanggal || new Date().toISOString().slice(0, 10)).slice(0, 10)
        if (!validDate(tanggal)) return error(res, 'Tanggal tidak valid', 400)
        success(res, { nomor: await nomorBerikut(tanggal), tanggal })
    } catch (err) { next(err) }
}

/** Pelamar dari bank (rkt_status <> 2) untuk picker baris detail. */
export const lookupPelamar = async (req, res, next) => {
    try {
        const q = String(req.query.search || '').trim()
        const params = []
        let where = ' WHERE rkt_status <> 2'
        if (q) {
            where += ' AND (rkt_nomor LIKE ? OR rkt_nama LIKE ? OR rkt_posisi LIKE ? OR rkt_alamat LIKE ?)'
            params.push(...Array(4).fill(`%${q}%`))
        }
        const [rows] = await pool.query(
            `SELECT rkt_nomor AS Nomor, LEFT(rkt_nama, 30) AS Nama, rkt_posisi AS Posisi,
                    rkt_tanggal AS Tanggal, rkt_alamat AS Alamat
             FROM trekruitmen${where} ORDER BY rkt_tanggal DESC LIMIT 200`,
            params
        )
        success(res, rows)
    } catch (err) { next(err) }
}

/** Satu dokumen panggilan + baris pelamar (mode ubah). */
export const getCalon = async (req, res, next) => {
    try {
        const nomor = String(req.query.nomor || req.params.nomor || '').trim()
        if (!nomor) return error(res, 'Nomor wajib diisi', 400)
        const [rows] = await pool.query('SELECT * FROM tcalonkaryawan WHERE ck_nomor = ?', [nomor])
        if (rows.length === 0) return error(res, 'Nomor tidak ditemukan', 404)
        const t = rows[0]
        const [detail] = await pool.query(
            `SELECT d.ckd_rkt_nomor AS nopelamar, r.rkt_nama AS nama, r.rkt_posisi AS posisi,
                    d.ckd_jam AS jam, d.ckd_pab_kode AS unit, d.ckd_status AS status
             FROM tcalonkaryawan_dtl d
             INNER JOIN trekruitmen r ON r.rkt_nomor = d.ckd_rkt_nomor
             WHERE d.ckd_ck_nomor = ?`,
            [nomor]
        )
        success(res, {
            nomor: t.ck_nomor,
            tanggal: t.ck_tanggal ? String(t.ck_tanggal).slice(0, 10) : null,
            tanggal_panggil: t.ck_tanggalpanggil ? String(t.ck_tanggalpanggil).slice(0, 10) : null,
            keterangan: t.ck_keterangan || '',
            detail: detail.map((r) => ({
                ...r,
                jam: r.jam ? String(r.jam).slice(0, 8) : '',
            })),
        })
    } catch (err) { next(err) }
}

/** Nilai tes satu pelamar pada satu panggilan (klik baris Delphi). */
export const getTes = async (req, res, next) => {
    try {
        const ck = String(req.query.ck_nomor || '').trim()
        const rkt = String(req.query.rkt_nomor || '').trim()
        if (!ck || !rkt) return error(res, 'Nomor panggilan dan pelamar wajib diisi', 400)
        const [rows] = await pool.query(
            `SELECT a.id AS id, a.nama AS nama, t.rtt_hasil AS hasil
             FROM talattes a
             LEFT JOIN trekruitmentes t ON t.rtt_id_tes = a.id AND t.rtt_ck_nomor = ? AND t.rtt_rkt_nomor = ?
             WHERE a.status = 1 ORDER BY a.id`,
            [ck, rkt]
        )
        success(res, {
            ck_nomor: ck,
            rkt_nomor: rkt,
            tes: rows.map((r) => ({ id: r.id, nama: r.nama, hasil: r.hasil || '' })),
        })
    } catch (err) { next(err) }
}

/** Simpan nilai tes satu pelamar (tombol tersendiri Delphi). */
export const saveTes = async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
        const b = req.body || {}
        const ck = String(b.ck_nomor || '').trim()
        const rkt = String(b.rkt_nomor || '').trim()
        if (!ck || !rkt) return error(res, 'Nomor panggilan dan pelamar wajib diisi', 400)
        const tes = (Array.isArray(b.tes) ? b.tes : [])
            .filter((t) => Number.isInteger(parseInt(t?.id, 10)))
        await conn.beginTransaction()
        await conn.query('DELETE FROM trekruitmentes WHERE rtt_ck_nomor = ? AND rtt_rkt_nomor = ?', [ck, rkt])
        for (const t of tes) {
            await conn.query(
                'INSERT INTO trekruitmentes (rtt_ck_nomor, rtt_rkt_nomor, rtt_id_tes, rtt_hasil) VALUES (?, ?, ?, ?)',
                [ck, rkt, parseInt(t.id, 10), String(t.hasil || '')]
            )
        }
        await conn.commit()
        success(res, null, 'Nilai berhasil disimpan')
    } catch (err) {
        await conn.rollback().catch(() => {})
        next(err)
    } finally {
        conn.release()
    }
}

/**
 * Simpan (ufrmCalonKaryawan.simpandata).
 * Body: { nomor? (mode ubah), tanggal, tanggal_panggil, keterangan,
 *   detail: [{nopelamar, jam 'HH:MM:SS', unit, status}] }
 */
export const saveCalon = async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
        const b = req.body || {}
        const tanggal = String(b.tanggal || '').slice(0, 10)
        const tanggalPanggil = String(b.tanggal_panggil || '').slice(0, 10)
        if (!validDate(tanggal)) return error(res, 'Tanggal tidak valid', 400)
        if (!validDate(tanggalPanggil)) return error(res, 'Tanggal panggil tidak valid', 400)

        const detail = Array.isArray(b.detail) ? b.detail : []
        const baris = []
        const jumpa = new Set()
        for (const [i, r] of detail.entries()) {
            const nopelamar = String(r?.nopelamar || '').trim()
            if (!nopelamar) continue
            if (jumpa.has(nopelamar)) {
                return error(res, `Pelamar ${nopelamar} sudah dimasukkan (baris ${i + 1})`, 400)
            }
            jumpa.add(nopelamar)
            const jam = String(r?.jam || '')
            if (!validTime(jam)) return error(res, `Jam baris ${i + 1} tidak valid (HH:MM:SS)`, 400)
            baris.push({
                nopelamar,
                jam: jam === '' ? null : (jam.length === 5 ? `${jam}:00` : jam),
                unit: String(r?.unit || ''),
                status: String(r?.status || '') || STATUS_PANGGIL,
            })
        }
        for (const r of baris) {
            const [ada] = await conn.query(
                'SELECT rkt_nomor FROM trekruitmen WHERE rkt_nomor = ? AND rkt_status <> 2',
                [r.nopelamar]
            )
            if (ada.length === 0) return error(res, `Pelamar ${r.nopelamar} tidak dikenal / sudah ditolak`, 400)
        }

        await conn.beginTransaction()
        let nomor = String(b.nomor || '').trim()
        if (nomor) {
            const [ada] = await conn.query('SELECT ck_nomor FROM tcalonkaryawan WHERE ck_nomor = ?', [nomor])
            if (ada.length === 0) {
                await conn.rollback()
                return error(res, 'Nomor tidak ditemukan', 404)
            }
            await conn.query(
                `UPDATE tcalonkaryawan SET ck_tanggal = ?, ck_tanggalpanggil = ?, ck_keterangan = ?
                 WHERE ck_nomor = ?`,
                [tanggal, tanggalPanggil, String(b.keterangan || ''), nomor]
            )
        } else {
            nomor = await nomorBerikut(tanggal)
            await conn.query(
                `INSERT INTO tcalonkaryawan (ck_nomor, ck_tanggal, ck_tanggalpanggil, ck_keterangan)
                 VALUES (?, ?, ?, ?)`,
                [nomor, tanggal, tanggalPanggil, String(b.keterangan || '')]
            )
        }
        await conn.query('DELETE FROM tcalonkaryawan_dtl WHERE ckd_ck_nomor = ?', [nomor])
        for (const r of baris) {
            await conn.query(
                `INSERT INTO tcalonkaryawan_dtl (ckd_ck_nomor, ckd_rkt_nomor, ckd_jam, ckd_pab_kode, ckd_status)
                 VALUES (?, ?, ?, ?, ?)`,
                [nomor, r.nopelamar, r.jam, r.unit, r.status]
            )
        }
        await conn.commit()
        success(res, { nomor }, `Berhasil simpan dengan nomor ${nomor}`)
    } catch (err) {
        await conn.rollback().catch(() => {})
        next(err)
    } finally {
        conn.release()
    }
}

/** Hapus panggilan + detail + nilai tesnya. */
export const deleteCalon = async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
        const nomor = String(req.params.nomor || req.query.nomor || '').trim()
        if (!nomor) return error(res, 'Nomor wajib diisi', 400)
        await conn.beginTransaction()
        await conn.query('DELETE FROM trekruitmentes WHERE rtt_ck_nomor = ?', [nomor])
        await conn.query('DELETE FROM tcalonkaryawan_dtl WHERE ckd_ck_nomor = ?', [nomor])
        const [r] = await conn.query('DELETE FROM tcalonkaryawan WHERE ck_nomor = ?', [nomor])
        if (r.affectedRows === 0) {
            await conn.rollback()
            return error(res, 'Nomor tidak ditemukan', 404)
        }
        await conn.commit()
        success(res, null, 'Data berhasil dihapus')
    } catch (err) {
        await conn.rollback().catch(() => {})
        next(err)
    } finally {
        conn.release()
    }
}
