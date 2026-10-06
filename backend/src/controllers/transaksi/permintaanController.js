import pool from '../../config/database.js'
import { success, error, paginated } from '../../helpers/response.js'
import { sendExcel } from '../../helpers/excel.js'

/**
 * Modul Permintaan Karyawan — cerminan unit Delphi:
 *   ufrmBrowsePermintaanKaryawan -> daftar per periode (+ realisasi) + hapus
 *   ufrmPermintaanKaryawan       -> form satu dokumen
 *
 * Tabel: `tpermintaankaryawan` (tpk_nomor PK `NNN/HRD/PKAR/MM/YYYY`),
 *        `triilpermintaankaryawan` (realisasi, modul terpisah
 *        `frmRiilPermintaanKaryawan` — di sini hanya dibaca), `tkaryawan`,
 *        `tjabatan`.
 *
 * Aturan Delphi yang diduplikasi:
 * - Nomor: 3 digit urut per TAHUN berjalan + `/HRD/PKAR/` + MM/yyyy.
 * - Kolom Closed: "Sudah" bila Jml_Realisasi >= Jumlah_Minta, "Belum".
 * - Wajib: peminta (NIK) dan jumlah.
 * - 10 kolom keterangan + 10 kolom spesifikasi, dengan default spesifikasi
 *   1-4: Laki-laki / Usia 18-35 tahun / Pendidikan Minimal SMA /
 *   Diutamakan Pengalaman (refreshdata).
 * - Alasan berupa combo: Penggantian, Sudah Masuk Rencana MPP,
 *   Diluar Rencana MPP, Lain-lain (bebas diisi varian lain seperti di DB).
 *
 * PERBAIKAN dari Delphi: tombol hapus browse Delphi salah menghapus
 * `tjabatan` (copy-paste bug `cxButton4Click`); versi web menghapus
 * `tpermintaankaryawan` dan MENOLAK bila sudah ada realisasi.
 */

/** Nilai default spesifikasi 1-4 (ufrmPermintaanKaryawan.refreshdata). */
export const SPESIFIKASI_DEFAULT = [
    'Laki-laki',
    'Usia 18-35 tahun',
    'Pendidikan Minimal SMA',
    'Diutamakan Pengalaman',
]

export const ALASAN = ['Penggantian', 'Sudah Masuk Rencana MPP', 'Diluar Rencana MPP', 'Lain-lain']

/** Kolom browse master (subquery Final Delphi, tanpa kolom Closed di map). */
const LIST_COLUMNS = {
    Nomor: 'Final.Nomor',
    Peminta: 'Final.Peminta',
    Tanggal: 'Final.Tanggal',
    Jabatan: 'Final.Jabatan',
    Bagian: 'Final.Bagian',
    Tgl_Butuh: 'Final.Tgl_Butuh',
    Jumlah_Minta: 'Final.Jumlah_Minta',
    Alasan: 'Final.Alasan',
    Jml_Realisasi: 'Final.Jml_Realisasi',
    Closed: 'Closed',
}

const INNER_SQL = `SELECT tpk_nomor AS Nomor, kar_nama AS Peminta, tpk_tanggal AS Tanggal,
        jab_nama AS Jabatan, tpk_bagian AS Bagian, tpk_tgl_butuh AS Tgl_Butuh,
        tpk_jumlah AS Jumlah_Minta, tpk_alasan AS Alasan,
        (SELECT SUM(rpk_jumlah) FROM triilpermintaankaryawan WHERE rpk_tpk_nomor = tpk_nomor) AS Jml_Realisasi
    FROM tpermintaankaryawan
    INNER JOIN tjabatan ON jab_kode = tpk_jab_kode
    INNER JOIN tkaryawan ON kar_nik = tpk_peminta`

