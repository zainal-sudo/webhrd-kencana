import { accountCode, agendaError, agendaNotificationClock } from '../helpers/agenda.js'

// The server clock is authoritative; neither browser timezone nor client timestamps are trusted.
export { agendaNotificationClock }

export function createAgendaNotificationService(pool, { now = () => new Date() } = {}) {
    return {
        async claim(user, clientId, catchUp = true) {
            const code = accountCode(user)
            if (!code) throw agendaError('Sesi tidak valid.', 401)
            if (typeof clientId !== 'string' || !/^[a-z0-9][a-z0-9_-]{15,63}$/i.test(clientId)) throw agendaError('client_id wajib berupa ID browser 16–64 karakter (huruf, angka, tanda hubung atau underscore).')
            clientId = clientId.toLowerCase()
            const [users] = await pool.query('SELECT user_kode FROM tuser WHERE LOWER(TRIM(user_kode)) = ?', [code])
            if (!users.length) throw agendaError('Akun tidak ditemukan. Silakan login ulang.', 401)
            const db = await pool.getConnection()
            try {
                await db.beginTransaction()
                const { date, time } = agendaNotificationClock(now())
                // Lock the same agenda rows as CRUD so edits/revocation cannot race a claim.
                const [rows] = await db.query(`SELECT a.id, a.title, a.start_time, a.end_time, a.visibility
                    FROM web_agenda a WHERE a.agenda_date = ? AND a.status = 'OPEN'
                    AND a.start_time IS NOT NULL AND a.end_time IS NOT NULL
                    AND a.end_time > a.start_time AND a.start_time <= ? AND a.end_time >= ?
                    AND (a.creator = ? OR (a.visibility = 'shared' AND EXISTS
                        (SELECT 1 FROM web_agenda_recipient r WHERE r.agenda_id = a.id AND r.user_code = ?)))
                    AND NOT EXISTS (SELECT 1 FROM web_agenda_start_notice n WHERE n.agenda_id = a.id AND n.user_code = ? AND n.client_id = ?)
                    ORDER BY a.id FOR UPDATE`, [date, time, time, code, code, code, clientId])
                const notices = []
                for (const row of rows) {
                    const [result] = await db.query('INSERT IGNORE INTO web_agenda_start_notice (agenda_id, user_code, client_id) VALUES (?, ?, ?)', [row.id, code, clientId])
                    if (result.affectedRows !== 1) continue
                    const seconds = value => String(value).split(':').reduce((total, part) => total * 60 + Number(part), 0)
                    const elapsed = seconds(time) - seconds(row.start_time)
                    notices.push({ id: row.id, title: row.title, date,
                        start_time: row.start_time.slice(0, 5), end_time: row.end_time.slice(0, 5), visibility: row.visibility,
                        kind: !catchUp && elapsed <= 60 ? 'started' : 'ongoing' })
                }
                await db.commit()
                return notices
            } catch (error) {
                await db.rollback()
                throw error
            } finally { db.release() }
        },
    }
}
