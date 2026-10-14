import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { success, error, paginated } from '../src/helpers/response.js'
import { applyAllColumnFilters, buildOrderBy } from '../src/helpers/browse.js'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const response = () => ({ statusCode: 200, headers: {}, set(key, value) { this.headers[key] = value; return this }, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } })
function fixture() {
    const calls = [], rows = []
    let clock = 0
    const pool = { async query(sql, params = []) {
        calls.push({ sql, params: [...params] })
        if (sql.startsWith('INSERT')) {
            if (rows.some(row => row.sb_username.toLowerCase() === params[0].toLowerCase())) throw { code: 'ER_DUP_ENTRY' }
            const row = { sb_id: rows.length + 1, sb_username: params[0], sb_password: params[1], sb_updated_by: params[2], sb_updated_at: `database-time-${++clock}` }
            rows.push(row)
            return [{ insertId: row.sb_id }]
        }
        if (sql.startsWith('UPDATE')) {
            if (rows.some(row => String(row.sb_id) !== String(params[3]) && row.sb_username.toLowerCase() === params[0].toLowerCase())) throw { code: 'ER_DUP_ENTRY' }
            const row = rows.find(row => String(row.sb_id) === String(params[3]))
            Object.assign(row, { sb_username: params[0], sb_password: params[1], sb_updated_by: params[2], sb_updated_at: `database-time-${++clock}` })
            return [{ affectedRows: 1 }]
        }
        if (sql.startsWith('DELETE')) {
            const index = rows.findIndex(row => String(row.sb_id) === String(params[0]))
            if (index < 0) return [{ affectedRows: 0 }]
            rows.splice(index, 1)
            return [{ affectedRows: 1 }]
        }
        let found = [...rows]
        if (sql.includes('WHERE sb_id = ?')) found = found.filter(row => String(row.sb_id) === String(params[0]))
        if (sql.includes('sb_username LIKE ?')) {
            const search = params[0].slice(1, -1).toLowerCase()
            found = found.filter(row => row.sb_username.toLowerCase().includes(search) || row.sb_updated_by.toLowerCase().includes(search))
        }
        if (sql.includes('COUNT(*)')) return [[{ total: found.length }]]
        if (sql.includes('ORDER BY sb_updated_at DESC')) found.reverse()
        if (sql.includes('LIMIT ? OFFSET ?')) found = found.slice(params.at(-1), params.at(-1) + params.at(-2))
        return [found.map(row => ({ ...row }))]
    } }
    const scope = { pool, success, error, paginated, applyAllColumnFilters, buildOrderBy }
    vm.createContext(scope)
    vm.runInContext(read('../src/controllers/master/sandiBpjsController.js').replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '') +
        '\nglobalThis.handlers = { noStoreSandiBpjs, getSandiBpjsList, getSandiBpjs, createSandiBpjs, updateSandiBpjs, deleteSandiBpjs };', scope)
    const req = (body = {}, id = '1', user = 'TESTER') => ({ body, params: { id }, query: {}, user: { user } })
    return { ...scope.handlers, calls, rows, req }
}

for (const action of ['view', 'insert', 'edit', 'delete']) test(`Permission ${action}: user tanpa row ditolak`, async () => {
    const scope = { pool: { query: async () => [[]] }, Date, Map }
    vm.createContext(scope)
    vm.runInContext(read('../src/middleware/permission.js').replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '') + '\nglobalThis.guard = wajibHak;', scope)
    const res = response()
    let passed = false
    await scope.guard('frmSandiBPJS', action)({ user: { user: 'NO_RIGHTS' } }, res, () => { passed = true })
    assert.equal(passed, false)
    assert.equal(res.statusCode, 403)
})

test('Semua route memakai frmSandiBPJS dan no-store, tanpa options/export publik', () => {
    const source = read('../src/routes/masterRoutes.js')
    for (const [method, path, action] of [['get', '/', null], ['get', '/:id', null], ['post', '/', 'insert'], ['put', '/:id', 'edit'], ['delete', '/:id', 'delete']]) {
        assert.ok(source.includes(`sandiBpjs.${method}('${path}', wajibHak('frmSandiBPJS'${action ? `, '${action}'` : ''})`))
    }
    assert.match(source, /sandiBpjs.use\(noStoreSandiBpjs\)/)
    const res = response(); fixture().noStoreSandiBpjs({}, res, () => {})
    assert.equal(res.headers['Cache-Control'], 'no-store')
})

test('Row View tidak otomatis memberi Insert/Edit/Delete; Y mengikuti database tanpa daftar user', async () => {
    const scope = { pool: { query: async () => [[{ men_nama: 'frmSandiBPJS', hak_men_insert: '0', hak_men_edit: 'Y', hak_men_delete: '0' }]] }, Date, Map }
    vm.createContext(scope)
    vm.runInContext(read('../src/middleware/permission.js').replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '') + '\nglobalThis.guard = wajibHak;', scope)
    for (const action of ['view', 'insert', 'edit', 'delete']) {
        let passed = false
        const res = response()
        await scope.guard('frmSandiBPJS', action)({ user: { user: 'ARBITRARY_ACCOUNT' } }, res, () => { passed = true })
        assert.equal(passed, action === 'view' || action === 'edit')
        if (!passed) assert.equal(res.statusCode, 403)
    }
})

