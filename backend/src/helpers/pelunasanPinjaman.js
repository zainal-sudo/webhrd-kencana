const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
const gagal = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode })

export function periodePelunasan(bulan, tahun) {
    const b = Number(bulan), t = Number(tahun)
    if (!Number.isInteger(b) || b < 1 || b > 12 || !Number.isInteger(t) || t < 1000 || t > 9999) throw gagal('Bulan/tahun pelunasan tidak valid.')
    return `${BULAN[b - 1]} ${t}`
}

export async function prosesPelunasan(pool, body) {
    const periode = periodePelunasan(body?.bulan, body?.tahun)
    if (!Array.isArray(body?.items) || !body.items.length || body.items.length > 500) throw gagal('Pilih 1–500 potongan untuk diproses.')
    const seen = new Set()
    const items = body.items.map(item => {
        if (typeof item?.nomor_pinjam !== 'string' || !item.nomor_pinjam || item.nomor_pinjam.length > 20
            || ![1, 2].includes(item.potongan_ke)) throw gagal('Identitas potongan tidak valid.')
        const key = JSON.stringify([item.nomor_pinjam, item.potongan_ke])
        if (seen.has(key)) throw gagal('Potongan yang sama tidak boleh dipilih dua kali.')
        seen.add(key)
        return { nomor_pinjam: item.nomor_pinjam, potongan_ke: item.potongan_ke }
    }).sort((a, b) => a.nomor_pinjam.localeCompare(b.nomor_pinjam) || a.potongan_ke - b.potongan_ke)
    const conn = await pool.getConnection()
    let locked = false, transaction = false, reusable = true
    try {
        const [locks] = await conn.query("SELECT GET_LOCK(CONCAT('pinjaman:', SHA1(DATABASE())), 15) AS acquired")
        if (Number(locks[0]?.acquired) !== 1) throw gagal('Pinjaman sedang diproses. Silakan coba lagi.', 409)
        locked = true
        await conn.beginTransaction(); transaction = true
        const result = []
        for (const item of items) {
            const [rows] = await conn.query(`SELECT nomor_pinjam, pinjam, bayar,
                periode_potong1, nilai_potong1, periode_potong2, nilai_potong2,
                potong1_diproses_pada, potong2_diproses_pada
                FROM tpinjaman WHERE nomor_pinjam = ? FOR UPDATE`, [item.nomor_pinjam])
            if (!rows.length) throw gagal(`Pinjaman ${item.nomor_pinjam} tidak ditemukan. Seluruh batch dibatalkan.`, 409)
            const row = rows[0], i = item.potongan_ke
            const label = `${item.nomor_pinjam} potongan ke-${i}`
            if (row[`periode_potong${i}`] !== periode) throw gagal(`${label}: periode tersimpan tidak sesuai ${periode}. Seluruh batch dibatalkan.`, 409)
            if (row[`potong${i}_diproses_pada`] != null) throw gagal(`${label} sudah diproses. Muat ulang daftar; seluruh batch dibatalkan.`, 409)
            const nominal = Number(row[`nilai_potong${i}`]), bayar = Number(row.bayar), pinjam = Number(row.pinjam)
            if (row[`nilai_potong${i}`] == null || !Number.isFinite(nominal) || nominal <= 0
                || row.bayar == null || !Number.isFinite(bayar) || bayar < 0
                || row.pinjam == null || !Number.isFinite(pinjam) || pinjam <= 0) throw gagal(`${label}: nominal atau saldo tidak valid. Seluruh batch dibatalkan.`, 409)
            // Financial arithmetic and final guard in decimal SQL, not client/floating-point sums.
            const [updated] = await conn.query(`UPDATE tpinjaman SET
                bayar = CAST(bayar AS DECIMAL(65,20)) + CAST(nilai_potong${i} AS DECIMAL(65,20)),
                potong${i}_diproses_pada = CURRENT_TIMESTAMP
                WHERE nomor_pinjam = ? AND potong${i}_diproses_pada IS NULL
                  AND CAST(bayar AS DECIMAL(65,20)) + CAST(nilai_potong${i} AS DECIMAL(65,20)) <= CAST(pinjam AS DECIMAL(65,20))`, [item.nomor_pinjam])
            if (updated.affectedRows !== 1) throw gagal(`${label}: pembayaran melebihi nominal pinjaman atau data berubah. Seluruh batch dibatalkan.`, 409)
            result.push({ ...item, nominal })
        }
        await conn.commit(); transaction = false
        return { periode, jumlah: result.length, total: result.reduce((sum, item) => sum + item.nominal, 0), items: result }
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

/** Stored schedules only. No legacy display fallback is eligible for financial processing. */
export function queryPelunasan(query) {
    const periode = periodePelunasan(query.bulan, query.tahun)
    const page = Math.max(1, parseInt(query.page) || 1), per_page = Math.max(1, Math.min(100, parseInt(query.per_page) || 25))
    const params = [periode, periode]
    const union = [1, 2].map(i => `SELECT p.nomor_pinjam AS Nomor, p.nik AS Nik, k.kar_nama AS Nama,
        p.pinjam AS Pinjam, p.bayar AS Bayar, GREATEST(p.pinjam - p.bayar, 0) AS SisaBayar,
        ${i} AS PotonganKe, p.nilai_potong${i} AS Potongan, p.potong${i}_diproses_pada AS DiprosesPada
        FROM tpinjaman p LEFT JOIN tkaryawan k ON k.kar_Nik = p.nik
        WHERE p.periode_potong${i} = ? AND p.nilai_potong${i} > 0`).join(' UNION ALL ')
    let where = ''
    if (query.search) {
        where = ' WHERE (q.Nomor LIKE ? OR q.Nik LIKE ? OR q.Nama LIKE ?)'
        params.push(...Array(3).fill(`%${query.search}%`))
    }
    const from = ` FROM (${union}) q${where}`
    return { periode, page, per_page, params,
        list: `SELECT q.*${from} ORDER BY q.Nik, q.Nomor, q.PotonganKe LIMIT ? OFFSET ?`,
        count: `SELECT COUNT(*) AS c${from}` }
}
