import pool from '../config/database.js'
import { success, error } from '../helpers/response.js'
import { sendExcel } from '../helpers/excel.js'

/**
 * Peringatan dashboard — pengganti 7 popup `TfrmLogin.cxButton2Click`
 * (UfrmLogin.pas) yang muncul berurutan setiap login di program Delphi.
 *
 * Di web, 4 daftar yang diminta pengguna ditampilkan sekaligus di Dashboard
 * lewat satu endpoint `GET /dashboard/peringatan`, tanpa popup berurutan:
 *
 *   1. Karyawan aktif > 30 hari yang belum di-setting BPJS
 *      (`kar_status_aktif = 1 AND kar_status_BPJS = 0`).
 *   2. Karyawan tidak masuk 2 hari berturut-turut: status absensi 0 pada
 *      3 tanggal kerja terakhir (di luar Master Hari Libur), tanpa Ijin
 *      pada tanggal-tanggal itu, dan belum keluar (`kar_tgl_keluar` null).
 *   3. Karyawan tidak aktif tetapi BPJS masih perusahaan
 *      (`kar_status_aktif = 0 AND kar_status_BPJS = 1`).
 *   4. Karyawan aktif yang masa PKWT berakhir < 2 bulan dari hari ini
 *      (`kar_status_kerja IN (2,3,4,5,6)`), terdekat di atas.
 */

const MAKS_BARIS = 200

const Q_BPJS_BELUM = `SELECT kar_Nik AS Nik, kar_nama AS Nama,
        kar_pab_kode AS Pabrik, kar_bagian AS Bagian, kar_tgl_masuk AS Tgl_Masuk
    FROM tkaryawan
    WHERE kar_status_aktif = 1 AND kar_status_BPJS = 0
    AND DATE_ADD(CURDATE(), INTERVAL -30 DAY) > kar_tgl_masuk
    ORDER BY kar_tgl_masuk`

// 3 tanggal absensi terakhir di luar Master Hari Libur (hari kerja acuan).
const TIGA_HARI_KERJA = `SELECT * FROM (
        SELECT DISTINCT tanggal FROM tabsensi
        WHERE tanggal NOT IN (SELECT hl_tanggal FROM tharilibur)
        ORDER BY tanggal DESC LIMIT 3) d`

const Q_MANGKIR_2HARI = `SELECT * FROM (
        SELECT nik AS Kode_Absensi, kar_Nik AS Nik, LEFT(kar_nama, 50) AS Nama,
            kar_bagian AS Bagian, kar_pab_kode AS Pabrik
        FROM tabsensi INNER JOIN tkaryawan ON nik = kar_kode_absensi
        WHERE status = 0 AND tanggal IN (${TIGA_HARI_KERJA})
        AND kar_tgl_keluar IS NULL
        AND kar_kode_absensi IS NOT NULL AND kar_kode_absensi <> ''
        GROUP BY nik HAVING COUNT(*) > 1
    ) a WHERE Nik NOT IN (
        SELECT DISTINCT ij_nik FROM tijin WHERE ij_tanggal IN (${TIGA_HARI_KERJA}))`

const Q_NONAKTIF_BPJS = `SELECT kar_Nik AS Nik, LEFT(kar_nama, 50) AS Nama,
        kar_bagian AS Bagian, kar_pab_kode AS Pabrik, kar_tgl_keluar AS Tgl_Keluar
    FROM tkaryawan
    WHERE kar_status_aktif = 0 AND kar_status_BPJS = 1
    ORDER BY kar_nama`

