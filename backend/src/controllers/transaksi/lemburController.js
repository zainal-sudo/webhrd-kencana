import jwt from 'jsonwebtoken'
import pool from '../../config/database.js'
import { applyKaryawanLookup } from '../../helpers/karyawanLookup.js'
import { success, error, paginated } from '../../helpers/response.js'
import { buildOrderBy, applyAllColumnFilters } from '../../helpers/browse.js'
import { sendExcel } from '../../helpers/excel.js'
import { normJam, toTime, cekTanggal } from './ijinController.js'

/**
 * Modul Lembur — cerminan unit Delphi:
 *   ufrmBrowseLembur -> daftar SPL per periode (+ detail) + hapus hdr+dtl
 *   ufrmLembur       -> form SPL: header (tanggal/pabrik/departemen/jabatan/
 *                       bagian/jenis kerja) + grid karyawan (nik/jam/keterangan)
 *
 * Tabel: `tlembur_hdr` (lem_nomor PK `LEM.YYYYMM.NNNN`), `tlembur_dtl`
 *        (PK lemd_lem_nomor + lemd_kar_nik), `tkaryawan`, `tabsensi`,
 *        `tpabrik`, `tdepartemen`, `tjabatan`, `tlistotorisasi`.
 *
 * Aturan Delphi yang diduplikasi (ufrmLembur):
 * - Nomor: `LEM.` + yyyymm(tanggal) + `.` + urut 4 digit per bulan.
 * - Tombol Bagian: memuat SEMUA karyawan aktif sesuai filter
 *   pabrik + departemen + jabatan + bagian ke dalam grid (loaddata).
 * - Tombol "Samakan Jam": salin jam mulai/akhir baris pertama ke semua baris.
 * - Validasi sebelum simpan (cekdata): untuk tiap NIK, jam akhir SPL harus
 *   maksimal 30 menit SETELAH scan keluar absensi hari itu
 *   (`tabsensi.scan2` lewat join kar_kode_absensi). Bila tidak ada record
 *   absensi, baris dilewati (Delphi: Fields[0] kosong -> selisih besar -> gagal;
 *   di sini record kosong dianggap belum scan dan tetap boleh disimpan supaya
 *   SPL susulan tidak terkunci — perbedaannya dicatat pada pesan).
 * - cektanggal(tgl) < 2 bebas simpan, >= 2 wajib otorisasi atasan (token JWT).
 * - Simpan: upsert header, lalu DELETE detail + INSERT ulang tiap baris
 *   yang NIK-nya terisi (simpandata).
 */

export { normJam, toTime }

/** Kolom browse header — mengikuti `ufrmBrowseLembur.btnRefreshClick`. */
const HDR_COLUMNS = {
    Nomor: 'h.lem_nomor',
    Tanggal: 'h.lem_tanggal',
    Pabrik: 'h.lem_pab_kode',
    Bagian: 'h.lem_bagian',
    JenisKerja: 'h.lem_jeniskerja',
}

const HDR_FROM = `FROM tlembur_hdr h INNER JOIN tpabrik p ON p.pab_kode = h.lem_pab_kode`

