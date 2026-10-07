import jwt from 'jsonwebtoken'
import pool from '../../config/database.js'
import { success, error, paginated } from '../../helpers/response.js'
import { buildOrderBy, applyAllColumnFilters } from '../../helpers/browse.js'
import { sendExcel } from '../../helpers/excel.js'
import { bacaBerkasAbsensi, simpanScanStaging, jamExcelKeTeks, HEADER_NIK, HEADER_TANGGAL, HEADER_JAM, HEADER_TIPE } from '../../helpers/absensiImport.js'

/**
 * Modul Absensi — cerminan unit Delphi:
 *   ufrmBrowseAbsensi  -> daftar absensi per periode + hapus baris
 *   ufrmAbsensi        ->Maintenance satu baris (nik kode absensi + tanggal)
 *   ufrmImportAbsensi  -> tarik data mesin absensi ke `tabsensi2`, lalu
 *                         salin ke `tabsensi` (disebut "proses" di bawah)
 *
 * Tabel: `tabsensi` (nik = kar_kode_absensi, bukan NIK), `tabsensi2` (staging),
 *        `tkeluar` (untuk penanda Nonaktif di browse).
 *
 * Catatan tentang langkah pertama Import Absensi: program Delphi membaca
 * `absensi.mdb` (Jet OLEDB) langsung dari folder tiap mesin absensi. Node tidak
 * punya pembaca MDB bawaan, sehingga berkas mesin (hasil ekspor ke Excel/CSV)
 * diunggah lewat form dan isinya masuk ke `tabsensi2` — tabel staging punya
 * peran yang sama persis seperti pada program Delphi.
 */

/** Kolom browse — mengikuti query `ufrmBrowseAbsensi.btnRefreshClick`. */
const LIST_COLUMNS = {
    Nik: 'a.nik',
    Kode_Absensi: 'a.nik',
    NIK: 'k.kar_Nik',
    Nama: 'k.kar_nama',
    Tanggal: 'a.tanggal',
    Pabrik: 'k.kar_pab_kode',
    'Nama Pabrik': 'p.pab_nama',
    Bagian: "TRIM(CONCAT_WS(' ', j.jab_nama, k.kar_bagian))",
    Jabatan: 'j.jab_nama',
    Sistem: 'k.kar_sistem_gaji',
    Hari: `CASE DAYNAME(a.tanggal)
        WHEN 'Monday' THEN 'Senin' WHEN 'Tuesday' THEN 'Selasa'
        WHEN 'Wednesday' THEN 'Rabu' WHEN 'Thursday' THEN 'Kamis'
        WHEN 'Friday' THEN 'Jumat' WHEN 'Saturday' THEN 'Sabtu'
        ELSE 'Minggu' END`,
    Masuk: 'a.masuk',
    Scan1: 'a.scan1',
    Keluar: 'a.keluar',
    Scan2: 'a.scan2',
    Status: 'a.status',
    Verifikasi: 'a.verifikasi',
    Nonaktif: `(SELECT IF(COUNT(*) > 0, 1, 0) FROM tkeluar kl
                 WHERE kl.kl_nik = k.kar_Nik AND kl.kl_tanggal <= a.tanggal)`,
}

const FROM_SQL = `FROM tabsensi a
    INNER JOIN tkaryawan k ON k.kar_kode_absensi = a.nik
    LEFT JOIN tjabatan j ON j.jab_kode = k.kar_jab_kode
    LEFT JOIN tpabrik p ON p.pab_kode = k.kar_pab_kode`

