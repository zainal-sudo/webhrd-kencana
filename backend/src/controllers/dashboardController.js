import pool from '../config/database.js'
import { success, error } from '../helpers/response.js'
import { sendExcel } from '../helpers/excel.js'
import { PKWT_HABIS_SELECT, EKSEKUSI_SELECT, EKSEKUSI_MONITORING_SELECT, PKWT_HABIS_ORDER } from '../helpers/pkwtEksekusi.js'

/**
 * Peringatan dashboard — pengganti 7 popup `TfrmLogin.cxButton2Click`
 * (UfrmLogin.pas) yang muncul berurutan setiap login di program Delphi.
 *
 * Di web, 4 daftar yang diminta pengguna ditampilkan sekaligus di Dashboard
 * lewat satu endpoint `GET /dashboard/peringatan`, tanpa popup berurutan:
 *
 *   1. Karyawan aktif > 30 hari yang belum di-setting BPJS
 *      (`kar_status_aktif = 1 AND kar_status_BPJS = 0`).
 *   2. Karyawan tidak masuk 3 hari berturut-turut: status absensi 0 pada
 *      KETIGA tanggal kerja terakhir (di luar Master Hari Libur) — ijin di
 *      salah satu tanggal itu memutus rentetan (karyawan dieluarkan dari
 *      daftar), dan belum keluar (`kar_tgl_keluar` null).
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

/* "Tidak masuk 3 hari berturut-turut" = status 0 pada KETIGA tanggal kerja
   terakhir (di luar Master Hari Libur) — kartu hanya melihat maksimal 3 hari
   ke belakang. Ijin di salah satu tanggal itu memutus rentetan → karyawan
   dieluarkan dari daftar (ketentuan pemberi hak, 2026-11-05). */
const Q_MANGKIR_2HARI = `SELECT * FROM (
        SELECT nik AS Kode_Absensi, kar_Nik AS Nik, LEFT(kar_nama, 50) AS Nama,
            kar_bagian AS Bagian, kar_pab_kode AS Pabrik
        FROM tabsensi INNER JOIN tkaryawan ON nik = kar_kode_absensi
        WHERE status = 0 AND tanggal IN (${TIGA_HARI_KERJA})
        AND kar_tgl_keluar IS NULL
        AND kar_kode_absensi IS NOT NULL AND kar_kode_absensi <> ''
        GROUP BY nik HAVING COUNT(DISTINCT tanggal) = 3
    ) a WHERE Nik NOT IN (
        SELECT DISTINCT ij_nik FROM tijin WHERE ij_tanggal IN (${TIGA_HARI_KERJA}))`

const Q_NONAKTIF_BPJS = `SELECT kar_Nik AS Nik, LEFT(kar_nama, 50) AS Nama,
        kar_bagian AS Bagian, kar_pab_kode AS Pabrik, kar_tgl_keluar AS Tgl_Keluar
    FROM tkaryawan
    WHERE kar_status_aktif = 0 AND kar_status_BPJS = 1
    ORDER BY kar_nama`

/* MoU Sewa (tmou_sewa): cakupan GABUNGAN — MoU yang akan habis dalam
 * ≤2 bulan KE DEPAN maupun yang sudah lewat (berapa pun lamanya).
 * Hilang dari card bila:
 *  - sudah dieksekusi (di grupnya ada periode lebih baru), atau
 *  - ditandai "Sudah Ditangani" (mou_selesai = 1).
 * Yang tampil selalu berstatus Belum ditangani; terlama berakhir di atas. */
const Q_MOU_SEWA = `SELECT t.mou_id AS Id,
        t.mou_no_surat AS No_Surat, t.mou_tempat AS Tempat, t.mou_alamat AS Alamat,
        t.mou_awal AS Awal_Mulai, t.mou_berakhir AS Tgl_Berakhir,
        DATEDIFF(t.mou_berakhir, CURDATE()) AS Sisa_Hari
    FROM tmou_sewa t
    WHERE t.mou_berakhir IS NOT NULL
    AND t.mou_berakhir <= DATE_ADD(CURDATE(), INTERVAL 2 MONTH)
    AND t.mou_selesai = 0
    AND NOT EXISTS (SELECT 1 FROM tmou_sewa s2
                    WHERE s2.mou_grup = t.mou_grup AND s2.mou_id > t.mou_id)
    ORDER BY t.mou_berakhir`

