import pool from '../../config/database.js'
import { applyKaryawanLookup } from '../../helpers/karyawanLookup.js'
import { success, error, paginated } from '../../helpers/response.js'
import { buildOrderBy, applyAllColumnFilters } from '../../helpers/browse.js'
import { sendExcel } from '../../helpers/excel.js'

/**
 * Modul Penilaian 3 Bulan — cerminan unit Delphi:
 *   ufrmBrowsePenilaian3Bulan -> daftar per periode (+ detail) + hapus
 *   ufrmPenilaian3Bulan       -> form header (tanggal/pabrik/periode/tahun)
 *                                + grid karyawan (nilai/kriteria/keterangan)
 *
 * Tabel: `tpenilaian3bulan` (pb_nomor PK `PB3.YYYYMM.NNNN`),
 *        `tpenilaian3bulan_dtl` (PK pb_nomor + nik), `tkaryawan`,
 *        `tdepartemen`, `tpabrik`.
 *
 * Aturan Delphi yang diduplikasi:
 * - Nomor: `PB3.` + yyyymm(tanggal) + `.` + urut 4 digit per bulan.
 * - Tombol muat (Button1Click/loaddata): isi grid dengan SEMUA karyawan
 *   aktif pabrik terpilih, urut bagian.
 * - Kriteria otomatis dari nilai (clNilaiPropertiesEditValueChanged):
 *   >= 46 A, >= 36 B, >= 26 C, >= 16 D, < 16 E — dihitung server saat
 *   simpan supaya tidak bisa dimanipulasi klien.
 * - Modul ini TANPA otorisasi tanggal: tanggal berapa pun bebas simpan.
 * - Simpan: upsert header, DELETE detail + INSERT ulang baris ber-NIK.
 *
 * PERBAIKAN dari Delphi:
 * - Hapus browse Delphi salah menghapus tabel LEMBUR (copy-paste bug);
 *   versi web menghapus `tpenilaian3bulan_dtl` + `tpenilaian3bulan`.
 * - Muat karyawan Delphi tertukar (kolom jabatan diisi bagian & sebaliknya);
 *   versi web memetakan jabatan/bagian/departemen dengan benar.
 */

/** Kriteria dari nilai — cerminan clNilaiPropertiesEditValueChanged. */
export function kriteriaDariNilai(nilai) {
    const v = parseFloat(nilai)
    if (isNaN(v)) return ''
    if (v >= 46) return 'A'
    if (v >= 36) return 'B'
    if (v >= 26) return 'C'
    if (v >= 16) return 'D'
    return 'E'
}

/** Kolom browse header — mengikuti `ufrmBrowsePenilaian3Bulan.btnRefreshClick`. */
const HDR_COLUMNS = {
    Nomor: 'h.pb_nomor',
    Tanggal: 'h.pb_tanggal',
    Pabrik: 'h.pb_pab_kode',
    Tahun: 'h.pb_tahun',
    Periode: 'h.pb_periode',
    Periode2: 'h.pb_periode2',
}

const HDR_FROM = `FROM tpenilaian3bulan h`