const SELECT_SQL = `SELECT ${Object.entries(LIST_COLUMNS)
    .map(([alias, expr]) => `${expr} AS \`${alias}\``)
    .join(', ')} ${FROM_SQL}`

/** Nilai waktu MySQL arrival -> "HH:MM:SS"; DB mengembalikan Date di zona lokal. */
function toTime(v) {
    if (v === null || v === undefined || v === '') return null
    if (typeof v === 'string') return v.slice(0, 8)
    const d = new Date(v)
    if (isNaN(d.getTime())) return null
    const p = (n) => String(n).padStart(2, '0')
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/**
 * Normalisasi input jam dari form ("08:05", "8:5:3", "080500", Date).
 * Semua bentuk diterjemahkan menjadi "HH:MM:SS" yang diterima kolom `time`.
 */
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
    if (/^\d{1,8}$/.test(s)) {
        const p = (x) => String(x).padStart(2, '0')
        if (s.length <= 2) return `${p(s)}:00:00`
        if (s.length <= 4) return `${p(s.slice(0, -2))}:${p(s.slice(-2))}:00`
        return `${p(s.slice(0, -4))}:${p(s.slice(-4, -2))}:${p(s.slice(-2))}`
    }
    return s
}

/** Daftar absensi pada periode (default bulan berjalan). */
export const getAbsensiList = async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1)
        const perPage = Math.min(500, parseInt(req.query.per_page) || 25)
        const offset = (page - 1) * perPage

        const start = req.query.start_date || `${new Date().toISOString().slice(0, 7)}-01`
        const end = req.query.end_date || new Date().toISOString().slice(0, 10)

        let where = ' WHERE a.tanggal BETWEEN ? AND ?'
        let params = [start, end]

        if (req.query.search) {
            where += ' AND (k.kar_Nik LIKE ? OR k.kar_nama LIKE ? OR a.nik LIKE ? OR k.kar_bagian LIKE ?)'
            params = [...params, ...Array(4).fill(`%${req.query.search}%`)]
        }
        if (req.query.status_aktif !== undefined && req.query.status_aktif !== '') {
            where += ' AND k.kar_status_aktif = ?'
            params.push(parseInt(req.query.status_aktif))
        }
        if (req.query.pabrik) {
            where += ' AND k.kar_pab_kode = ?'
            params.push(req.query.pabrik)
        }
        if (req.query.departemen) {
            where += ' AND k.kar_dep_kode = ?'
            params.push(req.query.departemen)
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
        const orderBy = buildOrderBy(req.query, LIST_COLUMNS, 'ORDER BY a.tanggal DESC, k.kar_nama')

        if (req.query.export === 'xlsx') {
            const [all] = await pool.query(`${SELECT_SQL}${where} ${orderBy} LIMIT 50000`, params)
            return sendExcel(res, 'Absensi', Object.keys(LIST_COLUMNS), all)
        }

        const [cnt] = await pool.query(`SELECT COUNT(*) AS total ${FROM_SQL}${where}`, params)
        const total = cnt[0].total

        const [rows] = await pool.query(
            `${SELECT_SQL}${where} ${orderBy} LIMIT ? OFFSET ?`,
            [...params, perPage, offset]
        )

        paginated(res, rows, { page, per_page: perPage, total, last_page: Math.ceil(total / perPage) })
    } catch (err) {
        next(err)
    }
}

/**
 * Satu baris absensi + data karyawan (ufrmAbsensi.loaddataall).
 * `nik` di sini adalah KODE ABSENSI, sama seperti kolom `tabsensi.nik`.
 */
export const getAbsensi = async (req, res, next) => {
    try {
        const nik = req.query.nik || req.params.nik
        const tanggal = req.query.tanggal || new Date().toISOString().slice(0, 10)

        const [rows] = await pool.query(
            `SELECT a.*, k.kar_Nik, k.kar_nama, k.kar_bagian, k.kar_jab_kode, k.kar_pab_kode,
                    j.jab_nama, p.pab_nama
             FROM tabsensi a
             LEFT JOIN tkaryawan k ON k.kar_kode_absensi = a.nik
             LEFT JOIN tjabatan j ON j.jab_kode = k.kar_jab_kode
             LEFT JOIN tpabrik p ON p.pab_kode = k.kar_pab_kode
             WHERE a.nik = ? AND a.tanggal = ?`,
            [String(nik), tanggal]
        )

        if (rows.length === 0) {
            // Tidak ada record -> form dalam mode insert; tetap kirim data karyawan.
            const [krows] = await pool.query(
                `SELECT k.kar_Nik, k.kar_nama, k.kar_bagian, k.kar_jab_kode, k.kar_pab_kode,
                        j.jab_nama, p.pab_nama
                 FROM tkaryawan k
                 LEFT JOIN tjabatan j ON j.jab_kode = k.kar_jab_kode
                 LEFT JOIN tpabrik p ON p.pab_kode = k.kar_pab_kode
                 WHERE k.kar_kode_absensi = ?`,
                [String(nik)]
            )
            const karyawan = krows[0] || null
            return success(res, {
                ada: false,
                nik: String(nik),
                tanggal,
                karyawan,
                defaults: { masuk: '08:00:00', keluar: '16:30:00', scan1: '00:00:00', scan2: '00:00:00' },
            })
        }

        const a = rows[0]
        success(res, {
            ada: true,
            nik: a.nik,
            nikKaryawan: a.kar_Nik,
            nama: a.kar_nama,
            jabatan: a.jab_nama,
            bagian: a.kar_bagian,
            pabrik: a.pab_nama,
            tanggal: a.tanggal,
            masuk: toTime(a.masuk),
            scan1: toTime(a.scan1),
            keluar: toTime(a.keluar),
            scan2: toTime(a.scan2),
            status: a.status,
            verifikasi: a.verifikasi,
            karyawan: { kar_Nik: a.kar_Nik, kar_nama: a.kar_nama, jab_nama: a.jab_nama, pab_nama: a.pab_nama },
        })
    } catch (err) {
        next(err)
    }
}

/** Pencarian karyawan untuk kolom Kode Absensi (ufrmAbsensi.edtNikClickBtn). */
export const lookupKaryawanAbsensi = async (req, res, next) => {
    try {
        const q = String(req.query.search || '').trim()
        const page = Math.max(1, parseInt(req.query.page) || 1)
        const perPage = Math.min(200, parseInt(req.query.per_page) || 20)

        let where = ' WHERE k.kar_kode_absensi IS NOT NULL AND k.kar_kode_absensi <> 0'
        const params = []
        if (q) {
            where += ' AND (k.kar_kode_absensi LIKE ? OR k.kar_Nik LIKE ? OR k.kar_nama LIKE ?)'
            params.push(`%${q}%`, `%${q}%`, `%${q}%`)
        }
        if (req.query.aktif !== '0') where += ' AND k.kar_status_aktif = 1'
        if (req.query.pabrik) {
            where += ' AND k.kar_pab_kode = ?'
            params.push(req.query.pabrik)
        }

        const [rows] = await pool.query(
            `SELECT k.kar_kode_absensi AS KodeAbsensi, k.kar_nama AS Nama, k.kar_tgllahir AS TglLahir,
                    IF(k.kar_jenkel = 1, 'Laki-Laki', 'Perempuan') AS Jenkel,
                    k.kar_tgl_masuk AS TglMasuk, j.jab_nama AS Jabatan, k.kar_bagian AS Bagian,
                    IF(k.kar_status_aktif = 1, 'Aktif', 'Non Aktif') AS Status, k.kar_alamat AS Alamat,
                    k.kar_pab_kode AS Pabrik
             FROM tkaryawan k
             LEFT JOIN tjabatan j ON j.jab_kode = k.kar_jab_kode
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

