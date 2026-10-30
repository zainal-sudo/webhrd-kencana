import pool from '../../config/database.js'
import { success } from '../../helpers/response.js'

/**
 * GET /dashboard/analisis-absensi?bulan=&tahun=&pabrik=&refresh=1
 *
 * Sumber data Dashboard "Analisis HR": rekap absensi per karyawan satu
 * periode bulan-tahun (kolom sama dengan Rekap Absensi Delphi), plus kolom
 * tanggal detail (Adaform/Tanpaform/Ket*).
 *
 * KINERJA — versi cepa `rekapCepatSql`:
 *   SQL asli (laporan/laporanController.rekapAbsensiSql) memakai 8+ subquery
 *   terkorelasi DIPANGGIL PER KARYAWAN (~4.400 eksekusi kecil → ±10 detik).
 *   Versi cepat menulis ulang hitungan yang sama menjadi derived table
 *   GRUP massal (dihitung SEKALI lalu di-LEFT JOIN sekali) — hasil kolom
 *   identik, diverifikasi baris-per-baris terhadap SQL asli. SQL asli tidak
 *   disentuh: Laporan → Rekap Absensi tetap memakainya.
 *
 * Lainnya:
 * - `isiKetBatch`: ~791 query tanggal detail → 7 query (grup massal).
 * - Cache ± 10 menit per kombinasi (bulan, tahun, pabrik); `refresh=1`
 *   bypass cache (dipakai tombol Terapkan).
 * Tanpa `wajibHak` — mengikuti /dashboard/peringatan (cukup login).
 */

/* ── Format tanggal "dd-Mon" sama dengan fmtKet laporanController ── */
function fmtKet(sqlDate) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(sqlDate || ''))
    if (!m) return ''
    const bulan = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return `${m[3]}-${bulan[Number(m[2]) - 1]}`
}

/* ── Rumus jam SPL: identik rekapAbsensiSql (kolom di-alias `d`) ── */
const JAM_LEMBUR = `if ( timediff(d.lemd_jamakhir,d.lemd_jammulai) < 0 ,
    (time_to_sec((timediff("24:00:00",d.lemd_jammulai))))/3600
    + (time_to_sec((timediff(d.lemd_jamakhir,"00:00:00"))))/3600,
    (time_to_sec((timediff(d.lemd_jamakhir,d.lemd_jammulai))))/3600 )`

/* Rumus jam kerja scan (menghitung lintas tengah malam scan2<scan1) — identik. */
const JAM_SCAN = `(case when a.scan2 < a.scan1 then 24 else 0 end
    + (TIME_TO_SEC((TIMEDIFF(a.scan2,a.scan1))))/3600)`

/**
 * SQL rekap cepa: semua agregat dihitung massal (GROUP BY sekali per
 * kategori) lalu digabung ke daftar karyawan aktif.
 * Kolom & nama output sama dengan rekapAbsensiSql.
 */
