import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { nomorPinjamanBerikut, validasiPinjaman, tambahPinjaman, periodePinjaman, kalkulasiPinjaman, PINJAMAN_OPTIONS, PLAFON_PINJAMAN, revisionPinjaman, jadwalPinjaman } from '../src/helpers/pinjaman.js'
import { tanggalKeluarValid } from '../src/helpers/keluar.js'
import { buildOrderBy, applyAllColumnFilters } from '../src/helpers/browse.js'
import { applyKaryawanLookup } from '../src/helpers/karyawanLookup.js'
import { sendExcel } from '../src/helpers/excel.js'
import ExcelJS from 'exceljs'

// No live database connection/config imported: all SQL is exercised with mocks.
const body = { nik: '001', tanggal: '2026-10-09', pinjam: 400000, angsuran: 2, bank: 'BSI', norek: '0012345678' }
function database(initial = [], employees = { '001': 1, '002': 1, '003': 1 }, settings = {}) {
    const rows = structuredClone(initial), calls = []
    let tail = Promise.resolve()
    return { rows, calls, async getConnection() {
        let unlock, staged = null
        return {
            async query(sql, params = []) {
                calls.push({ sql, params })
                if (sql.includes('GET_LOCK')) {
                    if (settings.timeout) return [[{ acquired: 0 }]]
                    const previous = tail
                    tail = new Promise(resolve => { unlock = resolve })
                    await previous
                    return [[{ acquired: 1 }]]
                }
                if (sql.includes('RELEASE_LOCK')) { unlock(); if (settings.failRelease) throw Error('release failed'); return [[{ released: 1 }]] }
                if (sql.includes('FROM tkaryawan')) return [Object.hasOwn(employees, params[0]) ? [{ Aktif: employees[params[0]] }] : []]
                if (sql.includes('WHERE nik = ?')) return [rows.filter(r => r.nik === params[0] && r.bayar != null && r.pinjam - r.bayar > 0)]
                if (sql.includes('AS melebihi')) {
                    assert.match(sql, /CAST\(bayar AS DECIMAL\(65,20\)\)/)
                    return [[{ melebihi: rows.reduce((sum, r) => sum + (r.bayar != null && r.pinjam - r.bayar > 0 ? r.pinjam - r.bayar : 0), 0) + params[0] > params[1] ? 1 : 0 }]]
                }
                if (sql.includes('MAX(')) {
                    assert.match(sql, /nomor_pinjam REGEXP/)
                    const prefix = params[0].slice(0, -1)
                    return [[{ urut: Math.max(0, ...rows.filter(r => r.nomor_pinjam?.startsWith(prefix) && /^PJ\.\d{4}\.\d{4}$/.test(r.nomor_pinjam)).map(r => Number(r.nomor_pinjam.slice(-4)))) }]]
                }
                if (sql.startsWith('INSERT')) {
                    if (settings.failInsert) throw Error('insert failed')
                    const [nomor_pinjam, nik, tanggal, pinjam, bayar, angsuran, bank, norek, periode_potong1, nilai_potong1, periode_potong2, nilai_potong2] = params
                    assert.ok(!rows.some(r => r.nomor_pinjam === nomor_pinjam))
                    staged = { nomor_pinjam, nik, tanggal, pinjam, bayar, angsuran, bank, norek, periode_potong1, nilai_potong1, periode_potong2, nilai_potong2 }
                    return [{ affectedRows: 1 }]
                }
                throw Error(`Unexpected SQL: ${sql}`)
            },
            async beginTransaction() { calls.push({ sql: 'BEGIN' }) },
            async commit() { rows.push(staged); staged = null; calls.push({ sql: 'COMMIT' }) },
            async rollback() { staged = null; calls.push({ sql: 'ROLLBACK' }); if (settings.failRollback) throw Error('rollback failed') },
            release() { calls.push({ sql: 'RELEASE_CONNECTION' }) },
            destroy() { calls.push({ sql: 'DESTROY_CONNECTION' }) },
        }
    } }
}

