/** Laporan akhir tahun: jumlah record, bukan tanggal unik atau durasi. */
export const AKHIR_TAHUN_METRICS = [
    { key: 'Sakit', label: 'Sakit', condition: 'ij_ji_id = 3 AND ij_keterangan = 0' },
    { key: 'Ijin', label: 'Ijin', condition: 'ij_ji_id = 3 AND ij_keterangan = 1' },
    { key: 'Alpha', label: 'Alpha', condition: 'ij_ji_id = 3 AND ij_keterangan = 2' },
    { key: 'Lain_Lain', label: 'Lain Lain', condition: 'ij_ji_id = 3 AND ij_keterangan = 3' },
    { key: 'Terlambat', label: 'Terlambat' },
    { key: 'ST_Hari', label: 'ST Hari', condition: 'ij_ji_id = 2' },
]

export const AKHIR_TAHUN_COLUMNS = [
    { key: 'Nik', label: 'NIK' }, { key: 'Nama', label: 'Nama' },
    { key: 'Bagian', label: 'Bagian' }, { key: 'Jabatan', label: 'Jabatan' },
    { key: 'Tgl_Masuk', label: 'Tgl Masuk' }, { key: 'Sistem', label: 'Sistem' },
    { key: 'Jenis_Kelamin', label: 'Jenis Kelamin' }, { key: 'Pabrik', label: 'Pabrik' },
    { key: 'umur_1th', label: 'Masa Kerja > 1 Th' },
    ...Array.from({ length: 12 }, (_, index) => AKHIR_TAHUN_METRICS.map(metric => ({
        key: `${metric.key}_${index + 1}`, label: `${metric.label} ${index + 1}`, numeric: true,
    }))).flat(),
    ...AKHIR_TAHUN_METRICS.map(metric => ({ key: `Total_${metric.key}`, label: `Total ${metric.label}`, numeric: true })),
]

export function periodeAkhirTahun(value, defaultYear = new Date().getFullYear()) {
    const text = String(value ?? defaultYear)
    if ((value != null && !['string', 'number'].includes(typeof value)) || !/^\d{4}$/.test(text) || Number(text) < 1900 || Number(text) > 9998) {
        throw Object.assign(new Error('Tahun harus berupa 4 digit antara 1900 dan 9998'), { statusCode: 400 })
    }
    return { year: Number(text), start: `${text}-01-01`, end: `${Number(text) + 1}-01-01`, reference: `${text}-12-31` }
}

export function akhirTahunSql(period) {
    const ijin = [], absensi = [], monthly = [], totals = []
    for (let month = 1; month <= 12; month++) {
        for (const metric of AKHIR_TAHUN_METRICS) {
            const key = `${metric.key}_${month}`
            const attendance = metric.key === 'Terlambat'
            const source = attendance ? 'a' : 'i'
            const projection = `COALESCE(${source}.\`${key}\`, 0)`
            monthly.push(`${projection} AS \`${key}\``)
            if (attendance) {
                absensi.push(`SUM(CASE WHEN MONTH(tanggal) = ${month} THEN 1 ELSE 0 END) AS \`${key}\``)
            } else {
                ijin.push(`SUM(CASE WHEN MONTH(ij_tanggal) = ${month} AND ${metric.condition} THEN 1 ELSE 0 END) AS \`${key}\``)
            }
        }
    }
    for (const metric of AKHIR_TAHUN_METRICS) {
        const source = metric.key === 'Terlambat' ? 'a' : 'i'
        totals.push(`(${Array.from({ length: 12 }, (_, index) => `COALESCE(${source}.\`${metric.key}_${index + 1}\`, 0)`).join(' + ')}) AS \`Total_${metric.key}\``)
    }
    // Aggregate each transaction source BEFORE joining. No multiplication of
    // Ijin by attendance rows, no deduplication, and no writes/refresh updates.
    const sql = `SELECT k.kar_Nik AS Nik, k.kar_nama AS Nama,
        k.kar_bagian AS Bagian, j.jab_nama AS Jabatan,
        DATE_FORMAT(k.kar_tgl_masuk, '%Y-%m-%d') AS Tgl_Masuk,
        k.kar_sistem_gaji AS Sistem,
        IF(k.kar_jenkel = 1, 'Laki-Laki', 'Perempuan') AS Jenis_Kelamin,
        k.kar_pab_kode AS Pabrik,
        IF(DATEDIFF(?, k.kar_tgl_masuk) > 365, 'Sudah', 'Belum') AS umur_1th,
        ${[...monthly, ...totals].join(',\n        ')}
        FROM tkaryawan k
        INNER JOIN tjabatan j ON j.jab_kode = k.kar_jab_kode
        LEFT JOIN (
            SELECT ij_nik, ${ijin.join(', ')} FROM tijin
            WHERE ij_tanggal >= ? AND ij_tanggal < ?
            GROUP BY ij_nik
        ) i ON i.ij_nik = k.kar_Nik
        LEFT JOIN (
            SELECT nik, ${absensi.join(', ')} FROM tabsensi
            WHERE tanggal >= ? AND tanggal < ? AND status = 2
            GROUP BY nik
        ) a ON a.nik = k.kar_kode_absensi
        WHERE k.kar_status_aktif = 1`
    return { sql, params: [period.reference, period.start, period.end, period.start, period.end] }
}
