import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { buildOrderBy, applyAllColumnFilters } from '../src/helpers/browse.js'

function fixture({ headers = [{ Nomor: 'SPL-A' }, { Nomor: 'SPL-B' }], fail = false } = {}) {
    const calls = []
    const scope = {
        pool: { query: async (sql, params) => {
            calls.push({ sql, params: Array.from(params) })
            if (sql.startsWith('SELECT COUNT')) return [[{ total: headers.length }]]
            if (sql.includes('FROM tlembur_dtl')) {
                if (fail) throw new Error('Detail unavailable')
                return [[{ Nomor: 'SPL-A', Nik: '001', Nama: 'Nama A', Mulai: '17:00:00', Akhir: '19:00:00', Keterangan: 'Catatan', Panggilan: 1 }]]
            }
            return [headers.map(row => ({ ...row }))]
        } },
        buildOrderBy, applyAllColumnFilters, toTime: value => value,
        paginated: (res, data, pagination) => Object.assign(res, { data, pagination }),
        success: (res, data) => { res.data = data },
        sendExcel: (res, title, columns, data) => { res.exported = data },
    }
    vm.createContext(scope)
    const source = readFileSync(new URL('../src/controllers/transaksi/lemburController.js', import.meta.url), 'utf8')
    vm.runInContext(source.replace(/^import .*\r?\n/gm, '').replace(/^export \{.*\}\r?\n/gm, '').replace(/^export /gm, '') + '\nglobalThis.run = getLemburList;', scope)
    return { calls, run: scope.run }
}

test('SPL details are grouped per displayed header in a single parameterized query', async () => {
    const { run, calls } = fixture()
    const res = {}
    await run({ query: { include_detail: '1', page: '2', per_page: '50', search: 'HRD' } }, res, err => { throw err })
    assert.equal(calls.length, 3)
    assert.deepEqual(calls[2].params, ['SPL-A', 'SPL-B'])
    assert.match(calls[2].sql, /IN \(\?, \?\)/)
    assert.deepEqual(calls[1].params.slice(-2), [50, 50])
    assert.equal(res.data[0].Detail[0].Nik, '001')
    assert.equal(res.data[0].Detail[0].Panggilan, 1)
    assert.equal(res.data[1].Detail.length, 0)
    assert.equal(res.pagination.total, 2)
})

test('Existing callers and empty pages make no detail query', async () => {
    for (const options of [{}, { headers: [] }]) {
        const { run, calls } = fixture(options)
        const res = {}
        await run({ query: options.headers ? { include_detail: '1' } : {} }, res, err => { throw err })
        assert.equal(calls.length, 2)
        assert.ok(res.data.every(row => !('Detail' in row)))
    }
})

test('Exports bypass detail loading and preserve their existing shape', async () => {
    const { run, calls } = fixture()
    const res = {}
    await run({ query: { include_detail: '1', export: 'xlsx' } }, res, err => { throw err })
    assert.equal(calls.length, 1)
    assert.ok(res.exported.every(row => !('Detail' in row)))
})

test('Failed preloading goes to the existing error handler instead of showing incomplete rows', async () => {
    const { run } = fixture({ fail: true })
    const res = {}
    let failure
    await run({ query: { include_detail: '1' } }, res, err => { failure = err })
    assert.equal(failure.message, 'Detail unavailable')
    assert.equal(res.data, undefined)
})
