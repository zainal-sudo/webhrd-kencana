import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { DatabaseSync } from 'node:sqlite'
import { success, error, paginated } from '../src/helpers/response.js'
import { applyAllColumnFilters, buildOrderBy } from '../src/helpers/browse.js'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const response = () => ({ statusCode: 200, headers: {}, set(key, value) { this.headers[key] = value; return this }, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } })
function fixture() {
    const calls = [], rows = []
    let clock = 0, nextId = 0
    const pool = { async query(sql, params = []) {
        calls.push({ sql, params: [...params] })
        if (sql.startsWith('INSERT')) {
            const row = { sb_id: ++nextId, sb_judul: params[0], sb_username: params[1], sb_password: params[2], sb_updated_by: params[3], sb_updated_at: `database-time-${++clock}` }
            rows.push(row)
            return [{ insertId: row.sb_id }]
        }
        if (sql.startsWith('UPDATE')) {
            const row = rows.find(row => String(row.sb_id) === String(params[4]))
            Object.assign(row, { sb_judul: params[0], sb_username: params[1], sb_password: params[2], sb_updated_by: params[3], sb_updated_at: `database-time-${++clock}` })
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
            found = found.filter(row => (row.sb_judul || '').toLowerCase().includes(search) || row.sb_username.toLowerCase().includes(search) || row.sb_updated_by.toLowerCase().includes(search))
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

test('Duplicate username/judul POST/PUT berhasil sebagai record berbeda', async () => {
    const f = fixture(), a = response(), b = response()
    const body = { sb_judul: 'Portal', sb_username: 'test', sb_password: 'Fictional' }
    await f.createSandiBpjs(f.req(body), a)
    await f.createSandiBpjs(f.req(body), b)
    assert.equal(a.statusCode, 201)
    assert.equal(b.statusCode, 201)
    assert.notEqual(a.body.data.sb_id, b.body.data.sb_id)
    assert.equal(f.rows.length, 2)
    const edited = response()
    await f.updateSandiBpjs(f.req({ ...body, sb_password: 'Changed' }, String(b.body.data.sb_id)), edited)
    assert.equal(edited.statusCode, 200)
    assert.equal(f.rows[0].sb_password, 'Fictional')
    assert.equal(f.rows[1].sb_password, 'Changed')
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

test('Judul tersimpan, dapat dicari/filter/sort, diedit dan dibaca kembali', async () => {
    const f = fixture()
    const created = response()
    await f.createSandiBpjs(f.req({ sb_judul: 'Portal Karyawan', sb_username: 'User', sb_password: 'Secret' }), created)
    assert.equal(created.statusCode, 201)
    assert.equal(f.rows[0].sb_judul, 'Portal Karyawan')
    const list = response()
    await f.getSandiBpjsList({ query: { search: 'Portal' } }, list)
    assert.equal(list.body.data[0].sb_judul, 'Portal Karyawan')
    assert.match(f.calls.at(-1).sql, /SELECT sb_id, sb_judul/)
    await f.getSandiBpjsList({ query: { sort_by: 'sb_judul', sort_dir: 'asc', filterSet_sb_judul: ['Portal Karyawan'] } }, response())
    assert.match(f.calls.at(-1).sql, /sb_judul IN \(\?\).*ORDER BY sb_judul asc/)
    await f.getSandiBpjsList({ query: { distinct: 'sb_judul' } }, response())
    assert.match(f.calls.at(-1).sql, /SELECT DISTINCT sb_judul/)
    await f.updateSandiBpjs(f.req({ sb_judul: 'Portal Baru', sb_username: 'User', sb_password: 'Secret' }), response())
    const detail = response()
    await f.getSandiBpjs(f.req(), detail)
    assert.equal(detail.body.data.sb_judul, 'Portal Baru')
    for (const sb_judul of [123, [], 'x'.repeat(256)]) {
        const result = response()
        await f.createSandiBpjs(f.req({ sb_judul, sb_username: 'New', sb_password: 'Secret' }), result)
        assert.equal(result.statusCode, 400)
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


test('Real SQL non-unique schema: insert/edit/delete/search/filter/pagination keep duplicate records independent', async () => {
    const db = new DatabaseSync(':memory:')
    db.exec(`CREATE TABLE tsandi_bpjs (
        sb_id INTEGER PRIMARY KEY AUTOINCREMENT, sb_judul TEXT, sb_username TEXT NOT NULL,
        sb_password TEXT NOT NULL, sb_updated_by TEXT, sb_updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    ); CREATE INDEX idx_sandi_bpjs_username ON tsandi_bpjs (sb_username);`)
    db.function('OCTET_LENGTH', value => value == null ? null : Buffer.byteLength(String(value)))
    const calls = []
    const pool = { async query(sql, params = []) {
        calls.push({ sql, params: Array.from(params) })
        const statement = db.prepare(sql)
        if (sql.startsWith('SELECT')) return [statement.all(...params)]
        const result = statement.run(...params)
        return [{ insertId: Number(result.lastInsertRowid), affectedRows: Number(result.changes) }]
    } }
    const scope = { pool, success, error, paginated, applyAllColumnFilters, buildOrderBy }
    vm.createContext(scope)
    vm.runInContext(read('../src/controllers/master/sandiBpjsController.js').replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '') +
        '\nglobalThis.handlers = { getSandiBpjsList, getSandiBpjs, createSandiBpjs, updateSandiBpjs, deleteSandiBpjs };', scope)
    const handlers = scope.handlers
    const req = (body = {}, id = '') => ({ body, params: { id: String(id) }, query: {}, user: { user: 'TESTER' } })
    const create = async (username = 'test') => {
        const res = response()
        await handlers.createSandiBpjs(req({ sb_judul: 'Same title', sb_username: username, sb_password: 'Fictional' }), res)
        assert.equal(res.statusCode, 201)
        return res.body.data.sb_id
    }
    const detail = async id => {
        const res = response(); await handlers.getSandiBpjs(req({}, id), res)
        assert.equal(res.statusCode, 200); return res.body.data
    }
    const list = async query => {
        const res = response(); await handlers.getSandiBpjsList({ query }, res)
        assert.equal(res.statusCode, 200); return res.body
    }
    try {
        const a = await create(), b = await create(), c = await create('other')
        assert.notEqual(a, b)
        const originalA = { ...await detail(a) }
        const updated = response()
        await handlers.updateSandiBpjs(req({ sb_judul: 'Same title', sb_username: 'test', sb_password: 'Changed' }, c), updated)
        assert.equal(updated.statusCode, 200)
        assert.deepEqual({ ...await detail(a) }, originalA)
        assert.equal((await detail(c)).sb_username, 'test')
        assert.equal((await detail(b)).sb_password, 'Fictional')
        for (const query of [{}, { search: 'test' }, { filterSet_sb_username: ['test'] }]) {
            const result = await list(query)
            assert.equal(result.pagination.total, 3)
            assert.deepEqual(result.data.map(row => row.sb_id).sort((x,y) => x-y), [a,b,c])
        }
        for (const sort_dir of ['asc', 'desc']) {
            const ids = []
            for (const page of [1, 2, 3]) {
                const result = await list({ search: 'test', sort_by: 'sb_username', sort_dir, page, per_page: 1 })
                assert.equal(result.pagination.total, 3)
                ids.push(...result.data.map(row => row.sb_id))
                assert.match(calls.at(-1).sql, /ORDER BY sb_username (asc|desc), sb_id ASC LIMIT/)
            }
            assert.deepEqual(ids, [a,b,c])
        }
        const distinct = await list({ distinct: 'sb_username' })
        assert.deepEqual(Array.from(distinct.data), ['test'])
        const removed = response(); await handlers.deleteSandiBpjs(req({}, b), removed)
        assert.equal(removed.statusCode, 200)
        assert.deepEqual({ ...await detail(a) }, originalA)
        assert.equal((await detail(c)).sb_password, 'Changed')
        const remaining = await list({ search: 'test' })
        assert.equal(remaining.pagination.total, 2)
        assert.deepEqual(remaining.data.map(row => row.sb_id).sort((x,y)=>x-y), [a,c])
        const d = await create()
        assert.ok(d > c, 'Deleted IDs must not be reused')
        assert.doesNotMatch(calls.map(call => call.sql).join('\n'), /ON DUPLICATE|REPLACE INTO|WHERE sb_username = \?/)
    } finally { db.close() }
})

test('Manual migration replaces only the verified username index; production errors stay generic', async () => {
    const migration = read('../migrations/20261020_sandi_username_non_unique.sql')
    assert.match(migration, /ALTER TABLE tsandi_bpjs\s+DROP INDEX uk_sandi_bpjs_username,\s+ADD INDEX idx_sandi_bpjs_username \(sb_username\)/)
    assert.doesNotMatch(migration, /DROP TABLE|DROP PRIMARY|ADD UNIQUE|DELETE FROM|UPDATE tsandi_bpjs/i)
    const source = read('../src/controllers/master/sandiBpjsController.js')
    assert.doesNotMatch(source, /Username sudah terdaftar|ER_DUP_ENTRY|ON DUPLICATE|REPLACE INTO/)
    const scope = { error }
    vm.createContext(scope)
    const fn = source.match(/function writeError\(res\) \{[\s\S]*?\n\}/)[0]
    vm.runInContext(fn + '\nglobalThis.fail = writeError;', scope)
    const res = response()
    scope.fail(res, { code: 'ER_DUP_ENTRY', message: 'FictionalSecret', sql: 'private SQL' })
    assert.equal(res.statusCode, 500)
    assert.equal(res.body.message, 'Gagal menyimpan akun.')
})