export function rekapCepatSql() {
    return `SELECT Nik,Nama,Pabrik,Departemen,Jabatan,Bagian,Sistem,Total_Hari,
        IFNULL(2jam,0) "2_Jam_Pertama",IFNULL(lembur-panggilan-2jam,0) "Lebih dari 2 Jam",
        IFNULL(panggilan,0) Panggilan,IFNULL(lembur,0) "TotalLembur",
        IFNULL(bonus_mlm_lbr,0) "Bonus_Malam_Libur",Bonus_Libur,
        IFNULL(terlambat,0) terlambat,IFNULL(sthari,0) ST_HARI,
        IFNULL(sakit,0) sakit,IFNULL(ijin,0) Ijin,IFNULL(alpha,0) Alpha,IFNULL(lain,0) LainLain,
        CAST('' AS CHAR(200)) Adaform,CAST('' AS CHAR(200)) Tanpaform,
        CAST('' AS CHAR(200)) KetSetengahaHari,CAST('' AS CHAR(200)) KetSakit,
        CAST('' AS CHAR(200)) KetIjin,CAST('' AS CHAR(200)) KetAlpha,
        CAST('' AS CHAR(200)) KetLainLain,
        Total
    FROM (
        SELECT k.kar_nik Nik, k.kar_nama Nama, k.kar_pab_kode Pabrik,
            j.jab_nama Jabatan, d.dep_nama Departemen, k.kar_bagian Bagian,
            k.kar_sistem_gaji Sistem,
            /* A. hari masuk (scan valid, bukan alpha) minus 0.5*setengah hari */
            IFNULL(h.jml,0) - IFNULL(st.c,0)*0.5 Total_Hari,
            IFNULL(h.jml,0) jml_calon,
            IFNULL(l.h,0) lembur, IFNULL(dj.h,0) 2jam, IFNULL(p.h,0) panggilan,
            IFNULL(bm.c,0) bonus_mlm_lbr,
            /* Bonus Libur = 0.5*sesi 3-6 jam + sesi >6 jam */
            IFNULL(bl.c,0)*0.5 + IFNULL(bl2.c,0) Bonus_Libur,
            IFNULL(tbn.c,0) terlambat,
            IFNULL(st.c,0) sthari,
            IFNULL(ij.sakit,0) sakit, IFNULL(ij.ijin,0) ijin,
            IFNULL(ij.alpha,0) alpha, IFNULL(ij.lain,0) lain,
            /* Total = Total_Hari + sakit + ijin + alpha + lain + 0.5*ST_HARI */
            IFNULL(h.jml,0) - IFNULL(st.c,0)*0.5 + IFNULL(ij.sakit,0) + IFNULL(ij.ijin,0)
                + IFNULL(ij.alpha,0) + IFNULL(ij.lain,0) + IFNULL(st.c,0)*0.5 Total
        FROM tkaryawan k
        LEFT JOIN tjabatan j ON j.jab_kode = k.kar_jab_kode
        LEFT JOIN tdepartemen d ON d.dep_kode = k.kar_dep_kode
        LEFT JOIN (/* hari masuk: scan masuk terisi, status bukan 0 (kode absensi kosong dikecualikan = SQL asli) */
            SELECT b.kar_nik nik, COUNT(*) jml FROM tabsensi a
            INNER JOIN tkaryawan b ON b.kar_kode_absensi = a.nik
            WHERE b.kar_kode_absensi IS NOT NULL AND b.kar_kode_absensi <> ''
            AND a.tanggal BETWEEN ? AND ? AND a.scan1 <> '00:00:00' AND a.status <> 0
            GROUP BY b.kar_nik
        ) h ON h.nik = k.kar_nik
        LEFT JOIN (/* setengah hari: ijin jenis 2 */
            SELECT ij_nik nik, COUNT(*) c FROM tijin
            WHERE ij_tanggal BETWEEN ? AND ? AND ij_ji_id = 2 GROUP BY ij_nik
        ) st ON st.nik = k.kar_nik
        LEFT JOIN (/* lembur total dari SPL */
            SELECT d.lemd_kar_nik nik, SUM(${JAM_LEMBUR}) h FROM tlembur_dtl d
            INNER JOIN tlembur_hdr h2 ON h2.lem_nomor = d.lemd_lem_nomor
            WHERE h2.lem_tanggal BETWEEN ? AND ? GROUP BY d.lemd_kar_nik
        ) l ON l.nik = k.kar_nik
        LEFT JOIN (/* 2 jam pertama: bukan panggilan, tanggal bukan hari libur */
            SELECT d.lemd_kar_nik nik, SUM(if(${JAM_LEMBUR} > 2, 2, ${JAM_LEMBUR})) h
            FROM tlembur_dtl d
            INNER JOIN tlembur_hdr h2 ON h2.lem_nomor = d.lemd_lem_nomor AND d.lemd_panggilan <> 1
            WHERE h2.lem_tanggal BETWEEN ? AND ?
                AND h2.lem_tanggal NOT IN (SELECT hl_tanggal FROM tharilibur WHERE hl_status = 1)
            GROUP BY d.lemd_kar_nik
        ) dj ON dj.nik = k.kar_nik
        LEFT JOIN (/* lembur panggilan */
            SELECT d.lemd_kar_nik nik, SUM(${JAM_LEMBUR}) h FROM tlembur_dtl d
            INNER JOIN tlembur_hdr h2 ON h2.lem_nomor = d.lemd_lem_nomor AND d.lemd_panggilan = 1
            WHERE h2.lem_tanggal BETWEEN ? AND ? GROUP BY d.lemd_kar_nik
        ) p ON p.nik = k.kar_nik
        LEFT JOIN (/* bonus malam-libur: SPL >= 3 jam yang menyeret hari berikutnya (hari libur) */
            SELECT x.lemd_kar_nik nik, COUNT(*) c FROM (
                SELECT d.lemd_kar_nik, ${JAM_LEMBUR} lembur,
                    DATE_ADD(h2.lem_tanggal, INTERVAL 1 DAY) Tanggal
                FROM tlembur_dtl d
                INNER JOIN tlembur_hdr h2 ON h2.lem_nomor = d.lemd_lem_nomor
                WHERE h2.lem_tanggal BETWEEN ? AND ?
            ) x INNER JOIN tharilibur hl ON hl.hl_tanggal = x.Tanggal
            WHERE x.lembur >= 3 GROUP BY x.lemd_kar_nik
        ) bm ON bm.nik = k.kar_nik
        LEFT JOIN (/* bonus libur sesi 3-6 jam: bobot 0.5; SCR tidak dihitung saat security non-libur */
            SELECT a.nik, SUM(if((hl.hl_status_security = 0 AND k2.kar_jab_kode = 'SCR'), 0, 1)) c
            FROM tabsensi a
            INNER JOIN tharilibur hl ON a.tanggal = hl.hl_tanggal AND hl.hl_status = 1
            INNER JOIN tkaryawan k2 ON k2.kar_kode_absensi = a.nik
            AND k2.kar_kode_absensi IS NOT NULL AND k2.kar_kode_absensi <> ''
            WHERE a.tanggal BETWEEN ? AND ? AND a.status <> 0 AND a.scan1 <> '00:00:00'
                AND ${JAM_SCAN} > 3 AND ${JAM_SCAN} <= 6
            GROUP BY a.nik
        ) bl ON bl.nik = k.kar_kode_absensi
        LEFT JOIN (/* bonus libur sesi > 6 jam: bobot 2 */
            SELECT a.nik, SUM(if((hl.hl_status_security = 0 AND k2.kar_jab_kode = 'SCR'), 0, 1)) c
            FROM tabsensi a
            INNER JOIN tharilibur hl ON a.tanggal = hl.hl_tanggal AND hl.hl_status = 1
            INNER JOIN tkaryawan k2 ON k2.kar_kode_absensi = a.nik
            AND k2.kar_kode_absensi IS NOT NULL AND k2.kar_kode_absensi <> ''
            WHERE a.tanggal BETWEEN ? AND ? AND a.status <> 0 AND a.scan1 <> '00:00:00'
                AND ${JAM_SCAN} > 6
            GROUP BY a.nik
        ) bl2 ON bl2.nik = k.kar_kode_absensi
        LEFT JOIN (/* terlambat: scan dengan status = 2 (kode absensi kosong dikecualikan) */
            SELECT b.kar_nik nik, COUNT(*) c FROM tabsensi a
            INNER JOIN tkaryawan b ON b.kar_kode_absensi = a.nik
            WHERE b.kar_kode_absensi IS NOT NULL AND b.kar_kode_absensi <> ''
            AND a.tanggal BETWEEN ? AND ? AND a.status = 2 GROUP BY b.kar_nik
        ) tbn ON tbn.nik = k.kar_nik
        LEFT JOIN (/* ijin tidak masuk (jenis 3): 0=Sakit 1=Ijin 2=Alpha 3=Lain-lain */
            SELECT ij_nik nik,
                SUM(if(ij_keterangan = 0, 1, 0)) sakit, SUM(if(ij_keterangan = 1, 1, 0)) ijin,
                SUM(if(ij_keterangan = 2, 1, 0)) alpha, SUM(if(ij_keterangan = 3, 1, 0)) lain
            FROM tijin
            WHERE ij_tanggal BETWEEN ? AND ? AND ij_ji_id = 3
            GROUP BY ij_nik
        ) ij ON ij.nik = k.kar_nik
        WHERE k.kar_status_aktif = 1
    ) andi
    WHERE 1=1`
}

