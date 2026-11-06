import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { success, error, paginated } from '../src/helpers/response.js'
import { applyAllColumnFilters, buildOrderBy } from '../src/helpers/browse.js'

/**
 * PUT/POST /master/karyawan — tabel anak "Riwayat PKWT" (tpkwt) kini MANUAL:
 * isian grid menimpa isi tabel apa adanya (DELETE + INSERT ulang), TIDAK ada
 * lagi penyesuaian otomatis dua arah dengan master. Jalur resmi yang menulis
 * master + riwayat sekaligus adalah Transaksi → Perubahan Status (diuji
 * perubahanStatusSync.test.js), dan card "PKWT Akan Habis" membaca kondisi
 * terbaru dari semua tabel (pkwtEksekusi.js).
 * Mock per pola karyawanStatusAccess.test.js.
 */
const source = readFileSync(new URL('../src/controllers/master/karyawanController.js', import.meta.url), 'utf8')

function fixture() {
    const calls = []
    const conn = {
        async query(sql, params = []) {
            calls.push({ sql, params: [...params] })
            if (sql.startsWith('SELECT kar_Nik, kar_status_aktif')) {
                return [[{ kar_Nik: '001', kar_status_aktif: 1 }]]
            }
            return [[]]
        },
        async beginTransaction() { calls.push({ sql: 'BEGIN' }) },
        async commit() { calls.push({ sql: 'COMMIT' }) },
        async rollback() { calls.push({ sql: 'ROLLBACK' }) },
        release() {},
    }
    const scope = {
        pool: { getConnection: async () => conn, query: conn.query },
        success, error, paginated, applyAllColumnFilters, buildOrderBy,
        nomorNik: async () => '001', nomorKodeAbsensi: async () => 'ABS001',
        cariDuplikatIdentitas: async () => [], GET_LOCK: null, sendExcel() {},
    }
    vm.createContext(scope)
    vm.runInContext(source.replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '')
        + '\nglobalThis.handlers = { saveKaryawan };', scope)
    const simpan = async (body, method = 'PUT') => {
        const res = { statusCode: 200, status(code) { this.statusCode = code; return this }, json(value) { this.body = value; return this } }
        const params = method === 'PUT' ? { nik: '001' } : {}
        await scope.handlers.saveKaryawan({ method, user: { user: 'hrd' }, params, body }, res, err => { throw err })
        return res
    }
    return { calls, simpan }
}

const SQL_SYNC_MASTER = 'UPDATE tkaryawan SET kar_status_kerja = ?, kar_tglPKWT1 = ?, kar_tglPKWT2 = ? WHERE kar_Nik = ?'
const SQL_INSERT_PKWT = 'INSERT INTO tpkwt (kar_nik, sk_id, tgl1, tgl2) VALUES ?'
const UP = { kar_nama: 'Karyawan', kar_status_aktif: 1 }

test('Riwayat diisi manual: grid disimpan apa adanya — master tidak disentuh', async () => {
    const f = fixture()
    const res = await f.simpan({
        ...UP, kar_status_kerja: 3, kar_tglPKWT1: '2026-06-01', kar_tglPKWT2: '2027-05-31',
        pkwt: [
            { sk_id: 2, tgl1: '2025-06-01', tgl2: '2026-05-31' },
            { SkId: 3, sk_id: 3, tgl1: '2026-06-01', tgl2: '2027-05-31' },
        ],
    })
    assert.equal(res.statusCode, 200)
    // Baris dibangun di dalam vm (realm berbeda) — salin lewat JSON dulu.
    const riwayatJson = JSON.parse(JSON.stringify(f.calls.find(c => c.sql === SQL_INSERT_PKWT).params))
    assert.deepEqual(riwayatJson, [
        [
            ['001', 2, '2025-06-01', '2026-05-31'],
            ['001', 3, '2026-06-01', '2027-05-31'],
        ],
    ], 'dua baris tersimpan persis seperti isian grid (SkId maupun sk_id terbaca)')
    assert.ok(!f.calls.some(c => c.sql === SQL_SYNC_MASTER), 'grid TIDAK lagi menggerakkan master')
})

test('Grid riwayat kosong → riwayat kosong, master tidak disentuh (murni manual)', async () => {
    const f = fixture()
    const res = await f.simpan({
        ...UP, kar_status_kerja: 4, kar_tglPKWT1: '2026-11-09', kar_tglPKWT2: '2027-05-08', pkwt: [],
    })
    assert.equal(res.statusCode, 200)
    assert.ok(!f.calls.some(c => c.sql === SQL_INSERT_PKWT), 'tidak ada baris ditanam otomatis')
    assert.ok(!f.calls.some(c => c.sql === SQL_SYNC_MASTER))
})

test('Baris status non-PKWT (Tetap/Probation) tersimpan apa adanya', async () => {
    const f = fixture()
    const res = await f.simpan({
        ...UP, kar_status_kerja: 1, kar_tglPKWT1: null, kar_tglPKWT2: null,
        pkwt: [
            { sk_id: 8, tgl1: '2025-01-01', tgl2: '2025-06-30' },
            { sk_id: 11, tgl1: '2026-01-01', tgl2: '2026-03-02' },
        ],
    })
    assert.equal(res.statusCode, 200)
    const riwayatJson = JSON.parse(JSON.stringify(f.calls.find(c => c.sql === SQL_INSERT_PKWT).params))
    assert.deepEqual(riwayatJson, [
        [
            ['001', 8, '2025-01-01', '2025-06-30'],
            ['001', 11, '2026-01-01', '2026-03-02'],
        ],
    ])
    assert.ok(!f.calls.some(c => c.sql === SQL_SYNC_MASTER))
})

test('Baris riwayat tanpa SK ditolak 400 sebelum menulis apa pun', async () => {
    const f = fixture()
    const res = await f.simpan({
        ...UP, kar_status_kerja: 3, pkwt: [{ SkId: '', tgl1: '2026-06-01', tgl2: '2027-05-31' }],
    })
    assert.equal(res.statusCode, 400)
    assert.match(res.body.message, /wajib memilih Status PKWT/)
    assert.ok(!f.calls.some(c => /^(UPDATE|INSERT)/.test(c.sql)), 'tidak boleh ada tulis ke DB')
})

test('Dua baris riwayat dengan SK sama ditolak 400 sebelum menulis apa pun', async () => {
    const f = fixture()
    const res = await f.simpan({
        ...UP, kar_status_kerja: 3, pkwt: [
            { sk_id: 3, tgl1: '2026-06-01', tgl2: '2027-05-31' },
            { sk_id: 3, tgl1: '2024-06-01', tgl2: '2025-05-31' },
        ],
    })
    assert.equal(res.statusCode, 400)
    assert.match(res.body.message, /SK sama \(3\)/)
    assert.ok(!f.calls.some(c => /^(UPDATE|INSERT)/.test(c.sql)), 'tidak boleh ada tulis ke DB')
})
