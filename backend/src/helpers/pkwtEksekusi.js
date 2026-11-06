/**
 * Sumber tunggal seluruh tampilan "Masa PKWT Akan Habis":
 *   card Dashboard + Excel card + cakupan default endpoint Eksekusi PKWT
 *   + batasan penerbit link Penilaian.
 * Monitoring penuh memakai EKSEKUSI_MONITORING_SELECT, termasuk kontrak aman.
 *
 * Semua view WAJIB memakai konstanta di file ini supaya jumlah dan daftarnya
 * selalu konsisten; jangan menuliskan ulang definisi "< 2 bulan" di tempat lain.
 *
 * Rule dasar mengikuti popup login Delphi via `ufrmLogin` yang digantikan card
 * dashboard: karyawan aktif, status masih kontrak (PKWT1..PKWT5 = sk_id 2..6),
 * dan tanggal berakhir SEBELUM 2 bulan kalender dari hari ini. Ekspresi `<`
 * membuat tanggal tepat 2 bulan TIDAK ikut, sesuai existing. Kontrak yang
 * tanggalnya sudah terlewat TETAP masuk selama karyawan masih aktif & berstatus
 * PKWT — angka 1899 pun dibiarkan tampil apa adanya.
 *
 * Terbaru dari semua tabel: form master dan grid riwayat diisi manual satu-ke-
 * satu, sehingga master (`tkaryawan.kar_tglPKWT1/2`) boleh lebih tua daripada
 * baris riwayat terbaru (`tpkwt`, sk 2..6). Card mengambil kondisi TERBARU di
 * antara keduanya — status, Tgl Mulai, Tgl Berakhir, dan label semuanya ikut
 * sumber yang lebih baru; riwayat yang setara/lebih lama tidak berpengaruh.
 * Semua subquery sengaja portabel (CASE-WHEN/`||`-less, ORDER+LIMIT) agar
 * berlaku di MySQL maupun SQLite (pembandingan unit test).
 */
/** Baris riwayat sk 2..6 yang tanggal-akhirnya MELAMPAUI master — terbaru menang. */
const barisTerbaru = (kolom) =>
    `(SELECT t.${kolom} FROM tpkwt t
      WHERE t.kar_nik = k.kar_Nik AND t.sk_id IN (2, 3, 4, 5, 6)
        AND t.tgl2 > COALESCE(k.kar_tglpkwt2, '1000-01-01')
      ORDER BY t.tgl2 DESC, t.sk_id DESC LIMIT 1)`

/** Tanggal berakhir efektif: master, atau baris riwayat yang lebih baru. */
export const PKWT_EFF_TGL2 = `COALESCE(${barisTerbaru('tgl2')}, k.kar_tglpkwt2)`
/** Tanggal mulai efektif: mengikuti sumber tanggal berakhir efektif. */
export const PKWT_EFF_TGL1 = `COALESCE(${barisTerbaru('tgl1')}, k.kar_tglPKWT1)`
/** Status kerja efektif: mengikuti sumber tanggal berakhir efektif. */
export const PKWT_EFF_SK = `COALESCE(${barisTerbaru('sk_id')}, k.kar_status_kerja)`

export const PKWT_HABIS_WHERE = `${PKWT_EFF_TGL2} < DATE_ADD(CURDATE(), INTERVAL 2 MONTH)
    AND ${PKWT_EFF_SK} IN (2, 3, 4, 5, 6) AND k.kar_status_aktif = 1`
export const PKWT_HABIS_ORDER = `ORDER BY ${PKWT_EFF_TGL2} ASC, k.kar_Nik ASC`

/** Kolom card Dashboard & Excel panel `pkwt_habis` — jangan diubah sendiri-sendiri. */
export const PKWT_HABIS_SELECT = `SELECT k.kar_Nik AS Nik, LEFT(k.kar_nama, 50) AS Nama,
        (SELECT LEFT(jab_nama, 20) FROM tjabatan WHERE jab_kode = k.kar_jab_kode) AS Jabatan,
        (SELECT LEFT(s.sk_keterangan, 20) FROM tstatuskaryawan s WHERE s.sk_id = ${PKWT_EFF_SK}) AS Status_Kerja,
        LEFT(k.kar_bagian, 20) AS Bagian, k.kar_pab_kode AS Pabrik,
        ${PKWT_EFF_TGL2} AS Tgl_Berakhir
    FROM tkaryawan k
    WHERE ${PKWT_HABIS_WHERE} ${PKWT_HABIS_ORDER}`

/** Daftar halaman Eksekusi: identitas penuh, mulai/akhir, dan sisa hari dari DB. */
export const EKSEKUSI_SELECT = `SELECT k.kar_Nik AS Nik, k.kar_nama AS Nama,
        j.jab_nama AS Jabatan,
        (SELECT s.sk_keterangan FROM tstatuskaryawan s WHERE s.sk_id = ${PKWT_EFF_SK}) AS Status_PKWT,
        k.kar_bagian AS Bagian, k.kar_pab_kode AS Pabrik,
        ${PKWT_EFF_TGL1} AS Tgl_Mulai, ${PKWT_EFF_TGL2} AS Tgl_Berakhir,
        DATEDIFF(${PKWT_EFF_TGL2}, CURDATE()) AS Sisa_Hari
    FROM tkaryawan k
    LEFT JOIN tjabatan j ON j.jab_kode = k.kar_jab_kode
    WHERE ${PKWT_HABIS_WHERE}`

/** Monitoring seluruh PKWT aktif dengan tanggal akhir, termasuk kategori aman. */
export const EKSEKUSI_MONITORING_SELECT = EKSEKUSI_SELECT.replace(
    PKWT_HABIS_WHERE,
    'k.kar_status_kerja IN (2, 3, 4, 5, 6) AND k.kar_status_aktif = 1 AND k.kar_tglpkwt2 IS NOT NULL',
)
