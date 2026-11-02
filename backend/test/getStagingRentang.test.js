import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

/**
 * getStaging — isi data staging:
 *  - rentang Dari/Sampai <= 60 hari: daftar per hari memuat SEMUA tanggal
 *    kalender (jml 0 + adaData false utk tanggal kosong), urut terbaru.
 *  - rentang > 60 hari: hasil GROUP BY dipass-through dan terpotong = true.
 *  - tanpa filter: perilaku lama, tanpa terpotong.
 */
function muatStaging() {
    const calls = []
    let rowsPerData = []
    const scope = {
        pool: { async query(sql, params) {
            calls.push({ sql, params })
            if (/GROUP BY tanggal/.test(sql)) return [rowsPerData]
            return [[{ jml: 9, karyawan: 3, dari: '2026-11-02', sampai: '2026-11-02' }]]
        } },
        success: (res, data) => { scope.out = data },
        error: () => {},
        paginated: () => {},
        applyKaryawanLookup: () => ({ where: '', orderBy: '', params: [] }),
        buildOrderBy: () => '',
        applyAllColumnFilters: () => ({ clause: ' ', params: [], picks: {} }),
        normTanggal: (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '')) ? String(v) : null),
    }
    const source = readFileSync(new URL('../src/controllers/absensi/absensiController.js', import.meta.url), 'utf8')
    vm.createContext(scope)
    vm.runInContext(
        source.replace(/^import .*$/gm, '').replace(/^export /gm, '') +
        '\nglobalThis.run = getStaging;',
        scope
    )
    return { run: scope.run, calls, setRows: (r) => { rowsPerData = r }, out: () => scope.out }
}

const next = (err) => { throw err }

test('Rentang <= 60 hari melengkapi semua tanggal kalender dengan penanda adaData', async () => {
    const berkas = muatStaging()
    berkas.setRows([{ tanggal: '2026-11-02', jml: 5 }])
    await berkas.run({ query: { start_date: '2026-11-01', end_date: '2026-11-03' } }, {}, next)
    const { perHari, terpotong } = JSON.parse(JSON.stringify(berkas.out()))
    assert.equal(terpotong, false)
    assert.deepEqual(perHari, [
        { tanggal: '2026-11-03', jml: 0, adaData: false },
        { tanggal: '2026-11-02', jml: 5, adaData: true },
        { tanggal: '2026-11-01', jml: 0, adaData: false },
    ])
})

test('Rentang > 60 hari mempertahankan hasil GROUP BY dan menandai terpotong', async () => {
    const berkas = muatStaging()
    berkas.setRows([{ tanggal: '2026-03-01', jml: 2 }, { tanggal: '2026-01-01', jml: 1 }])
    await berkas.run({ query: { start_date: '2026-01-01', end_date: '2026-03-05' } }, {}, next)
    const { perHari, terpotong } = JSON.parse(JSON.stringify(berkas.out()))
    assert.equal(terpotong, true)
    assert.deepEqual(perHari, [{ tanggal: '2026-03-01', jml: 2 }, { tanggal: '2026-01-01', jml: 1 }])
})

test('Tanpa filter perilaku lama: passthrough tanpa terpotong', async () => {
    const berkas = muatStaging()
    berkas.setRows([{ tanggal: '2026-11-02', jml: 5 }])
    await berkas.run({ query: {} }, {}, next)
    const { perHari, terpotong } = berkas.out()
    assert.equal(terpotong, false)
    assert.deepEqual(perHari, [{ tanggal: '2026-11-02', jml: 5 }])
})