/** Nomor berikutnya: NNN/HRD/PKAR/MM/YYYY (getmaxnomor). */
export async function nomorBerikut(tanggal) {
    const d = new Date(String(tanggal).slice(0, 10))
    const tahun = d.getFullYear()
    const suffix = `/HRD/PKAR/${String(d.getMonth() + 1).padStart(2, '0')}/${tahun}`
    const [rows] = await pool.query(
        'SELECT MAX(LEFT(tpk_nomor, 3)) AS m FROM tpermintaankaryawan WHERE YEAR(tpk_tanggal) = ?',
        [tahun]
    )
    const m = rows[0]?.m ? parseInt(rows[0].m, 10) : 0
    return `${String(1000 + m + 1).slice(-3)}${suffix}`
}

/** Daftar permintaan per periode (default bulan berjalan). */
export const getPermintaanList = async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1)
        const perPage = Math.min(500, parseInt(req.query.per_page) || 25)
        const offset = (page - 1) * perPage
        const start = req.query.start_date || `${new Date().toISOString().slice(0, 7)}-01`
        const end = req.query.end_date || new Date().toISOString().slice(0, 10)

        let inner = ' WHERE tpk_tanggal BETWEEN ? AND ?'
        let params = [start, end]
        if (req.query.search) {
            inner += ' AND (tpk_nomor LIKE ? OR kar_nama LIKE ? OR tpk_bagian LIKE ? OR jab_nama LIKE ?)'
            params = [...params, ...Array(4).fill(`%${req.query.search}%`)]
        }

        const outer = (extraWhere, extraParams) =>
            pool.query(
                `SELECT *, IF(Jumlah_Minta > IFNULL(Jml_Realisasi, 0), 'Belum', 'Sudah') AS Closed FROM (${INNER_SQL}${inner}) AS Final${extraWhere}`,
                [...params, ...extraParams]
            )

        // Filter kolom (Closed ikut difilter di lapis luar).
        let extraWhere = ''
        let extraParams = []
        if (req.query) {
            const ands = []
            const pushSet = (alias, col) => {
                let raw = req.query[`filterSet_${alias}`] ?? req.query[`filterSet_${alias}[]`]
                if (raw === undefined) return
                const arr = (Array.isArray(raw) ? raw : [raw]).map((v) => String(v).trim()).filter(Boolean)
                if (!arr.length) return
                ands.push(`${col} IN (${arr.map(() => '?').join(',')})`)
                extraParams.push(...arr)
            }
            const pushLike = (alias, col) => {
                const raw = req.query[`filter_${alias}`]
                if (raw === undefined || raw === null || !String(raw).trim()) return
                ands.push(`${col} LIKE ?`)
                extraParams.push(`%${String(raw).trim()}%`)
            }
            for (const [alias, col] of Object.entries(LIST_COLUMNS)) {
                pushLike(alias, col)
                pushSet(alias, col)
            }
            if (ands.length) extraWhere = ` WHERE ${ands.join(' AND ')}`
        }

        if (req.query.distinct && LIST_COLUMNS[req.query.distinct]) {
            const col = LIST_COLUMNS[req.query.distinct]
            const [drows] = await pool.query(
                `SELECT DISTINCT ${col} AS value FROM (${INNER_SQL}${inner}) AS Final WHERE ${col} IS NOT NULL AND ${col} <> '' ORDER BY value LIMIT 500`,
                params
            )
            return success(res, drows.map((r) => r.value))
        }

        let orderBy = 'ORDER BY Tanggal DESC, Nomor DESC'
        if (req.query.sort_by && LIST_COLUMNS[req.query.sort_by]) {
            const dir = String(req.query.sort_dir || '').toLowerCase() === 'desc' ? 'DESC' : 'ASC'
            orderBy = `ORDER BY ${LIST_COLUMNS[req.query.sort_by]} ${dir}`
        }

        const [cntRows] = await pool.query(
            `SELECT COUNT(*) AS total FROM (${INNER_SQL}${inner}) AS Final${extraWhere}`,
            [...params, ...extraParams]
        )
        const total = cntRows[0].total
        if (req.query.export === 'xlsx') {
            const [all] = await pool.query(
                `SELECT *, IF(Jumlah_Minta > IFNULL(Jml_Realisasi, 0), 'Belum', 'Sudah') AS Closed FROM (${INNER_SQL}${inner}) AS Final${extraWhere} ${orderBy} LIMIT 50000`,
                [...params, ...extraParams]
            )
            return sendExcel(res, 'Permintaan-Karyawan', Object.keys(LIST_COLUMNS), all)
        }
        const [rows] = await pool.query(
            `SELECT *, IF(Jumlah_Minta > IFNULL(Jml_Realisasi, 0), 'Belum', 'Sudah') AS Closed FROM (${INNER_SQL}${inner}) AS Final${extraWhere} ${orderBy} LIMIT ? OFFSET ?`,
            [...params, ...extraParams, perPage, offset]
        )
        paginated(res, rows, { page, per_page: perPage, total, last_page: Math.ceil(total / perPage) })
    } catch (err) {
        next(err)
    }
}

