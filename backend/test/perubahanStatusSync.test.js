import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { success, error, paginated } from '../src/helpers/response.js'
import { applyKaryawanLookup } from '../src/helpers/karyawanLookup.js'
import { applyAllColumnFilters, buildOrderBy } from '../src/helpers/browse.js'

/**
 * POST /transaksi/perubahan-status — sinkron tiga arah saat simpan dokumen:
 *   dokumen tperubahanstatus  (inti Delphi)
 *   master tkaryawan          (kar_status_kerja + kar_tglPKWT1/2, eksplisit —
 *                              cadangan di DB tanpa trigger `tperubahanstatus`)
 *   riwayat tpkwt             (grid "Riwayat PKWT" form master, upsert per sk)
 * Mock per pola karyawanStatusAccess.test.js (vm context, conn query recorder).
 */
const source = readFileSync(new URL('../src/controllers/transaksi/perubahanStatusController.js', import.meta.url), 'utf8')

function fixture({ tpkwtAda = false, gagalMaster = false } = {}) {
    const calls = []
    const conn = {
        async query(sql, params = []) {
            calls.push({ sql, params: [...params] })
            if (sql.startsWith('SELECT kar_nama FROM tkaryawan')) {
                return [gagalMaster ? [] : [{ kar_nama: 'NAMA' }]]
            }
            if (sql.startsWith('SELECT sk_id FROM tstatuskaryawan')) return [[{ sk_id: 1 }]]
            if (sql.startsWith('SELECT ps_nomor FROM tperubahanstatus')) return [[{ ps_nomor: 'PST.202611.0001' }]]
            if (sql.startsWith('SELECT MAX(RIGHT(ps_nomor, 4))')) return [[{ m: 0 }]]
            if (sql === 'SELECT kar_nik FROM tpkwt WHERE kar_nik = ? AND sk_id = ? LIMIT 1') {
                return [tpkwtAda ? [{ kar_nik: 'N1' }] : []]
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
        success, error, paginated, applyKaryawanLookup, applyAllColumnFilters, buildOrderBy, sendExcel() {},
    }
    vm.createContext(scope)
    vm.runInContext(source.replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '')
        + '\nglobalThis.handlers = { savePerubahanStatus };', scope)
    const simpan = async (body) => {
        const res = { statusCode: 200, status(code) { this.statusCode = code; return this }, json(value) { this.body = value; return this } }
        await scope.handlers.savePerubahanStatus({ body }, res, err => { throw err })
        return res
    }
    return { calls, simpan }
}

const baris = { tanggal: '2026-11-09', nik: 'N1', status_lama: 3, status_baru: 4, tgl_awal: '2026-11-09', tgl_akhir: '2027-05-08' }
const SQL_MASTER = 'UPDATE tkaryawan SET kar_status_kerja = ?, kar_tglPKWT1 = ?, kar_tglPKWT2 = ? WHERE kar_Nik = ?'
const SQL_INSERT_PKWT = 'INSERT INTO tpkwt (kar_nik, sk_id, tgl1, tgl2) VALUES (?, ?, ?, ?)'
const SQL_UPDATE_PKWT = 'UPDATE tpkwt SET tgl1 = ?, tgl2 = ? WHERE kar_nik = ? AND sk_id = ?'

test('Simpan dokumen baru menulis dokumen, master, dan menambah riwayat PKWT', async () => {
    const f = fixture()
    const res = await f.simpan(baris)
    assert.equal(res.statusCode, 200)
    const dok = f.calls.find(c => c.sql.startsWith('INSERT INTO tperubahanstatus'))
    assert.ok(dok, 'dokumen harus ditulis')
    assert.deepEqual(dok.params, ['PST.202611.0001', '2026-11-09', 'N1', 3, 4, '2026-11-09', '2027-05-08'])
    const master = f.calls.find(c => c.sql === SQL_MASTER)
    assert.deepEqual(master.params, [4, '2026-11-09', '2027-05-08', 'N1'])
    const riwayat = f.calls.find(c => c.sql === SQL_INSERT_PKWT)
    assert.deepEqual(riwayat.params, ['N1', 4, '2026-11-09', '2027-05-08'])
    assert.ok(f.calls.some(c => c.sql === 'BEGIN'), 'harus dalam transaksi')
    assert.ok(f.calls.some(c => c.sql === 'COMMIT'))
})

test('Simpan dengan nomor lama memutakhirkan dokumen dan riwayat lama (update, bukan insert)', async () => {
    const f = fixture({ tpkwtAda: true })
    const res = await f.simpan({ ...baris, nomor: 'PST.202610.0001' })
    assert.equal(res.statusCode, 200)
    assert.ok(f.calls.find(c => c.sql.startsWith('UPDATE tperubahanstatus')), 'dokumen lama diupdate')
    const riwayat = f.calls.find(c => c.sql === SQL_UPDATE_PKWT)
    assert.deepEqual(riwayat.params, ['2026-11-09', '2027-05-08', 'N1', 4])
    assert.ok(!f.calls.some(c => c.sql === SQL_INSERT_PKWT))
})

test('NIK tidak dikenal gagal 400 tanpa menulis apa pun', async () => {
    const f = fixture({ gagalMaster: true })
    const res = await f.simpan(baris)
    assert.equal(res.statusCode, 400)
    assert.ok(!f.calls.some(c => /^(UPDATE|INSERT)/.test(c.sql)), 'tidak boleh menulis bila NIK tidak ada')
})
