import { Router } from 'express'
import multer from 'multer'
import { wajibHak } from '../middleware/permission.js'
import {
    getSettingGajiList,
    saveSettingGaji,
} from '../controllers/gaji/settingGajiController.js'
import {
    getProsesList,
    jalankanProsesGaji,
    saveProsesGaji,
    loadPotongan,
} from '../controllers/gaji/prosesGajiController.js'

const r = Router()

/** Berkas Excel "Load Potongan" — disimpan di memori. */
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 },
})

/* Setting Gaji (ufrmSettingGaji) */
r.get('/setting', wajibHak('frmSettingGaji'), getSettingGajiList)
r.put('/setting', wajibHak('frmSettingGaji', 'insert'), saveSettingGaji)

/* Proses Gaji (ufrmProsesGaji) */
r.get('/proses', wajibHak('frmProsesGaji'), getProsesList)
r.post('/proses/process', wajibHak('frmProsesGaji', 'insert'), jalankanProsesGaji)
r.put('/proses', wajibHak('frmProsesGaji', 'insert'), saveProsesGaji)
r.post(
    '/proses/load-potongan',
    wajibHak('frmProsesGaji', 'insert'),
    upload.single('file'),
    loadPotongan
)

export default r
