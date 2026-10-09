import { Router } from 'express'
import { mintaTantangan, generasiRespons, verifikasiRespons } from '../controllers/otorisasiController.js'

/* Otorisasi tantangan-respons ala Delphi (pengganti password atasan).
 * Seluruh rute sudah di belakang verifyToken (lihat routes.js). */
const r = Router()

r.post('/tantangan', mintaTantangan)
r.post('/generasi', generasiRespons)
r.post('/verifikasi', verifikasiRespons)

export default r
