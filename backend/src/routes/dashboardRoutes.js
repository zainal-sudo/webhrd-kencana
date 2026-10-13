import { Router } from 'express'
import { getPeringatan } from '../controllers/dashboardController.js'

const r = Router()

/* Daftar peringatan ala popup login Delphi — untuk semua user login. */
r.get('/peringatan', getPeringatan)

export default r
