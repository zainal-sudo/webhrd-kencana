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
const nilai = source.slice(source.indexOf('const SQL_NILAI'), source.indexOf('const KOL_INSERT'))

test('ProsesGaji: 2jam dikapas per hari (grup lem_tanggal), bukan per baris SPL', () => {
    // 2jam kini derived aggregate j2 yang di-LEFT JOIN (tanpa korelasi),
    // grup per karyawan+tanggal, kap per hari lewat LEAST(SUM(...), cap).
    assert.match(nilai, /least\(sum\(if\(b2\.lem_tanggal not in \(select hl_tanggal from tharilibur where hl_status=1\)/)
    assert.match(nilai, /group by a2\.lemd_kar_nik, b2\.lem_tanggal\) d2/)
    assert.match(nilai, /group by d2\.lemd_kar_nik\) j2 on j2\.n=tkp\.kar_nik/)
    assert.match(nilai, /ifnull\(j2\.c,0\) 2jam/)
    // Regresi shadowing: di dalam blok j2 tidak boleh ada korelasi tak
    // berkualifikasi `=kar_nik` — MariaDB me-resolve-nya ke tk2.kar_nik
    // (anak-ayam selalu benar) sehingga filter NIK lenyap.
    const j2 = source.slice(source.indexOf('left join ('), source.indexOf('group by tkp.kar_nik)'))
    assert.ok(j2.length > 0 && j2.includes('lemd_kar_nik'), 'blok j2 ada')
    assert.doesNotMatch(j2, /lemd_kar_nik=kar_nik/)
    // Pola lama per-baris tidak boleh tinggal.
    assert.doesNotMatch(nilai, /\) >if\(kar_sistem_gaji="Harian",1,2\),if\(kar_sistem_gaji="Harian",1,2\)/)
})

test('ProsesGaji: bagian SATPAM & IPAL & B3 + dep MKTR di hari libur tetap masuk 2jam', () => {
    assert.match(nilai, /tk2\.kar_bagian in \("SATPAM","IPAL & B3"\)/)
    assert.match(nilai, /tk2\.kar_dep_kode = "MKTR"/, 'dep MKTR ikut pengecualian seperti detail lembur')
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
