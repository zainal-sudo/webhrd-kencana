import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { editPinjaman, hapusPinjaman, revisionPinjaman } from '../src/helpers/pinjaman.js'

// In-memory fixture only. Advisory lock is simulated; SQL UPDATE/DELETE is executed.
function fixture(balance = 150000, installments = 2) {
    const db = new DatabaseSync(':memory:')
    db.exec(`CREATE TABLE tpinjaman (nomor_pinjam TEXT PRIMARY KEY, nik TEXT, tanggal TEXT,
        pinjam REAL, bayar REAL, angsuran INTEGER, bank TEXT, norek TEXT,
        periode_potong1 TEXT, nilai_potong1 REAL, periode_potong2 TEXT, nilai_potong2 REAL,
        potong1_diproses_pada TEXT, potong2_diproses_pada TEXT);
        CREATE TABLE tkaryawan (kar_Nik TEXT PRIMARY KEY, kar_status_aktif INTEGER);`)
    db.prepare('INSERT INTO tpinjaman VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL)').run('PJ.2610.0001', '001', '2026-10-09', 400000, balance, installments, 'BSI', '001234')
    db.exec("INSERT INTO tkaryawan VALUES ('001', 1), ('002', 1), ('003', 0)")
    const calls = []
    let tail = Promise.resolve()
    const pool = { async getConnection() {
        let unlock
        return {
            async query(sql, params = []) {
                calls.push({ sql, params })
                if (sql.includes('GET_LOCK')) {
                    const previous = tail; tail = new Promise(resolve => { unlock = resolve });
                    await previous; return [[{ acquired: 1 }]]
                }
                if (sql.includes('RELEASE_LOCK')) { unlock(); return [[{ released: 1 }]] }
                const sqliteSQL = sql.replace(/ FOR UPDATE$/, '')
                const stmt = db.prepare(sqliteSQL)
                if (/^\s*SELECT/.test(sql)) return [stmt.all(...params)]
                const result = stmt.run(...params)
                return [{ affectedRows: result.changes }]
            },
            async beginTransaction() { db.exec('BEGIN') },
            async commit() { db.exec('COMMIT') },
            async rollback() { db.exec('ROLLBACK') },
            release() {}, destroy() {},
        }
    } }
    const read = () => db.prepare(`SELECT nomor_pinjam AS Nomor, nik AS Nik, tanggal AS Tanggal, pinjam AS Pinjam,
        bayar AS Bayar, angsuran AS Cicilan, bank AS Bank, norek AS Norek,
        periode_potong1, nilai_potong1, periode_potong2, nilai_potong2, potong1_diproses_pada, potong2_diproses_pada FROM tpinjaman WHERE nomor_pinjam = ?`).get('PJ.2610.0001')
    const payload = () => {
        const row = read()
        return { nik: row.Nik, tanggal: row.Tanggal, pinjam: row.Pinjam, angsuran: row.Cicilan,
            bank: row.Bank, norek: row.Norek, revision: revisionPinjaman(row) }
    }
    return { db, pool, calls, read, payload, close: () => db.close() }
}

test('Edit all requested fields preserves document number and amount already paid', async () => {
    const f = fixture()
    try {
        await editPinjaman(f.pool, 'PJ.2610.0001', { ...f.payload(), nik: '002', tanggal: '2026-11-25',
            pinjam: 500000, angsuran: 1, bank: 'CIMB', norek: '000987', bayar: 0, nomor_pinjam: 'FAKE' })
        const row = f.read()
        assert.equal(row.Nomor, 'PJ.2610.0001')
        assert.equal(row.Bayar, 150000)
        assert.equal(row.Nik, '002')
        assert.equal(row.Pinjam, 500000)
        assert.equal(row.Cicilan, 1)
        assert.equal(row.Norek, '000987')
        assert.ok(f.calls.some(c => c.sql.includes('FOR UPDATE')))
    } finally { f.close() }
})
test('Legacy 6/10 and NULL bank/account can remain unchanged while other fields are edited', async () => {
    for (const installments of [6, 10]) {
        const f = fixture(0, installments)
        try {
            f.db.exec('UPDATE tpinjaman SET bank = NULL, norek = NULL, pinjam = 600000')
            const saved = await editPinjaman(f.pool, 'PJ.2610.0001', { ...f.payload(), nik: '002' })
            assert.equal(saved.Potongan.length, installments)
            assert.equal(f.read().periode_potong1, null)
            assert.equal(f.read().Cicilan, installments)
            assert.equal(f.read().Bank, null)
            assert.equal(f.read().Norek, null)
            assert.equal(f.read().Pinjam, 600000)
        } finally { f.close() }
    }
})
for (const [change, message] of [
    [{ nik: '003' }, /aktif/], [{ nik: '404' }, /tidak ditemukan/],
    [{ pinjam: 250000 }, /Nominal/], [{ angsuran: 6 }, /cicilan/],
    [{ bank: 'OTHER' }, /Bank/], [{ norek: '' }, /rekening/], [{ tanggal: '2026-02-30' }, /Tanggal/],
]) test(`Edit rejects invalid changed field ${JSON.stringify(change)}`, async () => {
    const f = fixture()
    try {
        const before = { ...f.read() }
        await assert.rejects(editPinjaman(f.pool, before.Nomor, { ...f.payload(), ...change }), message)
        assert.deepEqual({ ...f.read() }, before)
    } finally { f.close() }
})
test('Moving active loan to employee with another active loan rejected; paid history can move', async () => {
    for (const balance of [150000, 400000]) {
        const f = fixture(balance)
        try {
            f.db.exec("INSERT INTO tpinjaman VALUES ('PJ.2610.0002','002','2026-10-09',400000,0,2,'BSI','0099',NULL,NULL,NULL,NULL,NULL,NULL)")
            const request = editPinjaman(f.pool, 'PJ.2610.0001', { ...f.payload(), nik: '002' })
            if (balance < 400000) await assert.rejects(request, /belum lunas/)
            else { await request; assert.equal(f.read().Nik, '002') }
        } finally { f.close() }
    }
})
test('Stale Edit/Delete revision rejected after balance or data changes', async () => {
    const f = fixture()
    try {
        const body = f.payload()
        f.db.exec('UPDATE tpinjaman SET bayar = 100000')
        await assert.rejects(editPinjaman(f.pool, 'PJ.2610.0001', { ...body, bank: 'CIMB' }), /telah berubah/)
        await assert.rejects(hapusPinjaman(f.pool, 'PJ.2610.0001', { revision: body.revision, konfirmasi: 'PJ.2610.0001' }), /telah berubah/)
        assert.equal(f.read().Bayar, 100000)
    } finally { f.close() }
})
test('Concurrent edits using same snapshot: first succeeds, second must reload', async () => {
    const f = fixture()
    try {
        const body = f.payload()
        const results = await Promise.allSettled([
            editPinjaman(f.pool, 'PJ.2610.0001', { ...body, bank: 'CIMB' }),
            editPinjaman(f.pool, 'PJ.2610.0001', { ...body, norek: '000456' }),
        ])
        assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
        assert.equal(results.filter(r => r.status === 'rejected').length, 1)
    } finally { f.close() }
})
test('Permanent deletion requires exact typed number/revision and supports paid history', async () => {
    for (const balance of [150000, 400000, null]) {
        const f = fixture(balance)
        try {
            const revision = f.payload().revision
            await assert.rejects(hapusPinjaman(f.pool, 'PJ.2610.0001', { revision, konfirmasi: 'wrong' }), /konfirmasi/)
            await assert.rejects(hapusPinjaman(f.pool, 'PJ.2610.0001', { konfirmasi: 'PJ.2610.0001' }), /Versi/)
            await hapusPinjaman(f.pool, 'PJ.2610.0001', { revision, konfirmasi: 'PJ.2610.0001' })
            assert.equal(f.read(), undefined)
            await assert.rejects(hapusPinjaman(f.pool, 'PJ.2610.0001', { revision, konfirmasi: 'PJ.2610.0001' }), /tidak ditemukan/)
        } finally { f.close() }
    }
})

