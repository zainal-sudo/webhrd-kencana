import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createAgendaNotificationService, agendaNotificationClock } from '../src/services/agendaNotificationService.js'
const CLIENT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const CLIENT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
function serviceForBrowser(db, options, clientId = CLIENT_A) {
    const service = createAgendaNotificationService(db, options)
    return { claim: (user, catchUp = true) => service.claim(user, clientId, catchUp) }
}

const agenda = (id, extra = {}) => ({ id, title: `Agenda ${id}`, agenda_date: '2026-10-19', start_time: '09:00:00', end_time: '10:00:00', status: 'OPEN', creator: 'hrd', visibility: 'private', recipients: [], ...extra })
function database(rows) {
    const claims = new Set(), calls = []
    let failInsert = 0, inserts = 0
    const pool = {
        claims, calls, fail: (at = 1) => { failInsert = at },
        async query(sql, params) {
            calls.push({ sql, params })
            if (sql.startsWith('SELECT user_kode')) return [[...['hrd', 'p1', 'p2', 'p4'].filter(user => user === params[0]).map(user_kode => ({ user_kode }))]]
            throw Error('Unexpected pool query')
        },
        async getConnection() {
            const inserted = []
            return {
                async beginTransaction() {},
                async query(sql, params) {
                    calls.push({ sql, params })
                    if (sql.startsWith('SELECT a.id')) {
                        assert.match(sql, /a\.status = 'OPEN'/)
                        assert.match(sql, /a\.start_time IS NOT NULL AND a\.end_time IS NOT NULL/)
                        assert.match(sql, /a\.end_time > a\.start_time AND a\.start_time <= \? AND a\.end_time >= \?/)
                        assert.match(sql, /a\.creator = \? OR \(a\.visibility = 'shared' AND EXISTS/)
                        assert.match(sql, /r\.agenda_id = a\.id AND r\.user_code = \?/)
                        assert.match(sql, /NOT EXISTS \(SELECT 1 FROM web_agenda_start_notice/)
                        assert.match(sql, /ORDER BY a\.id FOR UPDATE$/)
                        assert.match(sql, /n\.user_code = \? AND n\.client_id = \?/)
                        const [date, start, end, code, recipient, viewer, clientId] = params
                        assert.equal(code, recipient); assert.equal(code, viewer)
                        return [rows.filter(row => row.agenda_date === date && row.status === 'OPEN'
                            && row.start_time && row.end_time && row.end_time > row.start_time && row.start_time <= start && row.end_time >= end
                            && (row.creator === code || (row.visibility === 'shared' && row.recipients.includes(code))) && !claims.has(`${row.id}:${code}:${clientId}`))]
                    }
                    assert.equal(sql, 'INSERT IGNORE INTO web_agenda_start_notice (agenda_id, user_code, client_id) VALUES (?, ?, ?)')
                    if (++inserts === failInsert) throw Error('Database unavailable')
                    const key = params.join(':')
                    if (claims.has(key)) return [{ affectedRows: 0 }]
                    inserted.push(key); claims.add(key)
                    return [{ affectedRows: 1 }]
                },
                async commit() {}, async rollback() { for (const key of inserted) claims.delete(key) }, release() {},
            }
        },
    }
    return pool
}
const options = value => ({ now: () => new Date(`2026-10-19T${value}+07:00`) })

test('Server uses Jakarta date/time across UTC and WIB midnight boundaries', () => {
    assert.deepEqual(agendaNotificationClock(new Date('2026-10-18T17:00:00Z')), { date: '2026-10-19', time: '00:00:00' })
    assert.deepEqual(agendaNotificationClock(new Date('2026-10-19T02:00:00Z')), { date: '2026-10-19', time: '09:00:00' })
})

test('Upcoming, expired, SELESAI, BATAL, all-day and incomplete/invalid times never notify', async () => {
    const db = database([
        agenda(1, { start_time: '09:01:00' }), agenda(2, { end_time: '08:59:59', start_time: '08:00:00' }),
        agenda(3, { status: 'SELESAI' }), agenda(4, { status: 'BATAL' }),
        agenda(5, { start_time: null, end_time: null }), agenda(6, { end_time: null }), agenda(7, { start_time: null }),
        agenda(8, { start_time: '10:00:00', end_time: '09:00:00' }), agenda(9, { agenda_date: '2026-10-18' }),
    ])
    assert.deepEqual(await serviceForBrowser(db, options('09:00:00')).claim('hrd', false), [])
    assert.equal(db.claims.size, 0)
})

test('Start, slight polling delay and inclusive end use correct wording and only claim once across service instances/sessions', async () => {
    for (const time of ['09:00:00', '09:00:37', '09:01:00', '09:01:01', '10:00:00', '10:00:01']) {
        const db = database([agenda(1)])
        const notices = await serviceForBrowser(db, options(time)).claim(' HRD ', false)
        assert.equal(notices.length, time > '10:00:00' ? 0 : 1, time)
        if (notices.length) {
            assert.equal(notices[0].kind, time <= '09:01:00' ? 'started' : 'ongoing')
            assert.equal(notices[0].start_time, '09:00'); assert.equal(notices[0].end_time, '10:00')
        }
        assert.deepEqual(await serviceForBrowser(db, options(time)).claim('hrd'), [])
    }
})

test('App opening during an agenda uses ongoing wording; existing claim persists through refresh/login and schedule edits', async () => {
    const row = agenda(1), db = database([row])
    assert.equal((await serviceForBrowser(db, options('09:00:05')).claim('hrd'))[0].kind, 'ongoing')
    row.start_time = '09:10:00'; row.end_time = '11:00:00'
    assert.deepEqual(await serviceForBrowser(db, options('09:30:00')).claim('hrd'), [])
})

test('Private: creator only; shared: creator plus each recipient, with independent notification states', async () => {
    const db = database([agenda(1), agenda(2, { visibility: 'shared', recipients: ['p1', 'p2'] }), agenda(3, { recipients: ['p1'] })])
    const service = serviceForBrowser(db, options('09:10:00'))
    assert.deepEqual((await service.claim('hrd')).map(row => row.id), [1, 2, 3])
    assert.deepEqual((await service.claim('p1')).map(row => row.id), [2])
    assert.deepEqual((await service.claim('p2')).map(row => row.id), [2])
    assert.deepEqual(await service.claim('p1'), [])
    assert.equal(db.claims.size, 5)
})

test('Concurrent tabs/polls cannot both claim the same agenda/user', async () => {
    const db = database([agenda(1)])
    const a = serviceForBrowser(db, options('09:00:30'))
    const b = serviceForBrowser(db, options('09:00:30'))
    const results = await Promise.all([a.claim('hrd', false), b.claim('hrd', false)])
    assert.equal(results.flat().length, 1)
    assert.equal(db.claims.size, 1)
})

test('Unknown users rejected, revoked recipients excluded, failure does not return or retain claims', async () => {
    const row = agenda(1, { visibility: 'shared', recipients: ['p1'] }), db = database([row])
    const service = serviceForBrowser(db, options('09:10:00'))
    await assert.rejects(service.claim('deleted'), { statusCode: 401 })
    row.recipients = []
    assert.deepEqual(await service.claim('p1'), [])
    db.fail()
    await assert.rejects(service.claim('hrd'), /Database unavailable/)
    assert.equal(db.claims.size, 0)
})

test('A later insert failure rolls back earlier claims in the same batch', async () => {
    const db = database([agenda(1), agenda(2)])
    db.fail(2)
    await assert.rejects(serviceForBrowser(db, options('09:10:00')).claim('hrd'), /Database unavailable/)
    assert.equal(db.claims.size, 0)
})

test('Claim route uses authenticated identity and new acknowledgement schema is manual/unique', () => {
    const routes = readFileSync(new URL('../src/routes/agendaRoutes.js', import.meta.url), 'utf8')
    assert.match(routes, /r\.post\('\/notifications\/claim'.*notifications\.claim\(req\.user\.user/)
    assert.match(routes, /notifications\.claim\(req\.user\.user, req\.body\?\.client_id, req\.body\?\.catch_up !== false\)/)
    assert.doesNotMatch(routes, /CREATE TABLE|ALTER TABLE/)
    const schema = readFileSync(new URL('../migrations/20261019_agenda_start_notice.sql', import.meta.url), 'utf8')
    assert.match(schema, /client_id VARCHAR\(64\) NOT NULL/)
    assert.match(schema, /PRIMARY KEY \(agenda_id, user_code, client_id\)/)
    assert.doesNotMatch(schema, /ALTER TABLE|UPDATE tuser|INSERT INTO/)
})

test('Shared HRD account: browser A repeats are suppressed while browser B and another account stay independent', async () => {
    const db = database([agenda(12, { visibility: 'shared', recipients: ['p4'] })])
    const a = serviceForBrowser(db, options('09:10:00'), CLIENT_A)
    assert.equal((await a.claim('hrd')).length, 1)
    assert.deepEqual(await a.claim('hrd'), [])
    assert.deepEqual(await serviceForBrowser(db, options('09:10:00'), CLIENT_A).claim('hrd'), [])
    assert.equal((await serviceForBrowser(db, options('09:10:00'), CLIENT_B).claim('hrd')).length, 1)
    assert.equal((await a.claim('p4')).length, 1)
    assert.equal(db.claims.size, 3)
})

test('Same user can concurrently claim on two clients; client validation rejects malformed IDs before any SQL', async () => {
    const db = database([agenda(1)])
    const service = createAgendaNotificationService(db, options('09:10:00'))
    assert.equal((await Promise.all([service.claim('hrd', CLIENT_A), service.claim('hrd', CLIENT_B)])).flat().length, 2)
    const before = db.calls.length
    for (const invalid of [undefined, null, {}, 123, '', 'hrd', 'a'.repeat(65), 'bad id'.repeat(4), '<script>alert(1)</script>']) {
        await assert.rejects(service.claim('hrd', invalid), { statusCode: 400 })
    }
    assert.equal(db.calls.length, before)
    assert.deepEqual(await service.claim('hrd', CLIENT_A.toUpperCase()), [])
})
