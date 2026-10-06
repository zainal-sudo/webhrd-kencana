import jwt from 'jsonwebtoken'
import pool from '../../config/database.js'
import { success, error, paginated } from '../../helpers/response.js'
import { buildOrderBy, applyAllColumnFilters } from '../../helpers/browse.js'

/** Nilai kolom `time` MySQL -> "HH:MM:SS". */
export function toTime(v) {
    if (v === null || v === undefined || v === '') return '00:00:00'
    if (typeof v === 'string') return v.slice(0, 8)
    const d = new Date(v)
    if (isNaN(d.getTime())) return '00:00:00'
    const p = (n) => String(n).padStart(2, '0')
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** Normalisasi input jam form menjadi "HH:MM:SS". */
export function normJam(v) {
    if (v === null || v === undefined) return '00:00:00'
    if (v instanceof Date) return toTime(v)
    const s = String(v).trim()
    if (s === '') return '00:00:00'
    if (/^\d{1,2}:\d{1,2}(:\d{1,2})?$/.test(s)) {
        const [h, m, d] = s.split(':')
        const p = (x) => String(x).padStart(2, '0')
        return `${p(h)}:${p(m)}:${p(d ?? 0)}`
    }
    if (/^\d{6}$/.test(s)) return `${s.slice(0, 2)}:${s.slice(2, 4)}:${s.slice(4, 6)}`
    return s
}

/**
 * Modul Ijin — cerminan unit Delphi:
 *   ufrmBrowseIjin -> daftar ijin per periode + hapus
 *   ufrmIjin       -> form satu NIK + rentang tanggal (Tanggal s/d Tanggal2)
 *
 * Tabel: `tijin` (ij_nomor PK `IJN.YYYYMM.NNNN`), `tjenisijin`,
 *        `tkaryawan`, `tjabatan`, `tpabrik`, `tharilibur`, `tlistotorisasi`.
 *
 * Aturan Delphi yang diduplikasi:
 * - Nomor: `IJN.` + yyyymm(tanggal) + `.` + urut 4 digit per bulan
 *   (ufrmIjin.getmaxnomor / getmaxnomor2).
 * - Bila Tanggal != Tanggal2: satu baris per hari kalender, hari libur
 *   (`tharilibur`) dilewati, NIK yang sudah punya ijin hari itu hanya
 *   diperingatkan — barisnya tetap dibuat (Delphi: pesan tapi tidak Exit).
 * - Duplikat NIK+tanggal pada mode 1 hari: frontend wajib konfirmasi
 *   "LANJUT?" (cekdata); backend menolak bila `konfirmasi_duplikat != true`.
 * - Tanggal pertama tidak boleh lebih besar dari tanggal kedua.
 * - Jam akhir (ij_jam2) hanya relevan untuk jenis 2,4,5
 *   (1/2 Hari, Meninggalkan Pekerjaan, Dinas Luar); selain itu dikosongkan
 *   menjadi 00:00:00 seperti tampilan Delphi (kontrol disembunyikan).
 * - cektanggal(tgl) = DATEDIFF(NOW,tgl) - jml libur(tgl..NOW);
 *   < 3 bebas simpan, >= 3 wajib otorisasi atasan (token JWT).
 */

/** Kolom browse — mengikuti `ufrmBrowseIjin.btnRefreshClick`. */
const LIST_COLUMNS = {
    Nomor: 'i.ij_nomor',
    Tanggal: 'i.ij_tanggal',
    Jenis_Ijin: 'ji.ji_keterangan',
    Nik: 'i.ij_nik',
    Nama: 'k.kar_nama',
    Pabrik: 'k.kar_pab_kode',
    Bagian: `CONCAT(j.jab_nama, ' ', k.kar_bagian)`,
    Awal: 'i.ij_jam',
    Akhir: 'i.ij_jam2',
    Alasan: 'i.ij_alasan',
    Keterangan: `IF(i.ij_keterangan = 0, 'Sakit', IF(i.ij_keterangan = 1, 'Ijin', IF(i.ij_keterangan = 2, 'Alpha', 'Lain Lain')))`,
    SistemGaji: 'k.kar_sistem_gaji',
}

const FROM_SQL = `FROM tijin i
    INNER JOIN tjenisijin ji ON ji.ji_id = i.ij_ji_id
    INNER JOIN tkaryawan k ON k.kar_Nik = i.ij_nik
    INNER JOIN tjabatan j ON j.jab_kode = k.kar_jab_kode
    INNER JOIN tpabrik p ON p.pab_kode = k.kar_pab_kode`

const SELECT_SQL = `SELECT ${Object.entries(LIST_COLUMNS)
    .map(([alias, expr]) => `${expr} AS \`${alias}\``)
    .join(', ')} ${FROM_SQL}`

/** Keterangan Delphi: index combo -> label. */
export const KETERANGAN = ['Sakit', 'Ijin', 'Alpha', 'Lain Lain']

/** Jenis ijin yang memakai jam akhir (ufrmIjin.cxExtLookupJenisIjinPropertiesEditValueChanged). */
export const PAKAI_JAM2 = [2, 4, 5]

function pad4(n) {
    return String(10000 + n).slice(-4)
}

function prefixBulan(tanggal) {
    const d = new Date(String(tanggal).slice(0, 10))
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    return `IJN.${y}${m}.`
}

/** Nomor berikutnya untuk satu tanggal (getmaxnomor). */
export async function nomorBerikut(tanggal) {
    const prefix = prefixBulan(tanggal)
    const [rows] = await pool.query(
        'SELECT MAX(RIGHT(ij_nomor, 4)) AS m FROM tijin WHERE ij_nomor LIKE ?',
        [`${prefix}%`]
    )
    const m = rows[0]?.m ? parseInt(rows[0].m, 10) : 0
    return `${prefix}${pad4(m + 1)}`
}

/** Nomor ke-`offset` setelah max (getmaxnomor2 untuk simpan rentang). */
async function nomorBerikutOffset(tanggal, offset, conn = pool) {
    const yyyymm = String(tanggal).slice(0, 7).replace('-', '')
    const prefix = `IJN.${yyyymm}.`
    const [rows] = await conn.query(
        'SELECT MAX(RIGHT(ij_nomor, 4)) AS m FROM tijin WHERE ij_nomor LIKE ?',
        [`${prefix}%`]
    )
    const m = rows[0]?.m ? parseInt(rows[0].m, 10) : 0
    return `${prefix}${pad4(m + offset)}`
}

/** cektanggal Delphi: selisih hari kalender dikurangi hari libur diantaranya. */
export async function cekTanggal(tanggal) {
    const tgl = String(tanggal).slice(0, 10)
    const [rows] = await pool.query(
        `SELECT DATEDIFF(NOW(), ?) - (SELECT COUNT(*) FROM tharilibur WHERE hl_tanggal BETWEEN ? AND NOW()) AS selisih`,
        [tgl, tgl]
    )
    return parseInt(rows[0]?.selisih ?? 0, 10) || 0
}

async function cekLibur(tanggal) {
    const [rows] = await pool.query('SELECT 1 FROM tharilibur WHERE hl_tanggal = ? LIMIT 1', [
        String(tanggal).slice(0, 10),
    ])
    return rows.length > 0
}

async function cekDuplikat(nik, tanggal) {
    const [rows] = await pool.query('SELECT 1 FROM tijin WHERE ij_tanggal = ? AND ij_nik = ? LIMIT 1', [
        String(tanggal).slice(0, 10),
        String(nik),
    ])
    return rows.length > 0
}

async function ensureOtorisasiTable() {
    await pool.query(`CREATE TABLE IF NOT EXISTS tlistotorisasi (
        tanggal DATE DEFAULT NULL,
        nomor VARCHAR(40) DEFAULT NULL,
        USER VARCHAR(30) DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=latin1`)
}

function userDariToken(token, tipe) {
    if (!token) return null
    try {
        const t = jwt.verify(String(token), process.env.JWT_SECRET)
        return t?.tipe === tipe && t?.otorisasi ? t.otorisasi : null
    } catch {
        return null
    }
}

/** Verifikasi user atasan -> token JWT (pengganti dialog UfrmOtorisasi Delphi). */
export const cekOtorisasi = async (req, res, next) => {
    try {
        const kode = String(req.body?.user_kode ?? '').trim().toUpperCase()
        const password = String(req.body?.user_password ?? '')
        if (!kode || !password) return error(res, 'Kode user dan password wajib diisi', 400)
        const [rows] = await pool.query('SELECT user_kode FROM tuser WHERE user_kode = ? AND user_password = ?', [
            kode,
            password,
        ])
        if (rows.length === 0) return error(res, 'Kode user atau password salah', 401)
        const token = jwt.sign({ otorisasi: kode, tipe: 'ijin' }, process.env.JWT_SECRET, {
            expiresIn: process.env.OTORISASI_EXPIRES_IN || '10m',
        })
        success(res, { user_kode: kode, token }, 'Otorisasi diterima')
    } catch (err) {
        next(err)
    }
}

/** Daftar ijin per periode (default bulan berjalan). */
export const getIjinList = async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1)
        const perPage = Math.min(500, parseInt(req.query.per_page) || 25)
        const offset = (page - 1) * perPage
        const start = req.query.start_date || `${new Date().toISOString().slice(0, 7)}-01`
        const end = req.query.end_date || new Date().toISOString().slice(0, 10)

        let where = ' WHERE i.ij_tanggal BETWEEN ? AND ?'
        let params = [start, end]
        if (req.query.search) {
            where += ' AND (i.ij_nomor LIKE ? OR i.ij_nik LIKE ? OR k.kar_nama LIKE ? OR i.ij_alasan LIKE ?)'
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
        const orderBy = buildOrderBy(req.query, LIST_COLUMNS, 'ORDER BY i.ij_tanggal DESC, i.ij_nomor DESC')

        const [cnt] = await pool.query(`SELECT COUNT(*) AS total ${FROM_SQL}${where}`, params)
        const total = cnt[0].total
        const [rows] = await pool.query(`${SELECT_SQL}${where} ${orderBy} LIMIT ? OFFSET ?`, [
            ...params,
            perPage,
            offset,
        ])
        // Normalisasi jam ke HH:MM:SS untuk tabel.
        for (const r of rows) {
            r.Awal = toTime(r.Awal)
            r.Akhir = toTime(r.Akhir)
        }
        paginated(res, rows, { page, per_page: perPage, total, last_page: Math.ceil(total / perPage) })
    } catch (err) {
        next(err)
    }
}

/** Nomor ijin berikutnya untuk tanggal tertentu (dipakai form saat tanggal berubah). */
export const getNomor = async (req, res, next) => {
    try {
        const tanggal = String(req.query.tanggal || new Date().toISOString().slice(0, 10)).slice(0, 10)
        success(res, { nomor: await nomorBerikut(tanggal), tanggal })
    } catch (err) {
        next(err)
    }
}

/** Satu dokumen ijin + data karyawan (ufrmIjin.loaddataall). */
export const getIjin = async (req, res, next) => {
    try {
        const nomor = String(req.query.nomor || req.params.nomor || '')
        if (!nomor) return error(res, 'Nomor ijin wajib diisi', 400)
        const [rows] = await pool.query(
            `SELECT i.ij_nomor, i.ij_ji_id, i.ij_tanggal, i.ij_alasan, i.ij_jam, i.ij_jam2,
                    i.ij_nik, i.ij_keterangan, k.kar_nama, j.jab_nama, ji.ji_keterangan AS jenis_nama
             FROM tijin i
             INNER JOIN tkaryawan k ON k.kar_Nik = i.ij_nik
             INNER JOIN tjabatan j ON j.jab_kode = k.kar_jab_kode
             LEFT JOIN tjenisijin ji ON ji.ji_id = i.ij_ji_id
             WHERE i.ij_nomor = ?`,
            [nomor]
        )
        if (rows.length === 0) return error(res, 'Nomor ijin tidak ditemukan', 404)
        const r = rows[0]
        success(res, {
            nomor: r.ij_nomor,
            jenis_id: r.ij_ji_id,
            jenis_nama: r.jenis_nama,
            tanggal: String(r.ij_tanggal).slice(0, 10),
            tanggal2: String(r.ij_tanggal).slice(0, 10),
            nik: r.ij_nik,
            nama: r.kar_nama,
            jabatan: r.jab_nama,
            jam: toTime(r.ij_jam),
            jam2: toTime(r.ij_jam2),
            keterangan: r.ij_keterangan,
            keterangan_label: KETERANGAN[r.ij_keterangan] ?? 'Lain Lain',
            alasan: r.ij_alasan,
        })
    } catch (err) {
        next(err)
    }
}

/** Lookup karyawan aktif (ufrmIjin.edtNikClickBtn) + info nama/jabatan. */
export const lookupKaryawan = async (req, res, next) => {
    try {
        const q = String(req.query.search || '').trim()
        const perPage = Math.min(200, parseInt(req.query.per_page) || 20)
        const page = Math.max(1, parseInt(req.query.page) || 1)
        let where = ' WHERE k.kar_status_aktif = 1'
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
            `SELECT k.kar_Nik AS Nik, LEFT(k.kar_nama, 40) AS Nama, k.kar_pab_kode AS Pabrik,
                    j.jab_nama AS Jabatan, LEFT(k.kar_bagian, 40) AS Bagian,
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

/** Info satu karyawan (ufrmIjin.loaddata). */
export const infoKaryawan = async (req, res, next) => {
    try {
        const nik = String(req.query.nik || '')
        if (!nik) return error(res, 'NIK wajib diisi', 400)
        const [rows] = await pool.query(
            `SELECT k.kar_Nik AS nik, k.kar_nama AS nama, j.jab_nama AS jabatan,
                    k.kar_bagian AS bagian, k.kar_pab_kode AS pabrik
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

/** Cek duplikat NIK+tanggal (ufrmIjin.cekdata) — dipakai form sebelum simpan. */
export const cekDuplikatHandler = async (req, res, next) => {
    try {
        const nik = String(req.query.nik || '')
        const tanggal = String(req.query.tanggal || '').slice(0, 10)
        if (!nik || !tanggal) return error(res, 'NIK dan tanggal wajib diisi', 400)
        success(res, { nik, tanggal, sudah_ada: await cekDuplikat(nik, tanggal) })
    } catch (err) {
        next(err)
    }
}

/** Daftar jenis ijin (tjenisijin) untuk dropdown form. */
export const getJenisIjin = async (req, res, next) => {
    try {
        const [rows] = await pool.query('SELECT ji_id AS Kode, ji_keterangan AS Nama FROM tjenisijin ORDER BY ji_id')
        success(res, rows)
    } catch (err) {
        next(err)
    }
}

/**
 * Simpan ijin (ufrmIjin.simpandata + cxButton1Click).
 *
 * Body: { nomor?, jenis_id, tanggal, tanggal2?, nik, jam, jam2?, keterangan(0-3), alasan,
 *         konfirmasi_duplikat?, otorisasi_token? }
 * - Mode ubah (`nomor` terisi & ada di DB): hanya UPDATE satu baris
 *   (Delphi tidak membuka rentang saat FLAGEDIT).
 * - Mode tambah 1 hari: INSERT satu baris; duplikat ditolak kecuali
 *   `konfirmasi_duplikat: true` (jawaban "LANJUT?" di Delphi).
 * - Mode tambah rentang: satu INSERT per hari, lewati hari libur, NIK yang
 *   sudah berijin hanya dicatat sebagai peringatan (tetap dibuat).
 */
export const saveIjin = async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
        const b = req.body || {}
        const jenisId = parseInt(b.jenis_id, 10)
        const tanggal = String(b.tanggal || '').slice(0, 10)
        const tanggal2 = String(b.tanggal2 || b.tanggal || '').slice(0, 10)
        const nik = String(b.nik || '').trim()
        const keterangan = parseInt(b.keterangan ?? 3, 10)
        const alasan = String(b.alasan || '')

        if (!jenisId) return error(res, 'Jenis ijin wajib dipilih', 400)
        if (!tanggal) return error(res, 'Tanggal wajib diisi', 400)
        if (!nik) return error(res, 'NIK wajib diisi', 400)
        if (tanggal > tanggal2) return error(res, 'Tanggal pertama tidak boleh lebih besar dari tanggal kedua', 400)
        if (![0, 1, 2, 3].includes(keterangan)) return error(res, 'Keterangan tidak valid', 400)

        const [jrows] = await conn.query('SELECT ji_id FROM tjenisijin WHERE ji_id = ?', [jenisId])
        if (jrows.length === 0) return error(res, 'Jenis ijin tidak dikenal', 400)
        const [krows] = await conn.query('SELECT kar_nama FROM tkaryawan WHERE kar_Nik = ?', [nik])
        if (krows.length === 0) return error(res, `NIK ${nik} tidak ada pada master karyawan`, 400)

        const pakai2 = PAKAI_JAM2.includes(jenisId)
        const jam = normJam(b.jam ?? '00:00:00')
        const jam2 = pakai2 ? normJam(b.jam2 ?? '00:00:00') : '00:00:00'

        // Otorisasi bila data sudah lama (Delphi: cektanggal < 3 bebas).
        let atasan = null
        if ((await cekTanggal(tanggal)) >= 3) {
            atasan = userDariToken(b.otorisasi_token, 'ijin')
            if (!atasan) {
                return error(res, 'Data lebih dari 3 hari memerlukan otorisasi atasan', 403)
            }
        }

        const isEditNomor = String(b.nomor || '').trim()
        let dibuat = []
        let peringatan = []

        if (isEditNomor) {
            const [ada] = await conn.query('SELECT ij_nomor FROM tijin WHERE ij_nomor = ?', [isEditNomor])
            if (ada.length === 0) return error(res, 'Nomor ijin tidak ditemukan', 404)
            await conn.beginTransaction()
            await conn.query(
                `UPDATE tijin SET ij_ji_id = ?, ij_tanggal = ?, ij_nik = ?, ij_jam = ?,
                    ij_jam2 = ?, ij_keterangan = ?, ij_alasan = ? WHERE ij_nomor = ?`,
                [jenisId, tanggal, nik, jam, jam2, keterangan, alasan, isEditNomor]
            )
            if (atasan) {
                await ensureOtorisasiTable()
                await conn.query('INSERT INTO tlistotorisasi (tanggal, nomor, user) VALUES (NOW(), ?, ?)', [
                    isEditNomor,
                    atasan,
                ])
            }
            await conn.commit()
            return success(
                res,
                { nomor: [isEditNomor], otorisasi_by: atasan },
                `Berhasil simpan dengan nomor ${isEditNomor}`
            )
        }

        await conn.beginTransaction()
        if (tanggal === tanggal2) {
            if (await cekDuplikat(nik, tanggal)) {
                if (!b.konfirmasi_duplikat) {
                    await conn.rollback()
                    return error(
                        res,
                        `NIK ${nik} sudah pernah dibuatkan ijin pada tanggal ${tanggal}. Kirim konfirmasi_duplikat=true untuk LANJUT.`,
                        409
                    )
                }
                peringatan.push(`NIK ${nik} sudah pernah dibuatkan ijin pada tanggal ${tanggal}`)
            }
            const nomor = await nomorBerikutOffset(tanggal, 1, conn)
            await conn.query(
                `INSERT INTO tijin (ij_nomor, ij_ji_id, ij_tanggal, ij_nik, ij_jam, ij_jam2, ij_keterangan, ij_alasan)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [nomor, jenisId, tanggal, nik, jam, jam2, keterangan, alasan]
            )
            dibuat.push(nomor)
            if (atasan) {
                await ensureOtorisasiTable()
                await conn.query('INSERT INTO tlistotorisasi (tanggal, nomor, user) VALUES (NOW(), ?, ?)', [
                    nomor,
                    atasan,
                ])
            }
        } else {
            let a = 1
            let tgl = tanggal
            while (tgl <= tanggal2) {
                if (await cekDuplikat(nik, tgl)) {
                    peringatan.push(`NIK ${nik} sudah pernah dibuatkan ijin pada tanggal ${tgl}`)
                }
                if (!(await cekLibur(tgl))) {
                    const nomor = await nomorBerikutOffset(tgl, a, conn)
                    await conn.query(
                        `INSERT INTO tijin (ij_nomor, ij_ji_id, ij_tanggal, ij_nik, ij_jam, ij_jam2, ij_keterangan, ij_alasan)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                        [nomor, jenisId, tgl, nik, jam, jam2, keterangan, alasan]
                    )
                    dibuat.push(nomor)
                    if (atasan) {
                        await ensureOtorisasiTable()
                        await conn.query('INSERT INTO tlistotorisasi (tanggal, nomor, user) VALUES (NOW(), ?, ?)', [
                            nomor,
                            atasan,
                        ])
                    }
                    a += 1
                }
                const d = new Date(tgl)
                d.setDate(d.getDate() + 1)
                tgl = d.toISOString().slice(0, 10)
            }
            if (dibuat.length === 0) {
                await conn.rollback()
                return error(res, 'Semua tanggal pada rentang adalah hari libur — tidak ada data dibuat', 400)
            }
        }
        await conn.commit()
        success(
            res,
            { nomor: dibuat, peringatan, otorisasi_by: atasan },
            dibuat.length === 1
                ? `Berhasil simpan dengan nomor ${dibuat[0]}${peringatan.length ? ' (' + peringatan.join('; ') + ')' : ''}`
                : `${dibuat.length} ijin berhasil dibuat (${dibuat[0]} s/d ${dibuat[dibuat.length - 1]})${peringatan.length ? '. Peringatan: ' + peringatan.join('; ') : ''}`
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

/** Hapus satu dokumen (ufrmBrowseIjin.cxButton4Click). */
export const deleteIjin = async (req, res, next) => {
    try {
        const nomor = String(req.params.nomor || req.query.nomor || '')
        if (!nomor) return error(res, 'Nomor ijin wajib diisi', 400)
        const [r] = await pool.query('DELETE FROM tijin WHERE ij_nomor = ?', [nomor])
        if (r.affectedRows === 0) return error(res, 'Nomor ijin tidak ditemukan', 404)
        success(res, null, 'Ijin berhasil dihapus')
    } catch (err) {
        next(err)
    }
}
