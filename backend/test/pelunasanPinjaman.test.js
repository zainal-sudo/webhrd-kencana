import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { prosesPelunasan, queryPelunasan, periodePelunasan } from '../src/helpers/pelunasanPinjaman.js'
import { kalkulasiPinjaman, editPinjaman, hapusPinjaman, revisionPinjaman, tambahPinjaman } from '../src/helpers/pinjaman.js'

// Only in-memory SQL. GET_LOCK and MySQL-specific number query are simulated.
function fixture() {
    const db = new DatabaseSync(':memory:')
    db.function('GREATEST', (a, b) => a == null ? null : Math.max(a, b))
    db.exec(`CREATE TABLE tpinjaman (nomor_pinjam TEXT PRIMARY KEY, nik TEXT, tanggal TEXT, pinjam REAL, bayar REAL,
        angsuran INTEGER, bank TEXT, norek TEXT, periode_potong1 TEXT, nilai_potong1 REAL,
        periode_potong2 TEXT, nilai_potong2 REAL, potong1_diproses_pada TEXT, potong2_diproses_pada TEXT);
        CREATE TABLE tkaryawan (kar_Nik TEXT PRIMARY KEY, kar_nama TEXT, kar_status_aktif INTEGER);
        INSERT INTO tkaryawan VALUES ('001','Riri',1), ('002','Budi',1);`)
    const add = (nomor = 'PJ.2610.0001', change = {}) => {
        const row = { nomor_pinjam: nomor, nik: '001', tanggal: '2026-10-09', pinjam: 400000, bayar: 0,
            angsuran: 2, bank: 'BSI', norek: '001234', periode_potong1: 'November 2026', nilai_potong1: 200000,
            periode_potong2: 'Desember 2026', nilai_potong2: 200000, potong1_diproses_pada: null, potong2_diproses_pada: null, ...change }
        db.prepare(`INSERT INTO tpinjaman (${Object.keys(row).join(',')}) VALUES (${Object.keys(row).map(() => '?').join(',')})`).run(...Object.values(row))
    }
    add()
    let tail = Promise.resolve()
    const calls = []
    const pool = { async getConnection() {
        let unlock
        return {
            async query(sql, params = []) {
                calls.push({ sql, params })
                if (sql.includes('GET_LOCK')) { const previous = tail; tail = new Promise(resolve => { unlock = resolve }); await previous; return [[{ acquired: 1 }]] }
                if (sql.includes('RELEASE_LOCK')) { unlock(); return [[{ released: 1 }]] }
                if (sql.includes('MAX(CAST(RIGHT')) return [[{ urut: 2 }]]
                const stmt = db.prepare(sql.replace(/ FOR UPDATE$/, ''))
                if (/^\s*SELECT/.test(sql)) return [stmt.all(...params)]
                return [{ affectedRows: stmt.run(...params).changes }]
            },
            async beginTransaction() { db.exec('BEGIN') }, async commit() { db.exec('COMMIT') },
            async rollback() { db.exec('ROLLBACK') }, release() {}, destroy() {},
        }
    } }
    const row = (nomor = 'PJ.2610.0001') => db.prepare('SELECT * FROM tpinjaman WHERE nomor_pinjam = ?').get(nomor)
    const display = () => { const r = row(); return { Nomor: r.nomor_pinjam, Nik: r.nik, Tanggal: r.tanggal,
        Pinjam: r.pinjam, Bayar: r.bayar, Cicilan: r.angsuran, Bank: r.bank, Norek: r.norek,
        ...Object.fromEntries(Object.entries(r).filter(([key]) => key.startsWith('periode_') || key.startsWith('nilai_') || key.startsWith('potong'))) } }
    const editBody = () => { const r = display(); return { nik: r.Nik, tanggal: r.Tanggal, pinjam: r.Pinjam,
        angsuran: r.Cicilan, bank: r.Bank, norek: r.Norek, revision: revisionPinjaman(r) } }
    const outstanding = () => db.prepare('SELECT COALESCE(SUM(GREATEST(pinjam - bayar,0)),0) AS saldo FROM tpinjaman').get().saldo
    return { db, pool, row, display, editBody, outstanding, add, calls, close: () => db.close() }
}
const payload = (bulan = 11, items = [{ nomor_pinjam: 'PJ.2610.0001', potongan_ke: 1 }]) => ({ bulan, tahun: 2026, items })

