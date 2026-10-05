import { Router } from 'express'
import multer from 'multer'
import { wajibHak } from '../middleware/permission.js'
import {
    getAbsensiList,
    getAbsensi,
    lookupKaryawanAbsensi,
    saveAbsensi,
    deleteAbsensi,
    cekOtorisasi,
    getPabrikMesin,
    getStaging,
    importStaging,
    prosesTabsensi,
    prosesTanggal,
    bersihkanStaging,
} from '../controllers/absensi/absensiController.js'

const r = Router()

/** Unggah hasil ekspor mesin absensi (Excel/CSV) — disimpan di memori. */
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 },
})

/* Browse absensi (ufrmBrowseAbsensi) */
r.get('/', wajibHak('frmAbsensi'), getAbsensiList)

/* Form absensi (ufrmAbsensi) — nik = kode absensi, wajib bersama tanggal */
r.get('/form', wajibHak('frmAbsensi'), getAbsensi)
r.get('/karyawan', wajibHak('frmAbsensi'), lookupKaryawanAbsensi)
r.post('/otorisasi', wajibHak('frmAbsensi', 'edit'), cekOtorisasi)
r.post('/', wajibHak('frmAbsensi', 'insert'), saveAbsensi)
r.put('/', wajibHak('frmAbsensi', 'edit'), saveAbsensi)
r.delete('/', wajibHak('frmAbsensi', 'delete'), deleteAbsensi)

/* Import absensi (ufrmImportAbsensi) */
r.get('/pabrik', wajibHak('frmImportAbsensi'), getPabrikMesin)
r.get('/staging', wajibHak('frmImportAbsensi'), getStaging)
r.post('/staging', wajibHak('frmImportAbsensi', 'insert'), upload.single('file'), importStaging)
r.delete('/staging', wajibHak('frmImportAbsensi', 'delete'), bersihkanStaging)
r.post('/proses', wajibHak('frmImportAbsensi', 'insert'), prosesTabsensi)
r.post('/proses-tanggal', wajibHak('frmImportAbsensi', 'insert'), prosesTanggal)

export default r