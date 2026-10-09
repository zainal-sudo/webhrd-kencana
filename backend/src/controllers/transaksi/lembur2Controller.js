import pool from '../../config/database.js'
import { applyKaryawanLookup } from '../../helpers/karyawanLookup.js'
import { success, error, paginated } from '../../helpers/response.js'
import { normJam, toTime } from './ijinController.js'

/**
 * Modul Lembur V2 (per NIK) — cerminan unit Delphi `ufrmLembur2`.
 *
 * Kebalikan Lembur V1: SATU karyawan untuk BANYAK tanggal. Tiap baris grid
 * (tanggal + jam mulai/akhir + keterangan + panggilan) menjadi dokumen SPL
 * sendiri (satu header + satu detail), dengan bagian/pabrik dari master
 * karyawan dan jenis kerja = keterangan baris tersebut.
 *
 * Aturan Delphi yang diduplikasi:
 * - Validasi absensi per baris (cekdata): jam akhir maksimal 30 menit
 *   setelah scan keluar hari itu (422 bila dilanggar).
 * - Tombol "Samakan Jam": salin jam baris pertama ke semua baris.
 * - Pesan sukses: "Berhasil tersimpan dengan nomor: {awal} s.d {akhir}".
 * - TIDAK ada otorisasi tanggal dan TIDAK ada mode ubah di V2
 *   (berbeda dengan V1). Dokumen yang sudah tersimpan dikelola lewat
 *   browse Lembur biasa (sama-sama `tlembur_hdr/dtl`).
 */

/** Lookup karyawan (edtNikClickBtn Delphi: hanya yang aktif). */
export const lookupKaryawan = async (req, res, next) => {
    try {
        const q = String(req.query.search || '').trim()
        const perPage = Math.min(200, parseInt(req.query.per_page) || 20)
        const page = Math.max(1, parseInt(req.query.page) || 1)
        let where = ' WHERE k.kar_status_aktif = 1'
        const params = []
        if (q) {
            where += ' AND (k.kar_Nik LIKE ? OR k.kar_nama LIKE ? OR j.jab_nama LIKE ? OR k.kar_bagian LIKE ? OR k.kar_pab_kode LIKE ?)'
            params.push(...Array(5).fill(`%${q}%`))
        }
        if (req.query.pabrik) {
            where += ' AND k.kar_pab_kode = ?'
            params.push(req.query.pabrik)
        }
        const lookup = applyKaryawanLookup(req.query, where, params)
        const [rows] = await pool.query(
            `SELECT k.kar_Nik AS Nik, k.kar_nama AS Nama, k.kar_pab_kode AS Pabrik,
                    j.jab_nama AS Jabatan, k.kar_bagian AS Bagian,
                    IF(k.kar_status_aktif = 1, 'Aktif', 'Non Aktif') AS Status
             FROM tkaryawan k LEFT JOIN tjabatan j ON j.jab_kode = k.kar_jab_kode
             ${lookup.where} ${lookup.orderBy} LIMIT ? OFFSET ?`,
            [...params, perPage, (page - 1) * perPage]
        )
        const [cnt] = await pool.query(`SELECT COUNT(*) AS c FROM tkaryawan k LEFT JOIN tjabatan j ON j.jab_kode = k.kar_jab_kode ${lookup.where}`, params)
        paginated(res, rows, {
            page,
            per_page: perPage,
            total: cnt[0].c,
            last_page: Math.ceil(cnt[0].c / perPage),
        })
    } catch (err) {
        next(err)
    }
}

/** Data satu karyawan (ufrmLembur2.loaddata). */
export const infoKaryawan = async (req, res, next) => {
    try {
        const nik = String(req.query.nik || '')
        if (!nik) return error(res, 'NIK wajib diisi', 400)
        const [rows] = await pool.query(
            `SELECT k.kar_Nik AS nik, k.kar_nama AS nama, k.kar_pab_kode AS pabrik,
                    k.kar_jab_kode AS jab_kode, j.jab_nama AS jabatan, k.kar_bagian AS bagian
             FROM tkaryawan k LEFT JOIN tjabatan j ON j.jab_kode = k.kar_jab_kode
             WHERE k.kar_Nik = ?`,
            [nik]
        )
        if (rows.length === 0) return error(res, `NIK ${nik} tidak ditemukan`, 404)
        success(res, rows[0])
    } catch (err) {
        next(err)
    }
}

function menit(jam) {
    const m = /^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/.exec(String(jam).trim())
    if (!m) return 0
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
}

