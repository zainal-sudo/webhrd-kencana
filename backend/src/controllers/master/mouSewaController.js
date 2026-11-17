import pool from '../../config/database.js'
import { success, error, paginated } from '../../helpers/response.js'
import { buildOrderBy, applyAllColumnFilters } from '../../helpers/browse.js'
import { sendExcel } from '../../helpers/excel.js'

/**
 * Master MoU Sewa (tmou_sewa) — web-only, cerminan file Excel
 * "DATA MOU SEWA.xlsx": NO SURAT | TEMPAT | ALAMAT | AWAL MULAI | BERAKHIR.
 *
 * 1 baris = 1 periode MoU (1 nomor surat). Kolom `mou_grup` menautkan
 * riwayat periode satu tempat: baris perdana memakai mou_grup = mou_id
 * sendiri, sedangkan hasil fitur Eksekusi (tambah periode baru) memakai
 * mou_grup baris sumber — baris lama tetap tersimpan sebagai riwayat.
 *
 * Nomor surat DIKETIK MANUAL (bukan digenerate sistem), sesuai kebutuhan HR.
 */

const ALIAS = {
    mou_id: '`Id`',
    mou_grup: '`Grup`',
    mou_no_surat: '`No Surat`',
    mou_tempat: '`Tempat`',
    mou_alamat: '`Alamat`',
    mou_awal: '`Awal Mulai`',
    mou_berakhir: '`Berakhir`',
    mou_created_by: '`Dibuat Oleh`',
    mou_created_at: '`Dibuat`',
}

/** Kolom yang dianggap tanggal pada validasi. */
const KOLOM_TGL = ['mou_awal', 'mou_berakhir']

/** Ekspresi SQL status satu periode (urutan prioritas):
 *  1) "Selesai"    — ditandai sudah ditangani (mou_selesai = 1);
 *  2) "Berjalan"   — rentang tanggalnya masih mencakup hari ini (walau di
 *                    grup sudah ada periode lebih baru, baris ini tetap
 *                    dianggap berjalan sampai periodenya benar-benar lewat);
 *  3) "Riwayat"    — sudah ada periode lebih baru pada grup & periode lama
 *                    ini sudah berlalu (tidak berjalan lagi);
 *  4) "Belum Mulai" — periode terkini yang tanggal awalnya masih di depan.
 * Dipakai untuk kolom `Status`, filter, sort, distinct & export. */
const STATUS_SQL = `CASE
    WHEN t.mou_selesai = 1 THEN 'Selesai'
    WHEN t.mou_awal IS NOT NULL AND t.mou_awal <= CURDATE()
         AND (t.mou_berakhir IS NULL OR t.mou_berakhir >= CURDATE()) THEN 'Berjalan'
    WHEN EXISTS (SELECT 1 FROM \`tmou_sewa\` s2 WHERE s2.mou_grup = t.mou_grup AND s2.mou_id > t.mou_id) THEN 'Riwayat'
    WHEN t.mou_awal IS NOT NULL AND t.mou_awal > CURDATE() THEN 'Belum Mulai'
    ELSE 'Berjalan' END`

/** Alias → ekspresi SQL untuk filter/sort kolom browse; ditambah kolom
 *  turunan `Status` (ekspresi, bukan kolom fisik). */
const KOLOM_BROWSE = { ...ALIAS, Status: STATUS_SQL }

