import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { applyAllColumnFilters, buildOrderBy } from '../src/helpers/browse.js'

/**
 * Tiga menu duplikat Delphi: Realisasi Permintaan Karyawan
 * (ufrmBrowseRiilPermintaanKaryawan + ufrmRiilPermintaanKaryawan),
 * Bank Pelamar (ufrmBrowseRekruitmen + ufrmRekruitmen) dan
 * Rekruitmen/Panggilan (ufrmBrowseCalonKaryawan + ufrmCalonKaryawan).
 * Mock saja, tanpa koneksi DB.
 */
function muat(path, names) {
    const calls = []
    const runQuery = async (sql, params) => {
        calls.push({ sql, params: params ? [...params] : [] })
        if (/MAX\(LEFT\(\w+, 3\)\)/.test(sql)) return [[{ m: null }]]
        if (sql.includes('COUNT(*)')) return [[{ total: 0, c: 0 }]]
        return [[]]
    }
    const conn = {
        async beginTransaction() {}, async commit() {}, async rollback() {}, release() {},
        async query(sql, params) { return runQuery(sql, params) },
    }
    const pool = { async query(sql, params) { return runQuery(sql, params) }, async getConnection() { return conn } }
    const scope = {
        pool, applyAllColumnFilters, buildOrderBy,
        success: (res, data, message) => { res.body = { success: true, data, message } },
        error: (res, message, status) => { res.body = { success: false, message, status } },
        paginated: (res, data, pagination) => { res.body = { success: true, data, pagination } },
        sendExcel: (res, title, columns, data) => { res.body = { title, columns, data } },
    }
    vm.createContext(scope)
    const source = readFileSync(new URL(path, import.meta.url), 'utf8')
    vm.runInContext(
        source.replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '') +
        `\nglobalThis.handlers = { ${names.join(', ')} };`,
        scope
    )
    const handlers = {}
    for (const n of names) handlers[n] = (req, res) => scope.handlers[n](req, res || {}, (err) => { throw err }).then(() => ({}))
    return { handlers, calls, scope }
}

function muatTransaksi(poolQuery, names) {
    const calls = []
    const tx = { began: false, committed: false, rolledBack: false }
    const conn = {
        async beginTransaction() { tx.began = true },
        async commit() { tx.committed = true },
        async rollback() { tx.rolledBack = true },
        release() {},
        async query(sql, params) {
            calls.push({ sql, params: params ? [...params] : [] })
            return poolQuery(sql, params)
        },
    }
    const scope = {
        pool: {
            async query(sql, params) {
                calls.push({ sql, params: params ? [...params] : [] })
                return poolQuery(sql, params)
            },
            async getConnection() { return conn },
        },
        applyAllColumnFilters, buildOrderBy,
        success: (res, data, message) => { res.body = { success: true, data, message } },
        error: (res, message, status) => { res.body = { success: false, message, status } },
        paginated: (res, data, pagination) => { res.body = { success: true, data, pagination } },
        sendExcel: (res, title, columns, data) => { res.body = { title, columns, data } },
    }
    vm.createContext(scope)
    const source = readFileSync(new URL('../src/controllers/transaksi/calonKaryawanController.js', import.meta.url), 'utf8')
    vm.runInContext(
        source.replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '') +
        `\nglobalThis.handlers = { ${names.join(', ')} };`,
        scope
    )
    const handlers = {}
    for (const n of names) handlers[n] = (req, res) => scope.handlers[n](req, res || {}, (err) => { throw err }).then(() => ({}))
    return { handlers, calls, tx, scope }
}

const next = (err) => { throw err }
const period = { start_date: '2026-10-01', end_date: '2026-10-13' }

/* ── Realisasi ── */
test('Riil: browse join permintaan+jabatan+karyawan per periode', async () => {
    const { handlers, calls } = muat('../src/controllers/transaksi/riilPermintaanController.js',
        ['getRiilList', 'getNomor', 'getPermintaanTerbuka', 'saveRiil'])
    const res = {}
    await handlers.getRiilList({ query: period }, res, next)
    const sql = calls.at(-1).sql
    assert.match(sql, /FROM triilpermintaankaryawan r/)
    assert.match(sql, /INNER JOIN tpermintaankaryawan t ON t\.tpk_nomor = r\.rpk_tpk_nomor/)
    assert.match(sql, /INNER JOIN tjabatan j ON j\.jab_kode = t\.tpk_jab_kode/)
    assert.match(sql, /INNER JOIN tkaryawan k ON k\.kar_Nik = t\.tpk_peminta/)
    assert.match(sql, /r\.rpk_tanggal BETWEEN \? AND \?/)
})

