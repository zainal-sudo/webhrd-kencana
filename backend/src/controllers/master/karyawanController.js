import pool from '../../config/database.js'
import { success, error, paginated } from '../../helpers/response.js'
import { buildOrderBy, applyAllColumnFilters } from '../../helpers/browse.js'
import { nomorNik, nomorKodeAbsensi } from '../../helpers/nomor.js'
import { sendExcel } from '../../helpers/excel.js'
import { HISTORY_CTE, HISTORY_COLUMNS, HISTORY_KEYS, HISTORY_FILTER_OPTIONS, normalizeHistoryRows } from '../../helpers/historyKaryawan.js'

/** Nama advisory lock MySQL untuk jalur simpan Karyawan (MyISAM tanpa transaksi). */
const KUNCI_IDENTITAS = 'hrd_karyawan_simpan_identitas'

/**
 * Master Karyawan — cerminan unit Delphi `ufrmKaryawan` + `ufrmBrowseKaryawan`.
 *
 * Tabel: tkaryawan (utama) dan tabel anak:
 *   tkaryawananak, tkaryawandidik, tkaryawanpengalaman, tkaryawankeahlian,
 *   tkaryawanjadwal, tpkwt
 */

const LIST_COLUMNS = {
    Nik: 'k.kar_Nik',
    Nama: 'k.kar_nama',
    Kd_Abs: 'k.kar_kode_absensi',
    Pabrik: 'k.kar_pab_kode',
    'Nama Pabrik': 'p.pab_nama',
    Sistem: 'k.kar_sistem_gaji',
    TglLahir: 'k.kar_tgllahir',
    JenisKelamin: `IF(k.kar_jenkel = 1, 'Laki-Laki', 'Perempuan')`,
    TglMasuk: 'k.kar_tgl_masuk',
    TglKeluar: 'k.kar_tgl_keluar',
    Size: 'k.kar_size',
    IbuKandung: 'k.kar_ibukandung',
    Email: 'k.kar_email',
    StatusBPJS: `CASE k.kar_status_BPJS
        WHEN 1 THEN 'Perusahaan' WHEN 2 THEN 'Mandiri' WHEN 3 THEN 'Jamkesmas'
        WHEN 4 THEN 'Perusahaan Lain' WHEN 5 THEN 'NonAktif Perusahaan' ELSE 'Belum Ada' END`,
    NoBPJS: 'k.kar_no_bpjs',
    NoNaker: 'k.kar_no_NAKER',
    MasaKerja: 'FLOOR(DATEDIFF(CURDATE(), k.kar_tgl_masuk) / 365)',
    Jabatan: 'j.jab_nama',
    Bagian: 'k.kar_bagian',
    Departemen: 'd.dep_nama',
    'Status Karyawan': 's.sk_keterangan',
    Status: `IF(k.kar_status_aktif = 1, 'Aktif', 'Non Aktif')`,
    Alamat: 'k.kar_alamat',
    Telp: 'k.kar_notelp',
    Identitas: 'k.kar_noidentitas',
    RekeningBank: 'k.kar_rekeningbank',
    PendidikanTerakhir: 'k.kar_pendidikanterakhir',
    Jurusan: 'k.kar_jurusan',
    PKWT1: 'k.kar_tglPKWT1',
    PKWT2: 'k.kar_tglPKWT2',
}

// Semantic types of the SELECT projection, shared by every Karyawan filter path.
const NON_STRING_FILTER_COLUMNS = new Set(['MasaKerja', 'TglLahir', 'TglMasuk', 'TglKeluar', 'PKWT1', 'PKWT2'])
const FILTER_OPTIONS = {
    stringColumns: new Set(Object.keys(LIST_COLUMNS).filter(alias => !NON_STRING_FILTER_COLUMNS.has(alias))),
    numberColumns: new Set(['MasaKerja']),
}

// Display labels only: keep SQL aliases/API filter keys compatible.
const EXPORT_LABELS = {
    Kd_Abs: 'Kode Absensi', Sistem: 'Sistem Gaji', TglLahir: 'Tgl Lahir',
    JenisKelamin: 'Jenis Kelamin', TglMasuk: 'Tgl Masuk', TglKeluar: 'Tgl Keluar',
    IbuKandung: 'Ibu Kandung', StatusBPJS: 'Status BPJS', NoBPJS: 'BPJS KES',
    NoNaker: 'BPJS TK', MasaKerja: 'Masa Kerja', PendidikanTerakhir: 'Pendidikan Terakhir',
}
const EXPORT_TEXT_KEYS = new Set(['Nik', 'Kd_Abs', 'NoBPJS', 'NoNaker', 'Telp', 'Identitas', 'RekeningBank'])

