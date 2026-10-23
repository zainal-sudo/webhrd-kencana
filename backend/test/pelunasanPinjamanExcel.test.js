import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ExcelJS from 'exceljs'
import { queryPelunasan } from '../src/helpers/pelunasanPinjaman.js'
import { sendPelunasanPinjamanExcel } from '../src/helpers/pelunasanPinjamanExcel.js'

const choices = (...pairs) => JSON.stringify(pairs.map(([nomor_pinjam, potongan_ke]) => ({ nomor_pinjam, potongan_ke })))
const allChoices = choices(['000123', 1], ['000123', 2], ['UNKNOWN', 1])

function fixture() {
    const db = new DatabaseSync(':memory:')
    db.function('GREATEST', (a, b) => a == null ? null : Math.max(a, b))
    db.exec(`CREATE TABLE tpinjaman (nomor_pinjam TEXT, nik TEXT, pinjam REAL, bayar REAL,
        periode_potong1 TEXT, nilai_potong1 REAL, periode_potong2 TEXT, nilai_potong2 REAL,
        potong1_diproses_pada TEXT, potong2_diproses_pada TEXT);
        CREATE TABLE tkaryawan (kar_Nik TEXT, kar_nama TEXT);
        INSERT INTO tkaryawan VALUES ('001', 'Ani'), ('002', 'Budi');
        INSERT INTO tpinjaman VALUES
        ('000123','001',400000,200000,'November 2026',100000.5,'November 2026',99999.5,NULL,'2026-11-09 10:00:00'),
        ('UNKNOWN','002',400000,NULL,'November 2026',200000,'Desember 2026',200000,NULL,NULL),
        ('OTHER','001',100000,0,'Desember 2026',100000,NULL,NULL,NULL,NULL);`)
    const calls = []
    const scope = { queryPelunasan, sendPelunasanPinjamanExcel,
        pool: { async query(sql, params) { calls.push(sql); return [db.prepare(sql).all(...params)] } },
        paginated(res, rows, pagination) { res.data = rows; res.pagination = pagination },
        error(res, message, status) { res.error = { message, status } } }
    vm.createContext(scope)
    const source = readFileSync(new URL('../src/controllers/transaksi/pelunasanPinjamanController.js', import.meta.url), 'utf8')
    vm.runInContext(source.replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '') + '\nglobalThis.handler = getPelunasan', scope)
    return { db, calls, async request(query = {}) {
        const res = { headers: {}, setHeader(key, value) { this.headers[key] = value },
            status(code) { this.code = code; return this }, send(body) { this.body = body; return this } }
        await scope.handler({ query: { bulan: 11, tahun: 2026, ...query } }, res, e => { throw e })
        return res
    } }
}
async function sheet(res) {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(res.body)
    return wb.worksheets[0]
}

