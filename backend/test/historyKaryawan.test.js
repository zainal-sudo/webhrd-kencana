import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ExcelJS from 'exceljs'
import * as history from '../src/helpers/historyKaryawan.js'
import { success, paginated } from '../src/helpers/response.js'
import { applyAllColumnFilters, buildOrderBy } from '../src/helpers/browse.js'
import { sendExcel } from '../src/helpers/excel.js'

const sample = Object.fromEntries(history.HISTORY_KEYS.map(key => [key, null]))
Object.assign(sample, { Nik: '001231229', Nama: 'OZY', Pabrik: 'HO',
    PKWT2: '2025-01-24 s/d 2026-01-23', Sp1: '2020-01-01 s/d 2020-07-01',
    St_hari: '18', Sakit: '0', Ijin: '22', Alpha: '1' })

function fixture() {
    const calls = []
    const scope = { ...history, success, paginated, applyAllColumnFilters, buildOrderBy,
        pool: { async query(sql, params = []) {
            calls.push({ sql, params: Array.from(params) })
            if (sql.includes('SELECT COUNT(*) AS c FROM history')) return [[{ c: 51 }]]
            if (sql.includes('SELECT DISTINCT')) return [[{ value: 'HO' }]]
            return [[{ ...sample }]]
        } },
        sendExcel: (res, title, columns, rows, options) => sendExcel(res, title, Array.from(columns), Array.from(rows, row => ({ ...row })), options),
    }
    vm.createContext(scope)
    const source = readFileSync(new URL('../src/controllers/master/karyawanController.js', import.meta.url), 'utf8')
    vm.runInContext(source.replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '') + '\nglobalThis.handler = getHistoryKaryawan;', scope)
    async function run(query = {}) {
        const res = { headers: {}, status(code) { this.code = code; return this },
            json(body) { this.body = body; return this }, setHeader(k, v) { this.headers[k] = v },
            send(buffer) { this.buffer = buffer; return this } }
        await scope.handler({ query }, res, err => { throw err })
        assert.equal(res.code, 200)
        return res
    }
    return { calls, run }
}

