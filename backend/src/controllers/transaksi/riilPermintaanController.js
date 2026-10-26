import pool from '../../config/database.js'
import { success, error, paginated } from '../../helpers/response.js'
import { buildOrderBy, applyAllColumnFilters } from '../../helpers/browse.js'
import { sendExcel } from '../../helpers/excel.js'

/**
 * Modul Realisasi Permintaan Karyawan â€” cerminan unit Delphi:
 *   ufrmBrowseRiilPermintaanKaryawan -> daftar per periode + hapus
 *   ufrmRiilPermintaanKaryawan       -> form satu dokumen
 *
 * Tabel: `triilpermintaankaryawan` (rpk_nomor PK `NNN/HRD/RPK/MM/YYYY`),
 *        `tpermintaankaryawan`, `tkaryawan`, `tjabatan`.
 *
 * Aturan Delphi yang diduplikasi:
 * - Browse: join permintaan + jabatan (tpk_jab_kode) + karyawan (tpk_peminta).
 * - Nomor: 3 digit urut per TAHUN berjalan + `/HRD/RPK/` + MM/yyyy.
 * - Form: pilih Nomor Minta dari permintaan yang belum penuh
 *   (tpk_jumlah > SUM realisasi) -> loaddata mengisi info permintaan;
 *   simpan hanya menulis rpk_tpk_nomor, rpk_tanggal, rpk_jumlah,
 *   rpk_keterangannama.
 * - Wajib: jumlah realisasi.
 *
 * PERBAIKAN dari Delphi: tombol hapus browse Delphi salah menghapus
 * `tjabatan` (copy-paste bug); versi web menghapus baris realisasinya.
 */

const LIST_COLUMNS = {
    Nomor: 'r.rpk_nomor',
    Tanggal: 'r.rpk_tanggal',
    Nomor_Minta: 't.tpk_nomor',
    Peminta: 'k.kar_nama',
    Tanggal_Minta: 't.tpk_tanggal',
    Jabatan: 'j.jab_nama',
    Bagian: 't.tpk_bagian',
    Tgl_Butuh: 't.tpk_tgl_butuh',
    Jumlah: 'r.rpk_jumlah',
    KeteranganNama: 'r.rpk_keterangannama',
}

const FROM_SQL = `FROM triilpermintaankaryawan r
    INNER JOIN tpermintaankaryawan t ON t.tpk_nomor = r.rpk_tpk_nomor
    INNER JOIN tjabatan j ON j.jab_kode = t.tpk_jab_kode
    INNER JOIN tkaryawan k ON k.kar_Nik = t.tpk_peminta`

