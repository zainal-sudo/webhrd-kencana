import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { DatabaseSync } from 'node:sqlite'
import { buildOrderBy, applyAllColumnFilters } from '../src/helpers/browse.js'

const source = readFileSync(new URL('../src/controllers/laporan/laporanController.js', import.meta.url), 'utf8')
const period = { start_date: '2026-10-01', end_date: '2026-10-02' }

async function request(query) {
    const db = new DatabaseSync(':memory:')
    db.function('OCTET_LENGTH', value => value == null ? null : Buffer.byteLength(String(value)))
    db.exec(`CREATE TABLE fixture (Nik TEXT, Nama TEXT, Bagian TEXT, Status TEXT, Jabatan TEXT, Pabrik TEXT);
        INSERT INTO fixture VALUES
        ('001', 'ANI', 'CETAK', 'Bulanan', 'STAF', 'P01'),
        ('002', 'BUDI', 'CETAK', 'Harian', 'OPERATOR', 'P02'),
        ('003', 'CICI', 'JAHIT', 'Borongan', 'OPERATOR', 'P02')`)
    const calls = []
    const scope = {
        buildOrderBy, applyAllColumnFilters,
        pool: { async query(sql, params = []) {
            calls.push({ sql, params: Array.from(params) })
            // Execute the actual outer query; the attendance calendar is unrelated
            // to this filter regression and is replaced by an isolated SQL fixture.
            const start = sql.indexOf('FROM (')
            const end = sql.lastIndexOf(') t ')
            assert.ok(start >= 0 && end > start)
            const outer = sql.slice(0, start) + 'FROM fixture t ' + sql.slice(end + 4)
            return [db.prepare(outer).all(...params)]
        } },
        success: (res, data) => { res.data = data },
        paginated: (res, data, pagination) => { Object.assign(res, { data, pagination }) },
        sendExcel: (res, name, columns, data, options) => { Object.assign(res, { name, columns, data, options }) },
        // Stub helpers/tanggal.js (import dibuang harness): dd/mm/yyyy seperti web.
        formatTanggal: (value) => {
            const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''))
            return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
        },
    }
    vm.createContext(scope)
    vm.runInContext(source.replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '') + '\nglobalThis.run = getAbsensiPeriodeList;', scope)
    const res = {}
    try {
        await scope.run({ query: { ...period, ...query } }, res, err => { throw err })
        return { res, calls }
    } finally { db.close() }
}

for (const [label, query, expected] of [
    ['tanpa filter', {}, ['001', '002', '003']],
    ['checklist Sistem tanpa search', { filterSet_Status: ['Bulanan', 'Harian'] }, ['001', '002']],
    ['filter teks tanpa search', { filter_Bagian: 'CETAK' }, ['001', '002']],
    ['gabungan search dan filter', { search: 'BUDI', filterSet_Status: ['Harian'] }, ['002']],
    ['beberapa kolom', { filterSet_Status: ['Harian'], filterSet_Pabrik: ['P02'] }, ['002']],
    ['nilai kosong NULL', { filterNull_Status: '1' }, []],
    ['nilai kosong string', { filterEmpty_Status: '1' }, []],
]) test(`Absensi Periode: ${label}`, async () => {
    const { res, calls } = await request(query)
    assert.deepEqual(res.data.map(row => row.Nik), expected)
    assert.equal(res.pagination.total, expected.length)
    assert.equal(calls.length, 2)
    for (const { sql } of calls) assert.match(sql, /\) t\s+WHERE 1=1/)
})

test('Pilihan filter mengabaikan kolom sendiri dan mempertahankan kolom lain tanpa search', async () => {
    const { res, calls } = await request({ distinct: 'Status', filterSet_Status: ['Bulanan'], filterSet_Pabrik: ['P02'] })
    assert.deepEqual(Array.from(res.data), ['Borongan', 'Harian'])
    assert.doesNotMatch(calls[0].sql, /t\.`Status` IN/)
    assert.match(calls[0].sql, /t\.`Pabrik` IN \(\?\)/)
})

test('Export Excel memakai filter yang sama tanpa search', async () => {
    const { res } = await request({ export: 'xlsx', filterSet_Status: ['Bulanan', 'Harian'] })
    assert.equal(res.name, 'Absensi-Periode')
    assert.deepEqual(res.data.map(row => row.Nik), ['001', '002'])
})