test('Number uses transaction YYMM, prefix-specific MAX, month reset, legacy untouched', async () => {
    const legacy = { nomor_pinjam: 'PJ.2002.0022', nik: 'old', tanggal: '2020-03-09', bayar: 0 }
    const db = database([legacy, { nomor_pinjam: 'PJ.2610.0002', nik: 'old', bayar: 0 }, { nomor_pinjam: 'PJ.2611.0080junk', bayar: 0 }])
    assert.equal((await tambahPinjaman(db, body)).nomor, 'PJ.2610.0003')
    assert.equal((await tambahPinjaman(db, { ...body, nik: '002', tanggal: '2026-11-02' })).nomor, 'PJ.2611.0001')
    assert.deepEqual(db.rows[0], legacy)
    const maxQueries = db.calls.filter(c => c.sql.includes('MAX('))
    assert.deepEqual(maxQueries.map(c => c.params), [['PJ.2610.%'], ['PJ.2611.%']])
})
test('Preview starts 0001 and suffix overflow rejected', async () => {
    assert.equal(await nomorPinjamanBerikut({ query: async () => [[{ urut: null }]] }, '2026-10-09'), 'PJ.2610.0001')
    await assert.rejects(nomorPinjamanBerikut({ query: async () => [[{ urut: 9999 }]] }, body.tanggal), /9999/)
    await assert.rejects(nomorPinjamanBerikut({}, '2026-02-30'), /Tanggal/)
})
for (const [name, change, message] of [
    ['nonactive', {}, /aktif/], ['missing NIK', { nik: '404' }, /tidak ditemukan/],
]) test(`${name} rejected and transaction rolled back`, async () => {
    const db = database([], { '001': 0 })
    await assert.rejects(tambahPinjaman(db, { ...body, ...change }), message)
    assert.equal(db.rows.length, 0)
    assert.ok(db.calls.some(c => c.sql === 'ROLLBACK'))
    assert.ok(db.calls.some(c => c.sql.includes('RELEASE_LOCK')))
})
for (const [field, value, message] of [
    ['pinjam', 250000, /Nominal/], ['pinjam', '400000', /Nominal/], ['angsuran', 6, /cicilan/],
    ['angsuran', 1.5, /cicilan/], ['angsuran', '2', /cicilan/], ['bank', 'OTHER', /Bank/],
    ['norek', '', /rekening/], ['norek', 'a'.repeat(51), /50/], ['tanggal', '2026-02-29', /Tanggal/], ['nik', '', /NIK/],
    ['norek', 12345, /teks/],
]) test(`Validation rejects ${field}=${value}`, () => assert.throws(() => validasiPinjaman({ ...body, [field]: value }), message))
test('Allowed values and leading zero preserved; body cannot override balance or number', async () => {
    for (const pinjam of PINJAMAN_OPTIONS.nominal) for (const angsuran of PINJAMAN_OPTIONS.angsuran) for (const bank of PINJAMAN_OPTIONS.bank)
        assert.equal(validasiPinjaman({ ...body, pinjam, angsuran, bank }).pinjam, pinjam)
    const db = database()
    const result = await tambahPinjaman(db, { ...body, bayar: 0, nomor_pinjam: 'FAKE' })
    assert.equal(result.bayar, 0)
    assert.equal(db.rows[0].bayar, 0)
    assert.equal(db.rows[0].norek, '0012345678')
    assert.equal(db.rows[0].nomor_pinjam, 'PJ.2610.0001')
})
test('Active loan rejected; paid history preserved and permits a new loan', async () => {
    const active = database([{ nik: '001', pinjam: 400000, bayar: 1 }])
    await assert.rejects(tambahPinjaman(active, body), { message: 'Karyawan masih memiliki pinjaman yang belum lunas.' })
    const history = { nomor_pinjam: 'PJ.2002.0022', nik: '001', pinjam: 400000, bayar: 400000 }
    const db = database([history])
    await tambahPinjaman(db, body)
    assert.deepEqual(db.rows[0], history)
    assert.equal(db.rows.length, 2)
})
test('Global outstanding exactly 30m allowed; greater rejected; zero/negative/NULL ignored', async () => {
    const db = database([{ nik: 'old', pinjam: 30000000, bayar: 400000 }, { pinjam: 400000, bayar: 900000 }, { pinjam: 400000, bayar: null }, { pinjam: 400000, bayar: 400000 }])
    await tambahPinjaman(db, body)
    await assert.rejects(tambahPinjaman(db, { ...body, nik: '002' }), { message: 'Pinjaman baru melebihi sisa plafon perusahaan.' })
    const over = database([{ pinjam: 29700000, bayar: 0 }])
    await assert.rejects(tambahPinjaman(over, body), /sisa plafon/)
    const fraction = database([{ pinjam: 29600000.001, bayar: 0 }])
    await assert.rejects(tambahPinjaman(fraction, body), /sisa plafon/)
})
test('Concurrent web loans for same NIK: only one insert', async () => {
    const db = database()
    const results = await Promise.allSettled([tambahPinjaman(db, body), tambahPinjaman(db, body)])
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
    assert.equal(db.rows.length, 1)
})
test('Concurrent different NIK: unique increasing numbers and shared global ceiling', async () => {
    const db = database()
    const results = await Promise.all([tambahPinjaman(db, body), tambahPinjaman(db, { ...body, nik: '002' })])
    assert.deepEqual(results.map(r => r.nomor), ['PJ.2610.0001', 'PJ.2610.0002'])
    const cap = database([{ pinjam: 29600000, bayar: 0 }])
    const limited = await Promise.allSettled([tambahPinjaman(cap, body), tambahPinjaman(cap, { ...body, nik: '002', tanggal: '2026-11-02' })])
    assert.equal(limited.filter(r => r.status === 'fulfilled').length, 1)
    assert.equal(cap.rows.length, 2)
})
test('Lock timeout and failed INSERT never commit; connection always released', async () => {
    for (const settings of [{ timeout: true }, { failInsert: true }]) {
        const db = database([], undefined, settings)
        await assert.rejects(tambahPinjaman(db, body))
        assert.equal(db.rows.length, 0)
        assert.ok(!db.calls.some(c => c.sql === 'COMMIT'))
        assert.equal(db.calls.at(-1).sql, 'RELEASE_CONNECTION')
    }
})
test('Failed rollback or lock release destroys connection rather than returning unsafe pooled connection', async () => {
    for (const settings of [{ failInsert: true, failRollback: true }, { failInsert: true, failRelease: true }]) {
        const db = database([], undefined, settings)
        await assert.rejects(tambahPinjaman(db, body))
        assert.equal(db.calls.at(-1).sql, 'DESTROY_CONNECTION')
        assert.equal(db.rows.length, 0)
    }
})
for (const [tanggal, angsuran, expected] of [
    ['2026-10-20', 1, 'Oktober 2026'], ['2026-10-21', 1, 'November 2026'],
    ['2026-10-18', 2, 'Oktober 2026, November 2026'], ['2026-10-25', 2, 'November 2026, Desember 2026'],
    ['2026-12-25', 2, 'Januari 2027, Februari 2027'], ['2026-02-30', 2, null], ['2026-10-09', 0, null],
]) test(`Periods ${tanggal}/${angsuran}`, () => assert.equal(periodePinjaman(tanggal, angsuran), expected))
test('Legacy 6/10 installments, NULLs and status are derived without mutating records', () => {
    for (const Cicilan of [6, 10]) {
        const row = { Tanggal: '2020-03-21', Pinjam: 600000, Cicilan, Bank: null, Norek: null, Bayar: 600000 }
        const copy = structuredClone(row), result = kalkulasiPinjaman(row)
        assert.equal(result.Periode.split(', ').length, Cicilan)
        assert.equal(result.NominalCicilan, 600000 / Cicilan)
        assert.equal(result.Status, 'Lunas')
        assert.deepEqual(row, copy)
    }
    assert.equal(kalkulasiPinjaman({ Pinjam: 400000, Bayar: 0 }).Status, 'Belum Lunas')
    assert.equal(kalkulasiPinjaman({ Pinjam: 400000, Bayar: 400001 }).Status, 'Lunas')
    assert.equal(kalkulasiPinjaman({ Pinjam: 400000, Bayar: null }).Status, null)
    assert.equal(kalkulasiPinjaman({ Pinjam: 400000, Bayar: 150000 }).SisaBayar, 250000)
    assert.equal(kalkulasiPinjaman({ Tanggal: null, Cicilan: 0 }).Periode, null)
})

