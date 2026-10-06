import pool from '../../config/database.js'
import { success, error, paginated } from '../../helpers/response.js'
import { nomorBerikut, cekTanggal, normJam, PAKAI_JAM2 } from './ijinController.js'

/**
 * Modul Ijin V2 (kolektif) — cerminan unit Delphi `ufrmIjin2`.
 *
 * Bedanya dengan Ijin V1 (`ufrmIjin`): satu dokumen pengajuan untuk
 * BANYAK NIK sekaligus. Satu tanggal, satu jenis ijin, satu jam,
 * satu keterangan & alasan yang sama untuk semua baris grid — tiap NIK
 * mendapat nomor `IJN.YYYYMM.NNNN` sendiri berurutan.
 *
 * Aturan Delphi yang diduplikasi:
 * - Tombol Bagian (loaddata): isi grid dengan semua karyawan aktif sesuai
 *   filter pabrik + departemen + jabatan + bagian (masing-masing + All).
 * - Lookup NIK per baris menolak NIK ganda dalam grid.
 * - Simpan (simpandata): bila SATU NIK saja sudah punya ijin tanggal itu,
 *   SELURUH batch dibatalkan (Delphi: pesan + `tt.Clear; Exit`).
 * - cektanggal >= 3 -> DITOLAK mentah-mentah
 *   ("Tanggal terlalu lama tidak bisa menggunakan modul ini") — V2 tidak
 *   punya jalur otorisasi seperti V1.
 * - Tidak ada mode ubah (FLAGEDIT tak pernah true; `loaddataall` Delphi
 *   pun salah baca tabel lembur / dead code). Dokumen V2 yang sudah
 *   tersimpan dibaca/ubah/hapus lewat browse Ijin biasa (sama-sama `tijin`).
 */

/**
 * Muat karyawan aktif sesuai filter ke grid (ufrmIjin2.loaddata).
 * Query param: pabrik (wajib), departemen?, jabatan?, bagian?,
 * all_departemen / all_jabatan / all_bagian = 1 meniru checkbox All.
 */
export const muatKaryawan = async (req, res, next) => {
    try {
        const pabrik = String(req.query.pabrik || '').trim()
        if (!pabrik) return error(res, 'Pabrik wajib dipilih', 400)
        const dep = String(req.query.all_departemen || '') === '1' ? '%' : String(req.query.departemen || '%')
        const jab = String(req.query.all_jabatan || '') === '1' ? '%' : String(req.query.jabatan || '%')
        const bagian = String(req.query.all_bagian || '') === '1' ? '%' : String(req.query.bagian || '%')

        const [rows] = await pool.query(
            `SELECT k.kar_Nik AS nik, k.kar_nama AS nama
             FROM tkaryawan k
             WHERE k.kar_status_aktif = 1 AND k.kar_pab_kode = ?
               AND k.kar_dep_kode LIKE ? AND k.kar_jab_kode LIKE ? AND k.kar_bagian LIKE ?
             ORDER BY k.kar_nama LIMIT 2000`,
            [pabrik, dep, jab, bagian]
        )
        success(res, rows)
    } catch (err) {
        next(err)
    }
}

