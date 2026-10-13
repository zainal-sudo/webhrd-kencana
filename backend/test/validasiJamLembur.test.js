import test from 'node:test'
import assert from 'node:assert/strict'
import { validasiJamLembur } from '../src/helpers/validasiJamLembur.js'

test('Jam valid dan kosong mengikuti aturan default', () => {
    assert.equal(validasiJamLembur([{ jam_mulai: '00:00:00', jam_akhir: '23:59:59' }, {}]), '')
})

test('Tolak jam, menit, detik di luar batas serta format tidak lengkap', () => {
    for (const value of ['88:00:00', '24:00:00', '08:60:00', '08:00:60', '08:00', 'abc']) {
        assert.match(validasiJamLembur([{}, { jam_akhir: value }]), /Baris 2 — Jam Akhir:/)
    }
})