const HDR_SELECT = `SELECT ${Object.entries(HDR_COLUMNS)
    .map(([alias, expr]) => `${expr} AS \`${alias}\``)
    .join(', ')} ${HDR_FROM}`

function prefixBulan(tanggal) {
    const d = new Date(String(tanggal).slice(0, 10))
    return `PB3.${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}.`
}

/** Nomor berikutnya (getmaxnomor). */
export async function nomorBerikut(tanggal) {
    const prefix = prefixBulan(tanggal)
    const [rows] = await pool.query(
        'SELECT MAX(RIGHT(pb_nomor, 4)) AS m FROM tpenilaian3bulan WHERE pb_nomor LIKE ?',
        [`${prefix}%`]
    )
    const m = rows[0]?.m ? parseInt(rows[0].m, 10) : 0
    return `${prefix}${String(10000 + m + 1).slice(-4)}`
}

/** Daftar penilaian per periode (default bulan berjalan). */
export const getPenilaianList = async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1)
        const perPage = Math.min(500, parseInt(req.query.per_page) || 25)
        const offset = (page - 1) * perPage
        const start = req.query.start_date || `${new Date().toISOString().slice(0, 7)}-01`
        const end = req.query.end_date || new Date().toISOString().slice(0, 10)

        let where = ' WHERE h.pb_tanggal BETWEEN ? AND ?'
        let params = [start, end]
        if (req.query.search) {
            where += ' AND (h.pb_nomor LIKE ? OR h.pb_pab_kode LIKE ?)'
            params = [...params, `%${req.query.search}%`, `%${req.query.search}%`]
        }
        if (req.query.pabrik) {
            where += ' AND h.pb_pab_kode = ?'
            params.push(req.query.pabrik)
        }

        if (req.query.distinct && HDR_COLUMNS[req.query.distinct]) {
            const dcol = HDR_COLUMNS[req.query.distinct]
            const scoped = applyAllColumnFilters(where, params, req.query, HDR_COLUMNS, req.query.distinct)
            const dwhere = scoped.clause ? `${scoped.clause} AND` : 'WHERE'
            const [drows] = await pool.query(
                `SELECT DISTINCT ${dcol} AS value ${HDR_FROM} ${dwhere} ${dcol} IS NOT NULL AND ${dcol} <> '' ORDER BY value LIMIT 500`,
                scoped.params
            )
            return success(res, drows.map((r) => r.value))
        }

        const f = applyAllColumnFilters(where, params, req.query, HDR_COLUMNS)
        where = f.clause
        params = f.params
        const orderBy = buildOrderBy(req.query, HDR_COLUMNS, 'ORDER BY h.pb_tanggal DESC, h.pb_nomor DESC')

        if (req.query.export === 'xlsx') {
            const [all] = await pool.query(`${HDR_SELECT}${where} ${orderBy} LIMIT 50000`, params)
            return sendExcel(res, 'Penilaian-3-Bulan', Object.keys(HDR_COLUMNS), all)
        }

        const [cnt] = await pool.query(`SELECT COUNT(*) AS total ${HDR_FROM}${where}`, params)
        const total = cnt[0].total
        const [rows] = await pool.query(`${HDR_SELECT}${where} ${orderBy} LIMIT ? OFFSET ?`, [
            ...params,
            perPage,
            offset,
        ])
        paginated(res, rows, { page, per_page: perPage, total, last_page: Math.ceil(total / perPage) })
    } catch (err) {
        next(err)
    }
}

/** Detail satu nomor (grid Delphi) — dipakai form edit & browse detail. */
export const getPenilaianDetail = async (req, res, next) => {
    try {
        const nomor = String(req.query.nomor || req.params.nomor || '')
        if (nomor) {
            const [rows] = await pool.query(
                `SELECT d.pbd_pb_nomor AS \`Nomor\`, d.pbd_nik AS \`Nik\`, k.kar_nama AS \`Nama\`,
                        dep.dep_nama AS \`Departemen\`, d.pbd_jab_kode AS \`Jabatan\`,
                        k.kar_bagian AS \`Bagian\`, d.pbd_nilai AS \`Nilai\`,
                        d.pbd_kriteria AS \`Kriteria\`, d.pbd_keterangan AS \`Keterangan\`
                 FROM tpenilaian3bulan_dtl d
                 LEFT JOIN tkaryawan k ON k.kar_Nik = d.pbd_nik
                 LEFT JOIN tdepartemen dep ON dep.dep_kode = k.kar_dep_kode
                 WHERE d.pbd_pb_nomor = ? ORDER BY k.kar_bagian, d.pbd_nik`,
                [nomor]
            )
            return success(res, rows)
        }
        // Tanpa nomor: mode browse detail per periode (SQLDetail Delphi).
        const start = req.query.start_date || `${new Date().toISOString().slice(0, 7)}-01`
        const end = req.query.end_date || new Date().toISOString().slice(0, 10)
        const page = Math.max(1, parseInt(req.query.page) || 1)
        const perPage = Math.min(500, parseInt(req.query.per_page) || 25)
        const [cnt] = await pool.query(
            `SELECT COUNT(*) AS total FROM tpenilaian3bulan_dtl d
             INNER JOIN tpenilaian3bulan h ON h.pb_nomor = d.pbd_pb_nomor
             WHERE h.pb_tanggal BETWEEN ? AND ?`,
            [start, end]
        )
        const [rows] = await pool.query(
            `SELECT d.pbd_pb_nomor AS \`Nomor\`, d.pbd_nik AS \`Nik\`, k.kar_nama AS \`Nama\`,
                    dep.dep_nama AS \`Departemen\`, d.pbd_jab_kode AS \`Jabatan\`,
                    k.kar_bagian AS \`Bagian\`, d.pbd_nilai AS \`Nilai\`,
                    d.pbd_kriteria AS \`Kriteria\`, d.pbd_keterangan AS \`Keterangan\`
             FROM tpenilaian3bulan_dtl d
             INNER JOIN tpenilaian3bulan h ON h.pb_nomor = d.pbd_pb_nomor
             LEFT JOIN tkaryawan k ON k.kar_Nik = d.pbd_nik
             LEFT JOIN tdepartemen dep ON dep.dep_kode = k.kar_dep_kode
             WHERE h.pb_tanggal BETWEEN ? AND ? ORDER BY d.pbd_pb_nomor LIMIT ? OFFSET ?`,
            [start, end, perPage, (page - 1) * perPage]
        )
        paginated(res, rows, {
            page,
            per_page: perPage,
            total: cnt[0].total,
            last_page: Math.ceil(cnt[0].total / perPage),
        })
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

