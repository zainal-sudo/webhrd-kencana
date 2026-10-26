import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

/**
 * Proses Gaji — kolom `2jam` di SQL_NILAI.
 *
 * Aturan (persetujuan 2026-10):
 * - Cap 2-jam-pertama dipakai PER HARI (LEAST per grup lem_tanggal),
 *   bukan per baris SPL seperti Delphi lama.
 * - Bagian SATPAM dan "IPAL & B3" tetap masuk 2jam (75%/jam) walaupun
 *   lemburnya di hari libur, karena bagi mereka hari libur tetap hari kerja.
 *   Bagian lain tetap 100% seluruh jamnya di hari libur.
 */
const source = readFileSync(new URL('../src/controllers/gaji/prosesGajiController.js', import.meta.url), 'utf8')
const nilai = source.slice(source.indexOf('const SQL_NILAI'), source.indexOf('/* ── petakanBaris') > 0 ? source.indexOf('/* ── petakanBaris') : source.indexOf('%START%') + 4000)

test('ProsesGaji: 2jam dikapas per hari (grup lem_tanggal), bukan per baris SPL', () => {
    assert.match(nilai, /ifnull\(\(select sum\(g\.c\) from \(select b2\.lem_tanggal, least\(sum\(if\(/)
    assert.match(nilai, /group by b2\.lem_tanggal\) g \),0\) 2jam/)
    // Pola lama per-baris tidak boleh tinggal.
    assert.doesNotMatch(nilai, /\) >if\(kar_sistem_gaji="Harian",1,2\),if\(kar_sistem_gaji="Harian",1,2\)/)
})

test('ProsesGaji: bagian SATPAM & IPAL & B3 di hari libur tetap masuk 2jam', () => {
    assert.match(nilai, /tk2\.kar_bagian in \("SATPAM","IPAL & B3"\)/)
    // Pengecualian hari libur (status 1) untuk bagian lain tetap dipertahankan.
    assert.match(nilai, /lem_tanggal not in \(select hl_tanggal from tharilibur where hl_status=1\)/)
})

test('ProsesGaji: lembur panggilan (100%) tetap di luar 2jam', () => {
    assert.match(nilai, /a2\.lemd_panggilan <> 1/, '2jam tidak menghitung panggilan')
    assert.match(nilai, /lemd_panggilan = 1/, 'panggilan punya subquery sendiri')
})

test('ProsesGaji: uang tetap dari kolom yang sama — 75% utk 2jam, 100% utk lebih & panggilan', () => {
    assert.ok(source.includes('(gapok / 7) * (75 / 100) * r.jam2'), 'tlembur2jam 75%')
    assert.ok(source.includes('(gapok / 7) * r.lembur2'), 'tlembur 100%')
    assert.ok(source.includes('(gapok / 7) * r.panggilan'), 'tlemburp 100%')
})
