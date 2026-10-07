import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { nomorKeluarBerikut, tanggalKeluarValid, validasiKeluar, tambahKeluar } from '../src/helpers/keluar.js'
import { buildOrderBy, applyAllColumnFilters } from '../src/helpers/browse.js'

// Semua query menggunakan mock, tidak mengimpor config/database atau menyentuh DB HRD.
const data = { tanggal: '2026-10-07', nik: '000', alasan: 'Lain lain', keterangan: '' }

test('Nomor keluar mengikuti bulan tanggal dan suffix empat digit', async () => {
    const db = { async query(sql, params) {
        assert.match(sql, /MAX\(CAST\(RIGHT\(kl_nomor, 4\) AS UNSIGNED\)\)/)
        assert.deepEqual(params, ['KEL.202610.%'])
        return [[{ urut: 2 }]]
    } }
    assert.equal(await nomorKeluarBerikut(db, data.tanggal), 'KEL.202610.0003')
    assert.equal(await nomorKeluarBerikut({ query: async () => [[{ urut: null }]] }, '2026-11-01'), 'KEL.202611.0001')
})

test('Suffix tidak wrap ketika melebihi 9999', async () => {
    await assert.rejects(nomorKeluarBerikut({ query: async () => [[{ urut: 9999 }]] }, data.tanggal), /9999/)
})

test('Validasi tanggal nyata, NIK, alasan, dan batas Keterangan 50', () => {
    assert.equal(tanggalKeluarValid('2026-02-29'), false)
    assert.equal(tanggalKeluarValid('2024-02-29'), true)
    assert.equal(tanggalKeluarValid('2026-10-07abc'), false)
    assert.deepEqual(validasiKeluar(data), data)
    assert.throws(() => validasiKeluar({ ...data, nik: '' }), /NIK/)
    assert.throws(() => validasiKeluar({ ...data, alasan: '' }), /Alasan/)
    assert.throws(() => validasiKeluar({ ...data, keterangan: 'a'.repeat(51) }), /50/)
    assert.equal(validasiKeluar({ ...data, keterangan: 'a'.repeat(50) }).keterangan.length, 50)
})

test('Tambah retry bentrok nomor, lalu memakai MAX terbaru', async () => {
    let attempts = 0
    const db = { async query(sql, params) {
        if (sql.startsWith('SELECT')) return [[{ urut: attempts }]]
        assert.match(sql, /^INSERT INTO tkeluar/)
        attempts += 1
        if (attempts === 1) throw Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' })
        assert.equal(params[0], 'KEL.202610.0002')
        return [{ affectedRows: 1 }]
    } }
    assert.equal(await tambahKeluar(db, data), 'KEL.202610.0002')
    assert.equal(attempts, 2)
})

test('Error non-duplikat tidak di-retry; bentrok terus berhenti setelah lima percobaan', async () => {
    let attempts = 0
    const db = { async query(sql) {
        if (sql.startsWith('SELECT')) return [[{ urut: 0 }]]
        attempts += 1
        throw Object.assign(new Error('trigger failed'), { code: 'ER_SIGNAL_EXCEPTION' })
    } }
    await assert.rejects(tambahKeluar(db, data), /trigger failed/)
    assert.equal(attempts, 1)
    attempts = 0
    db.query = async (sql) => {
        if (sql.startsWith('SELECT')) return [[{ urut: 0 }]]
        attempts += 1
        throw Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' })
    }
    await assert.rejects(tambahKeluar(db, data), /pengguna lain/)
    assert.equal(attempts, 5)
})

function controller(query) {
    const scope = {
        pool: { query }, nomorKeluarBerikut, tanggalKeluarValid, validasiKeluar, tambahKeluar,
        buildOrderBy, applyAllColumnFilters,
        success: (res, result) => { res.result = result },
        error: (res, message, status) => { res.error = { message, status } },
        paginated: (res, rows, pagination) => { res.result = rows; res.pagination = pagination },
        sendExcel: (res, title, columns, rows) => { res.result = rows; res.columns = columns; res.title = title },
    }
    vm.createContext(scope)
    const source = readFileSync(new URL('../src/controllers/transaksi/keluarController.js', import.meta.url), 'utf8')
    vm.runInContext(source.replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '') +
        '\nglobalThis.handlers = {getKeluarList,getKeluar,saveKeluar,deleteKeluar};', scope)
    return scope.handlers
}
const next = (err) => { throw err }

