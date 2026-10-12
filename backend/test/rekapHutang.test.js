import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ExcelJS from 'exceljs'
import { applyAllColumnFilters, buildOrderBy } from '../src/helpers/browse.js'
import { sendRekapHutangExcel } from '../src/helpers/rekapHutangExcel.js'

function fixture() {
    const db = new DatabaseSync(':memory:')
    db.exec(`CREATE TABLE tpinjaman (nomor_pinjam TEXT, tanggal TEXT, nik TEXT, pinjam REAL, bayar REAL);
        CREATE TABLE tkaryawan (kar_Nik TEXT PRIMARY KEY, kar_nama TEXT, kar_pab_kode TEXT, kar_bagian TEXT, kar_status_aktif INTEGER);
        INSERT INTO tkaryawan VALUES ('001', 'Ani', 'P01', 'HRD', 1), ('002', 'Budi', 'P02', 'Produksi', 0);
        INSERT INTO tpinjaman VALUES
        ('PJ.2610.0001','2026-10-01','001',400000,100000),
        ('LEGACY.002','2020-01-01','002',500000,200000),
        ('ORPHAN','2019-01-01','003',200000,0),
        ('SETTLED','2026-10-02','001',200000,200000),
        ('OVERPAID','2026-10-03','001',200000,250000),
        ('UNKNOWN','2026-10-04','001',200000,NULL),
        ('NO-PRINCIPAL','2026-10-05','001',NULL,0);`)
    const calls = []
    const scope = { pool: { query: async (sql, params = []) => {
        calls.push({ sql, params })
        return [db.prepare(sql).all(...params)]
    } }, applyAllColumnFilters, buildOrderBy,
    sendRekapHutangExcel,
    PLAFON_PINJAMAN: 30000000,
    success: (res, data) => { res.data = data }, error: (res, message, status) => { res.error = { message, status } },
    paginated: (res, data, pagination) => { res.data = data; res.pagination = pagination } }
    vm.createContext(scope)
    const source = readFileSync(new URL('../src/controllers/transaksi/rekapHutangController.js', import.meta.url), 'utf8')
    vm.runInContext(source.replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '') + '\nglobalThis.handler = getRekapHutang', scope)
    async function request(query = {}) {
        const res = { headers: {}, setHeader(key, value) { this.headers[key] = value }, status(code) { this.code = code; return this }, send(body) { this.body = body; return this } }
        await scope.handler({ query }, res, e => { throw e })
        return res
    }
    return { db, calls, request }
}

test('Current report shows active debt documents only, including inactive employees and missing employee records', async () => {
    const f = fixture()
    try {
        const res = await f.request({ per_page: 1 })
        assert.equal(res.data.length, 1)
        assert.equal(res.data[0].Nomor, 'PJ.2610.0001')
        assert.equal(res.data[0].SisaBayar, 300000)
        assert.equal(res.pagination.total, 3)
        assert.equal(res.pagination.last_page, 3)
        const total = res.pagination.saldo_saat_ini
        assert.equal(total.pinjam, 1100000); assert.equal(total.bayar, 300000); assert.equal(total.sisa, 800000)
        assert.equal(total.jumlah, 3); assert.equal(total.sisa_plafon, 29200000); assert.equal(total.saldo_tidak_diketahui, 2)
        const all = await f.request()
        assert.deepEqual(Array.from(all.data, row => row.Nomor), ['PJ.2610.0001', 'LEGACY.002', 'ORPHAN'])
        assert.equal(all.data[1].Nama, 'Budi'); assert.equal(all.data[2].Nama, null)
        assert.equal(f.db.prepare('SELECT bayar FROM tpinjaman WHERE nomor_pinjam = ?').get('UNKNOWN').bayar, null)
        assert.ok(f.calls.every(call => call.sql.startsWith('SELECT')))
    } finally { f.db.close() }
})

test('Filtered totals cover all matching pages while current global balance stays independent', async () => {
    const f = fixture()
    try {
        const res = await f.request({ search: 'Budi', per_page: 1 })
        assert.equal(res.pagination.hasil_filter.jumlah, 1); assert.equal(res.pagination.hasil_filter.sisa, 300000)
        assert.equal(res.pagination.saldo_saat_ini.sisa, 800000)
        const plant = await f.request({ filterSet_Pabrik: ['P01'] })
        assert.equal(plant.pagination.total, 1); assert.equal(plant.data[0].Nik, '001')
        const empty = await f.request({ search: "' OR 1=1 --" })
        assert.equal(empty.data.length, 0); assert.equal(empty.pagination.hasil_filter.sisa, 0)
        assert.equal(empty.pagination.saldo_saat_ini.sisa, 800000)
        const page = await f.request({ page: 2, per_page: 1 })
        assert.equal(page.data[0].Nomor, 'LEGACY.002'); assert.equal(page.pagination.hasil_filter.sisa, 800000)
    } finally { f.db.close() }
})

test('Distinct options and sorting are whitelisted and restricted to active debt', async () => {
    const f = fixture()
    try {
        const invalid = await f.request({ distinct: '__proto__' }); assert.equal(invalid.error.status, 400)
        const plants = await f.request({ distinct: 'Pabrik' }); assert.deepEqual(Array.from(plants.data), [null, 'P01', 'P02'])
        const sorted = await f.request({ sort_by: 'Pinjam', sort_dir: 'asc' })
        assert.deepEqual(Array.from(sorted.data, row => row.Pinjam), [200000, 400000, 500000])
        await f.request({ sort_by: '__proto__', sort_dir: 'DROP TABLE tpinjaman' })
        assert.equal(f.db.prepare('SELECT COUNT(*) AS c FROM tpinjaman').get().c, 7)
    } finally { f.db.close() }
})

