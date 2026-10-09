import jwt from 'jsonwebtoken'
import { success, error } from '../helpers/response.js'
import { cekHak } from '../middleware/permission.js'
import {
    MODUL_KE_FORM,
    buatTantangan,
    buatRespons,
    responsValid,
    tantanganValid,
    normPemberi,
} from '../helpers/otorisasiKode.js'

/**
 * Otorisasi tantangan-respons ala Delphi untuk modul bertanggal
 * (absensi, ijin, lembur).
 *
 *  POST /otorisasi/tantangan   -> { tantangan } (6 digit untuk popup form)
 *  POST /otorisasi/generasi    -> { respons, pemberi } (halaman generator,
 *                                   wajib hak edit pada modul terkait)
 *  POST /otorisasi/verifikasi  -> { token, user_kode } (token JWT dipakai
 *                                   sebagai `otorisasi_token` saat simpan)
 *
 * Token yang diterbitkan kompatibel dengan `userDariToken` tiap modul:
 * payload `{ otorisasi: <kode pemberi>, tipe: <modul> }`.
 */

/** Kode tantangan baru untuk ditampilkan di popup form penyimpan. */
export const mintaTantangan = async (_req, res, next) => {
    try {
        success(res, { tantangan: buatTantangan() })
    } catch (err) {
        next(err)
    }
}

/**
 * Halaman generator (pemberi otorisasi): menukar tantangan + modul menjadi
 * angka respons. Wajib hak edit pada modul terkait.
 */
export const generasiRespons = async (req, res, next) => {
    try {
        const modul = String(req.body?.modul || '').trim()
        const tantangan = String(req.body?.tantangan || '').trim()
        if (!Object.hasOwn(MODUL_KE_FORM, modul)) return error(res, 'Modul tidak dikenal', 400)
        if (!tantanganValid(tantangan)) return error(res, 'Kode tantangan harus 6 digit angka', 400)
        const pemberi = normPemberi(req.user?.user)
        if (!pemberi) return error(res, 'Sesi login tidak valid', 401)
        const boleh = await cekHak(req.user.user, MODUL_KE_FORM[modul], 'edit')
        if (!boleh) return error(res, 'Anda tidak berhak memberi otorisasi modul ini', 403)
        success(res, { respons: buatRespons(modul, tantangan, pemberi), pemberi, modul })
    } catch (err) {
        next(err)
    }
}

/** Verifikasi kode pemberi + respons -> token otorisasi untuk simpan. */
export const verifikasiRespons = async (req, res, next) => {
    try {
        const modul = String(req.body?.modul || '').trim()
        const tantangan = String(req.body?.tantangan || '').trim()
        const pemberi = normPemberi(req.body?.pemberi)
        const respons = String(req.body?.respons || '').trim()
        if (!Object.hasOwn(MODUL_KE_FORM, modul)) return error(res, 'Modul tidak dikenal', 400)
        if (!tantanganValid(tantangan) || !tantanganValid(respons)) {
            return error(res, 'Kode tantangan dan angka respons harus 6 digit angka', 400)
        }
        if (!pemberi) return error(res, 'Kode pemberi wajib diisi', 400)
        if (!responsValid(modul, tantangan, pemberi, respons)) {
            return error(res, 'Angka respons salah atau sudah kedaluwarsa. Minta kode baru dan ulangi.', 401)
        }
        const token = jwt.sign({ otorisasi: pemberi, tipe: modul }, process.env.JWT_SECRET, {
            expiresIn: process.env.OTORISASI_EXPIRES_IN || '10m',
        })
        success(res, { user_kode: pemberi, token }, `Otorisasi diterima oleh ${pemberi}`)
    } catch (err) {
        next(err)
    }
}
