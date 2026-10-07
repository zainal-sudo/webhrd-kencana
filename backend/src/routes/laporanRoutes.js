import { Router } from 'express'
import { wajibHak } from '../middleware/permission.js'
import { getLemburHariLiburList } from '../controllers/laporan/lemburHariLiburController.js'
import {
    getTidakMasukList,
    alphaOtomatis,
    jadwalLiburOtomatis,
    getKeterlambatanList,
    getPulangDuluList,
    getTidakKeluarList,
    getLemburList,
    getLemburTanpaSplList,
    getAbsensiRekapList,
    getTanpaIjinList,
    getStHariTanpaIjinList,
    getDetailLemburList,
    getAbsensiPeriodeList,
} from '../controllers/laporan/laporanController.js'

const r = Router()

/* ── Laporan Tidak Masuk (ufrmLapTidakMasuk, `frmLapTidakMasuk`) ── */
r.get('/tidak-masuk', wajibHak('frmLapTidakMasuk'), getTidakMasukList)
r.post('/tidak-masuk/alpha-otomatis', wajibHak('frmLapTidakMasuk', 'insert'), alphaOtomatis)
r.post('/tidak-masuk/jadwal-libur-otomatis', wajibHak('frmLapTidakMasuk', 'insert'), jadwalLiburOtomatis)

/* ── Laporan Keterlambatan (ufrmLapKeterlambatan, `frmLapKeterlambatan`) ── */
r.get('/keterlambatan', wajibHak('frmLapKeterlambatan'), getKeterlambatanList)

/* ── Laporan Pulang Mendahului (ufrmLapPulangdulu, `frmLapPulangdulu`) ── */
r.get('/pulang-dulu', wajibHak('frmLapPulangdulu'), getPulangDuluList)

/* ── Absen Tidak Lengkap (ufrmLapTidakKeluar, `frmLapTidakKeluar`) ── */
r.get('/tidak-keluar', wajibHak('frmLapTidakKeluar'), getTidakKeluarList)

/* ── Laporan Tanpa Ijin (ufrmLapTanpaIjin, `frmLapTanpaIjin`) ── */
r.get('/tanpa-ijin', wajibHak('frmLapTanpaIjin'), getTanpaIjinList)

/* ── Setengah Hari Tanpa Ijin (ufrmLapStHariTanpaIjin, `frmLapStHariTanpaIjin`) ── */
r.get('/setengah-hari-tanpa-ijin', wajibHak('frmLapStHariTanpaIjin'), getStHariTanpaIjinList)

/* ── Detail Lembur (ufrmLapDetailLembur, `frmLapDetailLembur`) ── */
r.get('/detail-lembur', wajibHak('frmLapDetailLembur'), getDetailLemburList)

/* ── Laporan Lembur per SPL (ufrmLapLembur, `frmLapLembur`) ── */
r.get('/lembur', wajibHak('frmLapLembur'), getLemburList)
r.get('/lembur-hari-libur', wajibHak('frmLapLemburHariLibur'), getLemburHariLiburList)

/* ── Lembur Tanpa SPL (ufrmLapLemburTanpaSPL, `frmLapLemburTanpaSPL`) ── */
r.get('/lembur-tanpa-spl', wajibHak('frmLapLemburTanpaSPL'), getLemburTanpaSplList)

/* ── Rekap Absensi (ufrmLapAbsensi, `frmLapAbsensi`) ── */
r.get('/absensi', wajibHak('frmLapAbsensi'), getAbsensiRekapList)

/* ── Absensi Periode (ufrmLapAbsensiPeriode, `frmLapAbsensiPeriode`) ── */
r.get('/absensi-periode', wajibHak('frmLapAbsensiPeriode'), getAbsensiPeriodeList)

export default r
