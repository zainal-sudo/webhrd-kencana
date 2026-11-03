import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

/** GET /dashboard/daftar-pabrik — dropdown analisis prioritas master pabrik. */

function muat(pool) {
    const state = {}
    const res = { status(code) { state.code = code; return res }, json(body) { state.body = body } }
    const scope = {
        pool: { query: pool },
        success: (_res, data) => { state.body = { success: true, data } },
        error: (_res, message, code) => { state.code = code; state.body = { success: false, message } },
        res,
    }
    vm.createContext(scope)
    const source = readFileSync(new URL('../src/controllers/dashboard/analisisController.js', import.meta.url), 'utf8')
    vm.runInContext(
        source.replace(/^import .*\r?\n/gm, '').replace(/^export (const|async|function)/gm, '$1') +
        '\nglobalThis.handler = getDaftarPabrik;',
        scope
    )
    return {
        state,
        panggil: async () => {
            await scope.handler({ query: {} }, res, (err) => { throw err })
            return state.body
        },
    }
}

test('Hanya pabrik aktif, terurut, memuat kolom Kode/Nama/Induk', async () => {
    const tampang = []
    const { panggil } = muat(async (sql) => {
        tampang.push(String(sql))
        return [[
            { Kode: 'P01', Nama: 'PABRIK 1', Induk: 'P01' },
            { Kode: 'P012', Nama: 'PABRIK 1 (HO)', Induk: 'P01' },
        ]]
    })
    const body = await panggil()
    assert.match(tampang[0], /tpabrik/)
    assert.match(tampang[0], /pab_status = 1/)
    assert.match(tampang[0], /ORDER BY p?\.?pab_kode/)
    assert.match(tampang[0], /pab_pabrik AS Induk/)
    assert.equal(body.data[1].Induk, 'P01')
})

test('Route /daftar-pabrik terdaftar dengan hanyaHrSuper di dashboardRoutes', () => {
    const src = readFileSync(new URL('../src/routes/dashboardRoutes.js', import.meta.url), 'utf8')
    assert.match(src, /r\.get\('\/daftar-pabrik', hanyaHrSuper, getDaftarPabrik\)/)
})
