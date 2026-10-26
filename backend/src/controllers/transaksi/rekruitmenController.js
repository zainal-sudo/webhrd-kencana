import pool from '../../config/database.js'
import { success, error, paginated } from '../../helpers/response.js'
import { buildOrderBy, applyAllColumnFilters } from '../../helpers/browse.js'
import { sendExcel } from '../../helpers/excel.js'

/**
 * Modul Bank Pelamar — cerminan unit Delphi:
 *   ufrmBrowseRekruitmen -> daftar per periode + hapus
 *   ufrmRekruitmen       -> form data pelamar + pengalaman + nilai tes
 *
 * Tabel: `trekruitmen` (rkt_nomor PK `NNN/HRD/REKRUIT/MM/yy`),
 *        `trekruitmenpengalaman`, `trekruitmentes` (bank: rtt_ck_nomor NULL),
 *        `talattes` (master alat tes, status = 1).
 *
 * Aturan Delphi yang diduplikasi:
 * - Nomor: 3 digit urut per TAHUN berjalan + `/HRD/REKRUIT/` + MM/yy.
 * - Status tersimpan sebagai index combo (0–8); label browse mengikuti
 *   pemetaan IF Delphi.
 * - Jenkel tersimpan 1 = Laki-laki, selainnya Perempuan.
 * - Simpan menimpa ulang baris pengalaman (yang namanya terisi) dan nilai
 *   tes (yang namanya terisi) dalam satu transaksi.
 *
 * PERBAIKAN dari Delphi: hapus ikut menghapus pengalaman + nilai tes
 * (Delphi hanya menghapus header); nilai tes bank disaring
 * `rtt_ck_nomor IS NULL` agar tidak tercampur nilai tes level panggilan.
 * Hapus DITOLAK bila pelamar sudah dipakai di data panggilan.
 */

/** Label status sesuai urutan combo Delphi (index = rkt_status). */
export const STATUS_REKRUITMEN = [
    'Belum diputuskan',
    'Diterima',
    'Ditolak',
    'Dipanggil Tidak Datang',
    'Pelatihan',
    'Diterima Tapi Tidak Datang',
    'Tes Psikotes/skill',
    'Interview User',
    'Interview HRD',
]

const STATUS_SQL = `IF(rkt_status=1,"Diterima",IF(rkt_status=6,"Tes Psikotes/skill",IF(rkt_status=7,"Interview User",IF(rkt_status=8,"Interview hrd",IF(rkt_status=0,"Belum diputuskan",IF(rkt_status=2,"Tidak Diterima",IF(rkt_status=3,"Dipanggil Tidak Datang",IF(rkt_status=4,"Pelatihan","Diterima tapi Tidak datang"))))))))`

const LIST_COLUMNS = {
    Nomor: 'rkt_nomor',
    Tanggal: 'rkt_tanggal',
    Nama: 'rkt_nama',
    Jenis_Kelamin: 'IF(rkt_jenkel=1,"Laki-Laki","Perempuan")',
    Alamat: 'rkt_alamat',
    Telp: 'rkt_telp',
    Identitas: 'rkt_identitas',
    TempatLahir: 'rkt_tempatlahir',
    TglLahir: 'rkt_tgllahir',
    IbuKandung: 'rkt_ibukandung',
    Email: 'rkt_email',
    Posisi: 'rkt_posisi',
    Status: STATUS_SQL,
    PendidikanTerakhir: 'rkt_pendidikanterakhir',
    Jurusan: 'rkt_jurusan',
    SizeKaos: 'rkt_size',
}

const FROM_SQL = 'FROM trekruitmen'

