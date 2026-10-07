import pool from '../../config/database.js'
import ExcelJS from 'exceljs'
import { success, error } from '../../helpers/response.js'
import { sendExcel } from '../../helpers/excel.js'

/**
 * Proses Gaji — cerminan unit Delphi `ufrmProsesGaji` (`frmProsesGaji`).
 *
 *   GET  /gaji/proses?periode=&tahun=&start=&end=[&export=xlsx]   -> loaddataall
 *   POST /gaji/proses/process                                     -> RefreshClick
 *        (getminggu + InsertNilai, satu transaksi)
 *   PUT  /gaji/proses                                             -> simpandata
 *   POST /gaji/proses/load-potongan (multipart: file)             -> Button2Click
 *
 * Angka-angka penting meniru konstanta & rumus Delphi apa adanya:
 *   adefaulthari = 22, adefaultbonuslibur = 0, adefaultbonusmlibur = 0.
 * Fungsi bantu (getminggu/getpremi/getpremi2/getharimakan/getkoperasi/
 * getpotongan) di Delphi memanggil SQL per baris per tanggal; di sini seluruh
 * data periode dimuat sekali ke memori lalu dihitung di JavaScript — hasilnya
 * sama, jauh lebih cepat.
 */

const HARI_DEFAULT = 22
const BONUS_MLIBUR_DEFAULT = 0
/** Tanggal "ajaib" yang dikecualikan pada beberapa query ijin Delphi. */
const TGL_KECUALI = '2019-09-06'
const RE_TGL = /^\d{4}-\d{2}-\d{2}$/

/* ── Tanggal (murni kalender, tanpa timezone JS) ─────────────────────── */

