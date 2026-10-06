import pool from '../../config/database.js'
import { success, error, paginated } from '../../helpers/response.js'
import { buildOrderBy, applyAllColumnFilters } from '../../helpers/browse.js'
import { sendExcel } from '../../helpers/excel.js'

/**
 * Modul Surat Peringatan (SP) — cerminan unit Delphi:
 *   ufrmBrowseSP -> daftar per periode + hapus + cetak surat
 *   ufrmSP       -> form satu dokumen
 *
 * Tabel: `tsp` (sp_nomor PK `NNN/HRD/GA-KP/SP/MM/YY`), `tkaryawan`,
 *        `tjabatan`, `tpabrik`.
 *
 * Aturan Delphi yang diduplikasi (ufrmSP):
 * - Nomor: 3 digit urut per TAHUN berjalan + `/HRD/GA-KP/SP/` + MM/yy.
 * - Tingkatan (cbSPKe): Pembinaan, 1 (Satu), 2 (Dua), 3 (Tiga).
 * - ambilsp: SP aktif NIK itu pada tanggal dokumen (periode1 <= tgl <=
 *   periode2, selain nomor sendiri). Bila peringkat SP aktif >= peringkat
 *   yang diminta -> tolak ("sudah pernah ada SP ...").
 * - Cetak: query `tsp + karyawan + nama_atasan + jab_atasan`.
 * - Tidak ada otorisasi tanggal pada modul ini di Delphi.
 *
 * PERBAIKAN kecil dari Delphi: update Delphi tidak menyimpan sp_bagian;
 * versi web ikut menyimpannya agar konsisten dengan insert.
 */

/** Urutan peringkat tingkatan SP (rendah -> tinggi). */
export const SP_KE = ['Pembinaan', '1 (Satu)', '2 (Dua)', '3 (Tiga)']

/** Kolom browse — mengikuti `ufrmBrowseSP.btnRefreshClick`. */
const LIST_COLUMNS = {
    Nomor: 't.sp_nomor',
    Tanggal: 't.sp_tanggal',
    Nik: 't.sp_nik',
    Nama: 'x.kar_nama',
    Pabrik: 't.sp_pab_kode',
    Jabatan: 'j.jab_nama',
    Bagian: 't.sp_bagian',
    Periode1: 't.sp_periode1',
    Periode2: 't.sp_periode2',
    Keterangan: 't.sp_keterangan',
    Tingkatan: 't.sp_ke',
}

const FROM_SQL = `FROM tsp t
    INNER JOIN tkaryawan x ON x.kar_Nik = t.sp_nik
    INNER JOIN tjabatan j ON j.jab_kode = t.sp_jab_kode
    INNER JOIN tpabrik p ON p.pab_kode = x.kar_pab_kode`