const HDR_SELECT = `SELECT ${Object.entries(HDR_COLUMNS)
    .map(([alias, expr]) => `${expr} AS \`${alias}\``)
    .join(', ')} ${HDR_FROM}`

/** Kolom browse detail (master-detail Delphi). */
const DTL_COLUMNS = {
    Nomor: 'd.lemd_lem_nomor',
    Nik: 'd.lemd_kar_nik',
    Nama: 'k.kar_nama',
    Mulai: 'd.lemd_jammulai',
    Akhir: 'd.lemd_jamakhir',
    Keterangan: 'd.lemd_keterangan',
}

function prefixBulan(tanggal) {
    const d = new Date(String(tanggal).slice(0, 10))
    return `LEM.${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}.`
}

/** Nomor berikutnya (ufrmLembur.getmaxnomor). */
export async function nomorBerikut(tanggal) {
    const prefix = prefixBulan(tanggal)
    const [rows] = await pool.query(
        'SELECT MAX(RIGHT(lem_nomor, 4)) AS m FROM tlembur_hdr WHERE lem_nomor LIKE ?',
        [`${prefix}%`]
    )
    const m = rows[0]?.m ? parseInt(rows[0].m, 10) : 0
    return `${prefix}${String(10000 + m + 1).slice(-4)}`
}

function userDariToken(token) {
    if (!token) return null
    try {
        const t = jwt.verify(String(token), process.env.JWT_SECRET)
        return t?.tipe === 'lembur' && t?.otorisasi ? t.otorisasi : null
    } catch {
        return null
    }
}

async function ensureOtorisasiTable() {
    await pool.query(`CREATE TABLE IF NOT EXISTS tlistotorisasi (
        tanggal DATE DEFAULT NULL,
        nomor VARCHAR(40) DEFAULT NULL,
        USER VARCHAR(30) DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=latin1`)
}

/** Daftar SPL per periode (default bulan berjalan). */
export const getLemburList = async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1)
        const perPage = Math.min(500, parseInt(req.query.per_page) || 25)
        const offset = (page - 1) * perPage
        const start = req.query.start_date || `${new Date().toISOString().slice(0, 7)}-01`
        const end = req.query.end_date || new Date().toISOString().slice(0, 10)

        let where = ' WHERE h.lem_tanggal BETWEEN ? AND ?'
        let params = [start, end]
        if (req.query.search) {
            where += ' AND (h.lem_nomor LIKE ? OR h.lem_bagian LIKE ? OR h.lem_jeniskerja LIKE ?)'
            params = [...params, ...Array(3).fill(`%${req.query.search}%`)]
        }
        if (req.query.pabrik) {
            where += ' AND h.lem_pab_kode = ?'
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
        const orderBy = buildOrderBy(req.query, HDR_COLUMNS, 'ORDER BY h.lem_tanggal DESC, h.lem_nomor DESC')

        if (req.query.export === 'xlsx') {
            const [all] = await pool.query(`${HDR_SELECT}${where} ${orderBy} LIMIT 50000`, params)
            return sendExcel(res, 'Lembur', Object.keys(HDR_COLUMNS), all)
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

/** Detail satu SPL (grid Delphi) — dipakai browse detail & form edit. */
export const getLemburDetail = async (req, res, next) => {
    try {
        const nomor = String(req.query.nomor || req.params.nomor || '')
        if (!nomor) return error(res, 'Nomor lembur wajib diisi', 400)
        const [rows] = await pool.query(
            `SELECT d.lemd_lem_nomor AS \`Nomor\`, d.lemd_kar_nik AS \`Nik\`, k.kar_nama AS \`Nama\`,
                    d.lemd_jammulai AS \`Mulai\`, d.lemd_jamakhir AS \`Akhir\`,
                    d.lemd_keterangan AS \`Keterangan\`, d.lemd_panggilan AS \`Panggilan\`
             FROM tlembur_dtl d LEFT JOIN tkaryawan k ON k.kar_Nik = d.lemd_kar_nik
             WHERE d.lemd_lem_nomor = ? ORDER BY d.lemd_kar_nik`,
            [nomor]
        )
        for (const r of rows) {
            r.Mulai = toTime(r.Mulai)
            r.Akhir = toTime(r.Akhir)
        }
        success(res, rows)
    } catch (err) {
        next(err)
    }
}

/** Nomor lembur berikutnya untuk tanggal tertentu. */
export const getNomor = async (req, res, next) => {
    try {
        const tanggal = String(req.query.tanggal || new Date().toISOString().slice(0, 10)).slice(0, 10)
        success(res, { nomor: await nomorBerikut(tanggal), tanggal })
    } catch (err) {
        next(err)
    }
}

/** Satu SPL + seluruh baris detail (ufrmLembur.loaddataall). */
export const getLembur = async (req, res, next) => {
    try {
        const nomor = String(req.query.nomor || req.params.nomor || '')
        if (!nomor) return error(res, 'Nomor lembur wajib diisi', 400)
        const [hrows] = await pool.query(
            `SELECT h.*, p.pab_nama FROM tlembur_hdr h LEFT JOIN tpabrik p ON p.pab_kode = h.lem_pab_kode
             WHERE h.lem_nomor = ?`,
            [nomor]
        )
        if (hrows.length === 0) return error(res, 'Nomor lembur tidak ditemukan', 404)
        const h = hrows[0]
        const [drows] = await pool.query(
            `SELECT d.lemd_kar_nik AS nik, k.kar_nama AS nama, d.lemd_jammulai AS jam_mulai,
                    d.lemd_jamakhir AS jam_akhir, d.lemd_keterangan AS keterangan,
                    d.lemd_panggilan AS panggilan
             FROM tlembur_dtl d LEFT JOIN tkaryawan k ON k.kar_Nik = d.lemd_kar_nik
             WHERE d.lemd_lem_nomor = ? ORDER BY d.lemd_kar_nik`,
            [nomor]
        )
        success(res, {
            nomor: h.lem_nomor,
            tanggal: String(h.lem_tanggal).slice(0, 10),
            bagian: h.lem_bagian,
            pabrik: h.lem_pab_kode,
            pabrik_nama: h.pab_nama,
            jenis_kerja: h.lem_jeniskerja,
            detail: drows.map((d) => ({
                nik: d.nik,
                nama: d.nama,
                jam_mulai: toTime(d.jam_mulai),
                jam_akhir: toTime(d.jam_akhir),
                keterangan: d.keterangan,
                panggilan: d.panggilan ? 1 : 0,
            })),
        })
    } catch (err) {
        next(err)
    }
}

