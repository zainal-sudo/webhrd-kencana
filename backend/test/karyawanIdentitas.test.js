import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { success, error, paginated } from '../src/helpers/response.js'
import { applyAllColumnFilters, buildOrderBy } from '../src/helpers/browse.js'
import { normalisasiIdentitas, kandidatIdentitas, polaIdentitasLegacy } from '../src/helpers/identitasKaryawan.js'

const source = readFileSync(new URL('../src/controllers/master/karyawanController.js', import.meta.url), 'utf8')

/**
 * Fixture saveKaryawan dengan simulasi query identitas.
 * `exactRows` = hasil query pencocokan persis; `fallbackRows` = hasil
 * fallback REGEXP (data legacy kotor di DB) — dipisah agar tes bisa
 * memastikan urutan exact → fallback.
 */
function fixture({ nikExists = false, exactRows = [], fallbackRows = exactRows, kunci = 1, namaDb = 'Lama', identitasDb = '' } = {}) {
    const calls = []
    const conn = {
        async query(sql, params = []) {
            calls.push({ sql, params: [...params] })
            if (sql.includes('GET_LOCK')) return [[{ kunci }]]
            if (sql.includes('RELEASE_LOCK')) return [[{ lepas: 1 }]]
            if (sql.startsWith('SELECT kar_Nik, kar_status_aktif')) {
                return [nikExists ? [{ kar_Nik: '001', kar_status_aktif: 1, kar_noidentitas: identitasDb, kar_nama: namaDb }] : []]
            }
            if (sql.includes('kar_noidentitas = ?')) return [exactRows]
            if (sql.includes('kar_noidentitas REGEXP ?')) return [fallbackRows]
            return [[]]
        },
        async beginTransaction() {}, async commit() {}, async rollback() {}, release() {},
    }
    const scope = {
        pool: { getConnection: async () => conn, query: conn.query }, success, error, paginated,
        applyAllColumnFilters, buildOrderBy, nomorNik: async () => '010', nomorKodeAbsensi: async () => '999',
        sendExcel() {}, kandidatIdentitas, polaIdentitasLegacy,
    }
    vm.createContext(scope)
    vm.runInContext(source.replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '') + '\nglobalThis.handlers = { saveKaryawan, cekIdentitas };', scope)
    const save = async (body, { method = 'POST', user = 'HRD', paramNik } = {}) => {
        const res = { statusCode: 200, status(code) { this.statusCode = code; return this }, json(value) { this.body = value; return this } }
        await scope.handlers.saveKaryawan({
            method, user: { user },
            params: method === 'PUT' ? { nik: paramNik ?? '001' } : {},
            body: { kar_nama: 'Karyawan Baru', kar_pab_kode: 'P01', kar_tgl_masuk: '2026-01-01', kar_status_aktif: 1, ...body },
        }, res, err => { throw err })
        return res
    }
    return { calls, save }
}

const AKTIF_LAIN = { kar_Nik: '009', kar_nama: 'Aktif Orang', kar_status_aktif: 1, kar_tgl_masuk: '2020-01-01', kar_tgl_keluar: null }
const NONAKTIF_LAMA = { kar_Nik: '008', kar_nama: 'Pernah Kerja', kar_status_aktif: 0, kar_tgl_masuk: '2018-01-01', kar_tgl_keluar: '2021-01-01' }

test('1. No. Identitas baru lolos dan tersimpan persis seperti input (tanpa normalisasi)', async () => {
    const f = fixture()
    const res = await f.save({ kar_noidentitas: '3309112712800010' })
    assert.equal(res.statusCode, 201)
    const insert = f.calls.find(c => c.sql.startsWith('INSERT INTO tkaryawan ('))
    const idx = insert.sql.indexOf('`kar_noidentitas`')
    const pos = insert.sql.slice(0, idx).split(',').length
    assert.equal(insert.params[pos - 1], '3309112712800010')
})