const selectSql = `SELECT ${Object.entries(ALIAS).map(([c, a]) => `\`${c}\` AS ${a}`).join(', ')},
        (SELECT COUNT(*) FROM \`tmou_sewa\` s2 WHERE s2.mou_grup = t.mou_grup) AS \`Jumlah Periode\`,
        ${STATUS_SQL} AS \`Status\`
    FROM \`tmou_sewa\` t`

/** ISO "yyyy-mm-dd" atau kosong → nilai valid atau null. */
function normTgl(v) {
    if (v === undefined || v === null) return null
    const s = String(v).trim()
    if (!s) return null
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined // penanda invalid
    return s
}

/** Validasi isi form; kembalikan { nilai, gagal } untuk dipakai create/update/eksekusi.
 *  Nomor surat wajib terisi setiap kali dikirim (tidak boleh dikosongkan). */
function validasi(body) {
    const nilai = {}
    if (body.mou_no_surat !== undefined) {
        const no = String(body.mou_no_surat).trim()
        if (no.length > 100) return { gagal: 'Nomor surat maksimal 100 karakter.' }
        if (!no) return { gagal: 'Nomor surat wajib diisi.' }
        nilai.mou_no_surat = no
    }
    if (body.mou_tempat !== undefined) {
        const tempat = String(body.mou_tempat).trim()
        if (!tempat) return { gagal: 'Tempat wajib diisi.' }
        if (tempat.length > 150) return { gagal: 'Tempat maksimal 150 karakter.' }
        nilai.mou_tempat = tempat
    }
    if (body.mou_alamat !== undefined) {
        const alamat = String(body.mou_alamat).trim()
        if (alamat.length > 255) return { gagal: 'Alamat maksimal 255 karakter.' }
        nilai.mou_alamat = alamat || null
    }
    for (const kolom of KOLOM_TGL) {
        if (body[kolom] === undefined) continue
        const tgl = normTgl(body[kolom])
        if (tgl === undefined) return { gagal: 'Format tanggal harus yyyy-mm-dd.' }
        nilai[kolom] = tgl
    }
    // Edit status dari form: "Selesai" = tandai sudah ditangani (mou_selesai=1);
    // status lain membuka tanda itu — Berjalan/Belum Mulai/Riwayat mengikuti tanggal.
    if (body.mou_selesai !== undefined) {
        nilai.mou_selesai = body.mou_selesai ? 1 : 0
    }
    return { nilai }
}

const ambilBaris = async (id) => {
    const [rows] = await pool.query(`${selectSql} WHERE t.mou_id = ?`, [id])
    return rows[0] || null
}

/* ── Daftar browse (pencarian, filter kolom, sort, export xlsx) ───────── */
export const getMouSewaList = async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1)
        const perPage = Math.min(500, parseInt(req.query.per_page) || 25)
        const offset = (page - 1) * perPage

        let where = ''
        let params = []
        if (req.query.search) {
            where = ' WHERE (mou_no_surat LIKE ? OR mou_tempat LIKE ? OR mou_alamat LIKE ?)'
            params = [req.query.search, req.query.search, req.query.search].map((v) => `%${v}%`)
        }
        const f = applyAllColumnFilters(where, params, req.query, KOLOM_BROWSE)
        where = f.clause
        params = f.params
        const orderBy = buildOrderBy(req.query, KOLOM_BROWSE, 'ORDER BY t.mou_berakhir DESC, t.mou_id DESC')

        // Daftar unik nilai status untuk checklist filter kolom di frontend.
        if (req.query.distinct === 'Status') {
            const scoped = applyAllColumnFilters(where, params, req.query, KOLOM_BROWSE, 'Status')
            const [rows] = await pool.query(
                `SELECT DISTINCT ${STATUS_SQL} AS value FROM \`tmou_sewa\` t${scoped.clause} ORDER BY value`,
                scoped.params
            )
            return success(res, rows.map((r) => r.value))
        }

        if (req.query.export === 'xlsx') {
            const [all] = await pool.query(`${selectSql}${where} ${orderBy} LIMIT 50000`, params)
            return sendExcel(res, 'MoU Sewa', ['No Surat', 'Tempat', 'Alamat', 'Awal Mulai', 'Berakhir', 'Status'], all, {
                requestedColumns: req.query.columns,
            })
        }

        const [[cnt], [rows]] = await Promise.all([
            pool.query(`SELECT COUNT(*) AS total FROM \`tmou_sewa\` t${where}`, params),
            pool.query(`${selectSql}${where} ${orderBy} LIMIT ? OFFSET ?`, [...params, perPage, offset]),
        ])
        paginated(res, rows, {
            page,
            per_page: perPage,
            total: cnt[0].total,
            last_page: Math.max(1, Math.ceil(cnt[0].total / perPage)),
        })
    } catch (err) { next(err) }
}

export const getMouSewa = async (req, res, next) => {
    try {
        const row = await ambilBaris(req.params.id)
        if (!row) return error(res, 'MoU Sewa tidak ditemukan', 404)
        success(res, row)
    } catch (err) { next(err) }
}

/* ── Tambah MoU baru (periode perdana) ────────────────────────────────── */
export const createMouSewa = async (req, res, next) => {
    try {
        const { nilai, gagal } = validasi(req.body || {})
        if (gagal) return error(res, gagal, 400)
        if (!nilai.mou_no_surat) return error(res, 'Nomor surat wajib diisi.', 400)
        if (!nilai.mou_tempat) return error(res, 'Tempat wajib diisi.', 400)

        // Grup perdana: mou_grup = mou_id (ditautkan setelah insert).
        const [r] = await pool.query(
            `INSERT INTO \`tmou_sewa\`
                (mou_grup, mou_no_surat, mou_tempat, mou_alamat, mou_awal, mou_berakhir, mou_created_by)
             VALUES (0, ?, ?, ?, ?, ?, ?)`,
            [
                nilai.mou_no_surat,
                nilai.mou_tempat,
                nilai.mou_alamat ?? null,
                nilai.mou_awal ?? null,
                nilai.mou_berakhir ?? null,
                req.user?.user || null,
            ]
        )
        await pool.query('UPDATE `tmou_sewa` SET mou_grup = mou_id WHERE mou_id = ?', [r.insertId])
        success(res, await ambilBaris(r.insertId), 'MoU Sewa berhasil ditambahkan', 201)
    } catch (err) { next(err) }
}

