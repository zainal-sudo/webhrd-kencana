import { tanggalKeluarValid } from './keluar.js'
import { createHash } from 'node:crypto'

export const PLAFON_PINJAMAN = 30000000
export const PINJAMAN_OPTIONS = Object.freeze({ nominal: [200000, 300000, 400000, 500000], angsuran: [1, 2], bank: ['BSI', 'CIMB'] })
const gagal = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode })
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

export function periodePinjaman(tanggal, angsuran) {
    if (!tanggalKeluarValid(tanggal) || !Number.isInteger(angsuran) || angsuran <= 0) return null
    const [tahun, bulan, hari] = tanggal.split('-').map(Number)
    const awal = tahun * 12 + bulan - 1 + (hari > 20 ? 1 : 0)
    // Calendar arithmetic, including legacy 6/10 installments; never add 30 days.
    const label = offset => `${BULAN[offset % 12]} ${Math.floor(offset / 12)}`
    if (angsuran > 1200) return `${label(awal)} – ${label(awal + angsuran - 1)} (${angsuran} periode)`
    return Array.from({ length: angsuran }, (_, i) => label(awal + i)).join(', ')
}

export function kalkulasiPinjaman(row) {
    const cicilan = Number(row.Cicilan)
    const tanggal = row.Tanggal instanceof Date
        ? `${row.Tanggal.getFullYear()}-${String(row.Tanggal.getMonth() + 1).padStart(2, '0')}-${String(row.Tanggal.getDate()).padStart(2, '0')}`
        : String(row.Tanggal ?? '').slice(0, 10)
    const stored = ['periode_potong1', 'nilai_potong1', 'periode_potong2', 'nilai_potong2'].some(key => row[key] != null)
    const Potongan = stored
        ? [1, 2].filter(i => row[`periode_potong${i}`] != null || row[`nilai_potong${i}`] != null)
            .map(i => ({ periode: row[`periode_potong${i}`] ?? null, nominal: row[`nilai_potong${i}`] ?? null }))
        : (periodePinjaman(tanggal, cicilan)?.split(', ') ?? []).map(periode => ({ periode,
            nominal: row.Pinjam == null ? null : Number(row.Pinjam) / cicilan }))
    return { ...row, Tanggal: tanggal || null, Potongan,
        NominalCicilan: Potongan[0]?.nominal ?? null,
        Periode: Potongan.map(item => item.periode ?? '—').join(', ') || null,
        SisaBayar: row.Pinjam == null || row.Bayar == null ? null : Math.max(Number(row.Pinjam) - Number(row.Bayar), 0),
        Status: row.Pinjam == null || row.Bayar == null ? null : Number(row.Pinjam) - Number(row.Bayar) > 0 ? 'Belum Lunas' : 'Lunas',
    }
}

export function jadwalPinjaman(tanggal, pinjam, angsuran) {
    if (!PINJAMAN_OPTIONS.angsuran.includes(angsuran)) throw gagal('Penyimpanan jadwal potongan membutuhkan cicilan 1x atau 2x.')
    const periode = periodePinjaman(tanggal, angsuran)
    if (!periode) throw gagal('Tanggal pinjaman tidak valid.')
    const labels = periode.split(', ')
    return { periode_potong1: labels[0], nilai_potong1: pinjam / angsuran,
        periode_potong2: labels[1] ?? null, nilai_potong2: angsuran === 2 ? pinjam / 2 : null }
}

export function validasiPinjaman(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw gagal('Data pinjaman tidak valid.')
    if (typeof body.norek !== 'string') throw gagal('No. rekening wajib berupa teks agar nol di depan tetap tersimpan.')
    const data = { nik: String(body.nik ?? '').trim(), tanggal: String(body.tanggal ?? ''),
        pinjam: body.pinjam, angsuran: body.angsuran, bank: String(body.bank ?? '').trim(), norek: String(body.norek ?? '').trim() }
    if (!tanggalKeluarValid(data.tanggal)) throw gagal('Tanggal pinjaman wajib berupa tanggal yang valid.')
    if (!data.nik || [...data.nik].length > 20) throw gagal('NIK wajib diisi, maksimal 20 karakter.')
    if (!PINJAMAN_OPTIONS.nominal.includes(data.pinjam)) throw gagal('Nominal pinjaman harus Rp200.000, Rp300.000, Rp400.000, atau Rp500.000.')
    if (!Number.isInteger(data.angsuran) || !PINJAMAN_OPTIONS.angsuran.includes(data.angsuran)) throw gagal('Jumlah cicilan harus 1x atau 2x.')
    if (!PINJAMAN_OPTIONS.bank.includes(data.bank)) throw gagal('Bank harus BSI atau CIMB.')
    if (!data.norek || [...data.norek].length > 50) throw gagal('No. rekening wajib diisi, maksimal 50 karakter.')
    return data
}

