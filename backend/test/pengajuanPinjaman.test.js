import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ExcelJS from 'exceljs'
import { tanggalKeluarValid } from '../src/helpers/keluar.js'
import { sendPengajuanPinjamanExcel } from '../src/helpers/pengajuanPinjamanExcel.js'

function response() {
    return { headers: {}, setHeader(key, value) { this.headers[key] = value },
        status(code) { this.code = code; return this }, send(buffer) { this.buffer = buffer; return this } }
}
async function workbook(rows) {
    const res = response()
    await sendPengajuanPinjamanExcel(res, rows, { start: '2026-10-01', end: '2026-10-12' })
    const book = new ExcelJS.Workbook()
    await book.xlsx.load(res.buffer)
    assert.equal(res.code, 200)
    assert.match(res.headers['Content-Disposition'], /Pengajuan-Pinjaman_2026-10-01_2026-10-12\.xlsx/)
    return book.worksheets[0]
}

test('Excel pengajuan langsung header, 8 kolom, tanggal asli, nol awal, TOTAL tengah', async () => {
    const sheet = await workbook([
        { Nomor: 'PJ.2610.0001', Tanggal: '2026-10-01', Nik: '000', Nama: 'Riri', Pabrik: 'K06', Bank: 'BSI', Norek: '001234567890123456', Pinjam: '500000.25' },
        { Nomor: 'PJ.2610.0002', Tanggal: '2026-10-12', Nik: '001', Nama: null, Pabrik: null, Bank: null, Norek: null, Pinjam: 400000.10 },
    ])
    assert.deepEqual(sheet.getRow(1).values.slice(1), ['TGL', 'NO', 'NIK', 'NAMA', 'UNIT', 'BANK', 'NO REK', 'PINJAMAN UANG KOPERASI'])
    assert.equal(sheet.getCell('A2').value.toISOString().slice(0, 10), '2026-10-01')
    assert.equal(sheet.getCell('A3').value.toISOString().slice(0, 10), '2026-10-12')
    assert.equal(sheet.getCell('B2').value, 1)
    assert.equal(sheet.getCell('B3').value, 2)
    assert.equal(sheet.getCell('C2').value, '000')
    assert.equal(sheet.getCell('G2').value, '001234567890123456')
    assert.equal(sheet.getCell('H2').value, 500000.25)
    assert.equal(sheet.getCell('H2').numFmt, '#,##0;[Red](#,##0);0')
    assert.equal(sheet.getCell('A4').value, 'TOTAL')
    assert.equal(sheet.getCell('A4').alignment.horizontal, 'center')
    assert.equal(sheet.getCell('H4').alignment.horizontal, 'right')
    assert.equal(sheet.getCell('H4').numFmt, '#,##0;[Red](#,##0);0')
    assert.equal(sheet.getCell('H4').value.result, 900000.35)
    assert.equal(sheet.getCell('H4').value.formula, 'SUM(H2:H3)')
    assert.equal(sheet.autoFilter, 'A1:H3')
    assert.notEqual(sheet.getCell('A1').fill.fgColor.argb, sheet.getCell('A4').fill.fgColor.argb)
    assert.equal(sheet.rowCount, 4)
    assert.equal(sheet.getRow(1).height, 30)
    assert.equal(sheet.getRow(2).height, 18)
    assert.equal(sheet.getRow(3).height, 18)
    assert.equal(sheet.getRow(4).height, 25)
    assert.equal(sheet.views[0].ySplit, 1)
    assert.equal(sheet.columnCount, 8)
})

test('Periode kosong menghasilkan header dan TOTAL nol; nominal NULL ditolak bukan dihitung nol', async () => {
    const sheet = await workbook([])
    assert.equal(sheet.getCell('A2').value, 'TOTAL')
    assert.equal(sheet.getCell('H2').value, 0)
    assert.equal(sheet.autoFilter, 'A1:H1')
    await assert.rejects(workbook([{ Nomor: 'OLD', Tanggal: '2026-10-01', Pinjam: null }]), { statusCode: 422 })
})

test('Tanggal sama digabung vertikal tanpa menggabungkan data/nominal atau tanggal berbeda', async () => {
    const sheet = await workbook(['2026-10-01', '2026-10-01', '2026-10-02', '2026-10-12', '2026-10-12']
        .map((Tanggal, index) => ({ Tanggal, Nik: `00${index}`, Pinjam: 100000 })))
    assert.equal(sheet.getCell('A3').master.address, 'A2')
    assert.equal(sheet.getCell('A6').master.address, 'A5')
    assert.equal(sheet.getCell('A4').isMerged, false)
    assert.equal(sheet.getCell('A2').alignment.vertical, 'middle')
    for (let row = 2; row <= 6; row++) {
        assert.equal(sheet.getCell(`B${row}`).value, row - 1)
        assert.equal(sheet.getCell(`H${row}`).value, 100000)
        assert.equal(sheet.getCell(`H${row}`).isMerged, false)
    }
    assert.equal(sheet.getCell('A7').value, 'TOTAL')
    assert.equal(sheet.getCell('H7').value.result, 500000)
})

function controller(query) {
    const scope = { pool: { query }, tanggalKeluarValid, sendPengajuanPinjamanExcel,
        error: (res, message, status) => { res.error = { message, status } } }
    const source = readFileSync(new URL('../src/controllers/transaksi/pinjamanController.js', import.meta.url), 'utf8')
    vm.createContext(scope)
    vm.runInContext(source.replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '') +
        '\nglobalThis.handler = getPengajuanPinjamanExcel;', scope)
    return scope.handler
}
const next = error => { throw error }

test('Export SELECT-only, periode wajib/inklusif, semua halaman/status, search/filter tidak diterapkan', async () => {
    const calls = []
    const handler = controller(async (sql, params) => {
        calls.push({ sql, params })
        return [[{ Nomor: 'PJ.2610.0001', Tanggal: '2026-10-01', Nik: '000', Pinjam: 500000 }]]
    })
    const res = response()
    await handler({ query: { start_date: '2026-10-01', end_date: '2026-10-12', search: "' OR 1=1", filterSet_Bank: ['BSI'], page: 9, per_page: 1 } }, res, next)
    assert.equal(calls.length, 1)
    assert.match(calls[0].sql, /^SELECT/)
    assert.match(calls[0].sql, /LEFT JOIN tkaryawan/)
    assert.match(calls[0].sql, /p\.tanggal BETWEEN \? AND \?/)
    assert.match(calls[0].sql, /ORDER BY p\.tanggal ASC, p\.nomor_pinjam ASC/)
    assert.doesNotMatch(calls[0].sql, /LIMIT|bayar|LIKE|BSI|OR 1=1/)
    assert.deepEqual(Array.from(calls[0].params), ['2026-10-01', '2026-10-12'])
    assert.ok(res.buffer)
})

test('Tanggal invalid/reversed/missing ditolak sebelum SELECT; GET dilindungi frmPinjam', async () => {
    const handler = controller(async () => { throw Error('Tidak boleh query') })
    for (const query of [{}, { start_date: '2026-02-30', end_date: '2026-03-01' },
        { start_date: '2026-10-12', end_date: '2026-10-01' },
        { start_date: ['2026-10-01'], end_date: '2026-10-12' }]) {
        const res = {}
        await handler({ query }, res, next)
        assert.equal(res.error.status, 400)
    }
    const routes = readFileSync(new URL('../src/routes/transaksiRoutes.js', import.meta.url), 'utf8')
    assert.match(routes, /r\.get\('\/pinjaman\/export-pengajuan', wajibHak\('frmPinjam'\), getPengajuanPinjamanExcel\)/)
})
