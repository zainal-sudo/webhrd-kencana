import pool from '../src/config/database.js'
import { rekapAbsensiSql } from '../src/controllers/laporan/laporanController.js'
import { rekapCepatSql } from '../src/controllers/dashboard/analisisController.js'

const PERIODE = [
  ['2026-10-01', '2026-10-31'], // bulan berjalan
  ['2026-09-01', '2026-09-30'], // bulan lampau
  ['2026-08-01', '2026-08-31'], // dua bulan lampau
]
const KOLOM = ['Total_Hari', '2_Jam_Pertama', 'Lebih dari 2 Jam', 'Panggilan', 'TotalLembur',
  'Bonus_Malam_Libur', 'Bonus_Libur', 'terlambat', 'ST_HARI', 'sakit', 'Ijin', 'Alpha', 'LainLain', 'Total']
const R6 = (v) => Number(Number(v ?? 0).toFixed(6))

let semuaOke = true
for (const [start, end] of PERIODE) {
  const params = [...Array(14).fill([start, end]).flat()]
  let t = Date.now()
  const [lama] = await pool.query(`${rekapAbsensiSql()} WHERE 1=1`, params)
  const msLama = Date.now() - t
  t = Date.now()
  const [cepat] = await pool.query(rekapCepatSql(), [...Array(14).fill([start, end]).flat()])
  const msCepat = Date.now() - t

  const mA = new Map(lama.map((r) => [String(r.Nik), r]))
  const mB = new Map(cepat.map((r) => [String(r.Nik), r]))
  let bedaNik = 0, bedaKolom = 0
  const contoh = []
  for (const [nik, ra] of mA) {
    const rb = mB.get(nik)
    if (!rb) { bedaNik++; continue }
    for (const c of KOLOM) {
      if (R6(ra[c]) !== R6(rb[c])) {
        bedaKolom++
        if (contoh.length < 5) contoh.push(`${nik} ${c}: lama=${ra[c]} cepat=${rb[c]}`)
      }
    }
    // identitas harus sama
    for (const c of ['Nama', 'Pabrik', 'Departemen', 'Jabatan', 'Bagian', 'Sistem']) {
      if (String(ra[c] ?? '') !== String(rb[c] ?? '') && contoh.length < 5) contoh.push(`${nik} ${c}: '${ra[c]}' vs '${rb[c]}'`)
    }
  }
  for (const nik of mB.keys()) if (!mA.has(nik)) bedaNik++
  const oke = bedaNik === 0 && bedaKolom === 0 && mA.size === mB.size
  semuaOke = semuaOke && oke
  console.log(`${start}~${end} | baris lama=${lama.length} cepat=${cepat.length} | beda nik=${bedaNik} beda kolom=${bedaKolom} | lama ${msLama}ms -> cepat ${msCepat}ms | ${oke ? 'IDENTIK ✅' : 'BEDA ❌'}`)
  contoh.forEach((c) => console.log('   ', c))
}
console.log(semuaOke ? 'SEMUA PERIODE IDENTIK' : 'ADA PERBEDAAN — CEGAH PEMAKAIAN')
process.exit(semuaOke ? 0 : 1)
