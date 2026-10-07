import { Router } from 'express'
import { wajibHak } from '../middleware/permission.js'
import {
    getKeluarList, getKeluar, getNomorKeluar, getAlasanKeluar,
    lookupKaryawanKeluar, infoKaryawanKeluar, saveKeluar, deleteKeluar,
} from '../controllers/transaksi/keluarController.js'
import {
    getIjinList,
    getIjin,
    getNomor as getNomorIjin,
    lookupKaryawan as lookupKaryawanIjin,
    infoKaryawan as infoKaryawanIjin,
    cekDuplikatHandler,
    getJenisIjin,
    cekOtorisasi as otorisasiIjin,
    saveIjin,
    deleteIjin,
} from '../controllers/transaksi/ijinController.js'
import {
    getMutasiList,
    getMutasi,
    getNomor as getNomorMutasi,
    lookupKaryawan as lookupKaryawanMutasi,
    infoKaryawan as infoKaryawanMutasi,
    getBagian,
    getSurat,
    saveMutasi,
    deleteMutasi,
} from '../controllers/transaksi/mutasiController.js'
import {
    getLemburList,
    getLemburDetail,
    getLembur,
    getNomor as getNomorLembur,
    muatKaryawan,
    lookupKaryawan as lookupKaryawanLembur,
    getJabatanOptions,
    getDepartemenOptions,
    getBagianOptions,
    cekAbsensi,
    cekOtorisasi as otorisasiLembur,
    saveLembur,
    deleteLembur,
} from '../controllers/transaksi/lemburController.js'
import {
    getPerubahanStatusList,
    getPerubahanStatus,
    getNomor as getNomorPerubahanStatus,
    lookupKaryawan as lookupKaryawanPerubahanStatus,
    infoKaryawan as infoKaryawanPerubahanStatus,
    getStatusKerja,
    getSurat as getSuratPerubahanStatus,
    savePerubahanStatus,
    deletePerubahanStatus,
} from '../controllers/transaksi/perubahanStatusController.js'
import {
    getPermintaanList,
    getRealisasi,
    getPermintaan,
    getNomor as getNomorPermintaan,
    lookupKaryawan as lookupKaryawanPermintaan,
    getBagian as getBagianPermintaan,
    savePermintaan,
    deletePermintaan,
} from '../controllers/transaksi/permintaanController.js'
import {
    getPenilaianList,
    getPenilaianDetail,
    getPenilaian,
    getNomor as getNomorPenilaian,
    muatKaryawan as muatKaryawanPenilaian,
    lookupKaryawan as lookupKaryawanPenilaian,
    cekOtorisasi as otorisasiPenilaian,
    savePenilaian,
    deletePenilaian,
} from '../controllers/transaksi/penilaianController.js'
import {
    getSPList,
    getSP,
    getNomor as getNomorSP,
    lookupKaryawan as lookupKaryawanSP,
    infoKaryawan as infoKaryawanSP,
    cekSP,
    getSurat as getSuratSP,
    saveSP,
    deleteSP,
} from '../controllers/transaksi/spController.js'
import {
    muatKaryawan as muatKaryawanIjin2,
    lookupKaryawan as lookupKaryawanIjin2,
    getNomor as getNomorIjin2,
    saveIjin2,
} from '../controllers/transaksi/ijin2Controller.js'
import {
    lookupKaryawan as lookupKaryawanLembur2,
    infoKaryawan as infoKaryawanLembur2,
    saveLembur2,
} from '../controllers/transaksi/lembur2Controller.js'

const r = Router()

/* Karyawan Keluar — hak form frmKeluar, tanggal keluar master ditangani trigger. */
r.get('/keluar', wajibHak('frmKeluar'), getKeluarList)
r.get('/keluar/nomor', wajibHak('frmKeluar'), getNomorKeluar)
r.get('/keluar/alasan', wajibHak('frmKeluar'), getAlasanKeluar)
r.get('/keluar/karyawan', wajibHak('frmKeluar'), lookupKaryawanKeluar)
r.get('/keluar/karyawan-info', wajibHak('frmKeluar'), infoKaryawanKeluar)
r.get('/keluar/form', wajibHak('frmKeluar'), getKeluar)
r.post('/keluar', wajibHak('frmKeluar', 'insert'), saveKeluar)
r.put('/keluar/:nomor', wajibHak('frmKeluar', 'edit'), saveKeluar)
r.delete('/keluar/:nomor', wajibHak('frmKeluar', 'delete'), deleteKeluar)

