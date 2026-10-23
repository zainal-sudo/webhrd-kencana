import ExcelJS from 'exceljs'

export async function sendPelunasanPinjamanExcel(res, rows, { bulan, tahun }) {
    const wb = new ExcelJS.Workbook()
    wb.creator = 'Web HRD Kencana'
    wb.created = new Date()
    const ws = wb.addWorksheet('Pelunasan Pinjaman')
    const rupiah = '"Rp"* #,##0;[Red]"Rp"* (#,##0);"Rp"* 0;@'
    ws.addRow(['NO', 'NIK', 'NAMA KARYAWAN', 'NOMOR PINJAMAN', 'POTONGAN KE', 'NOMINAL PINJAMAN',
        'POTONGAN', 'SUDAH DIBAYAR', 'SISA PINJAMAN', 'STATUS PROSES', 'WAKTU DIPROSES'])
    ws.getRow(1).height = 30
    const number = value => value == null ? null : Number(value)
    let totalCents = 0
    for (const [index, row] of rows.entries()) {
        const potongan = number(row.Potongan)
        totalCents += Math.round((potongan ?? 0) * 100)
        const data = ws.addRow([index + 1, String(row.Nik ?? ''), row.Nama ?? '', String(row.Nomor ?? ''), Number(row.PotonganKe),
            number(row.Pinjam), potongan, number(row.Bayar), number(row.SisaBayar),
            row.DiprosesPada == null ? 'Belum Diproses' : 'Sudah Diproses', row.DiprosesPada ?? null])
        data.height = 18
        for (const column of [2, 4]) data.getCell(column).numFmt = '@'
        for (const column of [6, 7, 8, 9]) data.getCell(column).numFmt = rupiah
        data.getCell(11).numFmt = 'yyyy-mm-dd hh:mm:ss'
    }
    const totalRow = ws.addRow(['TOTAL POTONGAN'])
    ws.mergeCells(totalRow.number, 1, totalRow.number, 6)
    totalRow.getCell(7).value = rows.length
        ? { formula: 'SUM(G2:G' + (totalRow.number - 1) + ')', result: totalCents / 100 } : 0
    totalRow.getCell(7).numFmt = rupiah
    totalRow.height = 25
    const widths = [7, 18, 35, 24, 16, 24, 22, 24, 24, 24, 25]
    widths.forEach((width, index) => { ws.getColumn(index + 1).width = width })
    for (let i = 1; i <= totalRow.number; i++) {
        const header = i === 1, footer = i === totalRow.number
        for (let column = 1; column <= 11; column++) {
            const cell = ws.getCell(i, column)
            cell.font = { name: 'Calibri', size: 11, bold: header || footer,
                color: { argb: header ? 'FFFFFFFF' : 'FF243656' } }
            cell.alignment = { vertical: 'middle',
                horizontal: header || (footer && column < 7) ? 'center' : column >= 6 && column <= 9 ? 'right' : 'left',
                wrapText: header }
            const edge = { style: 'thin', color: { argb: 'FFD9E2F3' } }
            cell.border = { top: edge, bottom: edge, left: edge, right: edge }
            if (header || footer) cell.fill = { type: 'pattern', pattern: 'solid',
                fgColor: { argb: header ? 'FF243656' : 'FFFFEB3B' } }
        }
    }
    ws.views = [{ state: 'frozen', ySplit: 1, showGridLines: false }]
    ws.autoFilter = 'A1:K' + Math.max(1, totalRow.number - 1)
    ws.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true,
        fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:1', printArea: 'A1:K' + totalRow.number }
    const buffer = await wb.xlsx.writeBuffer()
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename="Pelunasan-Pinjaman_' + tahun + '-' + String(bulan).padStart(2, '0') + '.xlsx"')
    res.setHeader('Content-Length', buffer.byteLength)
    return res.status(200).send(Buffer.from(buffer))
}