const SELECT_SQL = `SELECT ${Object.entries(LIST_COLUMNS)
    .map(([alias, expr]) => `${expr} AS \`${alias}\``)
    .join(', ')} ${FROM_SQL}`

function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
    const date = new Date(`${value}T00:00:00Z`)
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && value >= '1000-01-01'
}

/** Nomor berikutnya: NNN/HRD/RPK/MM/YYYY (getmaxnomor). */
export async function nomorBerikut(tanggal) {
    const d = new Date(`${String(tanggal).slice(0, 10)}T00:00:00Z`)
    const tahun = d.getUTCFullYear()
    const suffix = `/HRD/RPK/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${tahun}`
    const [rows] = await pool.query(
        'SELECT MAX(LEFT(rpk_nomor, 3)) AS m FROM triilpermintaankaryawan WHERE YEAR(rpk_tanggal) = ?',
        [tahun]
    )
    const m = rows[0]?.m ? parseInt(rows[0].m, 10) : 0
    return `${String(1000 + m + 1).slice(-3)}${suffix}`
}

/** Daftar realisasi per periode (default bulan berjalan). */
export const getRiilList = async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1)
        const perPage = Math.min(500, parseInt(req.query.per_page) || 25)
        const offset = (page - 1) * perPage
        const today = new Date().toISOString().slice(0, 10)
        const start = req.query.start_date || `${today.slice(0, 7)}-01`
        const end = req.query.end_date || today
        if (!validDate(start) || !validDate(end) || start > end) return error(res, 'Periode tidak valid', 400)

        let where = ' WHERE r.rpk_tanggal BETWEEN ? AND ?'
        let params = [start, end]
        if (req.query.search) {
            where += ' AND (r.rpk_nomor LIKE ? OR t.tpk_nomor LIKE ? OR k.kar_nama LIKE ? OR t.tpk_bagian LIKE ? OR j.jab_nama LIKE ?)'
            params = [...params, ...Array(5).fill(`%${req.query.search}%`)]
        }

        if (req.query.distinct && LIST_COLUMNS[req.query.distinct]) {
            const col = LIST_COLUMNS[req.query.distinct]
            const f = applyAllColumnFilters(where, params, req.query, LIST_COLUMNS, req.query.distinct)
            const [rows] = await pool.query(
                `SELECT DISTINCT ${col} AS value, OCTET_LENGTH(${col}) AS value_length ${FROM_SQL}${f.clause} ORDER BY value`,
                f.params
            )
            return success(res, rows.map((row) => row.value))
        }

        const f = applyAllColumnFilters(where, params, req.query, LIST_COLUMNS)
        const order = buildOrderBy(req.query, LIST_COLUMNS, 'ORDER BY r.rpk_tanggal DESC, r.rpk_nomor DESC')
        if (req.query.export === 'xlsx') {
            const [rows] = await pool.query(`${SELECT_SQL}${f.clause} ${order} LIMIT 50000`, f.params)
            return sendExcel(res, 'Realisasi-Permintaan', Object.keys(LIST_COLUMNS), rows,
                { headLabels: { Nomor_Minta: 'Nomor Minta', Tanggal_Minta: 'Tgl Minta', Tgl_Butuh: 'Tgl Butuh', KeteranganNama: 'Keterangan Nama' }, requestedColumns: req.query.columns })
        }
        const [count] = await pool.query(`SELECT COUNT(*) AS total ${FROM_SQL}${f.clause}`, f.params)
        const total = Number(count[0].total)
        const [rows] = await pool.query(
            `${SELECT_SQL}${f.clause} ${order} LIMIT ? OFFSET ?`,
            [...f.params, perPage, offset]
        )
        paginated(res, rows, { page, per_page: perPage, total, last_page: Math.ceil(total / perPage) })
    } catch (err) { next(err) }
}

/** Nomor preview untuk tanggal tertentu. */
export const getNomor = async (req, res, next) => {
    try {
        const tanggal = String(req.query.tanggal || new Date().toISOString().slice(0, 10)).slice(0, 10)
        if (!validDate(tanggal)) return error(res, 'Tanggal tidak valid', 400)
        success(res, { nomor: await nomorBerikut(tanggal), tanggal })
    } catch (err) { next(err) }
}

/**
 * Permintaan yang belum penuh untuk picker Nomor Minta
 * (edtNomorMintaClickBtn: `having jumlah > Jml_riil`).
 */
export const getPermintaanTerbuka = async (req, res, next) => {
    try {
        const q = String(req.query.search || '').trim()
        const params = []
        let where = ''
        if (q) {
            where = ' AND (t.tpk_nomor LIKE ? OR k.kar_nama LIKE ? OR j.jab_nama LIKE ? OR t.tpk_bagian LIKE ?)'
            params.push(...Array(4).fill(`%${q}%`))
        }
        const [rows] = await pool.query(
            `SELECT t.tpk_nomor AS Nomor, k.kar_nama AS Peminta, j.jab_nama AS Jabatan,
                    t.tpk_bagian AS Bagian, t.tpk_jumlah AS Jumlah, t.tpk_tanggal AS Tanggal_Minta,
                    IFNULL((SELECT SUM(rpk_jumlah) FROM triilpermintaankaryawan WHERE rpk_tpk_nomor = t.tpk_nomor), 0) AS Jml_Riil
             FROM tpermintaankaryawan t
             INNER JOIN tkaryawan k ON k.kar_Nik = t.tpk_peminta
             LEFT JOIN tjabatan j ON j.jab_kode = t.tpk_jab_kode
             WHERE 1 = 1${where}
             HAVING Jumlah > Jml_Riil
             ORDER BY t.tpk_tanggal DESC, t.tpk_nomor DESC
             LIMIT 200`,
            params
        )
        success(res, rows)
    } catch (err) { next(err) }
}

/** Info satu permintaan + sisa (loaddata: isi info form dari Nomor Minta). */
export const getInfoPermintaan = async (req, res, next) => {
    try {
        const nomor = String(req.query.nomor || '').trim()
        if (!nomor) return error(res, 'Nomor permintaan wajib diisi', 400)
        const [rows] = await pool.query(
            `SELECT t.tpk_nomor AS nomor, t.tpk_peminta AS peminta, k.kar_nama AS peminta_nama,
                    t.tpk_tanggal AS tanggal, t.tpk_jab_kode AS jab_kode, j.jab_nama AS jabatan_nama,
                    t.tpk_bagian AS bagian, t.tpk_tgl_butuh AS tgl_butuh, t.tpk_jumlah AS jumlah,
                    t.tpk_alasan AS alasan, t.tpk_alasanlain AS alasan_lain,
                    IFNULL((SELECT SUM(rpk_jumlah) FROM triilpermintaankaryawan WHERE rpk_tpk_nomor = t.tpk_nomor), 0) AS jml_riil
             FROM tpermintaankaryawan t
             INNER JOIN tkaryawan k ON k.kar_Nik = t.tpk_peminta
             LEFT JOIN tjabatan j ON j.jab_kode = t.tpk_jab_kode
             WHERE t.tpk_nomor = ?`,
            [nomor]
        )
        if (rows.length === 0) return error(res, 'Nomor permintaan tidak ditemukan', 404)
        const t = rows[0]
        success(res, {
            ...t,
            tanggal: t.tanggal ? String(t.tanggal).slice(0, 10) : null,
            tgl_butuh: t.tgl_butuh ? String(t.tgl_butuh).slice(0, 10) : null,
            sisa: Number(t.jumlah || 0) - Number(t.jml_riil || 0),
        })
    } catch (err) { next(err) }
}

/** Satu dokumen realisasi + info permintaannya (mode ubah). */
export const getRiil = async (req, res, next) => {
    try {
        const nomor = String(req.query.nomor || req.params.nomor || '').trim()
        if (!nomor) return error(res, 'Nomor wajib diisi', 400)
        const [rows] = await pool.query(
            `SELECT r.rpk_nomor AS nomor, r.rpk_tanggal AS tanggal, r.rpk_tpk_nomor AS tpk_nomor,
                    r.rpk_jumlah AS jumlah, r.rpk_keterangannama AS keterangan_nama,
                    t.tpk_peminta AS peminta, k.kar_nama AS peminta_nama,
                    j.jab_nama AS jabatan_nama, t.tpk_bagian AS bagian,
                    t.tpk_jumlah AS jumlah_minta,
                    IFNULL((SELECT SUM(rpk_jumlah) FROM triilpermintaankaryawan WHERE rpk_tpk_nomor = t.tpk_nomor), 0) AS jml_riil
             FROM triilpermintaankaryawan r
             INNER JOIN tpermintaankaryawan t ON t.tpk_nomor = r.rpk_tpk_nomor
             INNER JOIN tkaryawan k ON k.kar_Nik = t.tpk_peminta
             LEFT JOIN tjabatan j ON j.jab_kode = t.tpk_jab_kode
             WHERE r.rpk_nomor = ?`,
            [nomor]
        )
        if (rows.length === 0) return error(res, 'Nomor tidak ditemukan', 404)
        const t = rows[0]
        success(res, {
            ...t,
            tanggal: t.tanggal ? String(t.tanggal).slice(0, 10) : null,
            sisa: Number(t.jumlah_minta || 0) - Number(t.jml_riil || 0),
        })
    } catch (err) { next(err) }
}

/**
 * Simpan (ufrmRiilPermintaanKaryawan.simpandata).
 * Body: { nomor? (mode ubah), tpk_nomor, tanggal, jumlah, keterangan_nama }
 */
export const saveRiil = async (req, res, next) => {
    try {
        const b = req.body || {}
        const tpkNomor = String(b.tpk_nomor || '').trim()
        const tanggal = String(b.tanggal || '').slice(0, 10)
        const jumlah = parseInt(b.jumlah, 10)
        const keterangan = String(b.keterangan_nama ?? '')

        if (!tpkNomor) return error(res, 'Nomor permintaan (Minta) wajib diisi', 400)
        if (!validDate(tanggal)) return error(res, 'Tanggal realisasi tidak valid', 400)
        if (!Number.isInteger(jumlah) || jumlah <= 0) return error(res, 'Jumlah belum diisi / tidak valid', 400)

        const [trows] = await pool.query('SELECT tpk_nomor FROM tpermintaankaryawan WHERE tpk_nomor = ?', [tpkNomor])
        if (trows.length === 0) return error(res, `Nomor permintaan ${tpkNomor} tidak dikenal`, 400)

        const nomorEdit = String(b.nomor || '').trim()
        if (nomorEdit) {
            const [ada] = await pool.query('SELECT rpk_nomor FROM triilpermintaankaryawan WHERE rpk_nomor = ?', [nomorEdit])
            if (ada.length === 0) return error(res, 'Nomor tidak ditemukan', 404)
            await pool.query(
                `UPDATE triilpermintaankaryawan SET rpk_tpk_nomor = ?, rpk_tanggal = ?, rpk_jumlah = ?, rpk_keterangannama = ?
                 WHERE rpk_nomor = ?`,
                [tpkNomor, tanggal, jumlah, keterangan, nomorEdit]
            )
            return success(res, { nomor: nomorEdit }, `Berhasil simpan dengan nomor ${nomorEdit}`)
        }

        const nomor = await nomorBerikut(tanggal)
        await pool.query(
            `INSERT INTO triilpermintaankaryawan (rpk_nomor, rpk_tpk_nomor, rpk_tanggal, rpk_jumlah, rpk_keterangannama)
             VALUES (?, ?, ?, ?, ?)`,
            [nomor, tpkNomor, tanggal, jumlah, keterangan]
        )
        success(res, { nomor }, `Berhasil simpan dengan nomor ${nomor}`)
    } catch (err) { next(err) }
}

/** Hapus satu dokumen realisasi. */
export const deleteRiil = async (req, res, next) => {
    try {
        const nomor = String(req.params.nomor || req.query.nomor || '').trim()
        if (!nomor) return error(res, 'Nomor wajib diisi', 400)
        const [r] = await pool.query('DELETE FROM triilpermintaankaryawan WHERE rpk_nomor = ?', [nomor])
        if (r.affectedRows === 0) return error(res, 'Nomor tidak ditemukan', 404)
        success(res, null, 'Data berhasil dihapus')
    } catch (err) { next(err) }
}
