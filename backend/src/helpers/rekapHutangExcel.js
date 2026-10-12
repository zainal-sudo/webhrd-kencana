import ExcelJS from 'exceljs'

/** Report-specific sizing: total labels must not stretch document columns. */
export async function sendRekapHutangExcel(res, rows, filtered, balance) {
    const wb = new ExcelJS.Workbook()
    wb.creator = 'Web HRD Kencana'
    const ws = wb.addWorksheet('Rekap Hutang')
    const headers = ['NO', 'NOMOR PINJAMAN', 'TANGGAL', 'NIK', 'NAMA KARYAWAN', 'PABRIK', 'BAGIAN', 'NOMINAL PINJAMAN', 'SUDAH DIBAYAR', 'SISA HUTANG']
    ws.addRow(headers)
    const dateText = value => value instanceof Date
        ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
        : String(value ?? '').slice(0, 10)
    const data = Array.from(rows, (row, index) => [index + 1, row.Nomor, dateText(row.Tanggal), String(row.Nik ?? ''),
        row.Nama ?? '—', row.Pabrik ?? '—', row.Bagian ?? '—', row.Pinjam, row.Bayar, row.SisaBayar])
    data.forEach(values => ws.addRow(values))
    const min = [5, 19, 12, 14, 22, 9, 16, 20, 18, 18]
    const max = [8, 26, 12, 24, 42, 16, 32, 26, 26, 26]
    headers.forEach((header, index) => {
        let length = header.length
        for (const values of data) {
            const text = index >= 7 ? Number(values[index]).toLocaleString('en-US') : String(values[index] ?? '')
            length = Math.max(length, text.length)
        }
        ws.getColumn(index + 1).width = Math.min(max[index], Math.max(min[index], length + 3))
    })
    ws.getRow(1).height = 32
    ws.getRow(1).eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF243656' } }
        cell.alignment = { vertical: 'middle', wrapText: true }
    })
    for (let i = 2; i <= data.length + 1; i++) {
        const row = ws.getRow(i)
        let lines = 1
        row.eachCell((cell, column) => {
            cell.font = { size: 11 }
            cell.alignment = { vertical: 'middle', horizontal: column === 1 || column >= 8 ? 'right' : 'left', wrapText: column >= 5 && column <= 7 }
            cell.border = { bottom: { style: 'hair', color: { argb: 'FFDDE3EC' } } }
            if (column >= 8) cell.numFmt = Number.isInteger(cell.value) ? '#,##0' : '#,##0.00'
            if (column === 4) cell.numFmt = '@'
            if (column >= 5 && column <= 7) lines = Math.max(lines, Math.ceil(String(cell.value ?? '').length / Math.max(1, ws.getColumn(column).width - 3)))
        })
        row.height = Math.max(22, lines * 15 + 6)
    }
    // Include larger aggregate values in numeric column sizing too.
    for (const [index, key] of [[8, 'pinjam'], [9, 'bayar'], [10, 'sisa']]) {
        const length = Math.max(...[filtered[key], balance[key], index === 10 ? balance.sisa_plafon : 0].map(value => Number(value).toLocaleString('en-US').length))
        ws.getColumn(index).width = Math.max(ws.getColumn(index).width, Math.min(28, length + 3))
    }
    function total(label, values) {
        const row = ws.addRow(['', label, '', '', '', '', '', ...values])
        ws.mergeCells(row.number, 2, row.number, 7)
        row.height = 28
        row.eachCell({ includeEmpty: true }, (cell, column) => {
            cell.font = { bold: true, size: 11 }
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F3F8' } }
            cell.alignment = { vertical: 'middle', horizontal: column >= 8 ? 'right' : 'left', wrapText: true }
            if (column >= 8) cell.numFmt = Number.isInteger(cell.value) ? '#,##0' : '#,##0.00'
        })
        return row
    }
    total('TOTAL HASIL FILTER', [filtered.pinjam, filtered.bayar, filtered.sisa])
    total('SALDO SAAT INI — SELURUH PINJAMAN AKTIF', [balance.pinjam, balance.bayar, balance.sisa])
    total('SISA PLAFON PERUSAHAAN', [null, null, balance.sisa_plafon])
    const unknown = total('DOKUMEN SALDO TIDAK DIKETAHUI (DI LUAR TOTAL)', [null, null, balance.saldo_tidak_diketahui])
    unknown.getCell(10).numFmt = '0'
    ws.views = [{ state: 'frozen', ySplit: 1 }]
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: data.length + 1, column: 10 } }
    const buffer = await wb.xlsx.writeBuffer()
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename="Rekap-Hutang.xlsx"')
    res.setHeader('Content-Length', buffer.byteLength)
    return res.status(200).send(Buffer.from(buffer))
}
