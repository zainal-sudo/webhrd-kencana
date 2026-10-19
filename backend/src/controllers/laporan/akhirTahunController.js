import pool from '../../config/database.js'
import { error, success, paginated } from '../../helpers/response.js'
import { applyAllColumnFilters, buildOrderBy } from '../../helpers/browse.js'
import { AKHIR_TAHUN_COLUMNS, akhirTahunSql, periodeAkhirTahun } from '../../helpers/akhirTahun.js'
import { sendAkhirTahunExcel } from '../../helpers/akhirTahunExcel.js'

const columns = Object.assign(Object.create(null), Object.fromEntries(AKHIR_TAHUN_COLUMNS.map(column => [column.key, `r.\`${column.key}\``])))
const filterOptions = {
    stringColumns: new Set(AKHIR_TAHUN_COLUMNS.filter(column => !column.numeric && column.key !== 'Tgl_Masuk').map(column => column.key)),
    numberColumns: new Set(AKHIR_TAHUN_COLUMNS.filter(column => column.numeric).map(column => column.key)),
}
const numericKeys = AKHIR_TAHUN_COLUMNS.filter(column => column.numeric).map(column => column.key)

/** Read-only legacy annual report; list, distinct and Excel share one scope. */
export const getAkhirTahun = async (req, res, next) => {
    try {
        let period
        try { period = periodeAkhirTahun(req.query.tahun) } catch (err) { return error(res, err.message, 400) }
        const base = akhirTahunSql(period)
        const from = `FROM (${base.sql}) r`
        let where = ' WHERE 1 = 1'
        const params = [...base.params]
        if (req.query.search) {
            where += ' AND (r.Nik LIKE ? OR r.Nama LIKE ? OR r.Bagian LIKE ? OR r.Jabatan LIKE ? OR r.Pabrik LIKE ?)'
            params.push(...Array(5).fill(`%${req.query.search}%`))
        }
        if (req.query.distinct !== undefined) {
            if (!Object.hasOwn(columns, req.query.distinct)) return error(res, 'Kolom filter tidak valid', 400)
            const filter = applyAllColumnFilters(where, params, req.query, columns, req.query.distinct, filterOptions)
            const [rows] = await pool.query(`SELECT DISTINCT ${columns[req.query.distinct]} AS value, OCTET_LENGTH(${columns[req.query.distinct]}) AS value_length ${from}${filter.clause} ORDER BY value`, filter.params)
            return success(res, rows.map(row => row.value))
        }
        const filter = applyAllColumnFilters(where, params, req.query, columns, null, filterOptions)
        const order = buildOrderBy(req.query, columns, 'ORDER BY r.Nik ASC')
        if (req.query.export === 'xlsx') {
            const [rows] = await pool.query(`SELECT r.* ${from}${filter.clause} ${order}`, filter.params)
            return sendAkhirTahunExcel(res, period.year, rows)
        }
        const page = Math.max(1, parseInt(req.query.page) || 1)
        const perPage = Math.min(500, Math.max(1, parseInt(req.query.per_page) || 50))
        const [count] = await pool.query(`SELECT COUNT(*) AS total ${from}${filter.clause}`, filter.params)
        const [rows] = await pool.query(`SELECT r.* ${from}${filter.clause} ${order} LIMIT ? OFFSET ?`, [...filter.params, perPage, (page - 1) * perPage])
        for (const row of rows) for (const key of numericKeys) row[key] = Number(row[key])
        return paginated(res, rows, { page, per_page: perPage, total: count[0].total, last_page: Math.ceil(count[0].total / perPage), tahun: period.year })
    } catch (err) { next(err) }
}
