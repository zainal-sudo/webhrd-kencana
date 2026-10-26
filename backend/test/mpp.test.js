import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

/**
 * Dua menu duplikat Delphi yang kini masuk grup Transaksi (dek Rekruitmen):
 *   Setting Budget MPP  (ufrmSettingBudgetMPP, tbl tbudgetmpp)
 *   Proses MPP Bulanan  (ufrmProsesMPPBulanan, tbl tmppbulanan)
 * Mock saja, tanpa koneksi DB.
 */
function muat(reqs, names) {
    const calls = []
    const respond = (sql, params) => {
        calls.push({ sql, params: params || [] })
        for (const { match, hasil } of reqs) if (match.test(sql)) return hasil
        return [[]]
    }
    const conn = {
        async beginTransaction() {}, async commit() {}, async rollback() {}, release() {},
        async query(sql, params) { return respond(sql, params) },
    }
    const scope = {
        pool: {
            async query(sql, params) { return respond(sql, params) },
            async getConnection() { return conn },
        },
        success: (res, data, message) => { res.body = { success: true, data, message } },
        error: (res, message, status) => { res.body = { success: false, message, status } },
        sendExcel: (res, title, columns, data) => { res.body = { title, columns, data } },
    }
    vm.createContext(scope)
    const source = readFileSync(new URL('../src/controllers/transaksi/mppController.js', import.meta.url), 'utf8')
    vm.runInContext(
        source.replace(/^import .*\r?\n/gm, '').replace(/^export const /gm, 'const ') +
        `\nglobalThis.handlers = { ${names.join(', ')} };`,
        scope
    )
    const handlers = {}
    for (const n of names) handlers[n] = (req, res) => scope.handlers[n](req, res || {}, (err) => { throw err })
    return { handlers, calls }
}

const next = (err) => { throw err }
const qBudgetAda = { match: /FROM tbudgetmpp WHERE bm_pab_kode = \? AND bm_tahun = \? ORDER/, hasil: [[{ bagian: 'Produksi A', tetap: 5, pkwt: 2, casual: 1, pihak3: 0, total: 8 }]] }
const qBudgetKosong = { match: /FROM tbudgetmpp WHERE bm_pab_kode = \? AND bm_tahun = \? ORDER/, hasil: [[]] }
const qAdaBudget = { match: /SELECT COUNT\(\*\) AS n FROM tbudgetmpp/, hasil: [[{ n: 1 }]] }
const qTidakAdaBudget = { match: /SELECT COUNT\(\*\) AS n FROM tbudgetmpp/, hasil: [[{ n: 0 }]] }

/* ── Setting Budget MPP ── */
test('Budget: bila tbudgetmpp ada, kumatikan budget tersimpan', async () => {
    const { handlers, calls } = muat([qBudgetAda], ['getBudgetMPP'])
    const res = {}
    await handlers.getBudgetMPP({ query: { pabrik: 'P01', tahun: 2026 } }, res, next)
    assert.equal(res.body.success, true)
    assert.equal(res.body.data.sumber, 'budget')
    assert.equal(res.body.data.rows[0].total, 8)
    assert.match(calls[0].sql, /bm_tetap \+ bm_pkwt \+ bm_casual \+ bm_pihak3 AS total/)
})

test('Budget: bila belum ada, tampilkan jumlah karyawan aktif (fallback Delphi)', async () => {
    const { handlers, calls } = muat([
        qBudgetKosong,
        { match: /SELECT DISTINCT CONCAT/, hasil: [[{ bagian: 'Admin Produksi', tetap: '1', pkwt: '2', casual: '0', pihak3: '0', total: '3' }]] },
    ], ['getBudgetMPP'])
    const res = {}
    await handlers.getBudgetMPP({ query: { pabrik: 'P01', tahun: 2026 } }, res, next)
    assert.equal(res.body.data.sumber, 'aktual')
    const row = res.body.data.rows[0]
    assert.equal(row.total, 3, 'total dihitung ulang: tetap+pkwt+casual+pihak3')
    const sql = calls.at(-1).sql
    assert.match(sql, /DISTINCT CONCAT\(j\.jab_nama, ' ', x\.kar_bagian\)/)
    assert.match(sql, /kar_status_kerja = 7/)
    assert.match(sql, /kar_status_kerja IN \(1,2,3,4,5,6\)/)
    assert.match(sql, /kar_status_kerja = 8/)
    assert.match(sql, /kar_status_kerja = 9/)
})

test('Budget: simpandata hapus lalu insert ulang persis Delphi', async () => {
    const { handlers, calls } = muat([], ['saveBudgetMPP'])
    const res = {}
    await handlers.saveBudgetMPP({ body: { pabrik: 'P01', tahun: 2026, rows: [
        { bagian: 'A', tetap: 1, pkwt: 2, casual: 0, pihak3: 0 },
        { bagian: '', tetap: 9, pkwt: 9, casual: 9, pihak3: 9 },
    ] } }, res, next)
    assert.equal(res.body.data.jumlah, 1, 'baris bagian kosong dilewati')
    assert.match(calls[0].sql, /DELETE FROM tbudgetmpp WHERE bm_pab_kode = \? AND bm_tahun = \?/)
    assert.match(calls[1].sql, /INSERT INTO tbudgetmpp/)
    assert.deepEqual([...calls[1].params], ['P01', 2026, 'A', 1, 2, 0, 0])
})

test('Budget: tolak pabrik/tahun kosong', async () => {
    const { handlers } = muat([], ['saveBudgetMPP'])
    const res = {}
    await handlers.saveBudgetMPP({ body: { tahun: 2026, rows: [{ bagian: 'A' }] } }, res, next)
    assert.equal(res.body.success, false)
})

