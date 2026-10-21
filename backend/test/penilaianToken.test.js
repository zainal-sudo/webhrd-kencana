import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { createPenilaianTokenService, formTypeForJabatan, hashAccessToken, INVALID_LINK_MESSAGE } from '../src/services/penilaianTokenService.js'

function fixture() {
    const sqlite = new DatabaseSync(':memory:')
    sqlite.exec(`CREATE TABLE tkaryawan (kar_Nik TEXT PRIMARY KEY, kar_nama TEXT, kar_jab_kode TEXT, kar_bagian TEXT, kar_pab_kode TEXT, kar_status_kerja INTEGER, kar_status_aktif INTEGER, kar_tglpkwt2 TEXT, kar_ktp TEXT);
        CREATE TABLE tjabatan (jab_kode TEXT, jab_nama TEXT);
        CREATE TABLE tstatuskaryawan (sk_id INTEGER, sk_keterangan TEXT);
        CREATE TABLE web_penilaian_access_token (id INTEGER PRIMARY KEY, token_hash TEXT UNIQUE, kar_nik TEXT, form_type TEXT, created_by TEXT, created_at TEXT, expires_at TEXT, revoked_at TEXT);
        INSERT INTO tjabatan VALUES ('OPR','OPERATOR'),('STF','STAF'),('L','LEADER');
        INSERT INTO tstatuskaryawan VALUES (2,'PKWT 1');
        INSERT INTO tkaryawan VALUES ('001','Budi','OPR','JAHIT A','P04',2,1,'2026-11-01','RAHASIA'),('002','Sinta','L','PPIC','HO',2,1,'2026-11-02','RAHASIA'),('003','Nonaktif','STF','QC','P04',2,0,'2026-11-01','RAHASIA'),('004','Jauh','STF','QC','P04',2,1,'2027-01-01','RAHASIA');`)
    let time = new Date('2026-10-21T03:00:00Z')
    const queries = []
    const db = { async query(sql, params = []) {
        queries.push({ sql, params })
        const converted = sql.replace(/DATE_ADD\(CURDATE\(\), INTERVAL 2 MONTH\)/g, "'2026-12-21'")
            .replace(/UTC_TIMESTAMP\(\)/g, `'${time.toISOString().slice(0, 19).replace('T', ' ')}'`)
            .replace(/DATE_FORMAT\(t\.expires_at, '%Y-%m-%dT%H:%i:%sZ'\)/g, "replace(t.expires_at, ' ', 'T') || 'Z'")
        const stmt = sqlite.prepare(converted)
        if (/^\s*SELECT/i.test(sql)) return [stmt.all(...params)]
        return [stmt.run(...params)]
    } }
    return { sqlite, db, queries, service: createPenilaianTokenService(db, { now: () => time }), setTime: (date) => { time = new Date(date) } }
}

test('Token 256-bit di-hash, terikat karyawan/HR/tipe form, expiry default 7 hari, reusable', async () => {
    const f = fixture()
    try {
        const link = await f.service.issue('001', 'HR01')
        const token = new URL(link.path, 'https://hrd.example').searchParams.get('t')
        assert.match(token, /^[a-f0-9]{64}$/)
        assert.equal(link.formType, 'tanpa-bawahan')
        assert.equal(link.expiresAt, '2026-10-28T03:00:00.000Z')
        assert.doesNotMatch(link.path, /nik=/)
        assert.equal(new URL(link.path, 'https://hrd.example').pathname, '/penilaian/tanpa-bawahan')
        const stored = f.sqlite.prepare('SELECT * FROM web_penilaian_access_token').get()
        assert.equal(stored.token_hash, hashAccessToken(token))
        assert.notEqual(stored.token_hash, token)
        assert.equal(stored.kar_nik, '001')
        assert.equal(stored.created_by, 'HR01')
        assert.equal(stored.created_at, '2026-10-21 03:00:00')
        const data = await f.service.access('tanpa-bawahan', token)
        assert.deepEqual(data.employee, { nik: '001', nama: 'Budi', jabatan: 'OPERATOR', bagian: 'JAHIT A', pabrik: 'P04', statusKerja: 'PKWT 1' })
        assert.equal(JSON.stringify(data).includes('RAHASIA'), false)
        assert.deepEqual(await f.service.access('tanpa-bawahan', token), data)
        const second = await f.service.issue('001', 'HR02')
        assert.notEqual(second.path, link.path)
        assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM web_penilaian_access_token').get().n, 2)
    } finally { f.sqlite.close() }
})

