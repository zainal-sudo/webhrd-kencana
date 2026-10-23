import ExcelJS from 'exceljs'
import * as XLSX from 'xlsx'
import MDBReader from 'mdb-reader'

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

export async function bacaBerkasAbsensi(buffer, namaBerkas) {
    const sheets = []
    if (/\.(csv|txt)$/i.test(namaBerkas)) {
        sheets.push(csvKeBaris(buffer.toString('utf8')))
    } else if (/\.mdb$/i.test(namaBerkas)) {
        const reader = new MDBReader(buffer)
        const tableNames = reader.getTableNames()
        const tableName = tableNames.find((t) => /checkinout/i.test(t)) || tableNames[0]
        if (!tableName) throw new Error('Tidak ditemukan tabel di dalam berkas MDB')
        const table = reader.getTable(tableName)
        const tableData = table.getData()
        const columns = table.getColumnNames()
        
        // Cari indeks kolom secara case-insensitive (NIK/USERID, CHECKTIME/TANGGAL, CHECKTYPE/TIPE)
        const findCol = (keywords) => columns.findIndex((c) => keywords.some((k) => String(c).trim().toLowerCase() === k))
        
        const idxNik = findCol(['nik', 'userid', 'user id', 'code', 'badgenumber'])
        const idxTime = findCol(['checktime', 'tanggal', 'tgl', 'datetime', 'time'])
        const idxType = findCol(['checktype', 'tipe', 'status', 'type'])
        
        const rows = [
            ['NIK', 'Tanggal', 'Jam', 'Tipe'],
            ...tableData.map((row) => {
                const nikVal = idxNik !== -1 ? row[columns[idxNik]] : row[columns[0]]
                const timeVal = idxTime !== -1 ? row[columns[idxTime]] : row[columns[1]]
                const typeVal = idxType !== -1 ? row[columns[idxType]] : (row[columns[3]] ?? 'I')
                
                let tglStr = ''
                let jamStr = '00:00:00'
                
                if (timeVal instanceof Date) {
                    const pad = (n) => String(n).padStart(2, '0')
                    tglStr = `${timeVal.getUTCFullYear()}-${pad(timeVal.getUTCMonth() + 1)}-${pad(timeVal.getUTCDate())}`
                    jamStr = `${pad(timeVal.getUTCHours())}:${pad(timeVal.getUTCMinutes())}:${pad(timeVal.getUTCSeconds())}`
                } else if (typeof timeVal === 'string') {
                    const trimmed = timeVal.trim()
                    if (trimmed.includes(' ')) {
                        const [dPart, tPart] = trimmed.split(/\s+/)
                        tglStr = dPart
                        jamStr = tPart
                    } else if (trimmed.includes('T')) {
                        const [dPart, tPart] = trimmed.split('T')
                        tglStr = dPart
                        jamStr = tPart.slice(0, 8)
                    } else {
                        tglStr = trimmed
                    }
                } else if (timeVal != null) {
                    const s = String(timeVal).trim()
                    if (s.includes(' ')) {
                        const [dPart, tPart] = s.split(/\s+/)
                        tglStr = dPart
                        jamStr = tPart
                    } else {
                        tglStr = s.slice(0, 10)
                        if (s.length > 10) jamStr = s.slice(11, 19)
                    }
                }
                
                return [nikVal, tglStr, jamStr, typeVal]
            }),
        ]
        sheets.push(rows)
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