const SELECT_SQL = `SELECT ${Object.entries(LIST_COLUMNS)
    .map(([alias, expr]) => `${expr} AS \`${alias}\``)
    .join(', ')} ${FROM_SQL}`

function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
    const date = new Date(`${value}T00:00:00Z`)
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && value >= '1000-01-01'
}

function validTime(value) {
    return typeof value === 'string' && /^\d{2}:\d{2}(:\d{2})?$/.test(value)
}

/** Nomor berikutnya: NNN/HRD/REKRUIT/MM/yy (getmaxnomor). */
export async function nomorBerikut(tanggal) {
    const s = String(tanggal).slice(0, 10)
    const d = new Date(`${s}T00:00:00Z`)
    const tahun = d.getUTCFullYear()
    const suffix = `/HRD/REKRUIT/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(tahun).slice(-2)}`
    const [rows] = await pool.query(
        'SELECT MAX(LEFT(rkt_nomor, 3)) AS m FROM trekruitmen WHERE YEAR(rkt_tanggal) = ?',
        [tahun]
    )
    const m = rows[0]?.m ? parseInt(rows[0].m, 10) : 0
    return `${String(1000 + m + 1).slice(-3)}${suffix}`
}

/** Daftar pelamar per periode (default bulan berjalan). */
export const getRekruitmenList = async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1)
        const perPage = Math.min(500, parseInt(req.query.per_page) || 25)
        const offset = (page - 1) * perPage
        const today = new Date().toISOString().slice(0, 10)
        const start = req.query.start_date || `${today.slice(0, 7)}-01`
        const end = req.query.end_date || today
        if (!validDate(start) || !validDate(end) || start > end) return error(res, 'Periode tidak valid', 400)

        let where = ' WHERE rkt_tanggal BETWEEN ? AND ?'
        let params = [start, end]
        if (req.query.search) {
            where += ' AND (rkt_nomor LIKE ? OR rkt_nama LIKE ? OR rkt_posisi LIKE ? OR rkt_alamat LIKE ? OR rkt_telp LIKE ?)'
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
        const order = buildOrderBy(req.query, LIST_COLUMNS, 'ORDER BY rkt_tanggal DESC, rkt_nomor DESC')
        if (req.query.export === 'xlsx') {
            const [rows] = await pool.query(`${SELECT_SQL}${f.clause} ${order} LIMIT 50000`, f.params)
            return sendExcel(res, 'Bank-Pelamar', Object.keys(LIST_COLUMNS), rows,
                { headLabels: { Jenis_Kelamin: 'L/P', TempatLahir: 'Tempat Lahir', TglLahir: 'Tgl Lahir', IbuKandung: 'Ibu Kandung', PendidikanTerakhir: 'Pendidikan', SizeKaos: 'Size' } })
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

/** Master alat tes aktif (initgrid: baris tes diisi dari sini). */
export const getAlatTes = async (req, res, next) => {
    try {
        const [rows] = await pool.query('SELECT id, nama AS Nama FROM talattes WHERE status = 1 ORDER BY id')
        success(res, rows)
    } catch (err) { next(err) }
}

/** Satu pelamar + pengalaman + nilai tes bank (mode ubah). */
export const getRekruitmen = async (req, res, next) => {
    try {
        const nomor = String(req.query.nomor || req.params.nomor || '').trim()
        if (!nomor) return error(res, 'Nomor wajib diisi', 400)
        const [rows] = await pool.query('SELECT * FROM trekruitmen WHERE rkt_nomor = ?', [nomor])
        if (rows.length === 0) return error(res, 'Nomor tidak ditemukan', 404)
        const t = rows[0]
        const [pengalaman] = await pool.query(
            `SELECT rktp_namaperusahaan AS namaperusahaan, rktp_bidangusaha AS bidangusaha,
                    rktp_kota AS kota, rktp_tglmasuk AS tglmasuk, rktp_tglkeluar AS tglkeluar,
                    rktp_jabatanterakhir AS jabatanterakhir
             FROM trekruitmenpengalaman WHERE rktp_rkt_nomor = ?`,
            [nomor]
        )
        const [tes] = await pool.query(
            `SELECT a.id AS id, a.nama AS nama, t.rtt_hasil AS hasil
             FROM talattes a
             LEFT JOIN trekruitmentes t ON t.rtt_id_tes = a.id AND t.rtt_rkt_nomor = ? AND t.rtt_ck_nomor IS NULL
             WHERE a.status = 1 ORDER BY a.id`,
            [nomor]
        )
        const iso = (v) => (v ? String(v).slice(0, 10) : null)
        success(res, {
            nomor: t.rkt_nomor,
            tanggal: iso(t.rkt_tanggal),
            nama: t.rkt_nama || '',
            jenkel: Number(t.rkt_jenkel) === 1 ? 1 : 0,
            alamat: t.rkt_alamat || '',
            telp: t.rkt_telp || '',
            identitas: t.rkt_identitas || '',
            tempat_lahir: t.rkt_tempatlahir || '',
            tgl_lahir: iso(t.rkt_tgllahir),
            ibu_kandung: t.rkt_ibukandung || '',
            email: t.rkt_email || '',
            status: Number.isInteger(t.rkt_status) ? t.rkt_status : 0,
            posisi: t.rkt_posisi || '',
            status_kawin: t.rkt_status_kawin || '',
            warganegara: t.rkt_warganegara || '',
            gol_darah: t.rkt_gol_darah || '',
            agama: t.rkt_agama || '',
            keterangan: t.rkt_keterangan || '',
            pendidikan: t.rkt_pendidikanterakhir || '',
            jurusan: t.rkt_jurusan || '',
            size: t.rkt_size || '',
            status_tinggal: t.rkt_status_tinggal || '',
            pengalaman: pengalaman.map((p) => ({
                ...p,
                tglmasuk: iso(p.tglmasuk),
                tglkeluar: iso(p.tglkeluar),
            })),
            tes: tes.map((r) => ({ id: r.id, nama: r.nama, hasil: r.hasil || '' })),
        })
    } catch (err) { next(err) }
}

/**
 * Simpan (ufrmRekruitmen.simpandata).
 * POST membuat nomor baru; PUT wajib memakai nomor data yang sudah tersimpan.
 * Body: { nomor? (mode ubah), tanggal, nama, jenkel 1/0, alamat, telp,
 *   identitas, tempat_lahir, tgl_lahir, ibu_kandung, email, status 0-8,
 *   posisi, status_kawin, warganegara, gol_darah, agama, keterangan,
 *   pendidikan, jurusan, size, status_tinggal,
 *   pengalaman: [{namaperusahaan, bidangusaha, kota, tglmasuk, tglkeluar, jabatanterakhir}],
 *   tes: [{id, hasil}] }
 */
export const saveRekruitmen = async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
        const b = req.body || {}
        const tanggal = String(b.tanggal || '').slice(0, 10)
        const nama = String(b.nama || '').trim()
        if (!validDate(tanggal)) return error(res, 'Tanggal tidak valid', 400)
        if (!nama) return error(res, 'Nama pelamar wajib diisi', 400)
        const status = parseInt(b.status, 10)
        if (!Number.isInteger(status) || status < 0 || status >= STATUS_REKRUITMEN.length) {
            return error(res, 'Status tidak valid', 400)
        }
        const jenkel = Number(b.jenkel) === 1 ? 1 : 0
        const iso = (v) => {
            const s = String(v || '').slice(0, 10)
            return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
        }
        const header = [
            tanggal, nama, String(b.alamat || ''), iso(b.tgl_lahir), String(b.tempat_lahir || ''),
            jenkel, String(b.telp || ''), String(b.identitas || ''), String(b.ibu_kandung || ''),
            String(b.posisi || ''), String(b.email || ''), status, String(b.status_kawin || ''),
            String(b.warganegara || ''), String(b.gol_darah || ''), String(b.agama || ''),
            String(b.keterangan || ''), String(b.pendidikan || ''), String(b.jurusan || ''),
            String(b.size || ''), String(b.status_tinggal || ''),
        ]

        const pengalaman = (Array.isArray(b.pengalaman) ? b.pengalaman : [])
            .filter((p) => String(p?.namaperusahaan || '').trim() !== '')
            .map((p) => [
                String(p.namaperusahaan || ''), String(p.bidangusaha || ''), String(p.kota || ''),
                iso(p.tglmasuk), iso(p.tglkeluar), String(p.jabatanterakhir || ''),
            ])
        const tes = (Array.isArray(b.tes) ? b.tes : [])
            .filter((t) => String(t?.nama || '').trim() !== '' && Number.isInteger(parseInt(t?.id, 10)))
            .map((t) => [String(t.hasil || ''), parseInt(t.id, 10)])

        const isEdit = req.method === 'PUT'
        let nomor = isEdit ? String(b.nomor || '').trim() : ''
        if (isEdit && !nomor) return error(res, 'Nomor wajib diisi untuk mengubah pelamar', 400)

        await conn.beginTransaction()
        if (isEdit) {
            const [ada] = await conn.query('SELECT rkt_nomor FROM trekruitmen WHERE rkt_nomor = ?', [nomor])
            if (ada.length === 0) {
                await conn.rollback()
                return error(res, 'Nomor tidak ditemukan', 404)
            }
            await conn.query(
                `UPDATE trekruitmen SET rkt_tanggal = ?, rkt_nama = ?, rkt_alamat = ?, rkt_tgllahir = ?,
                    rkt_tempatlahir = ?, rkt_jenkel = ?, rkt_telp = ?, rkt_identitas = ?, rkt_ibukandung = ?,
                    rkt_posisi = ?, rkt_email = ?, rkt_status = ?, rkt_status_kawin = ?, rkt_warganegara = ?,
                    rkt_gol_darah = ?, rkt_agama = ?, rkt_keterangan = ?, rkt_pendidikanterakhir = ?,
                    rkt_jurusan = ?, rkt_size = ?, rkt_status_tinggal = ?
                 WHERE rkt_nomor = ?`,
                [...header, nomor]
            )
        } else {
            nomor = await nomorBerikut(tanggal)
            await conn.query(
                `INSERT INTO trekruitmen (rkt_nomor, rkt_tanggal, rkt_nama, rkt_alamat, rkt_tgllahir, rkt_tempatlahir,
                    rkt_jenkel, rkt_telp, rkt_identitas, rkt_ibukandung, rkt_posisi, rkt_email, rkt_status,
                    rkt_status_kawin, rkt_warganegara, rkt_gol_darah, rkt_agama, rkt_keterangan,
                    rkt_pendidikanterakhir, rkt_jurusan, rkt_size, rkt_status_tinggal)
                 VALUES (?, ${Array(21).fill('?').join(', ')})`,
                [nomor, ...header]
            )
        }
        await conn.query('DELETE FROM trekruitmenpengalaman WHERE rktp_rkt_nomor = ?', [nomor])
        for (const p of pengalaman) {
            await conn.query(
                `INSERT INTO trekruitmenpengalaman (rktp_rkt_nomor, rktp_namaperusahaan, rktp_bidangusaha, rktp_kota,
                    rktp_tglmasuk, rktp_tglkeluar, rktp_jabatanterakhir) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [nomor, ...p]
            )
        }
        await conn.query('DELETE FROM trekruitmentes WHERE rtt_rkt_nomor = ? AND rtt_ck_nomor IS NULL', [nomor])
        for (const [hasil, id] of tes) {
            await conn.query(
                'INSERT INTO trekruitmentes (rtt_rkt_nomor, rtt_hasil, rtt_id_tes) VALUES (?, ?, ?)',
                [nomor, hasil, id]
            )
        }
        await conn.commit()
        success(res, { nomor }, `Berhasil simpan dengan nomor ${nomor}`)
    } catch (err) {
        await conn.rollback().catch(() => {})
        next(err)
    } finally {
        conn.release()
    }
}

