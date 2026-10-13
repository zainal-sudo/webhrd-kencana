import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { applyAllColumnFilters, buildOrderBy } from '../src/helpers/browse.js'

function fixture() {
    const reads = [], writes = []
    let selection = [], committed = false, released = false
    const conn = {
        async beginTransaction() {}, async rollback() {},
        async commit() { committed = true }, release() { released = true },
        async query(sql, params) {
            writes.push({ sql, params })
            if (sql.includes('MAX(RIGHT')) return [[{ m: 0 }]]
            if (sql.startsWith('SELECT 1')) return [[]]
            return [{ affectedRows: 1 }]
        },
    }
    const pool = {
        async getConnection() { return conn },
        async query(sql, params) {
            reads.push({ sql, params })
            if (sql.includes('COUNT(*)')) return [[{ total: 120 }]]
            if (sql.startsWith('SELECT k.kar_Nik AS nik')) return [selection]
            return [[]]
        },
    }
    const source = readFileSync(new URL('../src/controllers/laporan/laporanController.js', import.meta.url), 'utf8')
        .replace(/^import .*$/gm, '').replace(/export const /g, 'const ')
    const context = { pool, applyAllColumnFilters, buildOrderBy,
        success: (res, data) => { res.data = data }, paginated() {},
    }
    vm.runInNewContext(source + '\nglobalThis.handlers = { getTidakMasukList, alphaOtomatis, jadwalLiburOtomatis };', context)
    return { handlers: context.handlers, reads, writes,
        select(rows) { selection = rows },
        get committed() { return committed }, get released() { return released },
    }
}
const query = {
    start_date: '2026-10-03', end_date: '2026-10-10', search: 'employee',
    filterSet_Pabrik: ['HO'], filterSet_Hari: ['Sabtu'],
    filterNull_Jenis_Ijin: '1', filterEmpty_Jenis_Ijin: '1',
}
const normalized = value => JSON.parse(JSON.stringify(value))

for (const [handler, keterangan, alasan] of [
    ['alphaOtomatis', 2, 'Otomatis'], ['jadwalLiburOtomatis', 3, 'Jadwal Libur Otomatis'],
]) {
    test(`${handler}: selection has exactly browse filters plus unpermitted constraint, no pagination limit`, async () => {
        const f = fixture()
        const next = err => { throw err }
        await f.handlers.getTidakMasukList({ query: { ...query, page: '3', per_page: '50' }, body: {} }, {}, next)
        const browse = f.reads.find(call => call.sql.startsWith('SELECT COUNT(*)'))
        const where = browse.sql.slice(browse.sql.indexOf(' WHERE '))
        const eligible = [
            { nik: '000', tanggal: '2026-10-03' },
            { nik: '001', tanggal: '2026-10-10' },
        ]
        f.select(eligible)
        const res = {}
        await f.handlers[handler]({ query, body: {} }, res, next)
        const selection = f.reads.find(call => call.sql.startsWith('SELECT k.kar_Nik AS nik'))
        assert.ok(selection.sql.includes(where + ' AND ji.ji_keterangan IS NULL ORDER BY'))
        assert.deepEqual(normalized(selection.params), normalized(browse.params))
        assert.match(selection.sql, /k\.kar_pab_kode IN \(\?\)/)
        assert.match(selection.sql, /CASE DAYNAME\(a\.tanggal\)/)
        assert.match(selection.sql, /\(ji\.ji_keterangan IS NULL OR ji\.ji_keterangan = \?\)/)
        assert.doesNotMatch(selection.sql, /LIMIT|OFFSET/)
        assert.deepEqual(normalized(selection.params), ['2026-10-03', '2026-10-10', ...Array(4).fill('%employee%'), 'HO', 'Sabtu', ''])
        const inserts = f.writes.filter(call => call.sql.includes('INSERT INTO tijin'))
        assert.equal(inserts.length, eligible.length)
        assert.deepEqual(normalized(inserts.map(call => call.params.slice(1))), eligible.map(row => [row.tanggal, row.nik, keterangan, alasan]))
        assert.equal(res.data.jumlah, 2)
        assert.equal(f.committed, true)
        assert.equal(f.released, true)
    })

    test(`${handler}: no matching rows never inserts anything`, async () => {
        const f = fixture(), res = {}
        await f.handlers[handler]({ query, body: {} }, res, err => { throw err })
        assert.equal(res.data.jumlah, 0)
        assert.equal(f.writes.length, 0)
        assert.equal(f.committed, false)
        assert.equal(f.released, true)
    })
}
