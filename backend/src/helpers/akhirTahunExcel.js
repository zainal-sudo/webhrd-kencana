import ExcelJS from 'exceljs'
import { AKHIR_TAHUN_COLUMNS } from './akhirTahun.js'
import { formatTanggal } from './tanggal.js'

export async function sendAkhirTahunExcel(res, year, rows) {
    const wb = new ExcelJS.Workbook()
    wb.creator = 'Web HRD Kencana'
    const sheet = wb.addWorksheet(`Akhir Tahun ${year}`)
    sheet.columns = AKHIR_TAHUN_COLUMNS.map(column => ({
        header: column.label, key: column.key,
        width: column.key === 'Nama' ? 32 : column.key === 'Jabatan' ? 28 : column.numeric ? 16 : 20,
    }))
    for (const row of rows) {
        sheet.addRow(AKHIR_TAHUN_COLUMNS.map(column => {
            if (column.numeric) return Number(row[column.key] ?? 0)
            if (column.key === 'Tgl_Masuk') return formatTanggal(row[column.key])
            return row[column.key] == null ? '' : String(row[column.key])
        }))
    }
    const header = sheet.getRow(1)
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF243656' } }
    header.alignment = { vertical: 'middle', wrapText: true }
    header.height = 30
    AKHIR_TAHUN_COLUMNS.forEach((column, index) => {
        sheet.getColumn(index + 1).numFmt = column.numeric ? '#,##0' : '@'
    })
    sheet.views = [{ state: 'frozen', xSplit: 2, ySplit: 1 }]
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, sheet.rowCount), column: AKHIR_TAHUN_COLUMNS.length } }
    const buffer = await wb.xlsx.writeBuffer()
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="Laporan-Akhir-Tahun-${year}.xlsx"`)
    return res.status(200).send(Buffer.from(buffer))
}
