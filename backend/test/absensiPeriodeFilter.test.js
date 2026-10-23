import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { DatabaseSync } from 'node:sqlite'
import { buildOrderBy, applyAllColumnFilters } from '../src/helpers/browse.js'

const source = readFileSync(new URL('../src/controllers/laporan/laporanController.js', import.meta.url), 'utf8')
const period = { start_date: '2026-10-01', end_date: '2026-10-02' }

async function request(query) {
    const db = new DatabaseSync(':memory:')
    db.function('OCTET_LENGTH', value => value == null ? null : Buffer.byteLength(String(value)))
    db.exec(`CREATE TABLE fixture (Nik TEXT, Nama TEXT, Bagian TEXT, Status TEXT, Jabatan TEXT, Pabrik TEXT);
        INSERT INTO fixture VALUES
        ('001', 'ANI', 'CETAK', 'Bulanan', 'STAF', 'P01'),
        ('002', 'BUDI', 'CETAK', 'Harian', 'OPERATOR', 'P02'),
        ('003', 'CICI', 'JAHIT', 'Borongan', 'OPERATOR', 'P02')`)
    const calls = []
    const scope = {
        buildOrderBy, applyAllColumnFilters,
        pool: { async query(sql, params = []) {
            calls.push({ sql, params: Array.from(params) })
            // Execute the actual outer query; the attendance calendar is unrelated
            // to this filter regression and is replaced by an isolated SQL fixture.
            const start = sql.indexOf('FROM (')
            const end = sql.lastIndexOf(') t ')
            assert.ok(start >= 0 && end > start)
            const outer = sql.slice(0, start) + 'FROM fixture t ' + sql.slice(end + 4)
            return [db.prepare(outer).all(...params)]
        } },
        success: (res, data) => { res.data = data },
        paginated: (res, data, pagination) => { Object.assign(res, { data, pagination }) },
        sendExcel: (res, name, columns, data) => { Object.assign(res, { name, columns, data }) },
    }
    vm.createContext(scope)
    vm.runInContext(source.replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '') + '\nglobalThis.run = getAbsensiPeriodeList;', scope)
    const res = {}
    try {
        await scope.run({ query: { ...period, ...query } }, res, err => { throw err })
        return { res, calls }
    } finally { db.close() }
}

for (const [label, query, expected] of [
    ['tanpa filter', {}, ['001', '002', '003']],
    ['checklist Sistem tanpa search', { filterSet_Status: ['Bulanan', 'Harian'] }, ['001', '002']],
    ['filter teks tanpa search', { filter_Bagian: 'CETAK' }, ['001', '002']],
    ['gabungan search dan filter', { search: 'BUDI', filterSet_Status: ['Harian'] }, ['002']],
    ['beberapa kolom', { filterSet_Status: ['Harian'], filterSet_Pabrik: ['P02'] }, ['002']],
    ['nilai kosong NULL', { filterNull_Status: '1' }, []],
    ['nilai kosong string', { filterEmpty_Status: '1' }, []],
]) test(`Absensi Periode: ${label}`, async () => {
    const { res, calls } = await request(query)
    assert.deepEqual(res.data.map(row => row.Nik), expected)
    assert.equal(res.pagination.total, expected.length)
    assert.equal(calls.length, 2)
    for (const { sql } of calls) assert.match(sql, /\) t\s+WHERE 1=1/)
})

test('Pilihan filter mengabaikan kolom sendiri dan mempertahankan kolom lain tanpa search', async () => {
    const { res, calls } = await request({ distinct: 'Status', filterSet_Status: ['Bulanan'], filterSet_Pabrik: ['P02'] })
    assert.deepEqual(Array.from(res.data), ['Borongan', 'Harian'])
    assert.doesNotMatch(calls[0].sql, /t\.`Status` IN/)
    assert.match(calls[0].sql, /t\.`Pabrik` IN \(\?\)/)
})

test('Export Excel memakai filter yang sama tanpa search', async () => {
    const { res } = await request({ export: 'xlsx', filterSet_Status: ['Bulanan', 'Harian'] })
    assert.equal(res.name, 'Absensi-Periode')
    assert.deepEqual(res.data.map(row => row.Nik), ['001', '002'])
})
