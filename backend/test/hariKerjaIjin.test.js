import test from 'node:test'
import assert from 'node:assert/strict'
import { hitungHariKerjaIjin } from '../src/helpers/hariKerjaIjin.js'

test('Jumat hari pertama, Sabtu bekerja, Senin hari ketiga, Selasa wajib otorisasi', () => {
    assert.equal(hitungHariKerjaIjin('2026-10-09', '2026-10-09'), 1)
    assert.equal(hitungHariKerjaIjin('2026-10-09', '2026-10-10'), 2)
    assert.equal(hitungHariKerjaIjin('2026-10-09', '2026-10-12'), 3)
    assert.equal(hitungHariKerjaIjin('2026-10-09', '2026-10-13'), 4)
})

test('Libur dilewati tanpa menghitung ganda Minggu atau libur duplikat', () => {
    assert.equal(hitungHariKerjaIjin('2026-10-09', '2026-10-13', ['2026-10-10', '2026-10-10', '2026-10-11']), 3)
    assert.equal(hitungHariKerjaIjin('2026-10-09', '2026-10-13', ['2026-10-09']), 3)
})

test('Minggu tidak bekerja, tanggal mendatang nol, lintas bulan dihitung', () => {
    assert.equal(hitungHariKerjaIjin('2026-10-11', '2026-10-11'), 0)
    assert.equal(hitungHariKerjaIjin('2026-10-14', '2026-10-13'), 0)
    assert.equal(hitungHariKerjaIjin('2026-10-30', '2026-11-02'), 3)
    assert.throws(() => hitungHariKerjaIjin('2026-02-30', '2026-10-13'), /Tanggal tidak valid/)
})
