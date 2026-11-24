/**
 * Verifikasi endpoint NOMOR URUT Surat Panggilan Karyawan (database):
 *   · counter per bulan `tnomor_surat_panggilan`;
 *   · nomor yang MELEKAT pada data `tsurat_panggilan_terbit`
 *     (nik + nama + rentang tanggal tidak masuk).
 *
 * Memastikan:
 *   · GET (peek) menampilkan urut berikutnya TANPA memakai angka;
 *   · POST menaikkan counter tepat +1 & mengembalikan nomor;
 *   · 5 POST PARALEL → naik tepat 5, nomor unik (anti-tabrakan antar komputer);
 *   · counter terpisah per bulan (bulan A tidak mengganggu bulan B);
 *   · DATA YANG SAMA → nomor yang SAMA (tidak menaikkan urut, walau POST ulang);
 *   · rentang tanggal berbeda → nomor baru;
 *   · nomor ketikan HR disimpan apa adanya (counter tidak dipakai);
 *   · bulan tidak valid → 400; non-HR → 403; tanpa token → 401.
 *
 * Jalankan (backend harus hidup: `npm run dev`):
 *   node scripts/verifikasi-nomor-surat.mjs
 * Memakai bulan uji 2099-01/02/03 dan menghapusnya lagi di akhir.
 */
import assert from 'node:assert/strict'
import 'dotenv/config'
import jwt from 'jsonwebtoken'
import pool from '../src/config/database.js'

const BASE = `${process.env.UJI_BASE || `http://127.0.0.1:${process.env.PORT || 4003}`}/api`
const API = '/dashboard/surat-panggilan/nomor'
const BULAN_A = '2099-01'
const BULAN_B = '2099-02'
const BULAN_C = '2099-03'
const BULAN_UJI = [BULAN_A, BULAN_B, BULAN_C]
const TABEL = 'tnomor_surat_panggilan'
const TABEL_TERBIT = 'tsurat_panggilan_terbit'

async function panggil(path, { method = 'GET', token, body } = {}) {
    const res = await fetch(BASE + path, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    })
    let json = null
    try { json = await res.json() } catch { /* body kosong */ }
    return { status: res.status, json }
}

const login = await panggil('/login', { method: 'POST', body: { user_kode: 'HRD', user_password: '5757' } })
assert.equal(login.status, 200, `login HRD gagal: ${login.status} ${JSON.stringify(login.json)}`)
const token = login.json?.data?.token
assert.ok(token, 'token HRD tidak diterima')

// Pastikan tabel ada (GET membuat tabel) lalu bersihkan sisa uji sebelumnya.
await panggil(`${API}?bulan=${BULAN_A}`, { token })
await pool.query(`DELETE FROM ${TABEL} WHERE no_bulan IN (?, ?, ?)`, BULAN_UJI)
await pool.query(`DELETE FROM ${TABEL_TERBIT} WHERE sp_bulan IN (?, ?, ?)`, BULAN_UJI)

const peek = async (bulan, identitas = {}, tokenUji = token) => {
    const qs = new URLSearchParams({ bulan, ...identitas }).toString()
    const r = await panggil(`${API}?${qs}`, { token: tokenUji })
    assert.equal(r.status, 200, `peek ${bulan} → ${r.status} ${JSON.stringify(r.json)}`)
    return r.json.data
}
const ambil = async (bulan, isi = {}, tokenUji = token) => {
    const r = await panggil(API, { method: 'POST', token: tokenUji, body: { bulan, ...isi } })
    assert.equal(r.status, 200, `POST ${bulan} → ${r.status} ${JSON.stringify(r.json)}`)
    return r.json.data
}

const hasil = []
const cek = (nama, benar, info = '') => {
    hasil.push({ nama, benar })
    assert.ok(benar, `${nama}${info ? ' — ' + info : ''}`)
    console.log(`  ✔ ${nama}${info ? ` (${info})` : ''}`)
}

console.log('1) Peek tidak memakai angka')
cek('peek bulan kosong = 1', (await peek(BULAN_A)).urut === 1)
cek('peek dua kali tetap 1', (await peek(BULAN_A)).urut === 1)

console.log('2) POST menaikkan tepat satu')
cek('POST pertama = 1', (await ambil(BULAN_A)).urut === 1)
cek('peek setelah POST = 2', (await peek(BULAN_A)).urut === 2)
cek('POST kedua = 2', (await ambil(BULAN_A)).urut === 2)

console.log('3) 5 POST paralel (anti-tabrakan)')
const paralel = (await Promise.all(Array.from({ length: 5 }, () => ambil(BULAN_A))))
    .map((d) => d.urut)
cek('5 POST paralel = 3..7 tanpa duplikat',
    JSON.stringify([...paralel].sort((a, b) => a - b)) === JSON.stringify([3, 4, 5, 6, 7]),
    JSON.stringify(paralel))
cek('peek akhir bulan A = 8', (await peek(BULAN_A)).urut === 8)

console.log('4) Isolasi per bulan')
cek('bulan B mulai dari 1', (await ambil(BULAN_B)).urut === 1)
cek('peek bulan B = 2', (await peek(BULAN_B)).urut === 2)
cek('bulan A tidak terpengaruh = 8', (await peek(BULAN_A)).urut === 8)

