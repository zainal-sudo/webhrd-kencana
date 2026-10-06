import { Router } from 'express'
import { verifyToken } from './middleware/auth.js'
import { login, me, logout, changePassword, cekHakAkses } from './controllers/auth/authController.js'
import masterRoutes from './routes/masterRoutes.js'
import absensiRoutes from './routes/absensiRoutes.js'
import ijinRoutes from './routes/ijinRoutes.js'

const r = Router()

/* Publik */
r.post('/login', login)
r.get('/health', (req, res) => res.json({ success: true, message: 'Web HRD Kencana API aktif' }))

/* Terlindungi */
r.use(verifyToken)
r.get('/me', me)
r.post('/logout', logout)
r.post('/change-password', changePassword)
r.get('/cek-hak', cekHakAkses)

r.use('/master', masterRoutes)
r.use('/absensi', absensiRoutes)
r.use('/transaksi/ijin', ijinRoutes)

export default r
