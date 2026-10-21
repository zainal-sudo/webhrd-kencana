import { Router } from 'express'
import { accessPenilaian } from '../controllers/penilaianController.js'

const r = Router()
// Body token menghindari token tercantum pada URL/access log API.
r.post('/:formType/akses', accessPenilaian)
export default r
