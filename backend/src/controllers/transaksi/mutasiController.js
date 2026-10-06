import pool from '../../config/database.js'
import { success, error, paginated } from '../../helpers/response.js'
import { buildOrderBy, applyAllColumnFilters } from '../../helpers/browse.js'

/**
 * Modul Mutasi Karyawan — cerminan unit Delphi:
 *   ufrmBrowseMutasiKaryawan -> daftar mutasi per periode + cetak surat
 *   ufrmMutasiKaryawan       -> form satu dokumen mutasi
 *
 * Tabel: `tmutasi` (mut_nomor PK `NNN/HRD-KP/MM/YY`), `tkaryawan`,
 *        `tjabatan`, `tpabrik`, `tdepartemen`.
 *
 * Aturan Delphi yang diduplikasi (ufrmMutasiKaryawan):
 * - Nomor: 3 digit urut per TAHUN berjalan + `/HRD-KP/` + MM/yy(tanggal)
 *   (getmaxnomor; kode lama `MUT.YYYYMM.NNNN` sudah tidak dipakai).
 * - Form menampilkan data LAMA (pabrik/jabatan/bagian dari tkaryawan) dan
 *   data BARU (pabrik/jabatan/departemen pilihan + bagian baru bebas).
 * - Alasan berupa combo tetap: Mutasi, Demosi, Promosi, Rotasi.
 * - Tidak ada otorisasi tanggal pada modul ini di Delphi.
 */

export const ALASAN_MUTASI = ['Mutasi', 'Demosi', 'Promosi', 'Rotasi']

/** Kolom browse — mengikuti `ufrmBrowseMutasiKaryawan.btnRefreshClick`. */
const LIST_COLUMNS = {
    Nomor: 'm.mut_nomor',
    Tanggal: 'm.mut_tanggal',
    Keterangan: 'm.mut_alasan',
    Nik: 'm.mut_nik',
    Nama: 'k.kar_nama',
    'Pabrik Lama': 'm.mut_pab_kode',
    'Bagian Lama': 'm.mut_bagian',
    Jabatan_Lama: '(SELECT z.jab_nama FROM tjabatan z WHERE z.jab_kode = m.mut_jab_kode)',
    'Pabrik Baru': 'm.mut_pab_kode2',
    'Bagian Baru': 'm.mut_bagian2',
    Jabatan_Baru: '(SELECT z.jab_nama FROM tjabatan z WHERE z.jab_kode = m.mut_jab_kode2)',
    Menimbang: 'm.mut_menimbang',
    Mengingat: 'm.mut_mengingat',
    Alasan: 'm.mut_alasan',
    Lapor: 'm.mut_lapor',
}

const FROM_SQL = `FROM tmutasi m
    INNER JOIN tkaryawan k ON k.kar_Nik = m.mut_nik
    INNER JOIN tjabatan j ON j.jab_kode = m.mut_jab_kode
    INNER JOIN tpabrik p ON p.pab_kode = m.mut_pab_kode`