/* ── Proses MPP Bulanan ── */
test('Proses: ?sumber=simpan membaca tmppbulanan per periode', async () => {
    const { handlers, calls } = muat([
        { match: /FROM tmppbulanan/, hasil: [[{ bagian: 'A', tetap: 2, pkwt: 0, casual: 0, pihak3: 0, totalbudget: 2, tetap2: 2, pkwt2: 1, casual2: 0, pihak32: 0, total2: 3, kurang: -1 }]] },
    ], ['getProsesMPP'])
    const res = {}
    await handlers.getProsesMPP({ query: { pabrik: 'P01', tahun: 2026, periode: 10, sumber: 'simpan' } }, res, next)
    assert.equal(res.body.data.sumber, 'simpan')
    assert.match(calls[0].sql, /WHERE mpp_pab_kode = \? AND mpp_tahun = \? AND mpp_periode = \?/)
})

test('Proses: proses ulang menolak bila budget belum di-set', async () => {
    const { handlers } = muat([qTidakAdaBudget], ['getProsesMPP'])
    const res = {}
    await handlers.getProsesMPP({ query: { pabrik: 'P01', tahun: 2026, periode: 10 } }, res, next)
    assert.equal(res.body.success, false)
    assert.match(res.body.message, /budget belum ada/)
})

test('Proses: refreshdata3 budget vs hitungan aktif + kurang', async () => {
    const { handlers, calls } = muat([
        qAdaBudget,
        { match: /FROM tbudgetmpp x/, hasil: [[{ bagian: 'Admin Produksi', totalbudget: 3, tetap: 1, pkwt: 2, casual: 0, pihak3: 0, total: 3 }]] },
    ], ['getProsesMPP'])
    const res = {}
    await handlers.getProsesMPP({ query: { pabrik: 'P01', tahun: 2026, periode: 10 } }, res, next)
    assert.equal(res.body.data.sumber, 'proses')
    const row = res.body.data.rows[0]
    assert.equal(row.totalbudget, 3)
    assert.equal(row.tetap2, 1, 'realisasi awal = hasil hitungan')
    assert.equal(row.kurang, 0, 'kurang = total budget - jumlah aktif')
    const sql = calls[1].sql
    assert.match(sql, /CONCAT\(j\.jab_nama, ' ', a\.kar_bagian\) = x\.bm_bagian/)
    assert.match(sql, /bm_tetap \+ bm_pkwt \+ bm_casual \+ bm_pihak3 AS totalbudget/)
    assert.deepEqual([...calls[1].params], ['P01', 'P01', 'P01', 'P01', 'P01', 'P01', 2026],
        '5 param hitungan + where pabrik+tahun (tahun jangan sampai keganti teks pabrik)')
})

test('Proses: simpandata hapus periode lalu insert 12 kolom', async () => {
    const { handlers, calls } = muat([], ['saveProsesMPP'])
    const res = {}
    await handlers.saveProsesMPP({ body: { pabrik: 'P01', tahun: 2026, periode: 10, rows: [
        { bagian: 'A', tetap: 5, pkwt: 2, casual: 1, pihak3: 0, tetap2: 4, pkwt2: 3, casual2: 1, pihak32: 0 },
    ] } }, res, next)
    assert.equal(res.body.data.jumlah, 1)
    assert.match(calls[0].sql, /DELETE FROM tmppbulanan WHERE mpp_pab_kode = \? AND mpp_tahun = \? AND mpp_periode = \?/)
    assert.match(calls[1].sql, /INSERT INTO tmppbulanan/)
    assert.deepEqual([...calls[1].params], ['P01', 2026, 10, 'A', 5, 2, 1, 0, 4, 3, 1, 0])
})

test('Proses: tolak periode di luar 1..12', async () => {
    const { handlers } = muat([], ['getProsesMPP', 'saveProsesMPP'])
    const res1 = {}
    await handlers.getProsesMPP({ query: { pabrik: 'P01', tahun: 2026, periode: 13 } }, res1, next)
    assert.equal(res1.body.success, false)
    const res2 = {}
    await handlers.saveProsesMPP({ body: { pabrik: 'P01', tahun: 2026, periode: 0, rows: [{ bagian: 'A' }] } }, res2, next)
    assert.equal(res2.body.success, false)
})

test('Route + menu frontend kedua modul terdaftar (satu grup Rekruitmen)', async () => {
    const router = readFileSync(new URL('../src/routes/transaksiRoutes.js', import.meta.url), 'utf8')
    for (const p of ['/mpp/budget', '/mpp/proses']) {
        assert.ok(router.includes(`'${p}'`), `route ${p} ada`)
    }
    assert.ok(router.includes('frmSettingBudgetMPP'))
    assert.ok(router.includes('frmprosesMPPBulanan'))
    const feRouter = readFileSync(new URL('../../frontend/src/router/index.ts', import.meta.url), 'utf8')
    for (const p of ['/transaksi/setting-budget-mpp', '/transaksi/proses-mpp-bulanan']) {
        assert.ok(feRouter.includes(p), `route FE ${p} ada`)
    }
    const menu = readFileSync(new URL('../../frontend/src/utils/menuMap.ts', import.meta.url), 'utf8')
    assert.match(menu, /frmSettingBudgetMPP: \{[^}]*grup: "transaksi"[^}]*ready: true/)
    assert.match(menu, /frmprosesMPPBulanan: \{[^}]*grup: "transaksi"[^}]*ready: true/)
    assert.match(menu, /frmRekruitmen: \{[^}]*grup: "transaksi"/, 'dek rekruitmen')
    assert.doesNotMatch(menu, /"frmSettingBudgetMPP"/, 'tidak lagi di MENU_DIABAIKAN')
})