const FROM_SQL = `FROM tkaryawan k
    LEFT JOIN tjabatan j ON j.jab_kode = k.kar_jab_kode
    LEFT JOIN tdepartemen d ON d.dep_kode = k.kar_dep_kode
    LEFT JOIN tpabrik p ON p.pab_kode = k.kar_pab_kode
    LEFT JOIN tstatuskaryawan s ON s.sk_id = k.kar_status_kerja`

const SELECT_SQL = `SELECT ${Object.entries(LIST_COLUMNS)
    .map(([alias, expr]) => `${expr} AS \`${alias}\``)
    .join(', ')} ${FROM_SQL}`

export const getKaryawanList = async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1)
        const perPage = Math.min(500, parseInt(req.query.per_page) || 25)
        const offset = (page - 1) * perPage

        // Helper filter menambahkan AND; awali WHERE agar predicate tidak masuk ke JOIN.
        let where = ' WHERE 1 = 1'
        let params = []

        if (req.query.search) {
            where += ` AND (k.kar_Nik LIKE ? OR k.kar_nama LIKE ? OR k.kar_bagian LIKE ? OR k.kar_kode_absensi LIKE ?)`
            params = ['%s', '%s', '%s', '%s'].map(() => `%${req.query.search}%`)
        }
        if (req.query.status_aktif !== undefined && req.query.status_aktif !== '') {
            where += `${where ? ' AND' : ' WHERE'} k.kar_status_aktif = ?`
            params.push(parseInt(req.query.status_aktif))
        }
        if (req.query.pabrik) {
            where += `${where ? ' AND' : ' WHERE'} k.kar_pab_kode = ?`
            params.push(req.query.pabrik)
        }
        if (req.query.departemen) {
            where += `${where ? ' AND' : ' WHERE'} k.kar_dep_kode = ?`
            params.push(req.query.departemen)
        }

        if (req.query.distinct && LIST_COLUMNS[req.query.distinct]) {
            const dcol = LIST_COLUMNS[req.query.distinct]
            // PAD SPACE collations can collapse '' and ' '; keep their lengths distinct.
            const scoped = applyAllColumnFilters(where, params, req.query, LIST_COLUMNS, req.query.distinct, FILTER_OPTIONS)
            const [drows] = await pool.query(
                `SELECT DISTINCT ${dcol} AS value, OCTET_LENGTH(${dcol}) AS value_length ${FROM_SQL}${scoped.clause} ORDER BY value`,
                scoped.params
            )
            return success(res, drows.map((r) => r.value))
        }

        const f = applyAllColumnFilters(where, params, req.query, LIST_COLUMNS, null, FILTER_OPTIONS)
        where = f.clause
        params = f.params
        const orderBy = buildOrderBy(req.query, LIST_COLUMNS, 'ORDER BY k.kar_Nik')

        if (req.query.export === 'xlsx') {
            const [all] = await pool.query(`${SELECT_SQL}${where} ${orderBy} LIMIT 50000`, params)
            const keys = Object.keys(LIST_COLUMNS)
            const headers = keys.map(key => EXPORT_LABELS[key] || key)
            const rows = all.map(row => Object.fromEntries(keys.map((key, index) => [headers[index],
                row[key] != null && EXPORT_TEXT_KEYS.has(key) ? String(row[key]) : row[key],
            ])))
            return sendExcel(res, 'Karyawan', headers, rows, { requestedColumns: req.query.columns })
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

/** Lookup ringkas untuk form transaksi (dipakai KaryawanLookup.vue). */
export const lookupKaryawan = async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1)
        const perPage = Math.min(200, parseInt(req.query.per_page) || 20)
        const offset = (page - 1) * perPage
        const q = req.query.search || ''

        let where = ''
        const params = []
        if (q) {
            where = ' WHERE (k.kar_Nik LIKE ? OR k.kar_nama LIKE ? OR k.kar_bagian LIKE ? OR k.kar_kode_absensi LIKE ?)'
            params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`)
        }
        if (req.query.aktif !== '0') {
            where += `${where ? ' AND' : ' WHERE'} k.kar_status_aktif = 1`
        }
        if (req.query.pabrik) {
            where += `${where ? ' AND' : ' WHERE'} k.kar_pab_kode = ?`
            params.push(req.query.pabrik)
        }

        const [rows] = await pool.query(
            `SELECT k.kar_Nik AS Nik, k.kar_nama AS Nama, k.kar_kode_absensi AS KodeAbsensi,
                    k.kar_bagian AS Bagian, k.kar_pab_kode AS Pabrik, j.jab_nama AS Jabatan,
                    k.kar_status_aktif AS Aktif, k.kar_tgl_masuk AS TglMasuk,
                    k.kar_jab_kode AS JabKode, k.kar_dep_kode AS DepKode
             FROM tkaryawan k
             LEFT JOIN tjabatan j ON j.jab_kode = k.kar_jab_kode
             ${where} ORDER BY k.kar_nama LIMIT ? OFFSET ?`,
            [...params, perPage, offset]
        )
        const [cnt] = await pool.query(`SELECT COUNT(*) AS c FROM tkaryawan k ${where}`, params)
        paginated(res, rows, { page, per_page: perPage, total: cnt[0].c, last_page: Math.ceil(cnt[0].c / perPage) })
    } catch (err) {
        next(err)
    }
}

