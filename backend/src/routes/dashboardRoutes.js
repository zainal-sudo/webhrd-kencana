import { Router } from 'express'
import { getPeringatan, getEksekusiPkwt } from '../controllers/dashboardController.js'
import { getAnalisisAbsensi } from '../controllers/dashboard/analisisController.js'
import { issuePenilaianLink } from '../controllers/penilaianController.js'

const r = Router()

/* Analisis HR & Peringatan = data sensitif kepegawaian → khusus HRD & SUPER
   (dashboard tidak punya frm di tmenu, jadi user_kode dicek langsung). */
export function hanyaHrSuper(req, res, next) {
  const kode = String(req.user?.user || '').toUpperCase().trim()
  if (kode === 'HRD' || kode === 'SUPER') return next()
  return res.status(403).json({ success: false, message: 'Modul ini khusus HR' })
}

/* Daftar peringatan ala popup login Delphi — HRD & SUPER saja. */
r.get('/peringatan', hanyaHrSuper, getPeringatan)

/* Analisis HR (dashboard gaya HR Analytics): rekap absensi satu periode. */
r.get('/analisis-absensi', hanyaHrSuper, getAnalisisAbsensi)

/* Halaman Eksekusi PKWT (dari card "Masa PKWT Akan Habis") — ikut kunci HR. */
r.get('/eksekusi-pkwt', hanyaHrSuper, getEksekusiPkwt)
r.post('/eksekusi-pkwt/:nik/link-penilaian', hanyaHrSuper, issuePenilaianLink)

export default r