test('Export includes selected slots and typed values regardless of pagination; normal list remains paginated', async () => {
    const f = fixture()
    try {
        const list = await f.request({ page: 2, per_page: 1 })
        assert.equal(list.data.length, 1)
        assert.equal(list.data[0].PotonganKe, 2)
        assert.equal(list.pagination.total, 3)
        assert.equal(list.data[0].StatusProses, 'Sudah Diproses')
        const res = await f.request({ export: 'xlsx', items: allChoices, page: 2, per_page: 1 })
        assert.match(res.headers['Content-Disposition'], /Pelunasan-Pinjaman_2026-11\.xlsx/)
        assert.match(res.headers['Content-Type'], /spreadsheetml/)
        const ws = await sheet(res)
        assert.equal(ws.name, 'Pelunasan Pinjaman')
        assert.equal(ws.getRow(1).cellCount, 11)
        assert.equal(ws.getCell('A1').value, 'NO')
        assert.equal(ws.getCell('C1').value, 'NAMA KARYAWAN')
        assert.equal(ws.getCell('A4').value, 3)
        assert.equal(ws.getCell('B2').value, '001')
        assert.equal(ws.getCell('D2').value, '000123')
        assert.equal(ws.getCell('B2').numFmt, '@')
        assert.equal(ws.getCell('F2').value, 400000)
        const rupiah = '"Rp"* #,##0;[Red]"Rp"* (#,##0);"Rp"* 0;@'
        assert.equal(ws.getCell('F2').numFmt, rupiah)
        assert.equal(ws.getCell('F2').alignment.horizontal, 'right')
        assert.equal(ws.getCell('G2').value, 100000.5)
        assert.equal(ws.getCell('G2').numFmt, rupiah)
        assert.equal(ws.getCell('G2').type, ExcelJS.ValueType.Number)
        assert.equal(ws.getCell('H4').value, null)
        assert.equal(ws.getCell('I4').value, null)
        assert.equal(ws.getCell('J2').value, 'Belum Diproses')
        assert.equal(ws.getCell('J3').value, 'Sudah Diproses')
        assert.equal(ws.getCell('K3').value, '2026-11-09 10:00:00')
        assert.equal(ws.getCell('A5').value, 'TOTAL POTONGAN')
        assert.deepEqual(ws.getCell('G5').value, { formula: 'SUM(G2:G4)', result: 400000 })
        assert.equal(ws.getCell('G5').numFmt, rupiah)
        assert.equal(ws.getCell('H5').value, null)
        assert.equal(ws.views[0].ySplit, 1)
        assert.equal(ws.views[0].showGridLines, false)
        assert.equal(ws.getRow(2).height, 18)
        assert.equal(ws.getRow(1).height, 30)
        assert.equal(ws.getRow(5).height, 25)
        assert.equal(ws.autoFilter, 'A1:K4')
        assert.equal(ws.getCell('A1').fill.fgColor.argb, 'FF243656')
        assert.equal(ws.getCell('G5').fill.fgColor.argb, 'FFFFEB3B')
        assert.equal(ws.getCell('A5').alignment.horizontal, 'center')
        assert.equal(ws.getCell('B2').font.size, 11)
        for (const side of ['top', 'bottom', 'left', 'right']) assert.equal(ws.getCell('C2').border[side].style, 'thin')
        assert.equal(ws.pageSetup.orientation, 'landscape')
        assert.equal(ws.rowCount, 5)
        assert.ok(!f.calls.at(-1).includes('LIMIT'))
        assert.ok(f.calls.every(sql => sql.startsWith('SELECT')))
    } finally { f.db.close() }
})

test('Export applies selection, search and period and rejects stale selections', async () => {
    const f = fixture()
    try {
        for (const search of ['Ani', '001', '000123']) {
            const ws = await sheet(await f.request({ export: 'xlsx', search, items: choices(['000123', 1], ['000123', 2]) }))
            assert.equal(ws.getCell('C2').value, 'Ani')
            assert.equal(ws.getCell('G4').value.result, 200000)
        }
        const single = await sheet(await f.request({ export: 'xlsx', items: choices(['000123', 2]) }))
        assert.equal(single.getCell('E2').value, 2)
        assert.equal(single.getCell('G3').value.result, 99999.5)
        assert.equal(single.getCell('A3').value, 'TOTAL POTONGAN')
        const december = await sheet(await f.request({ export: 'xlsx', bulan: 12, search: 'OTHER', items: choices(['OTHER', 1]) }))
        assert.equal(december.getCell('D2').value, 'OTHER')
        for (const query of [{ search: 'missing', items: allChoices }, { items: choices(['OTHER', 1]) },
            { items: choices(['000123', 1], ['MISSING', 1]) }]) {
            const stale = await f.request({ export: 'xlsx', ...query })
            assert.equal(stale.error.status, 409)
            assert.equal(stale.body, undefined)
        }
        const before = f.calls.length
        const invalid = await f.request({ export: 'xlsx', bulan: 13 })
        assert.equal(invalid.error.status, 400)
        assert.equal(f.calls.length, before)
    } finally { f.db.close() }
})

test('Export requires valid unique selections and never falls back to exporting all rows', async () => {
    const f = fixture()
    try {
        for (const items of [undefined, '', '{', '[]', '{}', 'null', choices(['000123', 1], ['000123', 1]),
            choices(['000123', 3]), JSON.stringify([{ nomor_pinjam: 123, potongan_ke: 1 }]),
            choices(...Array(101).fill(['000123', 1]))]) {
            const res = await f.request({ export: 'xlsx', items })
            assert.equal(res.error.status, 400)
            assert.equal(res.body, undefined)
        }
        assert.equal(f.calls.length, 0)
    } finally { f.db.close() }
})
