/**
 * Sumber tunggal seluruh tampilan "Masa PKWT Akan Habis":
 *   card Dashboard + Excel card + cakupan default endpoint Eksekusi PKWT.
 * Monitoring penuh memakai EKSEKUSI_MONITORING_SELECT, termasuk kontrak aman.
 *
 * Semua view WAJIB memakai konstanta di file ini supaya jumlah dan daftarnya
 * selalu konsisten; jangan menuliskan ulang definisi "< 2 bulan" di tempat lain.
 *
 * Rule mengikuti popup login Delphi via `ufrmLogin` yang digantikan card
 * dashboard: karyawan aktif, status kerja masih kontrak (PKWT1..PKWT5 =
 * sk_id 2..6), dan tanggal berakhir master (`kar_tglPKWT2` dari trigger
 * `tperubahanstatus`) SEBELUM 2 bulan kalender dari hari ini.
 * Ekspresi `<` membuat tanggal tepat 2 bulan TIDAK ikut, sesuai existing.
 * Kontrak yang tanggalnya sudah terlewat TETAP masuk selama karyawan masih
 * aktif & berstatus PKWT — angka 1899 pun dibiarkan tampil apa adanya.
 */
export const PKWT_HABIS_WHERE = `kar_tglpkwt2 < DATE_ADD(CURDATE(), INTERVAL 2 MONTH)
    AND kar_status_kerja IN (2, 3, 4, 5, 6) AND kar_status_aktif = 1`
export const PKWT_HABIS_ORDER = 'ORDER BY kar_tglpkwt2 ASC, kar_Nik ASC'

/** Kolom card Dashboard & Excel panel `pkwt_habis` — jangan diubah sendiri-sendiri. */
export const PKWT_HABIS_SELECT = `SELECT kar_Nik AS Nik, LEFT(kar_nama, 50) AS Nama,
        (SELECT LEFT(jab_nama, 20) FROM tjabatan WHERE jab_kode = kar_jab_kode) AS Jabatan,
        (SELECT LEFT(sk_keterangan, 20) FROM tstatuskaryawan WHERE sk_id = kar_status_kerja) AS Status_Kerja,
        LEFT(kar_bagian, 20) AS Bagian, LEFT(kar_pab_kode, 10) AS Pabrik,
        kar_tglpkwt2 AS Tgl_Berakhir
    FROM tkaryawan
    WHERE ${PKWT_HABIS_WHERE} ${PKWT_HABIS_ORDER}`

/** Daftar halaman Eksekusi: identitas penuh, mulai/akhir, dan sisa hari dari DB. */
export const EKSEKUSI_SELECT = `SELECT k.kar_Nik AS Nik, k.kar_nama AS Nama,
        j.jab_nama AS Jabatan, s.sk_keterangan AS Status_PKWT,
        k.kar_bagian AS Bagian, k.kar_pab_kode AS Pabrik,
        k.kar_tglPKWT1 AS Tgl_Mulai, k.kar_tglpkwt2 AS Tgl_Berakhir,
        DATEDIFF(k.kar_tglpkwt2, CURDATE()) AS Sisa_Hari
    FROM tkaryawan k
    LEFT JOIN tjabatan j ON j.jab_kode = k.kar_jab_kode
    LEFT JOIN tstatuskaryawan s ON s.sk_id = k.kar_status_kerja
    WHERE ${PKWT_HABIS_WHERE}`

/** Monitoring seluruh PKWT aktif dengan tanggal akhir, termasuk kategori aman. */
export const EKSEKUSI_MONITORING_SELECT = EKSEKUSI_SELECT.replace(
    PKWT_HABIS_WHERE,
    'k.kar_status_kerja IN (2, 3, 4, 5, 6) AND k.kar_status_aktif = 1 AND k.kar_tglpkwt2 IS NOT NULL',
)