/** Realisasi untuk satu nomor (SQLDetail Delphi, read-only di modul ini). */
export const getRealisasi = async (req, res, next) => {
    try {
        const nomor = String(req.query.nomor || req.params.nomor || '')
        if (!nomor) return error(res, 'Nomor wajib diisi', 400)
        const [rows] = await pool.query(
            `SELECT rpk_tpk_nomor AS Nomor, rpk_nomor AS Nomor_Realisasi, rpk_tanggal AS Tgl_Realisasi,
                    rpk_jumlah AS Jml_Realisasi, rpk_keterangannama AS Keterangan
             FROM triilpermintaankaryawan WHERE rpk_tpk_nomor = ? ORDER BY rpk_tanggal`,
            [nomor]
        )
        success(res, rows)
    } catch (err) {
        next(err)
    }
}

/** Nomor berikutnya untuk tanggal tertentu. */
export const getNomor = async (req, res, next) => {
    try {
        const tanggal = String(req.query.tanggal || new Date().toISOString().slice(0, 10)).slice(0, 10)
        success(res, { nomor: await nomorBerikut(tanggal), tanggal })
    } catch (err) {
        next(err)
    }
}

const KET_COLS = Array.from({ length: 10 }, (_, i) => (i === 0 ? 'tpk_keterangan' : `tpk_keterangan${i + 1}`))
const SPES_COLS = Array.from({ length: 10 }, (_, i) => (i === 0 ? 'tpk_spesifikasi' : `tpk_spesifikasi${i + 1}`))

/** Satu dokumen + nama peminta (ufrmPermintaanKaryawan.loaddata). */
export const getPermintaan = async (req, res, next) => {
    try {
        const nomor = String(req.query.nomor || req.params.nomor || '')
        if (!nomor) return error(res, 'Nomor wajib diisi', 400)
        const [rows] = await pool.query(
            `SELECT t.*, k.kar_nama AS peminta_nama, j.jab_nama AS jabatan_nama
             FROM tpermintaankaryawan t
             INNER JOIN tkaryawan k ON k.kar_Nik = t.tpk_peminta
             LEFT JOIN tjabatan j ON j.jab_kode = t.tpk_jab_kode
             WHERE t.tpk_nomor = ?`,
            [nomor]
        )
        if (rows.length === 0) return error(res, 'Nomor tidak ditemukan', 404)
        const t = rows[0]
        success(res, {
            nomor: t.tpk_nomor,
            peminta: t.tpk_peminta,
            peminta_nama: t.peminta_nama,
            tanggal: String(t.tpk_tanggal).slice(0, 10),
            jab_kode: t.tpk_jab_kode,
            jabatan_nama: t.jabatan_nama,
            bagian: t.tpk_bagian,
            tgl_butuh: t.tpk_tgl_butuh ? String(t.tpk_tgl_butuh).slice(0, 10) : null,
            jumlah: t.tpk_jumlah,
            alasan: t.tpk_alasan,
            alasan_lain: t.tpk_alasanlain,
            keterangan: KET_COLS.map((c) => t[c] || ''),
            spesifikasi: SPES_COLS.map((c) => t[c] || ''),
            approve_atasan: t.tpk_approveatasan,
            approve_hrd: t.tpk_approveHRD,
        })
    } catch (err) {
        next(err)
    }
}