function parseTgl(s) {
    const [y, m, d] = String(s).split('-').map(Number)
    return new Date(y, m - 1, d)
}
function fmtTgl(d) {
    const p = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
function tambahHari(s, n) {
    const d = parseTgl(s)
    d.setDate(d.getDate() + n)
    return fmtTgl(d)
}
const num = (v) => {
    if (v === null || v === undefined || v === '') return 0
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
}
/** Kutip string SQL yang sudah divalidasi format tanggalnya. */
const qTgl = (s) => `'${s}'`

/* ── SQL ─────────────────────────────────────────────────────────────── */

/**
 * InsertNilai (ufrmProsesGaji.pas) — dipindahkan huruf per huruf dari
 * Delphi; `%START%` / `%END%` diganti tanggal yang sudah divalidasi.
 * Nama kolom hasil (Nik, Nama, "2 Jam Pertama", ...) menyesuaikan Delphi,
 * dipetakan ulang di `petakanBaris()`.
 */
const SQL_NILAI = `SELECT kar_nik Nik,kar_nama Nama,kar_pab_kode Pabrik,jab_kode,jab_nama Jabatan,kar_bagian Bagian,jml_hari Total_Hari,2jam "2 Jam Pertama",lembur-panggilan-2jam "Lebih dari 2 Jam",panggilan Panggilan ,lembur "TotalLembur",bonus_mlm_lbr "Bonus Malam Libur",(Bonus_Libur*0.5)+Bonus_Libur2 Bonus_libur,kar_GAPOK,kar_T_makan,kar_t_hadir,kar_t_jabatan,kar_t_transport,kar_t_lain,kar_t_bpjs ,kar_sistem_gaji,masakerja,ifnull((select nilai from ttablepremi where tahun = masakerja),0) tmasakerja,kar_status_premi,Terlambat,St_hari,Sakit,Ijin,Alpha,kar_iskhusus,kar_tanpamasakerja,bonus_libur3 from
 ( select kar_tanpamasakerja,kar_iskhusus,kar_nik,kar_nama,jab_kode,jab_nama jab_nama,kar_pab_kode,kar_bagian,
 kar_GAPOK,kar_T_makan,kar_t_hadir,kar_t_jabatan,kar_t_transport,kar_t_lain,kar_t_bpjs ,kar_sistem_gaji,floor(datediff(%END%,kar_tgl_masuk)/365) masakerja,
 kar_status_premi ,count(*) -
 ((select count(*) from zijin  where ij_tanggal between %START% and %END%
 and ij_nik=kar_nik and ij_ji_id=2) * 0.5) jml_hari,
 ifnull((select (sum(if ( timediff(lemd_jamakhir,lemd_jammulai) < 0 , (time_to_sec((timediff("24:00:00",lemd_jammulai))))/3600
 + (time_to_sec((timediff(lemd_jamakhir,"00:00:00"))))/3600  ,(time_to_sec((timediff(lemd_jamakhir,lemd_jammulai))))/3600 )))  lembur
 from tlembur_dtl inner join tlembur_hdr on lem_nomor=lemd_lem_nomor where lem_tanggal
 between %START% and %END% and lemd_kar_nik=kar_nik),0) lembur,
 ifnull((select sum(if(if ( timediff(lemd_jamakhir,lemd_jammulai) < 0 ,
 (time_to_sec((timediff("24:00:00",lemd_jammulai))))/3600 + (time_to_sec((timediff(lemd_jamakhir,"00:00:00"))))/3600  ,
 (time_to_sec((timediff(lemd_jamakhir,lemd_jammulai))))/3600 ) >if(kar_sistem_gaji="Harian",1,2),if(kar_sistem_gaji="Harian",1,2),(time_to_sec((timediff(lemd_jamakhir,lemd_jammulai))))/3600)) 2jam
 from tlembur_dtl inner join tlembur_hdr on lem_nomor=lemd_lem_nomor and lemd_panggilan <> 1
 where lem_tanggal between %START% and %END%  and lem_tanggal not in (select hl_tanggal from tharilibur where hl_status=1)
 and lemd_kar_nik=kar_nik ),0) 2jam ,
 ifnull((select (sum(if ( timediff(lemd_jamakhir,lemd_jammulai) < 0 , (time_to_sec((timediff("24:00:00",lemd_jammulai))))/3600
 + (time_to_sec((timediff(lemd_jamakhir,"00:00:00"))))/3600  ,(time_to_sec((timediff(lemd_jamakhir,lemd_jammulai))))/3600 )))  panggilan
 from tlembur_dtl inner join tlembur_hdr on lem_nomor=lemd_lem_nomor and lemd_panggilan = 1 where lem_tanggal  between %START% and %END%
 and lemd_kar_nik=kar_nik),0) panggilan,
 (select count(*) from (
 select lemd_kar_nik,if ( timediff(lemd_jamakhir,lemd_jammulai) < 0 , (time_to_sec((timediff("24:00:00",lemd_jammulai))))/3600 + (time_to_sec((timediff(lemd_jamakhir,"00:00:00"))))/3600
 ,(time_to_sec((timediff(lemd_jamakhir,lemd_jammulai))))/3600 )  lembur,
 date_add(lem_tanggal, interval 1 day) Tanggal
 from tlembur_dtl inner join tlembur_hdr on lem_nomor=lemd_lem_nomor
 where lem_tanggal between %START% and %END%) a
 inner join tharilibur on hl_tanggal=a.tanggal and hl_status=1
 where lembur >= 3 and lemd_kar_nik=kar_nik) bonus_mlm_lbr,
 (select ifnull(SUM(if((hl_status_security=0 AND kar_jab_Kode="SCR" And kar_pab_kode <> "P01") ,0,1)),0) from tabsensi
 inner join tharilibur  on tanggal=hl_tanggal and hl_status=1
 where status <> 0
 and (case when  scan2 < scan1 then 24 else 0 end +(TIME_TO_SEC((TIMEDIFF(scan2,scan1))))/3600)  > 3
 and (case when  scan2 < scan1 then 24 else 0 end +(TIME_TO_SEC((TIMEDIFF(scan2,scan1))))/3600)  <= 6
 and scan1 <> "00:00:00"
 and nik=a.nik and tanggal between %START% and %END%) bonus_libur,
 (select ifnull(SUM(if((hl_status_security=0 AND kar_jab_Kode="SCR" AND kar_pab_kode <> "P01") ,0,1)),0) from tabsensi
 inner join tharilibur  on tanggal=hl_tanggal and hl_status=1
 where status <> 0
 and (case when  scan2 < scan1 then 24 else 0 end +(TIME_TO_SEC((TIMEDIFF(scan2,scan1))))/3600)  > 6
 and scan1 <> "00:00:00"
 and nik=a.nik and tanggal between %START% and %END%) bonus_libur2,
 (select ifnull(SUM(if((hl_status_security=0 AND kar_jab_Kode="SCR" AND kar_pab_kode <> "P01") ,0,1)),0) from tabsensi
 inner join tharilibur  on tanggal=hl_tanggal and hl_status=0
 where status <> 0
 and (case when  scan2 < scan1 then 24 else 0 end +(TIME_TO_SEC((TIMEDIFF(scan2,scan1))))/3600)  > 6
 and scan1 <> "00:00:00"
 and nik=a.nik and tanggal between %START% and %END%) bonus_libur3,
 (select count(*) from zijin where ij_tanggal between %START% and %END% and ij_ji_id=1 and ij_nik=kar_nik) terlambat,
 (select count(*) from zijin where ij_tanggal between %START% and %END% and ij_ji_id=2 and ij_nik=kar_nik) ST_HARI,
 (select count(*) from zijin where ij_tanggal between %START% and %END% and ij_ji_id=3 and ij_nik=kar_nik and ij_keterangan=0) sakit,
 (select count(*) from zijin where ij_tanggal between %START% and %END% and ij_ji_id=3 and ij_nik=kar_nik and ij_keterangan=1) Ijin,
 (select count(*) from zijin where ij_tanggal between %START% and %END% and ij_ji_id=3 and ij_nik=kar_nik and ij_keterangan=2) Alpha
 from tkaryawan left join tabsensi a
 on kar_kode_absensi=nik
 left join tjabatan on kar_jab_kode=jab_kode
 where ((tanggal between %START% and %END%
 and scan1 <> "00:00:00"
 and status <> 0 ) OR kar_kode_absensi = "" ) and kar_status_aktif =1 and kar_gapok > 0
 group by kar_nik) final`

/** Kolom `tgajibulanan` yang diisi InsertNilai (urutan sama seperti Delphi). */
const KOL_INSERT = [
    'gb_kar_nik', 'gb_pab_kode', 'gb_periode', 'gb_tahun', 'gb_periodeawal', 'gb_periodeakhir',
    'gb_kar_jab_kode', 'gb_kar_bagian', 'gb_harimasuk', 'gb_lembur2jam', 'gb_lembur', 'gb_lemburp',
    'gb_bonusmlibur', 'gb_bonuslibur', 'gb_gapok', 'gb_makan', 'gb_tmakan', 'gb_premi', 'gb_tjabatan',
    'gb_ttransport', 'gb_tlain', 'gb_bpjs', 'gb_tlembur2jam', 'gb_tlembur', 'gb_tlemburp',
    'gb_sistem_gaji', 'gb_masakerja', 'gb_tmasakerja', 'gb_hari_premi', 'gb_koperasi', 'gb_potongan',
]

/** loaddataall — pembulatan & alias persis tampilan grid Delphi. */
const SQL_PROSES = `SELECT gb_kar_nik AS nik,
    kar_nama AS nama,
    kar_bagian AS bagian,
    gb_pab_kode AS pabrik,
    gb_gapok AS gapok,
    gb_harimasuk AS harimasuk,
    gb_premi AS premi,
    gb_hari_premi AS haripremi,
    gb_tmakan AS makan,
    gb_makan AS harimakan,
    gb_tjabatan AS tjabatan,
    gb_tmasakerja AS tmasakerja,
    gb_tlain AS tlain,
    gb_lembur2jam AS harilembur2,
    IFNULL(gb_tlembur2jam / gb_lembur2jam, 0) AS tlembur2,
    gb_lembur AS harilembur,
    IFNULL(gb_tlembur / gb_lembur, 0) AS tlembur,
    gb_lemburp AS harilemburp,
    IFNULL(gb_tlemburp / gb_lemburp, 0) AS tlemburp,
    gb_bonuslibur AS bonuslibur,
    gb_bonusmlibur AS bonusmlibur,
    gb_bpjs AS bpjs,
    gb_koperasi AS koperasi,
    gb_potongan AS potongan,
    gb_sp AS skill,
    ((round((((gb_gapok*gb_harimasuk)+(gb_premi*gb_hari_premi)+(gb_makan*gb_tmakan)+gb_tjabatan+gb_tmasakerja+gb_tlain+
     (gb_tlembur2jam)+(gb_tlembur)+(gb_tlemburp)+gb_bonuslibur+gb_bonusmlibur) - (gb_bpjs+gb_koperasi+gb_potongan+gb_sp))/100)*100)) AS total,
    IFNULL(kar_rekeningbank, '') AS rekening,
    (SELECT COUNT(*) FROM tijin WHERE ij_tanggal BETWEEN ? AND ? AND ij_ji_id=2 AND ij_nik=gb_kar_nik) AS sthari,
    (SELECT COUNT(*) FROM tijin WHERE ij_tanggal BETWEEN ? AND ? AND ij_ji_id=3 AND ij_nik=gb_kar_nik AND ij_keterangan=0) AS sakit,
    (SELECT COUNT(*) FROM tijin WHERE ij_tanggal BETWEEN ? AND ? AND ij_ji_id=3 AND ij_nik=gb_kar_nik AND ij_keterangan=1) AS ijin,
    (SELECT COUNT(*) FROM tijin WHERE ij_tanggal BETWEEN ? AND ? AND ij_ji_id=3 AND ij_nik=gb_kar_nik AND ij_keterangan=2) AS alpha
  FROM tgajibulanan
  INNER JOIN tkaryawan ON kar_nik = gb_kar_nik
  LEFT JOIN tjabatan ON jab_kode = gb_kar_jab_kode
  WHERE gb_gapok > 0 AND gb_periode = ? AND gb_tahun = ?
  ORDER BY gb_kar_nik`

/** Nama kolom grid (Delphi: loaddataall -> CDSLembur). */
const PROSES_COLUMNS = [
    'nik', 'nama', 'bagian', 'pabrik', 'gapok', 'harimasuk', 'premi', 'haripremi', 'makan',
    'harimakan', 'tjabatan', 'tmasakerja', 'tlain', 'harilembur2', 'tlembur2', 'harilembur',
    'tlembur', 'harilemburp', 'tlemburp', 'bonuslibur', 'bonusmlibur', 'bpjs', 'koperasi',
    'potongan', 'skill', 'total', 'rekening', 'sthari', 'sakit', 'ijin', 'alpha',
]

/** Kolom yang boleh diedit & disimpan `simpandata`. */
const KOLOM_EDIT = ['bpjs', 'koperasi', 'potongan', 'skill', 'bonuslibur', 'sthari', 'sakit', 'ijin', 'alpha']

function bacaPeriode(req) {
    const periode = parseInt(req.query.periode ?? req.body?.periode, 10)
    const tahun = parseInt(req.query.tahun ?? req.body?.tahun, 10)
    const start = String(req.query.start ?? req.body?.start ?? '').trim()
    const end = String(req.query.end ?? req.body?.end ?? '').trim()
    if (!Number.isInteger(periode) || periode < 1 || periode > 12) return { salah: 'Bulan tidak valid (1-12)' }
    if (!Number.isInteger(tahun) || tahun < 2000 || tahun > 2100) return { salah: 'Tahun tidak valid' }
    if (!RE_TGL.test(start) || !RE_TGL.test(end)) return { salah: 'Tanggal mulai/akhir tidak valid' }
    if (end < start) return { salah: 'Tanggal akhir harus setelah tanggal awal' }
    return { periode, tahun, start, end }
}

/* ── loaddataall ─────────────────────────────────────────────────────── */

export const getProsesList = async (req, res, next) => {
    try {
        const p = bacaPeriode(req)
        if (p.salah) return error(res, p.salah, 400)
        const params = [p.start, p.end, p.start, p.end, p.start, p.end, p.start, p.end, p.periode, p.tahun]

        if (req.query.export === 'xlsx') {
            const [rows] = await pool.query(SQL_PROSES, params)
            return sendExcel(res, 'Proses Gaji', PROSES_COLUMNS, rows)
        }

        const [rows] = await pool.query(SQL_PROSES, params)
        success(res, rows)
    } catch (err) {
        next(err)
    }
}

/* ── RefreshClick: getminggu + InsertNilai ───────────────────────────── */

export const jalankanProsesGaji = async (req, res, next) => {
    try {
        const p = bacaPeriode(req)
        if (p.salah) return error(res, p.salah, 400)

        const conn = await pool.getConnection()
        let jumlah = 0
        try {
            jumlah = await prosesPeriode(conn, p)
        } finally {
            conn.release()
        }
        success(res, { jumlah }, `Proses gaji selesai, ${jumlah} karyawan diproses`)
    } catch (err) {
        next(err)
    }
}

async function prosesPeriode(conn, { periode, tahun, start, end }) {
    await conn.beginTransaction()
    try {
        const libur = await muatLibur(conn, start, end)
        await getminggu(conn, start, end, libur)
        await conn.query('DELETE FROM tgajibulanan WHERE gb_periode = ? AND gb_tahun = ?', [periode, tahun])

        const sql = SQL_NILAI.replaceAll('%START%', qTgl(start)).replaceAll('%END%', qTgl(end))
        const [rows] = await conn.query(sql)

        const bantu = await muatBantuan(conn, { periode, tahun, start, end, libur })
        const values = rows.map((r) => hitungBaris(petakanBaris(r), bantu, { periode, tahun, start, end }))
        await simpanBaris(conn, values)
        await conn.commit()
        return values.length
    } catch (err) {
        await conn.rollback().catch(() => {})
        throw err
    }
}

/** Set tanggal merah pada periode (ceklibur Delphi), s/d end + 1 hari. */
async function muatLibur(conn, start, end) {
    const [rows] = await conn.query(
        'SELECT hl_tanggal FROM tharilibur WHERE hl_tanggal BETWEEN ? AND ?',
        [start, tambahHari(end, 1)]
    )
    return new Set(rows.map((r) => r.hl_tanggal))
}

/**
 * getminggu — hapus baris lama periode ini lalu isi ulang nomor minggu:
 * minggu bertambah saat `i` mencapai 6 selama `a < 4`, dan hanya hari
 * non-libur yang dicatat.
 */
async function getminggu(conn, start, end, libur) {
    await conn.query('DELETE FROM tminggu WHERE tgl BETWEEN ? AND ?', [start, end])

    const baris = []
    let i = 0
    let a = 1
    for (let t = start; t <= end; t = tambahHari(t, 1)) {
        if (a < 4 && i === 6) {
            i = 0
            a += 1
        }
        if (!libur.has(t)) {
            i += 1
            baris.push([t, a])
        }
    }
    for (let n = 0; n < baris.length; n += 500) {
        const chunk = baris.slice(n, n + 500)
        const sql = `INSERT IGNORE INTO tminggu (tgl, mingguke) VALUES ${chunk.map(() => '(?,?)').join(',')}`
        await conn.query(sql, chunk.flat())
    }
}

/** Peta nama kolom Delphi -> struktur ringkas yang dipakai kalkulasi. */
function petakanBaris(r) {
    const x = {}
    for (const k of Object.keys(r)) x[k.toLowerCase()] = r[k]
    return {
        nik: x.nik,
        pabrik: x.pabrik,
        jab_kode: x.jab_kode,
        bagian: x.bagian,
        total_hari: num(x.total_hari),
        jam2: num(x['2 jam pertama']),
        lembur2: num(x['lebih dari 2 jam']),
        panggilan: num(x.panggilan),
        bonus_mlm_libur: num(x['bonus malam libur']),
        bonus_libur: num(x.bonus_libur),
        gapok: num(x.kar_gapok),
        tmakan: num(x.kar_t_makan),
        t_hadir: num(x.kar_t_hadir),
        t_jabatan: num(x.kar_t_jabatan),
        t_transport: num(x.kar_t_transport),
        t_lain: num(x.kar_t_lain),
        t_bpjs: num(x.kar_t_bpjs),
        sistem: String(x.kar_sistem_gaji ?? ''),
        masakerja: num(x.masakerja),
        tmasakerja: num(x.tmasakerja),
        status_premi: num(x.kar_status_premi),
        is_khusus: num(x.kar_iskhusus),
        tanpa_masakerja: num(x.kar_tanpamasakerja),
        bonus_libur3: num(x.bonus_libur3),
    }
}

/**
 * Muat sekali seluruh data referensi yang di Delphi di-query berulang kali
 * per karyawan per tanggal (absensi, ijin, minggu, premi, potongan).
 */
async function muatBantuan(conn, { periode, tahun, start, end, libur }) {
    const liburSet = libur
    const [kars] = await conn.query(
        'SELECT kar_nik, kar_kode_absensi, kar_status_aktif FROM tkaryawan'
    )
    const kodeByNik = new Map()
    const tanpaAbsensi = new Set()
    for (const k of kars) {
        const kode = k.kar_kode_absensi || ''
        kodeByNik.set(k.kar_nik, kode)
        if (num(k.kar_status_aktif) === 1 && kode === '') tanpaAbsensi.add(k.kar_nik)
    }

    // Absensi s/d end + 1 hari (getpremi membaca sampai end + 1).
    const [atts] = await conn.query(
        'SELECT nik AS kode, tanggal, status, scan1 FROM tabsensi WHERE tanggal BETWEEN ? AND ?',
        [start, tambahHari(end, 1)]
    )
    const absen = new Map()
    const absenValid = new Map()
    for (const a of atts) {
        absen.set(`${a.kode}|${a.tanggal}`, a)
        if (a.tanggal >= start && a.tanggal <= end && num(a.status) !== 0 && a.scan1 !== '00:00:00') {
            absenValid.set(a.kode, (absenValid.get(a.kode) || 0) + 1)
        }
    }

    const [ijins] = await conn.query(
        `SELECT ij_nik, ij_tanggal, ij_ji_id, ij_keterangan, TRIM(UPPER(ij_alasan)) AS alasan
         FROM tijin WHERE ij_tanggal BETWEEN ? AND ?`,
        [start, end]
    )
    const setengahHari = new Set()
    const tidakMasuk = new Map()
    const ijinDicatat = new Set()
    const jmlSetengahHari = new Map()
    for (const i of ijins) {
        const key = `${i.ij_nik}|${i.ij_tanggal}`
        const kecuali = i.ij_tanggal === TGL_KECUALI
        if (num(i.ij_ji_id) === 2) {
            setengahHari.add(key)
            if (!kecuali) jmlSetengahHari.set(i.ij_nik, (jmlSetengahHari.get(i.ij_nik) || 0) + 1)
        } else if (num(i.ij_ji_id) === 3) {
            // 0 SAKIT 1 IJIN 2 ALPHA 3 LAIN; LELAYU / HO LIBUR dipaksa 0.
            tidakMasuk.set(
                key,
                i.alasan === 'LELAYU' || i.alasan === 'HO LIBUR' ? 0 : num(i.ij_keterangan)
            )
        }
        if ((num(i.ij_ji_id) === 2 || num(i.ij_ji_id) === 3) && !kecuali) ijinDicatat.add(key)
    }

    const [mgs] = await conn.query('SELECT tgl, mingguke FROM tminggu WHERE tgl BETWEEN ? AND ?', [
        start,
        end,
    ])
    const mingguOf = new Map()
    const tanggalPerMinggu = new Map()
    let maxMinggu = 0
    for (const m of mgs) {
        mingguOf.set(m.tgl, num(m.mingguke))
        if (!tanggalPerMinggu.has(m.mingguke)) tanggalPerMinggu.set(m.mingguke, [])
        tanggalPerMinggu.get(m.mingguke).push(m.tgl)
        if (num(m.mingguke) > maxMinggu) maxMinggu = num(m.mingguke)
    }

    // getkoperasi / getpotongan: membaca bulan SEBELUMNYA.
    const [prevPeriode, prevTahun] = periode === 1 ? [12, tahun - 1] : [periode - 1, tahun]
    const [prev] = await conn.query(
        `SELECT gb_kar_nik, IFNULL(gb_koperasi,0) AS koperasi, IFNULL(gb_potongan,0) AS potongan
         FROM tgajibulanan WHERE gb_periode = ? AND gb_tahun = ?`,
        [prevPeriode, prevTahun]
    )
    const koperasiByNik = new Map(prev.map((r) => [r.gb_kar_nik, num(r.koperasi)]))
    const potonganByNik = new Map(prev.map((r) => [r.gb_kar_nik, num(r.potongan)]))

    const cekAbsensi = (nik, tgl) => {
        const kode = kodeByNik.get(nik)
        if (kode === undefined) return false
        const a = absen.get(`${kode}|${tgl}`)
        return !!a && num(a.status) !== 0
    }

    /** getpremi — jumlah minggu yang berhak premi hadir. */
    const getPremi = (nik) => {
        let ahari = 0
        let apremi = 0
        let i = 0
        let a = 1
        const end1 = tambahHari(end, 1)
        for (let t = start; t <= end1; t = tambahHari(t, 1)) {
            if (a < maxMinggu) {
                if (i === 5) {
                    i = 0
                    if (ahari >= 4.5) apremi += 1
                    ahari = 0
                    a += 1
                }
            } else if (t === end1) {
                if (ahari >= i - 0.5) apremi += 1
                ahari = 0
            }
            if (!liburSet.has(t)) {
                if (cekAbsensi(nik, t)) {
                    if (setengahHari.has(`${nik}|${t}`) && t !== TGL_KECUALI) ahari += 0.5
                    else ahari += 1
                }
                i += 1
            }
        }
        return apremi
    }

    /** getharimakan — hari makan: absensi valid dikurangi ijin setengah hari. */
    const getHariMakan = (nik) => {
        const kode = kodeByNik.get(nik) ?? ''
        let hasil = (absenValid.get(kode) || 0) - (jmlSetengahHari.get(nik) || 0)
        if (tanpaAbsensi.has(nik)) hasil = 22
        return hasil
    }

    /** getpremi2 — hari absen pada minggu yang berisi ijin/alpha. */
    const getPremi2 = (nik) => {
        const temp = new Map()
        const isiMinggu = (w) => {
            for (const d of tanggalPerMinggu.get(w) || []) if (!temp.has(d)) temp.set(d, 0)
        }
        for (let t = start; t <= end; t = tambahHari(t, 1)) {
            if (liburSet.has(t)) continue
            const key = `${nik}|${t}`
            const j = tidakMasuk.has(key) ? tidakMasuk.get(key) : 9
            const w = mingguOf.get(t)
            if (j === 1) {
                if (w !== undefined) isiMinggu(w)
                temp.set(t, 1)
            } else if (j === 2) {
                if (w !== undefined) {
                    isiMinggu(w)
                    isiMinggu(w + 1)
                }
                temp.set(t, 1)
            } else if (j === 3 || j === 0) {
                if (temp.has(t)) temp.set(t, 1)
            }
        }
        for (const [tgl, st] of temp) {
            if (st === 0 && ijinDicatat.has(`${nik}|${tgl}`)) temp.set(tgl, 1)
        }
        const kode = kodeByNik.get(nik) ?? ''
        let n = 0
        for (const [tgl, st] of temp) {
            if (st === 0 && absen.has(`${kode}|${tgl}`)) n += 1
        }
        return n
    }

    return {
        libur: liburSet,
        getPremi,
        getHariMakan,
        getPremi2,
        getKoperasi: (nik) => koperasiByNik.get(nik) || 0,
        getPotongan: (nik) => potonganByNik.get(nik) || 0,
    }
}

/** Satu baris INSERT `tgajibulanan` — urutan nilai = urutan KOL_INSERT. */
function hitungBaris(r, b, { periode, tahun, start, end }) {
    const nik = r.nik
    const gapok = r.gapok

    // aharimasuk
    const aharimasuk =
        r.sistem === 'Harian' ? r.total_hari : HARI_DEFAULT + r.bonus_libur + r.bonus_libur3

    // aharipremi
    let aharipremi = 0
    if (r.t_hadir > 0) {
        if (r.status_premi === 1) {
            aharipremi = b.getPremi(nik)
        } else {
            aharipremi = b.getHariMakan(nik) - b.getPremi2(nik)
        }
    }

    // tlain / tmasakerja
    const tlain = r.is_khusus === 1 ? r.t_lain * aharimasuk : r.t_lain
    const tmasakerja = r.tanpa_masakerja === 1 ? 0 : r.tmasakerja * gapok * HARI_DEFAULT
    const tjabatan = (r.t_jabatan * gapok * HARI_DEFAULT) / 100
    const tlembur2jam = (gapok / 7) * (75 / 100) * r.jam2
    const tlembur = (gapok / 7) * r.lembur2
    const tlemburp = (gapok / 7) * r.panggilan

    return [
        nik,
        r.pabrik,
        periode,
        tahun,
        start,
        end,
        r.jab_kode,
        r.bagian,
        aharimasuk,
        r.jam2,
        r.lembur2,
        r.panggilan,
        r.bonus_mlm_libur * BONUS_MLIBUR_DEFAULT,
        r.bonus_libur * gapok,
        gapok,
        b.getHariMakan(nik),
        r.tmakan,
        r.t_hadir,
        tjabatan,
        r.t_transport,
        tlain,
        r.t_bpjs,
        tlembur2jam,
        tlembur,
        tlemburp,
        r.sistem,
        r.masakerja,
        tmasakerja,
        aharipremi,
        b.getKoperasi(nik),
        b.getPotongan(nik),
    ]
}

async function simpanBaris(conn, values) {
    for (let n = 0; n < values.length; n += 100) {
        const chunk = values.slice(n, n + 100)
        const sql = `INSERT INTO tgajibulanan (${KOL_INSERT.join(',')}) VALUES ${chunk
            .map(() => `(${KOL_INSERT.map(() => '?').join(',')})`)
            .join(',')}`
        await conn.query(sql, chunk.flat())
    }
}

/* ── simpandata ──────────────────────────────────────────────────────── */

export const saveProsesGaji = async (req, res, next) => {
    try {
        const p = bacaPeriode(req)
        if (p.salah) return error(res, p.salah, 400)
        const rows = Array.isArray(req.body?.rows) ? req.body.rows : null
        if (!rows || rows.length === 0) return error(res, 'Tidak ada data untuk disimpan', 400)

        const conn = await pool.getConnection()
        let jml = 0
        try {
            await conn.beginTransaction()
            for (const r of rows) {
                const nik = String(r?.nik ?? '').trim()
                if (!nik) continue
                await conn.query(
                    `UPDATE tgajibulanan SET gb_bpjs = ?, gb_koperasi = ?, gb_potongan = ?,
                        gb_sp = ?, gb_bonuslibur = ?, gb_sthari = ?, gb_sakit = ?, gb_ijin = ?, gb_alpha = ?
                     WHERE gb_kar_nik = ? AND gb_periode = ? AND gb_tahun = ?`,
                    [
                        num(r.bpjs),
                        num(r.koperasi),
                        num(r.potongan),
                        num(r.skill),
                        num(r.bonuslibur),
                        num(r.sthari),
                        num(r.sakit),
                        num(r.ijin),
                        num(r.alpha),
                        nik,
                        p.periode,
                        p.tahun,
                    ]
                )
                jml += 1
            }
            await conn.commit()
        } catch (err) {
            await conn.rollback().catch(() => {})
            throw err
        } finally {
            conn.release()
        }
        success(res, { jumlah: jml }, `${jml} baris berhasil disimpan`)
    } catch (err) {
        next(err)
    }
}

/* ── Load Potongan (Button2Click: baca Excel lalu isi grid) ──────────── */

function teksSel(cell) {
    const v = cell?.value
    if (v === null || v === undefined) return ''
    if (typeof v === 'string') return v.trim()
    if (typeof v === 'number') return String(v)
    if (v instanceof Date) return ''
    if (typeof v === 'object') {
        if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('').trim()
        if (v.text !== undefined && v.text !== null) return String(v.text).trim()
        if (v.result !== undefined && v.result !== null) return String(v.result).trim()
    }
    return ''
}
function angkaSel(cell) {
    const t = teksSel(cell)
    if (!t) return 0
    const n = Number(t.replace(/[^0-9.-]/g, ''))
    return Number.isFinite(n) ? n : 0
}

export const loadPotongan = async (req, res, next) => {
    try {
        if (!req.file?.buffer) return error(res, 'Berkas Excel belum dipilih', 400)

        const wb = new ExcelJS.Workbook()
        await wb.xlsx.load(req.file.buffer)
        const ws = wb.worksheets[0]
        if (!ws) return error(res, 'Berkas tidak memuat lembar kerja', 400)

        const rows = []
        ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
            if (rowNumber === 1) return // baris pertama = judul (Delphi mulai baris 2)
            const nik = teksSel(row.getCell(1))
            if (!nik) return
            rows.push({
                nik,
                potongan: angkaSel(row.getCell(3)),
                skill: angkaSel(row.getCell(4)),
                koperasi: angkaSel(row.getCell(5)),
                bpjs: angkaSel(row.getCell(6)),
            })
            if (rows.length >= 10000) return false
        })

        success(res, { jumlah: rows.length, rows }, `${rows.length} baris dibaca dari berkas`)
    } catch (err) {
        next(err)
    }
}