console.log('5) Nomor MELEKAT: data sama → nomor sama, data lain → nomor baru')
const ID = { nik: 'UJI-0001', nama: 'UJI MELEKAT SATU', tgl_awal: '2099-03-05', tgl_akhir: '2099-03-07' }
const ID_LAIN = { ...ID, tgl_akhir: '2099-03-08' } // rentang tanggal berbeda = data berbeda
const MANUAL = { nik: 'UJI-0002', nama: 'UJI MANUAL', tgl_awal: '2099-03-05', tgl_akhir: '2099-03-07' }

const peekBaru = await peek(BULAN_C, ID)
cek('peek data baru: belum tersimpan', peekBaru.tersimpan === false, JSON.stringify(peekBaru))
cek('peek data baru: urut berikutnya = 1', peekBaru.urut === 1)

const terbit1 = await ambil(BULAN_C, ID)
cek('POST data baru = urut 1', terbit1.urut === 1, JSON.stringify(terbit1))
cek('nomor berbentuk <urut>/HRD&GA/III/2099', /^1\/HRD&GA\/III\/2099$/.test(terbit1.nomor || ''), terbit1.nomor)

const peekLagi = await peek(BULAN_C, ID)
cek('peek data yang sama: tersimpan = true', peekLagi.tersimpan === true)
cek('peek data yang sama: nomor SAMA', peekLagi.nomor === terbit1.nomor, peekLagi.nomor)
cek('peek data yang sama: counter TIDAK naik (urut tetap 2)', peekLagi.urut === terbit1.urut)

const terbitUlang = await ambil(BULAN_C, ID)
cek('POST ulang data yang sama: nomor SAMA', terbitUlang.nomor === terbit1.nomor, terbitUlang.nomor)
cek('POST ulang data yang sama: urut tidak bertambah',
    (await peek(BULAN_C)).urut === 2, JSON.stringify(await peek(BULAN_C)))

const terbitLain = await ambil(BULAN_C, ID_LAIN)
cek('rentang tanggal BEDA → nomor BARU (urut 2)', terbitLain.urut === 2 && terbitLain.nomor !== terbit1.nomor,
    `${terbit1.nomor} → ${terbitLain.nomor}`)

const terbitManual = await ambil(BULAN_C, { ...MANUAL, nomor: '99/HRD&GA/III/2099' })
cek('nomor ketikan HR disimpan apa adanya', terbitManual.nomor === '99/HRD&GA/III/2099', terbitManual.nomor)
cek('nomor ketikan HR tidak memakai counter (urut 0)', Number(terbitManual.urut) === 0)
const peekManual = await peek(BULAN_C, MANUAL)
cek('peek nomor manual: tersimpan = true & nomor sama',
    peekManual.tersimpan === true && peekManual.nomor === '99/HRD&GA/III/2099', peekManual.nomor)
cek('counter bulan C tetap 2 (manual tidak menaikkan)', (await peek(BULAN_C)).urut === 3,
    JSON.stringify(await peek(BULAN_C)))

console.log('6) Validasi & otorisasi')
const bulanSalah = await panggil(`${API}?bulan=2099-13`, { token })
cek('bulan tidak valid → 400', bulanSalah.status === 400, String(bulanSalah.status))
const tokenNonHr = jwt.sign({ user: 'KARYAWAN' }, process.env.JWT_SECRET)
cek('non-HR peek → 403', (await panggil(`${API}?bulan=${BULAN_A}`, { token: tokenNonHr })).status === 403)
cek('non-HR POST → 403', (await panggil(API, { method: 'POST', token: tokenNonHr, body: { bulan: BULAN_A } })).status === 403)
cek('tanpa token → 401', (await panggil(`${API}?bulan=${BULAN_A}`)).status === 401)

console.log('7) Struktur tabel')
const [kolomCounter] = await pool.query(`SHOW COLUMNS FROM ${TABEL}`)
const daftarCounter = kolomCounter.map((k) => k.Field).join(',')
cek('tabel counter hanya angka per bulan', !/nik|nama/i.test(daftarCounter), daftarCounter)
const [kolomTerbit] = await pool.query(`SHOW COLUMNS FROM ${TABEL_TERBIT}`)
const daftarTerbit = kolomTerbit.map((k) => k.Field).join(',')
cek('tabel terbit menyimpan identitas data + nomor',
    /sp_nama/.test(daftarTerbit) && /sp_tgl_awal/.test(daftarTerbit) && /sp_tgl_akhir/.test(daftarTerbit) &&
    /sp_nomor/.test(daftarTerbit), daftarTerbit)

await pool.query(`DELETE FROM ${TABEL} WHERE no_bulan IN (?, ?, ?)`, BULAN_UJI)
await pool.query(`DELETE FROM ${TABEL_TERBIT} WHERE sp_bulan IN (?, ?, ?)`, BULAN_UJI)

console.log(`\nSEMUA ${hasil.length} PEMERIKSAAN LULUS ✅`)
await pool.end()