/** Pelamar Diterima (rkt_status = 1) untuk tombol ambil data rekruitmen
 *  di form Tambah Karyawan (edtRekrutmenClickBtn Delphi).
 *  No rekruitmen TIDAK disimpan ke master — murni penarik biodata. */
export const lookupRekrutmen = async (req, res, next) => {
    try {
        const q = String(req.query.search || '').trim()
        const params = []
        let where = ' WHERE rkt_status = 1'
        if (q) {
            where += ' AND (rkt_nomor LIKE ? OR rkt_nama LIKE ? OR rkt_posisi LIKE ? OR rkt_alamat LIKE ?)'
            params.push(...Array(4).fill(`%${q}%`))
        }
        const [rows] = await pool.query(
            `SELECT rkt_nomor AS Nomor, rkt_tanggal AS Tanggal, rkt_nama AS Nama,
                    IF(rkt_jenkel=1,'Laki-Laki','Perempuan') AS Jenis_Kelamin,
                    rkt_alamat AS Alamat, rkt_jenkel, rkt_tempatlahir, rkt_tgllahir,
                    rkt_telp, rkt_identitas, rkt_ibukandung, rkt_email, rkt_agama,
                    rkt_status_kawin, rkt_gol_darah, rkt_status_tinggal,
                    rkt_pendidikanterakhir, rkt_jurusan, rkt_size, rkt_posisi
             FROM trekruitmen${where} ORDER BY rkt_tanggal DESC, rkt_nomor DESC LIMIT 200`,
            params
        )
        success(res, rows)
    } catch (err) { next(err) }
}

/** Detail karyawan + seluruh tabel anak. */
export const getKaryawan = async (req, res, next) => {
    try {
        const nik = req.params.nik
        const [rows] = await pool.query(
            `SELECT k.*, j.jab_nama, d.dep_nama, p.pab_nama, s.sk_keterangan,
                    (SELECT GROUP_CONCAT(jd_nama_shift ORDER BY jd_id SEPARATOR ', ')
                     FROM tkaryawanjadwal kj JOIN tjadwal jd ON jd.jd_id = kj.karj_jd_id
                     WHERE kj.karj_nik = k.kar_Nik) AS daftar_jadwal
             FROM tkaryawan k
             LEFT JOIN tjabatan j ON j.jab_kode = k.kar_jab_kode
             LEFT JOIN tdepartemen d ON d.dep_kode = k.kar_dep_kode
             LEFT JOIN tpabrik p ON p.pab_kode = k.kar_pab_kode
             LEFT JOIN tstatuskaryawan s ON s.sk_id = k.kar_status_kerja
             WHERE k.kar_Nik = ?`,
            [nik]
        )
        if (rows.length === 0) return error(res, 'Karyawan tidak ditemukan', 404)
        const k = rows[0]
        delete k.kar_foto
        k.punya_foto = false

        const [[anak], [didik], [peng], [keah], [jadwal], [pkwt]] = await Promise.all([
            pool.query('SELECT kara_nama_anak, kara_noidentitas, kara_anak_ke, kara_tgllahir, kara_ket_kerja FROM tkaryawananak WHERE kara_kar_nik = ?', [nik]),
            pool.query('SELECT kard_jenjang, kard_nama, kard_jurusan, kard_fakultas, kard_ijazah, kard_tahunmasuk, kard_tahunlulus, kard_catatan FROM tkaryawandidik WHERE kard_kar_nik = ?', [nik]),
            pool.query('SELECT karp_namaperusahaan, karp_bidangusaha, karp_kota, karp_tglmasuk, karp_tglkeluar, karp_jabatanterakhir FROM tkaryawanpengalaman WHERE karp_kar_nik = ?', [nik]),
            pool.query('SELECT kark_namakeahlian, kark_keterangan FROM tkaryawankeahlian WHERE kark_kar_nik = ?', [nik]),
            pool.query('SELECT karj_jd_id AS JdId, jd_nama_shift AS NamaShift, jd_jamawal AS JamAwal, jd_jamakhir AS JamAkhir FROM tkaryawanjadwal kj JOIN tjadwal jd ON jd.jd_id = kj.karj_jd_id WHERE kj.karj_nik = ?', [nik]),
            pool.query('SELECT sk_id AS SkId, tgl1, tgl2 FROM tpkwt WHERE kar_nik = ? ORDER BY sk_id', [nik]),
        ])

        success(res, {
            karyawan: k,
            anak,
            pendidikan: didik,
            pengalaman: peng,
            keahlian: keah,
            jadwal,
            pkwt,
        })
    } catch (err) {
        next(err)
    }
}

