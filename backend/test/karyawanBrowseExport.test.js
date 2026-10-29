import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ExcelJS from 'exceljs'
import { success, error, paginated } from '../src/helpers/response.js'
import { applyAllColumnFilters, buildOrderBy } from '../src/helpers/browse.js'
import { sendExcel } from '../src/helpers/excel.js'

const expected = 'Nik|Nama|Kode Absensi|Pabrik|Nama Pabrik|Sistem Gaji|Tgl Lahir|Jenis Kelamin|Tgl Masuk|Tgl Keluar|Size|Ibu Kandung|Email|Status BPJS|BPJS KES|BPJS TK|Masa Kerja|Jabatan|Bagian|Departemen|Status Karyawan|Status|Alamat|Telp|Identitas|RekeningBank|Pendidikan Terakhir|Jurusan|PKWT1|PKWT2'.split('|')
const frontend = readFileSync(new URL('../../frontend/src/views/master/KaryawanView.vue', import.meta.url), 'utf8')
const definitions = [...frontend.match(/const columns: BrowseColumn\[\] = \[([\s\S]*?)\n\];/)[1].matchAll(/key: "([^"]+)", label: "([^"]+)"/g)].map(match => ({ key: match[1], label: match[2] }))
const sample = Object.fromEntries(definitions.map(column => [column.key, `value:${column.key}`]))
Object.assign(sample, { Nik: '001251415', Kd_Abs: '0000123', Pabrik: 'P04', 'Nama Pabrik': 'Pabrik Empat',
    TglLahir: '1990-01-02', TglMasuk: '2020-02-03', TglKeluar: null, PKWT1: '2026-03-04', PKWT2: null,
    StatusBPJS: 'Jamkesmas', NoBPJS: '0009876543210', NoNaker: '0001234567890', Telp: '081234567890',
    Identitas: '0012345678901234', RekeningBank: '0001234567890123456789', MasaKerja: 6 })

function fixture() {
    const calls = []
    const pool = { async query(sql, params = []) {
        calls.push({ sql, params: [...params] })
        if (sql.includes('COUNT(*)')) return [[{ total: 52 }]]
        if (sql.startsWith('SELECT DISTINCT')) return [[{ value: 'test' }]]
        return [[{ ...sample }]]
    } }
    // ExcelJS uses instanceof Array: bridge VM arrays to this realm for workbook writing.
    const scope = { pool, success, error, paginated, applyAllColumnFilters, buildOrderBy,
        // ExcelJS checks Array.isArray across realms; opts juga harus diteruskan
        // (requestedColumns dipakai uji kolom export UI).
        sendExcel: (res, title, columns, rows, opts) => sendExcel(res, title, Array.from(columns),
            Array.from(rows, row => ({ ...row })), opts ? { ...opts } : undefined) }
    vm.createContext(scope)
    const source = readFileSync(new URL('../src/controllers/master/karyawanController.js', import.meta.url), 'utf8')
    vm.runInContext(source.replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '') + '\nglobalThis.handler = getKaryawanList;', scope)
    async function run(query) {
        const res = { headers: {}, setHeader(key, value) { this.headers[key] = value }, status(code) { this.code = code; return this },
            json(body) { this.body = body; return this }, send(buffer) { this.buffer = buffer; return this } }
        await scope.handler({ query }, res, err => { throw err })
        assert.equal(res.code, 200)
        return res
    }
    return { calls, run }
}

test('Actual XLSX has 30 matching headers, correct field values, date formatting and text identifiers; no No', async () => {
    assert.deepEqual(definitions.map(column => column.label), expected)
    const f = fixture(), res = await f.run({ export: 'xlsx' })
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(res.buffer)
    const sheet = workbook.worksheets[0]
    assert.equal(sheet.columnCount, 30)
    assert.equal(sheet.rowCount, 2)
    assert.deepEqual(sheet.getRow(1).values.slice(1), expected)
    const value = label => sheet.getRow(2).getCell(expected.indexOf(label) + 1).value
    for (const column of definitions) {
        if (['TglLahir', 'TglMasuk', 'TglKeluar', 'PKWT1', 'PKWT2'].includes(column.key)) continue
        assert.equal(value(column.label), sample[column.key])
    }
    assert.equal(value('Tgl Lahir'), '02/01/1990')
    assert.equal(value('Tgl Masuk'), '03/02/2020')
    assert.equal(value('PKWT1'), '04/03/2026')
    assert.ok(value('Tgl Keluar') == null || value('Tgl Keluar') === '')
    assert.ok(value('PKWT2') == null || value('PKWT2') === '')
    for (const label of ['Nik', 'Kode Absensi', 'BPJS KES', 'BPJS TK', 'Identitas', 'RekeningBank', 'Telp']) assert.equal(typeof value(label), 'string')
    assert.ok(!sheet.getRow(1).values.includes('No'))
})

