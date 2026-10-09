import test from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { sendPinjamanExcel } from '../src/helpers/pinjamanExcel.js'

const columns = ['NO', 'NIK', 'NAMA KARYAWAN', 'UNIT', 'BAGIAN', 'BANK', 'NO REK',
    'PINJAMAN UANG KOPERASI', 'ANGSURAN', 'POTONGAN', 'SALDO POTONGAN']

async function exportSheet(rows, options) {
    const response = { headers: {}, setHeader(key, value) { this.headers[key] = value },
        status(code) { assert.equal(code, 200); return this }, send(buffer) { this.buffer = buffer } }
    await sendPinjamanExcel(response, columns, rows, options)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(response.buffer)
    assert.match(response.headers['Content-Disposition'], /Pinjaman_.*\.xlsx/)
    return workbook.worksheets[0]
}

test('Export Pinjaman: tanggal kiri, header biru, budget kuning, angka dan identifier utuh', async () => {
    const sheet = await exportSheet([{ NO: 1, NIK: '000123', 'NAMA KARYAWAN': 'Riri', UNIT: 'P04',
        BAGIAN: 'QC CETAK', BANK: 'BSI', 'NO REK': '001234567890123456',
        'PINJAMAN UANG KOPERASI': 500000, ANGSURAN: 2, POTONGAN: 250000, 'SALDO POTONGAN': 250000 }],
    { dates: ['2026-10-06'], sisaBudget: 18200000 })
    assert.deepEqual(sheet.getRow(1).values.slice(1, 13), ['TGL', ...columns])
    assert.equal(sheet.getCell('A2').value.toISOString().slice(0, 10), '2026-10-06')
    assert.equal(sheet.getCell('A2').numFmt, 'dd/mm/yyyy')
    assert.equal(sheet.getCell('C2').value, '000123')
    assert.equal(sheet.getCell('H2').value, '001234567890123456')
    assert.equal(sheet.getCell('I2').value, 500000)
    assert.equal(sheet.getCell('L2').value, 250000)
    assert.match(sheet.getCell('I2').numFmt, /Rp/)
    assert.equal(sheet.getCell('A1').fill.fgColor.argb, 'FF243656')
    assert.equal(sheet.getCell('N1').value, 'SISA BUDGET')
    assert.equal(sheet.getCell('O1').value, 18200000)
    assert.equal(sheet.getCell('O1').font.color.argb, 'FFFF0000')
    assert.equal(sheet.getCell('N1').fill.fgColor.argb, 'FFFFEB3B')
    assert.equal(sheet.autoFilter, 'A1:L2')
    assert.equal(sheet.views[0].ySplit, 1)
})

test('Export kosong tetap punya filter/header/budget; budget negatif dan nol tetap numerik', async () => {
    for (const sisaBudget of [0, -100000]) {
        const sheet = await exportSheet([], { dates: [], sisaBudget })
        assert.equal(sheet.getCell('O1').value, sisaBudget)
        assert.equal(sheet.autoFilter, 'A1:L1')
    }
    const sheet = await exportSheet([{ NO: 1, NIK: '000', POTONGAN: 0, 'SALDO POTONGAN': '—' }],
        { dates: [null], sisaBudget: 0 })
    assert.equal(sheet.getCell('A2').value, '')
    assert.equal(sheet.getCell('K2').value, 0)
    assert.equal(sheet.getCell('L2').value, '—')
})