/** Hanya foto (blob) — endpoint terpisah supaya list tetap ringan. */
export const getFotoKaryawan = async (req, res, next) => {
    try {
        const [rows] = await pool.query('SELECT kar_foto FROM tkaryawan WHERE kar_Nik = ?', [req.params.nik])
        if (rows.length === 0 || !rows[0].kar_foto) return error(res, 'Foto tidak ditemukan', 404)
        res.setHeader('Content-Type', 'image/jpeg')
        res.send(rows[0].kar_foto)
    } catch (err) {
        next(err)
    }
}

const FORM_COLUMNS = [
    'kar_nama', 'kar_status_aktif', 'kar_tempatlahir', 'kar_kode_absensi', 'kar_tgllahir',
    'kar_jenkel', 'kar_status_kawin', 'kar_warganegara', 'kar_gol_darah', 'kar_alamat',
    'kar_agama', 'kar_status_tinggal', 'kar_notelp', 'kar_noidentitas', 'kar_rekeningbank',
    'kar_pab_kode', 'kar_dep_kode', 'kar_jab_kode', 'kar_golongan', 'kar_status_kerja',
    'kar_tglPKWT1', 'kar_tglPKWT2', 'kar_bagian', 'kar_nik_atasan', 'kar_tgl_masuk',
    'kar_sistem_gaji', 'kar_status_BPJS', 'kar_no_BPJS', 'kar_no_NAKER', 'kar_namapasangan',
    'kar_ibukandung', 'kar_email', 'kar_hubungan', 'kar_status_hidup', 'kar_tgllahir2',
    'kar_alamat2', 'kar_pk_id', 'kar_keterangan_kerja', 'kar_telp2', 'kar_pendidikanterakhir',
    'kar_jurusan', 'kar_size',
]

const num = (v) => (v === '' || v === undefined || v === null ? 0 : parseInt(v, 10) || 0)

/** Peta nama kolom DB (MySQL case-insensitive) agar key body cocok. */
const KOLOM_KANONIK = new Map(FORM_COLUMNS.map((c) => [c.toLowerCase(), c]))

/**
 * Samakan huruf besar/kecil key body dengan nama kolom tabel.
 * Tanpa ini key `kar_status_BPJS` dari form tidak dibaca `kar_status_bpjs`,
 * sehingga `num(undefined)` menyimpan 0 dan status BPJS hilang saat edit.
 */
const kanonik = (body) => {
    const out = { ...body }
    for (const [k, v] of Object.entries(body)) {
        const col = KOLOM_KANONIK.get(k.toLowerCase())
        if (col && col !== k) out[col] = v
    }
    return out
}

/* Kolom tabel anak yang boleh ditulis dari form (tanpa kolom foreign key —
   kolom itu diisi backend dari NIK induk). */
const ANAK_COLS = ['kara_nama_anak', 'kara_noidentitas', 'kara_anak_ke', 'kara_tgllahir', 'kara_ket_kerja']
const DIDIK_COLS = [
    'kard_jenjang', 'kard_nama', 'kard_jurusan', 'kard_fakultas', 'kard_ijazah',
    'kard_tahunmasuk', 'kard_tahunlulus', 'kard_catatan',
]
const PENGALAMAN_COLS = [
    'karp_namaperusahaan', 'karp_bidangusaha', 'karp_kota', 'karp_tglmasuk',
    'karp_tglkeluar', 'karp_jabatanterakhir',
]
const KEAHLIAN_COLS = ['kark_namakeahlian', 'kark_keterangan']

export const generateNik = async (req, res, next) => {
    try {
        const pabKode = req.body?.pab_kode || req.query.pab_kode
        if (!pabKode) return error(res, 'Kode pabrik wajib diisi', 400)
        success(res, {
            kar_Nik: await nomorNik(pabKode, req.body?.tanggal),
            kar_kode_absensi: await nomorKodeAbsensi(),
        })
    } catch (err) {
        next(err)
    }
}