/** Lookup karyawan peminta. */
export const lookupKaryawan = async (req, res, next) => {
    try {
        const q = String(req.query.search || '').trim()
        const perPage = Math.min(200, parseInt(req.query.per_page) || 20)
        const page = Math.max(1, parseInt(req.query.page) || 1)
        let where = ' WHERE 1 = 1'
        const params = []
        if (q) {
            where += ' AND (k.kar_Nik LIKE ? OR k.kar_nama LIKE ?)'
            params.push(`%${q}%`, `%${q}%`)
        }
        const [rows] = await pool.query(
            `SELECT k.kar_Nik AS Nik, k.kar_nama AS Nama, j.jab_nama AS Jabatan,
                    k.kar_bagian AS Bagian, k.kar_pab_kode AS Pabrik
             FROM tkaryawan k LEFT JOIN tjabatan j ON j.jab_kode = k.kar_jab_kode
             ${where} ORDER BY k.kar_nama LIMIT ? OFFSET ?`,
            [...params, perPage, (page - 1) * perPage]
        )
        const [cnt] = await pool.query(`SELECT COUNT(*) AS c FROM tkaryawan k ${where}`, params)
        paginated(res, rows, {
            page,
            per_page: perPage,
            total: cnt[0].c,
            last_page: Math.ceil(cnt[0].c / perPage),
        })
    } catch (err) {
        next(err)
    }
}

/** Daftar bagian unik (edtBagianClickBtn). */
export const getBagian = async (req, res, next) => {
    try {
        const q = String(req.query.search || '').trim()
        const params = []
        let where = " WHERE kar_bagian IS NOT NULL AND kar_bagian <> ''"
        if (q) {
            where += ' AND kar_bagian LIKE ?'
            params.push(`%${q}%`)
        }
        const [rows] = await pool.query(
            `SELECT DISTINCT kar_bagian AS Bagian FROM tkaryawan${where} ORDER BY kar_bagian LIMIT 200`,
            params
        )
        success(res, rows.map((r) => r.Bagian))
    } catch (err) {
        next(err)
    }
}

/**
 * Simpan (ufrmPermintaanKaryawan.simpandata).
 * Body: { nomor?, peminta, tanggal, jab_kode, bagian, tgl_butuh, jumlah,
 *         alasan, alasan_lain, keterangan[10], spesifikasi[10] }
 */
