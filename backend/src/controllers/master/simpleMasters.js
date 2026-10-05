import pool from '../../config/database.js'
import { makeMasterController } from '../../helpers/crud.js'
import { success, error } from '../../helpers/response.js'

/**
 * Master sederhana - cerminan unit Delphi:
 *   ufrmJabatan, ufrmDepartemen, ufrmPabrik, ufrmHariLibur, ufrmJadwal
 *   + tabel referensi: tstatuskaryawan, tjenisijin, tpekerjaan, tpendidikan,
 *     tketeranganmutasi
 */

/* -- Jabatan (tjabatan) ------------------------------------------------ */
export const jabatan = makeMasterController({
    table: 'tjabatan',
    key: 'jab_kode',
    alias: { jab_kode: 'Kode', jab_nama: 'Nama' },
    order: 'ORDER BY jab_kode',
    required: ['jab_kode', 'jab_nama'],
    label: 'Jabatan',
    editable: true,
})

/* -- Departemen (tdepartemen) ------------------------------------------ */
export const departemen = makeMasterController({
    table: 'tdepartemen',
    key: 'dep_kode',
    alias: { dep_kode: 'Kode', dep_nama: 'Nama' },
    order: 'ORDER BY dep_kode',
    required: ['dep_kode', 'dep_nama'],
    label: 'Departemen',
    editable: true,
})

/* -- Pabrik / Unit (tpabrik) ------------------------------------------ */
const genKodePabrik = async () => {
    const [rows] = await pool.query('SELECT MAX(SUBSTR(pab_kode, 2, 2)) AS m FROM tpabrik')
    const maxVal = rows[0]?.m ? parseInt(rows[0].m, 10) : 0
    return `P${String(100 + maxVal + 1).slice(-2)}`
}

export const pabrik = makeMasterController({
    table: 'tpabrik',
    key: 'pab_kode',
    alias: {
        pab_kode: 'Kode',
        pab_nama: 'Nama',
        pab_pabrik: 'Induk',
        pab_status: 'Aktif',
        pab_face: 'Face',
        pab_ip: 'IP',
        pab_path: 'Path',
    },
    order: 'ORDER BY pab_kode',
    required: ['pab_kode', 'pab_nama'],
    label: 'Pabrik',
    editable: true,
    keyGen: genKodePabrik,
})

/* -- Jadwal / Shift (tjadwal) ----------------------------------------- */
export const jadwal = makeMasterController({
    table: 'tjadwal',
    key: 'jd_id',
    alias: {
        jd_id: 'Kode',
        jd_nama_shift: 'Nama Shift',
        jd_jamawal: 'Jam Awal',
        jd_jamakhir: 'Jam Akhir',
    },
    order: 'ORDER BY jd_id',
    required: ['jd_nama_shift'],
    label: 'Jadwal',
    editable: true,
    keyGen: async () => {
        const [rows] = await pool.query('SELECT MAX(jd_id) AS m FROM tjadwal')
        return String((rows[0]?.m ? parseInt(rows[0].m, 10) : 0) + 1)
    },
})

/* -- Hari Libur (tharilibur) ------------------------------------------ */
const hariLiburBase = makeMasterController({
    table: 'tharilibur',
    key: 'hl_tanggal',
    alias: {
        hl_tanggal: 'Tanggal',
        hl_keterangan: 'Keterangan',
        hl_status: 'Status',
        hl_status_security: 'Status Security',
    },
    order: 'ORDER BY hl_tanggal DESC',
    required: ['hl_tanggal'],
    label: 'Hari Libur',
    editable: true,
})

/** tharilibur: tanggal juga dipakai sebagai filter tahun (ufrmHariLibur). */
export const hariLibur = {
    ...hariLiburBase,
    list: async (req, res, next) => {
        try {
            if (!req.query.tahun) return hariLiburBase.list(req, res, next)
            const [rows] = await pool.query(
                'SELECT hl_tanggal AS `Tanggal`, hl_keterangan AS `Keterangan`, hl_status AS `Status`, hl_status_security AS `Status Security` FROM tharilibur WHERE YEAR(hl_tanggal) = ? ORDER BY hl_tanggal',
                [req.query.tahun]
            )
            return success(res, rows, `Hari libur tahun ${req.query.tahun}`)
        } catch (err) {
            next(err)
        }
    },
}

/* -- Tabel referensi --------------------------------------------------- */
/** Tabel ini tidak punya PRIMARY KEY auto - nomor dibuat manual oleh Delphi. */
const keyGenId = (table, col) => async () => {
    const [rows] = await pool.query(`SELECT MAX(\`${col}\`) AS m FROM \`${table}\``)
    return String((rows[0]?.m ? parseInt(rows[0].m, 10) : 0) + 1)
}