test('Token salah tipe, expired tepat batas, revoked, tidak dikenal, dan karyawan nonaktif ditolak', async () => {
    const f = fixture()
    const denied = (promise) => assert.rejects(promise, (error) => error.status === 404 && error.message === INVALID_LINK_MESSAGE)
    try {
        const link = await f.service.issue('002', 'HR01')
        const token = new URL(link.path, 'https://hrd.example').searchParams.get('t')
        assert.equal(link.formType, 'dengan-bawahan')
        await denied(f.service.access('tanpa-bawahan', token))
        await denied(f.service.access('dengan-bawahan', '0'.repeat(64)))
        f.setTime(link.expiresAt)
        await denied(f.service.access('dengan-bawahan', token))
        f.setTime('2026-10-21T03:00:00Z')
        f.sqlite.exec("UPDATE web_penilaian_access_token SET revoked_at = '2026-10-21 04:00:00'")
        await denied(f.service.access('dengan-bawahan', token))
        f.sqlite.exec('UPDATE web_penilaian_access_token SET revoked_at = NULL; UPDATE tkaryawan SET kar_status_aktif = 0')
        await denied(f.service.access('dengan-bawahan', token))
        const count = f.queries.length
        for (const bad of [null, [], { token }, "' OR 1=1 --", 'a'.repeat(1000)]) await denied(f.service.access('dengan-bawahan', bad))
        await denied(f.service.access('lainnya', token))
        assert.equal(f.queries.length, count)
    } finally { f.sqlite.close() }
})

test('Pembuatan link menolak karyawan di luar scope dan memakai parameter SQL; TTL dapat dikonfigurasi', async () => {
    const f = fixture()
    try {
        for (const nik of ['003', '004', 'missing', "' OR 1=1 --"]) await assert.rejects(f.service.issue(nik, 'HR01'), { status: 404 })
        await assert.rejects(f.service.issue('001', ''), { status: 401 })
        assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM web_penilaian_access_token').get().n, 0)
        const service = createPenilaianTokenService(f.db, { now: () => new Date('2026-10-21T03:00:00Z'), ttlDays: 2 })
        assert.equal((await service.issue('001', 'HR01')).expiresAt, '2026-10-23T03:00:00.000Z')
        assert.throws(() => createPenilaianTokenService(f.db, { ttlDays: 0 }))
        for (const [jabatan, expected] of [['operator', 'tanpa-bawahan'], [' STAF ', 'tanpa-bawahan'], ['KOORDINATOR', 'dengan-bawahan'], [null, 'dengan-bawahan']]) assert.equal(formTypeForJabatan(jabatan), expected)
    } finally { f.sqlite.close() }
})

test('Public route khusus, migration InnoDB manual, dan employee master tetap di belakang auth', () => {
    const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8')
    const routes = read('../src/routes.js')
    assert.ok(routes.indexOf("r.use('/public/penilaian'") < routes.indexOf('r.use(verifyToken)'))
    assert.ok(routes.indexOf("r.use('/master'") > routes.indexOf('r.use(verifyToken)'))
    assert.ok(routes.indexOf("r.use('/dashboard'") > routes.indexOf('r.use(verifyToken)'))
    const publicRoutes = read('../src/routes/publicPenilaianRoutes.js')
    assert.equal((publicRoutes.match(/r\.(get|post|put|delete)\(/g) || []).length, 1)
    assert.match(publicRoutes, /r.post\('\/:formType\/akses'/)
    assert.doesNotMatch(publicRoutes, /search|karyawan|master/)
    const migration = read('../migrations/20261021_penilaian_access_token.sql')
    assert.match(migration, /ENGINE=InnoDB/)
    assert.match(migration, /UNIQUE KEY uk_penilaian_token_hash/)
    assert.doesNotMatch(migration.replace(/^--.*$/gm, ''), /ALTER TABLE|INSERT INTO|UPDATE tkaryawan|FOREIGN KEY/i)
})