test('Browse/Export memakai SQL, filter, sort, parameter, dan kolom yang sama', async () => {
    const calls = []
    const handlers = controller(async (sql, params) => {
        assert.match(sql, /^SELECT/)
        calls.push({ sql, params: Array.from(params) })
        return sql.startsWith('SELECT COUNT') ? [[{ total: 1 }]] : [[{ Nomor: 'KEL.202610.0001' }]]
    })
    const query = { start_date: '2026-10-01', end_date: '2026-10-07', search: 'nama', filter_Alasan: 'Lain', filterSet_Pabrik: ['P04'], sort_by: 'Nama', sort_dir: 'asc' }
    const browse = {}, excel = {}
    await handlers.getKeluarList({ query: { ...query, page: 2, per_page: 50 } }, browse, next)
    const listQuery = calls.at(-1)
    await handlers.getKeluarList({ query: { ...query, export: 'xlsx' } }, excel, next)
    const exportQuery = calls.at(-1)
    assert.equal(listQuery.sql.replace(/ LIMIT \? OFFSET \?$/, ''), exportQuery.sql.replace(/ LIMIT 50000$/, ''))
    assert.deepEqual(listQuery.params.slice(0, -2), exportQuery.params)
    const frontend = readFileSync(new URL('../../frontend/src/views/transaksi/KeluarView.vue', import.meta.url), 'utf8')
    assert.deepEqual(Array.from(excel.columns), [...frontend.matchAll(/\{ key: "([^"]+)"/g)].map((m) => m[1]))
})

test('Periode browse tidak valid ditolak tanpa query', async () => {
    const handlers = controller(async () => { throw new Error('query tidak seharusnya terjadi') })
    const res = {}
    await handlers.getKeluarList({ query: { start_date: '2026-10-07', end_date: '2026-10-01' } }, res, next)
    assert.equal(res.error.status, 400)
})

test('Ubah mempertahankan nomor; hanya tanggal, alasan, keterangan diupdate', async () => {
    const writes = []
    const handlers = controller(async (sql, params) => {
        if (sql.startsWith('SELECT kar_Nik')) return [[{ kar_Nik: '000' }]]
        if (sql.startsWith('SELECT kl_nik')) return [[{ kl_nik: '000' }]]
        writes.push({ sql, params: Array.from(params) })
        return [{ affectedRows: 1 }]
    })
    const res = {}
    await handlers.saveKeluar({ method: 'PUT', params: { nomor: 'KEL.202609.0001' }, body: data }, res, next)
    assert.equal(res.result.nomor, 'KEL.202609.0001')
    assert.equal(writes.length, 1)
    assert.match(writes[0].sql, /^UPDATE tkeluar SET kl_tanggal = \?, kl_alasan = \?, kl_ket = \? WHERE kl_nomor = \?$/)
})

test('Ubah NIK ditolak sebelum write untuk menghindari side effect OLD/NEW', async () => {
    const handlers = controller(async (sql) => {
        assert.match(sql, /^SELECT/)
        return sql.startsWith('SELECT kar_Nik') ? [[{ kar_Nik: '001' }]] : [[{ kl_nik: '000' }]]
    })
    const res = {}
    await handlers.saveKeluar({ method: 'PUT', params: { nomor: 'KEL.202610.0001' }, body: { ...data, nik: '001' } }, res, next)
    assert.equal(res.error.status, 400)
})

test('Hapus ditolak bila ada dokumen lain untuk NIK yang sama', async () => {
    const handlers = controller(async (sql) => {
        assert.match(sql, /^SELECT/)
        return sql.startsWith('SELECT kl_nik') ? [[{ kl_nik: '000' }]] : [[{ kl_nomor: 'KEL.202610.0002' }]]
    })
    const res = {}
    await handlers.deleteKeluar({ params: { nomor: 'KEL.202610.0001' } }, res, next)
    assert.equal(res.error.status, 409)
})

test('Hapus satu dokumen memakai nomor dan tidak menduplikasi UPDATE master', async () => {
    const calls = []
    const handlers = controller(async (sql, params) => {
        calls.push(sql)
        if (sql.startsWith('SELECT kl_nik')) return [[{ kl_nik: '000' }]]
        if (sql.startsWith('SELECT kl_nomor')) return [[]]
        assert.equal(sql, 'DELETE FROM tkeluar WHERE kl_nomor = ?')
        assert.equal(params[0], 'KEL.202610.0001')
        return [{ affectedRows: 1 }]
    })
    const res = {}
    await handlers.deleteKeluar({ params: { nomor: 'KEL.202610.0001' } }, res, next)
    assert.equal(res.result, null)
    assert.equal(calls.filter((s) => s.startsWith('DELETE')).length, 1)
    assert.equal(calls.some((s) => s.startsWith('UPDATE tkaryawan')), false)
})
