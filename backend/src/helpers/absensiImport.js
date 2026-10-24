import ExcelJS from 'exceljs'
import * as XLSX from 'xlsx'
import { mdbKeExcelPeriode } from './absensiMdb.js'

export const HEADER_NIK = ['nik', 'kar_nik', 'kode', 'kode_absensi', 'code', 'userid', 'user id', 'badge']
export const HEADER_TANGGAL = ['tanggal', 'tgl', 'date', 'tanggal scan', 'tanggal_absen']
export const HEADER_JAM = ['scan', 'checktime', 'check time', 'waktu', 'time', 'jam', 'jam scan']
export const HEADER_TIPE = ['tipe', 'type', 'checktype', 'check type', 'status']

/** XLS menyimpan jam Excel sebagai pecahan hari. Nilai lain tetap diteruskan. */
export function jamExcelKeTeks(jam) {
    if (typeof jam !== 'number' || jam < 0 || jam >= 1) return jam
    const detik = Math.round(jam * 86400) % 86400
    const p = (v) => String(v).padStart(2, '0')
    return `${p(Math.floor(detik / 3600))}:${p(Math.floor(detik / 60) % 60)}:${p(detik % 60)}`
}

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
 * Normalisasi input jam ("08:05", "8:5:3", "080500", Date) menjadi "HH:MM:SS".
 * Catatan: Date diarahkan ke zona lokal (nilai dari DB/form), sedangkan Date
 * asal berkas Excel ditangani khusus oleh parseBaris lewat jamHMSExcel karena
 * ExcelJS menyatakan serial Excel sebagai Date UTC.
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

/** Jam dinding DateExcel: ExcelJS menyatakan serial Excel sebagai Date UTC,
 * jadi komponen pasarnya diambil dengan getter UTC, bukan zona lokal server
 * (getter lokal menggeser jam sebesar selisih zona waktu). */
function jamHMSExcel(d) {
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '00:00:00'
    const p = (n) => String(n).padStart(2, '0')
    return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`
}

/**
 * Terima tanggal Excel (nomor seri), Date, "YYYY-MM-DD", "DD/MM/YYYY", atau
 * "DD/MM/YY". Akhiran jam ("DD/MM/YY 08:45:02", "YYYY-MM-DD HH:MM:SS") diabaikan.
 * Bila bagian "bulan" dari pembacaan DD/MM melebihi 12, teks dibaca sebagai
 * MM/DD — format ekspor mesin absensi berformat Amerika ("10/16/26" = 16 Okt).
 */
export function normTanggal(v) {
    if (v === null || v === undefined || v === '') return null
    if (v instanceof Date) return v.toISOString().slice(0, 10)
    if (typeof v === 'number' && v > 20000 && v < 60000) {
        // nomor seri Excel (basis 1899-12-30)
        const ms = Math.round((v - 25569) * 86400 * 1000)
        return new Date(ms).toISOString().slice(0, 10)
    }
    // Buang bagian jam agar format dua digit tahun tetap terbaca.
    const s = String(v).trim().split(/[\sT]+/)[0]
    const pad = (n) => String(n).padStart(2, '0')
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s)
    if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`
    m = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4}|\d{2})$/.exec(s)
    if (m) {
        let hari = Number(m[1])
        let bulan = Number(m[2])
        if (bulan > 12) [hari, bulan] = [bulan, hari]
        if (hari < 1 || hari > 31 || bulan < 1 || bulan > 12) return null
        return `${m[3].length === 2 ? '20' : ''}${m[3]}-${pad(bulan)}-${pad(hari)}`
    }
    return null
}

const at = (values, i) => (i === undefined ? undefined : values[i])

/**
 * Baca satu baris hasil ekspor mesin absensi memakai peta header, mis.
 *   NIK / kode / userid  |  tanggal / tgl / date  |  scan / checktime  |  tipe / type
 * Bila berkas tanpa baris header, dipakai urutan tetap 4 kolom
 * (nik, tanggal, jam, tipe) yang sama dengan tabel `checkinout`.
 *
 * Isi kolom NIK disimpan apa adanya ke `tabsensi2.nik`, yang berisi `kar_Nik`.
 */
export function parseBaris(values, path, header) {
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

    // Kolom tanggal/jam bisa sama-sama memuat datetime: sel Excel terbaca Date
    // (ExcelJS menyatakannya sebagai UTC). Kolom tanggal teks diutamakan; bila
    // gagal dibaca, tanggal diambil dari kolom jam.
    let tanggal = normTanggal(tgl)
    let jamTeks
    if (jam instanceof Date) {
        jamTeks = jamHMSExcel(jam)
        if (!tanggal) tanggal = jam.toISOString().slice(0, 10)
    } else {
        jamTeks = normJam(jamExcelKeTeks(jam))
    }

    const t = String(tipe ?? '').trim().toUpperCase()
    // Jika bukan 'I' (misal '0', 'O', 'OUT', angka lain, dll.), anggap sebagai keluar (O)
    const isKeluar = t !== '' && t !== 'I' && t !== 'IN' && t !== 'MASUK' && t !== '0'
    return {
        nik: String(nik).trim(),
        tanggal,
        jam: jamTeks,
        keluar: isKeluar,
        path: path || '',
    }
}