/** Exact full-value identity check; suffixes are meaningful and stored data is untouched. */
async function cariDuplikatIdentitas(conn, noidentitas, excludeNik = '') {
    const nilai = String(noidentitas ?? '').trim()
    if (!nilai) return []
    const kecuali = excludeNik ? ' AND kar_Nik <> ?' : ''
    const [rows] = await conn.query(
        `SELECT kar_Nik, kar_nama, kar_status_aktif, kar_tgl_masuk, kar_tgl_keluar
         FROM tkaryawan WHERE BINARY TRIM(kar_noidentitas) = BINARY ?${kecuali}`,
        [nilai, ...(excludeNik ? [excludeNik] : [])]
    )
    return rows
}

/** GET /master/karyawan/cek-identitas?noidentitas=...&nik=... — pre-check frontend. */
export const cekIdentitas = async (req, res, next) => {
    try {
        const noidentitas = String(req.query?.noidentitas ?? '').trim()
        const excludeNik = String(req.query?.nik ?? '').trim()
        if (!noidentitas) return success(res, { ditemukan: [] })
        if (excludeNik) {
            const [current] = await pool.query('SELECT kar_noidentitas FROM tkaryawan WHERE kar_Nik = ?', [excludeNik])
            if (current.length && String(current[0].kar_noidentitas ?? '').trim() === noidentitas) {
                return success(res, { ditemukan: [] })
            }
        }
        const rows = await cariDuplikatIdentitas(pool, noidentitas, excludeNik)
        success(res, {
            ditemukan: rows.map((r) => ({
                nik: r.kar_Nik,
                nama: r.kar_nama,
                aktif: Number(r.kar_status_aktif) === 1,
                tgl_masuk: r.kar_tgl_masuk,
                tgl_keluar: r.kar_tgl_keluar,
            })),
        })
    } catch (err) {
        next(err)
    }
}

