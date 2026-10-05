import pool from '../config/database.js'

/**
 * Otorisasi meniru fungsi `cekview / cekinsert / cekedit / cekdelete` pada
 * D:\program\hrd\bantu\Ulib.pas, yaitu:
 *
 *   SELECT * FROM tuser a
 *   INNER JOIN thakuser b ON a.user_kode = b.hak_user_kode
 *   INNER JOIN tmenu   c ON c.men_id   = b.hak_men_id
 *   WHERE a.user_kode = ? AND c.men_nama = ?
 *
 * Catatan: pada Delphi `cekview` membuang karakter pertama class name dan
 * kata "Browse" — mis. TfrmBrowseIjin -> "frmIjin".
 */

const cache = new Map() // userKode -> { at, map }
const TTL = 60_000

/**
 * Ambil peta hak akses satu user.
 * @param {string} userKode
 * @returns {Promise<Record<string, {insert:boolean,edit:boolean,delete:boolean}>>}
 */
export async function getHakAkses(userKode) {
    const cached = cache.get(userKode)
    if (cached && Date.now() - cached.at < TTL) return cached.map

    const [rows] = await pool.query(
        `SELECT c.men_nama,
                b.hak_men_insert, b.hak_men_edit, b.hak_men_delete
         FROM thakuser b
         INNER JOIN tmenu c ON c.men_id = b.hak_men_id
         WHERE b.hak_user_kode = ?`,
        [userKode]
    )

    const map = {}
    for (const r of rows) {
        map[r.men_nama] = {
            insert: r.hak_men_insert === 'Y',
            edit: r.hak_men_edit === 'Y',
            delete: r.hak_men_delete === 'Y',
        }
    }
    cache.set(userKode, { at: Date.now(), map })
    return map
}

export function clearHakAksesCache(userKode) {
    if (userKode) cache.delete(userKode)
    else cache.clear()
}

/**
 * Delphi mengirim *class name* (mis. `TfrmBrowseKaryawan`) sehingga karakter
 * pertama dibuang dan kata "Browse" dihilangkan -> `frmKaryawan`.
 * Route kita sudah memakai nilai `tmenu.men_nama` apa adanya (`frmKaryawan`),
 * jadi karakter 'T' hanya dibuang bila pola class name terdeteksi (T + huruf kecil).
 */
export function normalisasiForm(className) {
    return String(className)
        .replace(/^T(?=[a-z])/, '')
        .replace(/Browse/g, '')
}

/**
 * Cek satu hak akses.
 * @param {'view'|'insert'|'edit'|'delete'} aksi
 */
export async function cekHak(userKode, formName, aksi = 'view') {
    const map = await getHakAkses(userKode)
    const key = normalisasiForm(formName)
    const h = map[key]
    if (!h) return false
    if (aksi === 'view') return true
    return !!h[aksi]
}

/**
 * Middleware: wajib punya hak 'view' pada form tertentu.
 * Contoh: router.get('/karyawan', wajibHak('frmKaryawan'), handler)
 */
export function wajibHak(formName, aksi = 'view') {
    return async (req, res, next) => {
        try {
            const user = req.user?.user
            if (!user) return res.status(401).json({ success: false, message: 'Silakan login' })
            const ok = await cekHak(user, formName, aksi)
            if (!ok) {
                return res.status(403).json({
                    success: false,
                    message: 'Anda tidak berhak membuka modul ini',
                })
            }
            next()
        } catch (err) {
            next(err)
        }
    }
}

/** Semua hak akses user + daftar menu (tmenu) yang boleh dibuka. */
export async function getMenuUser(userKode) {
    const map = await getHakAkses(userKode)
    const [menus] = await pool.query(
        'SELECT men_id, men_nama, men_keterangan, men_modul FROM tmenu ORDER BY men_id'
    )
    return menus
        .filter((m) => map[m.men_nama])
        .map((m) => ({
            men_id: m.men_id,
            men_nama: m.men_nama,
            label: m.men_keterangan || m.men_nama,
            can_insert: !!map[m.men_nama].insert,
            can_edit: !!map[m.men_nama].edit,
            can_delete: !!map[m.men_nama].delete,
        }))
}