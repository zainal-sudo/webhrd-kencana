import { Router } from 'express'
import { verifyToken } from './middleware/auth.js'
import { login, me, logout, changePassword, cekHakAkses } from './controllers/auth/authController.js'
import masterRoutes from './routes/masterRoutes.js'
import absensiRoutes from './routes/absensiRoutes.js'
import transaksiRoutes from './routes/transaksiRoutes.js'
import laporanRoutes from './routes/laporanRoutes.js'
import gajiRoutes from './routes/gajiRoutes.js'
import otorisasiRoutes from './routes/otorisasiRoutes.js'

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
r.use('/transaksi', transaksiRoutes)
r.use('/laporan', laporanRoutes)
r.use('/gaji', gajiRoutes)
r.use('/otorisasi', otorisasiRoutes)

export default r
