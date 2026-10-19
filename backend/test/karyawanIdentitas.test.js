import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { success, error, paginated } from '../src/helpers/response.js'
import { applyAllColumnFilters, buildOrderBy } from '../src/helpers/browse.js'

const source = readFileSync(new URL('../src/controllers/master/karyawanController.js', import.meta.url), 'utf8')
const existing = (identitas, aktif = 1, nik = '009') => ({ kar_Nik: nik, kar_nama: 'Pemakai Lama', kar_noidentitas: identitas, kar_status_aktif: aktif })
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } })
function fixture({ rows = [], current, kunci = 1, failWrite = false, shared } = {}) {
    const calls = []
    const conn = {
        async query(sql, params = []) {
            calls.push({ sql, params: Array.from(params) })
            if (sql.includes('GET_LOCK')) {
                if (shared) {
                    while (shared.locked) await new Promise(resolve => shared.waiters.push(resolve))
                    shared.locked = true
                }
                return [[{ kunci }]]
            }
            if (sql.includes('RELEASE_LOCK')) {
                if (shared) { shared.locked = false; shared.waiters.splice(0).forEach(resolve => resolve()) }
                return [[{ lepas: 1 }]]
            }
            if (sql.startsWith('SELECT kar_Nik, kar_status_aktif')) return [current ? [current] : []]
            if (sql.startsWith('SELECT kar_noidentitas FROM')) return [current ? [current] : []]
            if (sql.includes('BINARY TRIM(kar_noidentitas) = BINARY ?')) {
                assert.ok(!sql.includes('REGEXP'))
                return [(shared?.rows ?? rows).filter(row => String(row.kar_noidentitas ?? '').trim() === params[0] && row.kar_Nik !== params[1])]
            }
            if (sql.startsWith('INSERT INTO tkaryawan (')) {
                if (failWrite) throw new Error('write failed')
                if (shared) {
                    const cols = sql.match(/\((.*?)\) VALUES/)[1].split(',').map(col => col.replaceAll('`', ''))
                    shared.rows.push(Object.fromEntries(cols.map((col, i) => [col, params[i]])))
                }
            }
            return [[]]
        },
        async beginTransaction() {}, async commit() {}, async rollback() {}, release() { calls.push({ sql: 'release connection' }) },
    }
    const scope = { pool: { getConnection: async () => conn, query: conn.query }, success, error, paginated,
        applyAllColumnFilters, buildOrderBy, nomorNik: async () => '010', nomorKodeAbsensi: async () => '999', sendExcel() {}, Buffer }
    vm.createContext(scope)
    vm.runInContext(source.replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '') + '\nglobalThis.handlers = { saveKaryawan, cekIdentitas };', scope)
    return { calls,
        async save(body = {}, method = 'POST') {
            const res = response()
            await scope.handlers.saveKaryawan({ method, user: { user: 'HRD' }, params: method === 'PUT' ? { nik: '001' } : {},
                body: { kar_nama: 'Nama Baru', kar_pab_kode: 'P01', kar_tgl_masuk: '2026-01-01', kar_status_aktif: 1, ...body } }, res, err => { throw err })
            return res
        },
        async check(noidentitas, nik) {
            const res = response()
            await scope.handlers.cekIdentitas({ query: { noidentitas, nik } }, res, err => { throw err })
            return res.body.data.ditemukan
        },
    }
}
const writes = f => f.calls.filter(c => /^(INSERT|UPDATE|DELETE)/.test(c.sql))
const identityQueries = f => f.calls.filter(c => c.sql.includes('BINARY TRIM(kar_noidentitas)'))
const savedIdentity = f => {
    const write = f.calls.find(c => c.sql.startsWith('INSERT INTO tkaryawan ('))
    const cols = write.sql.match(/\((.*?)\) VALUES/)[1].split(',').map(c => c.replaceAll('`', ''))
    return write.params[cols.indexOf('kar_noidentitas')]
}