/* ── Ubah satu baris (mou_grup tidak berubah) ─────────────────────────── */
export const updateMouSewa = async (req, res, next) => {
    try {
        const sumber = await ambilBaris(req.params.id)
        if (!sumber) return error(res, 'MoU Sewa tidak ditemukan', 404)
        const { nilai, gagal } = validasi(req.body || {})
        if (gagal) return error(res, gagal, 400)
        const sets = Object.keys(nilai)
        if (sets.length === 0) return error(res, 'Tidak ada perubahan', 400)
        await pool.query(
            `UPDATE \`tmou_sewa\` SET ${sets.map((c) => `\`${c}\` = ?`).join(', ')} WHERE mou_id = ?`,
            [...sets.map((c) => nilai[c]), req.params.id]
        )
        success(res, await ambilBaris(req.params.id), 'MoU Sewa berhasil diupdate')
    } catch (err) { next(err) }
}

/* ── Hapus satu baris periode ─────────────────────────────────────────── */
export const deleteMouSewa = async (req, res, next) => {
    try {
        const [r] = await pool.query('DELETE FROM `tmou_sewa` WHERE mou_id = ?', [req.params.id])
        if (r.affectedRows === 0) return error(res, 'MoU Sewa tidak ditemukan', 404)
        success(res, null, 'MoU Sewa berhasil dihapus')
    } catch (err) { next(err) }
}

/* ── Riwayat periode satu grup (untuk baris expand di Master MoU Sewa) ── */
export const getRiwayatMouSewa = async (req, res, next) => {
    try {
        const sumber = await ambilBaris(req.params.id)
        if (!sumber) return error(res, 'MoU Sewa tidak ditemukan', 404)
        const [rows] = await pool.query(
            `${selectSql} WHERE t.mou_grup = ? ORDER BY t.mou_awal, t.mou_id`,
            [sumber.Grup]
        )
        success(res, rows)
    } catch (err) { next(err) }
}

/* ── Tandai "sudah ditangani" tanpa membuat periode baru ────────────────
 * Baris yang ditandai hilang dari card Dashboard (dan halaman MoU Sewa
 * Berakhir), tapi tetap tersimpan & terlihat di Master MoU Sewa.
 * Kirim { selesai: false } untuk membuka tanda kembali. */
export const tandaiDitanganiMouSewa = async (req, res, next) => {
    try {
        const sumber = await ambilBaris(req.params.id)
        if (!sumber) return error(res, 'MoU Sewa tidak ditemukan', 404)
        const selesai = req.body?.selesai === undefined ? 1 : (req.body.selesai ? 1 : 0)
        await pool.query('UPDATE `tmou_sewa` SET mou_selesai = ? WHERE mou_id = ?', [selesai, req.params.id])
        success(res, null, selesai
            ? 'MoU ditandai SUDAH DITANGANI — tidak lagi muncul di card Dashboard.'
            : 'Tanda "sudah ditangani" dibuka kembali — MoU kembali muncul di card bila memenuhi aturan.')
    } catch (err) { next(err) }
}

/* ── Eksekusi: tambah periode baru untuk MoU yang sama (riwayat tetap) ──
 * Mirip eksekusi PKWT: baris sumber (sudah lewat ±2 bulan sejak berakhir)
 * TIDAK diubah; dibuat baris baru dengan tempat & alamat disalin dari
 * sumber, nomor surat & tanggal periode baru diketik manual oleh HR. */
export const eksekusiMouSewa = async (req, res, next) => {
    try {
        const sumber = await ambilBaris(req.params.id)
        if (!sumber) return error(res, 'MoU Sewa tidak ditemukan', 404)

        const body = { ...req.body, mou_tempat: sumber.Tempat }
        if (body.mou_alamat === undefined) body.mou_alamat = sumber.Alamat ?? ''
        const { nilai, gagal } = validasi(body)
        if (gagal) return error(res, gagal, 400)
        if (!nilai.mou_no_surat) return error(res, 'Nomor surat wajib diisi.', 400)

        // Tempat & alamat TERKUNCI: selalu disalin dari baris sumber, tidak
        // menerima nilai lain dari klien (tidak boleh diedit saat eksekusi).
        // Nomor surat boleh sama (baris dobel dengan no surat sama) atau
        // berbeda — keduanya menjadi baris baru pada grup yang sama.
        const [r] = await pool.query(
            `INSERT INTO \`tmou_sewa\`
                (mou_grup, mou_no_surat, mou_tempat, mou_alamat, mou_awal, mou_berakhir, mou_created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                sumber.Grup,
                nilai.mou_no_surat,
                sumber.Tempat,
                sumber.Alamat ?? null,
                nilai.mou_awal ?? null,
                nilai.mou_berakhir ?? null,
                req.user?.user || null,
            ]
        )
        success(res, await ambilBaris(r.insertId), 'Periode MoU baru berhasil dibuat; periode lama tersimpan sebagai riwayat.', 201)
    } catch (err) { next(err) }
}
