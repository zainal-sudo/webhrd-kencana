import ExcelJS from 'exceljs'
import MDBReader from 'mdb-reader'
import { setImmediate as jeda } from 'node:timers/promises'

export const MDB_BATCH_SIZE = 25000

function tanggalSql(value) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ''))
    if (!m || Number(m[1]) === 0) return null
    const d = new Date(`${m[0]}T00:00:00.000Z`)
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === m[0] ? m[0] : null
}

export function validasiPeriodeMdb({ start_date, end_date } = {}) {
    const mulai = tanggalSql(start_date)
    const selesai = tanggalSql(end_date)
    if (!mulai || !selesai) throw new Error('Tanggal awal dan akhir wajib diisi dengan tanggal valid untuk import MDB.')
    if (mulai > selesai) throw new Error('Tanggal awal tidak boleh melebihi tanggal akhir untuk import MDB.')
    return { mulai, selesai }
}

// Mempertahankan interpretasi UTC Date dan pemisahan jam pada importer MDB lama.
function pisahWaktu(value) {
    if (value instanceof Date) {
        if (!Number.isFinite(value.getTime())) return null
        const pad = n => String(n).padStart(2, '0')
        return {
            tanggal: `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`,
            jam: `${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}:${pad(value.getUTCSeconds())}`,
        }
    }
    if (value == null) return null
    const text = String(value).trim()
    let tanggal = text, jam = '00:00:00'
    if (text.includes(' ')) [tanggal, jam] = text.split(/\s+/)
    else if (text.includes('T')) {
        const parts = text.split('T')
        tanggal = parts[0]
        jam = parts[1].slice(0, 8)
    } else if (typeof value !== 'string') {
        tanggal = text.slice(0, 10)
        if (text.length > 10) jam = text.slice(11, 19)
    }
    // Format tanggal yang sama dengan normTanggal existing, tanpa normalisasi kalender invalid.
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(tanggal)
    if (m) tanggal = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
    else {
        m = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4}|\d{2})$/.exec(tanggal)
        if (!m) return null
        tanggal = `${m[3].length === 2 ? '20' : ''}${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
    }
    return tanggalSql(tanggal) ? { tanggal, jam } : null
}

/** MDB tetap dipindai; hanya hasil dalam periode yang ditampung dalam Excel.
 * createReader di-inject dalam tes, tanpa membuka MDB atau database pengguna.
 */
export async function mdbKeExcelPeriode(buffer, periode, { createReader = data => new MDBReader(data) } = {}) {
    const { mulai, selesai } = validasiPeriodeMdb(periode)
    const reader = createReader(buffer)
    const tables = reader.getTableNames()
    const name = tables.find(t => /checkinout/i.test(t)) || tables[0]
    if (!name) throw new Error('Tidak ditemukan tabel di dalam berkas MDB')
    const table = reader.getTable(name)
    const columns = table.getColumnNames()
    const find = (names, fallback) => columns.find(c => names.includes(String(c).trim().toLowerCase())) ?? columns[fallback]
    const nikColumn = find(['nik', 'userid', 'user id', 'code', 'badgenumber'], 0)
    const timeColumn = find(['checktime', 'tanggal', 'tgl', 'datetime', 'time'], 1)
    const typeColumn = find(['checktype', 'tipe', 'status', 'type'], 3)
    const selectedColumns = [...new Set([nikColumn, timeColumn, typeColumn].filter(c => c !== undefined))]
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Absensi')
    sheet.addRow(['NIK', 'Tanggal', 'Jam', 'Tipe'])
    for (let i = 1; i <= 3; i++) sheet.getColumn(i).numFmt = '@'
    let offset = 0, jumlah = 0
    for (;;) {
        let batch = table.getData({ columns: selectedColumns, rowOffset: offset, rowLimit: MDB_BATCH_SIZE })
        const count = batch.length
        if (!count) break
        for (const row of batch) {
            const waktu = pisahWaktu(row[timeColumn])
            if (!waktu || waktu.tanggal < mulai || waktu.tanggal > selesai) continue
            const nik = row[nikColumn]
            const tipe = row[typeColumn] ?? (typeColumn === columns[3] ? 'I' : '')
            sheet.addRow([nik == null ? '' : String(nik), waktu.tanggal, String(waktu.jam), tipe])
            jumlah++
        }
        offset += count
        batch = null
        await jeda()
        if (count < MDB_BATCH_SIZE) break
    }
    if (!jumlah) throw new Error('Tidak ada data MDB dalam rentang tanggal yang dipilih.')
    // Excel ini hanya perantara di memori: prioritaskan waktu kompresi, bukan ukuran arsip minimum.
    return Buffer.from(await workbook.xlsx.writeBuffer({ zip: { compression: 'DEFLATE', compressionOptions: { level: 1 } } }))
}