/** Satu dokumen + seluruh baris detail (loaddataall). */
export const getPenilaian = async (req, res, next) => {
    try {
        const nomor = String(req.query.nomor || req.params.nomor || '')
        if (!nomor) return error(res, 'Nomor wajib diisi', 400)
        const [hrows] = await pool.query(
            `SELECT h.*, p.pab_nama FROM tpenilaian3bulan h LEFT JOIN tpabrik p ON p.pab_kode = h.pb_pab_kode
             WHERE h.pb_nomor = ?`,
            [nomor]
        )
        if (hrows.length === 0) return error(res, 'Nomor tidak ditemukan', 404)
        const h = hrows[0]
        const [drows] = await pool.query(
            `SELECT d.pbd_nik AS nik, k.kar_nama AS nama, d.pbd_jab_kode AS jabatan,
                    dep.dep_nama AS departemen, k.kar_bagian AS bagian,
                    d.pbd_nilai AS nilai, d.pbd_kriteria AS kriteria, d.pbd_keterangan AS keterangan
             FROM tpenilaian3bulan_dtl d
             LEFT JOIN tkaryawan k ON k.kar_Nik = d.pbd_nik
             LEFT JOIN tdepartemen dep ON dep.dep_kode = k.kar_dep_kode
             WHERE d.pbd_pb_nomor = ? ORDER BY k.kar_bagian, d.pbd_nik`,
            [nomor]
        )
        success(res, {
            nomor: h.pb_nomor,
            tanggal: String(h.pb_tanggal).slice(0, 10),
            pabrik: h.pb_pab_kode,
            pabrik_nama: h.pab_nama,
            tahun: h.pb_tahun,
            periode: h.pb_periode,
            periode2: h.pb_periode2,
            detail: drows,
        })
    } catch (err) {
        next(err)
    }
}

/**
 * Muat SEMUA karyawan aktif satu pabrik ke grid (Button1Click/loaddata),
 * urut bagian — dengan pemetaan kolom yang benar.
 */
export const muatKaryawan = async (req, res, next) => {
    try {
        const pabrik = String(req.query.pabrik || '').trim()
        if (!pabrik) return error(res, 'Pabrik wajib dipilih', 400)
        const [rows] = await pool.query(
            `SELECT k.kar_Nik AS nik, k.kar_nama AS nama, j.jab_nama AS jabatan,
                    dep.dep_nama AS departemen, k.kar_bagian AS bagian
             FROM tkaryawan k
             LEFT JOIN tjabatan j ON j.jab_kode = k.kar_jab_kode
             LEFT JOIN tdepartemen dep ON dep.dep_kode = k.kar_dep_kode
             WHERE k.kar_status_aktif = 1 AND k.kar_pab_kode = ?
             ORDER BY k.kar_bagian, k.kar_nama LIMIT 2000`,
            [pabrik]
        )
        success(res, rows)
    } catch (err) {
        next(err)
    }
}