const SELECT_SQL = `SELECT ${Object.entries(LIST_COLUMNS)
    .map(([alias, expr]) => `${expr} AS \`${alias}\``)
    .join(', ')} ${FROM_SQL}`

/** Nomor berikutnya: NNN/HRD-KP/MM/YY (ufrmMutasiKaryawan.getmaxnomor). */
export async function nomorBerikut(tanggal) {
    const d = new Date(String(tanggal).slice(0, 10))
    const tahun = d.getFullYear()
    const suffix = `/HRD-KP/${String(d.getMonth() + 1).padStart(2, '0')}/${String(tahun).slice(-2)}`
    const [rows] = await pool.query(
        "SELECT MAX(LEFT(mut_nomor, 3)) AS m FROM tmutasi WHERE YEAR(mut_tanggal) = ? AND mut_nomor LIKE '%/HRD-KP/%'",
        [tahun]
    )
    const m = rows[0]?.m ? parseInt(rows[0].m, 10) : 0
    return `${String(1000 + m + 1).slice(-3)}${suffix}`
}

/** Daftar mutasi per periode (default bulan berjalan). */
export const getMutasiList = async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1)
        const perPage = Math.min(500, parseInt(req.query.per_page) || 25)
        const offset = (page - 1) * perPage
        const start = req.query.start_date || `${new Date().toISOString().slice(0, 7)}-01`
        const end = req.query.end_date || new Date().toISOString().slice(0, 10)

        let where = ' WHERE m.mut_tanggal BETWEEN ? AND ?'
        let params = [start, end]
        if (req.query.search) {
            where += ' AND (m.mut_nomor LIKE ? OR m.mut_nik LIKE ? OR k.kar_nama LIKE ? OR m.mut_bagian2 LIKE ?)'
            params = [...params, ...Array(4).fill(`%${req.query.search}%`)]
        }
        if (req.query.pabrik) {
            where += ' AND m.mut_pab_kode = ?'
            params.push(req.query.pabrik)
        }

        if (req.query.distinct && LIST_COLUMNS[req.query.distinct]) {
            const dcol = LIST_COLUMNS[req.query.distinct]
            const scoped = applyAllColumnFilters(where, params, req.query, LIST_COLUMNS, req.query.distinct)
            const dwhere = scoped.clause ? `${scoped.clause} AND` : 'WHERE'
            const [drows] = await pool.query(
                `SELECT DISTINCT ${dcol} AS value ${FROM_SQL} ${dwhere} ${dcol} IS NOT NULL AND ${dcol} <> '' ORDER BY value LIMIT 500`,
                scoped.params
            )
            return success(res, drows.map((r) => r.value))
        }

        const f = applyAllColumnFilters(where, params, req.query, LIST_COLUMNS)
        where = f.clause
        params = f.params
        const orderBy = buildOrderBy(req.query, LIST_COLUMNS, 'ORDER BY m.mut_tanggal DESC, m.mut_nomor DESC')

        const [cnt] = await pool.query(`SELECT COUNT(*) AS total ${FROM_SQL}${where}`, params)
        const total = cnt[0].total
        const [rows] = await pool.query(`${SELECT_SQL}${where} ${orderBy} LIMIT ? OFFSET ?`, [
            ...params,
            perPage,
            offset,
        ])
        paginated(res, rows, { page, per_page: perPage, total, last_page: Math.ceil(total / perPage) })
    } catch (err) {
        next(err)
    }
}

/** Nomor mutasi berikutnya untuk tanggal tertentu. */
export const getNomor = async (req, res, next) => {
    try {
        const tanggal = String(req.query.tanggal || new Date().toISOString().slice(0, 10)).slice(0, 10)
        success(res, { nomor: await nomorBerikut(tanggal), tanggal })
    } catch (err) {
        next(err)
    }
}

/** Satu dokumen mutasi (ufrmMutasiKaryawan.loaddataall). */
export const getMutasi = async (req, res, next) => {
    try {
        const nomor = String(req.query.nomor || req.params.nomor || '')
        if (!nomor) return error(res, 'Nomor mutasi wajib diisi', 400)
        const [rows] = await pool.query(
            `SELECT m.*, k.kar_nama,
                    (SELECT z.jab_nama FROM tjabatan z WHERE z.jab_kode = m.mut_jab_kode) AS jabatan_lama_nama,
                    (SELECT z.jab_nama FROM tjabatan z WHERE z.jab_kode = m.mut_jab_kode2) AS jabatan_baru_nama,
                    (SELECT p.pab_nama FROM tpabrik p WHERE p.pab_kode = m.mut_pab_kode) AS pabrik_lama_nama,
                    (SELECT p.pab_nama FROM tpabrik p WHERE p.pab_kode = m.mut_pab_kode2) AS pabrik_baru_nama,
                    (SELECT d.dep_nama FROM tdepartemen d WHERE d.dep_kode = m.mut_departemen) AS departemen_nama
             FROM tmutasi m INNER JOIN tkaryawan k ON k.kar_Nik = m.mut_nik
             WHERE m.mut_nomor = ?`,
            [nomor]
        )
        if (rows.length === 0) return error(res, 'Nomor mutasi tidak ditemukan', 404)
        const m = rows[0]
        success(res, {
            nomor: m.mut_nomor,
            tanggal: String(m.mut_tanggal).slice(0, 10),
            nik: m.mut_nik,
            nama: m.kar_nama,
            pabrik_lama: m.mut_pab_kode,
            pabrik_lama_nama: m.pabrik_lama_nama,
            jabatan_lama: m.mut_jab_kode,
            jabatan_lama_nama: m.jabatan_lama_nama,
            bagian_lama: m.mut_bagian,
            menimbang: m.mut_menimbang,
            mengingat: m.mut_mengingat,
            lapor: m.mut_lapor,
            pabrik_baru: m.mut_pab_kode2,
            pabrik_baru_nama: m.pabrik_baru_nama,
            jabatan_baru: m.mut_jab_kode2,
            jabatan_baru_nama: m.jabatan_baru_nama,
            bagian_baru: m.mut_bagian2,
            departemen: m.mut_departemen,
            departemen_nama: m.departemen_nama,
            alasan: m.mut_alasan,
        })
    } catch (err) {
        next(err)
    }
}

/** Lookup karyawan (ufrmMutasiKaryawan.edtNikClickBtn) + data lama. */
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
        if (req.query.pabrik) {
            where += ' AND k.kar_pab_kode = ?'
            params.push(req.query.pabrik)
        }
        const [rows] = await pool.query(
            `SELECT k.kar_Nik AS Nik, k.kar_nama AS Nama, k.kar_pab_kode AS Pabrik,
                    j.jab_nama AS Jabatan, k.kar_bagian AS Bagian,
                    IF(k.kar_status_aktif = 1, 'Aktif', 'Non Aktif') AS Status
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

