import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

/**
 * GET /dashboard/sp-terakhir — rekam jejak punishment modal WA analytics.
 * Mock pool per pola dashboardPeringatan.test.js (tanpa DB sungguhan).
 */

/** Muat getSpTerakhir dengan pool & response helper palsu, lalu kembalikan (req) → hasil. */
function muat(pool) {
    const state = {}
    const res = {
        status(code) { state.code = code; return res },
        json(body) { state.body = body },
    }
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
        '\nglobalThis.handler = getSpTerakhir;',
        scope
    )
    return {
        state,
        panggil: async (req) => {
            await scope.handler(req, res, (err) => { throw err })
            return state.body
        },
    }
}

test('Tanpa NIK ditolak 400', async () => {
    const { state, panggil } = muat(async () => [[]])
    const body = await panggil({ query: {} })
    assert.equal(body.success, false)
    assert.equal(state.code, 400)
})

test('Baris SP terbaru dipetakan ke label & tingkat (1 (Satu) → SP 1, tingkat 1)', async () => {
    const tampang = []
    const { panggil } = muat(async (sql, params) => {
        tampang.push({ sql: String(sql), params })
        return [[{
            sp_nomor: '003/HRD/GA-KP/SP/07/26',
            sp_ke: '1 (Satu)',
            sp_tanggal: '2026-07-27',
            sp_periode2: '2027-01-26',
        }]]
    })
    const body = await panggil({ query: { nik: '0110170494' } })
    assert.equal(tampang.length, 1)
    assert.match(tampang[0].sql, /FROM tsp WHERE sp_nik = \?/)
    assert.equal(JSON.stringify(tampang[0].params), JSON.stringify(['0110170494']))
    assert.match(tampang[0].sql, /ORDER BY sp_tanggal DESC/)
    assert.equal(body.success, true)
    assert.equal(body.data.ada, true)
    assert.equal(body.data.label, 'SP 1')
    assert.equal(body.data.tingkat, 1)
    assert.equal(body.data.tanggal, '2026-07-27')
    assert.equal(body.data.nomor, '003/HRD/GA-KP/SP/07/26')
})

test('Pembinaan → label Pembinaan, tingkat 0', async () => {
    const { panggil } = muat(async () => [[{ sp_nomor: '002/X', sp_ke: 'Pembinaan', sp_tanggal: '2026-05-01' }]])
    const body = await panggil({ query: { nik: '002' } })
    assert.equal(body.data.label, 'Pembinaan')
    assert.equal(body.data.tingkat, 0)
})

test('Riwayat kosong → ada=false, tingkat -1 (dropdown tidak dibatasi)', async () => {
    const { panggil } = muat(async () => [[]])
    const body = await panggil({ query: { nik: '999' } })
    assert.equal(body.data.ada, false)
    assert.equal(body.data.tingkat, -1)
})

test('sp_ke tak dikenal dipetakan aman (label apa adanya, tingkat 0)', async () => {
    const { panggil } = muat(async () => [[{ sp_nomor: '009/X', sp_ke: 'Aneh', sp_tanggal: '2026-01-01' }]])
    const body = await panggil({ query: { nik: '111' } })
    assert.equal(body.data.label, 'Aneh')
    assert.equal(body.data.tingkat, 0)
})

test('Route /sp-terakhir terdaftar dengan hanyaHrSuper di dashboardRoutes', () => {
    const src = readFileSync(new URL('../src/routes/dashboardRoutes.js', import.meta.url), 'utf8')
    assert.match(src, /r\.get\('\/sp-terakhir', hanyaHrSuper, getSpTerakhir\)/)
})