export const savePermintaan = async (req, res, next) => {
    try {
        const b = req.body || {}
        const peminta = String(b.peminta || '').trim()
        const tanggal = String(b.tanggal || '').slice(0, 10)
        const jabKode = String(b.jab_kode || '').trim()
        const bagian = String(b.bagian || '').trim()
        const tglButuh = String(b.tgl_butuh || '').slice(0, 10)
        const jumlah = parseInt(b.jumlah, 10)

        if (!peminta) return error(res, 'Peminta (NIK) wajib diisi', 400)
        if (!tanggal) return error(res, 'Tanggal wajib diisi', 400)
        if (!jabKode) return error(res, 'Jabatan wajib dipilih', 400)
        if (!bagian) return error(res, 'Bagian wajib diisi', 400)
        if (!tglButuh) return error(res, 'Tanggal butuh wajib diisi', 400)
        if (!Number.isInteger(jumlah) || jumlah <= 0) return error(res, 'Jumlah belum diisi / tidak valid', 400)

        const [krows] = await pool.query('SELECT kar_nama FROM tkaryawan WHERE kar_Nik = ?', [peminta])
        if (krows.length === 0) return error(res, `NIK peminta ${peminta} tidak dikenal`, 400)
        const [jrows] = await pool.query('SELECT jab_kode FROM tjabatan WHERE jab_kode = ? LIMIT 1', [jabKode])
        if (jrows.length === 0) return error(res, `Jabatan ${jabKode} tidak dikenal`, 400)

        const ket = Array.isArray(b.keterangan) ? b.keterangan : []
        const spes = Array.isArray(b.spesifikasi) ? b.spesifikasi : []
        const ketVals = KET_COLS.map((_, i) => String(ket[i] ?? ''))
        const spesVals = SPES_COLS.map((_, i) => {
            if (spes[i] !== undefined) return String(spes[i])
            return SPESIFIKASI_DEFAULT[i] || ''
        })

        const nomorEdit = String(b.nomor || '').trim()
        if (nomorEdit) {
            const [ada] = await pool.query('SELECT tpk_nomor FROM tpermintaankaryawan WHERE tpk_nomor = ?', [
                nomorEdit,
            ])
            if (ada.length === 0) return error(res, 'Nomor tidak ditemukan', 404)
            await pool.query(
                `UPDATE tpermintaankaryawan SET tpk_peminta = ?, tpk_tanggal = ?, tpk_jab_kode = ?,
                    tpk_bagian = ?, tpk_tgl_butuh = ?, tpk_jumlah = ?, tpk_alasan = ?, tpk_alasanlain = ?,
                    ${KET_COLS.map((c) => `${c} = ?`).join(', ')},
                    ${SPES_COLS.map((c) => `${c} = ?`).join(', ')}
                 WHERE tpk_nomor = ?`,
                [
                    peminta, tanggal, jabKode, bagian, tglButuh, jumlah,
                    String(b.alasan || ''), String(b.alasan_lain || ''),
                    ...ketVals, ...spesVals, nomorEdit,
                ]
            )
            return success(res, { nomor: nomorEdit }, `Berhasil simpan dengan nomor ${nomorEdit}`)
        }

        const nomor = await nomorBerikut(tanggal)
        await pool.query(
            `INSERT INTO tpermintaankaryawan (tpk_nomor, tpk_peminta, tpk_tanggal, tpk_jab_kode, tpk_bagian,
                tpk_tgl_butuh, tpk_jumlah, tpk_alasan, tpk_alasanlain,
                ${KET_COLS.join(', ')}, ${SPES_COLS.join(', ')})
             VALUES (${Array(9 + 20).fill('?').join(', ')})`,
            [nomor, peminta, tanggal, jabKode, bagian, tglButuh, jumlah, String(b.alasan || ''), String(b.alasan_lain || ''), ...ketVals, ...spesVals]
        )
        success(res, { nomor }, `Berhasil simpan dengan nomor ${nomor}`)
    } catch (err) {
        next(err)
    }
}

/** Hapus — MENOLAK bila sudah ada realisasi (perbaikan bug Delphi). */
export const deletePermintaan = async (req, res, next) => {
    try {
        const nomor = String(req.params.nomor || req.query.nomor || '')
        if (!nomor) return error(res, 'Nomor wajib diisi', 400)
        const [riil] = await pool.query(
            'SELECT COUNT(*) AS c FROM triilpermintaankaryawan WHERE rpk_tpk_nomor = ?',
            [nomor]
        )
        if (riil[0].c > 0) {
            return error(res, `Nomor ${nomor} sudah direalisasi (${riil[0].c} baris) — hapus realisasi dulu`, 409)
        }
        const [r] = await pool.query('DELETE FROM tpermintaankaryawan WHERE tpk_nomor = ?', [nomor])
        if (r.affectedRows === 0) return error(res, 'Nomor tidak ditemukan', 404)
        success(res, null, 'Data berhasil dihapus')
    } catch (err) {
        next(err)
    }
}
