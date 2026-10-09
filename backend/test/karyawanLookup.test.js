import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { applyKaryawanLookup } from '../src/helpers/karyawanLookup.js'

test('lookup groups existing scope and binds all column filter values', () => {
    const params = ['%Ani%', '%Ani%']
    const result = applyKaryawanLookup({ filter_Nama: "A' OR 1=1 --", filter_Jabatan: 'Staff', filter_Status: 'Non Aktif' },
        ' WHERE k.kar_Nik LIKE ? OR k.kar_nama LIKE ?', params)
    assert.match(result.where, /^ WHERE \(k.kar_Nik LIKE \? OR k.kar_nama LIKE \?\) AND/)
    assert.match(result.where, /j.jab_nama LIKE \?/)
    assert.match(result.where, /'Non Aktif'\) = \?/)
    assert(!result.where.includes("A' OR"))
    assert.deepEqual(params, ['%Ani%', '%Ani%', "%A' OR 1=1 --%", '%Staff%', 'Non Aktif'])
})

test('sort identifiers and directions are whitelisted with a stable NIK tie-breaker', () => {
    for (const sort_by of ['Nik', 'KodeAbsensi', 'Nama', 'Jabatan', 'Bagian', 'Pabrik', 'Status']) {
        const result = applyKaryawanLookup({ sort_by, sort_dir: 'desc' }, '', [])
        assert.match(result.orderBy, / DESC, k.kar_Nik ASC$/)
    }
    assert.equal(applyKaryawanLookup({ sort_by: 'Nama; DROP TABLE tkaryawan', sort_dir: 'DESC; --' }, '', []).orderBy,
        'ORDER BY k.kar_nama ASC, k.kar_Nik ASC')
    assert.equal(applyKaryawanLookup({ sort_by: '__proto__', filter_unknown: 'x' }, '', []).where, '')
})

// Exercise the actual controller function with a mock pool; no live database.
for (const name of ['absensi', 'ijin', 'ijin2', 'keluar', 'lembur', 'lembur2', 'mutasi', 'penilaian', 'permintaan', 'perubahanStatus', 'sp']) {
    test(`${name}: page 2, matching count filters, and unchanged employee scope`, async () => {
        const path = `../src/controllers/${name === 'absensi' ? 'absensi' : 'transaksi'}/${name}Controller.js`
        const source = readFileSync(new URL(path, import.meta.url), 'utf8')
        const start = source.indexOf('export const lookupKaryawan')
        const block = source.slice(start, source.indexOf('\n}', start) + 2)
        const calls = []
        const pool = { async query(sql, params) {
            calls.push({ sql, params: [...params] })
            return sql.includes('COUNT(*)') ? [[{ c: 60, total: 60 }]] : [[{ Nik: '002', Nama: 'Ani' }]]
        } }
        const handler = new Function('pool', 'paginated', 'applyKaryawanLookup', `return ${block.slice(block.indexOf('async'))}`)(
            pool, (res, data, pagination) => { res.data = data; res.pagination = pagination }, applyKaryawanLookup)
        const res = {}
        await handler({ query: { search: 'Ani', pabrik: 'P01', page: '2', per_page: '25', filter_Jabatan: 'Staff', filter_Bagian: 'HRD', sort_by: 'Nik', sort_dir: 'desc' } }, res, error => { throw error })
        assert.equal(calls.length, 2)
        assert.match(calls[0].sql, /ORDER BY k.kar_Nik DESC, k.kar_Nik ASC LIMIT \? OFFSET \?/)
        assert.deepEqual(calls[0].params.slice(-2), [25, 25])
        assert.deepEqual(calls[0].params.slice(0, -2), calls[1].params)
        for (const call of calls) {
            assert.equal((call.sql.match(/\?/g) || []).length, call.params.length)
            assert.match(call.sql, /j.jab_nama LIKE \?/)
            assert.match(call.sql, /k.kar_bagian LIKE \?/)
            assert.match(call.sql, /LEFT JOIN tjabatan j/)
            // Main search matches any of these fields, not only NIK/name.
            assert.match(call.sql, /OR j.jab_nama LIKE \? OR k.kar_bagian LIKE \? OR k.kar_pab_kode LIKE \?/)
            assert.equal(call.params.filter(value => value === '%Ani%').length, name === 'absensi' ? 6 : 5)
        }
        const activeOnly = ['absensi', 'ijin', 'ijin2', 'lembur', 'lembur2', 'penilaian'].includes(name)
        assert.equal(calls[0].sql.includes('k.kar_status_aktif = 1 AND') || calls[0].sql.includes('(k.kar_status_aktif = 1)'), activeOnly)
        if (name === 'absensi') assert.match(calls[0].sql, /kar_kode_absensi <> 0/)
        if (!['keluar', 'permintaan'].includes(name)) assert(calls[0].params.some(value => String(value).includes('P01')))
        assert.deepEqual(res.pagination, { page: 2, per_page: 25, total: 60, last_page: 3 })
    })
}