/** Deteksi header pada baris pertama yang tidak kosong, terpisah per sheet. */
function petakanHeader(values) {
    const map = {}
    values.forEach((h, i) => {
        const key = String(h ?? '').trim().toLowerCase()
        if (key && !(key in map)) map[key] = i
    })
    return HEADER_NIK.some((n) => map[n] !== undefined) ? map : null
}

/** CSV dengan pemisah koma, titik koma, atau tab dan nilai bertanda kutip. */
function csvKeBaris(teks) {
    const baris = []
    let sel = []
    let nilai = ''
    let dalamKutip = false
    const barisPertama = teks.split(/\r?\n/).find((r) => r.trim() !== '') || ''
    const pemisah = [';', ',', '\t'].find((c) => barisPertama.includes(c)) || ','

    for (let i = 0; i < teks.length; i += 1) {
        const c = teks[i]
        if (dalamKutip) {
            if (c === '"') {
                if (teks[i + 1] === '"') { nilai += '"'; i += 1 } else dalamKutip = false
            } else nilai += c
            continue
        }
        if (c === '"') { dalamKutip = true; continue }
        if (c === pemisah) { sel.push(nilai); nilai = ''; continue }
        if (c === '\r') continue
        if (c === '\n') { sel.push(nilai); baris.push(sel); sel = []; nilai = ''; continue }
        nilai += c
    }
    if (nilai !== '' || sel.length) { sel.push(nilai); baris.push(sel) }
    return baris
}

export async function bacaBerkasAbsensi(buffer, namaBerkas, periode) {
    const sheets = []
    if (/\.(csv|txt)$/i.test(namaBerkas)) {
        sheets.push(csvKeBaris(buffer.toString('utf8')))
    } else if (/\.mdb$/i.test(namaBerkas)) {
        const excel = await mdbKeExcelPeriode(buffer, periode)
        return bacaBerkasAbsensi(excel, 'absensi-periode.xlsx')
    } else if (/\.xls$/i.test(namaBerkas)) {
        const wb = XLSX.read(buffer, { type: 'buffer' })
        for (const nama of wb.SheetNames) {
            sheets.push(XLSX.utils.sheet_to_json(wb.Sheets[nama], {
                header: 1, raw: true, defval: null,
            }))
        }
    } else if (/\.xlsx$/i.test(namaBerkas)) {
        const wb = new ExcelJS.Workbook()
        await wb.xlsx.load(buffer)
        wb.eachSheet((sheet) => {
            const rows = []
            sheet.eachRow((row) => rows.push(row.values.slice(1)))
            sheets.push(rows)
        })
    } else {
        throw new Error('Format berkas tidak didukung. Gunakan Access .mdb, Excel .xls, .xlsx, atau CSV.')
    }

    const semua = []
    for (const rows of sheets) {
        const isi = rows.filter((r) => r.some((v) => v !== null && v !== undefined && String(v).trim() !== ''))
        if (!isi.length) continue
        const header = petakanHeader(isi[0])
        for (const values of header ? isi.slice(1) : isi) {
            semua.push({ values, header })
        }
    }
    return semua
}

/** MIN masuk / MAX keluar per NIK+tanggal, termasuk staging unggahan sebelumnya.
 * NULL/00:00:00 adalah penanda kosong, bukan kandidat MIN/MAX.
 */
export async function simpanScanStaging(db, b) {
    const jam = b.jam || '00:00:00'
    if (b.keluar) {
        await db.query(
            `INSERT INTO tabsensi2 (nik, tanggal, scan1, scan2) VALUES (?, ?, '00:00:00', ?)
             ON DUPLICATE KEY UPDATE scan2 = IF(VALUES(scan2) = '00:00:00', scan2,
                 IF(scan2 IS NULL OR scan2 = '00:00:00', VALUES(scan2), GREATEST(scan2, VALUES(scan2))))`,
            [b.nik, b.tanggal, jam]
        )
    } else {
        await db.query(
            `INSERT INTO tabsensi2 (nik, tanggal, scan1, scan2) VALUES (?, ?, ?, '00:00:00')
             ON DUPLICATE KEY UPDATE scan1 = IF(VALUES(scan1) = '00:00:00', scan1,
                 IF(scan1 IS NULL OR scan1 = '00:00:00', VALUES(scan1), LEAST(scan1, VALUES(scan1))))`,
            [b.nik, b.tanggal, jam]
        )
    }
}

/** Reduce redundant upserts, retaining exactly the same MIN/MAX and empty-scan rules. */
export function ringkasScanStaging(rows) {
    const groups = new Map()
    for (const row of rows) {
        const key = JSON.stringify([row.nik, row.tanggal, row.keluar])
        const jam = row.jam || '00:00:00'
        const current = groups.get(key)
        if (!current) groups.set(key, { ...row, jam })
        else if (jam !== '00:00:00' && (current.jam === '00:00:00' || (row.keluar ? jam > current.jam : jam < current.jam))) current.jam = jam
    }
    return [...groups.values()]
}
