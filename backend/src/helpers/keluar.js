/** Nomor final mengikuti bulan tanggal keluar, bukan preview di browser. */
export async function nomorKeluarBerikut(db, tanggal) {
    const prefix = `KEL.${tanggal.slice(0, 7).replace('-', '')}.`
    const [rows] = await db.query(
        `SELECT MAX(CAST(RIGHT(kl_nomor, 4) AS UNSIGNED)) AS urut
         FROM tkeluar WHERE kl_nomor LIKE ? AND kl_nomor REGEXP '^KEL[.][0-9]{6}[.][0-9]{4}$'`,
        [`${prefix}%`]
    )
    const urut = Number(rows[0]?.urut || 0) + 1
    if (urut > 9999) throw Object.assign(new Error('Nomor Karyawan Keluar bulan ini sudah mencapai 9999'), { statusCode: 409 })
    return `${prefix}${String(urut).padStart(4, '0')}`
}

export function tanggalKeluarValid(value) {
    const tanggal = String(value ?? '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return false
    const d = new Date(`${tanggal}T00:00:00Z`)
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === tanggal && tanggal >= '1000-01-01'
}

export function validasiKeluar(body) {
    const data = {
        tanggal: String(body.tanggal ?? ''),
        nik: String(body.nik ?? '').trim(),
        alasan: String(body.alasan ?? '').trim(),
        keterangan: String(body.keterangan ?? ''),
    }
    if (!tanggalKeluarValid(data.tanggal)) throw new Error('Tanggal keluar wajib berupa tanggal yang valid')
    if (!data.nik || data.nik.length > 20) throw new Error('NIK wajib diisi, maksimal 20 karakter')
    if (!data.alasan || data.alasan.length > 100) throw new Error('Alasan wajib diisi, maksimal 100 karakter')
    if ([...data.keterangan].length > 50) throw new Error('Keterangan maksimal 50 karakter')
    return data
}

/** MyISAM: tidak mengandalkan rollback. Retry hanya bentrok PK nomor INSERT. */
export async function tambahKeluar(db, data) {
    for (let coba = 0; coba < 5; coba += 1) {
        const nomor = await nomorKeluarBerikut(db, data.tanggal)
        try {
            await db.query(
                `INSERT INTO tkeluar (kl_nomor, kl_tanggal, kl_nik, kl_alasan, kl_ket) VALUES (?, ?, ?, ?, ?)`,
                [nomor, data.tanggal, data.nik, data.alasan, data.keterangan]
            )
            return nomor
        } catch (err) {
            if (err.code !== 'ER_DUP_ENTRY') throw err
        }
    }
    throw Object.assign(new Error('Nomor sedang digunakan pengguna lain. Muat ulang dan coba kembali.'), { statusCode: 409 })
}
