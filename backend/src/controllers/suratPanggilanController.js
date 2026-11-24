import { createHash } from 'node:crypto'
import pool from '../config/database.js'
import { success, error } from '../helpers/response.js'

/**
 * Nomor Surat Panggilan Karyawan — DUA hal disimpan di DATABASE:
 *
 *  1. `tnomor_surat_panggilan` — counter urut PER BULAN (bukan localStorage)
 *     supaya nomor unik lintas komputer HRD (dua laptop tidak sama-sama mulai 1)
 *     dan tidak hilang saat cache browser dibersihkan.
 *  2. `tsurat_panggilan_terbit` — nomor yang SUDAH terbit **MELEKAT pada
 *     datanya**: kunci = NIK + nama + rentang tanggal tidak masuk. Membuka
 *     ulang surat untuk data yang sama memakai nomor yang SAMA (tidak menambah
 *     urut); data lain (nama/rentang berbeda) mendapat nomor baru.
 *
 * Dua endpoint (keduanya dijaga `hanyaHrSuper`):
 *   GET  /dashboard/surat-panggilan/nomor?bulan=YYYY-MM
 *        [&nik&nama&tgl_awal&tgl_akhir] → nomor yang sudah terbit untuk data
 *        itu (bila ada), atau urut BERIKUTNYA (peek — belum memakai angka).
 *   POST /dashboard/surat-panggilan/nomor
 *        {bulan, nik?, nama?, tgl_awal?, tgl_akhir?, tahap?, nomor?}
 *        → KUNCI nomor: pakai nomor yang sudah terbit (idempoten), ambil urut
 *          baru secara atomik, atau simpan nomor ketikan HR (`nomor` terisi,
 *          tanpa menaikkan urut).
 *
 * Bulan dihitung dari TANGGAL SURAT yang dipilih HR (romawi/tahun ikut bulan
 * itu), jadi surat terbitan mundur memakai counter bulan tersebut.
 */

const TABEL = 'tnomor_surat_panggilan'
const TABEL_TERBIT = 'tsurat_panggilan_terbit'
const POLA_BULAN = /^\d{4}-(0[1-9]|1[0-2])$/
const POLA_TANGGAL = /^\d{4}-\d{2}-\d{2}$/
const ROMAWI = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']

/** Tabel dibuat bila belum ada (pola controller lain:
 *  `CREATE TABLE IF NOT EXISTS` — lihat absensiController/ijinController). */
async function siapkanTabel() {
    await pool.query(`CREATE TABLE IF NOT EXISTS ${TABEL} (
        no_bulan CHAR(7) NOT NULL,
        no_urut INT NOT NULL DEFAULT 0,
        no_diperbarui DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        no_user VARCHAR(20) NULL,
        PRIMARY KEY (no_bulan)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`)

    await pool.query(`CREATE TABLE IF NOT EXISTS ${TABEL_TERBIT} (
        sp_kunci CHAR(40) NOT NULL,
        sp_nik VARCHAR(30) NULL,
        sp_nama VARCHAR(150) NOT NULL,
        sp_tgl_awal DATE NOT NULL,
        sp_tgl_akhir DATE NOT NULL,
        sp_tahap TINYINT NOT NULL DEFAULT 1,
        sp_bulan CHAR(7) NOT NULL,
        sp_urut INT NOT NULL DEFAULT 0,
        sp_nomor VARCHAR(60) NOT NULL,
        sp_dibuat DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        sp_diperbarui DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        sp_user VARCHAR(20) NULL,
        PRIMARY KEY (sp_kunci),
        KEY idx_bulan_urut (sp_bulan, sp_urut),
        KEY idx_tanggal (sp_tgl_awal, sp_tgl_akhir)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`)
}

/** Bulan "YYYY-MM" dari query (GET) atau body (POST); null bila tidak valid. */
function bulanValid(req) {
    const bulan = String(req.query?.bulan ?? req.body?.bulan ?? '').trim()
    return POLA_BULAN.test(bulan) ? bulan : null
}

/** `<urut>/HRD&GA/<bulan romawi>/<tahun>` — bulan ikut `bulan` (YYYY-MM). */
function nomorDariUrut(urut, bulan) {
    const [tahun, bln] = String(bulan).split('-')
    return `${Math.max(1, Math.trunc(Number(urut) || 1))}/HRD&GA/${ROMAWI[Number(bln) - 1]}/${tahun}`
}

/** Kunci identitas satu surat: NIK + nama + rentang tanggal tidak masuk.
 *  Nama dinormalkan (trim + HURUF BESAR) supaya spasi/kapital tidak membuat
 *  data yang sama dianggap berbeda. */
