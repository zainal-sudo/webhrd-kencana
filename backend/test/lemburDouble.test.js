import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { buildOrderBy, applyAllColumnFilters } from '../src/helpers/browse.js'

const BARIS_DOUBLE = {
    Nik: '001', Kode: '1234', Nama: 'Budi', Pabrik: 'P04', Bagian: 'QC',
    Tanggal: '2026-10-01', Jumlah_SPL: 2, Nomor: 'LEM.202610.0001, LEM.202610.0002',
}

function fixture(rows = [BARIS_DOUBLE]) {
    const calls = []
    const res = { exported: null, data: null, pagination: null }
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
    vm.runInContext(source.replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '') + '\nglobalThis.run = getLemburDoubleList;', scope)
    return { calls, res, run: scope.run }
}

test('Lembur double dikelompokkan per Nik+tanggal dan hanya baris >1 nomor', async () => {
    const { calls, res, run } = fixture()
    await run({ query: {} }, res, err => { throw err })
    const sql = calls[0].sql
    // Sumber dtl+hdr di-refer lewat lem_nomor, bukan join tebak-tebakan.
    assert.match(sql, /INNER JOIN tlembur_hdr y ON y\.lem_nomor = x\.lemd_lem_nomor/)
    assert.match(sql, /y\.lem_tanggal BETWEEN \? AND \?/)
    // Kelompok identitas ganda: NIK + tanggal, syaratnya lebih dari 1 nomor / baris.
    assert.match(sql, /GROUP BY dbl\.Nik[\s\S]*Having?/i)
    assert.match(sql, /HAVING COUNT\(\*\) > 1/)
    assert.match(sql, /COUNT\(\*\) AS Jumlah_SPL/)
    assert.match(sql, /GROUP_CONCAT\(DISTINCT dbl\.Nomor ORDER BY dbl\.Nomor/)
    // Baca-saja.
    assert.doesNotMatch(sql, /INSERT|UPDATE|DELETE/i)
    // Daftar + count memakai sumber yang sama.
    assert.equal(calls.length, 2)
    assert.equal(res.data[0].Jumlah_SPL, 2)
    assert.match(res.data[0].Nomor, /LEM\.202610\.0001, LEM\.202610\.0002/)
    assert.equal(res.pagination.total, 1)
})

test('Periode dari start_date/end_date masuk parameter query pertama', async () => {
    const { calls, run } = fixture()
    await run({ query: { start_date: '2026-10-01', end_date: '2026-10-15' } }, {}, err => { throw err })
    assert.deepEqual(calls[0].params.slice(0, 2), ['2026-10-01', '2026-10-15'])
})

test('Export Excel memakai nama field sama dengan daftar', async () => {
    const { res, run } = fixture()
    await run({ query: { export: 'xlsx' } }, res, err => { throw err })
    assert.equal(res.exported.title, 'Detail-Lembur-Double')
    for (const key of ['Tanggal', 'Nik', 'Nama', 'Pabrik', 'Bagian', 'Jumlah_SPL', 'Nomor']) {
        assert.ok(res.exported.columns.includes(key), `kolom ${key} ada di Excel`)
        assert.ok(key in res.exported.data[0], `field ${key} terisi`)
    }
})

test('Route lembur-double terdaftar dengan hak frmLapDetailLembur + view & tombol terpasang', () => {
    const routes = readFileSync(new URL('../src/routes/laporanRoutes.js', import.meta.url), 'utf8')
    assert.match(routes, /getLemburDoubleList/)
    assert.match(routes, /'\/lembur-double', wajibHak\('frmLapDetailLembur'\)/)
    const router = readFileSync(new URL('../../frontend/src/router/index.ts', import.meta.url), 'utf8')
    assert.match(router, /path: "\/laporan\/lembur-double"/)
    assert.match(router, /LemburDoubleView\.vue/)
    const detail = readFileSync(new URL('../../frontend/src/views/laporan/DetailLemburView.vue', import.meta.url), 'utf8')
    assert.match(detail, /Indikasi Double/)
    assert.match(detail, /\/laporan\/lembur-double/)
    const view = readFileSync(new URL('../../frontend/src/views/laporan/LemburDoubleView.vue', import.meta.url), 'utf8')
    for (const key of ['Tanggal', 'Nik', 'Nama', 'Pabrik', 'Bagian', 'Jumlah_SPL', 'Nomor']) {
        assert.ok(view.includes(`key: "${key}"`), `kolom frontend ${key} ada`)
    }
    // Read-only: tidak ada mutasi di view baru.
    assert.doesNotMatch(view, /\.post\(|\.put\(|safeDelete/)
})

test('Tombol di kolom Nomor membuka Laporan Lembur terfilter (tanggal + NIK)', () => {
    const double = readFileSync(new URL('../../frontend/src/views/laporan/LemburDoubleView.vue', import.meta.url), 'utf8')
    assert.match(double, /bukaLembur/)
    assert.match(double, /search: String\(row\.Nik \?\? ""\)/)
    assert.match(double, /start_date: tanggal \|\| todaySql\(\)/)
    assert.match(double, /end_date: tanggal \|\| todaySql\(\)/)
    assert.match(double, /path: "\/laporan\/lembur"/)
    // Tombol ditempatkan di kolom aksi sendiri (bukan di dalam sel Nomor),
    // ikon panah menandakan merujuk ke halaman lain, keterangan hover
    // memakai tanggal dd-mm-yyyy.
    const cellSlot = double.match(/<template #cell[\s\S]*?<\/template>/)?.[0] ?? ""
    assert.ok(cellSlot, "slot cell ada")
    assert.doesNotMatch(cellSlot, /<button/)
    const actionsSlot = double.match(/<template #row-actions[\s\S]*?<\/template>/)?.[0] ?? ""
    assert.match(actionsSlot, /arrow_forward/)
    assert.match(actionsSlot, /tanggalId\(String\(row\.Tanggal \|\| ''\)\)/)
    assert.match(double, /expanded-action-hover/)
    // Judul tab juga dd/mm/yyyy.
    assert.match(double, /title: `Lembur \$\{tanggalId\(tanggal\)\}`/)
    assert.match(double, /\$\{d\}\/\$\{m\}\/\$\{y\}/)
    // Kolom aksi menyempit di view baru (satu tombol ikon saja).
    assert.match(double, /\.action-col[\s\S]{0,80}width: 44px/)
    // Ring fokus global tak memakai outline kaku di tombol kecil (klik mouse
    // & balik ke tab ikut terpicu); ring dipindah ke pill hover (::before)
    // sehingga lingkar fokus memenuhi ukuran sorotan hover.
    assert.match(double, /go:focus\) \{[\s\S]{0,10}outline: none !important/)
    assert.match(double, /go:focus-visible\) \{[\s\S]{0,10}outline: none !important/)
    assert.match(double, /go:focus::before|go:focus-visible::before/)
    assert.match(double, /outline: 2px solid currentColor/)
    // Halaman lembur menerima sikon deep-link.
    const lembur = readFileSync(new URL('../../frontend/src/views/laporan/LaporanLemburView.vue', import.meta.url), 'utf8')
    assert.match(lembur, /route\.query\.start_date/)
    assert.match(lembur, /route\.query\.end_date/)
    assert.match(lembur, /route\.query\.search/)
    assert.match(lembur, /:initial-search="qSearch"/)
    assert.match(lembur, /:default-start="qStart \|\| firstDayOfMonth\(\)"/)
    // BaseBrowse menyediakan pintu initialSearch (default kosong, aman halaman lain).
    const base = readFileSync(new URL('../../frontend/src/components/BaseBrowse.vue', import.meta.url), 'utf8')
    assert.match(base, /initialSearch\?: string/)
    assert.match(base, /initialSearch: ""/)
    assert.match(base, /ref\(props\.initialSearch \|\| ""\)/)
})
