import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { PKWT_HABIS_SELECT, EKSEKUSI_SELECT, PKWT_HABIS_ORDER } from '../src/helpers/pkwtEksekusi.js'

// Mock saja, tidak memuat config/database atau menjalankan query ke DB.
function handler(query) {
    const scope = {
        pool: { query },
        success: (res, data) => { res.status(200).json({ success: true, data }) },
        // Konstanta sumber tunggal PKWT (helper di-import controller, VM tidak).
        PKWT_HABIS_SELECT, EKSEKUSI_SELECT, PKWT_HABIS_ORDER,
    }
    scope.res = { status: () => scope.res, json: (body) => { scope.res.body = body } }
    vm.createContext(scope)
    const source = readFileSync(new URL('../src/controllers/dashboardController.js', import.meta.url), 'utf8')
    vm.runInContext(source.replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '') + '\nglobalThis.handler = getPeringatan;', scope)
    return (req) => scope.handler(req, scope.res, (err) => { throw err }).then(() => scope.res.body)
}

function mockQuery(routes) {
    const calls = []
    const run = async (sql) => {
        calls.push(sql)
        for (const [match, rows] of routes) {
            if (sql.includes(match)) return [rows]
        }
        return [[]]
    }
    return { calls, run }
}

function exportHandler(query) {
    const sent = {}
    const scope = {
        pool: { query },
        success: (res, data) => { res.status(200).json({ success: true, data }) },
        error: (res, message, status) => { res.status(status || 500).json({ success: false, message }) },
        sendExcel: (res, title, columns, rows) => { Object.assign(sent, { title, columns, rows }) },
        // Konstanta sumber tunggal PKWT (helper di-import controller, VM tidak).
        PKWT_HABIS_SELECT, EKSEKUSI_SELECT, PKWT_HABIS_ORDER,
    }
    scope.res = { status: () => scope.res, json: (body) => { scope.res.body = body } }
    vm.createContext(scope)
    const source = readFileSync(new URL('../src/controllers/dashboardController.js', import.meta.url), 'utf8')
    vm.runInContext(source.replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '') + '\nglobalThis.handler = getPeringatan;', scope)
    return {
        sent,
        run: (req) => scope.handler(req, scope.res, (err) => { throw err }).then(() => scope.res.body),
    }
}

test('Empat daftar popup login Delphi dikembalikan sekaligus dengan total', async () => {
    const { calls, run } = mockQuery([
        ['COUNT(*) AS c', [{ c: 7 }]],
        ['SELECT tanggal FROM', [{ tanggal: '2026-10-08' }, { tanggal: '2026-10-09' }]],
        ['kar_status_BPJS = 0', [{ Nik: 'K001', Nama: 'Budi' }]],
        ['HAVING COUNT(*) > 1', [{ Nik: 'K002', Nama: 'Ani' }]],
        ['kar_status_aktif = 0 AND kar_status_BPJS = 1', [{ Nik: 'K003', Nama: 'Cici' }]],
        ['INTERVAL 2 MONTH', [{ Nik: 'K004', Nama: 'Dedi' }]],
    ])
    const body = await handler(run)({ query: {} })
    assert.equal(body.success, true)
    for (const key of ['bpjs_belum', 'mangkir_2hari', 'nonaktif_bpjs', 'pkwt_habis']) {
        assert.ok(body.data[key], `bagian ${key} ada`)
        assert.equal(typeof body.data[key].total, 'number')
        assert.ok(Array.isArray(body.data[key].rows))
    }
    assert.deepEqual(body.data.mangkir_2hari.tanggal, ['2026-10-08', '2026-10-09'])
})

test('SQL setia pada query popup UfrmLogin Delphi', async () => {
    const { calls, run } = mockQuery([['COUNT(*) AS c', [{ c: 0 }]]])
    await handler(run)({ query: {} })
    const all = calls.join('\n')
    // 1. Belum setting BPJS: aktif, > 30 hari, BPJS 0.
    assert.match(all, /kar_status_aktif = 1 AND kar_status_BPJS = 0/)
    assert.match(all, /DATE_ADD\(CURDATE\(\), INTERVAL -30 DAY\) > kar_tgl_masuk/)
    // 2. Mangkir: status 0 pada 3 hari kerja terakhir di luar hari libur,
    //    belum keluar, tanpa ijin pada tanggal itu.
    assert.match(all, /ORDER BY tanggal DESC LIMIT 3/)
    assert.match(all, /NOT IN \(SELECT hl_tanggal FROM tharilibur\)/)
    assert.match(all, /kar_tgl_keluar IS NULL/)
    assert.match(all, /HAVING COUNT\(\*\) > 1/)
    assert.match(all, /NOT IN \(\s*SELECT DISTINCT ij_nik FROM tijin/)
    // 3. Tidak aktif tapi BPJS masih perusahaan.
    assert.match(all, /kar_status_aktif = 0 AND kar_status_BPJS = 1/)
    // 4. PKWT habis < 2 bulan, status kerja kontrak, aktif.
    assert.match(all, /kar_tglpkwt2 < DATE_ADD\(CURDATE\(\), INTERVAL 2 MONTH\)/)
    assert.match(all, /kar_status_kerja IN \(2, 3, 4, 5, 6\)/)
    // Daftar dibatasi agar dashboard tetap ringan.
    assert.match(all, /LIMIT 200/)
})

test('Route dashboard terdaftar di /dashboard/peringatan', async () => {
    const routes = readFileSync(new URL('../src/routes.js', import.meta.url), 'utf8')
    assert.match(routes, /dashboardRoutes/)
    assert.match(routes, /'\/dashboard'/)
    const dash = readFileSync(new URL('../src/routes/dashboardRoutes.js', import.meta.url), 'utf8')
    assert.match(dash, /\/peringatan/)
    const view = readFileSync(new URL('../../frontend/src/views/dashboard/DashboardView.vue', import.meta.url), 'utf8')
    assert.match(view, /\/dashboard\/peringatan/)
    for (const title of ['Belum Setting BPJS', 'Tidak Masuk 2 Hari', 'Tidak Aktif, BPJS Masih Perusahaan', 'Masa PKWT Akan Habis']) {
        assert.ok(view.includes(title), `panel "${title}" ada di dashboard`)
    }
})

test('Export Excel per bagian memakai query penuh dan kolom panel', async () => {
    const { sent, run } = exportHandler(async (sql) => {
        assert.match(sql, /LIMIT 50000/)
        assert.doesNotMatch(sql, /LIMIT 200/)
        return [[{ Nik: 'K001', Nama: 'Budi' }]]
    })
    await run({ query: { export: 'xlsx', bagian: 'bpjs_belum' } })
    assert.equal(sent.title, 'Belum-Setting-BPJS')
    assert.deepEqual([...sent.columns], ['Nik', 'Nama', 'Pabrik', 'Bagian', 'Tgl_Masuk'])
    assert.equal(sent.rows.length, 1)
    // Kolom export sama dengan kolom yang tampil di panel frontend.
    const view = readFileSync(new URL('../../frontend/src/views/dashboard/DashboardView.vue', import.meta.url), 'utf8')
    for (const kolom of sent.columns) {
        assert.ok(view.includes(`key: "${kolom}"`), `kolom ${kolom} tampil di panel`)
    }
})

test('Export Excel bagian tak dikenal ditolak 400', async () => {
    const { sent, run } = exportHandler(async () => { throw new Error('Tidak boleh query') })
    const body = await run({ query: { export: 'xlsx', bagian: 'tidak-ada' } })
    assert.equal(body.success, false)
    assert.ok(!('title' in sent))
})