test('2. Exact duplicate dengan karyawan aktif → 409 dengan nama pemakai', async () => {
    const f = fixture({ exactRows: [AKTIF_LAIN] })
    const res = await f.save({ kar_noidentitas: '3309112712800010' })
    assert.equal(res.statusCode, 409)
    assert.equal(res.body.message, 'No. Identitas ini sudah digunakan oleh karyawan aktif: 009 - Aktif Orang.')
    assert.ok(!f.calls.some(c => /^(INSERT|UPDATE)/.test(c.sql)))
    assert.ok(!f.calls.some(c => c.sql.includes('kar_noidentitas REGEXP ?')), 'exact match tidak perlu fallback')
})

test('3. Duplicate aktif lewat data legacy kotor (suffix "(2)") → tetap 409', async () => {
    const f = fixture({ fallbackRows: [AKTIF_LAIN] })
    // Input bersih; baris legacy di DB "3309... (2)" cocok lewat fallback REGEXP.
    const res = await f.save({ kar_noidentitas: '3309112712800010' })
    assert.equal(res.statusCode, 409)
    const fallback = f.calls.find(c => c.sql.includes('kar_noidentitas REGEXP ?'))
    assert.ok(fallback, 'fallback REGEXP harus dipakai bila exact tidak menemukan')
    assert.equal(fallback.params[0], polaIdentitasLegacy('3309112712800010'))
})

test('4. Duplicate hanya dengan karyawan nonaktif → save tetap jalan + peringatan_identitas', async () => {
    const f = fixture({ exactRows: [NONAKTIF_LAMA] })
    const res = await f.save({ kar_noidentitas: '3309112712800010' })
    assert.equal(res.statusCode, 201)
    assert.equal(JSON.stringify(res.body.data.peringatan_identitas), JSON.stringify([{
        nik: '008', nama: 'Pernah Kerja', tgl_masuk: '2018-01-01', tgl_keluar: '2021-01-01',
    }]))
})

test('5+6. Rehire: INSERT berhasil, mendapat NIK generator baru, dan TANPA penambahan "(2)" otomatis', async () => {
    const f = fixture({ exactRows: [NONAKTIF_LAMA] })
    const res = await f.save({ kar_noidentitas: '3309112712800010', kar_nama: 'SULAIMAN ROSYID' })
    assert.equal(res.statusCode, 201)
    assert.equal(res.body.data.kar_Nik, '010', 'NIK dari generator, bukan salinan NIK lama')
    const insert = f.calls.find(c => c.sql.startsWith('INSERT INTO tkaryawan ('))
    assert.equal(insert.params[0], '010')
    assert.equal(insert.params[1], 'SULAIMAN ROSYID', 'nama tidak boleh otomatis diberi suffix (2)')
})

test('7. Edit tanpa mengubah identitas → tidak dicek duplicate, tidak ada warning diri sendiri', async () => {
    const f = fixture({ nikExists: true, identitasDb: '3309112712800010' })
    const res = await f.save({ kar_noidentitas: '3309112712800010' }, { method: 'PUT' })
    assert.equal(res.statusCode, 200)
    assert.ok(!f.calls.some(c => c.sql.includes('GET_LOCK')), 'lock & cek identitas tidak perlu dijalankan')
    assert.ok(!f.calls.some(c => c.sql.includes('kar_noidentitas = ?') || c.sql.includes('kar_noidentitas REGEXP ?')))
    assert.equal(res.body.data.peringatan_identitas, undefined)
})

test('8. Edit mengganti identitas ke karyawan aktif lain → ditolak 409', async () => {
    const f = fixture({ nikExists: true, identitasDb: '111', fallbackRows: [AKTIF_LAIN] })
    const res = await f.save({ kar_noidentitas: '3309112712800010' }, { method: 'PUT' })
    assert.equal(res.statusCode, 409)
    assert.ok(!f.calls.some(c => c.sql.startsWith('UPDATE tkaryawan')))
    // Record yang sedang diedit sendiri harus dikecualikan dari pencocokan.
    const lookup = f.calls.find(c => c.sql.includes('kar_noidentitas = ?'))
    assert.ok(lookup.sql.includes('kar_Nik <> ?'))
    assert.equal(lookup.params.at(-1), '001')
})

test('9. Edit mengganti identitas ke milik record nonaktif → warning, save tetap jalan', async () => {
    const f = fixture({ nikExists: true, identitasDb: '111', exactRows: [NONAKTIF_LAMA] })
    const res = await f.save({ kar_noidentitas: '3309112712800010' }, { method: 'PUT' })
    assert.equal(res.statusCode, 200)
    assert.equal(res.body.data.peringatan_identitas[0].nik, '008')
})

