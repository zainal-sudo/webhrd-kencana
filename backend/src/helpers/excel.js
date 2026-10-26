import ExcelJS from 'exceljs'
import { formatTanggal } from './tanggal.js'

/**
 * Unduhan Excel untuk SEMUA browse & laporan.
 *
 * Pola pakai di setiap fungsi list (setelah where/params/orderBy jadi,
 * sebelum paginasi):
 *
 *   if (req.query.export === 'xlsx') {
 *       const [all] = await pool.query(`${SELECT_SQL}${where} ${orderBy} LIMIT 50000`, params)
 *       return sendExcel(res, 'Nama Modul', Object.keys(COLUMNS), all)
 *   }
 *
 * `columns` = daftar alias frontend sesuai urutan kolom browse, sehingga
 * isi file sama persis dengan yang terlihat di tabel (termasuk search,
 * periode, sort & filter kolom yang sedang aktif).
 */
export async function sendExcel(res, title, columns, rows, { columnWidths = {}, freezeHeader = false, headLabels, requestedColumns, numericColumns = [], numberFormats = {} } = {}) {
    columns = requestedExportColumns(requestedColumns, columns)
    const numericKeys = new Set(numericColumns)
    const wb = new ExcelJS.Workbook()
    wb.creator = 'Web HRD Kencana'
    wb.created = new Date()
    const ws = wb.addWorksheet(String(title).slice(0, 31))
    if (freezeHeader) ws.views = [{ state: 'frozen', ySplit: 1 }]

    // Label header boleh dipetakan ulang (mis. key kolom hari memakai tanggal
    // lengkap agar unik, tapi teks header tampil dd/mm/yyyy seperti di web).
    ws.addRow(columns.map((c) => headLabels?.[c] ?? c))
    const head = ws.getRow(1)
    head.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF243656' } }
    head.alignment = { vertical: 'middle' }

    for (const r of rows || []) {
        ws.addRow(
            columns.map((c) => {
                const v = r?.[c]
                if (v === null || v === undefined) return ''
                if (numericKeys.has(c)) {
                    const number = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
                    return Number.isFinite(number) ? number : ''
                }
                if (v instanceof Date) {
                    if (isNaN(v.getTime())) return ''
                    const p = (n) => String(n).padStart(2, '0')
                    // Kolom tanggal polos (tanpa jam) tampil seperti web — tanpa
                    // jejak 00:00:00. DATETIME dengan jam beneran tetap lengkap.
                    const waktu = `${p(v.getHours())}:${p(v.getMinutes())}:${p(v.getSeconds())}`
                    return waktu === '00:00:00' ? formatTanggal(v) : `${formatTanggal(v)} ${waktu}`
                }
                if (typeof v === 'string' && !/\s+s\/d\s+/.test(v) && /tanggal|tgl|date|pkwt|dibuat|diubah|^Periode[12]$/i.test(c)) {
                    const tanggal = formatTanggal(v)
                    const waktu = /[ T](\d{2}:\d{2}(?::\d{2})?)/.exec(v)?.[1]
                    if (tanggal) return waktu ? `${tanggal} ${waktu}` : tanggal
                }
                if (typeof v === 'object') return JSON.stringify(v)
                return v
            })
        )
    }

    // Header tetap satu baris; lebarkan kolom untuk label atau isi terpanjang.
    columns.forEach((c, i) => {
        let w = String(headLabels?.[c] ?? c).length
        for (const r of rows || []) {
            const v = r?.[c]
            let shown = v
            if (v instanceof Date && !isNaN(v.getTime())) {
                const p = (n) => String(n).padStart(2, '0')
                const waktu = `${p(v.getHours())}:${p(v.getMinutes())}:${p(v.getSeconds())}`
                shown = waktu === '00:00:00' ? formatTanggal(v) : `${formatTanggal(v)} ${waktu}`
            } else if (typeof v === 'string' && !/\s+s\/d\s+/.test(v) && /tanggal|tgl|date|pkwt|dibuat|diubah|^Periode[12]$/i.test(c)) {
                const tanggal = formatTanggal(v)
                const waktu = /[ T](\d{2}:\d{2}(?::\d{2})?)/.exec(v)?.[1]
                if (tanggal) shown = waktu ? `${tanggal} ${waktu}` : tanggal
            } else if (typeof v === 'object' && v !== null) shown = JSON.stringify(v)
            const len = shown === null || shown === undefined ? 0 : String(shown).length
            if (len > w) w = len
        }
        ws.getColumn(i + 1).width = columnWidths[c] ?? Math.max(8, w + 2)
        if (numberFormats[c]) ws.getColumn(i + 1).numFmt = numberFormats[c]
    })

    const aman = String(title).replace(/[\\/:*?"<>|]/g, '').trim().replace(/\s+/g, '-') || 'data'
    const file = `${aman}_${new Date().toISOString().slice(0, 10)}.xlsx`
    const buf = await wb.xlsx.writeBuffer()
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${file}"`)
    res.setHeader('Content-Length', buf.byteLength)
    return res.status(200).send(Buffer.from(buf))
}

/** Use only requested columns that belong to this export; ignore duplicates. */
export function requestedExportColumns(requested, allowed) {
    if (!requested) return [...allowed]
    const list = Array.isArray(requested) ? requested : String(requested).split(',')
    const whitelist = new Set(allowed)
    const selected = [...new Set(list.map(value => String(value).trim()).filter(value => whitelist.has(value)))]
    return selected.length ? selected : [...allowed]
}
