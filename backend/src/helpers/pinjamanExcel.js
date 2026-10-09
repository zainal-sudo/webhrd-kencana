import ExcelJS from 'exceljs'

/** Layout export Pinjaman: tanggal di kiri, budget global terpisah dari tabel. */
export async function sendPinjamanExcel(res, columns, rows, { dates, sisaBudget }) {
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'Web HRD Kencana'
    workbook.created = new Date()
    const sheet = workbook.addWorksheet('Pinjaman', {
        views: [{ state: 'frozen', xSplit: 4, ySplit: 1 }],
    })
    const headers = ['TGL', ...columns]
    sheet.addRow(headers)
    const widths = [13, 7, 16, 34, 9, 24, 12, 22, 23, 12, 20, 22]
    widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width })
    sheet.getRow(1).height = 42

    const rupiah = '"Rp" #,##0.00;[Red]("Rp" #,##0.00);"Rp" 0.00'
    const moneyColumns = new Set(['PINJAMAN UANG KOPERASI', 'POTONGAN', 'SALDO POTONGAN'])
    rows.forEach((data, index) => {
        const date = dates[index]
        // Date-only UTC: jangan geser tanggal transaksi karena zona waktu server.
        const value = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
            ? new Date(`${date}T00:00:00Z`) : null
        const row = sheet.addRow([value && !Number.isNaN(value.getTime()) ? value : '',
            ...columns.map(column => data[column] ?? '')])
        row.getCell(1).numFmt = 'dd/mm/yyyy'
        columns.forEach((column, columnIndex) => {
            const cell = row.getCell(columnIndex + 2)
            if (column === 'NIK' || column === 'NO REK') {
                // Excel tidak boleh membuang nol awal atau membulatkan nomor rekening.
                cell.value = data[column] == null ? '' : String(data[column])
                cell.numFmt = '@'
            } else if (moneyColumns.has(column)) {
                cell.numFmt = rupiah
                cell.alignment = { horizontal: 'right', vertical: 'middle' }
            }
        })
        row.height = 20
    })

    for (let rowIndex = 1; rowIndex <= sheet.rowCount; rowIndex++) {
        for (let columnIndex = 1; columnIndex <= headers.length; columnIndex++) {
            const cell = sheet.getCell(rowIndex, columnIndex)
            cell.font = { name: 'Calibri', size: 11,
                ...(rowIndex === 1 ? { bold: true, color: { argb: 'FFFFFFFF' } } : {}) }
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFD9E2F3' } },
                bottom: { style: 'thin', color: { argb: 'FFD9E2F3' } },
                left: { style: 'thin', color: { argb: 'FFD9E2F3' } },
                right: { style: 'thin', color: { argb: 'FFD9E2F3' } },
            }
            if (rowIndex === 1) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF243656' } }
                cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
            } else {
                cell.alignment = { vertical: 'middle', ...cell.alignment }
            }
        }
    }
    sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: Math.max(1, rows.length + 1), column: headers.length },
    }

    sheet.getColumn('M').width = 4
    sheet.getColumn('N').width = 21
    sheet.getColumn('O').width = 25
    sheet.getCell('N1').value = 'SISA BUDGET'
    sheet.getCell('O1').value = sisaBudget
    sheet.getCell('O1').numFmt = rupiah
    for (const address of ['N1', 'O1']) {
        const cell = sheet.getCell(address)
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEB3B' } }
        cell.font = { name: 'Calibri', size: 12, bold: true,
            color: { argb: address === 'O1' ? 'FFFF0000' : 'FF243656' } }
        cell.alignment = { vertical: 'middle', horizontal: address === 'O1' ? 'right' : 'center' }
        cell.border = {
            top: { style: 'thin', color: { argb: 'FFFF0000' } },
            bottom: { style: 'thin', color: { argb: 'FFFF0000' } },
            left: { style: 'thin', color: { argb: 'FFFF0000' } },
            right: { style: 'thin', color: { argb: 'FFFF0000' } },
        }
    }
    sheet.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
    sheet.pageSetup.printTitlesRow = '1:1'

    const buffer = await workbook.xlsx.writeBuffer()
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="Pinjaman_${workbook.created.toISOString().slice(0, 10)}.xlsx"`)
    res.setHeader('Content-Length', buffer.byteLength)
    return res.status(200).send(Buffer.from(buffer))
}