const SELECT_SQL = `SELECT ${Object.entries(LIST_COLUMNS)
    .map(([alias, expr]) => `${expr} AS \`${alias}\``)
    .join(', ')} ${FROM_SQL}`

/** Nomor berikutnya: NNN/HRD/GA-KP/SP/MM/YY (ufrmSP.getmaxnomor). */
export async function nomorBerikut(tanggal) {
    const d = new Date(String(tanggal).slice(0, 10))
    const tahun = d.getFullYear()
    const suffix = `/HRD/GA-KP/SP/${String(d.getMonth() + 1).padStart(2, '0')}/${String(tahun).slice(-2)}`
    const [rows] = await pool.query('SELECT MAX(LEFT(sp_nomor, 3)) AS m FROM tsp WHERE YEAR(sp_tanggal) = ?', [
        tahun,
    ])
    const m = rows[0]?.m ? parseInt(rows[0].m, 10) : 0
    return `${String(1000 + m + 1).slice(-3)}${suffix}`
}

/**
 * SP aktif seorang NIK pada tanggal tertentu (ufrmSP.ambilsp):
 * periode1 <= tanggal <= periode2, selain nomor yang dikecualikan,
 * yang terbaru (order by sp_tanggal desc limit 1).
 */
export async function ambilSP(nik, tanggal, kecualiNomor = '') {
    const tgl = String(tanggal).slice(0, 10)
    const params = [tgl, tgl, String(nik)]
    let sql = `SELECT sp_ke FROM tsp WHERE sp_periode1 <= ? AND sp_periode2 >= ? AND sp_nik = ?`
    if (kecualiNomor) {
        sql += ' AND sp_nomor <> ?'
        params.push(String(kecualiNomor))
    }
    sql += ' ORDER BY sp_tanggal DESC LIMIT 1'
    const [rows] = await pool.query(sql, params)
    return rows.length ? rows[0].sp_ke : ''
}

/** Daftar SP per periode (default bulan berjalan). */
export const getSPList = async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1)
        const perPage = Math.min(500, parseInt(req.query.per_page) || 25)
        const offset = (page - 1) * perPage
        const start = req.query.start_date || `${new Date().toISOString().slice(0, 7)}-01`
        const end = req.query.end_date || new Date().toISOString().slice(0, 10)

        let where = ' WHERE t.sp_tanggal BETWEEN ? AND ?'
        let params = [start, end]
        if (req.query.search) {
            where += ' AND (t.sp_nomor LIKE ? OR t.sp_nik LIKE ? OR x.kar_nama LIKE ? OR t.sp_keterangan LIKE ?)'
            params = [...params, ...Array(4).fill(`%${req.query.search}%`)]
        }
        if (req.query.pabrik) {
            where += ' AND x.kar_pab_kode = ?'
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
        const orderBy = buildOrderBy(req.query, LIST_COLUMNS, 'ORDER BY t.sp_tanggal DESC, t.sp_nomor DESC')

        if (req.query.export === 'xlsx') {
            const [all] = await pool.query(`${SELECT_SQL}${where} ${orderBy} LIMIT 50000`, params)
            return sendExcel(res, 'SP', Object.keys(LIST_COLUMNS), all)
        }

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

/** Nomor berikutnya untuk tanggal tertentu. */
export const getNomor = async (req, res, next) => {
    try {
        const tanggal = String(req.query.tanggal || new Date().toISOString().slice(0, 10)).slice(0, 10)
        success(res, { nomor: await nomorBerikut(tanggal), tanggal })
    } catch (err) {
        next(err)
    }
}

/** Satu dokumen (ufrmSP.loaddataall). */
export const getSP = async (req, res, next) => {
    try {
        const nomor = String(req.query.nomor || req.params.nomor || '')
        if (!nomor) return error(res, 'Nomor wajib diisi', 400)
        const [rows] = await pool.query(
            `SELECT t.sp_nomor, t.sp_tanggal, t.sp_nik, c.kar_nama, t.sp_pab_kode,
                    c.kar_bagian, t.sp_bagian, t.sp_jab_kode, j.jab_nama,
                    t.sp_keterangan, t.sp_periode1, t.sp_periode2, t.sp_ke
             FROM tsp t
             INNER JOIN tkaryawan c ON c.kar_Nik = t.sp_nik
             INNER JOIN tjabatan j ON j.jab_kode = t.sp_jab_kode
             WHERE t.sp_nomor = ?`,
            [nomor]
        )
        if (rows.length === 0) return error(res, 'Nomor tidak ditemukan', 404)
        const r = rows[0]
        success(res, {
            nomor: r.sp_nomor,
            tanggal: String(r.sp_tanggal).slice(0, 10),
            nik: r.sp_nik,
            nama: r.kar_nama,
            pabrik: r.sp_pab_kode,
            jab_kode: r.sp_jab_kode,
            jabatan: r.jab_nama,
            bagian: r.sp_bagian || r.kar_bagian,
            keterangan: r.sp_keterangan,
            periode1: String(r.sp_periode1).slice(0, 10),
            periode2: String(r.sp_periode2).slice(0, 10),
            sp_ke: r.sp_ke,
        })
    } catch (err) {
        next(err)
    }
}

/** Lookup karyawan. */
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

/** Data karyawan (ufrmSP.loaddata). */
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

/** Cek SP aktif NIK pada tanggal (live check untuk form). */
export const cekSP = async (req, res, next) => {
    try {
        const nik = String(req.query.nik || '')
        const tanggal = String(req.query.tanggal || '').slice(0, 10)
        const kecuali = String(req.query.kecuali || '')
        if (!nik || !tanggal) return error(res, 'NIK dan tanggal wajib diisi', 400)
        success(res, { nik, tanggal, sp_aktif: await ambilSP(nik, tanggal, kecuali) })
    } catch (err) {
        next(err)
    }
}

/**
 * Simpan (ufrmSP.simpandata + validasi ambilsp di cxButton1Click/2Click).
 * Body: { nomor?, tanggal, nik, periode1, periode2, keterangan, sp_ke }
 * jab/pabrik/bagian selalu dibaca ulang dari master karyawan.
 */
export const saveSP = async (req, res, next) => {
    try {
        const b = req.body || {}
        const tanggal = String(b.tanggal || '').slice(0, 10)
        const nik = String(b.nik || '').trim()
        const periode1 = String(b.periode1 || '').slice(0, 10)
        const periode2 = String(b.periode2 || '').slice(0, 10)
        const keterangan = String(b.keterangan || '')
        const spKe = String(b.sp_ke || 'Pembinaan')

        if (!tanggal) return error(res, 'Tanggal wajib diisi', 400)
        if (!nik) return error(res, 'NIK wajib diisi', 400)
        if (!periode1 || !periode2) return error(res, 'Periode SP (awal & akhir) wajib diisi', 400)
        if (periode2 < periode1) return error(res, 'Periode akhir harus >= periode awal', 400)
        if (!keterangan) return error(res, 'Keterangan/alasan SP wajib diisi', 400)
        if (!SP_KE.includes(spKe)) return error(res, 'Tingkatan SP tidak valid', 400)

        const [krows] = await pool.query(
            'SELECT kar_jab_kode, kar_pab_kode, kar_bagian FROM tkaryawan WHERE kar_Nik = ?',
            [nik]
        )
        if (krows.length === 0) return error(res, `NIK ${nik} tidak ada pada master karyawan`, 400)

        const nomorEdit = String(b.nomor || '').trim()
        if (nomorEdit) {
            const [ada] = await pool.query('SELECT sp_nomor FROM tsp WHERE sp_nomor = ?', [nomorEdit])
            if (ada.length === 0) return error(res, 'Nomor tidak ditemukan', 404)
        }

        // Validasi peringkat SP aktif (Delphi: tolak bila peringkat aktif >= diminta).
        const aktif = await ambilSP(nik, tanggal, nomorEdit)
        if (aktif) {
            const rankAktif = SP_KE.indexOf(aktif)
            const rankMinta = SP_KE.indexOf(spKe)
            if (rankAktif >= 0 && rankAktif >= rankMinta) {
                return error(res, `Karyawan ini sudah pernah ada SP ${aktif}`, 409)
            }
        }

        if (nomorEdit) {
            await pool.query(
                `UPDATE tsp SET sp_tanggal = ?, sp_nik = ?, sp_jab_kode = ?, sp_pab_kode = ?,
                    sp_bagian = ?, sp_periode1 = ?, sp_periode2 = ?, sp_keterangan = ?, sp_ke = ?
                 WHERE sp_nomor = ?`,
                [
                    tanggal, nik, krows[0].kar_jab_kode, krows[0].kar_pab_kode, krows[0].kar_bagian,
                    periode1, periode2, keterangan, spKe, nomorEdit,
                ]
            )
            return success(res, { nomor: nomorEdit }, `Berhasil simpan dengan nomor ${nomorEdit}`)
        }

        const nomor = await nomorBerikut(tanggal)
        await pool.query(
            `INSERT INTO tsp (sp_nomor, sp_tanggal, sp_nik, sp_jab_kode, sp_pab_kode, sp_bagian,
                sp_keterangan, sp_periode1, sp_periode2, sp_ke)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                nomor, tanggal, nik, krows[0].kar_jab_kode, krows[0].kar_pab_kode, krows[0].kar_bagian,
                keterangan, periode1, periode2, spKe,
            ]
        )
        success(res, { nomor }, `Berhasil simpan dengan nomor ${nomor}`)
    } catch (err) {
        next(err)
    }
}