test('Period list uses stored slots, includes processed slots, excludes NULL/zero legacy; search and pagination', () => {
    const f = fixture()
    try {
        f.add('OTHER', { nik: '002', periode_potong1: 'Oktober 2026', periode_potong2: 'November 2026', potong2_diproses_pada: '2026-11-09 10:00:00' })
        f.add('LEGACY', { angsuran: 10, periode_potong1: null, periode_potong2: null, nilai_potong1: null, nilai_potong2: null })
        f.add('ZERO', { nilai_potong1: 0, nilai_potong2: null })
        const q = queryPelunasan({ bulan: 11, tahun: 2026, per_page: 25 })
        const rows = f.db.prepare(q.list).all(...q.params, 25, 0)
        assert.equal(rows.length, 2)
        assert.equal(rows[0].PotonganKe, 1)
        assert.equal(rows[0].DiprosesPada, null)
        assert.equal(rows[1].PotonganKe, 2)
        assert.ok(rows[1].DiprosesPada)
        const searched = queryPelunasan({ bulan: 11, tahun: 2026, search: 'Budi' })
        assert.equal(f.db.prepare(searched.count).get(...searched.params).c, 1)
        assert.equal(f.db.prepare(q.list).all(...q.params, 1, 1)[0].Nomor, 'OTHER')
    } finally { f.close() }
})
test('Two payments update paid amount, timestamps, status, outstanding and available ceiling', async () => {
    const f = fixture()
    try {
        const before = f.outstanding()
        const first = await prosesPelunasan(f.pool, { ...payload(), nominal: 1, items: [{ ...payload().items[0], nominal: 1 }] })
        assert.equal(first.total, 200000)
        assert.equal(f.row().bayar, 200000)
        assert.ok(f.row().potong1_diproses_pada)
        assert.equal(f.row().potong2_diproses_pada, null)
        assert.equal(kalkulasiPinjaman(f.display()).SisaBayar, 200000)
        assert.equal(before - f.outstanding(), 200000)
        assert.equal(30000000 - f.outstanding(), 29800000)
        await prosesPelunasan(f.pool, payload(12, [{ nomor_pinjam: 'PJ.2610.0001', potongan_ke: 2 }]))
        assert.equal(f.row().bayar, 400000)
        assert.ok(f.row().potong2_diproses_pada)
        assert.equal(kalkulasiPinjaman(f.display()).Status, 'Lunas')
        assert.equal(f.outstanding(), 0)
        assert.ok(f.calls.some(call => call.sql.includes('FOR UPDATE')))
    } finally { f.close() }
})
test('Second slot can be processed independently, first remains unprocessed', async () => {
    const f = fixture()
    try {
        await prosesPelunasan(f.pool, payload(12, [{ nomor_pinjam: 'PJ.2610.0001', potongan_ke: 2 }]))
        assert.equal(f.row().bayar, 200000)
        assert.equal(f.row().potong1_diproses_pada, null)
        assert.ok(f.row().potong2_diproses_pada)
    } finally { f.close() }
})
test('Concurrent duplicate requests add payment exactly once, repeated process conflicts', async () => {
    const f = fixture()
    try {
        const result = await Promise.allSettled([prosesPelunasan(f.pool, payload()), prosesPelunasan(f.pool, payload())])
        assert.equal(result.filter(r => r.status === 'fulfilled').length, 1)
        assert.equal(result.filter(r => r.status === 'rejected').length, 1)
        assert.equal(f.row().bayar, 200000)
        await assert.rejects(prosesPelunasan(f.pool, payload()), /sudah diproses/)
        assert.equal(f.row().bayar, 200000)
    } finally { f.close() }
})
for (const [change, body, message] of [
    [{}, payload(10), /periode tersimpan/], [{ nilai_potong1: null }, payload(), /tidak valid/],
    [{ nilai_potong1: 0 }, payload(), /tidak valid/], [{ bayar: null }, payload(), /tidak valid/],
    [{ bayar: 300000 }, payload(), /melebihi/],
    [{ periode_potong1: null }, payload(), /periode tersimpan/],
]) test(`Invalid/conflict ${JSON.stringify(change)} rejected without balance or marker changes`, async () => {
    const f = fixture()
    try {
        for (const [key, value] of Object.entries(change)) f.db.prepare(`UPDATE tpinjaman SET ${key} = ?`).run(value)
        const before = { ...f.row() }
        await assert.rejects(prosesPelunasan(f.pool, body), message)
        assert.deepEqual({ ...f.row() }, before)
    } finally { f.close() }
})
test('Batch conflict rolls back preceding valid update, duplicate/malformed/missing items rejected', async () => {
    const f = fixture()
    try {
        f.add('ZZZ', { potong1_diproses_pada: '2026-11-01 10:00:00', bayar: 200000 })
        await assert.rejects(prosesPelunasan(f.pool, payload(11, [...payload().items, { nomor_pinjam: 'ZZZ', potongan_ke: 1 }])), /ZZZ.*sudah diproses/)
        assert.equal(f.row().bayar, 0)
        assert.equal(f.row().potong1_diproses_pada, null)
        for (const items of [[], [...payload().items, ...payload().items], [{ nomor_pinjam: 'PJ.2610.0001', potongan_ke: 3 }], [{ nomor_pinjam: 'MISSING', potongan_ke: 1 }]]) {
            await assert.rejects(prosesPelunasan(f.pool, payload(11, items)))
        }
    } finally { f.close() }
})
test('Processed loans reject financial edit/delete, allow bank/account edit without clearing markers', async () => {
    const f = fixture()
    try {
        await prosesPelunasan(f.pool, payload())
        for (const change of [{ tanggal: '2026-12-09' }, { pinjam: 500000 }, { angsuran: 1 }]) {
            await assert.rejects(editPinjaman(f.pool, 'PJ.2610.0001', { ...f.editBody(), ...change }), /Jadwal pinjaman tidak dapat diubah/)
        }
        await assert.rejects(hapusPinjaman(f.pool, 'PJ.2610.0001', { revision: f.editBody().revision, konfirmasi: 'PJ.2610.0001' }), /tidak dapat dihapus/)
        const marker = f.row().potong1_diproses_pada
        await editPinjaman(f.pool, 'PJ.2610.0001', { ...f.editBody(), bank: 'CIMB', norek: '000987' })
        assert.equal(f.row().potong1_diproses_pada, marker)
        assert.equal(f.row().bayar, 200000)
    } finally { f.close() }
})
test('Payment frees ceiling for new loan under unchanged global validation', async () => {
    const f = fixture()
    try {
        f.add('OLD', { nik: 'old', pinjam: 29600000, bayar: 0, periode_potong1: null, periode_potong2: null })
        const loan = { nik: '002', tanggal: '2026-10-09', pinjam: 200000, angsuran: 1, bank: 'BSI', norek: '001' }
        await assert.rejects(tambahPinjaman(f.pool, loan), /plafon/)
        await prosesPelunasan(f.pool, payload())
        await tambahPinjaman(f.pool, loan)
        assert.equal(f.outstanding(), 30000000)
    } finally { f.close() }
})
test('Permission uses frmBayar View and Insert; missing Insert cannot call process handler', async () => {
    const routes = readFileSync(new URL('../src/routes/transaksiRoutes.js', import.meta.url), 'utf8')
    assert.match(routes, /r\.get\('\/pinjaman\/pelunasan', wajibHak\('frmBayar'\)/)
    assert.match(routes, /r\.post\('\/pinjaman\/pelunasan\/proses', wajibHak\('frmBayar', 'insert'\)/)
    const source = readFileSync(new URL('../src/middleware/permission.js', import.meta.url), 'utf8')
    const scope = { pool: { query: async () => [[{ men_nama: 'frmBayar', hak_men_insert: 'N', hak_men_edit: 'Y' }]] } }
    vm.createContext(scope)
    vm.runInContext(source.replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '') + '\nglobalThis.check = wajibHak;', scope)
    let proceeded = false, status = 0
    const res = { status(code) { status = code; return this }, json() {} }
    await scope.check('frmBayar')({ user: { user: 'hrd' } }, res, () => { proceeded = true })
    assert.equal(proceeded, true)
    proceeded = false
    await scope.check('frmBayar', 'insert')({ user: { user: 'hrd' } }, res, () => { proceeded = true })
    assert.equal(proceeded, false)
    assert.equal(status, 403)
})
test('Period validation rejects invalid month/year', () => {
    assert.equal(periodePelunasan(11, 2026), 'November 2026')
    for (const [b, t] of [[0, 2026], [13, 2026], [1, 0], [1.5, 2026], [1, 2026.5]]) assert.throws(() => periodePelunasan(b, t))
})

test('Outstanding audit: no SUM(bayar) or bayar > 0 active-loan rule; negative remaining clamps to zero', () => {
    for (const file of ['../src/helpers/pinjaman.js', '../src/controllers/transaksi/pinjamanController.js', '../src/helpers/pelunasanPinjaman.js']) {
        const source = readFileSync(new URL(file, import.meta.url), 'utf8')
        assert.ok(!/SUM\(\s*(?:CAST\(\s*)?(?:p\.)?bayar\b/.test(source))
        assert.ok(!/WHERE[^\n]*\bAND bayar > 0/.test(source))
    }
    assert.equal(kalkulasiPinjaman({ Pinjam: 400000, Bayar: 500000 }).SisaBayar, 0)
    assert.equal(kalkulasiPinjaman({ Pinjam: 400000, Bayar: 500000 }).Status, 'Lunas')
    assert.equal(kalkulasiPinjaman({ Pinjam: 400000, Bayar: null }).SisaBayar, null)
})
