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

export function applyColumnFilterSets(whereClause, params, query, allowedMap, except = null, options = {}) {
    let clause = whereClause
    const out = [...params]
    if (!query) return { clause, params: out }
    for (const [alias, col] of Object.entries(allowedMap)) {
        if (alias === except) continue
        let raw = query[`filterSet_${alias}`]
        if (raw === undefined) raw = query[`filterSet_${alias}[]`]
        const includeNull = query[`filterNull_${alias}`] === '1'
        const stringColumn = options.stringColumns?.has(alias)
        const numberColumn = options.numberColumns?.has(alias)
        const includeEmpty = query[`filterEmpty_${alias}`] === '1'
            && (!options.stringColumns || stringColumn)
        if ((raw === undefined || raw === null) && !includeNull && !includeEmpty) continue
        const arr = (raw === undefined || raw === null ? [] : Array.isArray(raw) ? raw : [raw])
            .map((v) => String(v))
            .filter((v) => v !== '')
            .map((v) => numberColumn && Number.isFinite(Number(v)) ? Number(v) : v)
        const alternatives = []
        if (arr.length) alternatives.push(`${col} IN (${arr.map(() => '?').join(',')})`)
        if (includeNull) alternatives.push(`${col} IS NULL`)
        // Exact byte length keeps numeric/time zero and whitespace-only strings non-blank,
        // including under MySQL PAD SPACE collations.
        if (includeEmpty) alternatives.push(`OCTET_LENGTH(${col}) = 0`)
        if (!alternatives.length) continue
        // Preserve exact old SQL for normal-only filters; group mixed choices with OR.
        clause += ` AND ${alternatives.length === 1 ? alternatives[0] : `(${alternatives.join(' OR ')})`}`
        out.push(...arr)
    }
    return { clause, params: out }
}

/**
 * Inverse of applyColumnFilterSets: hide only the values the user unchecked.
 * The browse popup falls back to this when hiding a couple of choices out of a
 * long list — sending every other value as `IN (?)` would make the GET URL
 * exceed the server header limit and the request would die before a response
 * (surfaced in the UI as `Network Error`).
 *
 * Semantics match an Excel-style checklist: rows with NULL stay visible unless
 * Blank itself is hidden; hiding Blank on a string column also removes empty
 * strings because both share one popup choice.
 */
export function applyColumnExcludes(whereClause, params, query, allowedMap, except = null, options = {}) {
    let clause = whereClause
    const out = [...params]
    if (!query) return { clause, params: out }
    for (const [alias, col] of Object.entries(allowedMap)) {
        if (alias === except) continue
        let raw = query[`filterNotSet_${alias}`]
        if (raw === undefined) raw = query[`filterNotSet_${alias}[]`]
        const excludeNull = query[`filterNotNull_${alias}`] === '1'
        const stringColumn = options.stringColumns?.has(alias)
        const numberColumn = options.numberColumns?.has(alias)
        const excludeEmpty = query[`filterNotEmpty_${alias}`] === '1'
            && (!options.stringColumns || stringColumn)
        if (raw === undefined && !excludeNull && !excludeEmpty) continue
        const arr = (raw === undefined || raw === null ? [] : Array.isArray(raw) ? raw : [raw])
            .map((v) => String(v))
            .filter((v) => v !== '')
            .map((v) => numberColumn && Number.isFinite(Number(v)) ? Number(v) : v)
        const alternatives = []
        // NULL is not matched by NOT IN; keep those rows unless Blank was hidden.
        if (arr.length) alternatives.push(`(${col} IS NULL OR ${col} NOT IN (${arr.map(() => '?').join(',')}))`)
        if (excludeNull) alternatives.push(`${col} IS NOT NULL`)
        // OCTET_LENGTH(NULL) is NULL, so this also removes NULL rows when Blank is hidden.
        if (excludeEmpty) alternatives.push(`OCTET_LENGTH(${col}) > 0`)
        if (!alternatives.length) continue
        clause += ` AND ${alternatives.length === 1 ? alternatives[0] : `(${alternatives.join(' AND ')})`}`
        out.push(...arr)
    }
    return { clause, params: out }
}

export function applyAllColumnFilters(whereClause, params, query, allowedMap, except = null, options = {}) {
    const f1 = applyColumnFilters(whereClause, params, query, allowedMap, except)
    const f2 = applyColumnFilterSets(f1.clause, f1.params, query, allowedMap, except, options)
    return applyColumnExcludes(f2.clause, f2.params, query, allowedMap, except, options)
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