test('Tambah mempertahankan password persis, user JWT mengalahkan body, waktu dari DB', async () => {
    const f = fixture(), res = response(), password = '  AbC!@# xYz  '
    await f.createSandiBpjs(f.req({ sb_username: 'MyUser', sb_password: password, sb_updated_by: 'FORGED', sb_updated_at: 'forged' }), res)
    assert.equal(res.statusCode, 201)
    assert.equal(f.rows[0].sb_password, password)
    assert.equal(f.rows[0].sb_username, 'MyUser')
    assert.equal(f.rows[0].sb_updated_by, 'TESTER')
    assert.equal(f.rows[0].sb_updated_at, 'database-time-1')
    assert.ok(!f.calls[0].sql.includes('sb_updated_at'))
    assert.ok(!JSON.stringify(res.body).includes(password))
})

test('Duplicate username POST/PUT ditolak tanpa bocor password', async () => {
    const f = fixture()
    await f.createSandiBpjs(f.req({ sb_username: 'One', sb_password: 'Secret' }), response())
    await f.createSandiBpjs(f.req({ sb_username: 'Two', sb_password: 'Other' }), response())
    for (const method of ['createSandiBpjs', 'updateSandiBpjs']) {
        const res = response()
        await f[method](f.req({ sb_username: 'One', sb_password: 'Private' }, '2'), res)
        assert.equal(res.statusCode, 409)
        assert.equal(res.body.message, 'Username BPJS sudah terdaftar.')
        assert.ok(!JSON.stringify(res.body).includes('Private'))
    }
})

test('Validasi required/max, ID, record tidak ada dan autentikasi', async () => {
    const f = fixture()
    for (const body of [{}, { sb_username: ' ', sb_password: 'x' }, { sb_username: 'x'.repeat(101), sb_password: 'x' }, { sb_username: 'x', sb_password: '' }, { sb_username: 'x', sb_password: 'x'.repeat(256) }, { sb_username: [], sb_password: 'x' }]) {
        const res = response(); await f.createSandiBpjs(f.req(body), res); assert.equal(res.statusCode, 400)
    }
    for (const method of ['getSandiBpjs', 'updateSandiBpjs', 'deleteSandiBpjs']) {
        for (const id of ['0', '-1', '1 OR 1', '4294967296']) {
            const res = response(); await f[method](f.req({ sb_username: 'ok', sb_password: 'ok' }, id), res); assert.equal(res.statusCode, 400)
        }
        const res = response(); await f[method](f.req({ sb_username: 'ok', sb_password: 'ok' }, '99'), res); assert.equal(res.statusCode, 404)
    }
    const res = response(); await f.createSandiBpjs({ body: {} }, res); assert.equal(res.statusCode, 401)
})

test('Browse: plaintext, search username/oleh, pagination dan sorting/filter whitelist', async () => {
    const f = fixture()
    await f.createSandiBpjs(f.req({ sb_username: 'BPJSAccount', sb_password: ' SecretOnly ' }, '1', 'EDITOR'), response())
    for (const search of ['BPJSAccount', 'EDITOR']) {
        const res = response(); await f.getSandiBpjsList({ query: { search } }, res)
        assert.equal(res.body.data.length, 1)
        assert.equal(res.body.data[0].sb_password, ' SecretOnly ')
        assert.ok(f.calls.some(call => call.sql.includes('sb_username LIKE ? OR sb_updated_by LIKE ?')))
    }
    const res = response(); await f.getSandiBpjsList({ query: { search: 'SecretOnly' } }, res)
    assert.equal(res.body.data.length, 0)
    assert.ok(f.calls.at(-1).sql.includes('ORDER BY sb_updated_at DESC, sb_id DESC'))
    assert.ok(f.calls.at(-1).sql.includes('LIMIT ? OFFSET ?'))
    await f.getSandiBpjsList({ query: { sort_by: 'sb_username', sort_dir: 'asc', filterSet_sb_updated_by: ['EDITOR'] } }, response())
    assert.match(f.calls.at(-1).sql, /sb_updated_by IN \(\?\).*ORDER BY sb_username asc/)
    for (const query of [{ distinct: 'sb_password' }, { export: 'xlsx' }]) {
        const result = response(); await f.getSandiBpjsList({ query }, result); assert.equal(result.statusCode, 400)
    }
})

test('Edit mengganti username/password/oleh/waktu; Delete berhasil dan 404 jika diulang', async () => {
    const f = fixture()
    await f.createSandiBpjs(f.req({ sb_username: 'Old', sb_password: 'Old' }), response())
    const edited = response()
    await f.updateSandiBpjs(f.req({ sb_username: 'New', sb_password: '  nEw!  ', sb_updated_by: 'FAKE' }, '1', 'SECOND'), edited)
    assert.equal(edited.statusCode, 200)
    assert.equal(f.rows[0].sb_password, '  nEw!  ')
    assert.equal(f.rows[0].sb_updated_by, 'SECOND')
    assert.equal(f.rows[0].sb_updated_at, 'database-time-2')
    assert.match(f.calls.at(-1).sql, /sb_updated_at = CURRENT_TIMESTAMP/)
    const detail = response(); await f.getSandiBpjs(f.req(), detail); assert.equal(detail.body.data.sb_username, 'New')
    const removed = response(); await f.deleteSandiBpjs(f.req(), removed); assert.equal(removed.statusCode, 200); assert.equal(f.rows.length, 0)
    const missing = response(); await f.deleteSandiBpjs(f.req(), missing); assert.equal(missing.statusCode, 404)
})

test('Error database tidak diteruskan sebagai SQL/log credential', async () => {
    const source = read('../src/controllers/master/sandiBpjsController.js')
    assert.doesNotMatch(source, /console\.|next\(err|err\.message|err\.sql/)
    assert.doesNotMatch(source, /CREATE TABLE|ALTER TABLE|UPDATE tuser|INSERT INTO tmenu|INSERT INTO thakuser/)
})
