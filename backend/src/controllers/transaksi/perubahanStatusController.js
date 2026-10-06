import pool from '../../config/database.js'
import { success, error, paginated } from '../../helpers/response.js'
import { buildOrderBy, applyAllColumnFilters } from '../../helpers/browse.js'

/**
 * Modul Perubahan Status — cerminan unit Delphi:
 *   ufrmBrowsePerubahanStatus -> daftar per periode + hapus + cetak PKWT
 *   ufrmPerubahanStatus       -> form satu dokumen
 *
 * Tabel: `tperubahanstatus` (ps_nomor PK `PST.YYYYMM.NNNN`), `tkaryawan`,
 *        `tjabatan`, `tpabrik`, `tstatuskaryawan`.
 *
 * Aturan Delphi yang diduplikasi:
 * - Nomor: `PST.` + yyyymm(tanggal) + `.` + urut 4 digit per bulan.
 * - Status lama dibaca dari master karyawan (`kar_status_kerja`);
 *   status baru pilihan dari `tstatuskaryawan`; keduanya + periode
 *   PKWT (tgl awal/akhir) disimpan ke `tperubahanstatus`.
 * - Cetak (cxButton3Click): template PKWT1 bila status baru = 2,
 *   PKWT2 bila = 3, selain itu PKWT3; query surat menyertakan umur,
 *   jenis kelamin, alamat, departemen.
 * - Tidak ada otorisasi tanggal pada modul ini di Delphi.
 */

/** Kolom browse — mengikuti `ufrmBrowsePerubahanStatus.btnRefreshClick`. */
const LIST_COLUMNS = {
    Nomor: 'a.ps_nomor',
    Tanggal: 'a.ps_tanggal',
    Nik: 'a.ps_kar_nik',
    Nama: 'k.kar_nama',
    Bagian: 'k.kar_bagian',
    Jabatan: 'j.jab_nama',
    Pabrik: 'k.kar_pab_kode',
    Status_Lama: '(SELECT x.sk_keterangan FROM tstatuskaryawan x WHERE x.sk_id = a.ps_kar_status_karyawan)',
    Status_Baru: '(SELECT x.sk_keterangan FROM tstatuskaryawan x WHERE x.sk_id = a.ps_kar_status_karyawan2)',
    stat: 'a.ps_kar_status_karyawan2',
}

const FROM_SQL = `FROM tperubahanstatus a
    INNER JOIN tkaryawan k ON k.kar_Nik = a.ps_kar_nik
    INNER JOIN tjabatan j ON j.jab_kode = k.kar_jab_kode
    INNER JOIN tpabrik p ON p.pab_kode = k.kar_pab_kode`

