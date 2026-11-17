/**
 * Import sekali-jalan: DATA MOU SEWA.xlsx → tabel hrd2.tmou_sewa.
 *
 * Pemakaian (jalankan dari folder backend):
 *   node scripts/import-mou-sewa.mjs ["path/ke/DATA MOU SEWA.xlsx"]
 *   node scripts/import-mou-sewa.mjs --dry   # lihat hasil parse tanpa insert
 *
 * Aturan parsing (file Excel campur format):
 *  - Sel tanggal asli Excel (Date)  → yyyy-mm-dd apa adanya.
 *  - Teks "dd/mm/yyyy"              → diparse manual (dd/mm/yyyy, bukan US).
 *  - Typo tahun 5 digit (20206)     → dicoba hapus 1 digit agar masuk rentang wajar.
 *  - "30/09'2028"                   → karakter non-digit dihapus.
 *  - Grup riwayat: baris dengan TEMPAT + ALAMAT yang sama (normalisasi
 *    huruf/tanda baca) dianggap satu kelompok riwayat periode.
 *  - Nomor surat disalin apa adanya (tidak digenerate/diperbaiki).
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ExcelJS from 'exceljs'
import mysql from 'mysql2/promise'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DRY = process.argv.includes('--dry')
const argPath = process.argv.slice(2).find((a) => !a.startsWith('--'))
const FILE_XLSX = path.resolve(argPath || path.join(__dirname, '../../../DATA MOU SEWA.xlsx'))

const TAHUN_MIN = new Date().getFullYear() - 3
const TAHUN_MAKS = new Date().getFullYear() + 5

/** "dd/mm/yyyy" fleksibel → "yyyy-mm-dd" | null. */
function parseTeksTanggal(teks) {
  // Karakter asing (mis. koma/titik/apostrof pada "30/09'2028") dianggap pemisah.
  let s = String(teks).replace(/[^0-9/]+/g, '/').replace(/\/+/g, '/').replace(/^\/|\/$/g, '')
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d+)$/.exec(s)
  if (!m) return null
  let [, d, bln, y] = m
  if (y.length !== 4) {
    // Typo tahun: cari kandidat 4 digit dalam rentang wajar dgn menghapus 1 digit.
    const kandidat = []
    for (let i = 0; i < y.length; i++) {
      const coba = Number((y.slice(0, i) + y.slice(i + 1)).replace(/^0+(?=\d)/, ''))
      if (coba >= TAHUN_MIN && coba <= TAHUN_MAKS) kandidat.push(String(coba))
    }
    if (kandidat.length !== 1) return null // ambigu → biarkan terlihat saat review
    y = kandidat[0]
    console.log(`  · perbaiki tahun typo "${y}" ← "${m[3]}"`)
  }
  const hari = String(Number(d)).padStart(2, '0')
  const bulan = String(Number(bln)).padStart(2, '0')
  return `${y}-${bulan}-${hari}`
}

/** Nilai sel Excel (Date | string) → "yyyy-mm-dd" | null. */
function keTanggal(nilai) {
  if (nilai == null || nilai === '') return null
  if (nilai instanceof Date && !Number.isNaN(nilai.getTime())) {
    const t = new Date(nilai.getTime() - nilai.getTimezoneOffset() * 60000)
    return t.toISOString().slice(0, 10)
  }
  if (typeof nilai === 'object' && typeof nilai.text === 'string') return keTanggal(nilai.text)
  return parseTeksTanggal(nilai)
}

/** Kunci grup: tempat + alamat dinormalkan (huruf besar, tanpa tanda baca). */
const kunciGrup = (tempat, alamat) =>
  `${String(tempat).toUpperCase().replace(/[^A-Z0-9]/g, '')}|${String(alamat || '').toUpperCase().replace(/[^A-Z0-9]/g, '')}`

/* ── 1. Baca & parse Excel ──────────────────────────────────────────────── */
const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile(FILE_XLSX)
const ws = wb.worksheets[0]