/* ── isiKet versi batch (hasil identik isiKet, query dikumpulkan) ── */
async function isiKetBatch(rows, start, end) {
    const nikList = rows.map((r) => r.Nik).filter((n) => n !== null && n !== undefined && n !== '')
    if (nikList.length === 0) return
    const chunkIn = nikList.map(() => '?').join(',')

    const byNik = (list) => {
        const m = new Map()
        for (const { nik, tgl } of list) {
            if (!m.has(nik)) m.set(nik, [])
            m.get(nik).push(tgl)
        }
        return m
    }

    /* Satu query per kategori ijin: nik + daftar tanggal. */
    const ambilKategori = async (jiId, ket) => {
        const [rs] = await pool.query(
            `SELECT ij_nik AS nik, ij_tanggal AS tgl FROM tijin
             WHERE ij_tanggal BETWEEN ? AND ? AND ij_ji_id = ? AND ij_keterangan = ?
             AND ij_nik IN (${chunkIn}) ORDER BY ij_nik, ij_tanggal`,
            [start, end, jiId, ket, ...nikList]
        )
        return rs.map((r) => ({ nik: r.nik, tgl: fmtKet(r.tgl) }))
    }

    const adaform = byNik(await ambilKategori(1, 3))
    const sakit = byNik(await ambilKategori(3, 0))
    const ijin = byNik(await ambilKategori(3, 1))
    const alpha = byNik(await ambilKategori(3, 2))
    const lainLain = byNik(await ambilKategori(3, 3))
    const [stRows] = await pool.query(
        `SELECT ij_nik AS nik, ij_tanggal AS tgl FROM tijin
         WHERE ij_tanggal BETWEEN ? AND ? AND ij_ji_id = 2
         AND ij_nik IN (${chunkIn}) ORDER BY ij_nik, ij_tanggal`,
        [start, end, ...nikList]
    )
    const setengah = byNik(stRows.map((r) => ({ nik: r.nik, tgl: fmtKet(r.tgl) })))

    /* Terlambat tanpa form: versi massal tanggalTerlambatTanpaForm. */
    const [tfRows] = await pool.query(
        `SELECT b.kar_Nik AS nik, a.tanggal AS tgl FROM tabsensi a
         INNER JOIN tkaryawan b ON a.nik = b.kar_kode_absensi
         LEFT JOIN tijin c ON c.ij_nik = kar_Nik AND c.ij_tanggal = a.tanggal
             AND c.ij_ji_id = 1 AND c.ij_keterangan = 3
         WHERE a.tanggal BETWEEN ? AND ? AND a.status = 2
         AND b.kar_Nik IN (${chunkIn}) AND c.ij_tanggal IS NULL
         ORDER BY b.kar_Nik, a.tanggal`,
        [start, end, ...nikList]
    )
    const tanpaform = byNik(tfRows.map((r) => ({ nik: r.nik, tgl: fmtKet(r.tgl) })))

    /* Tulis ke baris — struktur label sama dengan isiKet (label :tgl,tgl.). */
    for (const r of rows) {
        const nik = r.Nik
        if (r.terlambat > 0) {
            const ada = adaform.get(nik) || []
            const tanpa = tanpaform.get(nik) || []
            r.Adaform = ada.length ? ada.join(',') + '.' : ''
            r.Tanpaform = tanpa.length ? tanpa.join(',') + '.' : ''
        }
        if (r.sakit > 0 && sakit.get(nik)?.length) r.KetSakit = 'Sakit :' + sakit.get(nik).join(',') + '.'
        if (r.LainLain > 0 && lainLain.get(nik)?.length) r.KetLainLain = 'Lainlain :' + lainLain.get(nik).join(',') + '.'
        if (r.Ijin > 0 && ijin.get(nik)?.length) r.KetIjin = 'Ijin :' + ijin.get(nik).join(',') + '.'
        if (r.Alpha > 0 && alpha.get(nik)?.length) r.KetAlpha = 'Alpha :' + alpha.get(nik).join(',') + '.'
        if (r.ST_HARI > 0 && setengah.get(nik)?.length) r.KetSetengahaHari = 'Setengah Hari :' + setengah.get(nik).join(',') + '.'
    }
}

