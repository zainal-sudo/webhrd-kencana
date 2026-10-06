import pool from '../../config/database.js'
import { success, error, paginated } from '../../helpers/response.js'
import { buildOrderBy, applyAllColumnFilters } from '../../helpers/browse.js'
import { sendExcel } from '../../helpers/excel.js'

/**
 * Modul Laporan kehadiran — cerminan unit Delphi:
 *   ufrmLapTidakMasuk    (frmLapTidakMasuk)    -> status=0, bukan Minggu,
 *     karyawan aktif, bukan hari libur + aksi Alpha/Jadwal-Libur otomatis
 *   ufrmLapKeterlambatan (frmLapKeterlambatan) -> status=2 + ijin Terlambat
 *   ufrmLapPulangdulu    (frmLapPulangdulu)    -> status=1, keluar > scan2
 *
 * Ketiga query Delphi TIDAK memfilter pabrik (tampil lintas pabrik) —
 * versi web mempertahankan itu; filter tersedia lewat search + filter
 * kolom server-side. Popup Delphi (Buatkan Ijin / Edit Absensi) di web
 * menjadi tombol aksi baris menuju form Ijin (prefill nik+tanggal+jenis)
 * dan form Absensi.
 */

const HARI = `CASE DAYNAME(%s)
    WHEN 'Monday' THEN 'Senin' WHEN 'Tuesday' THEN 'Selasa'
    WHEN 'Wednesday' THEN 'Rabu' WHEN 'Thursday' THEN 'Kamis'
    WHEN 'Friday' THEN 'Jumat' WHEN 'Saturday' THEN 'Sabtu'
    ELSE 'Minggu' END`

const KETERANGAN_IJIN = `IF(i.ij_keterangan = 0, 'Sakit', IF(i.ij_keterangan = 1, 'Ijin', IF(i.ij_keterangan = 2, 'Alpha', 'Lain Lain')))`

/* ── Tidak Masuk ── */
const TM_COLUMNS = {
    Kode: 'a.nik',
    Nik: 'k.kar_Nik',
    Nama: 'k.kar_nama',
    Pabrik: 'k.kar_pab_kode',
    Jabatan: 'j.jab_nama',
    Bagian: 'k.kar_bagian',
    Tanggal: 'a.tanggal',
    Hari: HARI.replace('%s', 'a.tanggal'),
    Jenis_Ijin: 'ji.ji_keterangan',
    Alasan: 'i.ij_alasan',
    Keterangan: KETERANGAN_IJIN,
    SistemGaji: 'k.kar_sistem_gaji',
}

const TM_FROM = `FROM tabsensi a
    INNER JOIN tkaryawan k ON k.kar_kode_absensi = a.nik
    LEFT JOIN tijin i ON i.ij_nik = k.kar_Nik AND i.ij_tanggal = a.tanggal
    LEFT JOIN tjenisijin ji ON ji.ji_id = i.ij_ji_id
    LEFT JOIN tharilibur h ON h.hl_tanggal = a.tanggal
    LEFT JOIN tjabatan j ON j.jab_kode = k.kar_jab_kode`

const TM_BASE = ` WHERE a.status = 0 AND DAYNAME(a.tanggal) <> 'Sunday'
    AND k.kar_status_aktif = 1 AND h.hl_keterangan IS NULL
    AND a.tanggal BETWEEN ? AND ?`

