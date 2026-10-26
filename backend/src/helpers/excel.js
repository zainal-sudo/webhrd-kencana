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
export async function sendExcel(res, title, columns, rows, { columnWidths = {}, freezeHeader = false, headLabels } = {}) {
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

    // Lebar kolom mengikuti isi (contoh 30 baris pertama), 12-45 karakter;
    // panjang label header ikut dihitung agar label panjang tidak tersekat.
    columns.forEach((c, i) => {
        let w = String(headLabels?.[c] ?? c).length
        const contoh = (rows || []).slice(0, 30)
        for (const r of contoh) {
            const v = r?.[c]
            const len = v === null || v === undefined ? 0 : String(v).length
            if (len > w) w = len
        }
        ws.getColumn(i + 1).width = columnWidths[c] ?? Math.min(45, Math.max(12, w + 2))
    })

    const aman = String(title).replace(/[\\/:*?"<>|]/g, '').trim().replace(/\s+/g, '-') || 'data'
    const file = `${aman}_${new Date().toISOString().slice(0, 10)}.xlsx`
    const buf = await wb.xlsx.writeBuffer()
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${file}"`)
    res.setHeader('Content-Length', buf.byteLength)
    return res.status(200).send(Buffer.from(buf))
}