test('POST new identity succeeds, generated internal NIK and raw identity stay unchanged', async () => {
    const f = fixture(), res = await f.save({ kar_noidentitas: ' 123456(2) ' })
    assert.equal(res.statusCode, 201)
    assert.equal(res.body.data.kar_Nik, '010')
    assert.equal(savedIdentity(f), ' 123456(2) ')
    assert.deepEqual(identityQueries(f)[0].params, ['123456(2)'])
})
for (const aktif of [1, 0, null]) test(`POST existing identity blocks regardless of status ${aktif}, before all writes`, async () => {
    const f = fixture({ rows: [existing('123456', aktif)] })
    const res = await f.save({ kar_noidentitas: '123456', kar_foto_base64: 'YQ==', anak: [{ kara_nama_anak: 'Anak' }], jadwal: [{ karj_jd_id: 1 }] })
    assert.equal(res.statusCode, 409)
    assert.match(res.body.message, /009 - Pemakai Lama/)
    assert.match(res.body.message, /Gunakan No. Identitas yang berbeda/)
    assert.deepEqual(writes(f), [])
    assert.equal(f.calls.filter(c => c.sql.includes('RELEASE_LOCK')).length, 1)
})
for (const [value, db] of [['123456', '123456(2)'], ['123456(2)', '123456'], ['1234562', '123456'], ['123456(2)', '1234562'], ['ABC', 'abc']]) {
    test(`Full identity ${value} differs from ${db}; no legacy fallback or automatic suffix`, async () => {
        const f = fixture({ rows: [existing(db)] })
        assert.equal((await f.save({ kar_noidentitas: value })).statusCode, 201)
        assert.equal(savedIdentity(f), value)
        assert.equal(identityQueries(f).length, 1)
        assert.ok(!f.calls.some(c => c.sql.includes('REGEXP')))
    })
}
for (const [value, db] of [[' 123456 ', '123456'], ['123456', ' 123456 '], [' 123456(2) ', '123456(2)']]) {
    test(`Trim comparison blocks ${JSON.stringify(value)} against ${JSON.stringify(db)}`, async () => {
        const f = fixture({ rows: [existing(db)] })
        assert.equal((await f.save({ kar_noidentitas: value })).statusCode, 409)
        assert.deepEqual(writes(f), [])
    })
}
test('PUT unchanged legacy duplicate permits other field edits without lock or duplicate check', async () => {
    const f = fixture({ current: existing('123456', 1, '001'), rows: [existing('123456')] })
    assert.equal((await f.save({ kar_noidentitas: ' 123456 ', kar_nama: 'Nama Diubah' }, 'PUT')).statusCode, 200)
    assert.equal(identityQueries(f).length, 0)
    assert.ok(!f.calls.some(c => c.sql.includes('GET_LOCK')))
    assert.ok(writes(f).some(c => c.sql.startsWith('UPDATE tkaryawan SET')))
})
for (const aktif of [1, 0]) test(`PUT changed identity rejects another employee with status ${aktif}`, async () => {
    const f = fixture({ current: existing('old', 1, '001'), rows: [existing('123456', aktif)] })
    assert.equal((await f.save({ kar_noidentitas: '123456' }, 'PUT')).statusCode, 409)
    assert.deepEqual(writes(f), [])
    assert.match(identityQueries(f)[0].sql, /kar_Nik <> \?/)
    assert.deepEqual(identityQueries(f)[0].params, ['123456', '001'])
})
test('PUT new unique identity succeeds and excludes current record', async () => {
    const f = fixture({ current: existing('old', 1, '001'), rows: [existing('new', 1, '001')] })
    assert.equal((await f.save({ kar_noidentitas: 'new' }, 'PUT')).statusCode, 200)
    assert.deepEqual(identityQueries(f)[0].params, ['new', '001'])
})
test('PUT cannot change internal NIK', async () => {
    const f = fixture({ current: existing('123456', 1, '001') })
    assert.equal((await f.save({ kar_Nik: '999', kar_noidentitas: '123456' }, 'PUT')).statusCode, 400)
    assert.deepEqual(writes(f), [])
})
test('NULL/empty identities skip checks and lock on both POST and PUT', async () => {
    for (const method of ['POST', 'PUT']) for (const value of [null, '', '   ', undefined]) {
        const f = fixture({ current: method === 'PUT' ? existing('old', 1, '001') : undefined, rows: [existing(null)] })
        assert.equal((await f.save({ kar_noidentitas: value }, method)).statusCode, method === 'POST' ? 201 : 200)
        assert.equal(identityQueries(f).length, 0)
        assert.ok(!f.calls.some(c => c.sql.includes('GET_LOCK')))
    }
})
test('Pre-check returns active/nonactive duplicates without writes; suffix remains distinct', async () => {
    const f = fixture({ rows: [existing('123456', 1), existing('123456', 0, '008'), existing('123456(2)')] })
    assert.equal((await f.check(' 123456 ')).length, 2)
    assert.equal((await f.check('1234562')).length, 0)
    assert.deepEqual(writes(f), [])
})
test('Pre-check unchanged legacy identity is allowed; changed identity excludes self', async () => {
    const f = fixture({ current: existing('123456', 1, '001'), rows: [existing('123456'), existing('new', 0), existing('new', 1, '001')] })
    assert.equal((await f.check(' 123456 ', '001')).length, 0)
    assert.equal(identityQueries(f).length, 0)
    assert.equal((await f.check('new', '001')).length, 1)
    assert.deepEqual(identityQueries(f)[0].params, ['new', '001'])
})
test('Pre-check empty values does not query duplicates', async () => {
    const f = fixture()
    for (const value of [null, '', '   ']) assert.equal((await f.check(value)).length, 0)
    assert.equal(f.calls.length, 0)
})
test('Lock failure stops before duplicate check/writes and never releases an unowned lock', async () => {
    for (const kunci of [0, null]) {
        const f = fixture({ kunci }), res = await f.save({ kar_noidentitas: '123456' })
        assert.equal(res.statusCode, 503)
        assert.match(res.body.message, /coba simpan lagi/)
        assert.equal(identityQueries(f).length, 0)
        assert.deepEqual(writes(f), [])
        assert.ok(!f.calls.some(c => c.sql.includes('RELEASE_LOCK')))
    }
})
test('Lock spans check and insert and is released on success or write failure', async () => {
    const f = fixture()
    await f.save({ kar_noidentitas: '123456' })
    const order = f.calls.map(c => c.sql.includes('GET_LOCK') ? 'lock' : c.sql.includes('BINARY TRIM') ? 'check' : c.sql.startsWith('INSERT INTO tkaryawan (') ? 'insert' : c.sql.includes('RELEASE_LOCK') ? 'unlock' : null).filter(Boolean)
    assert.deepEqual(order, ['lock', 'check', 'insert', 'unlock'])
    const broken = fixture({ failWrite: true })
    await assert.rejects(() => broken.save({ kar_noidentitas: '123456' }), /write failed/)
    assert.ok(broken.calls.some(c => c.sql.includes('RELEASE_LOCK')))
    assert.equal(broken.calls.at(-1).sql, 'release connection')
})
test('Concurrent cooperating saves serialize: first succeeds, second sees duplicate', async () => {
    const shared = { rows: [], locked: false, waiters: [] }
    const a = fixture({ shared }), b = fixture({ shared })
    const results = await Promise.all([a.save({ kar_noidentitas: '123456' }), b.save({ kar_noidentitas: '123456' })])
    assert.deepEqual(results.map(r => r.statusCode).sort(), [201, 409])
    assert.equal(shared.rows.length, 1)
    assert.equal(shared.locked, false)
})
