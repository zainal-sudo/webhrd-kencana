import pool from '../../config/database.js'
import { success, error, paginated } from '../../helpers/response.js'
import { buildOrderBy, applyAllColumnFilters } from '../../helpers/browse.js'
import { sendExcel } from '../../helpers/excel.js'
import { nomorKeluarBerikut, tanggalKeluarValid, validasiKeluar, tambahKeluar } from '../../helpers/keluar.js'

const LIST_COLUMNS = {
    Nomor: 'x.kl_nomor',
    Tanggal: 'x.kl_tanggal',
    Alasan: 'x.kl_alasan',
    Keterangan: 'x.kl_ket',
    Nik: 'x.kl_nik',
    Nama: 'k.kar_nama',
    Pabrik: 'k.kar_pab_kode',
    Jabatan: 'j.jab_nama',
    Bagian: 'k.kar_bagian',
    Status: `CASE WHEN k.kar_Nik IS NULL THEN '' WHEN k.kar_status_aktif = 1 THEN 'Aktif' ELSE 'Non Aktif' END`,
}
// Tetap tampilkan dokumen keluar meskipun referensi master lama tidak tersedia.
const FROM_SQL = `FROM tkeluar x
    LEFT JOIN tkaryawan k ON k.kar_Nik = x.kl_nik
    LEFT JOIN tjabatan j ON j.jab_kode = k.kar_jab_kode`