/* Definisi PKWT memakai sumber tunggal helper pkwtEksekusi.js (lihat file itu). */
const Q_PKWT_HABIS = PKWT_HABIS_SELECT

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
        judul: 'Tidak-Masuk-3-Hari',
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
    mou_sewa: {
        query: Q_MOU_SEWA,
        judul: 'MoU-Sewa-Berakhir',
        kolom: ['No_Surat', 'Tempat', 'Alamat', 'Awal_Mulai', 'Tgl_Berakhir', 'Sisa_Hari'],
    },
}

export const getPeringatan = async (req, res, next) => {
    try {
        // Unduh satu daftar penuh (tanpa batas 200 baris dashboard).
        if (req.query.export === 'xlsx') {
            const meta = BAGIAN_EXPORT[req.query.bagian]
            if (!meta) return error(res, 'Bagian peringatan tidak dikenal', 400)
            const [rows] = await pool.query(`${meta.query} LIMIT 50000`)
            // Header Excel rapi: tanpa underscore, NIK kapital.
            // (kunci kolom tetap alias SQL; hanya label header yang dipetakan)
            return sendExcel(res, meta.judul, meta.kolom, rows, {
                requestedColumns: req.query.columns,
                headLabels: Object.fromEntries(
                    meta.kolom.map((c) => [c, c === 'Nik' ? 'NIK' : c.replace(/_/g, ' ')]),
                ),
            })
        }
        const [
            [cBpjs], [rBpjs],
            [cMangkir], [rMangkir], [tglKerja],
            [cNonaktif], [rNonaktif],
            [cPkwt], [rPkwt],
            [cMou], [rMou],
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
            pool.query(hitung(Q_MOU_SEWA)),
            pool.query(`${Q_MOU_SEWA} LIMIT ${MAKS_BARIS}`),
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
            mou_sewa: { total: Number(cMou[0].c), rows: rMou },
        })
    } catch (err) { next(err) }
}

/**
 * Halaman MoU Sewa Berakhir (dari card Dashboard "MoU Sewa") — daftar penuh
 * MoU yang akan habis ≤2 bulan ke depan maupun yang sudah lewat; sumber
 * tunggal Q_MOU_SEWA (aturan sama dengan card). Dari halaman ini HR
 * menjalankan Eksekusi untuk membuat periode MoU baru; riwayat periode
 * lama tetap tersimpan.
 */
export const getMouSewaBerakhir = async (req, res, next) => {
    try {
        const [rows] = await pool.query(`${Q_MOU_SEWA} LIMIT 50000`)
        success(res, rows)
    } catch (err) { next(err) }
}

/**
 * Halaman Eksekusi PKWT — daftar penuh "Masa PKWT Akan Habis" yang dibuka
 * tombol Eksekusi di card Dashboard. Sumber tunggal `pkwtEksekusi.js`
 * (rule sama dengan card), identitas penuh tanpa potongan LEFT, plus sisa
 * hari dari DB. Hanya membaca data; tidak mengubah data PKWT.
 * Opsi cakupan=semua memuat seluruh PKWT aktif bertanggal akhir untuk monitoring.
 */
export const getEksekusiPkwt = async (req, res, next) => {
    try {
        // Cakupan default pengingat tetap sama dengan card Dashboard.
        const select = req.query.cakupan === 'semua' ? EKSEKUSI_MONITORING_SELECT : EKSEKUSI_SELECT
        const [rows] = await pool.query(`${select} ${PKWT_HABIS_ORDER} LIMIT 50000`)
        success(res, rows)
    } catch (err) { next(err) }
}
