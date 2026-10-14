import pool from '../../config/database.js'
import { success, error, paginated } from '../../helpers/response.js'
import { applyAllColumnFilters, buildOrderBy } from '../../helpers/browse.js'

const SELECT = 'SELECT sb_id, sb_username, sb_password, sb_updated_at, sb_updated_by FROM tsandi_bpjs'
// Password tidak menjadi parameter pencarian/filter/sort maupun nilai distinct.
const BROWSE_COLUMNS = {
    sb_username: 'sb_username',
    sb_updated_at: 'sb_updated_at',
    sb_updated_by: 'sb_updated_by',
}
const validId = value => /^\d+$/.test(String(value)) && Number(value) > 0 && Number(value) <= 4294967295

export function noStoreSandiBpjs(_req, res, next) {
    res.set('Cache-Control', 'no-store')
    next()
}

function validate(body, res) {
    if (typeof body.sb_username !== 'string' || !body.sb_username.trim()) {
        error(res, 'Username BPJS wajib diisi.', 400)
        return false
    }
    if ([...body.sb_username].length > 100) {
        error(res, 'Username BPJS maksimal 100 karakter.', 400)
        return false
    }
    // Hanya string kosong dianggap tidak diisi; whitespace password dipertahankan.
    if (typeof body.sb_password !== 'string' || body.sb_password.length === 0) {
        error(res, 'Password BPJS wajib diisi.', 400)
        return false
    }
    if ([...body.sb_password].length > 255) {
        error(res, 'Password BPJS maksimal 255 karakter.', 400)
        return false
    }
    return true
}

function writeError(res, err) {
    // Jangan kirim/log error SQL: error database dapat memuat credential.
    return error(res, err?.code === 'ER_DUP_ENTRY'
        ? 'Username BPJS sudah terdaftar.' : 'Gagal menyimpan akun BPJS.',
    err?.code === 'ER_DUP_ENTRY' ? 409 : 500)
}

export async function getSandiBpjsList(req, res) {
    try {
        if (req.query.export !== undefined) return error(res, 'Ekspor Sandi BPJS tidak tersedia.', 400)
        const page = Math.max(1, parseInt(req.query.page) || 1)
        const perPage = Math.max(1, Math.min(500, parseInt(req.query.per_page) || 25))
        let where = ' WHERE 1 = 1'
        let params = []
        if (req.query.search) {
            where += ' AND (sb_username LIKE ? OR sb_updated_by LIKE ?)'
            params = Array(2).fill(`%${String(req.query.search)}%`)
        }
        if (req.query.distinct !== undefined) {
            const col = BROWSE_COLUMNS[req.query.distinct]
            if (!Object.hasOwn(BROWSE_COLUMNS, req.query.distinct)) return error(res, 'Kolom filter tidak tersedia.', 400)
            const scoped = applyAllColumnFilters(where, params, req.query, BROWSE_COLUMNS, req.query.distinct)
            const [rows] = await pool.query(
                `SELECT DISTINCT ${col} AS value FROM tsandi_bpjs${scoped.clause} ORDER BY ${col}`, scoped.params)
            return success(res, rows.map(row => row.value))
        }
        const filtered = applyAllColumnFilters(where, params, req.query, BROWSE_COLUMNS)
        const sortQuery = { ...req.query, sort_by: Object.hasOwn(BROWSE_COLUMNS, req.query.sort_by) ? req.query.sort_by : undefined }
        const order = buildOrderBy(sortQuery, BROWSE_COLUMNS, 'ORDER BY sb_updated_at DESC, sb_id DESC')
        const [count] = await pool.query(`SELECT COUNT(*) AS total FROM tsandi_bpjs${filtered.clause}`, filtered.params)
        const [rows] = await pool.query(`${SELECT}${filtered.clause} ${order} LIMIT ? OFFSET ?`,
            [...filtered.params, perPage, (page - 1) * perPage])
        return paginated(res, rows, { page, per_page: perPage, total: count[0].total, last_page: Math.ceil(count[0].total / perPage) })
    } catch {
        return error(res, 'Gagal memuat daftar akun BPJS.', 500)
    }
}

export async function getSandiBpjs(req, res) {
    if (!validId(req.params.id)) return error(res, 'ID akun BPJS tidak valid.', 400)
    try {
        const [rows] = await pool.query(`${SELECT} WHERE sb_id = ?`, [req.params.id])
        if (!rows.length) return error(res, 'Akun BPJS tidak ditemukan.', 404)
        return success(res, rows[0])
    } catch {
        return error(res, 'Gagal memuat akun BPJS.', 500)
    }
}

export async function createSandiBpjs(req, res) {
    const user = req.user?.user
    if (typeof user !== 'string' || !user) return error(res, 'Silakan login.', 401)
    const body = req.body || {}
    if (!validate(body, res)) return
    try {
        const [result] = await pool.query(
            'INSERT INTO tsandi_bpjs (sb_username, sb_password, sb_updated_by) VALUES (?, ?, ?)',
            [body.sb_username, body.sb_password, user])
        return success(res, { sb_id: result.insertId }, 'Akun BPJS berhasil ditambahkan.', 201)
    } catch (err) {
        return writeError(res, err)
    }
}

export async function updateSandiBpjs(req, res) {
    const user = req.user?.user
    if (typeof user !== 'string' || !user) return error(res, 'Silakan login.', 401)
    if (!validId(req.params.id)) return error(res, 'ID akun BPJS tidak valid.', 400)
    const body = req.body || {}
    if (!validate(body, res)) return
    try {
        const [rows] = await pool.query('SELECT sb_id FROM tsandi_bpjs WHERE sb_id = ?', [req.params.id])
        if (!rows.length) return error(res, 'Akun BPJS tidak ditemukan.', 404)
        // Waktu tetap ditentukan database, termasuk saat menyimpan nilai yang sama.
        await pool.query(
            'UPDATE tsandi_bpjs SET sb_username = ?, sb_password = ?, sb_updated_by = ?, sb_updated_at = CURRENT_TIMESTAMP WHERE sb_id = ?',
            [body.sb_username, body.sb_password, user, req.params.id])
        return success(res, null, 'Akun BPJS berhasil diperbarui.')
    } catch (err) {
        return writeError(res, err)
    }
}

export async function deleteSandiBpjs(req, res) {
    if (!validId(req.params.id)) return error(res, 'ID akun BPJS tidak valid.', 400)
    try {
        const [result] = await pool.query('DELETE FROM tsandi_bpjs WHERE sb_id = ?', [req.params.id])
        if (!result.affectedRows) return error(res, 'Akun BPJS tidak ditemukan.', 404)
        return success(res, null, 'Akun BPJS berhasil dihapus.')
    } catch {
        return error(res, 'Gagal menghapus akun BPJS.', 500)
    }
}
