import test from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { sendExcel } from '../src/helpers/excel.js'

function res() {
    return {
        headers: {},
        body: null,
        setHeader(k, v) { this.headers[k] = v },
        status(c) { this.code = c; return this },
        send(buf) { this.body = buf },
    }
}

async function load(respon) {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(respon.body)
    return wb.worksheets[0]
}

test('headLabels mengganti TULISAN header tanpa mengubah pemetaan nilai (default masih = key)', async () => {
    const r = res()
    await sendExcel(r, 'Absensi-Periode', ['Nama', '2026-10-01'], [{ Nama: 'Budi', '2026-10-01': 1 }], { headLabels: { '2026-10-01': '01/10/2026' } })
    const ws = await load(r)
    assert.deepEqual(ws.getRow(1).values.slice(1), ['Nama', '01/10/2026'])
    assert.deepEqual(ws.getRow(2).values.slice(1), ['Budi', 1])

    // Tanpa option: semua 33 export lain tak berubah — header = kolom.
    const b = res()
    await sendExcel(b, 'Modul', ['Nama', 'Lembur'], [{ Nama: 'Budi', Lembur: 2 }])
    const ws2 = await load(b)
    assert.deepEqual(ws2.getRow(1).values.slice(1), ['Nama', 'Lembur'])
})

test('Nilai Date tengah malam ditulis tanggal polos (dd/mm/yyyy), tanpa jejak 00:00:00', async () => {
    const r = res()
    const tanggal = new Date(2026, 9, 1)                    // 1 Okt 2026, 00:00:00 lokal
    const cetak = new Date(2026, 9, 1, 8, 30, 15)           // datetime dengan jam beneran
    await sendExcel(r, 'T', ['Tanggal', 'Waktu'], [{ Tanggal: tanggal, Waktu: cetak }])
    const ws = await load(r)
    assert.equal(ws.getRow(2).getCell(1).value, '01/10/2026')
    assert.equal(ws.getRow(2).getCell(2).value, '01/10/2026 08:30:15')
})
