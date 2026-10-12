import ExcelJS from 'exceljs'

/** Dokumen pengajuan berdasarkan tanggal pinjaman; bukan laporan saldo hutang. */
export async function sendPengajuanPinjamanExcel(res, rows, { start, end }) {
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'Web HRD Kencana'
    workbook.created = new Date()
    const sheet = workbook.addWorksheet('Pengajuan Pinjaman', {
        views: [{ state: 'frozen', ySplit: 1 }],
    })
    // Format tampilan tanpa desimal; nilai numerik asli tetap disimpan.
    const rupiah = '#,##0;[Red](#,##0);0'
    const headers = ['TGL', 'NO', 'NIK', 'NAMA', 'UNIT', 'BANK', 'NO REK', 'PINJAMAN UANG KOPERASI']
    sheet.getRow(1).values = headers
    sheet.getRow(1).height = 36
    ;[14, 7, 18, 35, 10, 14, 24, 28].forEach((width, index) => { sheet.getColumn(index + 1).width = width })

    let totalCents = 0
    rows.forEach((row, index) => {
        // Jangan menghasilkan total menyesatkan jika nominal legacy NULL/tidak valid.
        const amount = row.Pinjam == null || row.Pinjam === '' ? NaN : Number(row.Pinjam)
        const cents = Math.round(amount * 100)
        if (!Number.isFinite(amount) || !Number.isSafeInteger(cents) || !Number.isSafeInteger(totalCents + cents)) {
            const error = new Error(`Nominal pinjaman ${row.Nomor || row.Nik || index + 1} tidak valid untuk export. Periksa data terlebih dahulu.`)
            error.statusCode = 422
            throw error
        }
        totalCents += cents
        const data = sheet.getRow(index + 2)
        data.values = [new Date(`${row.Tanggal}T00:00:00Z`), index + 1,
            row.Nik == null ? '' : String(row.Nik), row.Nama ?? '', row.Pabrik ?? '',
            row.Bank ?? '', row.Norek == null ? '' : String(row.Norek), cents / 100]
        data.getCell(1).numFmt = 'dd/mm/yyyy'
        data.getCell(3).numFmt = '@'
        data.getCell(7).numFmt = '@'
        data.getCell(8).numFmt = rupiah
        data.height = 20
    })

    const totalRow = rows.length + 2
    sheet.mergeCells(`A${totalRow}:G${totalRow}`)
    sheet.getCell(`A${totalRow}`).value = 'TOTAL'
    sheet.getCell(`H${totalRow}`).value = rows.length
        ? { formula: `SUM(H2:H${totalRow - 1})`, result: totalCents / 100 } : 0
    sheet.getCell(`H${totalRow}`).numFmt = rupiah
    sheet.getRow(totalRow).height = 26
    for (let rowIndex = 1; rowIndex <= totalRow; rowIndex++) {
        for (let col = 1; col <= 8; col++) {
            const cell = sheet.getCell(rowIndex, col)
            const header = rowIndex === 1
            const footer = rowIndex === totalRow
            cell.font = { name: 'Calibri', size: 11, bold: header || footer,
                color: { argb: header ? 'FFFFFFFF' : 'FF243656' } }
            cell.alignment = { vertical: 'middle', horizontal: header || (footer && col < 8) ? 'center' : col === 8 ? 'right' : 'left', wrapText: header }
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFD9E2F3' } },
                bottom: { style: 'thin', color: { argb: 'FFD9E2F3' } },
                left: { style: 'thin', color: { argb: 'FFD9E2F3' } },
                right: { style: 'thin', color: { argb: 'FFD9E2F3' } },
            }
            if (header || footer) cell.fill = { type: 'pattern', pattern: 'solid',
                fgColor: { argb: header ? 'FF243656' : 'FFFFEB3B' } }
        }
    }
    // Query sudah mengurutkan tanggal; gabungkan hanya kelompok tanggal berurutan.
    for (let first = 0; first < rows.length;) {
        let end = first + 1
        while (end < rows.length && rows[end].Tanggal === rows[first].Tanggal) end++
        if (end - first > 1) sheet.mergeCells(`A${first + 2}:A${end + 1}`)
        sheet.getCell(first + 2, 1).alignment = { vertical: 'middle', horizontal: 'center' }
        first = end
    }
    // Baris TOTAL tidak ikut filter; total selalu mencakup seluruh hasil periode.
    sheet.autoFilter = `A1:H${Math.max(1, totalRow - 1)}`
    sheet.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true,
        fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:1', printArea: `A1:H${totalRow}` }
    const buffer = await workbook.xlsx.writeBuffer()
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="Pengajuan-Pinjaman_${start}_${end}.xlsx"`)
    res.setHeader('Content-Length', buffer.byteLength)
    return res.status(200).send(Buffer.from(buffer))
}
