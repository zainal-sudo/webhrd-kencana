/** Hitungan inklusif: Sabtu bekerja; Minggu dan libur tidak dihitung. */
export function hitungHariKerjaIjin(tanggal, hariIni, libur = []) {
    const parse = (value) => {
        const text = String(value).slice(0, 10)
        const date = new Date(`${text}T00:00:00Z`)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
            throw new Error('Tanggal tidak valid')
        }
        return date
    }
    const awal = parse(tanggal)
    const akhir = parse(hariIni)
    const hariLibur = new Set(libur)
    let jumlah = 0
    for (const hari = new Date(awal); hari <= akhir; hari.setUTCDate(hari.getUTCDate() + 1)) {
        if (hari.getUTCDay() !== 0 && !hariLibur.has(hari.toISOString().slice(0, 10))) jumlah += 1
    }
    return jumlah
}
