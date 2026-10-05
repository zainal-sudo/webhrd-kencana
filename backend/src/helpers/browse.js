/**
 * Helper untuk endpoint browse (tabel server-side):
 *   - sorting  : ?sort_by=Nama&sort_dir=asc
 *   - filter   : ?filter_Nama=kata
 *   - checklist: ?filterSet_Nama=a&filterSet_Nama=b   -> SQL IN
 *   - distinct : ?distinct=Nama                      -> daftar unik untuk filter header
 *
 * Nama kolom SELALU diambil dari whitelist `allowedMap` (alias frontend -> kolom SQL).
 */

/**
 * @param {object} query req.query
 * @param {Record<string,string>} allowedMap alias -> ekspresi kolom SQL
 * @param {string} defaultOrder ORDER BY bawaan bila sort_by tidak valid
 */
export function buildOrderBy(query, allowedMap, defaultOrder) {
    const col = query?.sort_by ? allowedMap[query.sort_by] : null
    let dir = String(query?.sort_dir || '').toLowerCase()
    if (dir !== 'asc' && dir !== 'desc') dir = 'ASC'
    if (col) return `ORDER BY ${col} ${dir}`
    return defaultOrder
}

export function applyColumnFilters(whereClause, params, query, allowedMap, except = null) {
    let clause = whereClause
    const out = [...params]
    if (!query) return { clause, params: out }
    for (const [alias, col] of Object.entries(allowedMap)) {
        if (alias === except) continue
        const raw = query[`filter_${alias}`]
        if (raw === undefined || raw === null) continue
        const v = String(raw).trim()
        if (!v) continue
        clause += ` AND ${col} LIKE ?`
        out.push(`%${v}%`)
    }
    return { clause, params: out }
}

export function applyColumnFilterSets(whereClause, params, query, allowedMap, except = null) {
    let clause = whereClause
    const out = [...params]
    if (!query) return { clause, params: out }
    for (const [alias, col] of Object.entries(allowedMap)) {
        if (alias === except) continue
        let raw = query[`filterSet_${alias}`]
        if (raw === undefined) raw = query[`filterSet_${alias}[]`]
        if (raw === undefined || raw === null) continue
        const arr = (Array.isArray(raw) ? raw : [raw])
            .map((v) => String(v).trim())
            .filter((v) => v !== '')
        if (arr.length === 0) continue
        clause += ` AND ${col} IN (${arr.map(() => '?').join(',')})`
        out.push(...arr)
    }
    return { clause, params: out }
}

export function applyAllColumnFilters(whereClause, params, query, allowedMap, except = null) {
    const f1 = applyColumnFilters(whereClause, params, query, allowedMap, except)
    return applyColumnFilterSets(f1.clause, f1.params, query, allowedMap, except)
}

/**
 * Bangun WHERE dari beberapa kondisi opsional sederhana.
 * @param {Record<string, unknown>} conds nama -> nilai; null/undefined/'' diabaikan
 * @param {string} prefix awalan WHERE bila perlu, default ''
 */
export function buildWhere(conds = {}, prefix = '') {
    const parts = []
    const params = []
    for (const [col, val] of Object.entries(conds)) {
        if (val === null || val === undefined || val === '') continue
        parts.push(`${col} = ?`)
        params.push(val)
    }
    if (parts.length === 0) return { clause: '', params }
    return { clause: `${prefix} ${parts.join(' AND ')}`, params }
}