export const saveKaryawan = async (req, res, next) => {
    const conn = await pool.getConnection()
    let kunciDiambil = false
    try {
        const b = kanonik(req.body || {})
        // NIK pada PUT berasal dari URL; body dipakai untuk insert (dibuat dari nomor otomatis)
        const nikParam = req.params.nik || ''
        const isEdit = req.method === 'PUT'
        const canChangeStatus = ['hrd', 'super'].includes(String(req.user?.user || '').toLowerCase())
        const nik = nikParam || b.kar_Nik || await nomorNik(b.kar_pab_kode, b.kar_tgl_masuk)
        if (req.method === 'PUT' && nikParam && b.kar_Nik && b.kar_Nik !== nikParam) {
            return error(res, 'NIK pada body tidak boleh berbeda dari NIK pada URL', 400)
        }

        if (!isEdit && !nik) return error(res, 'NIK kosong, tidak bisa membuat nomor', 400)

        // validasi unik
        const [dup] = await conn.query('SELECT kar_Nik, kar_status_aktif, kar_noidentitas FROM tkaryawan WHERE kar_Nik = ?', [nik])
        if (dup.length > 0 && !isEdit) {
            return error(res, `NIK ${nik} sudah dipakai`, 409)
        }
        if (isEdit && !dup.length) return error(res, 'Karyawan tidak ditemukan', 404)

        const hasStatus = Object.hasOwn(b, 'kar_status_aktif')
        const validStatus = [0, 1, '0', '1'].includes(b.kar_status_aktif)
        const currentStatus = isEdit ? dup[0].kar_status_aktif : null
        if (isEdit && !canChangeStatus && hasStatus && !(
            (b.kar_status_aktif === null && currentStatus === null) ||
            (validStatus && currentStatus != null && Number(b.kar_status_aktif) === Number(currentStatus))
        )) return error(res, 'Status aktif/non aktif hanya dapat diubah oleh HRD', 403)
        let status = isEdit ? currentStatus : 0
        if (canChangeStatus) {
            if (validStatus) status = Number(b.kar_status_aktif)
            else {
                return error(res, 'Status Aktif wajib dipilih (Aktif atau Non Aktif)', 400)
            }
        }

        const values = {
            kar_nama: b.kar_nama,
            kar_status_aktif: status,
            kar_tempatlahir: b.kar_tempatlahir ?? '',
            kar_kode_absensi: b.kar_kode_absensi ?? (await nomorKodeAbsensi()),
            kar_tgllahir: b.kar_tgllahir || null,
            kar_jenkel: num(b.kar_jenkel),
            kar_status_kawin: b.kar_status_kawin ?? '',
            kar_warganegara: b.kar_warganegara ?? '',
            kar_gol_darah: b.kar_gol_darah ?? '',
            kar_alamat: b.kar_alamat ?? '',
            kar_agama: b.kar_agama ?? '',
            kar_status_tinggal: b.kar_status_tinggal ?? '',
            kar_notelp: b.kar_notelp ?? '',
            kar_noidentitas: b.kar_noidentitas ?? '',
            kar_rekeningbank: b.kar_rekeningbank ?? '',
            kar_pab_kode: b.kar_pab_kode ?? '',
            kar_dep_kode: b.kar_dep_kode ?? '',
            kar_jab_kode: b.kar_jab_kode ?? '',
            kar_golongan: b.kar_golongan ?? '',
            kar_status_kerja: num(b.kar_status_kerja),
            kar_tglPKWT1: b.kar_tglPKWT1 || null,
            kar_tglPKWT2: b.kar_tglPKWT2 || null,
            kar_bagian: b.kar_bagian ?? '',
            kar_nik_atasan: b.kar_nik_atasan ?? '',
            kar_tgl_masuk: b.kar_tgl_masuk || null,
            kar_sistem_gaji: b.kar_sistem_gaji ?? '',
            kar_status_BPJS: num(b.kar_status_BPJS),
            kar_no_BPJS: b.kar_no_BPJS ?? '',
            kar_no_NAKER: b.kar_no_NAKER ?? '',
            kar_namapasangan: b.kar_namapasangan ?? '',
            kar_ibukandung: b.kar_ibukandung ?? null,
            kar_email: b.kar_email ?? null,
            kar_hubungan: num(b.kar_hubungan),
            kar_status_hidup: num(b.kar_status_hidup),
            kar_tgllahir2: b.kar_tgllahir2 || null,
            kar_alamat2: b.kar_alamat2 ?? '',
            kar_pk_id: num(b.kar_pk_id),
            kar_keterangan_kerja: b.kar_keterangan_kerja ?? '',
            kar_telp2: b.kar_telp2 ?? '',
            kar_pendidikanterakhir: b.kar_pendidikanterakhir ?? null,
            kar_jurusan: b.kar_jurusan ?? null,
            kar_size: b.kar_size ?? '',
        }

        if (!values.kar_nama) return error(res, 'Nama karyawan wajib diisi', 400)

        // Jaga agar salah ketik nama kolom tidak diam-diam menulis NULL/0
        const kurang = FORM_COLUMNS.filter((c) => !Object.prototype.hasOwnProperty.call(values, c))
        if (kurang.length > 0) {
            return error(res, `Kolom form belum dipetakan di backend: ${kurang.join(', ')}`, 500)
        }

        // ── Validasi No. Identitas (KTP/SIM) ─────────────────────────────
        // MyISAM cannot roll back writes. Validate before any write and serialize
        // cooperating web writers until all employee/child writes finish.
        // Unchanged identities keep legacy duplicates editable.
        const identitasInput = String(values.kar_noidentitas ?? '').trim()
        const identitasLama = isEdit ? String(dup[0]?.kar_noidentitas ?? '').trim() : ''
        const identitasDiganti = !isEdit || identitasInput !== identitasLama
        if (identitasInput && identitasDiganti) {
            kunciDiambil = (await conn.query('SELECT GET_LOCK(?, 5) AS kunci', [KUNCI_IDENTITAS]))[0]?.[0]?.kunci === 1
            if (!kunciDiambil) return error(res, 'Pemeriksaan No. Identitas sedang digunakan. Silakan coba simpan lagi.', 503)
            const pemakai = await cariDuplikatIdentitas(conn, identitasInput, isEdit ? nik : '')
            if (pemakai.length) {
                const rincian = pemakai.map(p => `${p.kar_Nik} - ${p.kar_nama}`).join('; ')
                return error(res, `No. Identitas sudah pernah digunakan oleh karyawan: ${rincian}. Gunakan No. Identitas yang berbeda.`, 409)
            }
        }

        await conn.beginTransaction()

        if (isEdit) {
            const updateColumns = canChangeStatus ? FORM_COLUMNS : FORM_COLUMNS.filter(c => c !== 'kar_status_aktif')
            const sets = updateColumns.map((c) => `\`${c}\` = ?`).join(', ')
            await conn.query(`UPDATE tkaryawan SET ${sets} WHERE kar_Nik = ?`, [
                ...updateColumns.map((c) => values[c]),
                nik,
            ])
        } else {
            const cols = ['kar_Nik', ...FORM_COLUMNS]
            await conn.query(
                `INSERT INTO tkaryawan (${cols.map((c) => `\`${c}\``).join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
                [nik, ...FORM_COLUMNS.map((c) => values[c])]
            )
        }

        // foto (base64 / dataURL) — opsional
        if (b.kar_foto_base64) {
            const base64 = String(b.kar_foto_base64).replace(/^data:image\/\w+;base64,/, '')
            await conn.query('UPDATE tkaryawan SET kar_foto = ?, kar_size = ? WHERE kar_Nik = ?', [
                Buffer.from(base64, 'base64'),
                values.kar_size,
                nik,
            ])
        }

        // ── tabel anak ────────────────────────────────────────────────
        await replaceChild(conn, 'tkaryawananak', 'kara_kar_nik', nik, b.anak, 'anak', ANAK_COLS)
        await replaceChild(conn, 'tkaryawandidik', 'kard_kar_nik', nik, b.pendidikan, 'pendidikan', DIDIK_COLS)
        await replaceChild(conn, 'tkaryawanpengalaman', 'karp_kar_nik', nik, b.pengalaman, 'pengalaman', PENGALAMAN_COLS)
        await replaceChild(conn, 'tkaryawankeahlian', 'kark_kar_nik', nik, b.keahlian, 'keahlian', KEAHLIAN_COLS)

        // jadwal (banyak-manyak)
        await conn.query('DELETE FROM tkaryawanjadwal WHERE karj_nik = ?', [nik])
        if (Array.isArray(b.jadwal) && b.jadwal.length) {
            const vals = b.jadwal.map((j) => [nik, num(j.karj_jd_id ?? j.JdId)])
            await conn.query('INSERT INTO tkaryawanjadwal (karj_nik, karj_jd_id) VALUES ?', [vals])
        }

        // riwayat PKWT (tpkwt)
        if (Array.isArray(b.pkwt)) {
            await conn.query('DELETE FROM tpkwt WHERE kar_nik = ?', [nik])
            const vals = b.pkwt.map((p) => [nik, num(p.sk_id ?? p.SkId), p.tgl1 || null, p.tgl2 || null])
            if (vals.length) await conn.query('INSERT INTO tpkwt (kar_nik, sk_id, tgl1, tgl2) VALUES ?', [vals])
        }

        await conn.commit()
        success(res,
            { kar_Nik: nik },
            isEdit ? 'Karyawan berhasil diupdate' : 'Karyawan berhasil ditambahkan',
            isEdit ? 200 : 201)
    } catch (err) {
        await conn.rollback()
        next(err)
    } finally {
        if (kunciDiambil) {
            // Best-effort: kunci sudah otomatis lepas saat koneksi ditutup,
            // tetapi lepas eksplisit menjaga pool tetap bersih.
            await conn.query('SELECT RELEASE_LOCK(?) AS lepas', [KUNCI_IDENTITAS]).catch(() => {})
        }
        conn.release()
    }
}