/** Lookup satu karyawan untuk kolom grid (bantuankaryawan). */
export const lookupKaryawan = async (req, res, next) => {
    try {
        const q = String(req.query.search || '').trim()
        const pabrik = String(req.query.pabrik || '').trim()
        const perPage = Math.min(200, parseInt(req.query.per_page) || 20)
        const page = Math.max(1, parseInt(req.query.page) || 1)
        let where = ' WHERE k.kar_status_aktif = 1'
        const params = []
        if (q) {
            where += ' AND (k.kar_Nik LIKE ? OR k.kar_nama LIKE ?)'
            params.push(`%${q}%`, `%${q}%`)
        }
        if (pabrik) {
            where += ' AND k.kar_pab_kode LIKE ?'
            params.push(`%${pabrik}%`)
        }
        const [rows] = await pool.query(
            `SELECT k.kar_Nik AS Nik, LEFT(k.kar_nama, 40) AS Nama, k.kar_pab_kode AS Pabrik,
                    j.jab_nama AS Jabatan, LEFT(k.kar_bagian, 40) AS Bagian,
                    IF(k.kar_status_aktif = 1, 'Aktif', 'Non Aktif') AS Status
             FROM tkaryawan k LEFT JOIN tjabatan j ON j.jab_kode = k.kar_jab_kode
             ${where} ORDER BY k.kar_nama LIMIT ? OFFSET ?`,
            [...params, perPage, (page - 1) * perPage]
        )
        const [cnt] = await pool.query(`SELECT COUNT(*) AS c FROM tkaryawan k ${where}`, params)
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

/** Pratinjau nomor pertama batch (refreshdata: getmaxnomor2(tanggal, 1)). */
export const getNomor = async (req, res, next) => {
    try {
        const tanggal = String(req.query.tanggal || new Date().toISOString().slice(0, 10)).slice(0, 10)
        success(res, { nomor: await nomorBerikut(tanggal), tanggal })
    } catch (err) {
        next(err)
    }
}

/**
 * Simpan kolektif (ufrmIjin2.simpandata + cxButton1Click).
 * Body: { tanggal, jenis_id, keterangan(0-3), alasan, jam, jam2?,
 *         niks: [..] }
 */
export const saveIjin2 = async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
        const b = req.body || {}
        const tanggal = String(b.tanggal || '').slice(0, 10)
        const jenisId = parseInt(b.jenis_id, 10)
        const keterangan = parseInt(b.keterangan ?? 3, 10)
        const alasan = String(b.alasan || '')
        const rawNiks = Array.isArray(b.niks) ? b.niks : []

        if (!tanggal) return error(res, 'Tanggal wajib diisi', 400)
        if (!jenisId) return error(res, 'Jenis ijin wajib dipilih', 400)
        if (![0, 1, 2, 3].includes(keterangan)) return error(res, 'Keterangan tidak valid', 400)

        // V2 menolak tanggal lama tanpa opsi otorisasi.
        if ((await cekTanggal(tanggal)) >= 3) {
            return error(res, 'Tanggal terlalu lama tidak bisa menggunakan modul ini', 403)
        }

        const [jrows] = await conn.query('SELECT ji_id FROM tjenisijin WHERE ji_id = ?', [jenisId])
        if (jrows.length === 0) return error(res, 'Jenis ijin tidak dikenal', 400)

        const niks = rawNiks.map((n) => String(n || '').trim()).filter(Boolean)
        if (niks.length === 0) return error(res, 'Minimal satu NIK harus diisi', 400)
        if (new Set(niks).size !== niks.length) {
            return error(res, 'Ada NIK yang dimasukkan dua kali dalam daftar', 400)
        }

        for (const nik of niks) {
            const [k] = await conn.query('SELECT kar_nama FROM tkaryawan WHERE kar_Nik = ?', [nik])
            if (k.length === 0) return error(res, `NIK ${nik} tidak ada pada master karyawan`, 400)
        }

        // Duplikat NIK+tanggal membatalkan SELURUH batch (seperti Delphi).
        for (const nik of niks) {
            const [d] = await conn.query('SELECT 1 FROM tijin WHERE ij_tanggal = ? AND ij_nik = ? LIMIT 1', [
                tanggal,
                nik,
            ])
            if (d.length > 0) {
                return error(
                    res,
                    `NIK ${nik} sudah pernah dibuatkan ijin pada tanggal ${tanggal} — seluruh batch dibatalkan`,
                    409
                )
            }
        }

        const pakai2 = PAKAI_JAM2.includes(jenisId)
        const jam = normJam(b.jam ?? '00:00:00')
        const jam2 = pakai2 ? normJam(b.jam2 ?? '00:00:00') : '00:00:00'

        const yyyymm = tanggal.slice(0, 7).replace('-', '')
        const prefix = `IJN.${yyyymm}.`
        const pad4 = (n) => String(10000 + n).slice(-4)

        await conn.beginTransaction()
        const [mrows] = await conn.query('SELECT MAX(RIGHT(ij_nomor, 4)) AS m FROM tijin WHERE ij_nomor LIKE ?', [
            `${prefix}%`,
        ])
        let seq = mrows[0]?.m ? parseInt(mrows[0].m, 10) : 0
        const dibuat = []
        for (const nik of niks) {
            seq += 1
            const nomor = `${prefix}${pad4(seq)}`
            await conn.query(
                `INSERT INTO tijin (ij_nomor, ij_ji_id, ij_tanggal, ij_nik, ij_keterangan, ij_jam, ij_jam2, ij_alasan)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [nomor, jenisId, tanggal, nik, keterangan, jam, jam2, alasan]
            )
            dibuat.push(nomor)
        }
        await conn.commit()

        success(
            res,
            { nomor: dibuat, jumlah: dibuat.length },
            dibuat.length === 1
                ? `Berhasil simpan dengan nomor ${dibuat[0]}`
                : `${dibuat.length} ijin berhasil dibuat (${dibuat[0]} s/d ${dibuat[dibuat.length - 1]})`
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
