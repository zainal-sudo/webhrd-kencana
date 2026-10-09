import crypto from 'node:crypto'

/**
 * Otorisasi model kode tantangan-respons ala Delphi (`UfrmOtorisasi`).
 *
 * Alur:
 *  1. Penyimpan data lama meminta tantangan -> `buatTantangan()` (6 digit
 *     acak) untuk ditampilkan di popup form.
 *  2. Pemberi otorisasi membuka halaman Generator, mengetik tantangan +
 *     modul -> `buatRespons()` (6 digit dari HMAC secret server).
 *  3. Penyimpan mengetik kode pemberi + respons -> `responsValid()` memeriksa
 *     HMAC pada jendela waktu berjalan & sebelumnya, lalu server menerbitkan
 *     token JWT yang dipakai saat simpan (kompatibel dengan `userDariToken`
 *     tiap modul: `tipe` = nama modul, `otorisasi` = kode pemberi).
 *
 * Stateless: tantangan tidak disimpan di server; respons terikat jendela
 * waktu 5 menit (ditambah 1 jendela toleransi) sehingga kode kedaluwarsa
 * sendiri ±10 menit. Secret tidak pernah keluar dari server.
 */

export const MODUL_KE_FORM = {
    absensi: 'frmAbsensi',
    ijin: 'frmIjin',
    lembur: 'frmLembur',
}

/** Lebar satu jendela waktu (5 menit) + jumlah jendela ke belakang yang diterima. */
const WINDOW_MS = 5 * 60 * 1000
const WINDOW_SLACK = 1

function secret() {
    return String(process.env.OTORISASI_SECRET || process.env.JWT_SECRET || '')
}

export function modulValid(modul) {
    return Object.hasOwn(MODUL_KE_FORM, String(modul || ''))
}

export function tantanganValid(tantangan) {
    return /^\d{6}$/.test(String(tantangan || ''))
}

/** 6 digit acak, boleh berawalan nol (dikembalikan sebagai string). */
export function buatTantangan() {
    return String(crypto.randomInt(0, 1000000)).padStart(6, '0')
}

function jendelaSaatIni(now = Date.now()) {
    return Math.floor(now / WINDOW_MS)
}

function turunanRespons(modul, tantangan, pemberi, jendela) {
    const h = crypto.createHmac('sha256', secret())
    h.update(`${modul}|${tantangan}|${pemberi}|${jendela}`)
    const angka = parseInt(h.digest('hex').slice(0, 12), 16) % 1000000
    return String(angka).padStart(6, '0')
}

/** Respons untuk tantangan + kode pemberi pada jendela waktu berjalan. */
export function buatRespons(modul, tantangan, pemberi, now = Date.now()) {
    return turunanRespons(String(modul), String(tantangan), normPemberi(pemberi), jendelaSaatIni(now))
}

export function normPemberi(pemberi) {
    return String(pemberi || '').trim().toUpperCase()
}

/**
 * Respons cocok bila sama dengan turunan pada jendela berjalan atau
 * `WINDOW_SLACK` jendela sebelumnya (toleransi jam & keterlambatan ketik).
 */
export function responsValid(modul, tantangan, pemberi, respons, now = Date.now()) {
    if (!secret()) return false
    if (!modulValid(modul) || !tantanganValid(tantangan)) return false
    const p = normPemberi(pemberi)
    if (!p || p.length > 30) return false
    if (!tantanganValid(respons)) return false
    const w = jendelaSaatIni(now)
    for (let i = 0; i <= WINDOW_SLACK; i += 1) {
        if (turunanRespons(String(modul), String(tantangan), p, w - i) === String(respons)) return true
    }
    return false
}
