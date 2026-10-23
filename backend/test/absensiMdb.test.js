import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ExcelJS from 'exceljs'
import { mdbKeExcelPeriode, MDB_BATCH_SIZE } from '../src/helpers/absensiMdb.js'
import * as importer from '../src/helpers/absensiImport.js'

const periode = { start_date: '2026-12-31', end_date: '2027-01-01' }
const nik = '00123456789012345678'
function fakeReader(rows, columns = ['USERID', 'CHECKTIME', 'Unused', 'CHECKTYPE']) {
    return { getTableNames: () => ['Settings', 'CHECKINOUT'], getTable: name => {
        assert.equal(name, 'CHECKINOUT')
        return { getColumnNames: () => columns, getData: ({ columns: selected, rowOffset, rowLimit }) =>
            rows.slice(rowOffset, rowOffset + rowLimit).map(row => Object.fromEntries(selected.map(c => [c, row[c]]))) }
    } }
}
const convert = (rows, range = periode, columns) => mdbKeExcelPeriode(Buffer.alloc(0), range, { createReader: () => fakeReader(rows, columns) })

test('MDB besar: proyeksi kolom, batch 25.000, tanggal tidak terurut, dan jeda antar batch', async () => {
    const calls = [], count = 50003
    let yielded = false
    const createReader = () => ({ getTableNames: () => ['CHECKINOUT'], getTable: () => ({
        getColumnNames: () => ['USERID', 'CHECKTIME', 'CHECKTYPE', 'HugeUnusedData'],
        getData(options) {
            calls.push(options)
            assert.deepEqual(options.columns, ['USERID', 'CHECKTIME', 'CHECKTYPE'])
            assert.equal(options.rowLimit, MDB_BATCH_SIZE)
            if (!options.rowOffset) setImmediate(() => { yielded = true })
            else assert.equal(yielded, true)
            return Array.from({ length: Math.min(options.rowLimit, count - options.rowOffset) }, (_, j) => {
                const i = options.rowOffset + j
                return { USERID: nik, CHECKTIME: i === 1 || i === 50001 ? '2026-12-31 00:00:00' : i === 25000 ? new Date('2027-01-01T23:59:59Z') : '2030-01-01 10:00:00', CHECKTYPE: i === 25000 ? 'O' : 'I' }
            })
        },
    }) })
    const buffer = await mdbKeExcelPeriode(Buffer.alloc(0), periode, { createReader })
    assert.deepEqual(calls.map(c => c.rowOffset), [0, 25000, 50000])
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buffer)
    const sheet = wb.worksheets[0]
    assert.equal(sheet.rowCount, 4)
    assert.deepEqual(sheet.getRow(1).values.slice(1), ['NIK', 'Tanggal', 'Jam', 'Tipe'])
    assert.deepEqual(sheet.getRow(3).values.slice(1), [nik, '2027-01-01', '23:59:59', 'O'])
    for (let i = 1; i <= 3; i++) assert.equal(sheet.getRow(2).getCell(i).type, ExcelJS.ValueType.String)
    const parsed = await importer.bacaBerkasAbsensi(buffer, 'periode.xlsx')
    assert.equal(parsed.length, 3)
    assert.equal(parsed[0].values[0], nik)
    assert.deepEqual(parsed[0].values, parsed[2].values) // Scan duplikat dipertahankan.
})

test('MDB: periode invalid ditolak sebelum reader dibuka', async () => {
    for (const range of [undefined, {}, { ...periode, start_date: '' }, { ...periode, end_date: '2026-02-30' },
        { ...periode, start_date: '2027-01-02' }, { ...periode, start_date: '0000-01-01' }]) {
        let opened = false
        await assert.rejects(mdbKeExcelPeriode(Buffer.alloc(0), range, { createReader() { opened = true } }), /Tanggal/)
        assert.equal(opened, false)
    }
    await assert.rejects(importer.bacaBerkasAbsensi(Buffer.from('bukan MDB'), 'scan.mdb', {}), /Tanggal/)
})

test('MDB: batas tanggal, UTC, pergantian tahun, leap day, dan tanggal scan invalid', async () => {
    const dates = ['2026-12-30 23:59:59', new Date('2026-12-31T00:00:00Z'), '01/01/2027 23:59:59',
        '2027-01-02T00:00:00Z', '2026-02-30 10:00:00', new Date(NaN), null]
    const buffer = await convert(dates.map(CHECKTIME => ({ USERID: nik, CHECKTIME, CHECKTYPE: 'I' })))
    const parsed = await importer.bacaBerkasAbsensi(buffer, 'hasil.xlsx')
    assert.deepEqual(parsed.map(r => r.values[1]), ['2026-12-31', '2027-01-01'])
    const leap = await convert([{ USERID: nik, CHECKTIME: '29/02/2028 07:05:03', CHECKTYPE: 0 }], { start_date: '2028-02-29', end_date: '2028-02-29' })
    assert.deepEqual((await importer.bacaBerkasAbsensi(leap, 'hasil.xlsx'))[0].values, [nik, '2028-02-29', '07:05:03', 0])
    await assert.rejects(convert([{ USERID: nik, CHECKTIME: '2030-01-01' }]), /Tidak ada data MDB dalam rentang/)
    await assert.rejects(convert([]), /Tidak ada data MDB dalam rentang/)
})