test('List JSON keys stay compatible; export preserves search, filters and sorting without pagination', async () => {
    const f = fixture()
    const query = { search: 'PUJI', filterSet_StatusBPJS: ['Jamkesmas'], filterSet_NoNaker: ['0001234567890'], sort_by: 'Kd_Abs', sort_dir: 'desc', page: '2', per_page: '25' }
    const list = await f.run(query)
    const browseCall = f.calls.at(-1)
    assert.equal(list.body.data[0].Kd_Abs, '0000123')
    assert.equal(list.body.data[0].NoBPJS, '0009876543210')
    assert.equal(Object.hasOwn(list.body.data[0], 'Kode Absensi'), false)
    assert.deepEqual(browseCall.params.slice(-2), [25, 25])
    await f.run({ ...query, export: 'xlsx' })
    const exportCall = f.calls.at(-1)
    assert.equal(exportCall.sql.split(' LIMIT ')[0], browseCall.sql.split(' LIMIT ')[0])
    assert.deepEqual(exportCall.params, browseCall.params.slice(0, -2))
    assert.match(exportCall.sql, /ORDER BY k.kar_kode_absensi desc LIMIT 50000$/)
    assert.ok(exportCall.params.includes('Jamkesmas'))
    assert.ok(exportCall.params.includes('0001234567890'))
})

test('Export UI (param columns alias) tetap 30 kolom, urut sesuai tampilan browse', async () => {
    const f = fixture()
    // Persis seperti BaseBrowse mengirim: columns= orderedCols key alias.
    const uiColumns = definitions.map((column) => column.key).join(',')
    const res = await f.run({ export: 'xlsx', columns: uiColumns })
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(res.buffer)
    const sheet = workbook.worksheets[0]
    assert.equal(sheet.columnCount, 30, 'semua 30 kolom harus terbawa')
    assert.deepEqual(sheet.getRow(1).values.slice(1), expected, 'header sesuai urutan browse')
    // Setiap kolom terisi nilainya (kecuali sample-nya memang null di sumber)
    for (const column of definitions) {
        if (sample[column.key] == null) continue
        const label = expected[definitions.findIndex((d) => d.key === column.key)]
        const value = sheet.getRow(2).getCell(label == null ? 1 : expected.indexOf(label) + 1).value
        assert.ok(value !== undefined && String(value) !== '', `kolom ${label} terisi`)
    }
    // Alias saja tanpa label: tidak ada yang terbuang (mis. 'Sistem').
    const res2 = await f.run({ export: 'xlsx', columns: 'Sistem,TglLahir,TglMasuk' })
    const book2 = new ExcelJS.Workbook()
    await book2.xlsx.load(res2.buffer)
    const head2 = book2.worksheets[0].getRow(1).values.slice(1).map(String)
    assert.deepEqual(head2, ['Sistem Gaji', 'Tgl Lahir', 'Tgl Masuk'])
})

test('All 30 original keys remain available to the column choice and sorting endpoints', async () => {
    const f = fixture()
    for (const { key } of definitions) {
        const res = await f.run({ distinct: key })
        assert.deepEqual(Array.from(res.body.data), ['test'])
        assert.match(f.calls.at(-1).sql, /^SELECT DISTINCT /)
        await f.run({ sort_by: key, sort_dir: 'asc' })
        assert.match(f.calls.at(-1).sql, /ORDER BY [\s\S]+ asc LIMIT \? OFFSET \?$/)
    }
})
