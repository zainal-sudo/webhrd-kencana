import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { buildOrderBy, applyAllColumnFilters } from '../src/helpers/browse.js'

// Mock saja, tidak memuat config/database atau menjalankan query ke DB.
function handler(query) {
    const scope = {
        pool: { query }, buildOrderBy, applyAllColumnFilters,
        error: (res, message, status) => { res.error = { message, status } },
        success: (res, data) => { res.data = data },
        paginated: (res, data, pagination) => { res.data = data; res.pagination = pagination },
        sendExcel: (res, title, columns, data) => { Object.assign(res, { title, columns, data }) },
    }
    vm.createContext(scope)
    const source = readFileSync(new URL('../src/controllers/laporan/lemburHariLiburController.js', import.meta.url), 'utf8')
    vm.runInContext(source.replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '') + '\nglobalThis.handler = getLemburHariLiburList;', scope)
    return scope.handler
}
const next = (err) => { throw err }
const period = { start_date: '2026-10-01', end_date: '2026-10-07' }

test('Tanggal hanya tharilibur, SPL opsional cocok NIK/tanggal, durasi lintas-malam, ijin & verifikasi real', async () => {
    const calls = []
    const run = handler(async (sql, params) => {
        assert.match(sql, /^SELECT/)
        calls.push({ sql, params: Array.from(params) })
        return sql.startsWith('SELECT COUNT') ? [[{ total: 2 }]] : [[{ _key: 'a', lama_lembur: null }]]
    })
    const res = {}
    await run({ query: period }, res, next)
    const sql = calls.at(-1).sql
    assert.match(sql, /EXISTS \(SELECT 1 FROM tharilibur hl WHERE hl.hl_tanggal = a.tanggal\)/)
    // Tanpa scan tidak ikut; salah satu scan masih cukup agar absensi tidak lengkap terlihat.
    assert.match(sql, /AND \(a.scan1 > '00:00:00' OR a.scan2 > '00:00:00'\)/)
    assert.doesNotMatch(sql, /DAYOFWEEK|hl_status/)
    assert.match(sql, /LEFT JOIN/)
    assert.match(sql, /s.tanggal = a.tanggal AND s.nik = k.kar_Nik/)
    // Durasi lintas-malam seperti Delphi (24:00:00 - awal + akhir).
    assert.match(sql, /TIMEDIFF\('24:00:00',a.scan1\)/)
    assert.match(sql, /TIMEDIFF\('24:00:00',s.jam_mulai\)/)
    // No Ijin dari tijin (ij_ji_id = 2), verifikasi dari tabsensi.
    assert.match(sql, /z.ij_nomor AS `no_ijin`/)
    assert.match(sql, /a.verifikasi AS `verifikasi`/)
    assert.match(sql, /LEFT JOIN tijin z ON z.ij_tanggal = a.tanggal AND z.ij_nik = k.kar_Nik AND z.ij_ji_id = 2/)
    // Kode absensi mentah ikut dikirim untuk aksi verifikasi/edit absensi.
    assert.match(sql, /a.nik AS `nik`/)
    assert.equal(res.pagination.total, 2)
    assert.equal(res.data[0].lama_lembur, null)
})

test('Verifikasi update tabsensi by nik+tanggal, nilai hanya 0/1', async () => {
    const calls = []
    const source = readFileSync(new URL('../src/controllers/laporan/lemburHariLiburController.js', import.meta.url), 'utf8')
    const scope = {
        pool: {
            query: async (sql, params) => {
                calls.push({ sql, params })
                return [{ affectedRows: 1 }]
            },
        },
        error: (res, message, status) => { res.error = { message, status } },
        success: (res, data) => { res.data = data },
    }
    vm.createContext(scope)
    vm.runInContext(source.replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '') + '\nglobalThis.setVer = setVerifikasiLemburHariLibur;', scope)
    const res = {}
    await scope.setVer({ body: { nik: 'ABS1', tanggal: '2026-10-05', verifikasi: 1 } }, res, next)
    assert.match(calls[0].sql, /UPDATE tabsensi SET verifikasi = \? WHERE nik = \? AND tanggal = \?/)
    assert.deepEqual([...calls[0].params], [1, 'ABS1', '2026-10-05'])
    assert.equal(res.data.verifikasi, 1)
    const bad = {}
    await scope.setVer({ body: { nik: 'ABS1', tanggal: '2026-10-05', verifikasi: 2 } }, bad, next)
    assert.equal(bad.error.status, 400)
    const empty = {}
    await scope.setVer({ body: { nik: '', tanggal: '2026-10-05', verifikasi: 0 } }, empty, next)
    assert.equal(empty.error.status, 400)
})

test('Browse dan Excel memakai filter/sort yang sama, export sesuai kolom frontend tanpa key internal', async () => {
    const calls = []
    const run = handler(async (sql, params) => {
        calls.push({ sql, params: Array.from(params) })
        return sql.startsWith('SELECT COUNT') ? [[{ total: 1 }]] : [[]]
    })
    const query = { ...period, search: 'nama', filterSet_Pabrik: ['K03'], sort_by: 'Nama', sort_dir: 'asc' }
    await run({ query: { ...query, page: 2 } }, {}, next)
    const browse = calls.at(-1)
    const excel = {}
    await run({ query: { ...query, export: 'xlsx' } }, excel, next)
    const exported = calls.at(-1)
    assert.equal(browse.sql.slice(browse.sql.indexOf(' FROM tabsensi')).replace(/ LIMIT \? OFFSET \?$/, ''), exported.sql.slice(exported.sql.indexOf(' FROM tabsensi')).replace(/ LIMIT 50000$/, ''))
    assert.deepEqual(browse.params.slice(0, -2), exported.params)
    const frontend = readFileSync(new URL('../../frontend/src/views/laporan/LemburHariLiburView.vue', import.meta.url), 'utf8')
    assert.deepEqual(Array.from(excel.columns), [...frontend.matchAll(/\{ key: "([^"]+)"/g)].map((m) => m[1]))
    assert.doesNotMatch(exported.sql, /AS _key/)
})

test('Periode tidak valid ditolak tanpa query', async () => {
    const run = handler(async () => { throw new Error('Tidak boleh query') })
    for (const query of [{ start_date: '2026-02-30', end_date: '2026-03-01' }, { start_date: '2026-10-07', end_date: '2026-10-01' }]) {
        const res = {}
        await run({ query }, res, next)
        assert.equal(res.error.status, 400)
    }
})

test('Distinct filter memakai ruang lingkup periode/master libur dan whitelist sorting', async () => {
    const calls = []
    const run = handler(async (sql, params) => {
        calls.push(sql)
        assert.match(sql, /EXISTS \(SELECT 1 FROM tharilibur/)
        return sql.startsWith('SELECT COUNT') ? [[{ total: 0 }]] : [[]]
    })
    await run({ query: { ...period, distinct: 'Pabrik', filterSet_Pabrik: ['K03'] } }, {}, next)
    assert.match(calls[0], /SELECT DISTINCT k.kar_pab_kode AS value/)
    assert.doesNotMatch(calls[0], /k.kar_pab_kode IN/)
    await run({ query: { ...period, sort_by: 'DROP TABLE tabsensi' } }, {}, next)
    assert.doesNotMatch(calls.at(-1), /DROP TABLE/)
})
