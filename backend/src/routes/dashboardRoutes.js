import { Router } from 'express'
import { getPeringatan, getEksekusiPkwt } from '../controllers/dashboardController.js'
import { issuePenilaianLink } from '../controllers/penilaianController.js'

const r = Router()

/* Daftar peringatan ala popup login Delphi — untuk semua user login. */
r.get('/peringatan', getPeringatan)

/* Halaman Eksekusi PKWT (dari card "Masa PKWT Akan Habis"). */
r.get('/eksekusi-pkwt', getEksekusiPkwt)
r.post('/eksekusi-pkwt/:nik/link-penilaian', issuePenilaianLink)

export default r
