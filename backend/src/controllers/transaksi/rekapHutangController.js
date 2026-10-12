import pool from '../../config/database.js'
import { success, error, paginated } from '../../helpers/response.js'
import { applyAllColumnFilters, buildOrderBy } from '../../helpers/browse.js'
import { sendRekapHutangExcel } from '../../helpers/rekapHutangExcel.js'
import { PLAFON_PINJAMAN } from '../../helpers/pinjaman.js'

const COLUMNS = {
    Nomor: 'p.nomor_pinjam', Tanggal: 'p.tanggal', Nik: 'p.nik', Nama: 'k.kar_nama',
    Pabrik: 'k.kar_pab_kode', Bagian: 'k.kar_bagian',
    Pinjam: 'CAST(p.pinjam AS DECIMAL(65,20))', Bayar: 'CAST(p.bayar AS DECIMAL(65,20))',
    SisaBayar: 'CAST(p.pinjam AS DECIMAL(65,20)) - CAST(p.bayar AS DECIMAL(65,20))',
}
const FROM = 'FROM tpinjaman p LEFT JOIN tkaryawan k ON k.kar_Nik = p.nik'
const ACTIVE = ' WHERE p.pinjam - p.bayar > 0'
const TOTAL = `COUNT(*) AS jumlah, COALESCE(SUM(${COLUMNS.Pinjam}), 0) AS pinjam,
    COALESCE(SUM(${COLUMNS.Bayar}), 0) AS bayar, COALESCE(SUM(${COLUMNS.SisaBayar}), 0) AS sisa`
const numeric = row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value)]))

/** Read-only current balances. Never infer historical payments or write legacy records. */
export async function getRekapHutang(req, res, next) {
    try {
        const query = req.query
        const page = Math.max(1, parseInt(query.page) || 1)
        const per_page = Math.max(1, Math.min(500, parseInt(query.per_page) || 25))
        let where = ACTIVE
        let params = []
        if (query.search) {
            where += ' AND (p.nomor_pinjam LIKE ? OR p.nik LIKE ? OR k.kar_nama LIKE ? OR k.kar_pab_kode LIKE ? OR k.kar_bagian LIKE ?)'
            params = Array(5).fill(`%${query.search}%`)
        }
        const filtered = applyAllColumnFilters(where, params, query, COLUMNS, query.distinct || null)
        where = filtered.clause; params = filtered.params
        if (query.distinct) {
            if (!Object.hasOwn(COLUMNS, query.distinct)) return error(res, 'Kolom tidak valid', 400)
            const [rows] = await pool.query(`SELECT DISTINCT ${COLUMNS[query.distinct]} AS value ${FROM}${where} ORDER BY value LIMIT 1000`, params)
            return success(res, rows.map(row => row.value))
        }
        const order = buildOrderBy({ ...query, sort_by: Object.hasOwn(COLUMNS, query.sort_by) ? query.sort_by : undefined },
            COLUMNS, 'ORDER BY p.tanggal DESC, p.nomor_pinjam DESC')
        const select = `SELECT ${Object.entries(COLUMNS).map(([key, expr]) => `${expr} AS \`${key}\``).join(', ')} ${FROM}${where} ${order}`
        const [totals] = await pool.query(`SELECT ${TOTAL} ${FROM}${where}`, params)
        const [globalRows] = await pool.query(`SELECT ${TOTAL} ${FROM}${ACTIVE}`)
        const [unknownRows] = await pool.query('SELECT COUNT(*) AS jumlah FROM tpinjaman WHERE pinjam IS NULL OR bayar IS NULL')
        const hasil_filter = numeric(totals[0])
        const saldo_saat_ini = { ...numeric(globalRows[0]), plafon: PLAFON_PINJAMAN,
            sisa_plafon: PLAFON_PINJAMAN - Number(globalRows[0].sisa), saldo_tidak_diketahui: Number(unknownRows[0].jumlah) }
        const [raw] = await pool.query(query.export === 'xlsx' ? select : `${select} LIMIT ? OFFSET ?`,
            query.export === 'xlsx' ? params : [...params, per_page, (page - 1) * per_page])
        const rows = raw.map(row => ({ ...row, Pinjam: Number(row.Pinjam), Bayar: Number(row.Bayar), SisaBayar: Number(row.SisaBayar) }))
        if (query.export === 'xlsx') {
            return await sendRekapHutangExcel(res, rows, hasil_filter, saldo_saat_ini)
        }
        return paginated(res, rows, { page, per_page, total: hasil_filter.jumlah,
            last_page: Math.max(1, Math.ceil(hasil_filter.jumlah / per_page)), hasil_filter, saldo_saat_ini })
    } catch (e) { next(e) }
}