/** Hapus — MENOLAK bila pelamar sudah dipakai di data panggilan. */
export const deleteRekruitmen = async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
        const nomor = String(req.params.nomor || req.query.nomor || '').trim()
        if (!nomor) return error(res, 'Nomor wajib diisi', 400)
        const [pakai] = await conn.query(
            'SELECT COUNT(*) AS c FROM tcalonkaryawan_dtl WHERE ckd_rkt_nomor = ?',
            [nomor]
        )
        if (Number(pakai[0].c) > 0) {
            return error(res, `Nomor ${nomor} sudah dipakai di data panggilan — hapus dari sana dulu`, 409)
        }
        await conn.beginTransaction()
        await conn.query('DELETE FROM trekruitmentes WHERE rtt_rkt_nomor = ?', [nomor])
        await conn.query('DELETE FROM trekruitmenpengalaman WHERE rktp_rkt_nomor = ?', [nomor])
        const [r] = await conn.query('DELETE FROM trekruitmen WHERE rkt_nomor = ?', [nomor])
        if (r.affectedRows === 0) {
            await conn.rollback()
            return error(res, 'Nomor tidak ditemukan', 404)
        }
        await conn.commit()
        success(res, null, 'Data berhasil dihapus')
    } catch (err) {
        await conn.rollback().catch(() => {})
        next(err)
    } finally {
        conn.release()
    }
}