/**
 * Berapa hari "usia" tanggal tersebut (DATEDIFF(NOW(), tanggal)).
 * < 2 -> boleh diubah tanpa otorisasi (ufrmAbsensi: `cektanggal(...) < 2`).
 */
export function selisihHari(tanggal) {
    const d = new Date(tanggal)
    if (isNaN(d.getTime())) return 0
    const now = new Date()
    const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
    const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
    return Math.round((b - a) / 86400000)
}

/**
 * Jejak otorisasi. Skema ini sudah ada di database produksi (dipakai modul lain
 * seperti Ijin dengan nomor dokumen `IJN.202609.2041`), jadi DDL di bawah hanya
 * berlaku untuk database yang belum pernah punya tabel ini.
 */
async function ensureOtorisasiTable() {
    await pool.query(`CREATE TABLE IF NOT EXISTS tlistotorisasi (
        tanggal DATE DEFAULT NULL,
        nomor VARCHAR(40) DEFAULT NULL,
        USER VARCHAR(30) DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=latin1`)
}

/**
 * Verifikasi user pembimbing (pengganti dialog `UfrmOtorisasi` versi Delphi,
 * yang memakai rumus Statis `user*21+53*4 = password`; di sini password dicek
 * sungguhan ke tabel `tuser` supaya jejaknya benar-benar bisa diaudit).
 *
* Berhasilnya pengecekan tidak cukup: server menitik token berumur pendek
 * yang ditandatangani JWT. Token inilah yang wajib dikirimkan lagi saat menyimpan,
 * sehingga `otorisasi: true` dari klien tidak bisa dipalsukan.
 */
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

        const token = jwt.sign({ otorisasi: kode, tipe: 'absensi' }, process.env.JWT_SECRET, {
            expiresIn: process.env.OTORISASI_EXPIRES_IN || '10m',
        })
        success(res, { user_kode: kode, token }, 'Otorisasi diterima')
    } catch (err) {
        next(err)
    }
}

