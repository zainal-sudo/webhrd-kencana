import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { PKWT_HABIS_WHERE, PKWT_HABIS_SELECT, EKSEKUSI_SELECT, EKSEKUSI_MONITORING_SELECT, PKWT_HABIS_ORDER } from '../src/helpers/pkwtEksekusi.js'

// VM harness sama seperti dashboardPeringatan.test.js — konstanta helper
// di-import controller, sehingga disuntikkan manual ke scope VM.
function runController(query, params = {}) {
    const scope = {
        pool: { query },
        success: (res, data) => { res.status(200).json({ success: true, data }) },
        PKWT_HABIS_SELECT, EKSEKUSI_SELECT, EKSEKUSI_MONITORING_SELECT, PKWT_HABIS_ORDER,
    }
    scope.res = { status: () => scope.res, json: (body) => { scope.res.body = body } }
    vm.createContext(scope)
    const source = readFileSync(new URL('../src/controllers/dashboardController.js', import.meta.url), 'utf8')
    vm.runInContext(source.replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '') + '\nglobalThis.handler = getEksekusiPkwt;', scope)
    return async () => {
        await scope.handler({ query: params }, scope.res, (err) => { throw err })
        return scope.res.body
    }
}

test('Halaman Eksekusi memakai sumber tunggal card + identitas penuh + sisa hari', async () => {
    const calls = []
    const run = async (sql) => { calls.push(sql); return [[{ Nik: 'K001', Nama: 'Budi', Sisa_Hari: 3 }]] }
    const body = await runController(run)()
    assert.equal(body.success, true)
    assert.deepEqual(body.data[0], { Nik: 'K001', Nama: 'Budi', Sisa_Hari: 3 })
    const sql = calls[0]
    // Rule card dipertahankan persis — satu-satunya definisi "< 2 bulan".
    assert.match(sql, /kar_tglpkwt2 < DATE_ADD\(CURDATE\(\), INTERVAL 2 MONTH\)/)
    assert.match(sql, /kar_status_kerja IN \(2, 3, 4, 5, 6\)/)
    assert.match(sql, /kar_status_aktif = 1/)
    // Daftar penuh untuk halaman Eksekusi, tanpa batas 200 baris card.
    assert.match(sql, /LIMIT 50000/)
    assert.doesNotMatch(sql, /LIMIT 200/)
    // Identitas penuh tanpa potongan LEFT, plus sisa hari dari DB.
    assert.match(sql, /k\.kar_nama AS Nama/)
    assert.doesNotMatch(sql, /LEFT\(/)
    assert.match(sql, /DATEDIFF\(k\.kar_tglpkwt2, CURDATE\(\)\) AS Sisa_Hari/)
    // Urutan paling dekat dulu, NIK sebagai pembeda tanggal sama.
    assert.match(sql, /ORDER BY kar_tglpkwt2 ASC, kar_Nik ASC/)
    // Hanya membaca data.
    assert.doesNotMatch(sql, /INSERT|UPDATE|DELETE/i)
})

test('Rule Eksekusi identik dengan query card Dashboard', () => {
    assert.ok(EKSEKUSI_SELECT.includes(PKWT_HABIS_WHERE), 'Eksekusi memakai WHERE yang sama persis dengan card')
    assert.ok(PKWT_HABIS_SELECT.includes(PKWT_HABIS_WHERE), 'Card juga memakai WHERE sumber tunggal')
})

test('Cakupan semua memuat PKWT aktif di atas 60 hari tanpa mengubah default Dashboard', async () => {
    const calls = []
    const run = async (sql) => { calls.push(sql); return [[{ Nik: 'K002', Sisa_Hari: 120 }]] }
    const body = await runController(run, { cakupan: 'semua' })()
    assert.equal(body.data[0].Sisa_Hari, 120)
    assert.match(calls[0], /kar_status_kerja IN \(2, 3, 4, 5, 6\)/)
    assert.match(calls[0], /kar_status_aktif = 1/)
    assert.match(calls[0], /kar_tglpkwt2 IS NOT NULL/)
    assert.doesNotMatch(calls[0], /INTERVAL 2 MONTH/)
    assert.doesNotMatch(calls[0], /INSERT|UPDATE|DELETE/i)
    await runController(run, { cakupan: 'tidak-valid' })()
    assert.ok(calls[1].includes(PKWT_HABIS_WHERE))
    assert.ok(PKWT_HABIS_SELECT.includes(PKWT_HABIS_WHERE))
})