function kunciSurat({ nik, nama, tglAwal, tglAkhir }) {
    const bahan = [
        String(nik || '').trim(),
        String(nama || '').trim().toUpperCase(),
        tglAwal,
        tglAkhir,
    ].join('|')
    return createHash('sha1').update(bahan).digest('hex')
}

/** Data identitas surat dari query/body. `kunci` null bila tidak lengkap →
 *  endpoint memakai perilaku lama (counter per bulan saja). */
function bacaSurat(src) {
    const nik = String(src?.nik ?? '').trim().slice(0, 30) || null
    const nama = String(src?.nama ?? '').trim().slice(0, 150)
    const tglAwal = String(src?.tgl_awal ?? src?.tglAwal ?? '').trim()
    const tglAkhir = String(src?.tgl_akhir ?? src?.tglAkhir ?? '').trim()
    const tahap = Number(src?.tahap) === 2 ? 2 : 1
    const lengkap = !!nama && POLA_TANGGAL.test(tglAwal) && POLA_TANGGAL.test(tglAkhir)
    return {
        nik,
        nama,
        tglAwal: lengkap ? tglAwal : '',
        tglAkhir: lengkap ? tglAkhir : '',
        tahap,
        kunci: lengkap ? kunciSurat({ nik, nama, tglAwal, tglAkhir }) : null,
    }
}

/** Bentuk data surat terbit untuk response. */
function barisTerbit(row) {
    return {
        bulan: row.sp_bulan,
        urut: Number(row.sp_urut || 0),
        nomor: row.sp_nomor,
        tersimpan: true,
        nik: row.sp_nik,
        nama: row.sp_nama,
        tgl_awal: row.sp_tgl_awal,
        tgl_akhir: row.sp_tgl_akhir,
        tahap: Number(row.sp_tahap || 1),
    }
}

/**
 * GET — nomor untuk data ini: bila sudah pernah terbit → nomor itu (melekat);
 * bila belum → urut BERIKUTNYA (peek, tidak memakai angka).
 */
export const lihatNomorSurat = async (req, res, next) => {
    try {
        const bulan = bulanValid(req)
        if (!bulan) return error(res, 'Format bulan tidak valid (YYYY-MM)', 400)
        await siapkanTabel()

        const surat = bacaSurat(req.query)
        if (surat.kunci) {
            const [rows] = await pool.query(
                `SELECT * FROM ${TABEL_TERBIT} WHERE sp_kunci = ?`,
                [surat.kunci],
            )
            if (rows.length) return success(res, barisTerbit(rows[0]))
        }

        const [rows] = await pool.query(`SELECT no_urut FROM ${TABEL} WHERE no_bulan = ?`, [bulan])
        const urut = Number(rows[0]?.no_urut || 0) + 1
        success(res, { bulan, urut, nomor: nomorDariUrut(urut, bulan), tersimpan: false })
    } catch (err) { next(err) }
}

/**
 * POST — KUNCI nomor untuk satu data surat:
 *  · sudah pernah terbit (kunci sama) → kembalikan nomor LAMA (tanpa naik urut);
 *    bila HR mengetik nomor berbeda → nomor simpanan diperbarui;
 *  · belum → ambil urut baru dari counter bulan (atomik, `SELECT … FOR UPDATE`),
 *    simpan ke tabel terbit supaya melekat;
 *  · `nomor` terisi (ketikan HR) → simpan apa adanya, counter tidak dipakai.
 *
 * Urutan kunci: counter dulu baru tabel terbit → dua komputer HRD yang
 * menekan Unduh bersamaan untuk data BERBEDA tetap dapat nomor berurutan,
 * dan untuk data yang SAMA mendapat nomor yang sama.
 */
