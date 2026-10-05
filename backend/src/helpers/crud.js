import pool from '../config/database.js'
import { success, error, paginated } from './response.js'
import { buildOrderBy, applyAllColumnFilters } from './browse.js'

/**
 * Pabrik CRUD generik untuk tabel master sederhana (tjabatan, tdepartemen,
 * tstatuskaryawan, tpekerjaan, tpendidikan, tjenisijin, tketeranganmutasi, ...).
 *
 * Konfigurasi per tabel:
 *  {
 *    table: 'tjabatan',
 *    key: 'jab_kode',
 *    alias: { jab_kode: 'Kode', jab_nama: 'Nama' },
 *    order: 'ORDER BY jab_kode',
 *    required: ['jab_nama'],
 *    label: 'Jabatan',
 *    search: ['jab_kode', 'jab_nama'],
 *    autoKey: true          // generate nomor bila key tidak dikirim
 *    keyGen: (req) => nomorNik(...)
 *  }
 */
export function makeMasterController(cfg) {
    const {
        table,
        key,
        alias,
        order = `ORDER BY \`${key}\``,
        required = [],
        label = table,
        search = Object.keys(alias),
        editable = false,
        beforeSave = null,
    } = cfg

    const selectSql = `SELECT ${Object.entries(alias)
        .map(([c, a]) => `\`${c}\` AS \`${a}\``)
        .join(', ')} FROM \`${table}\``

    const list = async (req, res, next) => {
        try {
            const page = Math.max(1, parseInt(req.query.page) || 1)
            const perPage = Math.min(500, parseInt(req.query.per_page) || 25)
            const offset = (page - 1) * perPage

            let where = ''
            let params = []

            if (req.query.search && search.length) {
                where += ` WHERE (${search.map((c) => `\`${c}\` LIKE ?`).join(' OR ')})`
                params = search.map(() => `%${req.query.search}%`)
            }

            // daftar unik untuk popup filter header
            if (req.query.distinct && alias[req.query.distinct]) {
                const dcol = alias[req.query.distinct]
                const scoped = applyAllColumnFilters(where, params, req.query, alias, req.query.distinct)
                const dwhere = scoped.clause ? `${scoped.clause} AND` : 'WHERE'
                const [drows] = await pool.query(
                    `SELECT DISTINCT ${dcol} AS value FROM \`${table}\` ${dwhere} ${dcol} IS NOT NULL AND ${dcol} <> '' ORDER BY value LIMIT 500`,
                    scoped.params
                )
                return success(res, drows.map((r) => r.value))
            }

            const f = applyAllColumnFilters(where, params, req.query, alias)
            where = f.clause
            params = f.params
            const orderBy = buildOrderBy(req.query, alias, order)

            const [cnt] = await pool.query(`SELECT COUNT(*) AS total FROM \`${table}\`${where}`, params)
            const total = cnt[0].total

            const [rows] = await pool.query(
                `${selectSql}${where} ${orderBy} LIMIT ? OFFSET ?`,
                [...params, perPage, offset]
            )

            paginated(res, rows, { page, per_page: perPage, total, last_page: Math.ceil(total / perPage) })
        } catch (err) {
            next(err)
        }
    }

    const options = async (req, res, next) => {
        try {
            const [rows] = await pool.query(`${selectSql} ${order}`)
            success(res, rows)
        } catch (err) {
            next(err)
        }
    }

    const getById = async (req, res, next) => {
        try {
            const [rows] = await pool.query(`${selectSql} WHERE ${key} = ?`, [req.params.id])
            if (rows.length === 0) return error(res, `${label} tidak ditemukan`, 404)
            success(res, rows[0])
        } catch (err) {
            next(err)
        }
    }

    const write = async (req, res, next) => {
        try {
            const isNew = req.method === 'POST'
            let values = { ...(req.body || {}) }

            if (isNew && cfg.keyGen && (values[key] === undefined || values[key] === '')) {
                values[key] = await cfg.keyGen({ req, values })
            }
            if (beforeSave) values = (await beforeSave({ values, req, isNew })) || values

            for (const r of required) {
                if (values[r] === undefined || values[r] === null || String(values[r]).trim() === '') {
                    return error(res, `${r} wajib diisi`, 400)
                }
            }

            const cols = Object.keys(alias).filter((c) => values[c] !== undefined)
            if (cols.length === 0) return error(res, 'Tidak ada data untuk disimpan', 400)

            if (isNew) {
                if (!cols.includes(key)) cols.unshift(key)
                await pool.query(
                    `INSERT INTO \`${table}\` (${cols.map((c) => `\`${c}\``).join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
                    cols.map((c) => (c === key ? values[c] : values[c] ?? null))
                )
                const [rows] = await pool.query(`${selectSql} WHERE ${key} = ?`, [values[key]])
                return success(res, rows[0], `${label} berhasil ditambahkan`, 201)
            }

            if (!editable) return error(res, `${key} tidak dapat diubah`, 400)
            const sets = cols.filter((c) => c !== key)
            if (sets.length === 0) return error(res, 'Tidak ada perubahan', 400)

            await pool.query(
                `UPDATE \`${table}\` SET ${sets.map((c) => `\`${c}\` = ?`).join(', ')} WHERE ${key} = ?`,
                [...sets.map((c) => values[c]), req.params.id]
            )
            const [rows] = await pool.query(`${selectSql} WHERE ${key} = ?`, [req.params.id])
            if (rows.length === 0) return error(res, `${label} tidak ditemukan`, 404)
            success(res, rows[0], `${label} berhasil diupdate`)
        } catch (err) {
            next(err)
        }
    }

    const create = (req, res, next) => write(req, res, next)
    const update = (req, res, next) => write(req, res, next)

    const remove = async (req, res, next) => {
        try {
            await pool.query(`DELETE FROM \`${table}\` WHERE ${key} = ?`, [req.params.id])
            success(res, null, `${label} berhasil dihapus`)
        } catch (err) {
            next(err)
        }
    }

    return { list, options, getById, create, update, remove }
}