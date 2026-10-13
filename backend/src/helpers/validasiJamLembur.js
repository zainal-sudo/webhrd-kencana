/** Kosong mengikuti default 00:00:00; selain itu wajib jam harian HH:mm:ss. */
export function validasiJamLembur(detail) {
    for (const [index, row] of detail.entries()) {
        for (const [key, label] of [['jam_mulai', 'Jam Mulai'], ['jam_akhir', 'Jam Akhir']]) {
            const value = String(row?.[key] ?? '').trim()
            if (!value) continue
            if (!/^\d{2}:\d{2}:\d{2}$/.test(value)) {
                return `Baris ${index + 1} — ${label}: isi jam lengkap dalam format HH:mm:ss.`
            }
            const [jam, menit, detik] = value.split(':').map(Number)
            if (jam > 23 || menit > 59 || detik > 59) {
                return `Baris ${index + 1} — ${label}: jam harus 00–23, menit dan detik 00–59.`
            }
        }
    }
    return ''
}
