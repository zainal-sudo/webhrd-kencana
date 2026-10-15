import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { success, error, paginated } from '../src/helpers/response.js'
import { applyAllColumnFilters, buildOrderBy } from '../src/helpers/browse.js'

const source = readFileSync(new URL('../src/controllers/master/karyawanController.js', import.meta.url), 'utf8')
function fixture(current = undefined) {
    const calls = []
    const conn = {
        async query(sql, params = []) {
            calls.push({ sql, params: [...params] })
            if (sql.startsWith('SELECT kar_Nik, kar_status_aktif')) return [current === undefined ? [] : [{ kar_Nik: '001', kar_status_aktif: current }]]
            if (sql.includes('COUNT(*)')) return [[{ total: 0 }]]
            return [[]]
        },
        async beginTransaction() {}, async commit() {}, async rollback() {}, release() {},
    }
    const scope = { pool: { getConnection: async () => conn, query: conn.query }, success, error, paginated,
        applyAllColumnFilters, buildOrderBy, nomorNik: async () => '001', nomorKodeAbsensi: async () => 'ABS001', sendExcel() {} }
    vm.createContext(scope)
    vm.runInContext(source.replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '') + '\nglobalThis.handlers = { saveKaryawan, getKaryawanList };', scope)
    const save = async (user, status, { method = 'PUT', include = true, body = {} } = {}) => {
        const res = { statusCode: 200, status(code) { this.statusCode = code; return this }, json(value) { this.body = value; return this } }
        await scope.handlers.saveKaryawan({ method, user: { user }, params: method === 'PUT' ? { nik: '001' } : {},
            body: { kar_nama: 'Employee', ...(include ? { kar_status_aktif: status } : {}), ...body } }, res, err => { throw err })
        return res
    }
    return { calls, save, list: scope.handlers.getKaryawanList }
}

for (const user of ['HRD', 'hrd', 'super', 'SuPeR']) test(`${user} can set both status values`, async () => {
    for (const status of [0, 1, '0', '1']) {
        const f = fixture(null)
        assert.equal((await f.save(user, status)).statusCode, 200)
        const write = f.calls.find(c => c.sql.startsWith('UPDATE tkaryawan SET'))
        assert.match(write.sql, /`kar_status_aktif` = \?/)
        assert.equal(write.params[1], Number(status))
    }
})

test('Other accounts always create inactive employees, including missing or forged status', async () => {
    for (const status of [null, 0, 1, '1', 'invalid']) {
      for (const options of [{}, { include: false }, { body: { KAR_STATUS_AKTIF: 1 } }]) {
        const f = fixture()
        assert.equal((await f.save('STAFF', status, { method: 'POST', ...options })).statusCode, 201)
        const write = f.calls.find(c => c.sql.startsWith('INSERT INTO tkaryawan ('))
        assert.equal(write.params[2], 0)
      }
    }
})

test('Other accounts edit unrelated data without writing status, including absent/null status', async () => {
    for (const current of [null, 0, 1]) for (const include of [false, true]) {
        const f = fixture(current)
        assert.equal((await f.save('STAFF', current, { include })).statusCode, 200)
        const write = f.calls.find(c => c.sql.startsWith('UPDATE tkaryawan SET'))
        assert.doesNotMatch(write.sql, /kar_status_aktif/)
    }
})

test('Other accounts cannot change status via direct API requests', async () => {
    for (const [current, requested] of [[null, 0], [null, 1], [0, 1], [1, 0], [1, null], [0, 'invalid']]) {
        const f = fixture(current), res = await f.save('STAFF', requested)
        assert.equal(res.statusCode, 403)
        assert.equal(res.body.message, 'Status aktif/non aktif hanya dapat diubah oleh HRD')
        assert.ok(!f.calls.some(c => /^(UPDATE|INSERT|DELETE)/.test(c.sql)))
    }
})

test('HRD/super must choose valid status and never write NULL', async () => {
    for (const status of [null, '', 2, 'invalid', true]) {
        assert.equal((await fixture().save('HRD', status, { method: 'POST' })).statusCode, 400)
    }
    assert.equal((await fixture(null).save('super', null)).statusCode, 400)
    assert.equal((await fixture(null).save('HRD', undefined, { include: false })).statusCode, 400)
    assert.equal((await fixture(1).save('HRD', null)).statusCode, 400)
    for (const user of ['HRD', 'super']) for (const status of [0, 1]) {
        const f = fixture()
        assert.equal((await f.save(user, status, { method: 'POST' })).statusCode, 201)
        assert.equal(f.calls.find(c => c.sql.startsWith('INSERT INTO tkaryawan (')).params[2], status)
    }
})

test('POST with existing NIK cannot update; missing PUT returns 404', async () => {
    assert.equal((await fixture(1).save('STAFF', 0, { method: 'POST', body: { kar_Nik: '001' } })).statusCode, 409)
    assert.equal((await fixture().save('HRD', 1)).statusCode, 404)
})

test('Master saves never write exit date, including forged payload keys for any account', async () => {
    for (const user of ['HRD', 'super', 'STAFF']) for (const method of ['POST', 'PUT']) {
        for (const body of [{}, { kar_tgl_keluar: '2026-10-15' }, { kar_tgl_keluar: null }, { KAR_TGL_KELUAR: '2026-10-15' }]) {
            const f = fixture(method === 'PUT' ? 1 : undefined)
            const res = await f.save(user, 1, { method, body })
            assert.equal(res.statusCode, method === 'PUT' ? 200 : 201)
            const write = f.calls.find(c => /^(INSERT INTO tkaryawan \(|UPDATE tkaryawan SET)/.test(c.sql))
            assert.ok(write)
            assert.doesNotMatch(write.sql, /kar_tgl_keluar/i)
        }
    }
})

test('Exit date remains selectable, sortable and filterable in employee browse', async () => {
    const f = fixture()
    await f.list({ query: { sort_by: 'TglKeluar', sort_dir: 'desc', filterSet_TglKeluar: ['2026-10-15'] } },
        { status() { return this }, json() {} }, err => { throw err })
    const query = f.calls.at(-1)
    assert.ok(query.sql.includes('k.kar_tgl_keluar AS `TglKeluar`'))
    assert.match(query.sql, /k.kar_tgl_keluar IN \(\?\)/)
    assert.match(query.sql, /ORDER BY k.kar_tgl_keluar desc/)
    assert.ok(query.params.includes('2026-10-15'))
})

test('Browse and status filters retain active/inactive labels', async () => {
    for (const status of ['Aktif', 'Non Aktif']) {
        const f = fixture()
        await f.list({ query: { filterSet_Status: [status] } }, { status() { return this }, json() {} }, err => { throw err })
        const query = f.calls.at(-1)
        assert.ok(query.sql.includes("IF(k.kar_status_aktif = 1, 'Aktif', 'Non Aktif')"))
        assert.ok(query.params.includes(status))
    }
})
