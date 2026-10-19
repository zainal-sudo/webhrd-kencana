import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { buildOrderBy, applyAllColumnFilters } from '../src/helpers/browse.js'

// Mock database; never import connection config or write HRD data.
function handler(query) {
    const scope = {
        pool: { query }, buildOrderBy, applyAllColumnFilters,
        success: (res, data) => { res.data = data },
        paginated: (res, data, pagination) => { Object.assign(res, { data, pagination }) },
        sendExcel: (res, title, columns, data) => { Object.assign(res, { title, columns, data }) },
    }
    vm.createContext(scope)
    const source = readFileSync(new URL('../src/controllers/absensi/absensiController.js', import.meta.url), 'utf8')
    vm.runInContext(source.replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '') + '\nglobalThis.handler = getAbsensiList;', scope)
    return scope.handler
}
const next = err => { throw err }
const period = { start_date: '2026-10-01', end_date: '2026-10-12' }

test('Distinct Absensi retains NULL, blank, time zero and numeric zero within active scope', async () => {
    for (const distinct of ['Masuk', 'Scan1', 'Keluar', 'Scan2', 'Bagian', 'Status']) {
        const values = distinct === 'Status' ? [null, 0, 1] : [null, '', '00:00:00', '08:00:00']
        const run = handler(async (sql, params) => {
            assert.match(sql, /^SELECT DISTINCT/)
            assert.match(sql, /OCTET_LENGTH\(.+\) AS value_length/)
            // Satu-satunya pengecualian NULL/kosong yang dibolehkan adalah
            // penjaga kode absensi (karyawan tanpa kode tidak ditampilkan).
            const tanpaPenjagaKode = sql.replace(/k\.kar_kode_absensi IS NOT NULL AND k\.kar_kode_absensi <> ''/g, '')
            assert.doesNotMatch(tanpaPenjagaKode, /IS NOT NULL|<> ''/)
            assert.match(sql, /k\.kar_kode_absensi IS NOT NULL AND k\.kar_kode_absensi <> ''/)
            assert.match(sql, /a.tanggal BETWEEN \? AND \?/)
            assert.match(sql, /k.kar_pab_kode = \?/)
            assert.deepEqual(Array.from(params), [...Object.values(period), 'P01'])
            return [values.map(value => ({ value }))]
        })
        const res = {}
        await run({ query: { ...period, distinct, pabrik: 'P01', [`filterNull_${distinct}`]: '1' } }, res, next)
        assert.deepEqual(Array.from(res.data), values)
    }
})

test('Time zero is a real IN value; NULL is IS NULL, no coercion to empty', async () => {
    const calls = []
    const run = handler(async (sql, params) => {
        calls.push({ sql, params: Array.from(params) })
        return sql.startsWith('SELECT COUNT') ? [[{ total: 1 }]] : [[]]
    })
    await run({ query: { ...period, filterSet_Scan1: ['00:00:00'], filterNull_Scan1: '1' } }, {}, next)
    assert.match(calls[0].sql, /\(a.scan1 IN \(\?\) OR a.scan1 IS NULL\)/)
    assert.deepEqual(calls[0].params, [...Object.values(period), '00:00:00'])
})

test('Empty time/numeric filters use byte length so zero cannot be selected as blank', async () => {
    const run = handler(async (sql, params) => {
        assert.match(sql, /OCTET_LENGTH\(CAST\(a.scan1 AS CHAR\)\) = 0/)
        assert.match(sql, /OCTET_LENGTH\(CAST\(a.status AS CHAR\)\) = 0/)
        assert.deepEqual(Array.from(params).slice(0, 2), Object.values(period))
        assert.ok(!Array.from(params).includes(''))
        return sql.startsWith('SELECT COUNT') ? [[{ total: 0 }]] : [[]]
    })
    await run({ query: { ...period, filterEmpty_Scan1: '1', filterEmpty_Status: '1' } }, {}, next)
})

test('Distinct excludes own selections but keeps other-column NULL/blank filters', async () => {
    const run = handler(async (sql, params) => {
        assert.doesNotMatch(sql, /a.scan1 IN|a.scan1 IS NULL/)
        assert.match(sql, /a.scan2 IS NULL/)
        assert.match(sql, /OCTET_LENGTH\(CAST\(TRIM\(CONCAT_WS\(' ', j.jab_nama, k.kar_bagian\)\) AS CHAR\)\) = 0/)
        assert.deepEqual(Array.from(params), Object.values(period))
        return [[{ value: null }, { value: '00:00:00' }]]
    })
    await run({ query: { ...period, distinct: 'Scan1', filterSet_Scan1: ['08:00:00'], filterNull_Scan1: '1', filterNull_Scan2: '1', filterEmpty_Bagian: '1' } }, {}, next)
})

test('Browse and export share mixed NULL/blank/time-zero selections', async () => {
    const calls = []
    const run = handler(async (sql, params) => {
        calls.push({ sql, params: Array.from(params) })
        return sql.startsWith('SELECT COUNT') ? [[{ total: 1 }]] : [[]]
    })
    const query = { ...period, filterSet_Scan1: ['00:00:00'], filterNull_Scan1: '1', filterEmpty_Scan1: '1', sort_by: 'Scan1', sort_dir: 'asc' }
    await run({ query }, {}, next)
    const browse = calls.at(-1)
    await run({ query: { ...query, export: 'xlsx' } }, {}, next)
    const excel = calls.at(-1)
    assert.equal(browse.sql.replace(/ LIMIT \? OFFSET \?$/, ''), excel.sql.replace(/ LIMIT 50000$/, ''))
    assert.deepEqual(browse.params.slice(0, -2), excel.params)
    assert.match(excel.sql, /\(CAST\(a.scan1 AS CHAR\) IN \(\?\) OR CAST\(a.scan1 AS CHAR\) IS NULL OR OCTET_LENGTH\(CAST\(a.scan1 AS CHAR\)\) = 0\)/)
})
