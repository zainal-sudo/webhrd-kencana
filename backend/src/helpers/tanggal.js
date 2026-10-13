/** Format presentasi saja; jangan dipakai untuk query, key, atau penyimpanan. */
export function formatTanggal(value) {
    if (value === null || value === undefined || value === '') return ''
    const text = value instanceof Date
        ? Number.isNaN(value.getTime()) ? '' : `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
        : String(value)
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|[ T])/.exec(text)
    if (!match) return ''
    const date = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`)
    if (Number.isNaN(date.getTime()) || date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() + 1 !== Number(match[2]) || date.getUTCDate() !== Number(match[3])) return ''
    return `${match[3]}/${match[2]}/${match[1]}`
}