/** Lookup satu karyawan untuk kolom grid (bantuankaryawan). */
export const lookupKaryawan = async (req, res, next) => {
    try {
        const q = String(req.query.search || '').trim()
        const pabrik = String(req.query.pabrik || '').trim()
        const perPage = Math.min(200, parseInt(req.query.per_page) || 20)
        const page = Math.max(1, parseInt(req.query.page) || 1)
        let where = ' WHERE k.kar_status_aktif = 1'
        const params = []
        if (q) {
            where += ' AND (k.kar_Nik LIKE ? OR k.kar_nama LIKE ? OR j.jab_nama LIKE ? OR k.kar_bagian LIKE ? OR k.kar_pab_kode LIKE ?)'
            params.push(...Array(5).fill(`%${q}%`))
        }
        if (pabrik) {
            where += ' AND k.kar_pab_kode LIKE ?'
            params.push(`%${pabrik}%`)
        }
        const lookup = applyKaryawanLookup(req.query, where, params)
        const [rows] = await pool.query(
            `SELECT k.kar_Nik AS Nik, k.kar_nama AS Nama, k.kar_pab_kode AS Pabrik,
                    j.jab_nama AS Jabatan, k.kar_bagian AS Bagian,
                    IF(k.kar_status_aktif = 1, 'Aktif', 'Non Aktif') AS Status
             FROM tkaryawan k LEFT JOIN tjabatan j ON j.jab_kode = k.kar_jab_kode
             ${lookup.where} ${lookup.orderBy} LIMIT ? OFFSET ?`,
            [...params, perPage, (page - 1) * perPage]
        )
        const [cnt] = await pool.query(`SELECT COUNT(*) AS c FROM tkaryawan k LEFT JOIN tjabatan j ON j.jab_kode = k.kar_jab_kode ${lookup.where}`, params)
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

/**
 * Simpan (simpandata). Body: { nomor?, tanggal, pabrik, tahun, periode,
 *   periode2, detail: [{ nik, jabatan?, bagian?, nilai, keterangan? }] }
 * Kriteria selalu dihitung ulang dari nilai di server.
 */
export const savePenilaian = async (req, res, next) => {
    try {
        const b = req.body || {}
        const tanggal = String(b.tanggal || '').slice(0, 10)
        const pabrik = String(b.pabrik || '').trim()
        const tahun = parseInt(b.tahun, 10)
        const periode = parseInt(b.periode, 10)
        const periode2 = parseInt(b.periode2, 10)
        const rawDetail = Array.isArray(b.detail) ? b.detail : []

        if (!tanggal) return error(res, 'Tanggal wajib diisi', 400)
        if (!pabrik) return error(res, 'Pabrik wajib dipilih', 400)
        if (!Number.isInteger(tahun) || tahun < 2000 || tahun > 2100) return error(res, 'Tahun tidak valid', 400)
        for (const [v, label] of [
            [periode, 'Periode awal'],
            [periode2, 'Periode akhir'],
        ]) {
            if (!Number.isInteger(v) || v < 1 || v > 12) return error(res, `${label} harus 1-12`, 400)
        }
        if (periode2 < periode) return error(res, 'Periode akhir harus >= periode awal', 400)

        const [prows] = await pool.query('SELECT pab_kode FROM tpabrik WHERE pab_kode = ? LIMIT 1', [pabrik])
        if (prows.length === 0) return error(res, `Pabrik ${pabrik} tidak dikenal`, 400)

        const lihat = new Set()
        const detail = []
        for (const r of rawDetail) {
            const nik = String(r?.nik || '').trim()
            if (!nik) continue
            if (lihat.has(nik)) return error(res, `Karyawan ${nik} dimasukkan dua kali`, 400)
            lihat.add(nik)
            const nilai = parseFloat(r?.nilai ?? '')
            if (isNaN(nilai)) return error(res, `Nilai ${nik} wajib diisi angka`, 400)
            detail.push({
                nik,
                jabatan: String(r?.jabatan || ''),
                bagian: String(r?.bagian || ''),
                nilai,
                kriteria: kriteriaDariNilai(nilai),
                keterangan: String(r?.keterangan || ''),
            })
        }
        if (detail.length === 0) return error(res, 'Minimal satu karyawan harus dinilai', 400)

        for (const d of detail) {
            const [k] = await pool.query(
                'SELECT kar_Nik, kar_bagian, kar_jab_kode FROM tkaryawan WHERE kar_Nik = ? LIMIT 1',
                [d.nik]
            )
            if (k.length === 0) return error(res, `NIK ${d.nik} tidak ada pada master karyawan`, 400)
            if (!d.bagian) d.bagian = k[0].kar_bagian || ''
            // pbd_jab_kode menyimpan TEKS nama jabatan (kompatibel Delphi).
            if (!d.jabatan) {
                const [j] = await pool.query('SELECT jab_nama FROM tjabatan WHERE jab_kode = ? LIMIT 1', [
                    k[0].kar_jab_kode,
                ])
                d.jabatan = j[0]?.jab_nama || k[0].kar_jab_kode || ''
            }
        }

        const nomorEdit = String(b.nomor || '').trim()
        let nomor = nomorEdit
        if (nomorEdit) {
            const [ada] = await pool.query('SELECT pb_nomor FROM tpenilaian3bulan WHERE pb_nomor = ?', [nomorEdit])
            if (ada.length === 0) return error(res, 'Nomor tidak ditemukan', 404)
            await pool.query(
                `UPDATE tpenilaian3bulan SET pb_tanggal = ?, pb_pab_kode = ?, pb_tahun = ?,
                    pb_periode = ?, pb_periode2 = ? WHERE pb_nomor = ?`,
                [tanggal, pabrik, tahun, periode, periode2, nomorEdit]
            )
        } else {
            nomor = await nomorBerikut(tanggal)
            await pool.query(
                `INSERT INTO tpenilaian3bulan (pb_nomor, pb_tanggal, pb_pab_kode, pb_tahun, pb_periode, pb_periode2)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [nomor, tanggal, pabrik, tahun, periode, periode2]
            )
        }

        const conn = await pool.getConnection()
        try {
            await conn.beginTransaction()
            await conn.query('DELETE FROM tpenilaian3bulan_dtl WHERE pbd_pb_nomor = ?', [nomorEdit || nomor])
            for (const d of detail) {
                await conn.query(
                    `INSERT INTO tpenilaian3bulan_dtl (pbd_pb_nomor, pbd_nik, pbd_bagian, pbd_jab_kode, pbd_nilai, pbd_kriteria, pbd_keterangan)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [nomor, d.nik, d.bagian, d.jabatan, d.nilai, d.kriteria, d.keterangan]
                )
            }
            await conn.commit()
        } catch (e) {
            try {
                await conn.rollback()
            } catch {
                /* abaikan */
            }
            throw e
        } finally {
            conn.release()
        }

        success(res, { nomor, jumlah: detail.length }, `Berhasil simpan dengan nomor ${nomor}`)
    } catch (err) {
        next(err)
    }
}

/** Hapus header + detail (perbaikan bug hapus Delphi). */
export const deletePenilaian = async (req, res, next) => {
    try {
        const nomor = String(req.params.nomor || req.query.nomor || '')
        if (!nomor) return error(res, 'Nomor wajib diisi', 400)
        await pool.query('DELETE FROM tpenilaian3bulan_dtl WHERE pbd_pb_nomor = ?', [nomor])
        const [r] = await pool.query('DELETE FROM tpenilaian3bulan WHERE pb_nomor = ?', [nomor])
        if (r.affectedRows === 0) return error(res, 'Nomor tidak ditemukan', 404)
        success(res, null, 'Data berhasil dihapus')
    } catch (err) {
        next(err)
    }
}
