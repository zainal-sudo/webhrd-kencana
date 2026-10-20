export const accountCode = value => String(value ?? '').trim().toLowerCase()
export const agendaError = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode })
export function validAgendaDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1000-01-01') return false
    const date = new Date(`${value}T00:00:00Z`)
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}
export function jakartaToday(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
    const get = name => parts.find(part => part.type === name).value
    return `${get('year')}-${get('month')}-${get('day')}`
}
export function agendaNotificationClock(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(now)
    const get = type => parts.find(part => part.type === type).value
    return { date: jakartaToday(now), time: `${get('hour')}:${get('minute')}:${get('second')}` }
}
export function validateAgenda(body) {
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    const notes = body.notes ?? ''
    if (!title || title.length > 200) throw agendaError('Judul wajib diisi, maksimal 200 karakter.')
    if (typeof notes !== 'string' || notes.length > 10000) throw agendaError('Catatan maksimal 10.000 karakter.')
    if (!validAgendaDate(body.date)) throw agendaError('Tanggal agenda tidak valid.')
    const start = body.start_time || null, end = body.end_time || null
    const time = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
    if ((start || end) && (!time(start) || !time(end) || end <= start)) throw agendaError('Isi jam mulai dan selesai; jam selesai harus setelah jam mulai.')
    if (!['private', 'shared'].includes(body.visibility)) throw agendaError('Jenis agenda tidak valid.')
    if (!['OPEN', 'SELESAI', 'BATAL'].includes(body.status)) throw agendaError('Status agenda tidak valid.')
    if (!Array.isArray(body.recipients) || body.recipients.some(code => typeof code !== 'string' || !accountCode(code) || code.length > 191)) throw agendaError('Daftar penerima tidak valid.')
    const recipients = [...new Set(body.recipients.map(accountCode))].sort()
    if (recipients.length > 200) throw agendaError('Maksimal 200 penerima.')
    if (body.visibility === 'private' && recipients.length) throw agendaError('Agenda pribadi tidak memiliki penerima.')
    if (body.visibility === 'shared' && !recipients.length) throw agendaError('Pilih minimal satu akun penerima.')
    return { title, notes, date: body.date, start_time: start, end_time: end, visibility: body.visibility, status: body.status, recipients }
}
