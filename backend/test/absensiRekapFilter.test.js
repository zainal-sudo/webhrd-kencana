import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { buildOrderBy, applyAllColumnFilters } from '../src/helpers/browse.js'

/**
 * Rekap Absensi: filter tiap kolom (kecuali No) + sort kolom "Lebih dari 2 Jam".
 * Kolom turunan `andi` memakai nama ber-spasi/berawalan angka, jadi whitelist
 * harus memakai identifier ter-quote agar SQL valid.
 */
function handler(onQuery) {
    const calls = []
    const scope = {
        pool: { async query(sql, params) { calls.push({ sql, params: Array.from(params || []) }); return onQuery(sql, params) } },
        buildOrderBy, applyAllColumnFilters,
        success: (res, data) => { res.data = data },
        paginated: (res, data, pagination) => { Object.assign(res, { data, pagination }) },
        error: () => {}, sendExcel: () => {},
    }
    vm.createContext(scope)
    const source = readFileSync(new URL('../src/controllers/laporan/laporanController.js', import.meta.url), 'utf8')
    vm.runInContext(source.replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '') + '\nglobalThis.handler = getAbsensiRekapList;', scope)
    return { run: scope.handler, calls }
}

const next = (err) => { throw err }
const period = { start_date: '2026-10-01', end_date: '2026-10-12' }
const empty = (sql) => sql.startsWith('UPDATE') ? [[]] : sql.includes('COUNT(*)') ? [[{ total: 0 }]] : [[]]

test('Rekap absensi menerima filter kolom yang namanya mengandung spasi', async () => {
    const { run, calls } = handler(empty)
    await run({ query: { ...period, ['filterSet_Lebih dari 2 Jam']: ['2'] } }, {}, next)
    const pilih = calls.find((c) => c.sql.toLowerCase().includes('final2.kar_nik'))
    assert.ok(pilih, 'query rekap dijalankan')
    assert.match(pilih.sql, /`Lebih dari 2 Jam` IN \(\?\)/)
    assert.doesNotMatch(pilih.sql, /filterSet_|filterNull_|filterEmpty_/)
    assert.equal(pilih.params.at(-1), '2')
})

test('Rekap absensi search tetap valid karena derived table memakai WHERE eksplisit', async () => {
    const { run, calls } = handler(empty)
    await run({ query: { ...period, search: 'ani' } }, {}, next)
    const pilih = calls.find((c) => c.sql.toLowerCase().includes('final2.kar_nik'))
    assert.match(pilih.sql, /\) andi WHERE 1=1 AND \(Nik LIKE \? OR Nama LIKE \? OR Bagian LIKE \? OR Pabrik LIKE \?\)/i)
    assert.deepEqual(pilih.params.slice(-4), ['%ani%', '%ani%', '%ani%', '%ani%'])
})

test('Rekap absensi distinct mengembalikan daftar nilai penuh untuk popup filter', async () => {
    const values = [{ value: 'P01' }, { value: 'P02' }]
    const { run, calls } = handler((sql) => sql.startsWith('UPDATE') ? [[]] : [values])
    const res = {}
    await run({ query: { ...period, distinct: 'Pabrik' } }, res, next)
    assert.deepEqual(Array.from(res.data), ['P01', 'P02'])
    const distinctSql = calls.at(-1).sql
    assert.match(distinctSql, /^SELECT DISTINCT `Pabrik` AS value, OCTET_LENGTH\(`Pabrik`\) AS value_length FROM \(/)
    assert.doesNotMatch(distinctSql, /LIMIT/i)
})

test('Rekap absensi distinct mengabaikan pilihan kolom itu sendiri tetapi memakai filter kolom lain', async () => {
    const { run, calls } = handler((sql) => sql.startsWith('UPDATE') ? [[]] : [[]])
    await run({ query: { ...period, distinct: 'Pabrik', filterSet_Pabrik: ['P01'], filterSet_Bagian: ['Produksi'] } }, {}, next)
    const distinctSql = calls.at(-1).sql
    assert.doesNotMatch(distinctSql, /`Pabrik` IN/)
    assert.match(distinctSql, /`Bagian` IN \(\?\)/)
})

test('Rekap absensi sort kolom "Lebih dari 2 Jam" menghasilkan ORDER BY valid', async () => {
    const { run, calls } = handler(empty)
    await run({ query: { ...period, sort_by: 'Lebih dari 2 Jam', sort_dir: 'desc' } }, {}, next)
    const pilih = calls.filter((c) => c.sql.toLowerCase().includes('final2.kar_nik')).at(-1)
    assert.match(pilih.sql, /ORDER BY `Lebih dari 2 Jam` desc LIMIT \? OFFSET \?$/i)
})

test('Rekap absensi tanpa filter tetap memakai ORDER BY bawaan', async () => {
    const { run, calls } = handler(empty)
    await run({ query: { ...period } }, {}, next)
    const pilih = calls.filter((c) => c.sql.toLowerCase().includes('final2.kar_nik')).at(-1)
    assert.match(pilih.sql, /ORDER BY Nama LIMIT \? OFFSET \?$/)
})