/** Baca kode user dari token otorisasi; null bila tidak ada / tidak sah / kedaluwarsa. */
function userDariToken(token) {
    if (!token) return null
    try {
        const t = jwt.verify(String(token), process.env.JWT_SECRET)
        return t?.tipe === 'absensi' && t?.otorisasi ? t.otorisasi : null
    } catch {
        return null
    }
}

/**
 * Simpan satu baris absensi (ufrmAbsensi.simpandata) — insert bila baru.
 *
 * CATATAN PENTING: `tabsensi` punya trigger BEFORE INSERT & BEFORE UPDATE yang
 * menimpa `masuk`, `keluar`, dan `status` berdasarkan jadwal karyawan
 * (`tkaryawanjadwal` + `tjadwal`). Jadi nilai yang dikirim form untuk tiga kolom
 * itu hanya indicada; hasil sebenarnya dibaca ulang dari tabel dan dikembalikan
 * ke klien.
 */
export const saveAbsensi = async (req, res, next) => {
    try {
        const b = req.body || {}
        const nik = String(b.nik ?? '').trim()
        const tanggal = String(b.tanggal ?? '').slice(0, 10)

        if (!nik) return error(res, 'Kode absensi wajib diisi', 400)
        if (!tanggal) return error(res, 'Tanggal wajib diisi', 400)

        const [krows] = await pool.query('SELECT kar_nama FROM tkaryawan WHERE kar_kode_absensi = ?', [nik])
        if (krows.length === 0) return error(res, `Kode absensi ${nik} tidak ada pada master karyawan`, 400)

        // Pengubahan data lebih lama dari 2 hari perlu otorisasi user lain (cektanggal di Delphi).
        let atasan = null
        if (selisihHari(tanggal) >= 2) {
            atasan = userDariToken(b.otorisasi_token)
            if (!atasan) {
                return error(res, 'Data lebih dari 2 hari lama memerlukan otorisasi atasan', 403)
            }
        }

        const values = {
            nik,
            tanggal,
            masuk: normJam(b.masuk ?? '08:00:00'),
            scan1: normJam(b.scan1 ?? '00:00:00'),
            keluar: normJam(b.keluar ?? '16:30:00'),
            scan2: normJam(b.scan2 ?? '00:00:00'),
            status: parseInt(b.status, 10) || 0,
            verifikasi: parseInt(b.verifikasi, 10) || 0,
        }

        await pool.query(
            `INSERT INTO tabsensi (nik, tanggal, masuk, scan1, keluar, scan2, status, verifikasi)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE masuk = VALUES(masuk), scan1 = VALUES(scan1),
                keluar = VALUES(keluar), scan2 = VALUES(scan2),
                status = VALUES(status), verifikasi = VALUES(verifikasi)`,
            [values.nik, values.tanggal, values.masuk, values.scan1, values.keluar, values.scan2, values.status, values.verifikasi]
        )

        if (atasan) {
            await ensureOtorisasiTable()
            await pool.query('INSERT INTO tlistotorisasi (tanggal, nomor, user) VALUES (NOW(), ?, ?)', [
                `${b.otorisasi_nomor || nik}#${tanggal.replace(/-/g, '')}`,
                atasan,
            ])
        }

        // Baca ulang: trigger database sudah menentukan masuk/keluar/status akhir.
        const [saved] = await pool.query('SELECT * FROM tabsensi WHERE nik = ? AND tanggal = ?', [nik, tanggal])
        const row = saved[0] || {}
        const hasil = {
            ...values,
            masuk: toTime(row.masuk) || values.masuk,
            keluar: toTime(row.keluar) || values.keluar,
            status: row.status ?? values.status,
            date_create: row.date_create,
            date_modify: row.date_modify,
        }
        success(
            res,
            { ...hasil, otorisasi_by: atasan || null },
            atasan ? `Absensi berhasil disimpan (disetujui oleh ${atasan})` : 'Absensi berhasil disimpan'
        )
    } catch (err) {
        next(err)
    }
}

