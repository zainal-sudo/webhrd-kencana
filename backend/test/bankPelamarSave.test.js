import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

function fixture(existing = true) {
    const calls = []
    const conn = {
        async beginTransaction() { calls.push({ sql: 'BEGIN' }) },
        async commit() { calls.push({ sql: 'COMMIT' }) },
        async rollback() { calls.push({ sql: 'ROLLBACK' }) },
        release() { calls.push({ sql: 'RELEASE' }) },
        async query(sql, params) {
            calls.push({ sql, params })
            return sql.startsWith('SELECT rkt_nomor')
                ? [existing ? [{ rkt_nomor: params[0] }] : []] : [{ affectedRows: 1 }]
        },
    }
    const scope = {
        pool: {
            async getConnection() { return conn },
            async query(sql, params) {
                calls.push({ sql, params })
                return [[{ m: '007' }]]
            },
        },
        success(res, data, message) { Object.assign(res, { status: 200, data, message }) },
        error(res, message, status) { Object.assign(res, { status, message }) },
    }
    const source = readFileSync(new URL('../src/controllers/transaksi/rekruitmenController.js', import.meta.url), 'utf8')
    vm.runInNewContext(source.replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '')
        + '\nglobalThis.save = saveRekruitmen', scope)
    return { calls, async save(method, body = {}) {
        const res = {}
        await scope.save({ method, body: { tanggal: '2026-10-23', nama: 'Pelamar Baru', status: 0, ...body } }, res, err => { throw err })
        return res
    } }
}

for (const preview of ['', '001/HRD/REKRUIT/10/26']) {
    test(`POST creates an applicant with a server-generated number, ignoring preview ${JSON.stringify(preview)}`, async () => {
        const f = fixture()
        const res = await f.save('POST', { nomor: preview })
        assert.equal(res.status, 200)
        assert.equal(res.data.nomor, '008/HRD/REKRUIT/10/26')
        assert.ok(f.calls.some(c => c.sql.startsWith('INSERT INTO trekruitmen (')))
        assert.ok(!f.calls.some(c => /^(SELECT rkt_nomor|UPDATE trekruitmen SET)/.test(c.sql)))
        assert.ok(f.calls.some(c => c.sql === 'COMMIT'))
        assert.equal(f.calls.at(-1).sql, 'RELEASE')
    })
}

test('PUT updates the existing applicant without generating a new number', async () => {
    const f = fixture()
    const nomor = '001/HRD/REKRUIT/10/26'
    const res = await f.save('PUT', { nomor })
    assert.equal(res.status, 200)
    assert.equal(res.data.nomor, nomor)
    assert.ok(f.calls.some(c => c.sql.startsWith('UPDATE trekruitmen SET') && c.params.at(-1) === nomor))
    assert.ok(!f.calls.some(c => /^(SELECT MAX|INSERT INTO trekruitmen \()/.test(c.sql)))
})

test('PUT without a number is rejected instead of creating an applicant', async () => {
    const f = fixture()
    const res = await f.save('PUT')
    assert.equal(res.status, 400)
    assert.ok(!f.calls.some(c => c.sql === 'BEGIN' || c.sql.startsWith('INSERT')))
    assert.equal(f.calls.at(-1).sql, 'RELEASE')
})

test('PUT for an unknown applicant still returns 404 and does not insert', async () => {
    const f = fixture(false)
    const res = await f.save('PUT', { nomor: 'UNKNOWN' })
    assert.equal(res.status, 404)
    assert.equal(res.message, 'Nomor tidak ditemukan')
    assert.ok(f.calls.some(c => c.sql === 'ROLLBACK'))
    assert.ok(!f.calls.some(c => c.sql.startsWith('INSERT')))
    assert.equal(f.calls.at(-1).sql, 'RELEASE')
})
