import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const source = readFileSync(new URL('../src/controllers/absensi/absensiController.js', import.meta.url), 'utf8')
function fixture(hari) {
    const calls = []
    const scope = {
        pool: { query: async (sql, params) => { calls.push({ sql, params: Array.from(params) }); return [[{ hari }]] } },
        success: (res, data) => { res.data = data },
        error: (res, message, status) => { Object.assign(res, { message, status }) },
    }
    vm.createContext(scope)
    vm.runInContext(source.replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '') + '\nglobalThis.check = cekOtorisasiAbsensi;', scope)
    return { ...scope, calls }
}

test('Absensi authorization excludes distinct tharilibur dates from elapsed-day interval', async () => {
    const f = fixture(1), res = {}
    await f.check({ query: { tanggal: '2026-10-10' } }, res, err => { throw err })
    assert.equal(res.data.hari, 1)
    assert.equal(res.data.perluOtorisasi, false)
    assert.match(f.calls[0].sql, /GREATEST\(0, DATEDIFF\(CURDATE\(\), \?\)/)
    assert.match(f.calls[0].sql, /COUNT\(DISTINCT hl_tanggal\) FROM tharilibur/)
    assert.match(f.calls[0].sql, /hl_tanggal > \? AND hl_tanggal <= CURDATE\(\)/)
    assert.deepEqual(f.calls[0].params, ['2026-10-10', '2026-10-10'])
    assert.match(source, /if \(\(await usiaOtorisasiAbsensi\(tanggal\)\) >= 2\)/)
})

test('Absensi threshold remains >= 2 and invalid dates do not query DB', async () => {
    for (const hari of [0, 1, 2, 3]) {
        const f = fixture(hari), res = {}
        await f.check({ query: { tanggal: '2026-10-10' } }, res, err => { throw err })
        assert.equal(res.data.perluOtorisasi, hari >= 2)
    }
    for (const tanggal of ['', '2026-02-30', 'abc']) {
        const f = fixture(0), res = {}
        await f.check({ query: { tanggal } }, res, err => { throw err })
        assert.equal(res.status, 400)
        assert.equal(f.calls.length, 0)
    }
})
