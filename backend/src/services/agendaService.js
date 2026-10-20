import { accountCode, agendaError, validAgendaDate, validateAgenda, agendaNotificationClock } from '../helpers/agenda.js'

// Factory keeps SQL/transactions testable without a live production database.
export function createAgendaService(pool, { now = () => new Date() } = {}) {
    const columns = 'a.*, UNIX_TIMESTAMP(a.updated_at) AS updated_at_epoch'
    const access = `(a.creator = ? OR (a.visibility = 'shared' AND EXISTS
        (SELECT 1 FROM web_agenda_recipient r WHERE r.agenda_id = a.id AND r.user_code = ?)))`
    async function actor(code) {
        code = accountCode(code)
        if (!code) throw agendaError('Sesi tidak valid.', 401)
        const [rows] = await pool.query('SELECT user_kode FROM tuser WHERE LOWER(TRIM(user_kode)) = ?', [code])
        if (!rows.length) throw agendaError('Akun tidak ditemukan. Silakan login ulang.', 401)
        return code
    }
    function shape(row, recipients = []) {
        return { id: row.id, creator: row.creator, updated_by: row.updated_by ?? null,
            updated_at: row.updated_at_epoch == null ? null : new Date(Number(row.updated_at_epoch) * 1000).toISOString(), title: row.title, notes: row.notes, date: row.agenda_date,
            start_time: row.start_time?.slice(0, 5) || null, end_time: row.end_time?.slice(0, 5) || null,
            visibility: row.visibility, status: row.status, version: row.version, recipients }
    }
    async function recipients(db, id) {
        const [rows] = await db.query('SELECT user_code FROM web_agenda_recipient WHERE agenda_id = ? ORDER BY user_code', [id])
        return rows.map(row => row.user_code)
    }
    async function authorized(db, id, code, lock = false) {
        if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0) throw agendaError('Agenda tidak ditemukan.', 404)
        // Serialize membership changes first, then check the current recipient rows.
        // A recipient revoked by a competing transaction must not retain write access.
        const [rows] = lock
            ? await db.query(`SELECT ${columns} FROM web_agenda a WHERE a.id = ? FOR UPDATE`, [id])
            : await db.query(`SELECT ${columns} FROM web_agenda a WHERE a.id = ? AND ${access}`, [id, code, code])
        if (!rows.length) throw agendaError('Agenda tidak ditemukan atau akses sudah dicabut.', 404)
        if (lock && rows[0].creator !== code) {
            const [membership] = await db.query('SELECT user_code FROM web_agenda_recipient WHERE agenda_id = ? AND user_code = ? FOR UPDATE', [id, code])
            if (rows[0].visibility !== 'shared' || !membership.length) throw agendaError('Agenda tidak ditemukan atau akses sudah dicabut.', 404)
        }
        return rows[0]
    }
    async function transaction(fn) {
        const db = await pool.getConnection()
        try { await db.beginTransaction(); const result = await fn(db); await db.commit(); return result }
        catch (error) { await db.rollback(); throw error }
        finally { db.release() }
    }
    return {
        async list(user, start, end) {
            const code = await actor(user)
            if (!validAgendaDate(start) || !validAgendaDate(end) || start > end || (Date.parse(end) - Date.parse(start)) / 86400000 > 62) throw agendaError('Rentang kalender tidak valid (maksimal 63 hari).')
            const [rows] = await pool.query(`SELECT ${columns} FROM web_agenda a WHERE a.agenda_date BETWEEN ? AND ? AND ${access} ORDER BY a.agenda_date, a.start_time, a.id`, [start, end, code, code])
            const sharedIds = rows.filter(row => row.visibility === 'shared').map(row => row.id)
            const recipientsByAgenda = new Map()
            if (sharedIds.length) {
                const [links] = await pool.query('SELECT agenda_id, user_code FROM web_agenda_recipient WHERE agenda_id IN (?) ORDER BY user_code', [sharedIds])
                for (const link of links) {
                    if (!recipientsByAgenda.has(link.agenda_id)) recipientsByAgenda.set(link.agenda_id, [])
                    recipientsByAgenda.get(link.agenda_id).push(link.user_code)
                }
            }
            return rows.map(row => shape(row, recipientsByAgenda.get(row.id) || []))
        },
        async today(user) {
            const code = await actor(user), { date, time } = agendaNotificationClock(now())
            // Login reminder is independent of start-notice acknowledgements.
            // Keep the original total for the daily sidebar indicator.
            const [rows] = await pool.query(`SELECT COUNT(*) AS count,
                COALESCE(SUM(CASE WHEN a.status = 'OPEN' AND a.start_time IS NOT NULL AND a.end_time IS NOT NULL
                    AND a.end_time > a.start_time AND a.start_time <= ? AND a.end_time >= ? THEN 1 ELSE 0 END), 0) AS ongoing_count,
                COALESCE(SUM(CASE WHEN a.status = 'OPEN' AND a.start_time IS NULL AND a.end_time IS NULL
                    THEN 1 ELSE 0 END), 0) AS all_day_open_count
                FROM web_agenda a WHERE a.agenda_date = ? AND ${access}`, [time, time, date, code, code])
            return { date, count: Number(rows[0].count), ongoing_count: Number(rows[0].ongoing_count), all_day_open_count: Number(rows[0].all_day_open_count) }
        },
        async users(user, search = '') {
            await actor(user)
            const q = String(search).trim().slice(0, 100)
            const [rows] = await pool.query(`SELECT user_kode AS code, user_nama AS name FROM tuser
                WHERE user_kode LIKE ? OR user_nama LIKE ? ORDER BY user_kode LIMIT 100`, [`%${q}%`, `%${q}%`])
            return rows.map(row => ({ code: accountCode(row.code), name: row.name }))
        },
        async detail(user, id) {
            const code = await actor(user), row = await authorized(pool, id, code)
            return shape(row, await recipients(pool, id))
        },
        async save(user, id, body) {
            const code = await actor(user), value = validateAgenda(body)
            return transaction(async db => {
                let existing
                if (id != null) {
                    existing = await authorized(db, id, code, true)
                    if (!Number.isInteger(body.version) || body.version !== existing.version) throw agendaError('Agenda telah berubah. Muat ulang sebelum menyimpan.', 409)
                    const originalRecipients = await recipients(db, id)
                    if (existing.creator !== code && (value.visibility !== existing.visibility || JSON.stringify(value.recipients) !== JSON.stringify(originalRecipients))) throw agendaError('Hanya pembuat yang dapat mengubah pengaturan berbagi dan penerima.', 403)
                }
                if (value.recipients.includes(existing?.creator ?? code)) throw agendaError('Pembuat sudah memiliki akses; pilih akun lain sebagai penerima.')
                if (value.recipients.length) {
                    const [users] = await db.query('SELECT user_kode FROM tuser WHERE LOWER(TRIM(user_kode)) IN (?)', [value.recipients])
                    const found = new Set(users.map(row => accountCode(row.user_kode)))
                    if (value.recipients.some(recipient => !found.has(recipient))) throw agendaError('Salah satu akun penerima sudah tidak tersedia.')
                }
                const fields = [value.title, value.notes, value.date, value.start_time, value.end_time, value.visibility, value.status]
                let version
                if (existing) {
                    await db.query(`UPDATE web_agenda SET title = ?, notes = ?, agenda_date = ?, start_time = ?, end_time = ?, visibility = ?, status = ?, updated_by = ?, version = version + 1 WHERE id = ?`, [...fields, code, id])
                    await db.query('DELETE FROM web_agenda_recipient WHERE agenda_id = ?', [id])
                    version = existing.version + 1
                } else {
                    const [result] = await db.query('INSERT INTO web_agenda (title, notes, agenda_date, start_time, end_time, visibility, status, creator) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [...fields, code])
                    id = result.insertId; version = 1
                }
                for (const recipient of value.recipients) await db.query('INSERT INTO web_agenda_recipient (agenda_id, user_code) VALUES (?, ?)', [id, recipient])
                const [timestamps] = await db.query('SELECT UNIX_TIMESTAMP(updated_at) AS updated_at_epoch FROM web_agenda WHERE id = ?', [id])
                return { id: Number(id), creator: existing?.creator ?? code, updated_by: existing ? code : null,
                    updated_at: shape(timestamps[0]).updated_at, version, ...value }
            })
        },
        async remove(user, id, version) {
            const code = await actor(user)
            return transaction(async db => {
                const existing = await authorized(db, id, code, true)
                if (!Number.isInteger(version) || version !== existing.version) throw agendaError('Agenda telah berubah. Muat ulang sebelum menghapus.', 409)
                await db.query('DELETE FROM web_agenda WHERE id = ?', [id])
            })
        },
    }
}
