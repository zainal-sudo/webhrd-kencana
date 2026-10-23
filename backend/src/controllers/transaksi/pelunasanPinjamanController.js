import pool from '../../config/database.js'
import { success, error, paginated } from '../../helpers/response.js'
import { prosesPelunasan, queryPelunasan } from '../../helpers/pelunasanPinjaman.js'
import { sendPelunasanPinjamanExcel } from '../../helpers/pelunasanPinjamanExcel.js'

const handle = fn => async (req, res, next) => {
    try { await fn(req, res) } catch (e) { if (e.statusCode) return error(res, e.message, e.statusCode); next(e) }
}
export const getPelunasan = handle(async (req, res) => {
    const q = queryPelunasan(req.query)
    if (req.query.export === 'xlsx') {
        const [rows] = await pool.query(q.all, q.params)
        if (rows.length !== q.selectedCount) return error(res, 'Sebagian pilihan tidak ditemukan pada periode/filter ini. Muat ulang daftar dan pilih kembali.', 409)
        return await sendPelunasanPinjamanExcel(res, rows, {
            bulan: Number(req.query.bulan), tahun: Number(req.query.tahun),
        })
    }
    const [rows] = await pool.query(q.list, [...q.params, q.per_page, (q.page - 1) * q.per_page])
    const [count] = await pool.query(q.count, q.params)
    paginated(res, rows.map(row => ({ ...row, Key: JSON.stringify([row.Nomor, row.PotonganKe]),
        StatusProses: row.DiprosesPada == null ? 'Belum Diproses' : 'Sudah Diproses' })),
    { page: q.page, per_page: q.per_page, total: count[0].c, last_page: Math.max(1, Math.ceil(count[0].c / q.per_page)) })
})
export const postPelunasan = handle(async (req, res) => success(res, await prosesPelunasan(pool, req.body), 'Pelunasan pinjaman berhasil diproses.'))