test('Nominal edits cannot fall below paid amount or exceed company outstanding ceiling', async () => {
    const f = fixture(300000)
    try {
        await assert.rejects(editPinjaman(f.pool, 'PJ.2610.0001', { ...f.payload(), pinjam: 200000 }), /sudah dibayar/)
        f.db.exec("INSERT INTO tpinjaman VALUES ('OLD','old','2020-01-01',29850000,0,10,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL)")
        await assert.rejects(editPinjaman(f.pool, 'PJ.2610.0001', { ...f.payload(), pinjam: 500000 }), /plafon/)
        assert.equal(f.read().Pinjam, 400000)
    } finally { f.close() }
})

test('Increasing a paid loan to active checks other active loans for unchanged employee', async () => {
    const f = fixture(400000)
    try {
        f.db.exec("INSERT INTO tpinjaman VALUES ('OTHER','001','2026-10-09',200000,0,1,'BSI','001',NULL,NULL,NULL,NULL,NULL,NULL)")
        await assert.rejects(editPinjaman(f.pool, 'PJ.2610.0001', { ...f.payload(), pinjam: 500000 }), /belum lunas/)
        assert.equal(f.read().Pinjam, 400000)
    } finally { f.close() }
})

test('Edit date/nominal recomputes stored schedule and 2x to 1x clears second pair', async () => {
    const f = fixture()
    try {
        await editPinjaman(f.pool, 'PJ.2610.0001', { ...f.payload(), tanggal: '2026-12-25' })
        assert.equal(f.read().periode_potong1, 'Januari 2027')
        assert.equal(f.read().periode_potong2, 'Februari 2027')
        assert.equal(f.read().nilai_potong1, 200000)
        await editPinjaman(f.pool, 'PJ.2610.0001', { ...f.payload(), pinjam: 500000, nilai_potong1: 1 })
        assert.equal(f.read().nilai_potong1, 250000)
        assert.equal(f.read().nilai_potong2, 250000)
        await editPinjaman(f.pool, 'PJ.2610.0001', { ...f.payload(), angsuran: 1 })
        assert.equal(f.read().nilai_potong1, 500000)
        assert.equal(f.read().periode_potong2, null)
        assert.equal(f.read().nilai_potong2, null)
        assert.equal(f.read().Bayar, 150000)
    } finally { f.close() }
})
test('Non-schedule edit preserves stored values and legacy NULL, revision covers schedule changes', async () => {
    const f = fixture()
    try {
        await editPinjaman(f.pool, 'PJ.2610.0001', { ...f.payload(), bank: 'CIMB' })
        assert.equal(f.read().periode_potong1, null)
        f.db.exec("UPDATE tpinjaman SET periode_potong1 = 'Mei 2027', nilai_potong1 = 123000")
        await editPinjaman(f.pool, 'PJ.2610.0001', { ...f.payload(), norek: '009876' })
        assert.equal(f.read().periode_potong1, 'Mei 2027')
        assert.equal(f.read().nilai_potong1, 123000)
        const stale = f.payload()
        f.db.exec('UPDATE tpinjaman SET nilai_potong1 = 124000')
        await assert.rejects(editPinjaman(f.pool, 'PJ.2610.0001', stale), /telah berubah/)
    } finally { f.close() }
})