const Q_PKWT_HABIS = `SELECT kar_Nik AS Nik, LEFT(kar_nama, 50) AS Nama,
        (SELECT LEFT(jab_nama, 20) FROM tjabatan WHERE jab_kode = kar_jab_kode) AS Jabatan,
        (SELECT LEFT(sk_keterangan, 20) FROM tstatuskaryawan WHERE sk_id = kar_status_kerja) AS Status_Kerja,
        LEFT(kar_bagian, 20) AS Bagian, LEFT(kar_pab_kode, 10) AS Pabrik,
        kar_tglpkwt2 AS Tgl_Berakhir
    FROM tkaryawan
    WHERE kar_tglpkwt2 < DATE_ADD(CURDATE(), INTERVAL 2 MONTH)
    AND kar_status_kerja IN (2, 3, 4, 5, 6) AND kar_status_aktif = 1
    ORDER BY kar_tglpkwt2 ASC`

const hitung = (q) => `SELECT COUNT(*) AS c FROM (${q}) x`

/** Meta export Excel per bagian (kolom = urutan kolom panel dashboard). */
const BAGIAN_EXPORT = {
    bpjs_belum: {
        query: Q_BPJS_BELUM,
        judul: 'Belum-Setting-BPJS',
        kolom: ['Nik', 'Nama', 'Pabrik', 'Bagian', 'Tgl_Masuk'],
    },
    mangkir_2hari: {
        query: Q_MANGKIR_2HARI,
        judul: 'Tidak-Masuk-2-Hari',
        kolom: ['Kode_Absensi', 'Nik', 'Nama', 'Pabrik', 'Bagian'],
    },
    nonaktif_bpjs: {
        query: Q_NONAKTIF_BPJS,
        judul: 'Tidak-Aktif-BPJS-Perusahaan',
        kolom: ['Nik', 'Nama', 'Bagian', 'Pabrik', 'Tgl_Keluar'],
    },
    pkwt_habis: {
        query: Q_PKWT_HABIS,
        judul: 'PKWT-Akan-Habis',
        kolom: ['Nik', 'Nama', 'Jabatan', 'Status_Kerja', 'Bagian', 'Pabrik', 'Tgl_Berakhir'],
    },
}

export const getPeringatan = async (req, res, next) => {
    try {
        // Unduh satu daftar penuh (tanpa batas 200 baris dashboard).
        if (req.query.export === 'xlsx') {
            const meta = BAGIAN_EXPORT[req.query.bagian]
            if (!meta) return error(res, 'Bagian peringatan tidak dikenal', 400)
            const [rows] = await pool.query(`${meta.query} LIMIT 50000`)
            return sendExcel(res, meta.judul, meta.kolom, rows)
        }
        const [
            [cBpjs], [rBpjs],
            [cMangkir], [rMangkir], [tglKerja],
            [cNonaktif], [rNonaktif],
            [cPkwt], [rPkwt],
        ] = await Promise.all([
            pool.query(hitung(Q_BPJS_BELUM)),
            pool.query(`${Q_BPJS_BELUM} LIMIT ${MAKS_BARIS}`),
            pool.query(hitung(Q_MANGKIR_2HARI)),
            pool.query(`${Q_MANGKIR_2HARI} LIMIT ${MAKS_BARIS}`),
            pool.query(`SELECT tanggal FROM (${TIGA_HARI_KERJA}) t ORDER BY tanggal`),
            pool.query(hitung(Q_NONAKTIF_BPJS)),
            pool.query(`${Q_NONAKTIF_BPJS} LIMIT ${MAKS_BARIS}`),
            pool.query(hitung(Q_PKWT_HABIS)),
            pool.query(`${Q_PKWT_HABIS} LIMIT ${MAKS_BARIS}`),
        ])
        success(res, {
            bpjs_belum: { total: Number(cBpjs[0].c), rows: rBpjs },
            mangkir_2hari: {
                total: Number(cMangkir[0].c),
                tanggal: tglKerja.map((t) => t.tanggal),
                rows: rMangkir,
            },
            nonaktif_bpjs: { total: Number(cNonaktif[0].c), rows: rNonaktif },
            pkwt_habis: { total: Number(cPkwt[0].c), rows: rPkwt },
        })
    } catch (err) { next(err) }
}
