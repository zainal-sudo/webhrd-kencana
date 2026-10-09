// Only these column identifiers may be used in lookup SQL. Values stay bound.
const COLUMNS = Object.freeze({
    Nik: 'k.kar_Nik',
    KodeAbsensi: 'k.kar_kode_absensi',
    Nama: 'k.kar_nama',
    Jabatan: 'j.jab_nama',
    Bagian: 'k.kar_bagian',
    Pabrik: 'k.kar_pab_kode',
    Status: "IF(k.kar_status_aktif = 1, 'Aktif', 'Non Aktif')",
})

export function applyKaryawanLookup(query, where, params) {
    // Group the existing predicate first, particularly lookup Keluar's OR.
    let filteredWhere = where.trim() ? ` WHERE (${where.replace(/^\s*WHERE\s+/i, '')})` : ''
    for (const [key, column] of Object.entries(COLUMNS)) {
        const value = query[`filter_${key}`]
        if (typeof value !== 'string' || !value.trim()) continue
        filteredWhere += `${filteredWhere ? ' AND' : ' WHERE'} ${column} ${key === 'Status' ? '= ?' : 'LIKE ?'}`
        params.push(key === 'Status' ? value.trim() : `%${value.trim()}%`)
    }
    const column = Object.hasOwn(COLUMNS, query.sort_by) ? COLUMNS[query.sort_by] : COLUMNS.Nama
    const direction = query.sort_dir === 'desc' ? 'DESC' : 'ASC'
    return { where: filteredWhere, orderBy: `ORDER BY ${column} ${direction}, k.kar_Nik ASC` }
}