test('10. kar_Nik tetap tidak dapat diubah saat PUT (behavior reject dipertahankan)', async () => {
    const f = fixture({ nikExists: true })
    const res = await f.save({ kar_Nik: '999' }, { method: 'PUT', paramNik: '001' })
    assert.equal(res.statusCode, 400)
    assert.equal(res.body.message, 'NIK pada body tidak boleh berbeda dari NIK pada URL')
})

test('11. Data tersimpan tidak dinormalisasi (input kotor diterima apa adanya)', async () => {
    const f = fixture({ exactRows: [] })
    // Input mengandung suffix kotor; normalisasi hanya untuk pencocokan.
    const res = await f.save({ kar_noidentitas: ' 3309112712800010 ' })
    assert.equal(res.statusCode, 201)
    const insert = f.calls.find(c => c.sql.startsWith('INSERT INTO tkaryawan ('))
    const idx = insert.sql.indexOf('`kar_noidentitas`')
    const pos = insert.sql.slice(0, idx).split(',').length
    assert.equal(insert.params[pos - 1], ' 3309112712800010 ', 'nilai persis dari body, bukan hasil normalisasi')
})

test('12. Identitas kosong → tidak ada cek duplicate, tidak ada lock, save normal', async () => {
    for (const kosong of ['', '   ', undefined]) {
        const f = fixture()
        const res = await f.save(kosong === undefined ? {} : { kar_noidentitas: kosong })
        assert.equal(res.statusCode, 201)
        assert.ok(!f.calls.some(c => c.sql.includes('GET_LOCK') || c.sql.includes('kar_noidentitas = ?') || c.sql.includes('kar_noidentitas REGEXP ?')))
    }
})

test('Lock diambil sebelum cek identitas dan dilepas setelah write', async () => {
    const f = fixture({ exactRows: [NONAKTIF_LAMA] })
    await f.save({ kar_noidentitas: '3309112712800010' })
    const urutan = f.calls.map(c => c.sql.includes('GET_LOCK') ? 'GET_LOCK'
        : c.sql.includes('kar_noidentitas = ?') ? 'CEK'
            : c.sql.startsWith('INSERT') ? 'INSERT'
                : c.sql.includes('RELEASE_LOCK') ? 'RELEASE' : null).filter(Boolean)
    assert.deepEqual(urutan, ['GET_LOCK', 'CEK', 'INSERT', 'RELEASE'])
})

test('Lock tidak tersedia (kunci=0) → save tetap berlanjut (best-effort), tanpa RELEASE', async () => {
    const f = fixture({ exactRows: [], kunci: 0 })
    const res = await f.save({ kar_noidentitas: '3309112712800010' })
    assert.equal(res.statusCode, 201)
    assert.ok(!f.calls.some(c => c.sql.includes('RELEASE_LOCK')))
})

test('Helper normalisasi: konservatif, hanya suffix rehire & kurung pembungkus', () => {
    assert.equal(normalisasiIdentitas('3309112712800010 (2)'), '3309112712800010')
    assert.equal(normalisasiIdentitas('3309112712800010(1)'), '3309112712800010')
    assert.equal(normalisasiIdentitas('(3309112712800010)'), '3309112712800010')
    assert.equal(normalisasiIdentitas('  3309112712800010  '), '3309112712800010')
    assert.equal(normalisasiIdentitas('3309-1127-1280'), '3309-1127-1280', 'tanda baca di tengah TIDAK dibuang')
    assert.equal(normalisasiIdentitas('1234(5678)'), '1234(5678)', 'kurung di tengah nilai bukan suffix rehire')
    assert.equal(normalisasiIdentitas(''), '')
    assert.equal(normalisasiIdentitas(null), '')
    // Exact didahulukan, normalisasi sebagai fallback.
    assert.deepEqual(kandidatIdentitas('3309 (2)'), ['3309 (2)', '3309'])
    assert.deepEqual(kandidatIdentitas('3309'), ['3309'])
    assert.deepEqual(kandidatIdentitas(''), [])
})