/* ── Cache memori: kunci "bulan:tahun:pabrik", TTL 10 menit ── */
const TTL_MS = 10 * 60 * 1000
const cache = new Map()

/** Baris analisis untuk periode+filter pabrik tertentu (tanpa cache) — dipakai endpoint & skrip verifikasi. */
export async function ambilAnalisis(start, end, pabrik) {
    let sql = rekapCepatSql()
    const params = [...Array(10).fill([start, end]).flat()] // 10 derived table × 2 titik tanggal

    // Filter pabrik: ALL = semua, STORE = pabrik berawalan K (gerai), atau kode spesifik.
    let where = ''
    if (pabrik === 'STORE') where = ` AND Pabrik LIKE 'K%'`
    else if (pabrik && pabrik !== 'ALL') where = ` AND Pabrik = ?`

    sql += where
    if (where.endsWith('= ?')) params.push(pabrik)

    const [rows] = await pool.query(sql, params)
    await isiKetBatch(rows, start, end)
    return rows
}

export const getAnalisisAbsensi = async (req, res, next) => {
    try {
        const now = new Date()
        const bulan = Math.min(12, Math.max(1, parseInt(req.query.bulan) || now.getMonth() + 1))
        const tahun = parseInt(req.query.tahun) || now.getFullYear()
        const start = `${tahun}-${String(bulan).padStart(2, '0')}-01`
        const end = `${tahun}-${String(bulan).padStart(2, '0')}-${new Date(tahun, bulan, 0).getDate()}`

        const pabrik = String(req.query.pabrik || 'ALL').trim()
        const refresh = String(req.query.refresh || '') === '1'

        const kunci = `${bulan}:${tahun}:${pabrik}`
        const cached = cache.get(kunci)
        if (!refresh && cached && Date.now() - cached.pada < TTL_MS) {
            return success(res, { ...cached.data, dariCache: true })
        }

        const rows = await ambilAnalisis(start, end, pabrik)
        const data = { bulan, tahun, start, end, pabrik, rows }
        cache.set(kunci, { pada: Date.now(), data })
        success(res, data)
    } catch (err) {
        next(err)
    }
}
