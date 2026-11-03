import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

/** GET /dashboard/daftar-departemen — filter dropdown analisis. */

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
        '\nglobalThis.handler = getDaftarDepartemen;',
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

test('Daftar departemen dipilih dengan kolom yang benar, terurut nama', async () => {
    const tampang = []
    const { panggil } = muat(async (sql) => {
        tampang.push(String(sql))
        return [[
            { Kode: 'PRD', Nama: 'PRODUKSI' },
            { Kode: 'QA', Nama: 'QUALITY' },
        ]]
    })
    const body = await panggil()
    assert.match(tampang[0], /tdepartemen/)
    assert.match(tampang[0], /dep_nama AS Nama/)
    assert.match(tampang[0], /ORDER BY dep_nama/)
    assert.equal(body.data[1].Nama, 'QUALITY')
})

test('Route /daftar-departemen terdaftar dengan hanyaHrSuper di dashboardRoutes', () => {
    const src = readFileSync(new URL('../src/routes/dashboardRoutes.js', import.meta.url), 'utf8')
    assert.match(src, /r\.get\('\/daftar-departemen', hanyaHrSuper, getDaftarDepartemen\)/)
})
