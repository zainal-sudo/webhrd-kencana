/** Kode Keterangan Delphi; berbeda dari master Jenis Ijin (tjenisijin). */
export const KETERANGAN_IJIN = Object.freeze({
    0: 'Sakit',
    1: 'Ijin',
    2: 'Alpha',
    3: 'Lain Lain',
})

/** Ekspresi server-owned, dipakai bersama untuk SELECT, filter, dan sorting. */
export const KETERANGAN_IJIN_SQL = `CASE i.ij_keterangan
    ${Object.entries(KETERANGAN_IJIN).map(([kode, label]) => `WHEN ${kode} THEN '${label}'`).join('\n    ')}
    ELSE CONCAT('Kode ', i.ij_keterangan) END`