/** Hapus seluruh baris lalu insert ulang (menggantikan logika Delphi). */
async function replaceChild(conn, table, keyCol, nik, rows, label, allowedCols) {
    await conn.query(`DELETE FROM ${table} WHERE \`${keyCol}\` = ?`, [nik])
    if (!Array.isArray(rows) || rows.length === 0) return
    const cols = allowedCols.filter((c) => rows[0][c] !== undefined)
    if (cols.length === 0) return
    const insCols = [keyCol, ...cols]
    const vals = rows.map((r) => [nik, ...cols.map((c) => (r[c] === '' ? null : r[c]))])
    await conn.query(
        `INSERT INTO ${table} (${insCols.map((c) => `\`${c}\``).join(',')}) VALUES ?`,
        [vals]
    )
}

export const deleteKaryawan = async (req, res, next) => {
    try {
        const nik = req.params.nik
        await pool.query('DELETE FROM tkaryawan WHERE kar_Nik = ?', [nik])
        await pool.query('DELETE FROM tkaryawananak WHERE kara_kar_nik = ?', [nik])
        await pool.query('DELETE FROM tkaryawandidik WHERE kard_kar_nik = ?', [nik])
        await pool.query('DELETE FROM tkaryawanpengalaman WHERE karp_kar_nik = ?', [nik])
        await pool.query('DELETE FROM tkaryawankeahlian WHERE kark_kar_nik = ?', [nik])
        await pool.query('DELETE FROM tkaryawanjadwal WHERE karj_nik = ?', [nik])
        await pool.query('DELETE FROM tpkwt WHERE kar_nik = ?', [nik])
        success(res, null, 'Karyawan berhasil dihapus')
    } catch (err) {
        next(err)
    }
}

/** Opsi form karyawan (dropdown di form master). */
export const getFormOptions = async (req, res, next) => {
    try {
        // Pertahankan nama atasan existing pada form edit, termasuk bila sudah nonaktif.
        const atasanNik = String(req.query.atasan_nik || '')
        const [[pabrik], [jabatan], [departemen], [statusKerja], [statusKaryawan], [pekerjaan], [pendidikan], [jadwal], [bagian], [atasan]] =
            await Promise.all([
                pool.query('SELECT pab_kode AS Kode, pab_nama AS Nama FROM tpabrik ORDER BY pab_kode'),
                pool.query('SELECT jab_kode AS Kode, jab_nama AS Nama FROM tjabatan ORDER BY jab_kode'),
                pool.query('SELECT dep_kode AS Kode, dep_nama AS Nama FROM tdepartemen ORDER BY dep_kode'),
                pool.query('SELECT sk_id AS Kode, sk_keterangan AS Nama FROM tstatuskaryawan ORDER BY sk_id'),
                pool.query('SELECT sk_id AS Kode, sk_keterangan AS Nama FROM tstatuskaryawan ORDER BY sk_id'),
                pool.query('SELECT pk_id AS Kode, pk_keterangan AS Nama FROM tpekerjaan ORDER BY pk_id'),
                pool.query('SELECT pd_id AS Kode, pd_keterangan AS Nama FROM tpendidikan ORDER BY pd_id'),
                pool.query('SELECT jd_id AS Kode, jd_nama_shift AS Nama, jd_jamawal AS JamAwal, jd_jamakhir AS JamAkhir FROM tjadwal ORDER BY jd_id'),
                pool.query('SELECT DISTINCT kar_bagian AS Nama FROM tkaryawan WHERE kar_bagian <> "" ORDER BY kar_bagian'),
                pool.query("SELECT kar_Nik AS Nik, kar_nama AS Nama FROM tkaryawan WHERE kar_status_aktif = 1 OR kar_Nik = ? ORDER BY kar_nama", [atasanNik]),
            ])
        success(res, { pabrik, jabatan, departemen, statusKerja, statusKaryawan, pekerjaan, pendidikan, jadwal, bagian, atasan })
    } catch (err) {
        next(err)
    }
}

/** Rekap riwayat terbaru per kategori untuk karyawan yang saat ini aktif. */
export const getHistoryKaryawan = async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1)
        const perPage = Math.max(1, Math.min(500, parseInt(req.query.per_page) || 25))
        const nik = req.query.nik || ''
        let where = ' WHERE 1 = 1'
        let params = []
        if (nik) {
            where += ' AND h.Nik = ?'
            params.push(nik)
        }
        if (req.query.search) {
            where += ' AND (h.Nik LIKE ? OR h.Nama LIKE ? OR h.Bagian LIKE ? OR h.Jabatan LIKE ?)'
            params.push(...Array(4).fill(`%${req.query.search}%`))
        }
        if (req.query.pabrik) {
            where += ' AND h.Pabrik = ?'
            params.push(req.query.pabrik)
        }
        if (req.query.distinct && Object.hasOwn(HISTORY_COLUMNS, req.query.distinct)) {
            const col = HISTORY_COLUMNS[req.query.distinct]
            const scoped = applyAllColumnFilters(where, params, req.query, HISTORY_COLUMNS, req.query.distinct, HISTORY_FILTER_OPTIONS)
            const [values] = await pool.query(
                `${HISTORY_CTE}SELECT DISTINCT ${col} AS value, OCTET_LENGTH(${col}) AS value_length FROM history h${scoped.clause} ORDER BY value`,
                scoped.params
            )
            return success(res, values.map(row => row.value))
        }
        const filtered = applyAllColumnFilters(where, params, req.query, HISTORY_COLUMNS, null, HISTORY_FILTER_OPTIONS)
        where = filtered.clause
        params = filtered.params
        const order = buildOrderBy(req.query, HISTORY_COLUMNS, 'ORDER BY h.Nik')
        const select = `${HISTORY_CTE}SELECT h.* FROM history h${where} ${order}`
        if (req.query.export === 'xlsx') {
            const [all] = await pool.query(`${select} LIMIT 50000`, params)
            return sendExcel(res, 'History-Karyawan', HISTORY_KEYS, normalizeHistoryRows(all), {
                columnWidths: { Rotasi: 45, Demosi: 45 },
                freezeHeader: true,
                headLabels: { Nik: 'NIK' },
                requestedColumns: req.query.columns,
            })
        }
        const [cnt] = await pool.query(`${HISTORY_CTE}SELECT COUNT(*) AS c FROM history h${where}`, params)
        const [rows] = await pool.query(`${select} LIMIT ? OFFSET ?`, [...params, perPage, (page - 1) * perPage])
        paginated(res, normalizeHistoryRows(rows), { page, per_page: perPage, total: cnt[0].c, last_page: Math.ceil(cnt[0].c / perPage) })
    } catch (err) {
        next(err)
    }
}
