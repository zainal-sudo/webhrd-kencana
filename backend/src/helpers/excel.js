import ExcelJS from 'exceljs'

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
export async function sendExcel(res, title, columns, rows) {
    const wb = new ExcelJS.Workbook()
    wb.creator = 'Web HRD Kencana'
    wb.created = new Date()
    const ws = wb.addWorksheet(String(title).slice(0, 31))

    ws.addRow(columns)
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
                    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())} ${p(v.getHours())}:${p(v.getMinutes())}:${p(v.getSeconds())}`
                }
                if (typeof v === 'object') return JSON.stringify(v)
                return v
            })
        )
    }

    // Lebar kolom mengikuti isi (contoh 30 baris pertama), 12-45 karakter.
    columns.forEach((c, i) => {
        let w = String(c).length
        const contoh = (rows || []).slice(0, 30)
        for (const r of contoh) {
            const v = r?.[c]
            const len = v === null || v === undefined ? 0 : String(v).length
            if (len > w) w = len
        }
        ws.getColumn(i + 1).width = Math.min(45, Math.max(12, w + 2))
    })

    const aman = String(title).replace(/[\\/:*?"<>|]/g, '').trim().replace(/\s+/g, '-') || 'data'
    const file = `${aman}_${new Date().toISOString().slice(0, 10)}.xlsx`
    const buf = await wb.xlsx.writeBuffer()
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${file}"`)
    res.setHeader('Content-Length', buf.byteLength)
    return res.status(200).send(Buffer.from(buf))
}