/* ── Ijin (ufrmBrowseIjin + ufrmIjin, hak form `frmIjin`) ── */
r.get('/ijin', wajibHak('frmIjin'), getIjinList)
r.get('/ijin/nomor', wajibHak('frmIjin'), getNomorIjin)
r.get('/ijin/jenis', wajibHak('frmIjin'), getJenisIjin)
r.get('/ijin/karyawan', wajibHak('frmIjin'), lookupKaryawanIjin)
r.get('/ijin/karyawan-info', wajibHak('frmIjin'), infoKaryawanIjin)
r.get('/ijin/cek', wajibHak('frmIjin'), cekDuplikatHandler)
r.get('/ijin/form', wajibHak('frmIjin'), getIjin)
r.post('/ijin/otorisasi', wajibHak('frmIjin', 'edit'), otorisasiIjin)
r.post('/ijin', wajibHak('frmIjin', 'insert'), saveIjin)
r.put('/ijin', wajibHak('frmIjin', 'edit'), saveIjin)
r.delete('/ijin/:nomor', wajibHak('frmIjin', 'delete'), deleteIjin)

/* ── Mutasi Karyawan (ufrmBrowseMutasiKaryawan + ufrmMutasiKaryawan, `frmMutasiKaryawan`) ── */
r.get('/mutasi', wajibHak('frmMutasiKaryawan'), getMutasiList)
r.get('/mutasi/nomor', wajibHak('frmMutasiKaryawan'), getNomorMutasi)
r.get('/mutasi/karyawan', wajibHak('frmMutasiKaryawan'), lookupKaryawanMutasi)
r.get('/mutasi/karyawan-info', wajibHak('frmMutasiKaryawan'), infoKaryawanMutasi)
r.get('/mutasi/bagian', wajibHak('frmMutasiKaryawan'), getBagian)
r.get('/mutasi/form', wajibHak('frmMutasiKaryawan'), getMutasi)
r.get('/mutasi/surat', wajibHak('frmMutasiKaryawan'), getSurat)
r.post('/mutasi', wajibHak('frmMutasiKaryawan', 'insert'), saveMutasi)
r.put('/mutasi', wajibHak('frmMutasiKaryawan', 'edit'), saveMutasi)
r.delete('/mutasi/:nomor', wajibHak('frmMutasiKaryawan', 'delete'), deleteMutasi)

/* ── Lembur / SPL (ufrmBrowseLembur + ufrmLembur, hak form `frmLembur`) ── */
r.get('/lembur', wajibHak('frmLembur'), getLemburList)
r.get('/lembur/nomor', wajibHak('frmLembur'), getNomorLembur)
r.get('/lembur/karyawan', wajibHak('frmLembur'), lookupKaryawanLembur)
r.get('/lembur/muat-karyawan', wajibHak('frmLembur'), muatKaryawan)
r.get('/lembur/jabatan-options', wajibHak('frmLembur'), getJabatanOptions)
r.get('/lembur/departemen-options', wajibHak('frmLembur'), getDepartemenOptions)
r.get('/lembur/bagian-options', wajibHak('frmLembur'), getBagianOptions)
r.get('/lembur/detail', wajibHak('frmLembur'), getLemburDetail)
r.get('/lembur/form', wajibHak('frmLembur'), getLembur)
r.post('/lembur/cek-absensi', wajibHak('frmLembur'), cekAbsensi)
r.post('/lembur/otorisasi', wajibHak('frmLembur', 'edit'), otorisasiLembur)
r.post('/lembur', wajibHak('frmLembur', 'insert'), saveLembur)
r.put('/lembur', wajibHak('frmLembur', 'edit'), saveLembur)
r.delete('/lembur/:nomor', wajibHak('frmLembur', 'delete'), deleteLembur)

/* ── Perubahan Status (ufrmBrowsePerubahanStatus + ufrmPerubahanStatus, `frmPerubahanStatus`) ── */
r.get('/perubahan-status', wajibHak('frmPerubahanStatus'), getPerubahanStatusList)
r.get('/perubahan-status/nomor', wajibHak('frmPerubahanStatus'), getNomorPerubahanStatus)
r.get('/perubahan-status/status', wajibHak('frmPerubahanStatus'), getStatusKerja)
r.get('/perubahan-status/karyawan', wajibHak('frmPerubahanStatus'), lookupKaryawanPerubahanStatus)
r.get('/perubahan-status/karyawan-info', wajibHak('frmPerubahanStatus'), infoKaryawanPerubahanStatus)
r.get('/perubahan-status/form', wajibHak('frmPerubahanStatus'), getPerubahanStatus)
r.get('/perubahan-status/surat', wajibHak('frmPerubahanStatus'), getSuratPerubahanStatus)
r.post('/perubahan-status', wajibHak('frmPerubahanStatus', 'insert'), savePerubahanStatus)
r.put('/perubahan-status', wajibHak('frmPerubahanStatus', 'edit'), savePerubahanStatus)
r.delete('/perubahan-status/:nomor', wajibHak('frmPerubahanStatus', 'delete'), deletePerubahanStatus)

