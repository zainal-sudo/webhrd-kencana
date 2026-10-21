import pool from '../config/database.js'
import { success, error } from '../helpers/response.js'
import { createPenilaianTokenService, INVALID_LINK_MESSAGE } from '../services/penilaianTokenService.js'

const service = createPenilaianTokenService(pool)

function handleFailure(res, err, next, isPublic = false) {
    if (err.status) return error(res, isPublic ? INVALID_LINK_MESSAGE : err.message, err.status)
    if (err.code === 'ER_NO_SUCH_TABLE') return error(res, isPublic ? 'Layanan penilaian belum tersedia. Silakan hubungi HR.' : 'Jalankan migrasi 20261021_penilaian_access_token.sql sebelum membuat link penilaian.', 503)
    // Jangan memasukkan parameter/query token ke log error/response publik.
    if (isPublic) return error(res, 'Layanan penilaian sedang tidak tersedia. Silakan coba kembali.', 503)
    next(err)
}

export async function issuePenilaianLink(req, res, next) {
    res.set('Cache-Control', 'no-store')
    try {
        success(res, await service.issue(req.params.nik, req.user?.user), 'Link penilaian dibuat', 201)
    } catch (err) { handleFailure(res, err, next) }
}

export async function accessPenilaian(req, res, next) {
    res.set('Cache-Control', 'no-store')
    res.set('Referrer-Policy', 'no-referrer')
    try {
        success(res, await service.access(req.params.formType, req.body?.token))
    } catch (err) { handleFailure(res, err, next, true) }
}