const SELECT_SQL = `SELECT ${Object.entries(LIST_COLUMNS)
    .map(([alias, expr]) => `${expr} AS \`${alias}\``)
    .join(', ')} ${FROM_SQL}`

function prefixBulan(tanggal) {
    const d = new Date(String(tanggal).slice(0, 10))
    return `PST.${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}.`
}

/** Nomor berikutnya (ufrmPerubahanStatus.getmaxnomor). */
export async function nomorBerikut(tanggal) {
    const prefix = prefixBulan(tanggal)
    const [rows] = await pool.query(
        'SELECT MAX(RIGHT(ps_nomor, 4)) AS m FROM tperubahanstatus WHERE ps_nomor LIKE ?',
        [`${prefix}%`]
    )
    const m = rows[0]?.m ? parseInt(rows[0].m, 10) : 0
    return `${prefix}${String(10000 + m + 1).slice(-4)}`
}

/** Daftar perubahan status per periode (default bulan berjalan). */
export const getPerubahanStatusList = async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1)
        const perPage = Math.min(500, parseInt(req.query.per_page) || 25)
        const offset = (page - 1) * perPage
        const start = req.query.start_date || `${new Date().toISOString().slice(0, 7)}-01`
        const end = req.query.end_date || new Date().toISOString().slice(0, 10)

        let where = ' WHERE a.ps_tanggal BETWEEN ? AND ?'
        let params = [start, end]
        if (req.query.search) {
            where += ' AND (a.ps_nomor LIKE ? OR a.ps_kar_nik LIKE ? OR k.kar_nama LIKE ? OR k.kar_bagian LIKE ?)'
            params = [...params, ...Array(4).fill(`%${req.query.search}%`)]
        }
        if (req.query.pabrik) {
            where += ' AND k.kar_pab_kode = ?'
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
        const orderBy = buildOrderBy(req.query, LIST_COLUMNS, 'ORDER BY a.ps_tanggal DESC, a.ps_nomor DESC')

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

/** Satu dokumen (ufrmPerubahanStatus.loaddataall) + status master terkini. */
export const getPerubahanStatus = async (req, res, next) => {
    try {
        const nomor = String(req.query.nomor || req.params.nomor || '')
        if (!nomor) return error(res, 'Nomor wajib diisi', 400)
        const [rows] = await pool.query(
            `SELECT a.ps_nomor, a.ps_tanggal, a.ps_kar_nik, k.kar_nama, k.kar_pab_kode,
                    k.kar_bagian, k.kar_jab_kode, j.jab_nama,
                    a.ps_kar_status_karyawan AS status_lama,
                    a.ps_kar_status_karyawan2 AS status_baru,
                    a.ps_tgl_awal, a.ps_tgl_akhir,
                    k.kar_status_kerja AS status_master_saat_ini,
                    k.kar_tglpkwt1 AS pkwt1_master, k.kar_tglpkwt2 AS pkwt2_master
             FROM tperubahanstatus a
             INNER JOIN tkaryawan k ON k.kar_Nik = a.ps_kar_nik
             INNER JOIN tjabatan j ON j.jab_kode = k.kar_jab_kode
             WHERE a.ps_nomor = ?`,
            [nomor]
        )
        if (rows.length === 0) return error(res, 'Nomor tidak ditemukan', 404)
        const r = rows[0]
        success(res, {
            nomor: r.ps_nomor,
            tanggal: String(r.ps_tanggal).slice(0, 10),
            nik: r.ps_kar_nik,
            nama: r.kar_nama,
            pabrik: r.kar_pab_kode,
            bagian: r.kar_bagian,
            jab_kode: r.kar_jab_kode,
            jabatan: r.jab_nama,
            status_lama: r.status_lama,
            status_baru: r.status_baru,
            tgl_awal: r.ps_tgl_awal ? String(r.ps_tgl_awal).slice(0, 10) : null,
            tgl_akhir: r.ps_tgl_akhir ? String(r.ps_tgl_akhir).slice(0, 10) : null,
            status_master_saat_ini: r.status_master_saat_ini,
        })
    } catch (err) {
        next(err)
    }
}

/** Lookup karyawan (ufrmPerubahanStatus.edtNikClickBtn). */
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

/** Data karyawan + status kerja master (ufrmPerubahanStatus.loaddata). */
export const infoKaryawan = async (req, res, next) => {
    try {
        const nik = String(req.query.nik || '')
        if (!nik) return error(res, 'NIK wajib diisi', 400)
        const [rows] = await pool.query(
            `SELECT k.kar_Nik AS nik, k.kar_nama AS nama, k.kar_pab_kode AS pabrik,
                    k.kar_jab_kode AS jab_kode, j.jab_nama AS jabatan, k.kar_bagian AS bagian,
                    k.kar_status_kerja AS status_kerja, s.sk_keterangan AS status_nama,
                    k.kar_tglpkwt1 AS pkwt1, k.kar_tglpkwt2 AS pkwt2
             FROM tkaryawan k
             LEFT JOIN tjabatan j ON j.jab_kode = k.kar_jab_kode
             LEFT JOIN tstatuskaryawan s ON s.sk_id = k.kar_status_kerja
             WHERE k.kar_Nik = ?`,
            [nik]
        )
        if (rows.length === 0) return error(res, `NIK ${nik} tidak ditemukan`, 404)
        const r = rows[0]
        success(res, {
            ...r,
            pkwt1: r.pkwt1 ? String(r.pkwt1).slice(0, 10) : null,
            pkwt2: r.pkwt2 ? String(r.pkwt2).slice(0, 10) : null,
        })
    } catch (err) {
        next(err)
    }
}

/** Daftar status kerja (tstatuskaryawan) untuk dropdown status lama/baru. */
export const getStatusKerja = async (req, res, next) => {
    try {
        const [rows] = await pool.query(
            'SELECT sk_id AS Kode, sk_keterangan AS Nama FROM tstatuskaryawan ORDER BY sk_id'
        )
        success(res, rows)
    } catch (err) {
        next(err)
    }
}

/**
 * Simpan (ufrmPerubahanStatus.simpandata).
 * Body: { nomor?, tanggal, nik, status_lama, status_baru, tgl_awal, tgl_akhir }
 */
export const savePerubahanStatus = async (req, res, next) => {
    try {
        const b = req.body || {}
        const tanggal = String(b.tanggal || '').slice(0, 10)
        const nik = String(b.nik || '').trim()
        const statusLama = parseInt(b.status_lama, 10)
        const statusBaru = parseInt(b.status_baru, 10)
        const tglAwal = String(b.tgl_awal || '').slice(0, 10)
        const tglAkhir = String(b.tgl_akhir || '').slice(0, 10)

        if (!tanggal) return error(res, 'Tanggal wajib diisi', 400)
        if (!nik) return error(res, 'NIK wajib diisi', 400)
        if (!Number.isInteger(statusLama)) return error(res, 'Status lama wajib dipilih', 400)
        if (!Number.isInteger(statusBaru)) return error(res, 'Status baru wajib dipilih', 400)
        if (!tglAwal || !tglAkhir) return error(res, 'Periode PKWT (awal & akhir) wajib diisi', 400)
        if (tglAkhir < tglAwal) return error(res, 'Tanggal akhir PKWT harus >= tanggal awal', 400)

        const [krows] = await pool.query('SELECT kar_nama FROM tkaryawan WHERE kar_Nik = ?', [nik])
        if (krows.length === 0) return error(res, `NIK ${nik} tidak ada pada master karyawan`, 400)
        for (const [val, label] of [
            [statusLama, 'Status lama'],
            [statusBaru, 'Status baru'],
        ]) {
            const [s] = await pool.query('SELECT sk_id FROM tstatuskaryawan WHERE sk_id = ? LIMIT 1', [val])
            if (s.length === 0) return error(res, `${label} tidak dikenal`, 400)
        }

        const nomorEdit = String(b.nomor || '').trim()
        if (nomorEdit) {
            const [ada] = await pool.query('SELECT ps_nomor FROM tperubahanstatus WHERE ps_nomor = ?', [nomorEdit])
            if (ada.length === 0) return error(res, 'Nomor tidak ditemukan', 404)
            await pool.query(
                `UPDATE tperubahanstatus SET ps_tanggal = ?, ps_kar_nik = ?, ps_kar_status_karyawan = ?,
                    ps_kar_status_karyawan2 = ?, ps_tgl_awal = ?, ps_tgl_akhir = ? WHERE ps_nomor = ?`,
                [tanggal, nik, statusLama, statusBaru, tglAwal, tglAkhir, nomorEdit]
            )
            return success(res, { nomor: nomorEdit }, `Berhasil simpan dengan nomor ${nomorEdit}`)
        }

        const nomor = await nomorBerikut(tanggal)
        await pool.query(
            `INSERT INTO tperubahanstatus (ps_nomor, ps_tanggal, ps_kar_nik, ps_kar_status_karyawan,
                ps_kar_status_karyawan2, ps_tgl_awal, ps_tgl_akhir)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [nomor, tanggal, nik, statusLama, statusBaru, tglAwal, tglAkhir]
        )
        success(res, { nomor }, `Berhasil simpan dengan nomor ${nomor}`)
    } catch (err) {
        next(err)
    }
}

