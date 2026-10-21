import { Router } from 'express'
import { getPeringatan, getEksekusiPkwt } from '../controllers/dashboardController.js'

const r = Router()

/* Daftar peringatan ala popup login Delphi — untuk semua user login. */
r.get('/peringatan', getPeringatan)

/* Halaman Eksekusi PKWT (dari card "Masa PKWT Akan Habis"). */
r.get('/eksekusi-pkwt', getEksekusiPkwt)

export default r
