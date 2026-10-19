import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { DatabaseSync } from 'node:sqlite'
import ExcelJS from 'exceljs'
import { success, error, paginated } from '../src/helpers/response.js'
import { applyAllColumnFilters, buildOrderBy } from '../src/helpers/browse.js'
import { sendExcel } from '../src/helpers/excel.js'

const source = readFileSync(new URL('../src/controllers/master/karyawanController.js', import.meta.url), 'utf8')
const definitions = source.slice(0, source.indexOf('const SELECT_SQL'))
function fixture() {
    const db = new DatabaseSync(':memory:')
    db.function('OCTET_LENGTH', value => value == null ? null : Buffer.byteLength(String(value)))
    db.function('CURDATE', () => '2026-10-19')
    db.function('DATEDIFF', (a, b) => a == null || b == null ? null : (Date.parse(a) - Date.parse(b)) / 86400000)
    db.function('FLOOR', value => value == null ? null : Math.floor(value))
    db.function('IF', (condition, yes, no) => condition ? yes : no)
    const columns = [...new Set([...definitions.matchAll(/k\.(kar_[A-Za-z0-9_]+)/g)].map(match => match[1]).concat(['kar_jab_kode', 'kar_dep_kode']))]
    const numeric = new Set(['kar_jenkel', 'kar_status_BPJS', 'kar_status_aktif', 'kar_status_kerja'])
    db.exec(`CREATE TABLE tkaryawan (${columns.map(name => `${name} ${numeric.has(name) ? 'INTEGER' : 'TEXT'}`).join(',')});
        CREATE TABLE tjabatan (jab_kode TEXT, jab_nama TEXT);
        CREATE TABLE tdepartemen (dep_kode TEXT, dep_nama TEXT);
        CREATE TABLE tpabrik (pab_kode TEXT, pab_nama TEXT);
        CREATE TABLE tstatuskaryawan (sk_id INTEGER, sk_keterangan TEXT);`)
    const insert = db.prepare(`INSERT INTO tkaryawan (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`)
    const records = [
        ['001', 'ALFA', null, null, null],
        ['002', 'ALIA', '', '2026-10-01', '2026-10-18'],
        ['003', 'ALDI', ' ', '2026-10-01', '0000-00-00'],
        ['004', 'BUDI', 'null', null, null],
        ['005', 'CICI', '0', '2026-10-01', '2026-10-18'],
        ['006', 'DEDI', 'staff@example.com', '2026-10-01', null],
    ]
    for (const [nik, nama, email, masuk, keluar] of records) {
        const row = { kar_Nik: nik, kar_nama: nama, kar_email: email, kar_tgl_masuk: masuk, kar_tgl_keluar: keluar,
            kar_status_aktif: 1, kar_pab_kode: 'P01', kar_bagian: 'Admin' }
        insert.run(...columns.map(column => row[column] ?? null))
    }
    const calls = []
    const pool = { async query(sql, params = []) {
        calls.push({ sql, params: Array.from(params) })
        return [db.prepare(sql).all(...params).map(row => ({ ...row }))]
    } }
    const scope = { pool, success, error, paginated, applyAllColumnFilters, buildOrderBy,
        sendExcel: (res, title, columns, rows) => sendExcel(res, title, Array.from(columns), Array.from(rows, row => ({ ...row }))) }
    vm.createContext(scope)
    vm.runInContext(source.replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '') + '\nglobalThis.handler = getKaryawanList;', scope)
    async function run(query) {
        const res = { headers: {}, setHeader(key, value) { this.headers[key] = value }, status(code) { this.code = code; return this },
            json(body) { this.body = body; return this }, send(buffer) { this.buffer = buffer; return this } }
        await scope.handler({ query }, res, err => { throw err })
        assert.equal(res.code, 200)
        return res
    }
    return { run, calls, close: () => db.close() }
}

