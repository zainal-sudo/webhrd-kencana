import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { buildOrderBy, applyAllColumnFilters } from '../src/helpers/browse.js'

const BARIS = {
    Kode: '1234', Tanggal: '2026-10-01', Nik: '001', Nama: 'Budi', Pabrik: 'P04', Bagian: 'QC',
    '2jam': 2, Lebih2Jam: 1.5, Panggilan: 3.5, Lembur: 5.5, Jenis_Kerja: 'HARIAN',
}
const BARIS_NOL = { ...BARIS, Nik: '002', Nama: 'Ani', '2jam': 0, Lebih2Jam: 0, Panggilan: 0, Lembur: 0 }

function fixture(rows) {
    const calls = []
    const res = { exported: null }
    const scope = {
        pool: { query: async (sql, params) => {
            calls.push({ sql, params })
            if (sql.startsWith('SELECT COUNT')) return [[{ total: rows.length }]]
            return [rows]
        } },
        buildOrderBy, applyAllColumnFilters,
        paginated: (res, data, pagination) => Object.assign(res, { data, pagination }),
        success: (res, data) => { res.data = data },
        sendExcel: (res, title, columns, data) => { Object.assign(res, { exported: { title, columns, data } }) },
    }
    vm.createContext(scope)
    const source = readFileSync(new URL('../src/controllers/laporan/laporanController.js', import.meta.url), 'utf8')
    vm.runInContext(source.replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '') + '\nglobalThis.run = getDetailLemburList;', scope)
    return { calls, res, run: scope.run }
}

test('Detail Lembur: field respons Panggilan & Lembur eksplisit (tanda kutip di SQL)', async () => {
    const { calls, res, run } = fixture([BARIS, BARIS_NOL])
    await run({ query: {} }, res, err => { throw err })
    const sql = calls[0].sql
    // Alias dibersihkan dan tidak tergantung perilaku case-insensitive driver.
    assert.match(sql, /final\.panggilan AS `Panggilan`/)
    assert.match(sql, /final\.lembur AS `Lembur`/)
    // List, count, export, filter, sorting, dan distinct semua memakai DL_SELECT itu.
    assert.equal(calls.length, 2)
    for (const row of res.data) assert.ok('Panggilan' in row && 'Lembur' in row)
})

test('Detail Lembur: nilai positif dan nol tetap terkirim, tidak kosong', async () => {
    const { res, run } = fixture([BARIS, BARIS_NOL])
    await run({ query: {} }, res, err => { throw err })
    const [positif, nol] = res.data
    assert.equal(positif.Panggilan, 3.5)
    assert.equal(positif.Lembur, 5.5)
    assert.equal(nol.Panggilan, 0)
    assert.equal(nol.Lembur, 0)
})

test('Detail Lembur: export Excel memakai nama field yang sama dengan daftar', async () => {
    const { res, run } = fixture([BARIS, BARIS_NOL])
    await run({ query: { export: 'xlsx' } }, res, err => { throw err })
    assert.equal(res.exported.title, 'Detail-Lembur')
    for (const key of ['Panggilan', 'Lembur']) {
        assert.ok(res.exported.columns.includes(key), `kolom ${key} ada di header Excel`)
        for (const row of res.exported.data) assert.ok(key in row, `field ${key} terisi di baris export`)
    }
    assert.equal(res.exported.data[0].Panggilan, 3.5)
    assert.equal(res.exported.data[1].Lembur, 0)
})

test('Detail Lembur: kolom frontend membaca field yang dikirim backend', () => {
    const view = readFileSync(new URL('../../frontend/src/views/laporan/DetailLemburView.vue', import.meta.url), 'utf8')
    for (const key of ['Panggilan', 'Lembur']) {
        assert.match(view, new RegExp(`key: "${key}"`), `kolom frontend key:${key} ada`)
    }
    for (const key of ['2jam', 'Lebih2Jam', 'Panggilan', 'Lembur']) {
        assert.ok(view.includes(`"${key}"`), `${key} masuk kolom satu desimal`)
    }
})
