/**
 * Identitas render laporan berdasarkan seluruh proyeksi hasil query.
 * Query laporan tidak selalu mengirim ID detail/Ijin: NIK + tanggal saja
 * tidak membedakan jenis Ijin, jenis kerja, atau detail SPL pada hari sama.
 * Urutkan nama field agar urutan properti respons tidak memengaruhi key.
 * Tidak menambah field, memutasi, atau menghapus baris data.
 */
export function reportRowKey(row: Record<string, any>): string {
  return JSON.stringify(Object.keys(row).sort().map(key => [key, row[key]]));
}