test('Riil: nomor preview NNN/HRD/RPK/MM/YYYY', async () => {
    const { handlers, scope } = muat('../src/controllers/transaksi/riilPermintaanController.js', ['nomorBerikut'])
    const nomor = await scope.handlers.nomorBerikut('2026-10-13')
    assert.equal(nomor, '001/HRD/RPK/10/2026')
})

test('Riil: picker hanya permintaan belum penuh', async () => {
    const { handlers, calls } = muat('../src/controllers/transaksi/riilPermintaanController.js', ['getPermintaanTerbuka'])
    const res = {}
    await handlers.getPermintaanTerbuka({ query: { search: 'x' } }, res, next)
    const sql = calls.at(-1).sql
    assert.match(sql, /HAVING Jumlah > Jml_Riil/)
    assert.match(sql, /SUM\(rpk_jumlah\)/)
})

test('Riil: simpan menolak jumlah kosong & tpk tak dikenal', async () => {
    const { handlers } = muat('../src/controllers/transaksi/riilPermintaanController.js', ['saveRiil'])
    const bad = {}
    await handlers.saveRiil({ body: { tpk_nomor: 'X', tanggal: '2026-10-13', jumlah: 0 } }, bad, next)
    assert.equal(bad.body.success, false)
})

/* ── Bank Pelamar ── */
test('Bank: browse + status Delphi + nomor /HRD/REKRUIT/', async () => {
    const { handlers, calls, scope } = muat('../src/controllers/transaksi/rekruitmenController.js',
        ['getRekruitmenList', 'nomorBerikut', 'STATUS_REKRUITMEN'])
    assert.equal(scope.handlers.STATUS_REKRUITMEN.length, 9)
    assert.equal(scope.handlers.STATUS_REKRUITMEN[0], 'Belum diputuskan')
    const res = {}
    await handlers.getRekruitmenList({ query: period }, res, next)
    const sql = calls.at(-1).sql
    assert.match(sql, /FROM trekruitmen/)
    assert.match(sql, /rkt_tanggal BETWEEN \? AND \?/)
    assert.match(sql, /Tes Psikotes\/skill/)
    const nomor = await scope.handlers.nomorBerikut('2026-10-13')
    assert.equal(nomor, '001/HRD/REKRUIT/10/26')
})

test('Bank: simpan wajib nama & status valid', async () => {
    const { handlers } = muat('../src/controllers/transaksi/rekruitmenController.js', ['saveRekruitmen'])
    const kosong = {}
    await handlers.saveRekruitmen({ body: { tanggal: '2026-10-13', nama: '' } }, kosong, next)
    assert.equal(kosong.body.success, false)
})

/* ── Rekruitmen/Panggilan ── */
test('Calon: browse + nomor /HRD/CK/ + tolak duplikat pelamar', async () => {
    const q = async (sql) => {
        if (/MAX\(LEFT\(\w+, 3\)\)/.test(sql)) return [[{ m: null }]]
        if (sql.includes('COUNT(*)')) return [[{ total: 0, c: 0 }]]
        if (sql.startsWith('SELECT rkt_nomor FROM trekruitmen')) return [[{ rkt_nomor: 'R1' }]]
        return [[]]
    }
    const { handlers, calls, scope, tx } = muatTransaksi(q, ['getCalonList', 'nomorBerikut', 'saveCalon'])
    const res = {}
    await handlers.getCalonList({ query: period }, res, next)
    assert.match(calls.at(-1).sql, /FROM tcalonkaryawan c/)
    assert.match(calls.at(-1).sql, /ck_tanggal BETWEEN \? AND \?/)
    const nomor = await scope.handlers.nomorBerikut('2026-10-13')
    assert.equal(nomor, '001/HRD/CK/10/26')
    const duplikat = {}
    await handlers.saveCalon({
        body: {
            tanggal: '2026-10-13', tanggal_panggil: '2026-10-14', keterangan: '',
            detail: [{ nopelamar: 'R1', jam: '08:00:00' }, { nopelamar: 'R1', jam: '' }],
        },
    }, duplikat, next)
    assert.equal(duplikat.body.success, false)
    assert.match(duplikat.body.message, /sudah dimasukkan/)
    assert.equal(tx.began, false)
})