function controller(query, exportOutstanding = 0) {
    const scope = { pool: { query: (sql, params) => sql.includes('AS outstanding') && params === undefined && exportOutstanding !== null
        ? Promise.resolve([[{ outstanding: exportOutstanding }]]) : query(sql, params) }, nomorPinjamanBerikut, tambahPinjaman, kalkulasiPinjaman, PINJAMAN_OPTIONS, PLAFON_PINJAMAN, revisionPinjaman,
        tanggalKeluarValid, buildOrderBy, applyAllColumnFilters, applyKaryawanLookup,
        success: (res, data) => { res.data = data }, error: (res, message, status) => { res.error = { message, status } },
        paginated: (res, data, pagination) => { res.data = data; res.pagination = pagination },
        sendExcel: (res, title, columns, data) => { res.data = data; res.columns = columns }, }
    scope.sendPinjamanExcel = (res, columns, data, options) => { res.data = data; res.columns = columns; res.options = options }
    vm.createContext(scope)
    const source = readFileSync(new URL('../src/controllers/transaksi/pinjamanController.js', import.meta.url), 'utf8')
    vm.runInContext(source.replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '') +
        '\nglobalThis.handlers = {getPinjamanList,getDetailPinjaman,getRingkasanPinjaman,lookupKaryawanPinjaman};', scope)
    return scope.handlers
}
const next = e => { throw e }
for (const [tanggal, angsuran, first, second] of [
    ['2026-10-09', 2, 'Oktober 2026', 'November 2026'],
    ['2026-10-25', 2, 'November 2026', 'Desember 2026'],
    ['2026-12-25', 2, 'Januari 2027', 'Februari 2027'],
    ['2026-10-09', 1, 'Oktober 2026', null],
]) test(`Stored schedule INSERT ${tanggal}/${angsuran}, ignores frontend schedule`, async () => {
    const expected = { periode_potong1: first, nilai_potong1: 400000 / angsuran,
        periode_potong2: second, nilai_potong2: angsuran === 2 ? 200000 : null }
    assert.deepEqual(jadwalPinjaman(tanggal, 400000, angsuran), expected)
    const db = database()
    const result = await tambahPinjaman(db, { ...body, tanggal, angsuran, periode_potong1: 'FAKE', nilai_potong1: 1 })
    for (const key of Object.keys(expected)) {
        assert.equal(db.rows[0][key], expected[key])
        assert.equal(result[key], expected[key])
    }
})
test('Browse/detail/export prefer stored schedule; legacy NULL fallback does not write', async () => {
    for (const stored of [true, false]) {
        const row = { Nomor: 'PJ.2610.0001', Tanggal: '2026-10-09', Pinjam: 400000, Bayar: 0, Cicilan: 2,
            periode_potong1: stored ? 'Januari 2027' : null, nilai_potong1: stored ? 123000 : null,
            periode_potong2: stored ? 'Februari 2027' : null, nilai_potong2: stored ? 277000 : null }
        const before = structuredClone(row)
        const handlers = controller(async sql => {
            assert.ok(sql.startsWith('SELECT'))
            if (!sql.startsWith('SELECT COUNT')) {
                assert.match(sql, /p\.periode_potong1/)
                assert.match(sql, /p\.nilai_potong2/)
            }
            return sql.startsWith('SELECT COUNT') ? [[{ c: 1 }]] : [[row]]
        })
        const browse = {}, detail = {}, excel = {}
        await handlers.getPinjamanList({ query: {} }, browse, next)
        await handlers.getDetailPinjaman({ query: { nomor: row.Nomor } }, detail, next)
        await handlers.getPinjamanList({ query: { export: 'xlsx' } }, excel, next)
        for (const result of [browse.data[0], detail.data]) {
            assert.equal(result.Periode, stored ? 'Januari 2027, Februari 2027' : 'Oktober 2026, November 2026')
            assert.equal(result.NominalCicilan, stored ? 123000 : 200000)
        }
        assert.equal(excel.data[0].POTONGAN, 0)
        assert.equal(excel.data[0]['SALDO POTONGAN'], 400000)
        assert.ok(!Object.hasOwn(excel.data[0], 'nilai_potong2'))
        assert.deepEqual(row, before)
    }
})
test('Partial stored schedule is not silently replaced with calculated values', () => {
    const result = kalkulasiPinjaman({ Tanggal: '2026-10-09', Pinjam: 400000, Cicilan: 2,
        periode_potong1: 'Mei 2027', nilai_potong1: null, periode_potong2: null, nilai_potong2: null })
    assert.deepEqual(result.Potongan, [{ periode: 'Mei 2027', nominal: null }])
    assert.equal(result.NominalCicilan, null)
})
test('Browse/detail/export preserve legacy and LEFT JOIN; export all same filter/sort, account text', async () => {
    const calls = []
    const row = { Nomor: 'PJ.2002.0022', Tanggal: '2020-03-21', Nik: 'orphan', Nama: null, Bagian: null,
        Pinjam: 600000, Cicilan: 6, Bank: null, Norek: '001234', SisaBayar: null }
    const handlers = controller(async (sql, params) => {
        calls.push({ sql, params: Array.from(params) })
        assert.match(sql, /LEFT JOIN tkaryawan/)
        return sql.startsWith('SELECT COUNT') ? [[{ c: 1 }]] : [[row]]
    })
    const query = { search: 'orphan', sort_by: 'Pinjam', sort_dir: 'desc', filterSet_Cicilan: ['6'] }
    const browse = {}, excel = {}, detail = {}
    await handlers.getPinjamanList({ query: { ...query, page: 2, per_page: 25 } }, browse, next)
    const listSQL = calls[0]
    await handlers.getPinjamanList({ query: { ...query, export: 'xlsx' } }, excel, next)
    assert.equal(listSQL.sql.replace(/ LIMIT \? OFFSET \?$/, ''), calls[2].sql)
    assert.deepEqual(listSQL.params.slice(0, -2), calls[2].params)
    assert.equal(excel.data[0]['NO REK'], '001234')
    assert.equal(excel.data[0].BANK, '—')
    assert.equal(excel.data[0]['SALDO POTONGAN'], '—')
    assert.equal(browse.data[0].Cicilan, 6)
    await handlers.getDetailPinjaman({ query: { nomor: row.Nomor } }, detail, next)
    assert.equal(detail.data.Nomor, row.Nomor)
    assert.equal(detail.data.Periode.split(', ').length, 6)
    const frontend = readFileSync(new URL('../../frontend/src/views/transaksi/PinjamanView.vue', import.meta.url), 'utf8')
    assert.deepEqual(Array.from(excel.columns), ['NO', ...[...frontend.matchAll(/\{ key: "[^"]+", label: "([^"]+)"/g)].map(m => m[1])])
})
test('Summary ignores request filters; lookup enforces active search and safe sort', async () => {
    const calls = []
    const handlers = controller(async (sql, params) => {
        calls.push({ sql, params })
        if (sql.includes('AS outstanding')) return [[{ outstanding: '29700000' }]]
        return sql.startsWith('SELECT COUNT') ? [[{ c: 0 }]] : [[]]
    }, null)
    const summary = {}
    await handlers.getRingkasanPinjaman({ query: { search: '001', start_date: '2026-10-01' } }, summary, next)
    assert.equal(summary.data.sisa_plafon, 300000)
    assert.match(calls[0].sql, /FROM tpinjaman WHERE pinjam - bayar > 0$/)
    await handlers.lookupKaryawanPinjaman({ query: { search: 'HRD', sort_by: 'Nama', sort_dir: 'desc' } }, {}, next)
    assert.match(calls[1].sql, /kar_status_aktif = 1/)
    assert.match(calls[1].sql, /j\.jab_nama LIKE \?/)
    assert.match(calls[1].sql, /ORDER BY k\.kar_nama DESC/)
})
test('Actual Excel output keeps leading-zero account as string and loan values numeric', async () => {
    const columns = ['Nomor', 'Norek', 'Pinjam', 'Bank']
    const res = { headers: {}, setHeader(key, value) { this.headers[key] = value }, status() { return this }, send(buffer) { this.buffer = buffer } }
    await sendExcel(res, 'Pinjaman', columns, [{ Nomor: 'PJ.2002.0022', Norek: '0012345678', Pinjam: 600000, Bank: null }])
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(res.buffer)
    const sheet = workbook.worksheets[0]
    assert.equal(sheet.getCell('B2').value, '0012345678')
    assert.equal(sheet.getCell('C2').value, 600000)
    assert.equal(sheet.getCell('D2').value, '')
})

test('Pinjaman Excel has exact flat headers, sequential NO, numeric paid/outstanding and preserves account zeros', async () => {
    const rows = [
        { Nomor: 'PJ.2610.0008', Nik: '001', Nama: 'Riri', Pabrik: 'K06', Bagian: 'HRD', Bank: 'BSI', Norek: '0001234',
            Pinjam: 400000, Cicilan: 2, Bayar: 100000, periode_potong1: 'Oktober 2026', nilai_potong1: 200000 },
        { Nomor: 'OLD', Nik: '002', Pinjam: 600000, Cicilan: 10, Bayar: null, Norek: null },
    ]
    const calls = []
    const handlers = controller(async (sql, params) => { calls.push({ sql, params }); return [rows] })
    const res = {}
    await handlers.getPinjamanList({ query: { export: 'xlsx', page: 2, per_page: 1, search: 'Riri', sort_by: 'Pabrik', sort_dir: 'asc', filterSet_Bank: ['BSI'] } }, res, next)
    const headers = ['NO', 'NIK', 'NAMA KARYAWAN', 'UNIT', 'BAGIAN', 'BANK', 'NO REK', 'PINJAMAN UANG KOPERASI', 'ANGSURAN', 'POTONGAN', 'SALDO POTONGAN']
    assert.deepEqual(Array.from(res.columns), headers)
    assert.equal(res.data.length, 2)
    assert.equal(res.data[0].NO, 1)
    assert.equal(res.data[1].NO, 2)
    assert.equal(res.data[0].POTONGAN, 100000)
    assert.equal(res.data[0]['SALDO POTONGAN'], 300000)
    assert.equal(res.data[1]['SALDO POTONGAN'], '—')
    assert.ok(!calls[0].sql.includes('LIMIT'))
    assert.match(calls[0].sql, /ORDER BY k\.kar_pab_kode ASC/i)
    assert.ok(calls[0].params.includes('%Riri%'))
    assert.ok(calls[0].params.includes('BSI'))
    const download = { setHeader() {}, status() { return this }, send(buffer) { this.buffer = buffer } }
    // Controller is evaluated in a VM; ExcelJS expects host-realm array instances.
    await sendExcel(download, 'Pinjaman', Array.from(res.columns), Array.from(res.data))
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(download.buffer)
    const sheet = workbook.worksheets[0]
    assert.deepEqual(sheet.getRow(1).values.slice(1), headers)
    assert.equal(sheet.getCell('G2').value, '0001234')
    assert.equal(sheet.getCell('H2').value, 400000)
    assert.equal(sheet.getCell('J2').value, 100000)
    assert.equal(sheet.getCell('K2').value, 300000)
    assert.equal(sheet.columnCount, 11)
})
test('Pinjaman export supplies transaction dates and global budget independent of browse filters', async () => {
    const calls = []
    const handlers = controller(async (sql, params) => {
        assert.match(sql, /^SELECT/)
        calls.push({ sql, params })
        if (sql.includes('AS outstanding')) return [[{ outstanding: '11800000' }]]
        return [[{ Nomor: 'PJ.2610.0001', Tanggal: '2026-10-06', Nik: '000', Pinjam: 500000, Bayar: 250000, Cicilan: 2 }]]
    }, null)
    const response = {}
    await handlers.getPinjamanList({ query: { export: 'xlsx', search: '000', start_date: '2026-10-01', end_date: '2026-10-09', filterSet_Bank: ['BSI'] } }, response, next)
    assert.equal(response.options.sisaBudget, 18200000)
    assert.deepEqual(Array.from(response.options.dates), ['2026-10-06'])
    assert.equal(calls.length, 2)
    assert.match(calls[0].sql, /p\.tanggal BETWEEN \? AND \?/)
    assert.ok(calls[0].params.includes('BSI'))
    assert.match(calls[1].sql, /FROM tpinjaman WHERE pinjam - bayar > 0$/)
    assert.equal(calls[1].params, undefined)
})

test('Routes protect Pinjaman insert/edit/delete separately; updates never modify balance or document number', () => {
    const routes = readFileSync(new URL('../src/routes/transaksiRoutes.js', import.meta.url), 'utf8')
    const loanRoutes = routes.split('\n').filter(line => /r\.(get|post|put|patch|delete)\('\/pinjaman/.test(line) && !line.includes('/pelunasan'))
    assert.equal(loanRoutes.length, 10)
    assert.ok(loanRoutes.every(line => line.includes("wajibHak('frmPinjam'")))
    assert.ok(loanRoutes.some(line => line.includes("r.put('/pinjaman/:nomor', wajibHak('frmPinjam', 'edit')")))
    assert.ok(loanRoutes.some(line => line.includes("r.delete('/pinjaman/:nomor', wajibHak('frmPinjam', 'delete')")))
    const helper = readFileSync(new URL('../src/helpers/pinjaman.js', import.meta.url), 'utf8')
    assert.ok(!/\b(?:ALTER|CREATE)\s/i.test(helper))
    const updateSet = helper.match(/UPDATE tpinjaman SET([\s\S]*?)WHERE/)[1]
    assert.ok(!/(?:bayar|nomor_pinjam)\s*=/.test(updateSet))
})
