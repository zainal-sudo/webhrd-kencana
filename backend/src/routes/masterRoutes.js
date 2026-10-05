import { Router } from 'express'
import { wajibHak } from '../middleware/permission.js'
import {
    jabatan,
    departemen,
    pabrik,
    jadwal,
    hariLibur,
    statusKaryawan,
    jenisIjin,
    pekerjaan,
    pendidikan,
    keteranganMutasi,
    getRingkasan,
    getPerusahaan,
    savePerusahaan,
} from '../controllers/master/simpleMasters.js'
import {
    getKaryawanList,
    lookupKaryawan,
    getKaryawan,
    getFotoKaryawan,
    generateNik,
    saveKaryawan,
    deleteKaryawan,
    getFormOptions,
    getHistoryKaryawan,
} from '../controllers/master/karyawanController.js'
import {
    getUserList,
    getUser,
    saveUser,
    deleteUser,
    resetPassword,
    getMenuList,
    saveMenu,
    getHakAkses,
    saveHakAkses,
    getLookupOptions,
} from '../controllers/master/userController.js'

const r = Router()

/**
 * Pasang 5 handler CRUD generik untuk satu master pada sub-router sendiri.
 *
 * Penting: sub-router dibuat terpisah lalu di-mount dengan `r.use(path, sub)`.
 * Bila handler `/:id` didaftarkan langsung pada router induk, route itu akan
 * menelan semua master lain yang hanya punya satu segmen (mis. `/lookup`,
 * `/ringkasan`, `/user`) dan selalu membalas "Jabatan tidak ditemukan".
 */
const crud = (path, c, form) => {
    const sub = Router()
    sub.get('/', wajibHak(form), c.list)
    sub.get('/options', c.options)
    sub.post('/', wajibHak(form, 'insert'), c.create)
    sub.get('/:id', wajibHak(form), c.getById)
    sub.put('/:id', wajibHak(form, 'edit'), c.update)
    sub.delete('/:id', wajibHak(form, 'delete'), c.remove)
    r.use(path, sub)
}

/* ── Karyawan (harus sebelum master lain agar tidak tertangkap /:id) ── */
r.get('/karyawan', wajibHak('frmKaryawan'), getKaryawanList)
r.get('/karyawan/lookup', wajibHak('frmKaryawan'), lookupKaryawan)
r.get('/karyawan/form-options', wajibHak('frmKaryawan'), getFormOptions)
r.get('/karyawan/nomor', wajibHak('frmKaryawan'), generateNik)
r.get('/karyawan/:nik/foto', wajibHak('frmKaryawan'), getFotoKaryawan)
r.get('/karyawan/:nik', wajibHak('frmKaryawan'), getKaryawan)
r.post('/karyawan', wajibHak('frmKaryawan', 'insert'), saveKaryawan)
r.put('/karyawan/:nik', wajibHak('frmKaryawan', 'edit'), saveKaryawan)
r.delete('/karyawan/:nik', wajibHak('frmKaryawan', 'delete'), deleteKaryawan)

/* History karyawan memakai form terpisah di Delphi */
r.get('/history-karyawan', wajibHak('frmHistoryKaryawan'), getHistoryKaryawan)

/* ── Master sederhana ───────────────────────────────────────────────── */
crud('/jabatan', jabatan, 'frmJabatan')
crud('/departemen', departemen, 'frmDepartemen')
crud('/pabrik', pabrik, 'frmPabrik')
crud('/jadwal', jadwal, 'frmJadwal')
crud('/hari-libur', hariLibur, 'frmHariLibur')
crud('/status-karyawan', statusKaryawan, 'frmKaryawan')
crud('/jenis-ijin', jenisIjin, 'frmIjin')
crud('/pekerjaan', pekerjaan, 'frmKaryawan')
crud('/pendidikan', pendidikan, 'frmKaryawan')
crud('/keterangan-mutasi', keteranganMutasi, 'frmMutasiKaryawan')

/* ── Identitas perusahaan ───────────────────────────────────────────── */
r.get('/perusahaan', wajibHak('frmPerusahaan'), getPerusahaan)
r.put('/perusahaan', wajibHak('frmPerusahaan', 'edit'), savePerusahaan)
r.post('/perusahaan', wajibHak('frmPerusahaan', 'insert'), savePerusahaan)

/* ── User & otorisasi ───────────────────────────────────────────────── */
r.get('/user', wajibHak('frmUser'), getUserList)
r.post('/user', wajibHak('frmUser', 'insert'), saveUser)
r.get('/user/menu', wajibHak('frmUser'), getMenuList)
r.post('/user/menu', wajibHak('frmUser', 'insert'), saveMenu)
r.get('/user/:kode/hak', wajibHak('frmUser'), getHakAkses)
r.put('/user/:kode/hak', wajibHak('frmUser', 'edit'), saveHakAkses)
r.get('/user/:id', wajibHak('frmUser'), getUser)
r.put('/user/:id', wajibHak('frmUser', 'edit'), saveUser)
r.put('/user/:id/password', wajibHak('frmUser', 'edit'), resetPassword)
r.delete('/user/:id', wajibHak('frmUser', 'delete'), deleteUser)

/* ── Lookup gabungan (dipakai form transaksi) ───────────────────────── */
r.get('/lookup', getLookupOptions)

/* ── Ringkasan dashboard ────────────────────────────────────────────── */
r.get('/ringkasan', getRingkasan)

export default r