test('Calon: simpan nilai tes menimpa per pasangan ck+rkt', async () => {
    const seen = []
    const q = async (sql) => {
        seen.push(sql)
        return [[]]
    }
    const { handlers, tx } = muatTransaksi(q, ['saveTes'])
    const res = {}
    await handlers.saveTes({ body: { ck_nomor: 'C1', rkt_nomor: 'R1', tes: [{ id: 2, hasil: '80' }] } }, res, next)
    assert.equal(tx.committed, true)
    assert.ok(seen.some((s) => /DELETE FROM trekruitmentes WHERE rtt_ck_nomor/.test(s)))
    assert.ok(seen.some((s) => /INSERT INTO trekruitmentes/.test(s)))
})

test('Route + menu frontend ketiga modul terdaftar', async () => {
    const router = readFileSync(new URL('../src/routes/transaksiRoutes.js', import.meta.url), 'utf8')
    for (const p of ['/realisasi-permintaan', '/bank-pelamar', '/rekrutmen']) {
        assert.ok(router.includes(`'${p}'`), `route ${p} ada`)
    }
    assert.ok(router.includes('frmRiilPermintaanKaryawan'))
    assert.ok(router.includes('frmRekruitmen'))
    assert.ok(router.includes('frmCalonKaryawan'))
    const feRouter = readFileSync(new URL('../../frontend/src/router/index.ts', import.meta.url), 'utf8')
    for (const p of ['/transaksi/realisasi-permintaan', '/transaksi/realisasi-permintaan/form',
        '/transaksi/bank-pelamar', '/transaksi/bank-pelamar/form',
        '/transaksi/rekrutmen', '/transaksi/rekrutmen/form']) {
        assert.ok(feRouter.includes(p), `route FE ${p} ada`)
    }
    const menu = readFileSync(new URL('../../frontend/src/utils/menuMap.ts', import.meta.url), 'utf8')
    assert.match(menu, /frmRiilPermintaanKaryawan: \{[^}]*ready: true/)
    assert.match(menu, /frmRekruitmen: \{[^}]*ready: true/)
    assert.match(menu, /frmCalonKaryawan: \{[^}]*ready: true/)
})

test('Karyawan: picker rekruitmen hanya pelamar Diterima + route terdaftar', async () => {
    const calls = []
    const scope = {
        pool: {
            async query(sql, params) {
                calls.push(sql)
                return [[{ Nomor: 'R1', rkt_nama: 'Budi' }]]
            },
        },
        success: (res, data) => { res.body = { success: true, data } },
        error: (res, message, status) => { res.body = { success: false, message, status } },
        paginated: () => {},
        buildOrderBy, applyAllColumnFilters,
        nomorNik: () => {}, nomorKodeAbsensi: () => {},
        sendExcel: () => {},
    }
    vm.createContext(scope)
    const source = readFileSync(new URL('../src/controllers/master/karyawanController.js', import.meta.url), 'utf8')
    vm.runInContext(
        source.replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '') +
        '\nglobalThis.lookupRekrutmenFn = lookupRekrutmen;',
        scope
    )
    const res = {}
    await scope.lookupRekrutmenFn({ query: { search: 'budi' } }, res, next)
    assert.equal(res.body.success, true)
    assert.match(calls.at(-1), /WHERE rkt_status = 1/)
    assert.match(calls.at(-1), /FROM trekruitmen/)
    const routes = readFileSync(new URL('../src/routes/masterRoutes.js', import.meta.url), 'utf8')
    const barisRoute = routes.split('\n').find((l) => l.includes('rekrutmen-disetujui'))
    assert.ok(barisRoute)
    assert.ok(Number(routes.indexOf("'/karyawan/:nik'")) > Number(routes.indexOf('rekrutmen-disetujui')),
        'route picker di atas :nik agar tidak tertelan')
    const view = readFileSync(new URL('../../frontend/src/views/master/KaryawanForm.vue', import.meta.url), 'utf8')
    assert.ok(view.includes('No Rekruitmen'))
    assert.ok(view.includes('/master/karyawan/rekrutmen-disetujui'))
    assert.ok(view.includes('Ketik manual'), 'pendidikan ketik manual seperti Delphi')
})
