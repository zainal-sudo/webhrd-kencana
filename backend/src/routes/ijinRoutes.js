import { Router } from 'express'
import { wajibHak } from '../middleware/permission.js'
import { getIjinList, getIjin } from '../controllers/transaksi/ijinController.js'

const r = Router()

// Tahap A read-only. Tidak ada writer, lookup Master Karyawan, atau generator nomor.
r.get('/', wajibHak('frmIjin'), getIjinList)
r.get('/:nomor', wajibHak('frmIjin'), getIjin)

export default r