test('Rentang lintas bulan (26 Okt s/d 26 Nov… 2026-09-26 → 2026-10-26): key kolom unik per tanggal lengkap', async () => {
    const { calls } = await request({ start_date: '2026-09-26', end_date: '2026-10-26' })
    const inner = calls.find(c => c.sql.includes('FROM (')).sql
    assert.equal((inner.match(/AS `2026-09-26`/g) || []).length, 1, 'alias 2026-09-26 tepat sekali')
    assert.equal((inner.match(/AS `2026-10-26`/g) || []).length, 1, 'alias 2026-10-26 tepat sekali')
    for (const tgl of ['2026-09-27', '2026-09-30', '2026-10-01', '2026-10-25']) {
        assert.equal((inner.match(new RegExp(`AS \\\`${tgl}\\\``)) || []).length, 1, `alias ${tgl} unik`)
    }
    // Alias day-of-month lama tidak boleh tinggal (dahulu `26` tertimpa 2 kali).
    assert.doesNotMatch(inner, /AS `\d{2}`/)
})

test('Hari tanpa baris absensi tampil 0 (IFNULL membungkus seluruh subquery), bukan kosong/NULL', async () => {
    const { calls } = await request({})
    const inner = calls.find(c => c.sql.includes('FROM (')).sql
    // IFNULL harus DI LUAR subquery.scalar — bukan di dalam SELECT-list (yang tidak
    // pernah dievaluasi bila subquery tidak menghasilkan baris).
    assert.match(inner, /IFNULL\(\(SELECT CAST\(IF\(CAST\(x\.stat AS CHAR\) = '0', '0'/)
    assert.doesNotMatch(inner, /SELECT CAST\(IFNULL\(/)
})

test('Export lintas bulan: header Excel memakai tanggal lengkap agar tak dobel', async () => {
    const { res } = await request({ export: 'xlsx', start_date: '2026-09-26', end_date: '2026-10-26' })
    const kolomHari = res.columns.filter(c => /^2026-\d{2}-\d{2}$/.test(String(c)))
    assert.equal(kolomHari.length, 31)
    assert.equal(new Set(kolomHari).size, 31, '31 header hari, semua unik')
})

test('Header Excel kolom hari tampil dd/mm/yyyy seperti web, key tetap ISO (lintas bulan unik)', async () => {
    const { res } = await request({ export: 'xlsx', start_date: '2026-09-26', end_date: '2026-10-26' })
    const labels = res.options?.headLabels || {}
    const masukHari = res.columns.filter(c => /^2026-\d{2}-\d{2}$/.test(String(c)))
    assert.equal(masukHari.length, 31, 'semua kolom hari punya label')
    for (const key of masukHari) {
        assert.match(labels[key], /^\d{2}\/\d{2}\/\d{4}$/, `label ${key} = dd/mm/yyyy, bukan ISO: ${labels[key]}`)
        assert.equal(labels[key], key.slice(8, 10) + '/' + key.slice(5, 7) + '/' + key.slice(0, 4), `label ${key} sehari dari key`)
    }
    assert.ok(!('Nik' in labels) || labels.Nik === undefined, 'kolom statis tak dipetakan (pakai label sendiri)')
})

test('Frontend memakai key tanggal lengkap (bukan dd) untuk kolom hari', () => {
    const view = readFileSync(new URL('../../frontend/src/views/laporan/AbsensiPeriodeView.vue', import.meta.url), 'utf8')
    assert.match(view, /key: h\.date/)
    assert.doesNotMatch(view, /key: h\.dd/)
})

test('Kalender menampilkan SEMUA karyawan aktif, juga tanpa kode absensi', async () => {
    const { calls } = await request({})
    const inner = calls.find(c => c.sql.includes('FROM (')).sql
    assert.match(inner, /kar_status_aktif = 1\)/)
    // Dulu: juga menyaring kode absensi — 18 karyawan aktif tanpa kode ikut hilang.
    assert.doesNotMatch(inner, /AND k\.kar_kode_absensi IS NOT NULL|kar_kode_absensi <> ''/)
})
