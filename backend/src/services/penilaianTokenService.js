import { createHash, randomBytes } from 'node:crypto'
import { PKWT_HABIS_WHERE } from '../helpers/pkwtEksekusi.js'

export const DEFAULT_TOKEN_TTL_DAYS = 7
export const FORM_TYPES = ['tanpa-bawahan', 'dengan-bawahan']
export const INVALID_LINK_MESSAGE = 'Link penilaian sudah kedaluwarsa atau tidak valid. Silakan meminta link penilaian baru kepada HR.'

// Audit tidak menemukan mapping kode jabatan OPR/STF. Pertahankan rule nama existing.
export function formTypeForJabatan(jabatan) {
    return ['OPERATOR', 'STAF'].includes(String(jabatan || '').trim().toUpperCase())
        ? 'tanpa-bawahan' : 'dengan-bawahan'
}

export const hashAccessToken = (token) => createHash('sha256').update(token).digest('hex')
const fail = (message, status = 404) => Object.assign(new Error(message), { status })
const sqlUtc = (date) => date.toISOString().slice(0, 19).replace('T', ' ')

/** Dependency injection menjaga tes token tidak mengakses database produksi. */
export function createPenilaianTokenService(db, { now = () => new Date(), random = randomBytes, ttlDays = process.env.PENILAIAN_TOKEN_TTL_DAYS || DEFAULT_TOKEN_TTL_DAYS } = {}) {
    const days = Number(ttlDays)
    if (!Number.isSafeInteger(days) || days <= 0) throw new Error('PENILAIAN_TOKEN_TTL_DAYS harus bilangan bulat positif')

    async function issue(nik, createdBy) {
        if (typeof nik !== 'string' || !nik.trim() || nik.length > 50) throw fail('NIK tidak valid', 400)
        if (typeof createdBy !== 'string' || !createdBy || createdBy.length > 64) throw fail('Sesi HR tidak valid', 401)
        // Batasi pembuatan link ke karyawan pada cakupan Eksekusi PKWT existing.
        const [employees] = await db.query(
            `SELECT k.kar_Nik AS nik, j.jab_nama AS jabatan
             FROM tkaryawan k LEFT JOIN tjabatan j ON j.jab_kode = k.kar_jab_kode
             WHERE k.kar_Nik = ? AND ${PKWT_HABIS_WHERE} LIMIT 1`, [nik],
        )
        if (!employees.length) throw fail('Karyawan tidak tersedia dalam daftar Eksekusi PKWT')
        const employee = employees[0]
        const formType = formTypeForJabatan(employee.jabatan)
        const token = random(32).toString('hex')
        const createdAt = now()
        const expiresAt = new Date(createdAt.getTime() + days * 86400000)
        if (!Number.isFinite(expiresAt.getTime())) throw new Error('Masa berlaku token tidak valid')
        await db.query(
            `INSERT INTO web_penilaian_access_token
             (token_hash, kar_nik, form_type, created_by, created_at, expires_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [hashAccessToken(token), employee.nik, formType, createdBy, sqlUtc(createdAt), sqlUtc(expiresAt)],
        )
        return { path: `/penilaian/${formType}?t=${token}`, formType, expiresAt: expiresAt.toISOString() }
    }

    async function access(formType, token) {
        if (!FORM_TYPES.includes(formType) || typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw fail(INVALID_LINK_MESSAGE)
        // Hanya proyeksi identitas minimum; NIK berasal dari token, bukan input public.
        const [rows] = await db.query(
            `SELECT k.kar_Nik AS nik, k.kar_nama AS nama, j.jab_nama AS jabatan,
                    k.kar_bagian AS bagian, k.kar_pab_kode AS pabrik,
                    s.sk_keterangan AS statusKerja,
                    DATE_FORMAT(t.expires_at, '%Y-%m-%dT%H:%i:%sZ') AS expiresAt
             FROM web_penilaian_access_token t
             INNER JOIN tkaryawan k ON k.kar_Nik = t.kar_nik AND k.kar_status_aktif = 1
             LEFT JOIN tjabatan j ON j.jab_kode = k.kar_jab_kode
             LEFT JOIN tstatuskaryawan s ON s.sk_id = k.kar_status_kerja
             WHERE t.token_hash = ? AND t.form_type = ?
               AND t.revoked_at IS NULL AND t.expires_at > UTC_TIMESTAMP()
             LIMIT 1`, [hashAccessToken(token), formType],
        )
        if (!rows.length) throw fail(INVALID_LINK_MESSAGE)
        const row = rows[0]
        // Whitelist juga pada response, tidak meneruskan object DB secara langsung.
        return {
            employee: { nik: row.nik, nama: row.nama, jabatan: row.jabatan, bagian: row.bagian, pabrik: row.pabrik, statusKerja: row.statusKerja },
            formType, expiresAt: row.expiresAt,
        }
    }

    return { issue, access }
}