test('MDB: mapping case-insensitive dan fallback posisi tetap tersedia', async () => {
    for (const columns of [['user id', 'datetime', 'ignored', 'type'], ['col1', 'col2', 'col3', 'col4']]) {
        const buffer = await convert([{ [columns[0]]: nik, [columns[1]]: '2026-12-31T07:00:00Z', [columns[3]]: 'O' }], periode, columns)
        assert.deepEqual((await importer.bacaBerkasAbsensi(buffer, 'hasil.xlsx'))[0].values, [nik, '2026-12-31', '07:00:00', 'O'])
    }
})

const controllerSource = readFileSync(new URL('../src/controllers/absensi/absensiController.js', import.meta.url), 'utf8')
function controllerFixture(rows) {
    const stored = new Map(), reads = []
    let writes = 0
    const scope = {
        ...importer,
        bacaBerkasAbsensi: async (buffer, filename, range) => {
            reads.push({ filename, range })
            return /\.mdb$/i.test(filename)
                ? importer.bacaBerkasAbsensi(await convert(rows, range), 'periode.xlsx')
                : importer.bacaBerkasAbsensi(buffer, filename)
        },
        pool: { query: async (sql, params) => {
            writes++
            const field = sql.includes('UPDATE scan2') ? 'scan2' : 'scan1'
            for (let i = 0; i < params.length; i += 3) {
                const [nik, date, time] = params.slice(i, i + 3), key = `${nik}|${date}`
                const record = stored.get(key) || { scan1: '00:00:00', scan2: '00:00:00' }
                if (time !== '00:00:00') record[field] = record[field] === '00:00:00' ? time
                    : field === 'scan1' ? [record[field], time].sort()[0] : [record[field], time].sort().at(-1)
                stored.set(key, record)
            }
            return [[]]
        } },
        success: (res, data) => { res.data = data },
        error: (res, message, status) => Object.assign(res, { message, status }),
    }
    vm.runInNewContext(controllerSource.replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '') + '\nglobalThis.runImport = importStaging;', scope)
    return { scope, stored, reads, writes: () => writes }
}

test('Controller: MDB lewat Excel setara CSV; upload ulang menjaga MIN/MAX dan tidak menyimpan data di luar periode', async () => {
    const scans = [['08:00:00', 'I'], ['07:00:00', 'I'], ['16:00:00', 'O'], ['17:00:00', 'O'], ['07:00:00', 'I']]
    const rows = scans.map(([time, CHECKTYPE]) => ({ USERID: nik, CHECKTIME: '2026-12-31 ' + time, CHECKTYPE }))
    const mdb = controllerFixture([...rows, { USERID: nik, CHECKTIME: '2030-01-01', CHECKTYPE: 'I' }])
    const csv = controllerFixture([])
    const csvText = 'NIK,Tanggal,Jam,Tipe\n' + scans.map(([time, type]) => `${nik},2026-12-31,${time},${type}`).join('\n')
    for (let i = 0; i < 2; i++) {
        const res = {}
        await mdb.scope.runImport({ body: periode, file: { originalname: 'scan.MDB', buffer: Buffer.alloc(0) } }, res, err => { throw err })
        assert.equal(res.data.jumlah, scans.length)
    }
    await csv.scope.runImport({ body: periode, file: { originalname: 'scan.csv', buffer: Buffer.from(csvText) } }, {}, err => { throw err })
    assert.equal(mdb.reads[0].range.start_date, periode.start_date)
    assert.equal(mdb.reads[0].range.end_date, periode.end_date)
    assert.deepEqual(mdb.stored, csv.stored)
    assert.deepEqual(mdb.stored.get(`${nik}|2026-12-31`), { scan1: '07:00:00', scan2: '17:00:00' })
})

test('Controller: periode invalid atau tidak ada hasil tidak menulis staging', async () => {
    for (const range of [{}, periode]) {
        const f = controllerFixture([]), res = {}
        await f.scope.runImport({ body: range, file: { originalname: 'scan.mdb', buffer: Buffer.alloc(0) } }, res, err => { throw err })
        assert.equal(res.status, 400)
        assert.equal(f.writes(), 0)
        assert.match(res.message, /Tanggal|Tidak ada data MDB dalam rentang/)
    }
})