const SELECT_SQL = `SELECT ${Object.entries(LIST_COLUMNS).map(([alias, expr]) => `${expr} AS \`${alias}\``).join(', ')} ${FROM_SQL}`

export const getKeluarList = async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1)
        const perPage = Math.max(1, Math.min(500, parseInt(req.query.per_page) || 50))
        const start = req.query.start_date || `${new Date().toISOString().slice(0, 7)}-01`
        const end = req.query.end_date || new Date().toISOString().slice(0, 10)
        if (!tanggalKeluarValid(start) || !tanggalKeluarValid(end) || start > end) return error(res, 'Periode tidak valid', 400)
        let where = ' WHERE x.kl_tanggal BETWEEN ? AND ?'
        let params = [start, end]
        if (req.query.search) {
            where += ' AND (x.kl_nomor LIKE ? OR x.kl_nik LIKE ? OR k.kar_nama LIKE ? OR x.kl_alasan LIKE ? OR x.kl_ket LIKE ?)'
            params.push(...Array(5).fill(`%${req.query.search}%`))
        }
        if (req.query.pabrik) {
            where += ' AND k.kar_pab_kode = ?'
            params.push(req.query.pabrik)
        }
        if (req.query.distinct && LIST_COLUMNS[req.query.distinct]) {
            const col = LIST_COLUMNS[req.query.distinct]
            const f = applyAllColumnFilters(where, params, req.query, LIST_COLUMNS, req.query.distinct)
            const [rows] = await pool.query(
                `SELECT DISTINCT ${col} AS value ${FROM_SQL}${f.clause} AND ${col} IS NOT NULL AND ${col} <> '' ORDER BY value LIMIT 500`, f.params
            )
            return success(res, rows.map((r) => r.value))
        }
        const f = applyAllColumnFilters(where, params, req.query, LIST_COLUMNS)
        const order = buildOrderBy(req.query, LIST_COLUMNS, 'ORDER BY x.kl_tanggal DESC, x.kl_nomor DESC')
        if (req.query.export === 'xlsx') {
            const [rows] = await pool.query(`${SELECT_SQL}${f.clause} ${order} LIMIT 50000`, f.params)
            return sendExcel(res, 'Karyawan-Keluar', Object.keys(LIST_COLUMNS), rows)
        }
        const [cnt] = await pool.query(`SELECT COUNT(*) AS total ${FROM_SQL}${f.clause}`, f.params)
        const total = cnt[0].total
        const [rows] = await pool.query(`${SELECT_SQL}${f.clause} ${order} LIMIT ? OFFSET ?`, [...f.params, perPage, (page - 1) * perPage])
        paginated(res, rows, { page, per_page: perPage, total, last_page: Math.ceil(total / perPage) })
    } catch (err) { next(err) }
}

export const getKeluar = async (req, res, next) => {
    try {
        const nomor = String(req.query.nomor || '')
        if (!nomor) return error(res, 'Nomor wajib diisi', 400)
        const [rows] = await pool.query(
            `SELECT x.kl_nomor AS nomor, x.kl_tanggal AS tanggal, x.kl_nik AS nik,
                    x.kl_alasan AS alasan, x.kl_ket AS keterangan, k.kar_nama AS nama,
                    k.kar_pab_kode AS pabrik, k.kar_jab_kode AS jabatan_kode,
                    j.jab_nama AS jabatan, k.kar_bagian AS bagian ${FROM_SQL} WHERE x.kl_nomor = ?`, [nomor]
        )
        if (!rows.length) return error(res, 'Dokumen Karyawan Keluar tidak ditemukan', 404)
        success(res, rows[0])
    } catch (err) { next(err) }
}

export const getNomorKeluar = async (req, res, next) => {
    try {
        const tanggal = String(req.query.tanggal || new Date().toISOString().slice(0, 10))
        if (!tanggalKeluarValid(tanggal)) return error(res, 'Tanggal keluar tidak valid', 400)
        success(res, { nomor: await nomorKeluarBerikut(pool, tanggal) })
    } catch (err) { next(err) }
}

export const getAlasanKeluar = async (_req, res, next) => {
    try {
        const [rows] = await pool.query("SELECT DISTINCT kl_alasan AS alasan FROM tkeluar WHERE kl_alasan IS NOT NULL AND TRIM(kl_alasan) <> '' ORDER BY kl_alasan")
        success(res, [...new Set(['Lain lain', ...rows.map((r) => r.alasan)])])
    } catch (err) { next(err) }
}

export const lookupKaryawanKeluar = async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1)
        const perPage = Math.max(1, Math.min(200, parseInt(req.query.per_page) || 25))
        const q = `%${String(req.query.search || '').trim()}%`
        const where = ' WHERE k.kar_Nik LIKE ? OR k.kar_nama LIKE ?'
        const [rows] = await pool.query(
            `SELECT k.kar_Nik AS Nik, k.kar_nama AS Nama, k.kar_pab_kode AS Pabrik,
                    k.kar_jab_kode AS Jabatan_Kode, j.jab_nama AS Jabatan, k.kar_bagian AS Bagian,
                    IF(k.kar_status_aktif = 1, 'Aktif', 'Non Aktif') AS Status
             FROM tkaryawan k LEFT JOIN tjabatan j ON j.jab_kode = k.kar_jab_kode${where}
             ORDER BY k.kar_nama LIMIT ? OFFSET ?`, [q, q, perPage, (page - 1) * perPage]
        )
        const [cnt] = await pool.query(`SELECT COUNT(*) AS total FROM tkaryawan k${where}`, [q, q])
        paginated(res, rows, { page, per_page: perPage, total: cnt[0].total, last_page: Math.ceil(cnt[0].total / perPage) })
    } catch (err) { next(err) }
}

export const infoKaryawanKeluar = async (req, res, next) => {
    try {
        const nik = String(req.query.nik || '').trim()
        if (!nik) return error(res, 'NIK wajib diisi', 400)
        const [rows] = await pool.query(
            `SELECT k.kar_nama AS nama, k.kar_pab_kode AS pabrik, k.kar_jab_kode AS jabatan_kode,
                    j.jab_nama AS jabatan, k.kar_bagian AS bagian
             FROM tkaryawan k LEFT JOIN tjabatan j ON j.jab_kode = k.kar_jab_kode WHERE k.kar_Nik = ?`, [nik]
        )
        if (!rows.length) return error(res, 'NIK tidak ditemukan di Master Karyawan', 404)
        success(res, rows[0])
    } catch (err) { next(err) }
}

/** Operasi satu row. Side effect tanggal keluar tetap ditangani trigger existing. */
export const saveKeluar = async (req, res, next) => {
    try {
        let data
        try { data = validasiKeluar(req.body || {}) } catch (err) { return error(res, err.message, 400) }
        const [karyawan] = await pool.query('SELECT kar_Nik FROM tkaryawan WHERE kar_Nik = ? LIMIT 1', [data.nik])
        if (!karyawan.length) return error(res, 'NIK tidak ditemukan di Master Karyawan', 400)
        let nomor
        if (req.method === 'PUT') {
            nomor = String(req.params.nomor || '')
            const [existing] = await pool.query('SELECT kl_nik FROM tkeluar WHERE kl_nomor = ?', [nomor])
            if (!existing.length) return error(res, 'Dokumen Karyawan Keluar tidak ditemukan', 404)
            // Trigger UPDATE hanya menangani NEW; pindah NIK akan meninggalkan tanggal keluar NIK lama.
            if (existing[0].kl_nik !== data.nik) return error(res, 'NIK dokumen tersimpan tidak dapat diganti. Aturan koreksi NIK perlu dikonfirmasi terlebih dahulu.', 400)
            await pool.query('UPDATE tkeluar SET kl_tanggal = ?, kl_alasan = ?, kl_ket = ? WHERE kl_nomor = ?', [data.tanggal, data.alasan, data.keterangan, nomor])
        } else if (req.method === 'POST') {
            nomor = await tambahKeluar(pool, data)
        } else return error(res, 'Method tidak didukung', 405)
        success(res, { nomor }, `Karyawan Keluar berhasil disimpan dengan nomor ${nomor}`)
    } catch (err) { next(err) }
}

export const deleteKeluar = async (req, res, next) => {
    try {
        const nomor = String(req.params.nomor || '')
        if (!nomor) return error(res, 'Nomor wajib diisi', 400)
        const [existing] = await pool.query('SELECT kl_nik FROM tkeluar WHERE kl_nomor = ?', [nomor])
        if (!existing.length) return error(res, 'Dokumen Karyawan Keluar tidak ditemukan', 404)
        const [other] = await pool.query('SELECT kl_nomor FROM tkeluar WHERE kl_nik = ? AND kl_nomor <> ? LIMIT 1', [existing[0].kl_nik, nomor])
        // DELETE trigger mengosongkan tanggal keluar walaupun ada dokumen lain: jangan menebak reversal.
        if (other.length) return error(res, 'Karyawan memiliki dokumen keluar lain. Penghapusan perlu ditinjau agar tanggal keluar master tidak terhapus keliru.', 409)
        const [result] = await pool.query('DELETE FROM tkeluar WHERE kl_nomor = ?', [nomor])
        if (!result.affectedRows) return error(res, 'Dokumen Karyawan Keluar tidak ditemukan', 404)
        success(res, null, 'Dokumen Karyawan Keluar berhasil dihapus')
    } catch (err) { next(err) }
}