/** Hapus satu dokumen (ufrmBrowsePerubahanStatus.cxButton4Click). */
export const deletePerubahanStatus = async (req, res, next) => {
    try {
        const nomor = String(req.params.nomor || req.query.nomor || '')
        if (!nomor) return error(res, 'Nomor wajib diisi', 400)
        const [r] = await pool.query('DELETE FROM tperubahanstatus WHERE ps_nomor = ?', [nomor])
        if (r.affectedRows === 0) return error(res, 'Nomor tidak ditemukan', 404)
        success(res, null, 'Data berhasil dihapus')
    } catch (err) {
        next(err)
    }
}

/**
 * Data surat PKWT (ufrmBrowsePerubahanStatus.cxButton3Click -> report PKWT1/2/3).
 * `template` mengikuti aturan Delphi: status baru 2 -> PKWT1, 3 -> PKWT2,
 * selain itu PKWT3. Frontend merender/mencetaknya.
 */
export const getSurat = async (req, res, next) => {
    try {
        const nomor = String(req.params.nomor || req.query.nomor || '')
        if (!nomor) return error(res, 'Nomor wajib diisi', 400)
        const [rows] = await pool.query(
            `SELECT a.ps_nomor AS Nomor, a.ps_tanggal AS Tanggal, a.ps_kar_nik AS Nik,
                    b.kar_nama AS Nama, b.kar_bagian AS Bagian, j.jab_nama AS Jabatan,
                    b.kar_pab_kode AS Pabrik, b.kar_tgllahir, b.kar_tempatlahir,
                    TIMESTAMPDIFF(YEAR, b.kar_tgllahir, a.ps_tanggal) AS umur,
                    IF(b.kar_jenkel = 1, 'Laki-Laki', 'Perempuan') AS Jenis_Kelamin,
                    b.kar_alamat, b.kar_notelp,
                    (SELECT x.dep_nama FROM tdepartemen x WHERE x.dep_kode = b.kar_dep_kode) AS departemen,
                    a.ps_kar_status_karyawan2 AS Status_Baru, a.ps_tgl_awal, a.ps_tgl_akhir
             FROM tperubahanstatus a
             INNER JOIN tkaryawan b ON b.kar_Nik = a.ps_kar_nik
             INNER JOIN tjabatan j ON j.jab_kode = b.kar_jab_kode
             INNER JOIN tpabrik p ON p.pab_kode = b.kar_pab_kode
             WHERE a.ps_nomor = ?`,
            [nomor]
        )
        if (rows.length === 0) return error(res, 'Nomor tidak ditemukan', 404)
        const r = rows[0]
        const template = String(r.Status_Baru) === '2' ? 'PKWT1' : String(r.Status_Baru) === '3' ? 'PKWT2' : 'PKWT3'
        success(res, { template, ...r })
    } catch (err) {
        next(err)
    }
}