/* ── Permintaan Karyawan (ufrmBrowsePermintaankaryawan + ufrmPermintaankaryawan, `frmPermintaanKaryawan`) ── */
r.get('/permintaan-karyawan', wajibHak('frmPermintaanKaryawan'), getPermintaanList)
r.get('/permintaan-karyawan/nomor', wajibHak('frmPermintaanKaryawan'), getNomorPermintaan)
r.get('/permintaan-karyawan/karyawan', wajibHak('frmPermintaanKaryawan'), lookupKaryawanPermintaan)
r.get('/permintaan-karyawan/bagian', wajibHak('frmPermintaanKaryawan'), getBagianPermintaan)
r.get('/permintaan-karyawan/realisasi', wajibHak('frmPermintaanKaryawan'), getRealisasi)
r.get('/permintaan-karyawan/form', wajibHak('frmPermintaanKaryawan'), getPermintaan)
r.post('/permintaan-karyawan', wajibHak('frmPermintaanKaryawan', 'insert'), savePermintaan)
r.put('/permintaan-karyawan', wajibHak('frmPermintaanKaryawan', 'edit'), savePermintaan)
r.delete('/permintaan-karyawan/:nomor', wajibHak('frmPermintaanKaryawan', 'delete'), deletePermintaan)

/* ── Penilaian 3 Bulan (ufrmBrowsePenilaian3Bulan + ufrmPenilaian3Bulan, `frmPenilaian3Bulan`) ── */
r.get('/penilaian-3-bulan', wajibHak('frmPenilaian3Bulan'), getPenilaianList)
r.get('/penilaian-3-bulan/nomor', wajibHak('frmPenilaian3Bulan'), getNomorPenilaian)
r.get('/penilaian-3-bulan/karyawan', wajibHak('frmPenilaian3Bulan'), lookupKaryawanPenilaian)
r.get('/penilaian-3-bulan/muat-karyawan', wajibHak('frmPenilaian3Bulan'), muatKaryawanPenilaian)
r.get('/penilaian-3-bulan/detail', wajibHak('frmPenilaian3Bulan'), getPenilaianDetail)
r.get('/penilaian-3-bulan/form', wajibHak('frmPenilaian3Bulan'), getPenilaian)
r.post('/penilaian-3-bulan/otorisasi', wajibHak('frmPenilaian3Bulan', 'edit'), otorisasiPenilaian)
r.post('/penilaian-3-bulan', wajibHak('frmPenilaian3Bulan', 'insert'), savePenilaian)
r.put('/penilaian-3-bulan', wajibHak('frmPenilaian3Bulan', 'edit'), savePenilaian)
r.delete('/penilaian-3-bulan/:nomor', wajibHak('frmPenilaian3Bulan', 'delete'), deletePenilaian)

/* ── SP / Surat Peringatan (ufrmBrowseSP + ufrmSP, hak form `frmSP`) ── */
r.get('/sp', wajibHak('frmSP'), getSPList)
r.get('/sp/nomor', wajibHak('frmSP'), getNomorSP)
r.get('/sp/karyawan', wajibHak('frmSP'), lookupKaryawanSP)
r.get('/sp/karyawan-info', wajibHak('frmSP'), infoKaryawanSP)
r.get('/sp/cek', wajibHak('frmSP'), cekSP)
r.get('/sp/form', wajibHak('frmSP'), getSP)
r.get('/sp/surat', wajibHak('frmSP'), getSuratSP)
r.post('/sp', wajibHak('frmSP', 'insert'), saveSP)
r.put('/sp', wajibHak('frmSP', 'edit'), saveSP)
r.delete('/sp/:nomor', wajibHak('frmSP', 'delete'), deleteSP)

/* ── Ijin V2 kolektif / multi-NIK (ufrmIjin2, hak form `frmIjin2`) ──
 * Opsi filter jabatan/departemen/bagian memakai handler yang sama dengan
 * modul Lembur (query Delphi-nya identik), hanya hak aksesnya berbeda. */
r.get('/ijin2/nomor', wajibHak('frmIjin2'), getNomorIjin2)
r.get('/ijin2/karyawan', wajibHak('frmIjin2'), lookupKaryawanIjin2)
r.get('/ijin2/muat-karyawan', wajibHak('frmIjin2'), muatKaryawanIjin2)
r.get('/ijin2/jabatan-options', wajibHak('frmIjin2'), getJabatanOptions)
r.get('/ijin2/departemen-options', wajibHak('frmIjin2'), getDepartemenOptions)
r.get('/ijin2/bagian-options', wajibHak('frmIjin2'), getBagianOptions)
r.post('/ijin2', wajibHak('frmIjin2', 'insert'), saveIjin2)

/* ── Lembur V2 per NIK (ufrmLembur2, hak form `frmLembur2`) ──
 * Satu NIK untuk banyak tanggal; tiap baris menjadi SPL sendiri.
 * Tanpa otorisasi & tanpa mode ubah (dokumen dikelola via browse Lembur). */
r.get('/lembur2/karyawan', wajibHak('frmLembur2'), lookupKaryawanLembur2)
r.get('/lembur2/karyawan-info', wajibHak('frmLembur2'), infoKaryawanLembur2)
r.post('/lembur2', wajibHak('frmLembur2', 'insert'), saveLembur2)

export default r
