import pool from '../../config/database.js'
import { KETERANGAN_IJIN_SQL } from '../../config/ijin.js'
import { buildOrderBy, applyAllColumnFilters } from '../../helpers/browse.js'
import { success, error, paginated } from '../../helpers/response.js'

const COLUMNS = {
    Nomor: 'i.ij_nomor',
    Tanggal: 'i.ij_tanggal',
    JenisIjin: 'ji.ji_keterangan',
    Nik: 'i.ij_nik',
    Nama: 'k.kar_nama',
    Pabrik: 'k.kar_pab_kode',
    Bagian: "TRIM(CONCAT_WS(' ', j.jab_nama, k.kar_bagian))",
    Awal: 'i.ij_jam',
    Akhir: 'i.ij_jam2',
    Alasan: 'i.ij_alasan',
    Keterangan: KETERANGAN_IJIN_SQL,
    SistemGaji: 'k.kar_sistem_gaji',
}

// Satu baris per key master: data master duplikat tidak boleh menggandakan
// transaksi/pagination. MIN merupakan fallback deterministik untuk master
// ambigu; pada master unik nilai tidak berubah. LEFT JOIN mempertahankan orphan.
// Ijin menggunakan kar_Nik, BUKAN kar_kode_absensi seperti tabsensi.
const FROM_SQL = `FROM tijin i
    LEFT JOIN (
        SELECT ji_id, MIN(ji_keterangan) AS ji_keterangan
        FROM tjenisijin GROUP BY ji_id
    ) ji ON ji.ji_id = i.ij_ji_id
    LEFT JOIN (
        SELECT kar_Nik, MIN(kar_nama) AS kar_nama,
               MIN(kar_pab_kode) AS kar_pab_kode,
               MIN(kar_jab_kode) AS kar_jab_kode,
               MIN(kar_bagian) AS kar_bagian,
               MIN(kar_sistem_gaji) AS kar_sistem_gaji,
               COUNT(*) AS jumlah_master
        FROM tkaryawan GROUP BY kar_Nik
    ) k ON k.kar_Nik = i.ij_nik
    LEFT JOIN (
        SELECT jab_kode, MIN(jab_nama) AS jab_nama
        FROM tjabatan GROUP BY jab_kode
    ) j ON j.jab_kode = k.kar_jab_kode`

const SELECT_SQL = `SELECT ${Object.entries(COLUMNS)
    .map(([alias, expression]) => `${expression} AS \`${alias}\``).join(', ')},
    i.ij_ji_id AS JenisIjinId, i.ij_keterangan AS KeteranganKode,
    COALESCE(k.jumlah_master, 0) AS JumlahMasterKaryawan ${FROM_SQL}`

function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
    const date = new Date(`${value}T00:00:00Z`)
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function positiveInteger(value, fallback, maximum) {
    const n = Number(value)
    return Number.isSafeInteger(n) && n > 0 ? Math.min(n, maximum) : fallback
}

/** Tahap A: semua jalur controller ini hanya SELECT. */
export const getIjinList = async (req, res, next) => {
    try {
        const now = new Date()
        const pad = (n) => String(n).padStart(2, '0')
        const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
        const start = req.query.start_date ?? `${today.slice(0, 7)}-01`
        const end = req.query.end_date ?? today
        if (!validDate(start) || !validDate(end) || end < start) {
            return error(res, 'Periode harus berupa tanggal valid; tanggal akhir tidak boleh mendahului tanggal awal', 400)
        }

        const page = positiveInteger(req.query.page, 1, 1_000_000)
        const perPage = positiveInteger(req.query.per_page, 25, 500)
        let where = ' WHERE i.ij_tanggal BETWEEN ? AND ?'
        let params = [start, end]
        const search = typeof req.query.search === 'string' ? req.query.search.trim() : ''
        if (search) {
            const fields = ['Nomor', 'Nik', 'Nama', 'Alasan', 'JenisIjin', 'Bagian', 'Pabrik']
            where += ` AND (${fields.map((key) => `${COLUMNS[key]} LIKE ?`).join(' OR ')})`
            params.push(...fields.map(() => `%${search}%`))
        }

        const distinct = req.query.distinct
        if (distinct !== undefined) {
            if (typeof distinct !== 'string' || !Object.hasOwn(COLUMNS, distinct)) {
                return error(res, 'Kolom filter tidak valid', 400)
            }
            const filtered = applyAllColumnFilters(where, params, req.query, COLUMNS, distinct)
            const expression = COLUMNS[distinct]
            const [rows] = await pool.query(
                `SELECT DISTINCT ${expression} AS value ${FROM_SQL}${filtered.clause}
                 AND ${expression} IS NOT NULL AND ${expression} <> '' ORDER BY value LIMIT 500`,
                filtered.params
            )
            return success(res, rows.map((row) => row.value))
        }

        const filtered = applyAllColumnFilters(where, params, req.query, COLUMNS)
        where = filtered.clause
        params = filtered.params
        // Helper memakai whitelist; buang inherited key sebelum memanggilnya.
        const sortQuery = { ...req.query }
        if (!Object.hasOwn(COLUMNS, sortQuery.sort_by)) delete sortQuery.sort_by
        let order = buildOrderBy(sortQuery, COLUMNS, 'ORDER BY i.ij_tanggal DESC, i.ij_nomor DESC')
        if (sortQuery.sort_by && sortQuery.sort_by !== 'Nomor') order += ', i.ij_nomor DESC'

        const [count] = await pool.query(`SELECT COUNT(*) AS total ${FROM_SQL}${where}`, params)
        const total = Number(count[0].total)
        const [rows] = await pool.query(
            `${SELECT_SQL}${where} ${order} LIMIT ? OFFSET ?`,
            [...params, perPage, (page - 1) * perPage]
        )
        return paginated(res, rows, {
            page, per_page: perPage, total, last_page: Math.ceil(total / perPage),
        })
    } catch (err) {
        next(err)
    }
}

export const getIjin = async (req, res, next) => {
    try {
        const nomor = req.params.nomor
        if (typeof nomor !== 'string' || !nomor || nomor.length > 20) {
            return error(res, 'Nomor Ijin tidak valid', 400)
        }
        const [rows] = await pool.query(`${SELECT_SQL} WHERE i.ij_nomor = ?`, [nomor])
        if (!rows.length) return error(res, 'Transaksi Ijin tidak ditemukan', 404)
        return success(res, rows[0])
    } catch (err) {
        next(err)
    }
}
