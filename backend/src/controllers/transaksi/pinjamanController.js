import pool from '../../config/database.js'
import { success, error, paginated } from '../../helpers/response.js'
import { buildOrderBy, applyAllColumnFilters } from '../../helpers/browse.js'
import { applyKaryawanLookup } from '../../helpers/karyawanLookup.js'
import { sendPinjamanExcel } from '../../helpers/pinjamanExcel.js'
import { tanggalKeluarValid } from '../../helpers/keluar.js'
import { PLAFON_PINJAMAN, PINJAMAN_OPTIONS, nomorPinjamanBerikut, tambahPinjaman, kalkulasiPinjaman, revisionPinjaman, editPinjaman, hapusPinjaman } from '../../helpers/pinjaman.js'

const COLUMNS = {
    Nomor: 'p.nomor_pinjam', Tanggal: 'p.tanggal', Nik: 'p.nik', Nama: 'k.kar_nama', Pabrik: 'k.kar_pab_kode', Bagian: 'k.kar_bagian',
    Pinjam: 'p.pinjam', Cicilan: 'p.angsuran', NominalCicilan: 'CASE WHEN p.periode_potong1 IS NULL AND p.nilai_potong1 IS NULL AND p.periode_potong2 IS NULL AND p.nilai_potong2 IS NULL THEN p.pinjam / NULLIF(p.angsuran, 0) ELSE p.nilai_potong1 END',
    Bank: 'p.bank', Norek: 'p.norek', Bayar: 'p.bayar', SisaBayar: 'GREATEST(p.pinjam - p.bayar, 0)',
    Status: "CASE WHEN p.bayar IS NULL OR p.pinjam IS NULL THEN NULL WHEN p.pinjam - p.bayar > 0 THEN 'Belum Lunas' ELSE 'Lunas' END",
    periode_potong1: 'p.periode_potong1', nilai_potong1: 'p.nilai_potong1',
    periode_potong2: 'p.periode_potong2', nilai_potong2: 'p.nilai_potong2',
    potong1_diproses_pada: 'p.potong1_diproses_pada', potong2_diproses_pada: 'p.potong2_diproses_pada',
}
const FROM = 'FROM tpinjaman p LEFT JOIN tkaryawan k ON k.kar_Nik = p.nik'
const SELECT = `SELECT ${Object.entries(COLUMNS).map(([key, expr]) => `${expr} AS \`${key}\``).join(', ')} ${FROM}`
const EXPORT_MAPPING = { NO: null, NIK: 'Nik', 'NAMA KARYAWAN': 'Nama', UNIT: 'Pabrik', BAGIAN: 'Bagian',
    BANK: 'Bank', 'NO REK': 'Norek', 'PINJAMAN UANG KOPERASI': 'Pinjam', ANGSURAN: 'Cicilan',
    POTONGAN: 'Bayar', 'SALDO POTONGAN': 'SisaBayar' }
const EXPORT_COLUMNS = Object.keys(EXPORT_MAPPING)
const OUTSTANDING_SQL = 'SELECT COALESCE(SUM(CAST(pinjam AS DECIMAL(65,20)) - CAST(bayar AS DECIMAL(65,20))), 0) AS outstanding FROM tpinjaman WHERE pinjam - bayar > 0'
const handle = fn => async (req, res, next) => {
    try { await fn(req, res) } catch (e) { if (e.statusCode) return error(res, e.message, e.statusCode); next(e) }
}
const paging = query => ({ page: Math.max(1, parseInt(query.page) || 1), per_page: Math.max(1, Math.min(500, parseInt(query.per_page) || 50)) })

export const getPinjamanList = handle(async (req, res) => {
    const { page, per_page } = paging(req.query)
    let where = ' WHERE 1=1'
    let params = []
    if (req.query.start_date || req.query.end_date) {
        const { start_date: start, end_date: end } = req.query
        if (!tanggalKeluarValid(start) || !tanggalKeluarValid(end) || start > end) return error(res, 'Periode tidak valid', 400)
        where += ' AND p.tanggal BETWEEN ? AND ?'
        params.push(start, end)
    }
    if (req.query.search) {
        where += ' AND (p.nomor_pinjam LIKE ? OR p.nik LIKE ? OR k.kar_nama LIKE ? OR k.kar_bagian LIKE ? OR p.bank LIKE ? OR p.norek LIKE ?)'
        params.push(...Array(6).fill(`%${req.query.search}%`))
    }
    const filtered = applyAllColumnFilters(where, params, req.query, COLUMNS, req.query.distinct || null)
    where = filtered.clause; params = filtered.params
    if (req.query.distinct) {
        const expr = Object.hasOwn(COLUMNS, req.query.distinct) ? COLUMNS[req.query.distinct] : null
        if (!expr) return error(res, 'Kolom tidak valid', 400)
        const [rows] = await pool.query(`SELECT DISTINCT ${expr} AS value ${FROM}${where} ORDER BY value LIMIT 1000`, params)
        return success(res, rows.map(r => r.value))
    }
    const order = buildOrderBy(req.query, COLUMNS, 'ORDER BY p.tanggal DESC, p.nomor_pinjam DESC')
    if (req.query.export === 'xlsx') {
        const [rows] = await pool.query(`${SELECT}${where} ${order}`, params)
        const [summary] = await pool.query(OUTSTANDING_SQL)
        return sendPinjamanExcel(res, EXPORT_COLUMNS, rows.map(kalkulasiPinjaman).map((row, index) => Object.fromEntries(
            Object.entries(EXPORT_MAPPING).map(([label, key]) => [label, key == null ? index + 1
                : row[key] == null || row[key] === '' ? '—' : key === 'Norek' ? String(row[key]) : row[key]]))), {
            dates: rows.map(row => row.Tanggal),
            sisaBudget: PLAFON_PINJAMAN - Number(summary[0].outstanding),
        })
    }
    const [rows] = await pool.query(`${SELECT}${where} ${order} LIMIT ? OFFSET ?`, [...params, per_page, (page - 1) * per_page])
    const [count] = await pool.query(`SELECT COUNT(*) AS c ${FROM}${where}`, params)
    return paginated(res, rows.map(kalkulasiPinjaman), { page, per_page, total: count[0].c, last_page: Math.max(1, Math.ceil(count[0].c / per_page)) })
})

export const getRingkasanPinjaman = handle(async (_req, res) => {
    const [rows] = await pool.query(OUTSTANDING_SQL)
    const outstanding = Number(rows[0].outstanding)
    success(res, { plafon: PLAFON_PINJAMAN, outstanding, sisa_plafon: PLAFON_PINJAMAN - outstanding })
})
export const getOptionsPinjaman = (_req, res) => success(res, PINJAMAN_OPTIONS)
export const getNomorPinjaman = handle(async (req, res) => success(res, { nomor: await nomorPinjamanBerikut(pool, String(req.query.tanggal ?? '')) }))
export const getDetailPinjaman = handle(async (req, res) => {
    const [rows] = await pool.query(`${SELECT} WHERE p.nomor_pinjam = ?`, [String(req.query.nomor ?? '')])
    if (!rows.length) return error(res, 'Pinjaman tidak ditemukan', 404)
    success(res, { ...kalkulasiPinjaman(rows[0]), revision: revisionPinjaman(rows[0]) })
})
export const lookupKaryawanPinjaman = handle(async (req, res) => {
    const { page, per_page } = paging(req.query)
    let where = ' WHERE k.kar_status_aktif = 1'
    const params = []
    if (req.query.search) {
        where += ' AND (k.kar_Nik LIKE ? OR k.kar_nama LIKE ? OR j.jab_nama LIKE ? OR k.kar_bagian LIKE ? OR k.kar_pab_kode LIKE ?)'
        params.push(...Array(5).fill(`%${req.query.search}%`))
    }
    const filtered = applyKaryawanLookup(req.query, where, params)
    const from = 'FROM tkaryawan k LEFT JOIN tjabatan j ON j.jab_kode = k.kar_jab_kode'
    const [rows] = await pool.query(`SELECT k.kar_Nik AS Nik, k.kar_nama AS Nama, k.kar_pab_kode AS Pabrik,
        k.kar_bagian AS Bagian, j.jab_nama AS Jabatan ${from}${filtered.where} ${filtered.orderBy} LIMIT ? OFFSET ?`, [...params, per_page, (page - 1) * per_page])
    const [count] = await pool.query(`SELECT COUNT(*) AS c ${from}${filtered.where}`, params)
    paginated(res, rows, { page, per_page, total: count[0].c, last_page: Math.max(1, Math.ceil(count[0].c / per_page)) })
})
export const infoKaryawanPinjaman = handle(async (req, res) => {
    const nik = String(req.query.nik ?? '').trim()
    const [rows] = await pool.query(`SELECT kar_Nik AS Nik, kar_nama AS Nama, kar_pab_kode AS Pabrik, kar_bagian AS Bagian
        FROM tkaryawan WHERE kar_Nik = ? AND kar_status_aktif = 1`, [nik])
    if (!rows.length) return error(res, 'Karyawan aktif tidak ditemukan', 404)
    const [aktif] = await pool.query('SELECT nomor_pinjam AS Nomor, bayar AS Bayar, GREATEST(pinjam - bayar, 0) AS SisaBayar FROM tpinjaman WHERE nik = ? AND pinjam - bayar > 0', [nik])
    success(res, { ...rows[0], pinjaman_aktif: aktif })
})
export const savePinjaman = handle(async (req, res) => success(res, await tambahPinjaman(pool, req.body), 'Pinjaman berhasil disimpan.', 201))
export const updatePinjaman = handle(async (req, res) => success(res, await editPinjaman(pool, req.params.nomor, req.body), 'Pinjaman berhasil diubah.'))
export const deletePinjaman = handle(async (req, res) => success(res, await hapusPinjaman(pool, req.params.nomor, req.body), 'Pinjaman dihapus permanen.'))
