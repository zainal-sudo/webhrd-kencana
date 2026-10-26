import pool from '../../config/database.js'
import { success, error, paginated } from '../../helpers/response.js'
import { clearHakAksesCache } from '../../middleware/permission.js'
import { applyAllColumnFilters, buildOrderBy } from '../../helpers/browse.js'
import { sendExcel } from '../../helpers/excel.js'

/**
 * Master User & Otorisasi â€” cerminan `ufrmUser` di program Delphi.
 *
 * tuser    : user_kode, user_nama, USER_PASSWORD (plaintext), user_akses (= KDCABANG)
 * thakuser : hak_user_kode, hak_men_id, hak_men_insert/edit/delete ('Y'/'N')
 * tmenu    : daftar modul yang dipatroli
 */

/* â”€â”€ User â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const USER_COLUMNS = { Kode: 'user_kode', Nama: 'user_nama', Cabang: 'user_akses', Edit: 'user_edit', Dibuat: 'date_create' }
const USER_SELECT = 'SELECT user_kode AS Kode, user_nama AS Nama, user_akses AS Cabang, user_edit AS Edit, date_create AS Dibuat FROM tuser'
const USER_FILTERS = { stringColumns: new Set(['Kode', 'Nama', 'Cabang']), numberColumns: new Set(['Edit']) }
const problem = (message, status = 400, reload = false) => Object.assign(new Error(message), { userManagementError: true, status, reload })
function text(value, label, max, required = false) {
    if (typeof value !== 'string' || (required && !value.trim()) || [...value].length > max) {
        throw problem(`${label} ${required ? 'wajib diisi dan ' : ''}maksimal ${max} karakter.`)
    }
    return value
}
function userCode(value) { return text(value, 'Kode user', 10, true).trim() }
function userFailure(res, err, fallback) {
    // Never send database error messages/SQL or credential values to the client/log.
    return res.status(err?.userManagementError ? err.status : 500).json({
        success: false, message: err?.userManagementError ? err.message : fallback,
        ...(err?.reload ? { reload_required: true } : {}),
    })
}
async function withUserLock(kode, work) {
    let conn, locked = false
    const name = `hrd_master_user:${kode.toUpperCase()}`
    try {
        conn = await pool.getConnection()
        locked = (await conn.query('SELECT GET_LOCK(?, 5) AS acquired', [name]))[0]?.[0]?.acquired === 1
        if (!locked) throw problem('Data user sedang diproses. Silakan coba lagi.', 503)
        return await work(conn)
    } finally {
        if (locked) await conn.query('SELECT RELEASE_LOCK(?) AS released', [name]).catch(() => {})
        conn?.release()
    }
}
async function requireUser(conn, kode) {
    const [rows] = await conn.query('SELECT user_kode FROM tuser WHERE user_kode = ?', [kode])
    if (!rows.length) throw problem('User tidak ditemukan.', 404)
}
export const getUserList = async (req, res) => {
    try {
        const query = req.query || {}
        let where = ' WHERE 1 = 1', params = []
        if (query.search) {
            where += ' AND (user_kode LIKE ? OR user_nama LIKE ? OR user_akses LIKE ?)'
            params = Array(3).fill(`%${String(query.search)}%`)
        }
        if (query.distinct !== undefined) {
            if (!Object.hasOwn(USER_COLUMNS, query.distinct)) throw problem('Kolom filter tidak tersedia.')
            const col = USER_COLUMNS[query.distinct]
            const scoped = applyAllColumnFilters(where, params, query, USER_COLUMNS, query.distinct, USER_FILTERS)
            const length = USER_FILTERS.stringColumns.has(query.distinct) ? `, OCTET_LENGTH(${col}) AS value_length` : ''
            const [rows] = await pool.query(`SELECT DISTINCT ${col} AS value${length} FROM tuser${scoped.clause} ORDER BY value`, scoped.params)
            return success(res, rows.map(row => row.value))
        }
        const filtered = applyAllColumnFilters(where, params, query, USER_COLUMNS, null, USER_FILTERS)
        const sort = { ...query, sort_by: Object.hasOwn(USER_COLUMNS, query.sort_by) ? query.sort_by : undefined }
        const order = buildOrderBy(sort, USER_COLUMNS, 'ORDER BY user_kode ASC') + (sort.sort_by && sort.sort_by !== 'Kode' ? ', user_kode ASC' : '')
        const sql = `${USER_SELECT}${filtered.clause} ${order}`
        if (query.export === 'xlsx') {
            const [rows] = await pool.query(`${sql} LIMIT 50000`, filtered.params)
            return sendExcel(res, 'User', ['Kode', 'Nama', 'Cabang'], rows,
                { headLabels: { Kode: 'Kode User', Nama: 'Nama User', Cabang: 'Pabrik / Cabang' }, requestedColumns: req.query.columns })
        }
        if (query.page === undefined && query.per_page === undefined) {
            const [rows] = await pool.query(sql, filtered.params)
            return success(res, rows)
        }
        const page = Math.max(1, parseInt(query.page) || 1), perPage = Math.max(1, Math.min(500, parseInt(query.per_page) || 25))
        const [count] = await pool.query(`SELECT COUNT(*) AS total FROM tuser${filtered.clause}`, filtered.params)
        const [rows] = await pool.query(`${sql} LIMIT ? OFFSET ?`, [...filtered.params, perPage, (page - 1) * perPage])
        return paginated(res, rows, { page, per_page: perPage, total: count[0].total, last_page: Math.ceil(count[0].total / perPage) })
    } catch (err) { return userFailure(res, err, 'Gagal memuat daftar user.') }
}
export const getUser = async (req, res) => {
    try {
        const kode = userCode(req.params.id)
        const [rows] = await pool.query(`${USER_SELECT} WHERE user_kode = ?`, [kode])
        if (!rows.length) throw problem('User tidak ditemukan.', 404)
        return success(res, rows[0])
    } catch (err) { return userFailure(res, err, 'Gagal memuat user.') }
}
export const saveUser = async (req, res) => {
    try {
        const b = req.body || {}, editing = req.method === 'PUT'
        const kode = userCode(editing ? req.params.id : (b.user_kode ?? b.Kode))
        if (editing && (b.user_kode ?? b.Kode) !== undefined && userCode(b.user_kode ?? b.Kode) !== kode) throw problem('Kode user tidak boleh diubah.')
        const nama = text(b.user_nama ?? b.Nama, 'Nama user', 30, true)
        const akses = text(b.user_akses ?? b.Cabang ?? '', 'Kode pabrik', 5)
        const pass = editing ? undefined : text(b.user_password ?? b.USER_PASSWORD ?? b.Password, 'Password awal', 15, true)
        await withUserLock(kode, async conn => {
            const [existing] = await conn.query('SELECT user_kode FROM tuser WHERE user_kode = ?', [kode])
            if (editing && !existing.length) throw problem('User tidak ditemukan.', 404)
            if (!editing && existing.length) throw problem('Kode user sudah digunakan.', 409)
            if (akses) {
                const [pabrik] = await conn.query('SELECT pab_kode FROM tpabrik WHERE pab_kode = ?', [akses])
                if (!pabrik.length) throw problem('Kode pabrik tidak ditemukan.')
            }
            if (editing) await conn.query('UPDATE tuser SET user_nama = ?, user_akses = ? WHERE user_kode = ?', [nama, akses, kode])
            else await conn.query('INSERT INTO tuser (user_kode, user_nama, USER_PASSWORD, date_create, user_edit, user_akses) VALUES (?, ?, ?, NOW(), ?, ?)', [kode, nama, pass, 0, akses])
            clearHakAksesCache(kode)
        })
        return success(res, { user_kode: kode }, editing ? 'User berhasil diperbarui.' : 'User berhasil ditambahkan.', editing ? 200 : 201)
    } catch (err) {
        if (err?.code === 'ER_DUP_ENTRY') return error(res, 'Kode user sudah digunakan.', 409)
        return userFailure(res, err, 'Gagal menyimpan user.')
    }
}
export const deleteUser = async (req, res) => {
    try {
        const kode = userCode(req.params.id)
        await withUserLock(kode, async conn => {
            await requireUser(conn, kode)
            try {
                await conn.query('DELETE FROM thakuser WHERE hak_user_kode = ?', [kode])
                await conn.query('DELETE FROM tuser WHERE user_kode = ?', [kode])
            } catch { throw problem('Penghapusan belum selesai. Sebagian perubahan mungkin tersimpan; muat ulang daftar user.', 500, true) }
            finally { clearHakAksesCache(kode) }
        })
        return success(res, null, 'User berhasil dihapus.')
    } catch (err) { return userFailure(res, err, 'Gagal menghapus user.') }
}
export const resetPassword = async (req, res) => {
    try {
        const kode = userCode(req.params.id)
        const password = text(req.body?.password, 'Password baru', 15, true)
        await withUserLock(kode, async conn => {
            await requireUser(conn, kode)
            await conn.query('UPDATE tuser SET USER_PASSWORD = ? WHERE user_kode = ?', [password, kode])
            clearHakAksesCache(kode)
        })
        return success(res, null, 'Password berhasil diubah.')
    } catch (err) { return userFailure(res, err, 'Gagal mengubah password.') }
}

export const getMenuList = async (req, res, next) => {
    try {
        const [rows] = await pool.query('SELECT men_id, men_nama, men_keterangan, men_modul FROM tmenu ORDER BY men_modul, men_id')
        success(res, rows)
    } catch (err) {
        next(err)
    }
}

export const saveMenu = async (req, res, next) => {
    try {
        const { men_id, men_nama, men_keterangan, men_modul } = req.body || {}
        if (men_id === undefined) return error(res, 'men_id wajib diisi', 400)
        const [exist] = await pool.query('SELECT men_id FROM tmenu WHERE men_id = ?', [men_id])
        if (exist.length > 0) {
            await pool.query('UPDATE tmenu SET men_nama = ?, men_keterangan = ?, men_modul = ? WHERE men_id = ?', [
                men_nama,
                men_keterangan,
                men_modul ?? 1,
                men_id,
            ])
            return success(res, null, 'Menu berhasil diupdate')
        }
        await pool.query('INSERT INTO tmenu (men_id, men_nama, men_keterangan, men_modul) VALUES (?, ?, ?, ?)', [
            men_id,
            men_nama,
            men_keterangan,
            men_modul ?? 1,
        ])
        success(res, null, 'Menu berhasil ditambahkan', 201)
    } catch (err) {
        next(err)
    }
}

/* â”€â”€ Hak akses â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
export const getHakAkses = async (req, res) => {
    try {
        const kode = userCode(req.params.kode)
        await requireUser(pool, kode)
        const [rows] = await pool.query(
            `SELECT m.men_id, m.men_nama, m.men_keterangan, m.men_modul,
                h.hak_user_kode AS view_user,
                h.hak_men_insert, h.hak_men_edit, h.hak_men_delete
             FROM tmenu m LEFT JOIN thakuser h ON h.hak_men_id = m.men_id AND h.hak_user_kode = ?
             ORDER BY m.men_modul, m.men_id`, [kode])
        if (new Set(rows.map(row => row.men_id)).size !== rows.length) throw problem('Data hak akses ganda ditemukan. Periksa data existing sebelum menyimpan.', 409)
        return success(res, rows.map(({ view_user, ...row }) => {
            // Strict comparison matches permission middleware, regardless of DB collation.
            const insert = row.hak_men_insert === 'Y' ? 'Y' : 'N'
            const edit = row.hak_men_edit === 'Y' ? 'Y' : 'N'
            const del = row.hak_men_delete === 'Y' ? 'Y' : 'N'
            return { ...row, view: view_user == null ? 'N' : 'Y', insert, edit, delete: del, hak_men_insert: insert, hak_men_edit: edit, hak_men_delete: del }
        }))
    } catch (err) { return userFailure(res, err, 'Gagal memuat hak akses.') }
}
export const saveHakAkses = async (req, res) => {
    try {
        const kode = userCode(req.params.kode), body = req.body || {}
        if (body.user_kode !== undefined && userCode(body.user_kode) !== kode) throw problem('Kode user pada body berbeda dari URL.')
        if (!Array.isArray(body.items)) throw problem('Daftar hak akses tidak valid.')
        const seen = new Set()
        const items = body.items.map(item => {
            if (!item || !['number', 'string'].includes(typeof item.men_id) || !/^-?\d+$/.test(String(item.men_id))) throw problem('ID modul tidak valid.')
            const id = Number(item.men_id)
            if (!Number.isSafeInteger(id) || seen.has(id)) throw problem('ID modul tidak valid atau berulang.')
            seen.add(id)
            for (const flag of ['view', 'insert', 'edit', 'delete']) {
                if (!['Y', 'N'].includes(item[flag])) throw problem('Flag hak akses harus berupa Y atau N.')
            }
            if (item.view === 'N' && ['insert', 'edit', 'delete'].some(flag => item[flag] === 'Y')) throw problem('Hak aksi memerlukan hak Lihat.')
            return { men_id: id, view: item.view, insert: item.insert, edit: item.edit, delete: item.delete }
        })
        await withUserLock(kode, async conn => {
            await requireUser(conn, kode)
            const [menus] = await conn.query('SELECT men_id FROM tmenu')
            const allowed = new Set(menus.map(row => Number(row.men_id)))
            if (items.some(item => !allowed.has(item.men_id))) throw problem('Modul tidak ditemukan.')
            const [current] = await conn.query('SELECT hak_men_id, hak_men_insert, hak_men_edit, hak_men_delete FROM thakuser WHERE hak_user_kode = ?', [kode])
            const existing = new Map()
            for (const row of current) {
                if (existing.has(Number(row.hak_men_id))) throw problem('Data hak akses ganda ditemukan. Periksa data existing sebelum menyimpan.', 409)
                existing.set(Number(row.hak_men_id), row)
            }
            let attempted = false
            try {
                for (const item of items) {
                    const old = existing.get(item.men_id)
                    if (item.view === 'N') {
                        if (old) { attempted = true; await conn.query('DELETE FROM thakuser WHERE hak_user_kode = ? AND hak_men_id = ?', [kode, item.men_id]) }
                    } else if (!old) {
                        attempted = true
                        await conn.query('INSERT INTO thakuser (hak_user_kode, hak_men_id, hak_men_insert, hak_men_edit, hak_men_delete) VALUES (?, ?, ?, ?, ?)', [kode, item.men_id, item.insert, item.edit, item.delete])
                    } else if (old.hak_men_insert !== item.insert || old.hak_men_edit !== item.edit || old.hak_men_delete !== item.delete) {
                        attempted = true
                        await conn.query('UPDATE thakuser SET hak_men_insert = ?, hak_men_edit = ?, hak_men_delete = ? WHERE hak_user_kode = ? AND hak_men_id = ?', [item.insert, item.edit, item.delete, kode, item.men_id])
                    }
                }
            } catch { throw problem('Penyimpanan belum selesai. Sebagian perubahan mungkin tersimpan; muat ulang hak akses.', 500, true) }
            finally { if (attempted) clearHakAksesCache(kode) }
        })
        clearHakAksesCache(kode)
        return success(res, { user_kode: kode, jumlah: items.filter(item => item.view === 'Y').length }, 'Hak akses berhasil disimpan.')
    } catch (err) { return userFailure(res, err, 'Gagal menyimpan hak akses.') }
}

export const getLookupOptions = async (req, res, next) => {
    try {
        const [[pabrik], [jabatan], [departemen], [statusKerja], [jenisIjin], [jadwal], [keteranganMutasi], [perusahaan]] =
            await Promise.all([
                pool.query('SELECT pab_kode AS Kode, pab_nama AS Nama FROM tpabrik ORDER BY pab_kode'),
                pool.query('SELECT jab_kode AS Kode, jab_nama AS Nama FROM tjabatan ORDER BY jab_kode'),
                pool.query('SELECT dep_kode AS Kode, dep_nama AS Nama FROM tdepartemen ORDER BY dep_kode'),
                pool.query('SELECT sk_id AS Kode, sk_keterangan AS Nama FROM tstatuskaryawan ORDER BY sk_id'),
                pool.query('SELECT ji_id AS Kode, ji_keterangan AS Nama FROM tjenisijin ORDER BY ji_id'),
                pool.query('SELECT jd_id AS Kode, jd_nama_shift AS Nama, jd_jamawal AS JamAwal, jd_jamakhir AS JamAkhir FROM tjadwal ORDER BY jd_id'),
                pool.query('SELECT km_id AS Kode, km_keterangan AS Nama FROM tketeranganmutasi ORDER BY km_id'),
                pool.query('SELECT * FROM tperusahaan LIMIT 1'),
            ])
        success(res, { pabrik, jabatan, departemen, statusKerja, jenisIjin, jadwal, keteranganMutasi, perusahaan: perusahaan[0] || null })
    } catch (err) {
        next(err)
    }
}
