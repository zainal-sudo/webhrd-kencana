import jwt from 'jsonwebtoken'
import pool from '../../config/database.js'
import { success, error } from '../../helpers/response.js'
import { getMenuUser, getHakAkses } from '../../middleware/permission.js'

/**
 * Autentikasi —/users dari tabel `tuser` dengan `USER_PASSWORD` plaintext,
 * meniru program Delphi (Ulib.pas / MAIN.pas).
 */

const signToken = (user) =>
    jwt.sign({ user: user.user_kode, nama: user.user_nama, cabang: user.user_akses }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || '8h',
    })

/** Sanitasi input: user_kode spasi/uppercase, password apa adanya. */
export const login = async (req, res, next) => {
    try {
        const kode = String(req.body?.user_kode ?? req.body?.username ?? '').trim().toUpperCase()
        const password = req.body?.user_password ?? req.body?.password ?? ''

        if (!kode || !password) return error(res, 'Kode user dan password wajib diisi', 400)

        const [rows] = await pool.query(
            'SELECT user_kode, user_nama, USER_PASSWORD, user_akses FROM tuser WHERE user_kode = ?',
            [kode]
        )
        if (rows.length === 0) return error(res, 'Kode user atau password salah', 401)

        const u = rows[0]
        if (String(u.USER_PASSWORD) !== String(password)) {
            return error(res, 'Kode user atau password salah', 401)
        }

        const menus = await getMenuUser(u.user_kode)
        await pool.query('UPDATE tuser SET date_modify = NOW() WHERE user_kode = ?', [u.user_kode])

        success(res, {
            token: signToken(u),
            user: {
                user_kode: u.user_kode,
                user_nama: u.user_nama,
                user_akses: u.user_akses,
                cabang: u.user_akses,
            },
            menus,
        }, 'Login berhasil')
    } catch (err) {
        next(err)
    }
}

/** Profil + hak akses lengkap (dipanggil setelah refresh halaman). */
export const me = async (req, res, next) => {
    try {
        const kode = req.user.user
        const [rows] = await pool.query(
            'SELECT user_kode, user_nama, user_akses, date_modify FROM tuser WHERE user_kode = ?',
            [kode]
        )
        if (rows.length === 0) return error(res, 'User tidak ditemukan', 404)
        const menus = await getMenuUser(kode)
        success(res, {
            user_kode: rows[0].user_kode,
            user_nama: rows[0].user_nama,
            user_akses: rows[0].user_akses,
            cabang: rows[0].user_akses,
            terakhir_masuk: rows[0].date_modify,
            menus,
        })
    } catch (err) {
        next(err)
    }
}

export const changePassword = async (req, res, next) => {
    try {
        const kode = req.user.user
        const { password_lama, password_baru } = req.body || {}
        if (!password_lama || !password_baru) return error(res, 'Password lama dan baru wajib diisi', 400)

        const [rows] = await pool.query('SELECT USER_PASSWORD FROM tuser WHERE user_kode = ?', [kode])
        if (rows.length === 0) return error(res, 'User tidak ditemukan', 404)
        if (String(rows[0].USER_PASSWORD) !== String(password_lama)) {
            return error(res, 'Password lama salah', 400)
        }

        await pool.query('UPDATE tuser SET USER_PASSWORD = ? WHERE user_kode = ?', [password_baru, kode])
        success(res, null, 'Password berhasil diubah')
    } catch (err) {
        next(err)
    }
}

/** Logout hanya menghapus daftar token sisi server bila ada; token stateless. */
export const logout = async (req, res) => {
    success(res, null, 'Logout berhasil')
}

/**
 * Cek satu hak akses dari sisi frontend (menyembunyikan tombol).
 * GET /auth/cek-hak?form=frmKaryawan&aksi=insert
 */
export const cekHakAkses = async (req, res, next) => {
    try {
        const kode = req.user.user
        const map = await getHakAkses(kode)
        const form = req.query.form || ''
        const aksi = req.query.aksi || 'view'
        const key = Object.keys(map).find((k) => k.toLowerCase() === form.toLowerCase())
        if (!key) return success(res, { form, aksi, boleh: false })
        const h = map[key]
        const boleh = aksi === 'view' ? true : !!h[aksi]
        success(res, { form, aksi, boleh })
    } catch (err) {
        next(err)
    }
}