const barisMentah = []
ws.eachRow((row, no) => {
  if (no === 1) return // header
  const get = (col) => {
    const c = row.getCell(col)
    return c && c.value !== null && c.value !== undefined ? c.value : null
  }
  const noSurat = String(get(1) ?? '').trim()
  const tempat = String(get(2) ?? '').trim()
  if (!noSurat && !tempat) return
  barisMentah.push({
    noSurat,
    tempat,
    alamat: String(get(3) ?? '').trim(),
    awal: keTanggal(get(4)),
    berakhir: keTanggal(get(5)),
  })
})

if (!barisMentah.length) {
  console.error('Tidak ada baris data terbaca dari', FILE_XLSX)
  process.exit(1)
}

// Grup berdasarkan tempat+alamat; baris pertama tiap grup jadi induk grup.
const grupMap = new Map()
const barisFinal = barisMentah.map((b) => {
  const kunci = kunciGrup(b.tempat, b.alamat)
  if (!grupMap.has(kunci)) grupMap.set(kunci, grupMap.size + 1)
  return { ...b, grupSementara: grupMap.get(kunci) }
})

console.log(`Terbaca ${barisFinal.length} baris, ${grupMap.size} kelompok riwayat:`)
for (const b of barisFinal) {
  console.log(
    `  [g${b.grupSementara}] ${b.noSurat || '(tanpa no surat)'} | ${b.tempat} | ${b.awal || 'TGL?'} → ${b.berakhir || 'TGL?'}`
  )
}
const bermasalah = barisFinal.filter((b) => !b.awal || !b.berakhir || !b.tempat || !b.noSurat)
if (bermasalah.length) {
  console.warn('\nPERHATIAN — baris berikut perlu dicek (tanggal gagal diparse / kolom kosong):')
  for (const b of bermasalah) console.warn(`  ${b.noSurat || '?'} | ${b.tempat} | awal=${b.awal} berakhir=${b.berakhir}`)
}
if (DRY) {
  console.log('\n(--dry) Tidak ada data yang ditulis.')
  process.exit(0)
}

/* ── 2. Insert ke tmou_sewa ─────────────────────────────────────────────── */
// mou_grup final = mou_id baris perdana grup: insert perdana dgn mou_grup=0,
// update mou_grup=mou_id, lalu baris lanjutan memakai mou_grup tersebut.
const pool = mysql.createPool({
  host: process.env.DB_HOST || '103.94.238.252',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'kencana',
  password: process.env.DB_PASS || 'Kencana#123',
  database: process.env.DB_NAME || 'hrd2',
  charset: 'latin1',
  connectionLimit: 4,
})

const [[ada]] = await pool.query("SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'tmou_sewa'")
if (!ada.c) {
  console.error('Tabel tmou_sewa belum ada. Jalankan dulu backend/migrations/20261117_mou_sewa.sql.')
  process.exit(1)
}
const [[sudah]] = await pool.query('SELECT COUNT(*) AS c FROM tmou_sewa')
if (sudah.c) {
  console.error(`Tabel tmou_sewa sudah berisi ${sudah.c} baris — import dibatalkan agar tidak dobel.`)
  process.exit(1)
}

const conn = await pool.getConnection()
try {
  await conn.beginTransaction()
  const grupFinal = new Map()
  let n = 0
  for (const b of barisFinal) {
    const [r] = await conn.query(
      `INSERT INTO tmou_sewa (mou_grup, mou_no_surat, mou_tempat, mou_alamat, mou_awal, mou_berakhir, mou_created_by)
       VALUES (0, ?, ?, ?, ?, ?, 'IMPORT')`,
      [b.noSurat, b.tempat, b.alamat || null, b.awal, b.berakhir]
    )
    const id = r.insertId
    let grup = grupFinal.get(b.grupSementara)
    if (!grup) {
      await conn.query('UPDATE tmou_sewa SET mou_grup = mou_id WHERE mou_id = ?', [id])
      grup = id
      grupFinal.set(b.grupSementara, id)
    } else {
      await conn.query('UPDATE tmou_sewa SET mou_grup = ? WHERE mou_id = ?', [grup, id])
    }
    n++
  }
  await conn.commit()
  console.log(`\nSelesai: ${n} baris dimasukkan, ${grupFinal.size} kelompok riwayat.`)
} catch (err) {
  await conn.rollback()
  console.error('Import gagal, dibatalkan:', err.message)
  process.exitCode = 1
} finally {
  conn.release()
  await pool.end()
}