/** Data lama satu karyawan (ufrmMutasiKaryawan.loaddata). */
export const infoKaryawan = async (req, res, next) => {
    try {
        const nik = String(req.query.nik || '')
        if (!nik) return error(res, 'NIK wajib diisi', 400)
        const [rows] = await pool.query(
            `SELECT k.kar_Nik AS nik, k.kar_nama AS nama, k.kar_pab_kode AS pabrik,
                    k.kar_jab_kode AS jab_kode, j.jab_nama AS jabatan, k.kar_bagian AS bagian
             FROM tkaryawan k LEFT JOIN tjabatan j ON j.jab_kode = k.kar_jab_kode
             WHERE k.kar_Nik = ?`,
            [nik]
        )
        if (rows.length === 0) return error(res, `NIK ${nik} tidak ditemukan`, 404)
        success(res, rows[0])
    } catch (err) {
        next(err)
    }
}

/** Daftar bagian unik (ufrmMutasiKaryawan.edtBagianBaruClickBtn). */
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
 * Simpan mutasi (ufrmMutasiKaryawan.simpandata).
 * Body: { nomor?, tanggal, nik, pabrik_baru, jabatan_baru, bagian_baru,
 *         alasan, menimbang, mengingat, lapor, departemen }
 * Data lama (pabrik/jabatan/bagian) selalu dibaca ulang dari tkaryawan
 * supaya surat mutasi konsisten walau master berubah setelah simpan.
 */
