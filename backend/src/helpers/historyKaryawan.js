/** Satu baris per karyawan aktif; semua riwayat tetap dibaca tanpa batas tanggal. */
export const HISTORY_KEYS = [
    'Nik', 'Nama', 'Pabrik', 'Bagian', 'Jabatan', 'PKWT1', 'PKWT2', 'PKWT3',
    'Pembinaan', 'Sp1', 'Sp2', 'Sp3', 'Mutasi', 'Promosi', 'Rotasi', 'Demosi',
    'St_hari', 'Sakit', 'Ijin', 'Alpha',
]
export const HISTORY_COLUMNS = Object.fromEntries(HISTORY_KEYS.map(key => [key, `h.\`${key}\``]))
export const HISTORY_NUMBERS = new Set(['St_hari', 'Sakit', 'Ijin', 'Alpha'])
export const HISTORY_FILTER_OPTIONS = {
    stringColumns: new Set(HISTORY_KEYS.filter(key => !HISTORY_NUMBERS.has(key))),
    numberColumns: HISTORY_NUMBERS,
}

const range = (start, end) => `CONCAT(COALESCE(DATE_FORMAT(${start}, '%Y-%m-%d'), ''), ' s/d ', COALESCE(DATE_FORMAT(${end}, '%Y-%m-%d'), ''))`
const pivot = (category, value, entries) => entries.map(([key, code]) =>
    `MAX(CASE WHEN ${category} = '${code}' THEN ${value} END) AS \`${key}\``).join(',\n        ')

// tpkwt menyimpan kontrak lama yang belum tentu ada di transaksi perubahan status.
// Transaksi menjadi sumber utama; tpkwt hanya fallback per NIK + kategori PKWT.
export const HISTORY_CTE = `WITH
pkwt_ranked AS (
    SELECT contracts.*, ROW_NUMBER() OVER (
        PARTITION BY nik, kategori ORDER BY sumber DESC, tanggal DESC, nomor DESC
    ) AS urutan
    FROM (
        SELECT ps_kar_nik AS nik, ps_kar_status_karyawan2 AS kategori,
            ps_tgl_awal AS awal, ps_tgl_akhir AS akhir,
            COALESCE(ps_tanggal, ps_tgl_awal) AS tanggal, ps_nomor AS nomor, 1 AS sumber
        FROM tperubahanstatus WHERE ps_kar_status_karyawan2 IN (2, 3, 4)
        UNION ALL
        SELECT kar_nik, sk_id, tgl1, tgl2, tgl1, CAST(sk_id AS CHAR), 0
        FROM tpkwt WHERE sk_id IN (2, 3, 4)
    ) contracts
),
pkwt AS (
    SELECT nik, ${pivot('kategori', range('awal', 'akhir'), [['PKWT1', 2], ['PKWT2', 3], ['PKWT3', 4]])}
    FROM pkwt_ranked WHERE urutan = 1 GROUP BY nik
),
sp_ranked AS (
    SELECT sp_nik AS nik, sp_ke, sp_periode1, sp_periode2,
        ROW_NUMBER() OVER (PARTITION BY sp_nik, sp_ke
            ORDER BY COALESCE(sp_tanggal, sp_periode1) DESC, sp_nomor DESC) AS urutan
    FROM tsp
),
sp AS (
    SELECT nik, ${pivot('sp_ke', range('sp_periode1', 'sp_periode2'), [['Pembinaan', 'Pembinaan'], ['Sp1', '1 (Satu)'], ['Sp2', '2 (Dua)'], ['Sp3', '3 (Tiga)']])}
    FROM sp_ranked WHERE urutan = 1 GROUP BY nik
),
mutasi_ranked AS (
    SELECT m.*, ROW_NUMBER() OVER (PARTITION BY mut_nik, mut_alasan
        ORDER BY mut_tanggal DESC, mut_nomor DESC) AS urutan
    FROM tmutasi m
),
mutasi AS (
    SELECT m.mut_nik AS nik,
        ${pivot('m.mut_alasan', `CONCAT('Tanggal:', COALESCE(DATE_FORMAT(m.mut_tanggal, '%Y-%m-%d'), ''), ' ',
            COALESCE(m.mut_pab_kode, ''), '=>', COALESCE(lama.jab_nama, m.mut_jab_kode, ''), '=>', COALESCE(m.mut_bagian, ''),
            ' ', CASE WHEN m.mut_alasan = 'Mutasi' THEN 'mutasi' ELSE m.mut_alasan END, ' ke ',
            COALESCE(m.mut_pab_kode2, ''), '=>', COALESCE(baru.jab_nama, m.mut_jab_kode2, ''), '=>', COALESCE(m.mut_bagian2, ''))`,
        [['Mutasi', 'Mutasi'], ['Promosi', 'Promosi'], ['Rotasi', 'Rotasi'], ['Demosi', 'Demosi']])}
    FROM mutasi_ranked m
    LEFT JOIN tjabatan lama ON lama.jab_kode = m.mut_jab_kode
    LEFT JOIN tjabatan baru ON baru.jab_kode = m.mut_jab_kode2
    WHERE m.urutan = 1 GROUP BY m.mut_nik
),
ijin AS (
    SELECT ij_nik AS nik,
        SUM(CASE WHEN ij_ji_id = 2 THEN 1 ELSE 0 END) AS St_hari,
        SUM(CASE WHEN ij_ji_id = 3 AND ij_keterangan = 0 THEN 1 ELSE 0 END) AS Sakit,
        SUM(CASE WHEN ij_ji_id = 3 AND ij_keterangan = 1 THEN 1 ELSE 0 END) AS Ijin,
        SUM(CASE WHEN ij_ji_id = 3 AND ij_keterangan = 2 THEN 1 ELSE 0 END) AS Alpha
    FROM tijin GROUP BY ij_nik
),
history AS (
    SELECT k.kar_Nik AS Nik, k.kar_nama AS Nama, k.kar_pab_kode AS Pabrik,
        k.kar_bagian AS Bagian, j.jab_nama AS Jabatan,
        p.PKWT1, p.PKWT2, p.PKWT3, s.Pembinaan, s.Sp1, s.Sp2, s.Sp3,
        m.Mutasi, m.Promosi, m.Rotasi, m.Demosi,
        COALESCE(i.St_hari, 0) AS St_hari, COALESCE(i.Sakit, 0) AS Sakit,
        COALESCE(i.Ijin, 0) AS Ijin, COALESCE(i.Alpha, 0) AS Alpha
    FROM tkaryawan k
    LEFT JOIN tjabatan j ON j.jab_kode = k.kar_jab_kode
    LEFT JOIN pkwt p ON p.nik = k.kar_Nik
    LEFT JOIN sp s ON s.nik = k.kar_Nik
    LEFT JOIN mutasi m ON m.nik = k.kar_Nik
    LEFT JOIN ijin i ON i.nik = k.kar_Nik
    WHERE k.kar_status_aktif = 1
)
`

export function normalizeHistoryRows(rows) {
    return rows.map(row => ({
        ...row,
        Nik: String(row.Nik),
        ...Object.fromEntries([...HISTORY_NUMBERS].map(key => [key, Number(row[key] ?? 0)])),
    }))
}