/** Hapus satu baris (ufrmBrowseAbsensi.cxButton4Click). */
export const deleteAbsensi = async (req, res, next) => {
    try {
        const nik = String(req.query.nik ?? req.params.nik ?? '')
        const tanggal = String(req.query.tanggal ?? '').slice(0, 10)
        if (!nik || !tanggal) return error(res, 'Kode absensi dan tanggal wajib diisi', 400)
        await pool.query('DELETE FROM tabsensi WHERE nik = ? AND tanggal = ?', [nik, tanggal])
        success(res, null, 'Absensi berhasil dihapus')
    } catch (err) {
        next(err)
    }
}

/* ── Import Absensi ───────────────────────────────────────────────────── */

/** Daftar pabrik aktif + folder mesin absensi (ufrmImportAbsensi.loadpabrik). */
export const getPabrikMesin = async (req, res, next) => {
    try {
        const [rows] = await pool.query(
            `SELECT p.pab_kode AS Kode, p.pab_nama AS Nama, p.pab_path AS Path
             FROM tpabrik p WHERE p.pab_status = 1 ORDER BY p.pab_kode`
        )
        success(res, rows)
    } catch (err) {
        next(err)
    }
}

/** Jumlah data staging per pabrik & tanggal (tabel `tabsensi2`). */
export const getStaging = async (req, res, next) => {
    try {
        const start = req.query.start_date || ''
        const end = req.query.end_date || ''
        let where = ' WHERE 1 = 1'
        const params = []
        if (start) {
            where += ' AND tanggal BETWEEN ? AND ?'
            params.push(start, end || start)
        }
        const [rows] = await pool.query(
            `SELECT COUNT(*) AS jml, COUNT(DISTINCT nik) AS karyawan, MIN(tanggal) AS dari, MAX(tanggal) AS sampai
             FROM tabsensi2${where}`,
            params
        )
        const [perHari] = await pool.query(
            `SELECT tanggal, COUNT(*) AS jml FROM tabsensi2${where} GROUP BY tanggal ORDER BY tanggal DESC LIMIT 60`,
            params
        )
        success(res, { ringkasan: rows[0], perHari })
    } catch (err) {
        next(err)
    }
}