test('Excel exports all filtered/sorted documents, numeric money, text NIK and current/filtered total rows', async () => {
    const f = fixture()
    try {
        const res = await f.request({ export: 'xlsx', page: 2, per_page: 1, sort_by: 'Pinjam', sort_dir: 'asc' })
        const wb = new ExcelJS.Workbook(); await wb.xlsx.load(res.body)
        const sheet = wb.worksheets[0]
        assert.equal(sheet.getCell('A2').value, 1); assert.equal(sheet.getCell('A4').value, 3)
        assert.equal(sheet.getCell('D3').value, '001')
        assert.equal(sheet.getCell('H2').value, 200000)
        assert.equal(sheet.getCell('B5').value, 'TOTAL HASIL FILTER'); assert.equal(sheet.getCell('J5').value, 800000)
        assert.equal(sheet.getCell('J6').value, 800000); assert.equal(sheet.getCell('J7').value, 29200000)
        assert.equal(sheet.getCell('J8').value, 2)
        assert.ok(sheet.getColumn(2).width <= 26)
        assert.ok(sheet.getColumn(1).width <= 8)
        assert.ok(sheet.getCell('B5').isMerged)
        assert.equal(sheet.getCell('H2').numFmt, '#,##0')
        assert.equal(sheet.getCell('D3').numFmt, '@')
        assert.equal(sheet.views[0].ySplit, 1)
        assert.ok(f.calls.at(-1).sql.indexOf('LIMIT') < 0)
        const filtered = await f.request({ export: 'xlsx', search: 'Budi' })
        await wb.xlsx.load(filtered.body)
        assert.equal(wb.worksheets[0].getCell('J3').value, 300000)
        assert.equal(wb.worksheets[0].getCell('J4').value, 800000)
    } finally { f.db.close() }
})

test('Excel sizes using all document rows, wraps long text and keeps totals out of document sizing', async () => {
    const rows = Array.from({ length: 35 }, (_, index) => ({ Nomor: `PJ.2610.${String(index + 1).padStart(4, '0')}`,
        Tanggal: '2026-10-12', Nik: '0001234567', Nama: index === 34 ? 'MUHAMMAD ROFIQ AZHAR WITH A VERY LONG EMPLOYEE NAME' : 'Ani',
        Pabrik: 'P04', Bagian: index === 34 ? 'CETAK MESIN DAN FINISHING PRODUKSI BAGIAN TAMBAHAN' : 'HRD',
        Pinjam: 500000, Bayar: 0, SisaBayar: 500000 }))
    const res = { setHeader() {}, status() { return this }, send(body) { this.body = body } }
    const totals = { pinjam: 17500000, bayar: 0, sisa: 17500000, sisa_plafon: 12500000, saldo_tidak_diketahui: 0 }
    await sendRekapHutangExcel(res, rows, totals, totals)
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(res.body)
    const sheet = wb.worksheets[0]
    assert.equal(sheet.getColumn(5).width, 42); assert.equal(sheet.getColumn(7).width, 32)
    assert.ok(sheet.getRow(36).height > sheet.getRow(2).height)
    assert.equal(sheet.getCell('E36').alignment.wrapText, true)
    assert.equal(sheet.getCell('E36').value, rows[34].Nama)
    assert.ok(sheet.getColumn(2).width <= 26); assert.equal(sheet.getCell('D36').value, '0001234567')
    assert.deepEqual(sheet.autoFilter, 'A1:J36')
})

test('No outstanding debt produces zero totals without counting unknown documents as settled', async () => {
    const f = fixture()
    try {
        f.db.exec('UPDATE tpinjaman SET bayar = pinjam WHERE pinjam IS NOT NULL AND bayar IS NOT NULL')
        const res = await f.request()
        assert.equal(res.data.length, 0); assert.equal(res.pagination.total, 0); assert.equal(res.pagination.last_page, 1)
        assert.equal(res.pagination.saldo_saat_ini.sisa, 0); assert.equal(res.pagination.saldo_saat_ini.sisa_plafon, 30000000)
        assert.equal(res.pagination.saldo_saat_ini.saldo_tidak_diketahui, 2)
        const exported = await f.request({ export: 'xlsx' })
        const wb = new ExcelJS.Workbook(); await wb.xlsx.load(exported.body)
        assert.equal(wb.worksheets[0].getCell('B2').value, 'TOTAL HASIL FILTER')
        assert.equal(wb.worksheets[0].getCell('J2').value, 0)
    } finally { f.db.close() }
})

test('Report endpoint has existing View permission only, with no write routes or permission bypass', () => {
    const routes = readFileSync(new URL('../src/routes/transaksiRoutes.js', import.meta.url), 'utf8')
    assert.match(routes, /r.get\('\/pinjaman\/rekap-hutang', wajibHak\('frmLapSaldo'\), getRekapHutang\)/)
    assert.doesNotMatch(routes, /r\.(post|put|delete)\('\/pinjaman\/rekap-hutang'/)
})