/** Hapus satu dokumen (ufrmBrowseSP.cxButton4Click). */
export const deleteSP = async (req, res, next) => {
    try {
        const nomor = String(req.params.nomor || req.query.nomor || '')
        if (!nomor) return error(res, 'Nomor wajib diisi', 400)
        const [r] = await pool.query('DELETE FROM tsp WHERE sp_nomor = ?', [nomor])
        if (r.affectedRows === 0) return error(res, 'Nomor tidak ditemukan', 404)
        success(res, null, 'Data berhasil dihapus')
    } catch (err) {
        next(err)
    }
}

/**
 * Data surat SP (cxButton3Click/cxButton5Click -> report `SP`).
 * Frontend merender/mencetaknya (tombol cetak & unduh PDF Delphi
 * disatukan menjadi satu dialog surat).
 */
export const getSurat = async (req, res, next) => {
    try {
        const nomor = String(req.params.nomor || req.query.nomor || '')
        if (!nomor) return error(res, 'Nomor wajib diisi', 400)
        const [rows] = await pool.query(
            `SELECT a.sp_Nomor AS sp_nomor, a.SP_Tanggal AS sp_tanggal, a.sp_nik,
                    a.sp_jab_kode, a.sp_bagian, a.sp_keterangan,
                    a.sp_periode1, a.sp_periode2, a.sp_ke, a.sp_pab_kode,
                    c.kar_nama, c.kar_bagian, c.kar_nik_atasan,
                    b.jab_nama,
                    (SELECT k2.kar_nama FROM tkaryawan k2 WHERE k2.kar_Nik = c.kar_nik_atasan) AS nama_atasan,
                    (SELECT j2.jab_nama FROM tkaryawan k3 INNER JOIN tjabatan j2 ON j2.jab_kode = k3.kar_jab_kode
                      WHERE k3.kar_Nik = c.kar_nik_atasan) AS jab_atasan
             FROM tsp a
             INNER JOIN tkaryawan c ON c.kar_Nik = a.sp_nik
             INNER JOIN tjabatan b ON b.jab_kode = a.sp_jab_kode
             INNER JOIN tpabrik p ON p.pab_kode = c.kar_pab_kode
             WHERE a.sp_Nomor = ?`,
            [nomor]
        )
        if (rows.length === 0) return error(res, 'Nomor tidak ditemukan', 404)
        success(res, rows[0])
    } catch (err) {
        next(err)
    }
}