test('History exposes exactly 20 matching columns, preserves NIK and returns numeric totals', async () => {
    const frontend = readFileSync(new URL('../../frontend/src/views/master/HistoryKaryawanView.vue', import.meta.url), 'utf8')
    assert.deepEqual([...frontend.matchAll(/key: "([^"]+)"/g)].map(match => match[1]), history.HISTORY_KEYS)
    assert.match(frontend, /:show-actions="false"/)
    const f = fixture(), res = await f.run({ page: '2', per_page: '25', nik: '001231229' })
    assert.deepEqual(Object.keys(res.body.data[0]), history.HISTORY_KEYS)
    assert.equal(res.body.data[0].Nik, '001231229')
    for (const key of history.HISTORY_NUMBERS) assert.equal(typeof res.body.data[0][key], 'number')
    assert.deepEqual(f.calls.at(-1).params, ['001231229', 25, 25])
    assert.match(f.calls.at(-1).sql, /WHERE k.kar_status_aktif = 1/)
    assert.doesNotMatch(f.calls.at(-1).sql, /tkaryawanold|CURDATE|BETWEEN/)
})

test('History list and Excel share search, column filters, sorting, and active-only scope', async () => {
    const f = fixture()
    const query = { search: 'OZY', pabrik: 'HO', filterSet_Sakit: ['0'], sort_by: 'Ijin', sort_dir: 'desc' }
    await f.run(query)
    const browse = f.calls.at(-1)
    await f.run({ ...query, export: 'xlsx' })
    const exported = f.calls.at(-1)
    assert.equal(browse.sql.split(' LIMIT ')[0], exported.sql.split(' LIMIT ')[0])
    assert.deepEqual(browse.params.slice(0, -2), exported.params)
    assert.deepEqual(exported.params, ['%OZY%', '%OZY%', '%OZY%', '%OZY%', 'HO', 0])
    assert.match(exported.sql, /ORDER BY h.`Ijin` desc LIMIT 50000$/)
})

test('History distinct choices respect other filters but exclude their own column', async () => {
    const f = fixture()
    const res = await f.run({ distinct: 'Pabrik', filterSet_Pabrik: ['P01'], filterSet_Sakit: ['0'] })
    assert.deepEqual(Array.from(res.body.data), ['HO'])
    assert.deepEqual(f.calls.at(-1).params, [0])
    assert.match(f.calls.at(-1).sql, /SELECT DISTINCT h.`Pabrik`/)
})

test('Actual XLSX preserves complete PKWT ranges, text NIK, blank history, and numbers without Rp', async () => {
    const f = fixture(), res = await f.run({ export: 'xlsx' })
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(res.buffer)
    const sheet = workbook.worksheets[0]
    assert.equal(sheet.views[0].state, 'frozen')
    assert.equal(sheet.views[0].ySplit, 1)
    assert.equal(sheet.views[0].xSplit, 0)
    // Header Excel memakai label web (Nik -> NIK); kolom data tetap HISTORY_KEYS.
    assert.deepEqual(sheet.getRow(1).values.slice(1), history.HISTORY_KEYS.map(k => (k === 'Nik' ? 'NIK' : k)))
    const cell = key => sheet.getRow(2).getCell(history.HISTORY_KEYS.indexOf(key) + 1)
    assert.equal(cell('Nik').value, '001231229')
    assert.equal(cell('PKWT2').value, sample.PKWT2)
    assert.equal(cell('Sp1').value, sample.Sp1)
    assert.equal(sheet.getColumn(history.HISTORY_KEYS.indexOf('Rotasi') + 1).width, 45)
    assert.equal(sheet.getColumn(history.HISTORY_KEYS.indexOf('Demosi') + 1).width, 45)
    assert.ok(!cell('Mutasi').value)
    for (const key of history.HISTORY_NUMBERS) {
        assert.equal(cell(key).value, Number(sample[key]))
        assert.doesNotMatch(cell(key).numFmt ?? '', /Rp/)
    }
})

// Opt-in integration test: SELECT-only CTE fixtures; never writes production tables.
test('SQL selects latest per category, breaks date ties by PK, keeps expired history and counts all ijin',
    { skip: process.env.HISTORY_DB_TEST !== '1' }, async () => {
        const { default: pool } = await import('../src/config/database.js')
        const tables = {
            tkaryawan: { cols: ['kar_Nik', 'kar_nama', 'kar_pab_kode', 'kar_bagian', 'kar_jab_kode', 'kar_status_aktif'], rows: [
                ['001', 'Aktif', 'HO', 'IT', 'S', 1], ['002', 'Nonaktif', 'HO', 'IT', 'S', 0], ['003', 'Tanpa riwayat', 'HO', '', null, 1],
            ] },
            tjabatan: { cols: ['jab_kode', 'jab_nama'], rows: [['S', 'STAF'], ['L', 'LEADER']] },
            tperubahanstatus: { cols: ['ps_kar_nik', 'ps_kar_status_karyawan2', 'ps_tgl_awal', 'ps_tgl_akhir', 'ps_tanggal', 'ps_nomor'], rows: [
                ['001', 3, '2020-01-01', '2020-06-30', '2020-01-01', '001'],
                ['001', 3, '2021-01-01', '2021-06-30', '2021-01-01', '002'],
                ['001', 3, '2021-02-01', '2021-07-31', '2021-01-01', '003'],
                ['001', 4, '2022-01-01', '2022-06-30', '2022-01-01', '004'],
            ] },
            tpkwt: { cols: ['kar_nik', 'sk_id', 'tgl1', 'tgl2'], rows: [
                ['001', 2, '2019-01-01', '2019-06-30'], ['001', 3, '2020-01-01', '2020-06-30'],
            ] },
            tsp: { cols: ['sp_nik', 'sp_ke', 'sp_periode1', 'sp_periode2', 'sp_tanggal', 'sp_nomor'], rows: [
                ['001', '1 (Satu)', '2019-01-01', '2019-06-30', '2019-01-01', '001'],
                ['001', '1 (Satu)', '2020-01-01', '2020-06-30', '2020-01-01', '002'],
                ['001', '1 (Satu)', '2020-02-01', '2020-07-31', '2020-01-01', '003'],
                ['001', 'Pembinaan', '2018-01-01', '2018-06-30', '2018-01-01', '004'],
                ['001', '2 (Dua)', '2021-01-01', '2021-06-30', '2021-01-01', '005'],
                ['001', '3 (Tiga)', '2022-01-01', '2022-06-30', '2022-01-01', '006'],
            ] },
            tmutasi: { cols: ['mut_nik', 'mut_alasan', 'mut_tanggal', 'mut_nomor', 'mut_pab_kode', 'mut_jab_kode', 'mut_bagian', 'mut_pab_kode2', 'mut_jab_kode2', 'mut_bagian2'], rows: [
                ['001', 'Mutasi', '2018-01-01', '001', 'P01', 'S', 'Lama', 'HO', 'S', 'Kuno'],
                ['001', 'Mutasi', '2020-01-01', '002', 'P01', 'S', 'Lama', 'HO', 'S', 'Baru'],
                ['001', 'Mutasi', '2020-01-01', '003', 'P01', 'S', 'Lama', 'HO', 'S', 'IT'],
                ...['Promosi', 'Rotasi', 'Demosi'].map((alasan, i) => ['001', alasan, '2019-01-01', `00${i + 4}`, 'HO', 'S', 'IT', 'HO', 'L', 'IT']),
            ] },
            tijin: { cols: ['ij_nik', 'ij_ji_id', 'ij_keterangan'], rows: [
                ['001', 2, 0], ['001', 2, 0], ['001', 3, 0], ['001', 3, 1], ['001', 3, 2], ['001', 3, 3], ['002', 2, 0],
            ] },
        }
        const literal = v => v == null ? 'NULL' : typeof v === 'number' ? String(v) : `'${v.replaceAll("'", "''")}'`
        const fixtures = Object.entries(tables).map(([name, { cols, rows }]) =>
            `${name} (${cols.join(',')}) AS (${rows.map(row => `SELECT ${row.map(literal).join(',')}`).join(' UNION ALL ')})`).join(',\n')
        try {
            const [rows] = await pool.query(`WITH ${fixtures}, ${history.HISTORY_CTE.replace(/^WITH\s+/, '')} SELECT * FROM history ORDER BY Nik`)
            assert.deepEqual(rows.map(row => row.Nik), ['001', '003'])
            const row = rows[0]
            assert.equal(row.PKWT1, '2019-01-01 s/d 2019-06-30')
            assert.equal(row.PKWT2, '2021-02-01 s/d 2021-07-31')
            assert.equal(row.PKWT3, '2022-01-01 s/d 2022-06-30')
            assert.equal(row.Sp1, '2020-02-01 s/d 2020-07-31')
            assert.equal(row.Pembinaan, '2018-01-01 s/d 2018-06-30')
            assert.equal(row.Sp2, '2021-01-01 s/d 2021-06-30')
            assert.equal(row.Sp3, '2022-01-01 s/d 2022-06-30')
            assert.equal(row.Mutasi, 'Tanggal:2020-01-01 P01=>STAF=>Lama mutasi ke HO=>STAF=>IT')
            for (const key of ['Promosi', 'Rotasi', 'Demosi']) assert.match(row[key], new RegExp(`${key} ke HO=>LEADER=>IT$`))
            assert.deepEqual([...history.HISTORY_NUMBERS].map(key => Number(row[key])), [2, 1, 1, 1])
            assert.deepEqual([...history.HISTORY_NUMBERS].map(key => Number(rows[1][key])), [0, 0, 0, 0])
            assert.equal(rows[1].Mutasi, null)
        } finally { await pool.end() }
    })