for (const [label, query, ids] of [
    ['string Blank excludes whitespace and literal values', { filterNull_Email: '1', filterEmpty_Email: '1' }, ['001', '002']],
    ['literal null', { filterSet_Email: ['null'] }, ['004']],
    ['string zero', { filterSet_Email: ['0'] }, ['005']],
    ['whitespace remains a selectable value', { filterSet_Email: [' '] }, ['003']],
    ['numeric Blank excludes zero despite an empty-string flag', { filterNull_MasaKerja: '1', filterEmpty_MasaKerja: '1' }, ['001', '004']],
    ['numeric zero remains selectable', { filterSet_MasaKerja: ['0'] }, ['002', '003', '005', '006']],
    ['date Blank excludes valid and zero dates despite an empty-string flag', { filterNull_TglKeluar: '1', filterEmpty_TglKeluar: '1' }, ['001', '004', '006']],
    ['Blank or literal null combined with another column', { filterNull_Email: '1', filterEmpty_Email: '1', filterSet_Email: ['null'], filterNull_TglKeluar: '1' }, ['001', '004']],
    ['Blank respects global search', { search: 'ALI', filterNull_Email: '1', filterEmpty_Email: '1' }, ['002']],
]) test(`Karyawan SQL results: ${label}`, async () => {
    const f = fixture()
    try {
        const result = await f.run(query)
        assert.deepEqual(Array.from(result.body.data, row => row.Nik), ids)
        if (query.filterEmpty_MasaKerja || query.filterEmpty_TglKeluar) {
            for (const call of f.calls) {
                assert.doesNotMatch(call.sql, /CAST\(|OCTET_LENGTH\(/)
                assert.ok(!call.params.includes(''))
            }
        }
    } finally { f.close() }
})

test('Distinct includes typed blanks, keeps whitespace distinct, and applies other filters but excludes its own', async () => {
    const f = fixture()
    try {
        const email = await f.run({ distinct: 'Email' })
        assert.deepEqual(Array.from(email.body.data), [null, '', ' ', '0', 'null', 'staff@example.com'])
        assert.match(f.calls.at(-1).sql, /OCTET_LENGTH\(k.kar_email\) AS value_length/)
        const date = await f.run({ distinct: 'TglKeluar', filterSet_TglKeluar: ['2026-10-18'], filterNull_Email: '1', filterEmpty_Email: '1' })
        assert.deepEqual(Array.from(date.body.data), [null, '2026-10-18'])
        assert.ok(!f.calls.at(-1).params.includes('2026-10-18'), 'Own-column filter is excluded')
        const age = await f.run({ distinct: 'MasaKerja', filterNull_Email: '1', filterEmpty_Email: '1' })
        assert.deepEqual(Array.from(age.body.data), [null, 0])
        const hiddenBlank = await f.run({ distinct: 'Email', search: 'CICI' })
        assert.deepEqual(Array.from(hiddenBlank.body.data), ['0'])
    } finally { f.close() }
})

test('Filtered count, paginated Browse and actual XLSX have identical identities, order and predicates', async () => {
    const f = fixture()
    try {
        const query = { filterNull_Email: '1', filterEmpty_Email: '1', filterSet_Email: ['null'], filterSet_Pabrik: ['P01'], sort_by: 'Nik', sort_dir: 'desc', per_page: '2' }
        const first = await f.run({ ...query, page: '1' })
        const firstQuery = f.calls.at(-1)
        const countQuery = f.calls.at(-2)
        const second = await f.run({ ...query, page: '2' })
        const ids = [...first.body.data, ...second.body.data].map(row => row.Nik)
        assert.deepEqual(ids, ['004', '002', '001'])
        assert.equal(first.body.pagination.total, ids.length)
        const xlsx = await f.run({ ...query, export: 'xlsx' })
        const exportQuery = f.calls.at(-1)
        assert.equal(exportQuery.sql.split(' LIMIT ')[0], firstQuery.sql.split(' LIMIT ')[0])
        assert.deepEqual(exportQuery.params, firstQuery.params.slice(0, -2))
        assert.deepEqual(countQuery.params, exportQuery.params)
        assert.match(exportQuery.sql, /LIMIT 50000$/)
        const workbook = new ExcelJS.Workbook()
        await workbook.xlsx.load(xlsx.buffer)
        const sheet = workbook.worksheets[0]
        const exportedIds = []
        for (let row = 2; row <= sheet.rowCount; row++) exportedIds.push(sheet.getRow(row).getCell(1).value)
        assert.deepEqual(exportedIds, ids)
        const reset = await f.run({})
        assert.equal(reset.body.pagination.total, 6)
    } finally { f.close() }
})
