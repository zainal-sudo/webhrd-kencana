import pool from '../../config/database.js'
import { success, error, paginated } from '../../helpers/response.js'
import { buildOrderBy, applyAllColumnFilters } from '../../helpers/browse.js'
import { sendExcel } from '../../helpers/excel.js'

// Cerminan `ufrmLapLemburHarilibur.btnRefreshClick`: tanggal Master Hari Libur,
// scan tidak nol, SPL opsional (NIK + tanggal), no Ijin dari `tijin`
// (ij_ji_id = 2), verifikasi dari `tabsensi`, durasi lintas-malam.
const OVERNIGHT = (akhir, awal) =>
    `IF(${akhir}<${awal} AND (${awal}<>'00:00:00' AND ${akhir}<>'00:00:00'),` +
    `SEC_TO_TIME(TIME_TO_SEC(TIMEDIFF('24:00:00',${awal}))+TIME_TO_SEC(TIMEDIFF(${akhir},'00:00:00'))),` +
    `TIMEDIFF(${akhir},${awal}))`
const COLUMNS = {
    Tanggal: 'a.tanggal',
    Kar_Nik: 'k.kar_Nik',
    Nama: 'k.kar_nama',
    Pabrik: 'k.kar_pab_kode',
    Bagian: 'k.kar_bagian',
    Sistem: 'k.kar_sistem_gaji',
    scan1: 'a.scan1',
    scan2: 'a.scan2',
    lama: OVERNIGHT('a.scan2', 'a.scan1'),
    jam_mulai: 's.jam_mulai',
    jam_selesai: 's.jam_selesai',
    lama_lembur: OVERNIGHT('s.jam_selesai', 's.jam_mulai'),
    no_ijin: 'z.ij_nomor',
    verifikasi: 'a.verifikasi',
}
const FROM = `FROM tabsensi a
    INNER JOIN tkaryawan k ON k.kar_kode_absensi = a.nik
    LEFT JOIN (
        SELECT h.lem_tanggal AS tanggal, d.lemd_kar_nik AS nik,
               h.lem_nomor AS nomor, d.lemd_jammulai AS jam_mulai,
               d.lemd_jamakhir AS jam_selesai
        FROM tlembur_hdr h
        INNER JOIN tlembur_dtl d ON d.lemd_lem_nomor = h.lem_nomor
    ) s ON s.tanggal = a.tanggal AND s.nik = k.kar_Nik
    LEFT JOIN tijin z ON z.ij_tanggal = a.tanggal AND z.ij_nik = k.kar_Nik AND z.ij_ji_id = 2`
const SELECT = `SELECT ${Object.entries(COLUMNS).map(([alias, expr]) => `${expr} AS \`${alias}\``).join(', ')} ${FROM}`
const ROW_KEY = "CONCAT(a.nik, '|', a.tanggal, '|', IFNULL(s.nomor, '')) AS _key"

function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
    const date = new Date(`${value}T00:00:00Z`)
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && value >= '1000-01-01'
}

export const getLemburHariLiburList = async (req, res, next) => {
    try {
        const today = new Date().toISOString().slice(0, 10)
        const start = req.query.start_date || `${today.slice(0, 7)}-01`
        const end = req.query.end_date || today
        if (!validDate(start) || !validDate(end) || start > end) return error(res, 'Periode tidak valid', 400)
        const page = Math.max(1, parseInt(req.query.page) || 1)
        const perPage = Math.max(1, Math.min(500, parseInt(req.query.per_page) || 50))
        // EXISTS mencegah penggandaan baris jika tanggal master tercatat berulang.
        let where = ` WHERE a.tanggal BETWEEN ? AND ?
            AND EXISTS (SELECT 1 FROM tharilibur hl WHERE hl.hl_tanggal = a.tanggal)
            AND (a.scan1 > '00:00:00' OR a.scan2 > '00:00:00')`
        const params = [start, end]
        if (req.query.search) {
            where += ' AND (k.kar_Nik LIKE ? OR k.kar_nama LIKE ? OR k.kar_pab_kode LIKE ? OR k.kar_bagian LIKE ?)'
            params.push(...Array(4).fill(`%${req.query.search}%`))
        }
        if (req.query.pabrik) {
            where += ' AND k.kar_pab_kode = ?'
            params.push(req.query.pabrik)
        }
        if (req.query.distinct && COLUMNS[req.query.distinct]) {
            const col = COLUMNS[req.query.distinct]
            const f = applyAllColumnFilters(where, params, req.query, COLUMNS, req.query.distinct)
            const [rows] = await pool.query(
                `SELECT DISTINCT ${col} AS value, OCTET_LENGTH(${col}) AS value_length ${FROM}${f.clause} ORDER BY value`, f.params
            )
            return success(res, rows.map((row) => row.value))
        }
        const f = applyAllColumnFilters(where, params, req.query, COLUMNS)
        const order = buildOrderBy(req.query, COLUMNS, 'ORDER BY a.tanggal, a.scan1, k.kar_Nik, s.nomor')
        if (req.query.export === 'xlsx') {
            const [rows] = await pool.query(`${SELECT}${f.clause} ${order} LIMIT 50000`, f.params)
            return sendExcel(res, 'Lembur-Hari-Libur', Object.keys(COLUMNS), rows,
                { headLabels: { Kar_Nik: 'NIK', scan1: 'Scan 1', scan2: 'Scan 2', jam_mulai: 'Jam Mulai', jam_selesai: 'Jam Selesai', lama_lembur: 'Lama Lembur', no_ijin: 'No Ijin' }, requestedColumns: req.query.columns })
        }
        const [count] = await pool.query(`SELECT COUNT(*) AS total ${FROM}${f.clause}`, f.params)
        const total = Number(count[0].total)
        const [rows] = await pool.query(
            `${SELECT.replace('SELECT ', `SELECT ${ROW_KEY}, a.nik AS \`nik\`, `)}${f.clause} ${order} LIMIT ? OFFSET ?`,
            [...f.params, perPage, (page - 1) * perPage]
        )
        paginated(res, rows, { page, per_page: perPage, total, last_page: Math.ceil(total / perPage) })
    } catch (err) { next(err) }
}

// Padanan popup Delphi `Verifikasi` / `BatalVerifikasi`:
// UPDATE tabsensi SET verifikasi = 0/1 WHERE nik = ? AND tanggal = ?
// `nik` di sini kode absensi (a.nik), sama seperti yang dipakai form Absensi.
export const setVerifikasiLemburHariLibur = async (req, res, next) => {
    try {
        const nik = String(req.body?.nik ?? '').trim()
        const tanggal = String(req.body?.tanggal ?? '').slice(0, 10)
        const verifikasi = Number(req.body?.verifikasi)
        if (!nik) return error(res, 'NIK (kode absensi) wajib diisi', 400)
        if (!validDate(tanggal)) return error(res, 'Tanggal tidak valid', 400)
        if (verifikasi !== 0 && verifikasi !== 1) return error(res, 'Nilai verifikasi harus 0 atau 1', 400)
        const [r] = await pool.query(
            'UPDATE tabsensi SET verifikasi = ? WHERE nik = ? AND tanggal = ?',
            [verifikasi, nik, tanggal]
        )
        if (!r.affectedRows) return error(res, 'Data absensi tidak ditemukan', 404)
        return success(res, { nik, tanggal, verifikasi })
    } catch (err) { next(err) }
}
