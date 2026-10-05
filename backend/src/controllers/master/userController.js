import pool from '../../config/database.js'
import { success, error } from '../../helpers/response.js'
import { clearHakAksesCache } from '../../middleware/permission.js'

/**
 * Master User & Otorisasi — cerminan `ufrmUser` di program Delphi.
 *
 * tuser    : user_kode, user_nama, USER_PASSWORD (plaintext), user_akses (= KDCABANG)
 * thakuser : hak_user_kode, hak_men_id, hak_men_insert/edit/delete ('Y'/'0')
 * tmenu    : daftar modul yang dipatroli
 */

/* ── User ───────────────────────────────────────────────────────────── */
export const getUserList = async (req, res, next) => {
    try {
        const [rows] = await pool.query(
            'SELECT user_kode AS Kode, user_nama AS Nama, user_akses AS Cabang, user_edit AS Edit, date_create AS Dibuat FROM tuser ORDER BY user_kode'
        )
        success(res, rows)
    } catch (err) {
        next(err)
    }
}

export const getUser = async (req, res, next) => {
    try {
        const [rows] = await pool.query(
            'SELECT user_kode AS Kode, user_nama AS Nama, user_akses AS Cabang, user_edit AS Edit FROM tuser WHERE user_kode = ?',
            [req.params.id]
        )
        if (rows.length === 0) return error(res, 'User tidak ditemukan', 404)
        success(res, rows[0])
    } catch (err) {
        next(err)
    }
}

export const saveUser = async (req, res, next) => {
    try {
        const b = req.body || {}
        const kode = String(b.user_kode || b.Kode || '').trim()
        if (!kode) return error(res, 'Kode user wajib diisi', 400)

        const nama = b.user_nama ?? b.Nama ?? ''
        const akses = b.user_akses ?? b.Cabang ?? ''
        const pass = b.USER_PASSWORD ?? b.user_password ?? b.Password ?? ''

        const [exist] = await pool.query('SELECT user_kode FROM tuser WHERE user_kode = ?', [kode])
        if (exist.length > 0) {
            await pool.query('UPDATE tuser SET user_nama = ?, user_akses = ? WHERE user_kode = ?', [nama, akses, kode])
            if (pass) await pool.query('UPDATE tuser SET USER_PASSWORD = ? WHERE user_kode = ?', [pass, kode])
            clearHakAksesCache(kode)
            return success(res, { user_kode: kode }, 'User berhasil diupdate')
        }

        if (!pass) return error(res, 'Password wajib diisi untuk user baru', 400)
        await pool.query(
            'INSERT INTO tuser (user_kode, user_nama, USER_PASSWORD, date_create, user_edit, user_akses) VALUES (?, ?, ?, NOW(), ?, ?)',
            [kode, nama, pass, 0, akses]
        )
        clearHakAksesCache(kode)
        success(res, { user_kode: kode }, 'User berhasil ditambahkan', 201)
    } catch (err) {
        next(err)
    }
}

export const deleteUser = async (req, res, next) => {
    try {
        const kode = req.params.id
        await pool.query('DELETE FROM thakuser WHERE hak_user_kode = ?', [kode])
        await pool.query('DELETE FROM tuser WHERE user_kode = ?', [kode])
        clearHakAksesCache(kode)
        success(res, null, 'User berhasil dihapus')
    } catch (err) {
        next(err)
    }
}

export const resetPassword = async (req, res, next) => {
    try {
        const { password } = req.body || {}
        if (!password) return error(res, 'Password baru wajib diisi', 400)
        const [r] = await pool.query('UPDATE tuser SET USER_PASSWORD = ? WHERE user_kode = ?', [
            password,
            req.params.id,
        ])
        if (r.affectedRows === 0) return error(res, 'User tidak ditemukan', 404)
        clearHakAksesCache(req.params.id)
        success(res, null, 'Password berhasil diubah')
    } catch (err) {
        next(err)
    }
}

/* ── Menu / modul ───────────────────────────────────────────────────── */
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

/* ── Hak akses ──────────────────────────────────────────────────────── */
export const getHakAkses = async (req, res, next) => {
    try {
        const kode = req.params.kode
        const [rows] = await pool.query(
            `SELECT m.men_id, m.men_nama, m.men_keterangan, m.men_modul,
                    COALESCE(h.hak_men_insert, '0') AS hak_men_insert,
                    COALESCE(h.hak_men_edit,   '0') AS hak_men_edit,
                    COALESCE(h.hak_men_delete, '0') AS hak_men_delete
             FROM tmenu m
             LEFT JOIN thakuser h ON h.hak_men_id = m.men_id AND h.hak_user_kode = ?
             ORDER BY m.men_modul, m.men_id`,
            [kode]
        )
        success(res, rows)
    } catch (err) {
        next(err)
    }
}

/**
 * Simpan hak akses. Body: { user_kode, items: [{ men_id, insert, edit, delete }] }
 * Semua modul tidak ber-flag 'Y' akan dihapus (cerminan Delphi).
 */
export const saveHakAkses = async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
        const kode = req.body?.user_kode || req.params.kode
        const items = Array.isArray(req.body?.items) ? req.body.items : []
        const yn = (v) => (v === true || v === 'Y' || v === 1 || v === '1' ? 'Y' : '0')

        await conn.beginTransaction()
        await conn.query('DELETE FROM thakuser WHERE hak_user_kode = ?', [kode])

        const vals = items
            .map((it) => [kode, it.men_id, yn(it.insert ?? it.hak_men_insert), yn(it.edit ?? it.hak_men_edit), yn(it.delete ?? it.hak_men_delete)])
            .filter((r) => r[2] === 'Y' || r[3] === 'Y' || r[4] === 'Y')

        if (vals.length) await conn.query('INSERT INTO thakuser (hak_user_kode, hak_men_id, hak_men_insert, hak_men_edit, hak_men_delete) VALUES ?', [vals])

        await conn.commit()
        clearHakAksesCache(kode)
        success(res, { user_kode: kode, jumlah: vals.length }, 'Hak akses berhasil disimpan')
    } catch (err) {
        await conn.rollback()
        next(err)
    } finally {
        conn.release()
    }
}

/* ── Lookup gabungan untuk form transaksi ───────────────────────────── */
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