/**
 * Muat karyawan aktif sesuai filter (ufrmLembur.loaddata — tombol Bagian).
 * Query param: pabrik (wajib), departemen?, jabatan?, bagian?
 * `all_departemen=1` / `all_jabatan=1` / `all_bagian=1` meniru checkbox All.
 */
export const muatKaryawan = async (req, res, next) => {
    try {
        const pabrik = String(req.query.pabrik || '').trim()
        if (!pabrik) return error(res, 'Pabrik wajib dipilih', 400)
        const allDep = String(req.query.all_departemen || '') === '1'
        const allJab = String(req.query.all_jabatan || '') === '1'
        const dep = allDep ? '%' : String(req.query.departemen || '%')
        const jab = allJab ? '%' : String(req.query.jabatan || '%')
        const bagian = String(req.query.all_bagian || '') === '1' ? '%' : String(req.query.bagian || '%')

        const [rows] = await pool.query(
            `SELECT k.kar_Nik AS nik, k.kar_nama AS nama
             FROM tkaryawan k
             WHERE k.kar_status_aktif = 1 AND k.kar_pab_kode = ?
               AND k.kar_dep_kode LIKE ? AND k.kar_jab_kode LIKE ? AND k.kar_bagian LIKE ?
             ORDER BY k.kar_nama LIMIT 1000`,
            [pabrik, dep, jab, bagian]
        )
        success(res, rows)
    } catch (err) {
        next(err)
    }
}