export async function nomorPinjamanBerikut(db, tanggal) {
    if (!tanggalKeluarValid(tanggal)) throw gagal('Tanggal pinjaman tidak valid.')
    const prefix = `PJ.${tanggal.slice(2, 4)}${tanggal.slice(5, 7)}.`
    const [rows] = await db.query(
        `SELECT MAX(CAST(RIGHT(nomor_pinjam, 4) AS UNSIGNED)) AS urut FROM tpinjaman
         WHERE nomor_pinjam LIKE ? AND nomor_pinjam REGEXP '^PJ[.][0-9]{4}[.][0-9]{4}$'`, [`${prefix}%`])
    const urut = Number(rows[0]?.urut || 0) + 1
    if (urut > 9999) throw gagal('Nomor pinjaman bulan ini sudah mencapai 9999.', 409)
    return `${prefix}${String(urut).padStart(4, '0')}`
}

/** One database-wide advisory lock serializes ALL web inserts (including different NIK/months).
 * Dedicated connection owns both lock and InnoDB transaction. No schema/data migration.
 * External writers must coordinate this lock too if they insert loans concurrently.
 */
export async function tambahPinjaman(pool, body) {
    const data = validasiPinjaman(body)
    const jadwal = jadwalPinjaman(data.tanggal, data.pinjam, data.angsuran)
    const conn = await pool.getConnection()
    let locked = false
    let transaction = false
    let reusable = true
    try {
        const [locks] = await conn.query("SELECT GET_LOCK(CONCAT('pinjaman:', SHA1(DATABASE())), 15) AS acquired")
        if (Number(locks[0]?.acquired) !== 1) throw gagal('Pinjaman sedang diproses. Silakan coba lagi.', 409)
        locked = true
        await conn.beginTransaction()
        transaction = true
        const [karyawan] = await conn.query('SELECT kar_status_aktif AS Aktif FROM tkaryawan WHERE kar_Nik = ? LIMIT 1', [data.nik])
        if (!karyawan.length) throw gagal('NIK karyawan tidak ditemukan.')
        if (Number(karyawan[0].Aktif) !== 1) throw gagal('Pinjaman baru hanya untuk karyawan aktif.')
        const [aktif] = await conn.query('SELECT nomor_pinjam FROM tpinjaman WHERE nik = ? AND pinjam - bayar > 0 LIMIT 1', [data.nik])
        if (aktif.length) throw gagal('Karyawan masih memiliki pinjaman yang belum lunas.', 409)
        // Compare in decimal SQL, not floating-point JS; preserve existing double balances.
        const [saldo] = await conn.query(`SELECT (COALESCE(SUM(CAST(pinjam AS DECIMAL(65,20)) - CAST(bayar AS DECIMAL(65,20))), 0) + ? > ?) AS melebihi
            FROM tpinjaman WHERE pinjam - bayar > 0`, [data.pinjam, PLAFON_PINJAMAN])
        if (Number(saldo[0].melebihi)) throw gagal('Pinjaman baru melebihi sisa plafon perusahaan.', 409)
        const nomor = await nomorPinjamanBerikut(conn, data.tanggal)
        await conn.query(`INSERT INTO tpinjaman (nomor_pinjam, nik, tanggal, pinjam, bayar, angsuran, bank, norek,
            periode_potong1, nilai_potong1, periode_potong2, nilai_potong2)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [nomor, data.nik, data.tanggal, data.pinjam, 0, data.angsuran, data.bank, data.norek,
            jadwal.periode_potong1, jadwal.nilai_potong1, jadwal.periode_potong2, jadwal.nilai_potong2])
        await conn.commit()
        transaction = false
        return { nomor, ...data, bayar: 0, ...jadwal,
            Potongan: kalkulasiPinjaman({ ...jadwal, Tanggal: data.tanggal, Pinjam: data.pinjam, Cicilan: data.angsuran }).Potongan }
    } finally {
        try { if (transaction) await conn.rollback() }
        catch (e) { reusable = false; throw e }
        finally {
            try {
                if (locked) {
                    const [released] = await conn.query("SELECT RELEASE_LOCK(CONCAT('pinjaman:', SHA1(DATABASE()))) AS released")
                    reusable = reusable && Number(released[0]?.released) === 1
                }
            } catch (e) { reusable = false; throw e }
            finally { if (reusable) conn.release(); else conn.destroy() }
        }
    }
}

/** Revision of persisted fields only, including mentor-managed balance. No new DB column. */
export function revisionPinjaman(row) {
    const keys = ['Nomor', 'Nik', 'Tanggal', 'Pinjam', 'Bayar', 'Cicilan', 'Bank', 'Norek',
        'periode_potong1', 'nilai_potong1', 'periode_potong2', 'nilai_potong2', 'potong1_diproses_pada', 'potong2_diproses_pada']
    const tanggal = kalkulasiPinjaman(row).Tanggal
    return createHash('sha256').update(JSON.stringify(keys.map(key => {
        if (key === 'Tanggal') return tanggal
        if (row[key] == null) return null
        return ['Pinjam', 'Bayar', 'Cicilan', 'nilai_potong1', 'nilai_potong2'].includes(key) ? Number(row[key]) : String(row[key])
    }))).digest('hex')
}

/** Same lock as INSERT; row lock coordinates with external InnoDB balance updates. */
async function ubahDokumenPinjaman(pool, nomor, body, action) {
    if (!nomor || !body || typeof body.revision !== 'string') throw gagal('Versi dokumen wajib diisi. Muat ulang pinjaman.', 409)
    const conn = await pool.getConnection()
    let locked = false, transaction = false, reusable = true
    try {
        const [locks] = await conn.query("SELECT GET_LOCK(CONCAT('pinjaman:', SHA1(DATABASE())), 15) AS acquired")
        if (Number(locks[0]?.acquired) !== 1) throw gagal('Pinjaman sedang diproses. Silakan coba lagi.', 409)
        locked = true
        await conn.beginTransaction(); transaction = true
        const [rows] = await conn.query(`SELECT nomor_pinjam AS Nomor, nik AS Nik, tanggal AS Tanggal,
            pinjam AS Pinjam, bayar AS Bayar, angsuran AS Cicilan, bank AS Bank, norek AS Norek,
            periode_potong1, nilai_potong1, periode_potong2, nilai_potong2, potong1_diproses_pada, potong2_diproses_pada
            FROM tpinjaman WHERE nomor_pinjam = ? FOR UPDATE`, [nomor])
        if (!rows.length) throw gagal('Pinjaman tidak ditemukan.', 404)
        const row = rows[0]
        if (body.revision !== revisionPinjaman(row)) throw gagal('Data pinjaman telah berubah. Muat ulang sebelum menyimpan atau menghapus.', 409)
        const result = await action(conn, row)
        await conn.commit(); transaction = false
        return result
    } finally {
        try { if (transaction) await conn.rollback() }
        catch (e) { reusable = false; throw e }
        finally {
            try {
                if (locked) {
                    const [released] = await conn.query("SELECT RELEASE_LOCK(CONCAT('pinjaman:', SHA1(DATABASE()))) AS released")
                    reusable = reusable && Number(released[0]?.released) === 1
                }
            } catch (e) { reusable = false; throw e }
            finally { if (reusable) conn.release(); else conn.destroy() }
        }
    }
}

export async function editPinjaman(pool, nomor, body) {
    return ubahDokumenPinjaman(pool, nomor, body, async (conn, row) => {
        const data = { nik: String(body.nik ?? '').trim(), tanggal: String(body.tanggal ?? ''),
            pinjam: body.pinjam, angsuran: body.angsuran, bank: body.bank, norek: body.norek }
        if (!tanggalKeluarValid(data.tanggal)) throw gagal('Tanggal pinjaman wajib berupa tanggal yang valid.')
        if (!data.nik || [...data.nik].length > 20) throw gagal('NIK wajib diisi, maksimal 20 karakter.')
        // Legacy values may remain untouched; changed values follow the new-loan choices.
        if (data.pinjam !== (row.Pinjam == null ? null : Number(row.Pinjam)) && !PINJAMAN_OPTIONS.nominal.includes(data.pinjam)) throw gagal('Nominal baru harus Rp200.000, Rp300.000, Rp400.000, atau Rp500.000.')
        if (data.angsuran !== (row.Cicilan == null ? null : Number(row.Cicilan)) && (!Number.isInteger(data.angsuran) || !PINJAMAN_OPTIONS.angsuran.includes(data.angsuran))) throw gagal('Jumlah cicilan baru harus 1x atau 2x.')
        if (data.bank !== row.Bank && !PINJAMAN_OPTIONS.bank.includes(data.bank)) throw gagal('Bank baru harus BSI atau CIMB.')
        if (data.norek !== row.Norek && (typeof data.norek !== 'string' || !data.norek.trim() || [...data.norek.trim()].length > 50)) throw gagal('No. rekening wajib diisi, maksimal 50 karakter.')
        const nominalChanged = data.pinjam !== (row.Pinjam == null ? null : Number(row.Pinjam))
        const scheduleChanged = nominalChanged || data.tanggal !== kalkulasiPinjaman(row).Tanggal
            || data.angsuran !== (row.Cicilan == null ? null : Number(row.Cicilan))
        if (scheduleChanged && (row.potong1_diproses_pada != null || row.potong2_diproses_pada != null)) {
            throw gagal('Jadwal pinjaman tidak dapat diubah karena sudah ada potongan yang diproses.', 409)
        }
        if (nominalChanged && row.Bayar != null && data.pinjam < Number(row.Bayar)) throw gagal('Nominal pinjaman tidak boleh lebih kecil dari jumlah yang sudah dibayar.')
        if (nominalChanged) {
            const [saldo] = await conn.query(`SELECT (COALESCE(SUM(CAST(pinjam AS DECIMAL(65,20)) - CAST(bayar AS DECIMAL(65,20))), 0) + ? > ?) AS melebihi
                FROM tpinjaman WHERE pinjam - bayar > 0 AND nomor_pinjam <> ?`,
                [row.Bayar == null ? 0 : Math.max(0, data.pinjam - Number(row.Bayar)), PLAFON_PINJAMAN, nomor])
            if (Number(saldo[0].melebihi)) throw gagal('Perubahan pinjaman melebihi sisa plafon perusahaan.', 409)
        }
        if (data.nik !== row.Nik) {
            const [karyawan] = await conn.query('SELECT kar_status_aktif AS Aktif FROM tkaryawan WHERE kar_Nik = ? LIMIT 1', [data.nik])
            if (!karyawan.length) throw gagal('NIK karyawan tidak ditemukan.')
            if (Number(karyawan[0].Aktif) !== 1) throw gagal('Karyawan pengganti harus aktif.')
        }
        if ((data.nik !== row.Nik || nominalChanged) && row.Bayar != null && data.pinjam - Number(row.Bayar) > 0) {
            const [aktif] = await conn.query('SELECT nomor_pinjam FROM tpinjaman WHERE nik = ? AND pinjam - bayar > 0 AND nomor_pinjam <> ? LIMIT 1', [data.nik, nomor])
            if (aktif.length) throw gagal('Karyawan masih memiliki pinjaman yang belum lunas.', 409)
        }
        const jadwal = scheduleChanged ? jadwalPinjaman(data.tanggal, data.pinjam, data.angsuran) : null
        await conn.query(`UPDATE tpinjaman SET nik = ?, tanggal = ?, pinjam = ?, angsuran = ?, bank = ?, norek = ?
            ${jadwal ? ', periode_potong1 = ?, nilai_potong1 = ?, periode_potong2 = ?, nilai_potong2 = ?' : ''}
            WHERE nomor_pinjam = ?`, [data.nik, data.tanggal, data.pinjam, data.angsuran, data.bank, data.norek,
            ...(jadwal ? [jadwal.periode_potong1, jadwal.nilai_potong1, jadwal.periode_potong2, jadwal.nilai_potong2] : []), nomor])
        // Never updates nomor_pinjam or the amount already paid.
        const persistedSchedule = jadwal ?? Object.fromEntries(
            ['periode_potong1', 'nilai_potong1', 'periode_potong2', 'nilai_potong2'].map(key => [key, row[key]]))
        return { nomor, ...data, bayar: row.Bayar, ...persistedSchedule,
            Potongan: kalkulasiPinjaman({ ...persistedSchedule, Tanggal: data.tanggal, Pinjam: data.pinjam, Cicilan: data.angsuran }).Potongan }
    })
}

export async function hapusPinjaman(pool, nomor, body) {
    if (body?.konfirmasi !== nomor) throw gagal('Ketik nomor pinjaman yang tepat untuk konfirmasi hapus permanen.')
    return ubahDokumenPinjaman(pool, nomor, body, async (conn, row) => {
        if (row.potong1_diproses_pada != null || row.potong2_diproses_pada != null) throw gagal('Pinjaman tidak dapat dihapus karena sudah memiliki pelunasan yang diproses.', 409)
        await conn.query('DELETE FROM tpinjaman WHERE nomor_pinjam = ?', [nomor])
        return { nomor }
    })
}
