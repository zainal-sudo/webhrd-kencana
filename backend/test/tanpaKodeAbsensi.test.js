import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { applyAllColumnFilters, buildOrderBy } from '../src/helpers/browse.js'

/**
 * Karyawan tanpa kode absensi tidak boleh masuk browse absensi/transaksi
 * attendance atau penggajian. Rekap Absensi dan Absensi Periode sengaja
 * menampilkan semua karyawan aktif; catatan dengan kode kosong tetap diabaikan.
 */
const PENJAGA = /(?:\w+\.)?kar_kode_absensi IS NOT NULL AND (?:\w+\.)?kar_kode_absensi <> ''/

function muatLaporan() {
    const calls = []
    const pool = {
        async query(sql, params) {
            calls.push(sql)
            if (/^\s*UPDATE/i.test(sql)) return [[]]
            if (sql.includes('COUNT(*)')) return [[{ total: 0 }]]
            return [[]]
        },
    }
    const source = readFileSync(new URL('../src/controllers/laporan/laporanController.js', import.meta.url), 'utf8')
        .replace(/^import .*$/gm, '').replace(/export const /g, 'const ')
    const context = { pool, applyAllColumnFilters, buildOrderBy,
        success: () => {}, paginated: () => {}, error: () => {},
        sendExcel: () => {},
    }
    vm.runInNewContext(
        source + '\nglobalThis.handlers = { getTidakMasukList, getAbsensiRekapList, getAbsensiPeriodeList };',
        context
    )
    return { handlers: context.handlers, calls }
}

function muatAbsensi() {
    const calls = []
    const scope = {
        pool: { async query(sql) { calls.push(sql); return sql.includes('COUNT(*)') ? [[{ total: 0 }]] : [[]] } },
        buildOrderBy, applyAllColumnFilters,
        success: () => {}, paginated: () => {}, error: () => {}, sendExcel: () => {},
    }
    vm.createContext(scope)
    const source = readFileSync(new URL('../src/controllers/absensi/absensiController.js', import.meta.url), 'utf8')
    vm.runInContext(source.replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '') + '\nglobalThis.handler = getAbsensiList;', scope)
    return { handler: scope.handler, calls }
}

const next = (err) => { throw err }

test('Browse absensi menyaring kode absensi kosong', async () => {
    const { handler, calls } = muatAbsensi()
    await handler({ query: { start_date: '2026-10-01', end_date: '2026-10-12' } }, {}, next)
    assert.ok(calls.length > 0)
    for (const sql of calls) assert.match(sql, PENJAGA)
})

test('Laporan tidak masuk menyaring kode absensi kosong', async () => {
    const { handlers, calls } = muatLaporan()
    await handlers.getTidakMasukList({ query: { start_date: '2026-10-01', end_date: '2026-10-12' }, body: {} }, {}, next)
    assert.ok(calls.length > 0)
    for (const sql of calls) assert.match(sql, PENJAGA)
})

test('Rekap absensi menampilkan karyawan aktif tanpa kode absensi', async () => {
    const { handlers, calls } = muatLaporan()
    await handlers.getAbsensiRekapList({ query: { start_date: '2026-10-01', end_date: '2026-10-12' } }, {}, next)
    const pilih = calls.filter((sql) => sql.toLowerCase().includes('final2.kar_nik'))
    assert.ok(pilih.length > 0)
    for (const sql of pilih) {
        assert.match(sql, /final2\.kar_status_aktif\s*=\s*1/i)
        assert.doesNotMatch(sql, /final2\.kar_kode_absensi IS NOT NULL AND final2\.kar_kode_absensi <> ''/i)
    }
})

test('Absensi periode menampilkan SEMUA karyawan aktif (aktif-only, tanpa syarat kode absensi)', async () => {
    // Kebijakan berubah (2026-10): aktif-only — karyawan aktif yang belum punya
    // kode absensi tetap tampil dengan baris '0'.
    const { handlers, calls } = muatLaporan()
    await handlers.getAbsensiPeriodeList({ query: { start_date: '2026-10-01', end_date: '2026-10-02' } }, {}, next)
    assert.ok(calls.length > 0)
    for (const sql of calls) {
        assert.match(sql, /kar_status_aktif = 1/)
        assert.doesNotMatch(sql, /AND (?:k\.)?kar_kode_absensi IS NOT NULL AND (?:k\.)?kar_kode_absensi <> ''/)
    }
})

test('Penggajian tidak lagi memasukkan karyawan tanpa kode absensi', async () => {
    const source = readFileSync(new URL('../src/controllers/gaji/prosesGajiController.js', import.meta.url), 'utf8')
    // Cabang OR khusus kode kosong dihapus dari InsertNilai.
    assert.doesNotMatch(source, /OR kar_kode_absensi = ""/)
    // InsertNilai (SQL_NILAI) dan tampilan (SQL_PROSES) menjaga kode terisi.
    assert.match(source, /AND kar_kode_absensi IS NOT NULL AND kar_kode_absensi <> ''/)
})

test('Daftar mangkir dashboard menyaring kode absensi kosong', async () => {
    const source = readFileSync(new URL('../src/controllers/dashboardController.js', import.meta.url), 'utf8')
    assert.match(source, PENJAGA)
})
