import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

/**
 * POST /dashboard/sp-rekam — rekam jejak punishment batch (label rekomendasi
 * kartu analisis HR). Mock pool per pola dashboardSpTerakhir.test.js.
 */

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
        '\nglobalThis.handler = getSpRekam;',
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
    await panggil({ body: {} })
    assert.equal(state.body.success, false)
    assert.equal(state.code, 400)
})

test('Query batch memakai IN(?) urut ASC; NIK didedup & dibersihkan', async () => {
    const tampang = []
    const { panggil } = muat(async (sql, params) => { tampang.push({ sql: String(sql), params }); return [[]] })
    await panggil({ body: { niks: [' 011 ', '', '011', '012'] } })
    assert.equal(tampang.length, 1)
    assert.match(tampang[0].sql, /WHERE sp_nik IN \(\?\)/)
    assert.match(tampang[0].sql, /ORDER BY sp_tanggal ASC/)
    assert.equal(JSON.stringify(tampang[0].params), JSON.stringify([['011', '012']]))
})

test('Baris terbaru per NIK menang (masuk ASC ditimpa berulang) & dinyalakan peta label/tingkat', async () => {
    const { panggil } = muat(async () => [
        [
            { sp_nik: '011', sp_ke: 'Pembinaan', sp_tanggal: '2026-01-05', sp_nomor: '001/X' },
            { sp_nik: '011', sp_ke: '1 (Satu)', sp_tanggal: '2026-07-27', sp_nomor: '003/X' },
            { sp_nik: '012', sp_ke: '3 (Tiga)', sp_tanggal: '2025-11-02', sp_nomor: '004/X' },
        ],
    ])
    const body = await panggil({ body: { niks: ['011', '012'] } })
    assert.equal(body.success, true)
    assert.equal(body.data['011'].label, 'SP 1')
    assert.equal(body.data['011'].tingkat, 1)
    assert.equal(body.data['011'].tanggal, '2026-07-27')
    assert.equal(body.data['012'].label, 'SP 3')
    assert.equal(body.data['012'].tingkat, 3)
})

test('NIK tanpa riwayat tidak dikembalikan pada peta', async () => {
    const { panggil } = muat(async () => [[{ sp_nik: '011', sp_ke: 'Pembinaan', sp_tanggal: '2026-01-05', sp_nomor: '001/X' }]])
    const body = await panggil({ body: { niks: ['011', '999'] } })
    assert.ok(body.data['011'])
    assert.ok(!('999' in body.data))
})

test('Nol baris sama sekali → peta kosong (semua kartu pakai teks periode)', async () => {
    const { panggil } = muat(async () => [[]])
    const body = await panggil({ body: { niks: ['011'] } })
    assert.equal(body.success, true)
    assert.deepEqual(Object.keys(body.data || {}), [])
})

test('Route POST /sp-rekam terdaftar dengan hanyaHrSuper di dashboardRoutes', () => {
    const src = readFileSync(new URL('../src/routes/dashboardRoutes.js', import.meta.url), 'utf8')
    assert.match(src, /r\.post\('\/sp-rekam', hanyaHrSuper, getSpRekam\)/)
})
