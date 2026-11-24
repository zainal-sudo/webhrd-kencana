import { Router } from 'express'
import { getPeringatan, getEksekusiPkwt, getMouSewaBerakhir, getTidakMasukBerurut } from '../controllers/dashboardController.js'
import { lihatNomorSurat, ambilNomorSurat } from '../controllers/suratPanggilanController.js'
import { getAnalisisAbsensi, getSpTerakhir, getSpRekam, getDaftarPabrik, getDaftarDepartemen } from '../controllers/dashboard/analisisController.js'
import { issuePenilaianLink } from '../controllers/penilaianController.js'

const r = Router()

/* Analisis HR & Peringatan = data sensitif kepegawaian → data dilindungi,
   bukan lewat thakuser (dashboard tidak punya frm di tmenu, jadi user_kode
   dicek langsung). HRD & SUPER melihat semua pabrik; P1, P2, P4 ikut dibuka
   sesuai permintaan manajemen (tanpa pembatasan pabrik). */
export function hanyaHrSuper(req, res, next) {
  const kode = String(req.user?.user || '').toUpperCase().trim()
  if (['HRD', 'SUPER', 'P1', 'P2', 'P4'].includes(kode)) return next()
  return res.status(403).json({ success: false, message: 'Modul ini khusus HR' })
}

/* Daftar peringatan ala popup login Delphi — HRD & SUPER saja. */
r.get('/peringatan', hanyaHrSuper, getPeringatan)

/* Analisis HR (dashboard gaya HR Analytics): rekap absensi satu periode. */
r.get('/analisis-absensi', hanyaHrSuper, getAnalisisAbsensi)

/* Rekam jejak punishment terakhir satu NIK (modal WA analytics). */
r.get('/sp-terakhir', hanyaHrSuper, getSpTerakhir)

/* Rekam jejak punishment batch banyak NIK (label rekomendasi kartu analisis). */
r.post('/sp-rekam', hanyaHrSuper, getSpRekam)

/* Daftar pabrik aktif (tpabrik) — dropdown analisis siap sejak halaman dibuka. */
r.get('/daftar-pabrik', hanyaHrSuper, getDaftarPabrik)

/* Daftar departemen (tdepartemen) — filter analisis satu dropdown lagi. */
r.get('/daftar-departemen', hanyaHrSuper, getDaftarDepartemen)

/* Halaman Eksekusi PKWT (dari card "Masa PKWT Akan Habis") — ikut kunci HR. */
r.get('/eksekusi-pkwt', hanyaHrSuper, getEksekusiPkwt)
r.post('/eksekusi-pkwt/:nik/link-penilaian', hanyaHrSuper, issuePenilaianLink)

/* Halaman MoU Sewa Berakhir (dari card "MoU Sewa") — daftar MoU yang sudah
 * 2 bulan sejak tgl berakhir; aksi Eksekusi dilakukan dari halaman ini. */
r.get('/mou-sewa-berakhir', hanyaHrSuper, getMouSewaBerakhir)

/* Halaman Eksekusi Tidak Masuk (dari card "Tidak Masuk 3–4 Hari Berturut-turut")
 * — daftar calon Surat Panggilan Karyawan (tahap 3 hari = Panggilan 1,
 * 4 hari = Panggilan 2 / MANGKIR); PDF dibuat di sisi klien. */
r.get('/tidak-masuk-berurut', hanyaHrSuper, getTidakMasukBerurut)

/* Nomor urut Surat Panggilan Karyawan — disimpan di DATABASE:
 *  · counter per bulan `tnomor_surat_panggilan` (nomor unik lintas komputer);
 *  · `tsurat_panggilan_terbit` — nomor MELEKAT pada nik + nama + rentang
 *    tanggal tidak masuk (data sama → nomor sama, data lain → nomor baru).
 *  GET  → nomor data ini bila sudah terbit, atau urut berikutnya (peek);
 *  POST → kunci nomor: pakai nomor lama / ambil urut baru / simpan nomor HR. */
r.get('/surat-panggilan/nomor', hanyaHrSuper, lihatNomorSurat)
r.post('/surat-panggilan/nomor', hanyaHrSuper, ambilNomorSurat)

export default r
