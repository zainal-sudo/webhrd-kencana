import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import vm from 'node:vm'
import { buildOrderBy, applyAllColumnFilters } from '../src/helpers/browse.js'

function files(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory)
        return entry.isDirectory() ? files(url) : entry.name.endsWith('.js') ? [url] : []
    })
}

test('Every header distinct-value query returns the full set, without a hard SQL limit', () => {
    let count = 0
    for (const file of files(new URL('../src/', import.meta.url))) {
        const source = readFileSync(file, 'utf8')
        // Keep lookup queries (AS Bagian etc.) and table/export pagination out of scope.
        for (const match of source.matchAll(/SELECT DISTINCT[^\r\n]*? AS value[^\r\n]*/g)) {
            assert.doesNotMatch(match[0], /\bLIMIT\b/i, file.pathname)
            assert.doesNotMatch(match[0], /\bIS NOT NULL\b|<>\s*''/i, file.pathname)
            assert.match(match[0], /OCTET_LENGTH\(.+\) AS value_length/i, file.pathname)
            count++
        }
    }
    // 29 cabang: seluruh browse + laporan, termasuk Rekap Absensi.
    assert.equal(count, 29, 'All existing header-filter SQL branches are covered')
})

test('Karyawan filter finds a late-alphabet name beyond 1,000 values and retains other filters', async () => {
    const names = [...Array.from({ length: 1200 }, (_, i) => `ANI ${String(i).padStart(4, '0')}`), 'ZAINAL ARIFIN']
    const source = readFileSync(new URL('../src/controllers/master/karyawanController.js', import.meta.url), 'utf8')
    const scope = {
        buildOrderBy, applyAllColumnFilters,
        pool: { async query(sql, params) {
            assert.match(sql, /^SELECT DISTINCT k\.kar_nama AS value/)
            assert.doesNotMatch(sql, /\bLIMIT\b|k\.kar_nama IN/)
            assert.match(sql, /k\.kar_status_aktif = \?/)
            assert.match(sql, /k\.kar_pab_kode = \?/)
            assert.match(sql, /j\.jab_nama IN \(\?\)/)
            assert.deepEqual(Array.from(params), ['%za%', '%za%', '%za%', '%za%', 1, 'P01', 'Staff'])
            const limit = sql.match(/LIMIT\s+(\d+)/i)
            return [(limit ? names.slice(0, Number(limit[1])) : names).map(value => ({ value }))]
        } },
        success(res, data) { res.data = data },
    }
    vm.createContext(scope)
    vm.runInContext(source.replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '') + '\nglobalThis.run = getKaryawanList;', scope)
    const res = {}
    await scope.run({ query: { distinct: 'Nama', search: 'za', status_aktif: '1', pabrik: 'P01',
        filterSet_Nama: ['ANI 0000'], filterSet_Jabatan: ['Staff'], page: 2, per_page: 25 } }, res, err => { throw err })
    assert.equal(res.data.length, 1201)
    assert.equal(res.data.at(-1), 'ZAINAL ARIFIN')
})