/**
 * Simpan V2 (ufrmLembur2.simpandata + cekdata).
 * Body: { nik, detail: [{ tanggal, jam_mulai, jam_akhir, keterangan, panggilan }] }
 */
export const saveLembur2 = async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
        const b = req.body || {}
        const nik = String(b.nik || '').trim()
        const rawDetail = Array.isArray(b.detail) ? b.detail : []

        if (!nik) return error(res, 'NIK wajib diisi', 400)

        const [krows] = await conn.query(
            'SELECT kar_pab_kode, kar_bagian FROM tkaryawan WHERE kar_Nik = ? LIMIT 1',
            [nik]
        )
        if (krows.length === 0) return error(res, `NIK ${nik} tidak ada pada master karyawan`, 400)
        const { kar_pab_kode: pabrik, kar_bagian: bagian } = krows[0]

        const detail = []
        for (const r of rawDetail) {
            const tanggal = String(r?.tanggal || '').slice(0, 10)
            if (!tanggal) continue
            detail.push({
                tanggal,
                jam_mulai: normJam(r?.jam_mulai ?? '00:00:00'),
                jam_akhir: normJam(r?.jam_akhir ?? '00:00:00'),
                keterangan: String(r?.keterangan || ''),
                panggilan: parseInt(r?.panggilan ?? 0, 10) ? 1 : 0,
            })
        }
        if (detail.length === 0) return error(res, 'Minimal satu tanggal harus diisi', 400)

        // Validasi absensi per baris (Delphi: abort + pesan "kurang X menit").
        const masalah = []
        for (const d of detail) {
            const [rows] = await conn.query(
                `SELECT a.scan2, k.kar_nama FROM tabsensi a
                 INNER JOIN tkaryawan k ON k.kar_kode_absensi = a.nik
                 WHERE a.tanggal = ? AND k.kar_Nik = ? LIMIT 1`,
                [d.tanggal, nik]
            )
            if (rows.length === 0) continue
            const selisih = menit(d.jam_akhir) - menit(toTime(rows[0].scan2))
            if (selisih > 30) {
                masalah.push(`${d.tanggal}: ${rows[0].kar_nama || nik} kurang ${selisih} menit`)
            }
        }
        if (masalah.length > 0) return error(res, masalah.join('; '), 422)

        // Nomor per baris mengikuti bulannya masing-masing (getmaxnomor).
        const seqPerBulan = new Map()
        const prefixOf = (tgl) => `LEM.${tgl.slice(0, 7).replace('-', '')}.`
        const pad4 = (n) => String(10000 + n).slice(-4)

        await conn.beginTransaction()
        for (const prefix of new Set(detail.map((d) => prefixOf(d.tanggal)))) {
            const [mrows] = await conn.query(
                'SELECT MAX(RIGHT(lem_nomor, 4)) AS m FROM tlembur_hdr WHERE lem_nomor LIKE ?',
                [`${prefix}%`]
            )
            seqPerBulan.set(prefix, mrows[0]?.m ? parseInt(mrows[0].m, 10) : 0)
        }

        const dibuat = []
        for (const d of detail) {
            const prefix = prefixOf(d.tanggal)
            const seq = seqPerBulan.get(prefix) + 1
            seqPerBulan.set(prefix, seq)
            const nomor = `${prefix}${pad4(seq)}`
            await conn.query(
                `INSERT INTO tlembur_hdr (lem_nomor, lem_tanggal, lem_bagian, lem_pab_kode, lem_jeniskerja)
                 VALUES (?, ?, ?, ?, ?)`,
                [nomor, d.tanggal, bagian || '', pabrik, d.keterangan]
            )
            await conn.query(
                `INSERT INTO tlembur_dtl (lemd_lem_nomor, lemd_kar_nik, lemd_jammulai, lemd_jamakhir, lemd_keterangan, lemd_panggilan)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [nomor, nik, d.jam_mulai, d.jam_akhir, d.keterangan, d.panggilan]
            )
            dibuat.push(nomor)
        }
        await conn.commit()

        success(
            res,
            { nomor: dibuat, jumlah: dibuat.length },
            `Berhasil tersimpan dengan nomor: ${dibuat[0]} s.d ${dibuat[dibuat.length - 1]}`
        )
    } catch (err) {
        try {
            await conn.rollback()
        } catch {
            /* abaikan */
        }
        next(err)
    } finally {
        conn.release()
    }
}
