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

test('Tanggal hanya tharilibur, SPL opsional cocok NIK/tanggal, durasi selisih, kolom belum jelas kosong', async () => {
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
    assert.doesNotMatch(sql, /DAYOFWEEK|hl_status|a.verifikasi/)
    assert.match(sql, /LEFT JOIN/)
    assert.match(sql, /s.tanggal = a.tanggal AND s.nik = k.kar_Nik/)
    assert.match(sql, /TIMEDIFF\(a.scan2, a.scan1\) AS `lama`/)
    assert.match(sql, /TIMEDIFF\(s.jam_selesai, s.jam_mulai\) AS `lama_lembur`/)
    assert.match(sql, /'' AS `no_ijin`, '' AS `verifikasi`/)
    assert.equal(res.pagination.total, 2)
    assert.equal(res.data[0].lama_lembur, null)
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