/**
 * Baca satu baris hasil ekspor mesin absensi memakai peta header, mis.
 *   NIK / kode / userid  |  tanggal / tgl / date  |  scan / checktime  |  tipe / type
 * Bila berkas tanpa baris header, dipakai urutan tetap 4 kolom
 * (nik, tanggal, jam, tipe) yang sama dengan tabel `checkinout`.
 *
 * Isi kolom NIK disimpan apa adanya ke `tabsensi2.nik`, yang berisi `kar_Nik`.
 */
function parseBaris(values, path, header) {
    let nik, tgl, jam, tipe

    if (header) {
        const idx = (nama) => {
            const n = nama.find((x) => header[x] !== undefined)
            return n === undefined ? undefined : header[n]
        }
        const iNik = idx(HEADER_NIK)
        if (iNik === undefined) return null
        nik = values[iNik]
        tgl = at(values, idx(HEADER_TANGGAL))
        jam = at(values, idx(HEADER_JAM))
        tipe = at(values, idx(HEADER_TIPE))
    } else {
        ;[nik, tgl, jam, tipe] = [values[0], values[1], values[2], values[3]]
    }

    if (nik === undefined || nik === null || String(nik).trim() === '') return null

    const t = String(tipe ?? '').trim().toUpperCase()
    return {
        nik: String(nik).trim(),
        tanggal: normTanggal(tgl),
        jam: normJam(jamExcelKeTeks(jam)),
        keluar: t === 'O' || t === 'OUT' || t === 'KELUAR',
        path: path || '',
    }
}

const at = (values, i) => (i === undefined ? undefined : values[i])