export const saveMutasi = async (req, res, next) => {
    try {
        const b = req.body || {}
        const tanggal = String(b.tanggal || '').slice(0, 10)
        const nik = String(b.nik || '').trim()
        const pabrikBaru = String(b.pabrik_baru || '').trim()
        const jabatanBaru = String(b.jabatan_baru || '').trim()
        const bagianBaru = String(b.bagian_baru || '').trim()
        const alasan = String(b.alasan || 'Mutasi')
        const departemen = String(b.departemen || '').trim()

        if (!tanggal) return error(res, 'Tanggal wajib diisi', 400)
        if (!nik) return error(res, 'NIK wajib diisi', 400)
        if (!pabrikBaru) return error(res, 'Pabrik baru wajib dipilih', 400)
        if (!jabatanBaru) return error(res, 'Jabatan baru wajib dipilih', 400)
        if (!bagianBaru) return error(res, 'Bagian baru wajib diisi', 400)
        if (!departemen) return error(res, 'Departemen wajib dipilih', 400)
        if (!ALASAN_MUTASI.includes(alasan)) return error(res, 'Alasan tidak valid', 400)

        const [krows] = await pool.query(
            'SELECT kar_pab_kode, kar_jab_kode, kar_bagian FROM tkaryawan WHERE kar_Nik = ?',
            [nik]
        )
        if (krows.length === 0) return error(res, `NIK ${nik} tidak ada pada master karyawan`, 400)
        const lama = krows[0]

        for (const [tbl, kol, val, label] of [
            ['tpabrik', 'pab_kode', pabrikBaru, 'Pabrik baru'],
            ['tjabatan', 'jab_kode', jabatanBaru, 'Jabatan baru'],
            ['tdepartemen', 'dep_kode', departemen, 'Departemen'],
        ]) {
            const [r] = await pool.query(`SELECT 1 FROM ${tbl} WHERE ${kol} = ? LIMIT 1`, [val])
            if (r.length === 0) return error(res, `${label} ${val} tidak dikenal`, 400)
        }

        const nomorEdit = String(b.nomor || '').trim()
        if (nomorEdit) {
            const [ada] = await pool.query('SELECT mut_nomor FROM tmutasi WHERE mut_nomor = ?', [nomorEdit])
            if (ada.length === 0) return error(res, 'Nomor mutasi tidak ditemukan', 404)
            await pool.query(
                `UPDATE tmutasi SET mut_tanggal = ?, mut_nik = ?, mut_pab_kode2 = ?, mut_jab_kode2 = ?,
                    mut_bagian2 = ?, mut_alasan = ?, mut_menimbang = ?, mut_mengingat = ?,
                    mut_lapor = ?, mut_departemen = ? WHERE mut_nomor = ?`,
                [
                    tanggal, nik, pabrikBaru, jabatanBaru, bagianBaru, alasan,
                    String(b.menimbang || ''), String(b.mengingat || ''), String(b.lapor || ''),
                    departemen, nomorEdit,
                ]
            )
            return success(res, { nomor: nomorEdit }, `Berhasil simpan dengan nomor ${nomorEdit}`)
        }

        const nomor = await nomorBerikut(tanggal)
        await pool.query(
            `INSERT INTO tmutasi (mut_nomor, mut_tanggal, mut_nik, mut_pab_kode, mut_jab_kode, mut_bagian,
                mut_menimbang, mut_mengingat, mut_pab_kode2, mut_jab_kode2, mut_bagian2,
                mut_alasan, mut_lapor, mut_departemen)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                nomor, tanggal, nik, lama.kar_pab_kode, lama.kar_jab_kode, lama.kar_bagian,
                String(b.menimbang || ''), String(b.mengingat || ''), pabrikBaru, jabatanBaru,
                bagianBaru, alasan, String(b.lapor || ''), departemen,
            ]
        )
        success(res, { nomor }, `Berhasil simpan dengan nomor ${nomor}`)
    } catch (err) {
        next(err)
    }
}

/** Hapus satu dokumen mutasi. */
export const deleteMutasi = async (req, res, next) => {
    try {
        const nomor = String(req.params.nomor || req.query.nomor || '')
        if (!nomor) return error(res, 'Nomor mutasi wajib diisi', 400)
        const [r] = await pool.query('DELETE FROM tmutasi WHERE mut_nomor = ?', [nomor])
        if (r.affectedRows === 0) return error(res, 'Nomor mutasi tidak ditemukan', 404)
        success(res, null, 'Mutasi berhasil dihapus')
    } catch (err) {
        next(err)
    }
}

/**
 * Data surat mutasi (ufrmBrowseMutasiKaryawan.cxButton3Click -> report `Mutasi`).
 * Frontend merendernya menjadi surat keputusan / cetakan PDF.
 */
export const getSurat = async (req, res, next) => {
    try {
        const nomor = String(req.params.nomor || req.query.nomor || '')
        if (!nomor) return error(res, 'Nomor mutasi wajib diisi', 400)
        const [rows] = await pool.query(
            `SELECT m.mut_nomor, m.mut_tanggal, k.kar_Nik, k.kar_nama,
                    CONCAT(z.jab_nama, ' ', m.mut_bagian, ' ', m.mut_pab_kode) AS jabatan1,
                    CONCAT(zz.jab_nama, ' ', m.mut_bagian2, ' ', m.mut_pab_kode2) AS jabatan2,
                    IF(m.mut_pab_kode2 = 'P04', 'Garment', 'Spanduk') AS Departmen,
                    m.mut_alasan, m.mut_lapor AS lapor, m.mut_mengingat, m.mut_menimbang,
                    (SELECT d.dep_nama FROM tdepartemen d WHERE d.dep_kode = m.mut_departemen) AS mut_departemen
             FROM tmutasi m
             INNER JOIN tkaryawan k ON k.kar_Nik = m.mut_nik
             LEFT JOIN tjabatan z ON z.jab_kode = m.mut_jab_kode
             LEFT JOIN tjabatan zz ON zz.jab_kode = m.mut_jab_kode2
             WHERE m.mut_nomor = ?`,
            [nomor]
        )
        if (rows.length === 0) return error(res, 'Nomor mutasi tidak ditemukan', 404)
        success(res, rows[0])
    } catch (err) {
        next(err)
    }
}