const TM_SELECT = `SELECT ${Object.entries(TM_COLUMNS)
    .map(([alias, expr]) => `${expr} AS \`${alias}\``)
    .join(', ')} ${TM_FROM}`

function periode(req) {
    const start = req.query.start_date || req.body?.start_date || `${new Date().toISOString().slice(0, 7)}-01`
    const end = req.query.end_date || req.body?.end_date || new Date().toISOString().slice(0, 10)
    return [start, end]
}

function tambahSearch(where, params, req) {
    if (req.query.search || req.body?.search) {
        const q = req.query.search || req.body.search
        where += ' AND (k.kar_Nik LIKE ? OR k.kar_nama LIKE ? OR k.kar_bagian LIKE ? OR i.ij_alasan LIKE ?)'
        params = [...params, ...Array(4).fill(`%${q}%`)]
    }
    return [where, params]
}

/** Daftar tidak masuk per periode. */
export const getTidakMasukList = async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1)
        const perPage = Math.min(500, parseInt(req.query.per_page) || 25)
        const offset = (page - 1) * perPage
        const [start, end] = periode(req)

        let [where, params] = tambahSearch(TM_BASE, [start, end], req)

        if (req.query.distinct && TM_COLUMNS[req.query.distinct]) {
            const dcol = TM_COLUMNS[req.query.distinct]
            const scoped = applyAllColumnFilters(where, params, req.query, TM_COLUMNS, req.query.distinct)
            const dwhere = scoped.clause ? `${scoped.clause} AND` : 'WHERE'
            const [drows] = await pool.query(
                `SELECT DISTINCT ${dcol} AS value ${TM_FROM} ${dwhere} ${dcol} IS NOT NULL AND ${dcol} <> '' ORDER BY value LIMIT 500`,
                scoped.params
            )
            return success(res, drows.map((r) => r.value))
        }

        const f = applyAllColumnFilters(where, params, req.query, TM_COLUMNS)
        where = f.clause
        params = f.params
        const orderBy = buildOrderBy(req.query, TM_COLUMNS, 'ORDER BY a.tanggal DESC, k.kar_nama')

        if (req.query.export === 'xlsx') {
            const [all] = await pool.query(`${TM_SELECT}${where} ${orderBy} LIMIT 50000`, params)
            return sendExcel(res, 'Tidak-Masuk', Object.keys(TM_COLUMNS), all)
        }

        const [cnt] = await pool.query(`SELECT COUNT(*) AS total ${TM_FROM}${where}`, params)
        const total = cnt[0].total
        const [rows] = await pool.query(`${TM_SELECT}${where} ${orderBy} LIMIT ? OFFSET ?`, [
            ...params,
            perPage,
            offset,
        ])
        paginated(res, rows, { page, per_page: perPage, total, last_page: Math.ceil(total / perPage) })
    } catch (err) {
        next(err)
    }
}

/**
 * Aksi massal laporan tidak masuk (cxButton5 / cxButton9 Delphi).
 * Hanya baris yang BELUM punya ijin (Jenis_Ijin NULL) yang dibuatkan,
 * mengikuti filter pencarian yang sedang aktif.
 *
 * @param {'alpha'|'jadwal-libur'} mode alpha -> ji 3/ket 2/'Otomatis';
 *   jadwal-libur -> ji 3/ket 3/'Jadwal Libur Otomatis'
 */
async function ijinOtomatis(req, res, next, mode) {
    const conn = await pool.getConnection()
    try {
        const [start, end] = periode(req)
        let [where, params] = tambahSearch(TM_BASE, [start, end], req)
        const f = applyAllColumnFilters(where, params, req.query, TM_COLUMNS)
        where = `${f.clause} AND ji.ji_keterangan IS NULL`
        params = f.params

        const [rows] = await pool.query(
            `SELECT k.kar_Nik AS nik, a.tanggal AS tanggal ${TM_FROM}${where} ORDER BY a.tanggal, k.kar_Nik`,
            params
        )
        if (rows.length === 0) {
            return success(res, { jumlah: 0 }, 'Tidak ada baris tanpa ijin pada filter ini')
        }

        const keterangan = mode === 'alpha' ? 2 : 3
        const alasan = mode === 'alpha' ? 'Otomatis' : 'Jadwal Libur Otomatis'
        const pad4 = (n) => String(10000 + n).slice(-4)
        const prefixOf = (tgl) => `IJN.${String(tgl).slice(0, 7).replace('-', '')}.`

        await conn.beginTransaction()
        const seqPerBulan = new Map()
        for (const prefix of new Set(rows.map((r) => prefixOf(String(r.tanggal))))) {
            const [m] = await conn.query('SELECT MAX(RIGHT(ij_nomor, 4)) AS m FROM tijin WHERE ij_nomor LIKE ?', [
                `${prefix}%`,
            ])
            seqPerBulan.set(prefix, m[0]?.m ? parseInt(m[0].m, 10) : 0)
        }
        let jumlah = 0
        for (const r of rows) {
            const tgl = String(r.tanggal).slice(0, 10)
            // Lewati bila barisnya sudah berijin (dibuat user lain bersamaan).
            const [ada] = await conn.query('SELECT 1 FROM tijin WHERE ij_tanggal = ? AND ij_nik = ? LIMIT 1', [
                tgl,
                r.nik,
            ])
            if (ada.length > 0) continue
            const prefix = prefixOf(tgl)
            const seq = seqPerBulan.get(prefix) + 1
            seqPerBulan.set(prefix, seq)
            await conn.query(
                `INSERT INTO tijin (ij_nomor, ij_ji_id, ij_tanggal, ij_nik, ij_keterangan, ij_alasan)
                 VALUES (?, 3, ?, ?, ?, ?)`,
                [`${prefix}${pad4(seq)}`, tgl, r.nik, keterangan, alasan]
            )
            jumlah += 1
        }
        await conn.commit()
        success(
            res,
            { jumlah },
            mode === 'alpha'
                ? `Proses ijin Alpha otomatis berhasil (${jumlah} baris)`
                : `Proses ijin Jadwal Libur otomatis berhasil (${jumlah} baris)`
        )
    } catch (err) {
        try {
            await conn.rollback()
        } catch {
            /* abaikan */
        }
        next(err)
    } finally {
        conn.release()
    }
}

export const alphaOtomatis = (req, res, next) => ijinOtomatis(req, res, next, 'alpha')
export const jadwalLiburOtomatis = (req, res, next) => ijinOtomatis(req, res, next, 'jadwal-libur')

/* ── Keterlambatan ── */
const TL_COLUMNS = {
    Kode: 'a.nik',
    Nik: 'k.kar_Nik',
    Nama: 'k.kar_nama',
    Pabrik: 'k.kar_pab_kode',
    Tanggal: 'a.tanggal',
    Bagian: 'k.kar_bagian',
    Jabatan: 'j.jab_nama',
    Hari: HARI.replace('%s', 'a.tanggal'),
    Masuk: 'a.masuk',
    Scan1: 'a.scan1',
    Jenis_Ijin: 'ji.ji_keterangan',
    Alasan: 'i.ij_alasan',
}

const TL_FROM = `FROM tabsensi a
    INNER JOIN tkaryawan k ON k.kar_kode_absensi = a.nik
    INNER JOIN tjabatan j ON j.jab_kode = k.kar_jab_kode
    LEFT JOIN tijin i ON i.ij_nik = k.kar_Nik AND i.ij_tanggal = a.tanggal AND i.ij_ji_id = 1
    LEFT JOIN tjenisijin ji ON ji.ji_id = i.ij_ji_id`

const TL_BASE = ` WHERE a.status = 2 AND DAYNAME(a.tanggal) <> 'Sunday'
    AND k.kar_status_aktif = 1 AND a.tanggal BETWEEN ? AND ?`

const TL_SELECT = `SELECT ${Object.entries(TL_COLUMNS)
    .map(([alias, expr]) => `${expr} AS \`${alias}\``)
    .join(', ')} ${TL_FROM}`

/** Daftar keterlambatan per periode. */
export const getKeterlambatanList = async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1)
        const perPage = Math.min(500, parseInt(req.query.per_page) || 25)
        const offset = (page - 1) * perPage
        const [start, end] = periode(req)

        let where = TL_BASE
        let params = [start, end]
        if (req.query.search) {
            where += ' AND (k.kar_Nik LIKE ? OR k.kar_nama LIKE ? OR k.kar_bagian LIKE ?)'
            params = [...params, ...Array(3).fill(`%${req.query.search}%`)]
        }

        if (req.query.distinct && TL_COLUMNS[req.query.distinct]) {
            const dcol = TL_COLUMNS[req.query.distinct]
            const scoped = applyAllColumnFilters(where, params, req.query, TL_COLUMNS, req.query.distinct)
            const dwhere = scoped.clause ? `${scoped.clause} AND` : 'WHERE'
            const [drows] = await pool.query(
                `SELECT DISTINCT ${dcol} AS value ${TL_FROM} ${dwhere} ${dcol} IS NOT NULL AND ${dcol} <> '' ORDER BY value LIMIT 500`,
                scoped.params
            )
            return success(res, drows.map((r) => r.value))
        }

        const f = applyAllColumnFilters(where, params, req.query, TL_COLUMNS)
        where = f.clause
        params = f.params
        const orderBy = buildOrderBy(req.query, TL_COLUMNS, 'ORDER BY a.tanggal DESC, k.kar_nama')

        if (req.query.export === 'xlsx') {
            const [all] = await pool.query(`${TL_SELECT}${where} ${orderBy} LIMIT 50000`, params)
            return sendExcel(res, 'Keterlambatan', Object.keys(TL_COLUMNS), all)
        }

        const [cnt] = await pool.query(`SELECT COUNT(*) AS total ${TL_FROM}${where}`, params)
        const total = cnt[0].total
        const [rows] = await pool.query(`${TL_SELECT}${where} ${orderBy} LIMIT ? OFFSET ?`, [
            ...params,
            perPage,
            offset,
        ])
        paginated(res, rows, { page, per_page: perPage, total, last_page: Math.ceil(total / perPage) })
    } catch (err) {
        next(err)
    }
}

/* ── Pulang Mendahului ── */
const PD_COLUMNS = {
    Kode: 'a.nik',
    Nik: 'k.kar_Nik',
    Nama: 'k.kar_nama',
    Pabrik: 'k.kar_pab_kode',
    Tanggal: 'a.tanggal',
    Bagian: 'k.kar_bagian',
    Jabatan: 'j.jab_nama',
    Hari: HARI.replace('%s', 'a.tanggal'),
    Keluar: 'a.keluar',
    Scan2: 'a.scan2',
    Jenis_Ijin: 'ji.ji_keterangan',
    Jam: 'FORMAT((TIME_TO_SEC(TIMEDIFF(a.keluar, a.scan2))) / 3600, 2)',
}

const PD_FROM = `FROM tabsensi a
    INNER JOIN tkaryawan k ON k.kar_kode_absensi = a.nik
    INNER JOIN tjabatan j ON j.jab_kode = k.kar_jab_kode
    LEFT JOIN tijin i ON i.ij_nik = k.kar_Nik AND i.ij_tanggal = a.tanggal
    LEFT JOIN tjenisijin ji ON ji.ji_id = i.ij_ji_id`

const PD_BASE = ` WHERE a.status = 1 AND k.kar_status_aktif = 1
    AND a.keluar > a.scan2 AND a.tanggal BETWEEN ? AND ?`

const PD_SELECT = `SELECT ${Object.entries(PD_COLUMNS)
    .map(([alias, expr]) => `${expr} AS \`${alias}\``)
    .join(', ')} ${PD_FROM}`

/** Daftar pulang mendahului per periode. */
export const getPulangDuluList = async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1)
        const perPage = Math.min(500, parseInt(req.query.per_page) || 25)
        const offset = (page - 1) * perPage
        const [start, end] = periode(req)

        let where = PD_BASE
        let params = [start, end]
        if (req.query.search) {
            where += ' AND (k.kar_Nik LIKE ? OR k.kar_nama LIKE ? OR k.kar_bagian LIKE ?)'
            params = [...params, ...Array(3).fill(`%${req.query.search}%`)]
        }

        if (req.query.distinct && PD_COLUMNS[req.query.distinct]) {
            const dcol = PD_COLUMNS[req.query.distinct]
            const scoped = applyAllColumnFilters(where, params, req.query, PD_COLUMNS, req.query.distinct)
            const dwhere = scoped.clause ? `${scoped.clause} AND` : 'WHERE'
            const [drows] = await pool.query(
                `SELECT DISTINCT ${dcol} AS value ${PD_FROM} ${dwhere} ${dcol} IS NOT NULL AND ${dcol} <> '' ORDER BY value LIMIT 500`,
                scoped.params
            )
            return success(res, drows.map((r) => r.value))
        }

        const f = applyAllColumnFilters(where, params, req.query, PD_COLUMNS)
        where = f.clause
        params = f.params
        const orderBy = buildOrderBy(req.query, PD_COLUMNS, 'ORDER BY a.tanggal DESC, k.kar_nama')

        if (req.query.export === 'xlsx') {
            const [all] = await pool.query(`${PD_SELECT}${where} ${orderBy} LIMIT 50000`, params)
            return sendExcel(res, 'Pulang-Dulu', Object.keys(PD_COLUMNS), all)
        }

        const [cnt] = await pool.query(`SELECT COUNT(*) AS total ${PD_FROM}${where}`, params)
        const total = cnt[0].total
        const [rows] = await pool.query(`${PD_SELECT}${where} ${orderBy} LIMIT ? OFFSET ?`, [
            ...params,
            perPage,
            offset,
        ])
        paginated(res, rows, { page, per_page: perPage, total, last_page: Math.ceil(total / perPage) })
    } catch (err) {
        next(err)
    }
}

/* ── Absen Tidak Lengkap / Tidak Absen Keluar (ufrmLapTidakKeluar) ──
 * status <> 0, karyawan aktif, salah satu scan 00:00:00.
 * Popup Delphi: Buatkan Ijin (jenis 1/Terlambat), Edit Absensi. */
const TK_COLUMNS = {
    Kode: 'a.nik',
    Nik: 'k.kar_Nik',
    Nama: 'k.kar_nama',
    Pabrik: 'k.kar_pab_kode',
    Tanggal: 'a.tanggal',
    Hari: HARI.replace('%s', 'a.tanggal'),
    Scan1: 'a.scan1',
    Scan2: 'a.scan2',
    Jenis_Ijin: 'ji.ji_keterangan',
}

const TK_FROM = `FROM tabsensi a
    INNER JOIN tkaryawan k ON k.kar_kode_absensi = a.nik
    LEFT JOIN tijin i ON i.ij_nik = k.kar_Nik AND i.ij_tanggal = a.tanggal
    LEFT JOIN tjenisijin ji ON ji.ji_id = i.ij_ji_id`

const TK_BASE = ` WHERE a.status <> 0 AND k.kar_status_aktif = 1
    AND (a.scan1 = '00:00:00' OR a.scan2 = '00:00:00')
    AND a.tanggal BETWEEN ? AND ?`

const TK_SELECT = `SELECT ${Object.entries(TK_COLUMNS)
    .map(([alias, expr]) => `${expr} AS \`${alias}\``)
    .join(', ')} ${TK_FROM}`

/** Daftar absen tidak lengkap per periode. */
export const getTidakKeluarList = async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1)
        const perPage = Math.min(500, parseInt(req.query.per_page) || 25)
        const offset = (page - 1) * perPage
        const [start, end] = periode(req)

        let where = TK_BASE
        let params = [start, end]
        if (req.query.search) {
            where += ' AND (k.kar_Nik LIKE ? OR k.kar_nama LIKE ? OR k.kar_bagian LIKE ?)'
            params = [...params, ...Array(3).fill(`%${req.query.search}%`)]
        }

        if (req.query.distinct && TK_COLUMNS[req.query.distinct]) {
            const dcol = TK_COLUMNS[req.query.distinct]
            const scoped = applyAllColumnFilters(where, params, req.query, TK_COLUMNS, req.query.distinct)
            const dwhere = scoped.clause ? `${scoped.clause} AND` : 'WHERE'
            const [drows] = await pool.query(
                `SELECT DISTINCT ${dcol} AS value ${TK_FROM} ${dwhere} ${dcol} IS NOT NULL AND ${dcol} <> '' ORDER BY value LIMIT 500`,
                scoped.params
            )
            return success(res, drows.map((r) => r.value))
        }

        const f = applyAllColumnFilters(where, params, req.query, TK_COLUMNS)
        where = f.clause
        params = f.params
        const orderBy = buildOrderBy(req.query, TK_COLUMNS, 'ORDER BY a.tanggal DESC, k.kar_nama')

        if (req.query.export === 'xlsx') {
            const [all] = await pool.query(`${TK_SELECT}${where} ${orderBy} LIMIT 50000`, params)
            return sendExcel(res, 'Absen-Tidak-Lengkap', Object.keys(TK_COLUMNS), all)
        }

        const [cnt] = await pool.query(`SELECT COUNT(*) AS total ${TK_FROM}${where}`, params)
        const total = cnt[0].total
        const [rows] = await pool.query(`${TK_SELECT}${where} ${orderBy} LIMIT ? OFFSET ?`, [
            ...params,
            perPage,
            offset,
        ])
        paginated(res, rows, { page, per_page: perPage, total, last_page: Math.ceil(total / perPage) })
    } catch (err) {
        next(err)
    }
}

/* ── Laporan Lembur per SPL (ufrmLapLembur) ──
 * Tiap baris SPL + scan keluar absensi; Stat=1 bila scan2 < jam akhir
 * (baris merah di Delphi). Popup: Buka SPL, Edit Absensi. */
const LL_COLUMNS = {
    Nomor: 'd.lemd_lem_nomor',
    Tanggal: 'h.lem_tanggal',
    Nik: 'k.kar_Nik',
    Nama: 'k.kar_nama',
    Pabrik: 'k.kar_pab_kode',
    Bagian: 'k.kar_bagian',
    Jadwal: 'd.lemd_jamakhir',
    Scan2: 'a.scan2',
    Stat: 'IF(a.scan2 < d.lemd_jamakhir, "1", "0")',
}

const LL_FROM = `FROM tlembur_dtl d
    INNER JOIN tlembur_hdr h ON h.lem_nomor = d.lemd_lem_nomor
    INNER JOIN tkaryawan k ON k.kar_Nik = d.lemd_kar_nik
    INNER JOIN tabsensi a ON a.nik = k.kar_kode_absensi AND h.lem_tanggal = a.tanggal`

const LL_BASE = ` WHERE h.lem_tanggal BETWEEN ? AND ?`

const LL_SELECT = `SELECT ${Object.entries(LL_COLUMNS)
    .map(([alias, expr]) => `${expr} AS \`${alias}\``)
    .join(', ')} ${LL_FROM}`

/** Daftar lembur per periode + status scan. */
export const getLemburList = async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1)
        const perPage = Math.min(500, parseInt(req.query.per_page) || 25)
        const offset = (page - 1) * perPage
        const [start, end] = periode(req)

        let where = LL_BASE
        let params = [start, end]
        if (req.query.search) {
            where += ' AND (d.lemd_lem_nomor LIKE ? OR k.kar_Nik LIKE ? OR k.kar_nama LIKE ? OR k.kar_bagian LIKE ?)'
            params = [...params, ...Array(4).fill(`%${req.query.search}%`)]
        }
        if (req.query.pabrik) {
            where += ' AND k.kar_pab_kode = ?'
            params.push(req.query.pabrik)
        }

        if (req.query.distinct && LL_COLUMNS[req.query.distinct]) {
            const dcol = LL_COLUMNS[req.query.distinct]
            const scoped = applyAllColumnFilters(where, params, req.query, LL_COLUMNS, req.query.distinct)
            const dwhere = scoped.clause ? `${scoped.clause} AND` : 'WHERE'
            const [drows] = await pool.query(
                `SELECT DISTINCT ${dcol} AS value ${LL_FROM} ${dwhere} ${dcol} IS NOT NULL AND ${dcol} <> '' ORDER BY value LIMIT 500`,
                scoped.params
            )
            return success(res, drows.map((r) => r.value))
        }

        const f = applyAllColumnFilters(where, params, req.query, LL_COLUMNS)
        where = f.clause
        params = f.params
        const orderBy = buildOrderBy(req.query, LL_COLUMNS, 'ORDER BY h.lem_tanggal DESC, d.lemd_lem_nomor')

        if (req.query.export === 'xlsx') {
            const [all] = await pool.query(`${LL_SELECT}${where} ${orderBy} LIMIT 50000`, params)
            return sendExcel(res, 'Laporan-Lembur', Object.keys(LL_COLUMNS), all)
        }

        const [cnt] = await pool.query(`SELECT COUNT(*) AS total ${LL_FROM}${where}`, params)
        const total = cnt[0].total
        const [rows] = await pool.query(`${LL_SELECT}${where} ${orderBy} LIMIT ? OFFSET ?`, [
            ...params,
            perPage,
            offset,
        ])
        paginated(res, rows, { page, per_page: perPage, total, last_page: Math.ceil(total / perPage) })
    } catch (err) {
        next(err)
    }
}

/* ── Lembur Tanpa SPL (ufrmLapLemburTanpaSPL) ──
 * Scan keluar > 25 menit (1500 detik) dari jam keluar jadwal tanpa SPL.
 * Kategori Delphi: Setengah (15-45 mnt), Satu (45-75 mnt), selainnya Lebih.
 * Popup: Buka SPL, Edit Absensi. */
const LS_COLUMNS = {
    Kode: 'k.kar_kode_absensi',
    Nik: 'k.kar_Nik',
    Nama: 'k.kar_nama',
    Pabrik: 'k.kar_pab_kode',
    Bagian: 'k.kar_bagian',
    Tanggal: 'a.tanggal',
    Hari: HARI.replace('%s', 'a.tanggal'),
    Keluar: 'a.keluar',
    Scan2: 'a.scan2',
    Lembur: `CASE WHEN TIMEDIFF(a.scan2, a.keluar) > '00:15:00' AND TIMEDIFF(a.scan2, a.keluar) <= '00:45:00' THEN 'Setengah'
        WHEN TIMEDIFF(a.scan2, a.keluar) > '00:45:00' AND TIMEDIFF(a.scan2, a.keluar) <= '01:15:00' THEN 'Satu'
        ELSE 'Lebih' END`,
    Sistem: 'k.kar_sistem_gaji',
}

const LS_FROM = `FROM tabsensi a
    INNER JOIN tkaryawan k ON k.kar_kode_absensi = a.nik
    LEFT JOIN (
        SELECT d.lemd_kar_nik, h.lem_tanggal
        FROM tlembur_hdr h INNER JOIN tlembur_dtl d ON d.lemd_lem_nomor = h.lem_nomor
    ) s ON s.lem_tanggal = a.tanggal AND s.lemd_kar_nik = k.kar_Nik`

const LS_BASE = ` WHERE a.scan2 - a.keluar > 1500 AND s.lemd_kar_nik IS NULL
    AND a.tanggal BETWEEN ? AND ?`

const LS_SELECT = `SELECT ${Object.entries(LS_COLUMNS)
    .map(([alias, expr]) => `${expr} AS \`${alias}\``)
    .join(', ')} ${LS_FROM}`

/** Daftar lembur tanpa SPL per periode. */
export const getLemburTanpaSplList = async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1)
        const perPage = Math.min(500, parseInt(req.query.per_page) || 25)
        const offset = (page - 1) * perPage
        const [start, end] = periode(req)

        let where = LS_BASE
        let params = [start, end]
        if (req.query.search) {
            where += ' AND (k.kar_Nik LIKE ? OR k.kar_nama LIKE ? OR k.kar_bagian LIKE ?)'
            params = [...params, ...Array(3).fill(`%${req.query.search}%`)]
        }
        if (req.query.pabrik) {
            where += ' AND k.kar_pab_kode = ?'
            params.push(req.query.pabrik)
        }

        if (req.query.distinct && LS_COLUMNS[req.query.distinct]) {
            const dcol = LS_COLUMNS[req.query.distinct]
            const scoped = applyAllColumnFilters(where, params, req.query, LS_COLUMNS, req.query.distinct)
            const dwhere = scoped.clause ? `${scoped.clause} AND` : 'WHERE'
            const [drows] = await pool.query(
                `SELECT DISTINCT ${dcol} AS value ${LS_FROM} ${dwhere} ${dcol} IS NOT NULL AND ${dcol} <> '' ORDER BY value LIMIT 500`,
                scoped.params
            )
            return success(res, drows.map((r) => r.value))
        }

        const f = applyAllColumnFilters(where, params, req.query, LS_COLUMNS)
        where = f.clause
        params = f.params
        const orderBy = buildOrderBy(req.query, LS_COLUMNS, 'ORDER BY a.tanggal DESC, k.kar_nama')

        if (req.query.export === 'xlsx') {
            const [all] = await pool.query(`${LS_SELECT}${where} ${orderBy} LIMIT 50000`, params)
            return sendExcel(res, 'Lembur-Tanpa-SPL', Object.keys(LS_COLUMNS), all)
        }

        const [cnt] = await pool.query(`SELECT COUNT(*) AS total ${LS_FROM}${where}`, params)
        const total = cnt[0].total
        const [rows] = await pool.query(`${LS_SELECT}${where} ${orderBy} LIMIT ? OFFSET ?`, [
            ...params,
            perPage,
            offset,
        ])
        paginated(res, rows, { page, per_page: perPage, total, last_page: Math.ceil(total / perPage) })
    } catch (err) {
        next(err)
    }
}

/* ── Rekap Absensi per karyawan (ufrmLapAbsensi) ──
 * Ringkasan kehadiran + lembur + bonus + ijin per NIK dalam periode.
 * Delphi menjalankan UPDATE status dinas/meninggalkan-pekerjaan
 * (ij_ji_id 4/5, jam <= 08:00) setiap refresh — versi web melakukan
 * hal yang sama sebelum membaca. Checkbox Delphi ("tampilkan rincian
 * tanggal") menjadi ?detail=1 yang mengisi kolom Ket* (Adaform,
 * Tanpaform, KetSakit, KetIjin, KetAlpha, KetLainLain, KetSetengahaHari)
 * format "Label :dd-Mon,..." hanya untuk halaman aktif. */
const RA_OUTER = [
    'Nik', 'Nama', 'Pabrik', 'Departemen', 'Jabatan', 'Bagian', 'Sistem',
    'Total_Hari', '2_Jam_Pertama', 'Lebih dari 2 Jam', 'Panggilan', 'TotalLembur',
    'Bonus_Malam_Libur', 'Bonus_Libur', 'terlambat', 'Adaform', 'Tanpaform',
    'ST_HARI', 'KetSetengahaHari', 'sakit', 'KetSakit', 'Ijin', 'KetIjin',
    'Alpha', 'KetAlpha', 'LainLain', 'KetLainLain', 'Total',
]

function rekapAbsensiSql() {
    return `SELECT Nik,Nama,Pabrik,Departemen,Jabatan,Bagian,Sistem,Total_hari,
        2_Jam_Pertama "2_Jam_Pertama",Lebih_dari_2_Jam "Lebih dari 2 Jam",
        Panggilan,TotalLembur,Bonus_Malam_Libur,Bonus_Libur,Terlambat,
        Adaform,Tanpaform,ST_HARI,KetSetengahaHari,Sakit,KetSakit,Ijin,KetIjin,
        Alpha,KetAlpha,LainLain,KetLainLain, Total_Hari+sakit+ijin+alpha+Lainlain+(st_hari*0.5) Total
    FROM (
        select final2.kar_nik Nik,final2.kar_nama Nama,final2.kar_pab_kode Pabrik,
        jab_nama Jabatan,dep_nama Departemen,final2.kar_bagian Bagian,final2.kar_sistem_gaji Sistem,
        IFNULL(jml_hari,0) Total_Hari,IFNULL(2jam,0) 2_Jam_Pertama,
        IFNULL(lembur-panggilan-2jam,0) Lebih_dari_2_Jam,IFNULL(panggilan,0) Panggilan,
        IFNULL(lembur,0) "TotalLembur",IFNULL(bonus_mlm_lbr,0) "Bonus_Malam_Libur",
        (IFNULL(Bonus_Libur,0)*0.5)+(IFNULL(Bonus_Libur2,0)) Bonus_Libur,
        (SELECT count(*) from tabsensi a inner join tkaryawan b on b.kar_kode_absensi=a.nik
         where tanggal between ? and ? and b.kar_nik=final2.kar_nik and a.status=2) terlambat,
        (select count(*) from tijin where ij_tanggal between ? and ? and ij_ji_id=2 and ij_nik=final2.kar_nik) ST_HARI,
        (select count(*) from tijin where ij_tanggal between ? and ? and ij_ji_id=3 and ij_nik=final2.kar_nik and ij_keterangan=0) sakit,
        (select count(*) from tijin where ij_tanggal between ? and ? and ij_ji_id=3 and ij_nik=final2.kar_nik and ij_keterangan=1) Ijin,
        (select count(*) from tijin where ij_tanggal between ? and ? and ij_ji_id=3 and ij_nik=final2.kar_nik and ij_keterangan=2) Alpha,
        (select count(*) from tijin where ij_tanggal between ? and ? and ij_ji_id=3 and ij_nik=final2.kar_nik and ij_keterangan=3) LainLain,
        CAST('' AS CHAR(200)) Adaform, CAST('' AS CHAR(200)) Tanpaform,
        CAST('' AS CHAR(200)) KetSetengahaHari, CAST('' AS CHAR(200)) KetSakit,
        CAST('' AS CHAR(200)) KetIjin, CAST('' AS CHAR(200)) KetAlpha,
        CAST('' AS CHAR(200)) KetLainLain
        from tkaryawan final2 left join (
            select kar_nik,kar_nama,kar_pab_kode,kar_bagian,kar_sistem_gaji,
            count(*) - ((select count(*) from tijin where ij_tanggal between ? and ?
                and ij_nik=kar_nik and ij_ji_id=2) * 0.5) jml_hari,
            ifnull((select (sum(if ( timediff(lemd_jamakhir,lemd_jammulai) < 0 ,
                (time_to_sec((timediff("24:00:00",lemd_jammulai))))/3600
                + (time_to_sec((timediff(lemd_jamakhir,"00:00:00"))))/3600,
                (time_to_sec((timediff(lemd_jamakhir,lemd_jammulai))))/3600 ))) lembur
             from tlembur_dtl inner join tlembur_hdr on lem_nomor=lemd_lem_nomor where lem_tanggal
             between ? and ? and lemd_kar_nik=kar_nik),0) lembur,
            ifnull((select sum(if(if ( timediff(lemd_jamakhir,lemd_jammulai) < 0 ,
                (time_to_sec((timediff("24:00:00",lemd_jammulai))))/3600
                + (time_to_sec((timediff(lemd_jamakhir,"00:00:00"))))/3600,
                (time_to_sec((timediff(lemd_jamakhir,lemd_jammulai))))/3600 ) > 2,2,
                (time_to_sec((timediff(lemd_jamakhir,lemd_jammulai))))/3600)) 2jam
             from tlembur_dtl inner join tlembur_hdr on lem_nomor=lemd_lem_nomor and lemd_panggilan <> 1
             where lem_tanggal between ? and ?
             and lem_tanggal not in (select hl_tanggal from tharilibur WHERE hl_status=1)
             and lemd_kar_nik=kar_nik ),0) 2jam,
            ifnull((select (sum(if ( timediff(lemd_jamakhir,lemd_jammulai) < 0 ,
                (time_to_sec((timediff("24:00:00",lemd_jammulai))))/3600
                + (time_to_sec((timediff(lemd_jamakhir,"00:00:00"))))/3600,
                (time_to_sec((timediff(lemd_jamakhir,lemd_jammulai))))/3600 ))) panggilan
             from tlembur_dtl inner join tlembur_hdr on lem_nomor=lemd_lem_nomor and lemd_panggilan = 1
             where lem_tanggal between ? and ? and lemd_kar_nik=kar_nik),0) panggilan,
            (select count(*) from (
                select lemd_kar_nik,
                if ( timediff(lemd_jamakhir,lemd_jammulai) < 0 ,
                    (time_to_sec((timediff("24:00:00",lemd_jammulai))))/3600
                    + (time_to_sec((timediff(lemd_jamakhir,"00:00:00"))))/3600,
                    (time_to_sec((timediff(lemd_jamakhir,lemd_jammulai))))/3600 ) lembur,
                date_add(lem_tanggal, interval 1 day) Tanggal
                from tlembur_dtl inner join tlembur_hdr on lem_nomor=lemd_lem_nomor
                where lem_tanggal between ? and ?) a
             inner join tharilibur on hl_tanggal=a.tanggal
             where lembur >= 3 and lemd_kar_nik=kar_nik) bonus_mlm_lbr,
            (select SUM(if((hl_status_security=0 AND kar_jab_Kode="SCR"),0,1)) from tabsensi
             inner join tharilibur on tanggal=hl_tanggal and hl_status=1
             where status <> 0
             and (case when scan2 < scan1 then 24 else 0 end +(TIME_TO_SEC((TIMEDIFF(scan2,scan1))))/3600) > 3
             and (case when scan2 < scan1 then 24 else 0 end +(TIME_TO_SEC((TIMEDIFF(scan2,scan1))))/3600) <= 6
             and scan1 <> "00:00:00"
             and nik=a.nik and tanggal between ? and ?) bonus_libur,
            (select SUM(if((hl_status_security=0 AND kar_jab_Kode="SCR"),0,1)) from tabsensi
             inner join tharilibur on tanggal=hl_tanggal and hl_status=1
             where status <> 0
             and (case when scan2 < scan1 then 24 else 0 end +(TIME_TO_SEC((TIMEDIFF(scan2,scan1))))/3600) > 6
             and scan1 <> "00:00:00"
             and nik=a.nik and tanggal between ? and ?) bonus_libur2
            from tabsensi a
            inner join tkaryawan on kar_kode_absensi=nik
            where tanggal between ? and ? and scan1 <> "00:00:00" and status <> 0
            group by kar_nik
        ) final on final2.kar_nik=final.kar_nik
        left join tjabatan on kar_jab_kode=jab_kode
        left join tdepartemen on dep_kode=kar_dep_kode
        where final2.kar_status_aktif=1
    ) andi`
}

/** Format tanggal Delphi dd-mmm (mis. 05-Oct) untuk kolom Ket*. */
function fmtKet(sqlDate) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(sqlDate || ''))
    if (!m) return ''
    const bulan = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return `${m[3]}-${bulan[Number(m[2]) - 1]}`
}

/** Daftar tanggal ijin "dd-Mon" (gettanggalsakit/gettanggalterlambat Delphi). */
async function tanggalIjinList(start, end, nik, jiId, ket) {
    const [rows] = await pool.query(
        `SELECT ij_tanggal FROM tijin
         WHERE ij_tanggal BETWEEN ? AND ? AND ij_ji_id = ? AND ij_keterangan = ? AND ij_nik = ?
         ORDER BY ij_tanggal`,
        [start, end, jiId, ket, nik]
    )
    return rows.map((r) => fmtKet(r.ij_tanggal))
}

/** Rekap absensi per karyawan. Query param detail=1 untuk kolom Ket*. */
export const getAbsensiRekapList = async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1)
        const perPage = Math.min(500, parseInt(req.query.per_page) || 25)
        const offset = (page - 1) * perPage
        const [start, end] = periode(req)

        // Samakan status dinas/meninggalkan-pekerjaan seperti Delphi.
        await pool.query(
            `UPDATE tijin INNER JOIN tkaryawan ON ij_nik=kar_Nik
             INNER JOIN tabsensi ON nik=kar_kode_absensi AND tanggal=ij_tanggal
             SET status=1
             WHERE ij_ji_id IN (4,5) AND ij_jam <= '08:00:00'
             AND ij_tanggal BETWEEN ? AND ?`,
            [start, end]
        )

        const baseParams = Array(14).fill([start, end]).flat()
        let sql = rekapAbsensiSql()
        let params = [...baseParams]

        if (req.query.search) {
            sql += ' AND (Nik LIKE ? OR Nama LIKE ? OR Bagian LIKE ? OR Pabrik LIKE ?)'
            params = [...params, ...Array(4).fill(`%${req.query.search}%`)]
        }

        const ALIAS = Object.fromEntries(RA_OUTER.map((c) => [c, c]))
        const f = applyAllColumnFilters('', params, req.query, ALIAS)
        if (f.clause) sql += f.clause.replace(/^ WHERE/, ' AND')
        params = f.params
        sql += ` ${buildOrderBy(req.query, ALIAS, 'ORDER BY Nama')}`

        if (req.query.export === 'xlsx') {
            const [all] = await pool.query(`${sql} LIMIT 50000`, params)
            if (String(req.query.detail || '') === '1') await isiKet(all, start, end)
            return sendExcel(res, 'Rekap-Absensi', RA_OUTER, all)
        }

        const [cntRows] = await pool.query(`SELECT COUNT(*) AS total FROM (${sql}) x`, params)
        const total = cntRows[0].total
        const [rows] = await pool.query(`${sql} LIMIT ? OFFSET ?`, [...params, perPage, offset])
        if (String(req.query.detail || '') === '1') await isiKet(rows, start, end)
        paginated(res, rows, { page, per_page: perPage, total, last_page: Math.ceil(total / perPage) })
    } catch (err) {
        next(err)
    }
}

/** Isi kolom Ket* halaman aktif (checkbox Delphi). */
async function isiKet(rows, start, end) {
    const berlabel = async (nik, jiId, ket, label) => {
        const tgl = await tanggalIjinList(start, end, nik, jiId, ket)
        return tgl.length ? `${label} :` + tgl.join(',') + '.' : ''
    }
    for (const r of rows) {
        const nik = r.Nik
        if (r.terlambat > 0) {
            const ada = await tanggalIjinList(start, end, nik, 1, 3)
            const tanpa = await tanggalTerlambatTanpaForm(start, end, nik)
            r.Adaform = ada.length ? ada.join(',') + '.' : ''
            r.Tanpaform = tanpa.length ? tanpa.join(',') + '.' : ''
        }
        if (r.sakit > 0) r.KetSakit = await berlabel(nik, 3, 0, 'Sakit')
        if (r.LainLain > 0) r.KetLainLain = await berlabel(nik, 3, 3, 'Lainlain')
        if (r.Ijin > 0) r.KetIjin = await berlabel(nik, 3, 1, 'Ijin')
        if (r.Alpha > 0) r.KetAlpha = await berlabel(nik, 3, 2, 'Alpha')
        if (r.ST_HARI > 0) {
            const tgl = await tanggalSetengah(start, end, nik)
            r.KetSetengahaHari = tgl.length ? 'Setengah Hari :' + tgl.join(',') + '.' : ''
        }
    }
}

/** Terlambat tanpa formulir (gettanggalterlambat2 Delphi). */
async function tanggalTerlambatTanpaForm(start, end, nik) {
    const [rows] = await pool.query(
        `SELECT a.tanggal FROM tabsensi a
         INNER JOIN tkaryawan b ON a.nik=b.kar_kode_absensi
         LEFT JOIN tijin c ON c.ij_nik=kar_Nik AND ij_tanggal=a.tanggal AND ij_ji_id=1 AND ij_keterangan=3
         WHERE tanggal BETWEEN ? AND ? AND a.status=2 AND kar_Nik=?
         AND ij_tanggal IS NULL ORDER BY a.tanggal`,
        [start, end, nik]
    )
    return rows.map((r) => fmtKet(r.tanggal))
}

/** Tanggal setengah hari "dd-Mon" (gettanggalsetengah Delphi). */
async function tanggalSetengah(start, end, nik) {
    const [rows] = await pool.query(
        `SELECT ij_tanggal FROM tijin
         WHERE ij_tanggal BETWEEN ? AND ? AND ij_ji_id=2 AND ij_nik = ?
         ORDER BY ij_tanggal`,
        [start, end, nik]
    )
    return rows.map((r) => fmtKet(r.ij_tanggal))
}