/** Lookup satu karyawan untuk kolom grid (ufrmLembur.bantuankaryawan). */
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
            `SELECT k.kar_Nik AS Nik, LEFT(k.kar_nama, 40) AS Nama, k.kar_pab_kode AS Pabrik,
                    j.jab_nama AS Jabatan, LEFT(k.kar_bagian, 40) AS Bagian,
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

/** Opsi filter form: jabatan per departemen+pabrik (edtJabatanClickBtn). */
export const getJabatanOptions = async (req, res, next) => {
    try {
        const dep = String(req.query.departemen || '')
        const pabrik = String(req.query.pabrik || '')
        const [rows] = await pool.query(
            `SELECT DISTINCT k.kar_jab_kode AS Kode, j.jab_nama AS Jabatan
             FROM tkaryawan k INNER JOIN tjabatan j ON j.jab_kode = k.kar_jab_kode
             WHERE k.kar_dep_kode LIKE ? AND k.kar_pab_kode LIKE ? ORDER BY j.jab_nama`,
            [`%${dep}%`, `%${pabrik}%`]
        )
        success(res, rows)
    } catch (err) {
        next(err)
    }
}

/** Opsi filter form: departemen per pabrik (edtDepartemenClickBtn). */
export const getDepartemenOptions = async (req, res, next) => {
    try {
        const pabrik = String(req.query.pabrik || '')
        const [rows] = await pool.query(
            `SELECT DISTINCT d.dep_kode AS Kode, d.dep_nama AS Departemen
             FROM tdepartemen d INNER JOIN tkaryawan k ON k.kar_dep_kode = d.dep_kode
             WHERE k.kar_pab_kode = ? ORDER BY d.dep_nama`,
            [pabrik]
        )
        success(res, rows)
    } catch (err) {
        next(err)
    }
}

/** Opsi filter form: bagian per pabrik+jabatan+departemen (edtBagianClickBtn). */
export const getBagianOptions = async (req, res, next) => {
    try {
        const pabrik = String(req.query.pabrik || '')
        const jabatan = String(req.query.jabatan || '')
        const departemen = String(req.query.departemen || '')
        const [rows] = await pool.query(
            `SELECT DISTINCT k.kar_bagian AS Bagian FROM tkaryawan k
             WHERE k.kar_pab_kode = ? AND k.kar_jab_kode LIKE ? AND k.kar_dep_kode LIKE ?
               AND k.kar_bagian IS NOT NULL AND k.kar_bagian <> '' ORDER BY k.kar_bagian LIMIT 200`,
            [pabrik, `%${jabatan}%`, `%${departemen}%`]
        )
        success(res, rows.map((r) => r.Bagian))
    } catch (err) {
        next(err)
    }
}

/**
 * Validasi jam SPL terhadap absensi (ufrmLembur.cekdata).
 * Body: { tanggal, detail: [{ nik, nama?, jam_akhir }] }
 * Aturan: (jam_akhir - scan2) <= 30 menit, bila ada record absensi hari itu.
 */
export const cekAbsensi = async (req, res, next) => {
    try {
        const tanggal = String(req.body?.tanggal || req.query.tanggal || '').slice(0, 10)
        const detail = req.body?.detail || []
        if (!tanggal) return error(res, 'Tanggal wajib diisi', 400)
        const masalah = []
        for (const baris of detail) {
            const nik = String(baris?.nik || '').trim()
            if (!nik) continue
            const jamAkhir = String(baris?.jam_akhir || '00:00:00')
            const [rows] = await pool.query(
                `SELECT a.scan2 FROM tabsensi a INNER JOIN tkaryawan b ON b.kar_kode_absensi = a.nik
                 WHERE a.tanggal = ? AND b.kar_Nik = ? LIMIT 1`,
                [tanggal, nik]
            )
            if (rows.length === 0) continue
            const scan2 = toTime(rows[0].scan2)
            const selisih = menit(jamAkhir) - menit(scan2)
            if (selisih > 30) {
                masalah.push(`${baris?.nama || nik} kurang ${selisih} menit (scan keluar ${scan2}, SPL sampai ${jamAkhir})`)
            }
        }
        if (masalah.length > 0) return error(res, masalah.join('; '), 422)
        success(res, { tanggal, jumlah: detail.filter((d) => String(d?.nik || '').trim()).length }, 'Semua jam valid')
    } catch (err) {
        next(err)
    }
}

function menit(jam) {
    const m = /^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/.exec(String(jam).trim())
    if (!m) return 0
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
}

/**
 * Simpan SPL (ufrmLembur.simpandata + cxButton1Click).
 * Body: { nomor?, tanggal, bagian, pabrik, jenis_kerja,
 *         detail: [{ nik, jam_mulai, jam_akhir, keterangan, panggilan }],
 *         otorisasi_token?, lewati_validasi? }
 */
export const saveLembur = async (req, res, next) => {
    try {
        const b = req.body || {}
        const tanggal = String(b.tanggal || '').slice(0, 10)
        const bagian = String(b.bagian || '')
        const pabrik = String(b.pabrik || '').trim()
        const jenisKerja = String(b.jenis_kerja || '')
        const rawDetail = Array.isArray(b.detail) ? b.detail : []

        if (!tanggal) return error(res, 'Tanggal wajib diisi', 400)
        if (!pabrik) return error(res, 'Pabrik wajib dipilih', 400)

        const [prows] = await pool.query('SELECT pab_kode FROM tpabrik WHERE pab_kode = ? LIMIT 1', [pabrik])
        if (prows.length === 0) return error(res, `Pabrik ${pabrik} tidak dikenal`, 400)

        // Bersihkan baris kosong + cegah NIK ganda (bantuankaryawan di Delphi).
        const lihat = new Set()
        const detail = []
        for (const r of rawDetail) {
            const nik = String(r?.nik || '').trim()
            if (!nik) continue
            if (lihat.has(nik)) return error(res, `Karyawan ${nik} dimasukkan dua kali`, 400)
            lihat.add(nik)
            detail.push({
                nik,
                jam_mulai: normJam(r?.jam_mulai ?? '00:00:00'),
                jam_akhir: normJam(r?.jam_akhir ?? '00:00:00'),
                keterangan: String(r?.keterangan || ''),
                panggilan: parseInt(r?.panggilan ?? 0, 10) ? 1 : 0,
            })
        }
        if (detail.length === 0) return error(res, 'Minimal satu karyawan harus diisi', 400)

        for (const d of detail) {
            const [k] = await pool.query('SELECT kar_Nik FROM tkaryawan WHERE kar_Nik = ? LIMIT 1', [d.nik])
            if (k.length === 0) return error(res, `NIK ${d.nik} tidak ada pada master karyawan`, 400)
        }

        // Validasi absensi kecuali diminta lewati (Delphi selalu validasi).
        if (!b.lewati_validasi) {
            const masalah = []
            for (const d of detail) {
                const [rows] = await pool.query(
                    `SELECT a.scan2, k.kar_nama FROM tabsensi a
                     INNER JOIN tkaryawan k ON k.kar_kode_absensi = a.nik
                     WHERE a.tanggal = ? AND k.kar_Nik = ? LIMIT 1`,
                    [tanggal, d.nik]
                )
                if (rows.length === 0) continue
                const selisih = menit(d.jam_akhir) - menit(toTime(rows[0].scan2))
                if (selisih > 30) {
                    masalah.push(`${rows[0].kar_nama || d.nik} kurang ${selisih} menit`)
                }
            }
            if (masalah.length > 0) return error(res, masalah.join('; '), 422)
        }

        let atasan = null
        if ((await cekTanggal(tanggal)) >= 2) {
            atasan = userDariToken(b.otorisasi_token)
            if (!atasan) {
                return error(res, 'Data lebih dari 2 hari memerlukan otorisasi atasan', 403)
            }
        }

        const nomorEdit = String(b.nomor || '').trim()
        let nomor = nomorEdit
        if (nomorEdit) {
            const [ada] = await pool.query('SELECT lem_nomor FROM tlembur_hdr WHERE lem_nomor = ?', [nomorEdit])
            if (ada.length === 0) return error(res, 'Nomor lembur tidak ditemukan', 404)
            await pool.query(
                `UPDATE tlembur_hdr SET lem_tanggal = ?, lem_bagian = ?, lem_pab_kode = ?, lem_jeniskerja = ?
                 WHERE lem_nomor = ?`,
                [tanggal, bagian, pabrik, jenisKerja, nomorEdit]
            )
        } else {
            nomor = await nomorBerikut(tanggal)
            await pool.query(
                `INSERT INTO tlembur_hdr (lem_nomor, lem_tanggal, lem_bagian, lem_pab_kode, lem_jeniskerja)
                 VALUES (?, ?, ?, ?, ?)`,
                [nomor, tanggal, bagian, pabrik, jenisKerja]
            )
        }

        // Delphi: DELETE detail lama lalu INSERT ulang (simpan dalam transaksi).
        const conn = await pool.getConnection()
        try {
            await conn.beginTransaction()
            await conn.query('DELETE FROM tlembur_dtl WHERE lemd_lem_nomor = ?', [nomorEdit || nomor])
            for (const d of detail) {
                await conn.query(
                    `INSERT INTO tlembur_dtl (lemd_lem_nomor, lemd_kar_nik, lemd_jammulai, lemd_jamakhir, lemd_keterangan, lemd_panggilan)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [nomor, d.nik, d.jam_mulai, d.jam_akhir, d.keterangan, d.panggilan]
                )
            }
            if (atasan) {
                await ensureOtorisasiTable()
                await conn.query('INSERT INTO tlistotorisasi (tanggal, nomor, user) VALUES (NOW(), ?, ?)', [
                    nomor,
                    atasan,
                ])
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

        success(
            res,
            { nomor, jumlah: detail.length, otorisasi_by: atasan },
            `Berhasil simpan dengan nomor ${nomor}`
        )
    } catch (err) {
        next(err)
    }
}

/** Hapus SPL: detail dulu lalu header (ufrmBrowseLembur.cxButton4Click). */
export const deleteLembur = async (req, res, next) => {
    try {
        const nomor = String(req.params.nomor || req.query.nomor || '')
        if (!nomor) return error(res, 'Nomor lembur wajib diisi', 400)
        await pool.query('DELETE FROM tlembur_dtl WHERE lemd_lem_nomor = ?', [nomor])
        const [r] = await pool.query('DELETE FROM tlembur_hdr WHERE lem_nomor = ?', [nomor])
        if (r.affectedRows === 0) return error(res, 'Nomor lembur tidak ditemukan', 404)
        success(res, null, 'Lembur berhasil dihapus')
    } catch (err) {
        next(err)
    }
}