export const statusKaryawan = makeMasterController({
    table: 'tstatuskaryawan',
    key: 'sk_id',
    alias: { sk_id: 'Kode', sk_keterangan: 'Keterangan' },
    order: 'ORDER BY sk_id',
    required: ['sk_keterangan'],
    label: 'Status Karyawan',
    editable: true,
    keyGen: keyGenId('tstatuskaryawan', 'sk_id'),
})

export const jenisIjin = makeMasterController({
    table: 'tjenisijin',
    key: 'ji_id',
    alias: { ji_id: 'Kode', ji_keterangan: 'Keterangan' },
    order: 'ORDER BY ji_id',
    required: ['ji_keterangan'],
    label: 'Jenis Ijin',
    editable: true,
    keyGen: keyGenId('tjenisijin', 'ji_id'),
})

export const pekerjaan = makeMasterController({
    table: 'tpekerjaan',
    key: 'pk_id',
    alias: { pk_id: 'Kode', pk_keterangan: 'Keterangan' },
    order: 'ORDER BY pk_id',
    required: ['pk_keterangan'],
    label: 'Pekerjaan',
    editable: true,
    keyGen: keyGenId('tpekerjaan', 'pk_id'),
})

export const pendidikan = makeMasterController({
    table: 'tpendidikan',
    key: 'pd_id',
    alias: { pd_id: 'Kode', pd_keterangan: 'Keterangan' },
    order: 'ORDER BY pd_id',
    required: ['pd_keterangan'],
    label: 'Pendidikan',
    editable: true,
    keyGen: keyGenId('tpendidikan', 'pd_id'),
})

export const keteranganMutasi = makeMasterController({
    table: 'tketeranganmutasi',
    key: 'km_id',
    alias: { km_id: 'Kode', km_keterangan: 'Keterangan' },
    order: 'ORDER BY km_id',
    required: ['km_keterangan'],
    label: 'Keterangan Mutasi',
    editable: true,
    keyGen: keyGenId('tketeranganmutasi', 'km_id'),
})

/* -- Ringkasan untuk dashboard ----------------------------------------- */
export const getRingkasan = async (req, res, next) => {
    try {
        const [[total], [aktif], [keluar], [departments], [jabatan], [pabrik]] = await Promise.all([
            pool.query('SELECT COUNT(*) AS c FROM tkaryawan'),
            pool.query('SELECT COUNT(*) AS c FROM tkaryawan WHERE kar_status_aktif = 1'),
            pool.query('SELECT COUNT(*) AS c FROM tkaryawan WHERE kar_status_aktif = 0'),
            pool.query('SELECT COUNT(*) AS c FROM tdepartemen'),
            pool.query('SELECT COUNT(*) AS c FROM tjabatan'),
            pool.query('SELECT COUNT(*) AS c FROM tpabrik'),
        ])
        success(res, {
            totalKaryawan: total[0].c,
            karyawanAktif: aktif[0].c,
            karyawanKeluar: keluar[0].c,
            departments: departments[0].c,
            jabatan: jabatan[0].c,
            pabrik: pabrik[0].c,
        })
    } catch (err) {
        next(err)
    }
}

/* -- Identitas Perusahaan (tperusahaan, 1 baris) ----------------------- */
export const getPerusahaan = async (req, res, next) => {
    try {
        const [rows] = await pool.query('SELECT * FROM tperusahaan LIMIT 1')
        if (rows.length === 0) return error(res, 'Data perusahaan belum diisi', 404)
        success(res, rows[0])
    } catch (err) {
        next(err)
    }
}

export const savePerusahaan = async (req, res, next) => {
    try {
        const body = { ...req.body }
        delete body._csrf
        const [existing] = await pool.query('SELECT COUNT(*) AS c FROM tperusahaan')
        if (existing[0].c === 0) {
            const cols = Object.keys(body)
            await pool.query(
                `INSERT INTO tperusahaan (${cols.map((c) => `\`${c}\``).join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
                cols.map((c) => body[c] ?? null)
            )
        } else {
            const cols = Object.keys(body)
            if (cols.length === 0) return error(res, 'Tidak ada perubahan', 400)
            await pool.query(`UPDATE tperusahaan SET ${cols.map((c) => `\`${c}\` = ?`).join(', ')}`, cols.map((c) => body[c]))
        }
        success(res, body, 'Identitas perusahaan tersimpan')
    } catch (err) {
        next(err)
    }
}