export const ambilNomorSurat = async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
        const bulan = bulanValid(req)
        if (!bulan) return error(res, 'Format bulan tidak valid (YYYY-MM)', 400)
        await siapkanTabel()

        const surat = bacaSurat(req.body)
        const manual = String(req.body?.nomor ?? '').trim().slice(0, 60)
        const user = String(req.user?.user || '').trim().slice(0, 20) || null

        await conn.beginTransaction()

        if (surat.kunci) {
            // 1) Nomor sudah melekat pada data ini? Pakai nomor yang sama.
            const [ada] = await conn.query(
                `SELECT * FROM ${TABEL_TERBIT} WHERE sp_kunci = ? FOR UPDATE`,
                [surat.kunci],
            )
            if (ada.length) {
                if (manual && manual !== ada[0].sp_nomor) {
                    await conn.query(
                        `UPDATE ${TABEL_TERBIT} SET sp_nomor = ?, sp_user = ? WHERE sp_kunci = ?`,
                        [manual, user, surat.kunci],
                    )
                    await conn.commit()
                    return success(res, { ...barisTerbit(ada[0]), nomor: manual },
                        'Nomor surat diperbarui')
                }
                await conn.commit()
                return success(res, barisTerbit(ada[0]), 'Nomor surat sudah terbit')
            }

            // 2) Nomor ketikan HR (belum pernah terbit) → simpan tanpa naik urut.
            if (manual) {
                await conn.query(
                    `INSERT INTO ${TABEL_TERBIT}
                        (sp_kunci, sp_nik, sp_nama, sp_tgl_awal, sp_tgl_akhir, sp_tahap,
                         sp_bulan, sp_urut, sp_nomor, sp_user)
                     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
                     ON DUPLICATE KEY UPDATE sp_nomor = VALUES(sp_nomor), sp_user = VALUES(sp_user)`,
                    [surat.kunci, surat.nik, surat.nama, surat.tglAwal, surat.tglAkhir,
                        surat.tahap, bulan, manual, user],
                )
                const [rows] = await conn.query(
                    `SELECT * FROM ${TABEL_TERBIT} WHERE sp_kunci = ?`,
                    [surat.kunci],
                )
                await conn.commit()
                return success(res, barisTerbit(rows[0]), 'Nomor surat disimpan')
            }

            // 3) Ambil urut baru: kunci baris counter bulan ini dulu supaya
            //    permintaan lain (bulan sama) antre, lalu cek ulang data surat.
            await conn.query(
                `INSERT INTO ${TABEL} (no_bulan, no_urut, no_user) VALUES (?, 0, ?)
                 ON DUPLICATE KEY UPDATE no_bulan = no_bulan`,
                [bulan, user],
            )
            const [counter] = await conn.query(
                `SELECT no_urut FROM ${TABEL} WHERE no_bulan = ? FOR UPDATE`,
                [bulan],
            )
            // Permintaan lain untuk data yang sama bisa selesai saat kita antre
            // di counter → kalau sudah ada, batalkan kenaikan & pakai nomor itu.
            const [lagi] = await conn.query(
                `SELECT * FROM ${TABEL_TERBIT} WHERE sp_kunci = ?`,
                [surat.kunci],
            )
            if (lagi.length) {
                await conn.rollback()
                return success(res, barisTerbit(lagi[0]), 'Nomor surat sudah terbit')
            }

            const urut = Number(counter[0]?.no_urut || 0) + 1
            await conn.query(
                `UPDATE ${TABEL} SET no_urut = ?, no_user = ? WHERE no_bulan = ?`,
                [urut, user, bulan],
            )
            const nomor = nomorDariUrut(urut, bulan)
            try {
                await conn.query(
                    `INSERT INTO ${TABEL_TERBIT}
                        (sp_kunci, sp_nik, sp_nama, sp_tgl_awal, sp_tgl_akhir, sp_tahap,
                         sp_bulan, sp_urut, sp_nomor, sp_user)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [surat.kunci, surat.nik, surat.nama, surat.tglAwal, surat.tglAkhir,
                        surat.tahap, bulan, urut, nomor, user],
                )
            } catch (e) {
                // Balapan langka: data yang sama terbit di bulan berbeda hampir
                // bersamaan → pakai nomor yang sudah tersimpan (batalkan urut).
                if (e?.code !== 'ER_DUP_ENTRY') throw e
                await conn.rollback()
                const [rows] = await pool.query(
                    `SELECT * FROM ${TABEL_TERBIT} WHERE sp_kunci = ?`,
                    [surat.kunci],
                )
                if (rows.length) return success(res, barisTerbit(rows[0]), 'Nomor surat sudah terbit')
                throw e
            }
            await conn.commit()
            return success(res, {
                bulan, urut, nomor, tersimpan: true,
                nik: surat.nik, nama: surat.nama,
                tgl_awal: surat.tglAwal, tgl_akhir: surat.tglAkhir, tahap: surat.tahap,
            }, 'Nomor surat diambil')
        }

        // Tanpa identitas surat (pemanggil lama): counter per bulan saja.
        await conn.query(
            `INSERT INTO ${TABEL} (no_bulan, no_urut, no_user) VALUES (?, 0, ?)
             ON DUPLICATE KEY UPDATE no_bulan = no_bulan`,
            [bulan, user],
        )
        const [rows] = await conn.query(
            `SELECT no_urut FROM ${TABEL} WHERE no_bulan = ? FOR UPDATE`,
            [bulan],
        )
        const urut = Number(rows[0]?.no_urut || 0) + 1
        await conn.query(
            `UPDATE ${TABEL} SET no_urut = ?, no_user = ? WHERE no_bulan = ?`,
            [urut, user, bulan],
        )
        await conn.commit()
        success(res, { bulan, urut, nomor: nomorDariUrut(urut, bulan), tersimpan: false },
            'Nomor surat diambil')
    } catch (err) {
        await conn.rollback().catch(() => {})
        next(err)
    } finally {
        conn.release()
    }
}