/** Terima tanggal Excel (nomor seri), "YYYY-MM-DD", "DD/MM/YYYY", atau Date. */
function normTanggal(v) {
    if (v === null || v === undefined || v === '') return null
    if (v instanceof Date) return v.toISOString().slice(0, 10)
    if (typeof v === 'number' && v > 20000 && v < 60000) {
        // nomor seri Excel (basis 1899-12-30)
        const ms = Math.round((v - 25569) * 86400 * 1000)
        return new Date(ms).toISOString().slice(0, 10)
    }
    const s = String(v).trim()
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s)
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
    m = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/.exec(s)
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
    m = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2})$/.exec(s)
    if (m) return `20${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
    return null
}

/**
 * Tahap 1: unggah hasil ekspor mesin absensi -> `tabsensi2` (staging).
 * Baris "I"/tipe kosong mengambil MIN scan1; "O" mengambil MAX scan2.
 * Upsert membandingkan staging lama juga; jam kosong tidak mengganti jam valid.
 *
 * `tabsensi2` berengine MyISAM sehingga TIDAK mendukung transaksi: `rollback()`
 * tidak akan membatalkan apa pun. Karena itu setiap baris dicoba sendiri dan
 * kegagalan dikumpulkan, bukan menggagalkan seluruh berkas.
 */
export const importStaging = async (req, res, next) => {
    try {
        if (!req.file) return error(res, 'Berkas Excel/CSV belum diunggah', 400)
        const path = String((req.body ?? {}).path ?? '').trim()
        const mulai = normTanggal((req.body ?? {}).start_date)
        const selesai = normTanggal((req.body ?? {}).end_date)

        const namaBerkas = String(req.file.originalname ?? req.file.originalName ?? '')

        let semua
        try {
            semua = await bacaBerkasAbsensi(req.file.buffer, namaBerkas)
        } catch (err) {
            return error(res, `Berkas tidak dapat dibaca: ${err.message}`, 400)
        }
        if (semua.length === 0) return error(res, 'Berkas tidak memuat data sama sekali', 400)

        const hasil = []
        for (const { values, header } of semua) {
            const b = parseBaris(values, path, header)
            if (!b || !b.tanggal) continue
            if (mulai && b.tanggal < mulai) continue
            if (selesai && b.tanggal > selesai) continue
            hasil.push(b)
        }

        if (hasil.length === 0) {
            return error(res, 'Tidak ada baris valid pada berkas. Pastikan kolom memuat NIK karyawan, tanggal, dan jam scan.', 400)
        }

        let gagal = 0
        let contohGagal = ''
        for (const b of hasil) {
            try {
                await simpanScanStaging(pool, b)
            } catch (e) {
                gagal += 1
                if (!contohGagal) contohGagal = e.message
            }
        }

        const ok = hasil.length - gagal
        if (ok === 0) return error(res, `Semua baris gagal disimpan: ${contohGagal}`, 500)
        success(
            res,
            { jumlah: ok, gagal, dari: namaBerkas },
            `${ok} baris masuk ke data staging${gagal ? `, ${gagal} baris gagal: ${contohGagal}` : ''}`
        )
    } catch (err) {
        next(err)
    }
}

/**
 * Ambil baris staging satu tanggal/periode yang siap disalin ke `tabsensi`.
 *
 * PENTING: `tabsensi2.nik` berisi `kar_Nik` (16 digit NIK karyawan), BUKAN
 * `kar_kode_absensi`. Yang disimpan ke `tabsensi.nik` adalah kode absensi,
 * jadi harus lewat join ke `tkaryawan`.
 *
 * `kar_kode_absensi` ternyata tidak unik di master (ada kode yang dipakai lebih
 * dari satu karyawan, dan 32 baris bernilai kosong), sedangkan primary key
 * `tabsensi` adalah (nik, tanggal). Karena itu baris digabung per
 * kode+tanggal agar tidak bentrok.
 */
async function ambilStagingUntukProses(dari, sampai) {
    const [baris] = await pool.query(
        `SELECT s.nik, s.tanggal, s.scan1, s.scan2, k.kar_kode_absensi AS kode, k.kar_nama AS nama
         FROM tabsensi2 s
         INNER JOIN tkaryawan k ON k.kar_Nik = s.nik
         WHERE s.tanggal BETWEEN ? AND ?
           AND k.kar_kode_absensi IS NOT NULL AND k.kar_kode_absensi <> ''
         ORDER BY s.tanggal, s.nik`,
        [dari, sampai]
    )

    const peta = new Map()
    for (const r of baris) {
        const kunci = `${r.kode}|${r.tanggal}`
        if (!peta.has(kunci)) peta.set(kunci, r)
    }
    return [...peta.values()]
}

/**
 * Tahap 2: salin `tabsensi2` -> `tabsensi` untuk periode terpilih, lalu isi
 * baris kosong bagi karyawan aktif yang tidak punya scan (ufrmImportAbsensi
 * cxButton2Click). Baris `tabsensi` lama dihapus lebih dulu per nik+tanggal.
 *
 * Catatan: `tabsensi` MyISAM (tidak transaksional). Kegagalan di tengah jalan
 * dilaporkan lewat `gagal` beserta contoh pesannya, bukan di-rollback.
 */
export const prosesTabsensi = async (req, res, next) => {
    try {
        const body = req.body ?? {}
        const q = req.query ?? {}
        const start = normTanggal(body.start_date ?? q.start_date)
        const end = normTanggal(body.end_date ?? q.end_date)
        if (!start || !end) return error(res, 'Periode (tanggal awal & akhir) wajib diisi', 400)
        if (end < start) return error(res, 'Tanggal akhir harus lebih besar dari tanggal awal', 400)

        // 1. salin dari staging
        const sumber = await ambilStagingUntukProses(start, end)

        let tersalin = 0
        let gagal = 0
        let contohGagal = ''
        for (const r of sumber) {
            try {
                await pool.query('DELETE FROM tabsensi WHERE nik = ? AND tanggal = ?', [r.kode, r.tanggal])
                await pool.query(`INSERT INTO tabsensi (nik, tanggal, scan1, scan2) VALUES (?, ?, ?, ?)`, [
                    r.kode,
                    r.tanggal,
                    toTime(r.scan1) || '00:00:00',
                    toTime(r.scan2) || '00:00:00',
                ])
                tersalin += 1
            } catch (e) {
                gagal += 1
                if (!contohGagal) contohGagal = `${r.kode}/${r.tanggal}: ${e.message}`
            }
        }

        // 2. karyawan aktif tanpa scan pada tiap tanggal dalam periode
        let diisi = 0
        let d = new Date(start)
        const dEnd = new Date(end)
        while (d <= dEnd) {
            const tgl = d.toISOString().slice(0, 10)
            try {
                const [r] = await pool.query(
                    `INSERT IGNORE INTO tabsensi (nik, tanggal, masuk, scan1, keluar, scan2, status, verifikasi)
                     SELECT k.kar_kode_absensi, ?, '00:00:00', '00:00:00', '00:00:00', '00:00:00', 0, 0
                     FROM tkaryawan k
                     LEFT JOIN tabsensi a ON a.nik = k.kar_kode_absensi AND a.tanggal = ?
                     WHERE k.kar_status_aktif = 1 AND a.nik IS NULL
                       AND k.kar_kode_absensi IS NOT NULL AND k.kar_kode_absensi <> ''`,
                    [tgl, tgl]
                )
                diisi += r.affectedRows
            } catch (e) {
                gagal += 1
                if (!contohGagal) contohGagal = `isi kosong ${tgl}: ${e.message}`
            }
            d.setDate(d.getDate() + 1)
        }

        success(
            res,
            { tersalin, diisi, gagal, total: tersalin + diisi, dari: start, sampai: end, contoh_gagal: contohGagal || null },
            `Proses selesai: ${tersalin} baris disalin, ${diisi} baris kosong untuk karyawan tanpa scan` +
                (gagal ? `, ${gagal} baris bermasalah (${contohGagal})` : '')
        )
    } catch (err) {
        next(err)
    }
}

/** Salin staging -> tabsensi untuk satu tanggal (tombol cepat di Delphi). */
export const prosesTanggal = async (req, res, next) => {
    try {
        const tanggal = normTanggal((req.body ?? {}).tanggal ?? (req.query ?? {}).tanggal)
        if (!tanggal) return error(res, 'Tanggal wajib diisi', 400)

        const sumber = await ambilStagingUntukProses(tanggal, tanggal)
        let tersalin = 0
        let gagal = 0
        for (const r of sumber) {
            try {
                await pool.query('DELETE FROM tabsensi WHERE nik = ? AND tanggal = ?', [r.kode, r.tanggal])
                await pool.query(`INSERT INTO tabsensi (nik, tanggal, scan1, scan2) VALUES (?, ?, ?, ?)`, [
                    r.kode,
                    r.tanggal,
                    toTime(r.scan1) || '00:00:00',
                    toTime(r.scan2) || '00:00:00',
                ])
                tersalin += 1
            } catch {
                gagal += 1
            }
        }
        success(
            res,
            { tanggal, tersalin, gagal },
            `Tanggal ${tanggal} diproses (${tersalin} baris${gagal ? `, ${gagal} gagal` : ''})`
        )
    } catch (err) {
        next(err)
    }
}

/** Bersihkan staging dalam periode (membantu saat impor salah periode). */
export const bersihkanStaging = async (req, res, next) => {
    try {
        const body = req.body ?? {}
        const q = req.query ?? {}
        const start = normTanggal(body.start_date ?? q.start_date)
        const end = normTanggal(body.end_date ?? q.end_date) || start
        if (!start) return error(res, 'Tanggal wajib diisi', 400)
        const [r] = await pool.query('DELETE FROM tabsensi2 WHERE tanggal BETWEEN ? AND ?', [start, end])
        success(res, { jumlah: r.affectedRows }, `${r.affectedRows} baris staging dihapus`)
    } catch (err) {
        next(err)
    }
}
