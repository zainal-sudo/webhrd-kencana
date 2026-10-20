import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createAgendaService } from '../src/services/agendaService.js'
import { validateAgenda, jakartaToday, validAgendaDate } from '../src/helpers/agenda.js'

const body = (extra = {}) => ({ title: 'Rapat HRD', notes: 'Catatan <aman>', date: '2026-10-16', start_time: null, end_time: null, visibility: 'private', status: 'OPEN', recipients: [], ...extra })
function database() {
    let records = [], links = [], sequence = 0, snapshot
    const calls = [], users = ['hrd', 'p1', 'p2', 'p4', 'super']
    const db = {
        calls,
        seed(row) { records.push({ id: ++sequence, ...row }) },
        async query(sql, params = []) {
            calls.push({ sql, params })
            if (sql.startsWith('SELECT agenda_id, user_code FROM')) return [links.filter(link => params[0].includes(link.agenda_id)).sort((a, b) => a.user_code.localeCompare(b.user_code))]
            if (sql.startsWith('SELECT UNIX_TIMESTAMP(updated_at)')) return [[{ updated_at_epoch: records.find(row => row.id === Number(params[0])).updated_at_epoch }]]
            if (sql.startsWith('SELECT user_kode FROM tuser')) {
                const wanted = Array.isArray(params[0]) ? params[0] : [params[0]]
                return [users.filter(code => wanted.includes(code)).map(user_kode => ({ user_kode }))]
            }
            if (sql.startsWith('SELECT user_kode AS code')) return [users.filter(code => code.includes(params[0].replaceAll('%', ''))).map(code => ({ code, name: `Nama ${code}` }))]
            if (sql.includes('FROM web_agenda a')) {
                const lockOnly = sql.endsWith('WHERE a.id = ? FOR UPDATE')
                if (!lockOnly) {
                    assert.match(sql, /a\.creator = \? OR \(a\.visibility = 'shared' AND EXISTS/)
                    assert.match(sql, /r\.agenda_id = a\.id AND r\.user_code = \?/)
                }
                const code = params.at(-1)
                let found = records.filter(row => lockOnly || row.creator === code || (row.visibility === 'shared' && links.some(link => link.agenda_id === row.id && link.user_code === code)))
                if (sql.includes('a.id = ?')) found = found.filter(row => row.id === Number(params[0]))
                else if (sql.includes('BETWEEN')) found = found.filter(row => row.agenda_date >= params[0] && row.agenda_date <= params[1])
                else found = found.filter(row => row.agenda_date === params[sql.includes('ongoing_count') ? 2 : 0])
                if (sql.includes('COUNT(*)')) {
                    const time = value => value?.length === 5 ? `${value}:00` : value
                    return [[{ count: found.length,
                        ongoing_count: found.filter(row => row.status === 'OPEN' && row.start_time && row.end_time && row.end_time > row.start_time && time(row.start_time) <= params[0] && time(row.end_time) >= params[1]).length,
                        all_day_open_count: found.filter(row => row.status === 'OPEN' && row.start_time == null && row.end_time == null).length }]]
                }
                return [structuredClone(found)]
            }
            if (sql.startsWith('SELECT user_code FROM')) return [links.filter(link => link.agenda_id === Number(params[0]) && (params.length === 1 || link.user_code === params[1])).sort((a, b) => a.user_code.localeCompare(b.user_code)).map(link => ({ user_code: link.user_code }))]
            if (sql.startsWith('INSERT INTO web_agenda (')) {
                const [title, notes, agenda_date, start_time, end_time, visibility, status, creator] = params
                const id = ++sequence
                records.push({ id, title, notes, agenda_date, start_time, end_time, visibility, status, creator, version: 1, updated_at_epoch: 1792130400 })
                return [{ insertId: id }]
            }
            if (sql.startsWith('UPDATE web_agenda SET')) {
                const [title, notes, agenda_date, start_time, end_time, visibility, status, updated_by, id] = params
                const row = records.find(row => row.id === Number(id))
                Object.assign(row, { title, notes, agenda_date, start_time, end_time, visibility, status, updated_by, version: row.version + 1, updated_at_epoch: row.updated_at_epoch + 60 })
                return [{ affectedRows: 1 }]
            }
            if (sql.startsWith('DELETE FROM web_agenda_recipient')) { links = links.filter(link => link.agenda_id !== Number(params[0])); return [{}] }
            if (sql.startsWith('INSERT INTO web_agenda_recipient')) { links.push({ agenda_id: Number(params[0]), user_code: params[1] }); return [{}] }
            if (sql.startsWith('DELETE FROM web_agenda WHERE')) { records = records.filter(row => row.id !== Number(params[0])); links = links.filter(row => row.agenda_id !== Number(params[0])); return [{}] }
            throw Error(`Unexpected SQL: ${sql}`)
        },
        async getConnection() { return db },
        async beginTransaction() { snapshot = structuredClone({ records, links }) },
        async commit() { snapshot = null },
        async rollback() { if (snapshot) { records = snapshot.records; links = snapshot.links } },
        release() {},
    }
    return db
}
test('Private agenda is isolated, including from HRD/super; deleted/nonexistent identities denied', async () => {
    const service = createAgendaService(database())
    const created = await service.save(' P1 ', null, body({ creator: 'super' }))
    assert.equal(created.creator, 'p1')
    for (const user of ['hrd', 'super', 'p2']) {
        assert.deepEqual(await service.list(user, '2026-10-01', '2026-10-31'), [])
        await assert.rejects(service.detail(user, created.id), { statusCode: 404 })
        await assert.rejects(service.save(user, created.id, body({ version: 1 })), { statusCode: 404 })
        await assert.rejects(service.remove(user, created.id, 1), { statusCode: 404 })
    }
    await assert.rejects(service.today('deleted'), { statusCode: 401 })
    assert.equal((await service.detail('p1', created.id)).title, 'Rapat HRD')
})
test('Recipients share edits/status/deletion; only creator controls recipients, revocation enforced', async () => {
    const service = createAgendaService(database())
    const shared = body({ visibility: 'shared', recipients: ['P2', 'p1'] })
    let agenda = await service.save('hrd', null, shared)
    assert.deepEqual(agenda.recipients, ['p1', 'p2'])
    agenda = await service.save('p1', agenda.id, { ...shared, title: 'Judul dari penerima', status: 'SELESAI', version: 1 })
    assert.equal((await service.detail('p2', agenda.id)).status, 'SELESAI')
    await assert.rejects(service.save('p2', agenda.id, { ...shared, recipients: ['p1', 'p4'], version: 2 }), { statusCode: 403 })
    await assert.rejects(service.save('p2', agenda.id, body({ version: 2 })), { statusCode: 403 })
    agenda = await service.save('hrd', agenda.id, { ...shared, recipients: ['p2'], version: 2 })
    await assert.rejects(service.detail('p1', agenda.id), { statusCode: 404 })
    await assert.rejects(service.save('p1', agenda.id, { ...shared, version: 3 }), { statusCode: 404 })
    await service.remove('p2', agenda.id, 3)
    await assert.rejects(service.detail('hrd', agenda.id), { statusCode: 404 })
})
test('Conflicting saves/deletes rejected; invalid recipients roll back without losing data', async () => {
    const db = database(), service = createAgendaService(db)
    const agenda = await service.save('hrd', null, body())
    await service.save('hrd', agenda.id, body({ title: 'Terbaru', version: 1 }))
    await assert.rejects(service.save('hrd', agenda.id, body({ version: 1 })), { statusCode: 409 })
    await assert.rejects(service.remove('hrd', agenda.id, 1), { statusCode: 409 })
    await assert.rejects(service.save('hrd', agenda.id, body({ visibility: 'shared', recipients: ['missing'], version: 2 })), /sudah tidak tersedia/)
    assert.equal((await service.detail('hrd', agenda.id)).title, 'Terbaru')
    assert.ok(db.calls.some(call => call.sql.endsWith('FOR UPDATE')))
})

test('Calendar list returns each authorized agenda recipients in one bulk query', async () => {
    const db = database(), service = createAgendaService(db)
    const first = await service.save('hrd', null, body({ visibility: 'shared', recipients: ['p4', 'p1', 'p2'] }))
    const second = await service.save('hrd', null, body({ visibility: 'shared', recipients: ['p1'] }))
    const privateAgenda = await service.save('hrd', null, body())
    const hidden = await service.save('super', null, body({ visibility: 'shared', recipients: ['p4'] }))
    const listed = await service.list('hrd', '2026-10-01', '2026-10-31')
    assert.deepEqual(listed.find(row => row.id === first.id).recipients, ['p1', 'p2', 'p4'])
    assert.deepEqual(listed.find(row => row.id === second.id).recipients, ['p1'])
    assert.deepEqual(listed.find(row => row.id === privateAgenda.id).recipients, [])
    assert.ok(!listed.some(row => row.id === hidden.id))
    const bulk = db.calls.filter(call => call.sql.startsWith('SELECT agenda_id, user_code FROM'))
    assert.equal(bulk.length, 1); assert.deepEqual(bulk[0].params[0], [first.id, second.id])
})
test('Today counts all statuses and only authorized agendas; range/search return safe fields', async () => {
    const service = createAgendaService(database()), date = jakartaToday()
    for (const status of ['OPEN', 'SELESAI', 'BATAL']) await service.save('hrd', null, body({ date, status, visibility: 'shared', recipients: ['p1'] }))
    assert.equal((await service.today('p1')).count, 3)
    assert.equal((await service.today('p1')).all_day_open_count, 1)
    assert.equal((await service.today('super')).count, 0)
    assert.deepEqual(await service.users('p1', 'hrd'), [{ code: 'hrd', name: 'Nama hrd' }])
    await assert.rejects(service.list('p1', '2026-10-31', '2026-10-01'), { statusCode: 400 })
    await assert.rejects(service.list('p1', '2026-01-01', '2026-12-31'), { statusCode: 400 })
})

test('Login reminder counts only ongoing OPEN and all-day OPEN, independent of acknowledgements; indicator total stays unchanged', async () => {
    const db = database(), date = '2026-10-20'
    const service = createAgendaService(db, { now: () => new Date('2026-10-20T02:30:00Z') })
    const seed = extra => db.seed({ title: 'Agenda', agenda_date: date, creator: 'hrd', visibility: 'private', status: 'OPEN', start_time: '09:00:00', end_time: '10:00:00', ...extra })
    seed({}); seed({ start_time: '10:00:00', end_time: '11:00:00' }); seed({ start_time: '07:00:00', end_time: '08:00:00' })
    seed({ status: 'SELESAI' }); seed({ status: 'BATAL' })
    seed({ start_time: null, end_time: null }); seed({ status: 'SELESAI', start_time: null, end_time: null }); seed({ status: 'BATAL', start_time: null, end_time: null })
    seed({ end_time: null }); seed({ start_time: null }); seed({ start_time: '10:00:00', end_time: '09:00:00' })
    seed({ creator: 'p4' })
    await service.save('hrd', null, body({ date, start_time: '09:00', end_time: '10:00', visibility: 'shared', recipients: ['p1'] }))
    await service.save('p1', null, body({ date }))
    assert.deepEqual(await service.today('hrd'), { date, count: 12, ongoing_count: 2, all_day_open_count: 1 })
    assert.deepEqual(await service.today('p1'), { date, count: 2, ongoing_count: 1, all_day_open_count: 1 })
    const query = db.calls.find(call => call.sql.includes('ongoing_count'))
    assert.match(query.sql, /a\.status = 'OPEN'/)
    assert.match(query.sql, /a\.end_time > a\.start_time AND a\.start_time <= \? AND a\.end_time >= \?/)
    assert.match(query.sql, /a\.start_time IS NULL AND a\.end_time IS NULL/)
    assert.doesNotMatch(query.sql, /web_agenda_start_notice|NOT EXISTS/)
    assert.deepEqual(query.params, ['09:30:00', '09:30:00', date, 'hrd', 'hrd'])
})

test('Ongoing reminder uses inclusive start/end in WIB and excludes the agenda after end', async () => {
    const db = database(), date = '2026-10-20'
    db.seed({ agenda_date: date, creator: 'hrd', visibility: 'private', status: 'OPEN', start_time: '09:00:00', end_time: '10:00:00' })
    for (const [time, count] of [['08:59:59', 0], ['09:00:00', 1], ['10:00:00', 1], ['10:00:01', 0]]) {
        const service = createAgendaService(db, { now: () => new Date(`${date}T${time}+07:00`) })
        assert.equal((await service.today('hrd')).ongoing_count, count, time)
    }
})
test('Validation handles leap days, times, safe titles, recipients and Jakarta midnight', () => {
    assert.equal(validAgendaDate('2024-02-29'), true)
    assert.equal(validAgendaDate('2026-02-29'), false)
    assert.equal(jakartaToday(new Date('2026-10-15T17:00:00Z')), '2026-10-16')
    assert.equal(jakartaToday(new Date('2026-10-15T16:59:59Z')), '2026-10-15')
    assert.equal(validateAgenda(body({ title: '<script>teks</script>' })).title, '<script>teks</script>')
    for (const extra of [{ title: '' }, { date: '2026-02-30' }, { start_time: '09:00' }, { start_time: '10:00', end_time: '09:00' }, { start_time: '24:00', end_time: '25:00' }, { visibility: 'shared' }, { recipients: ['p1'] }, { status: 'INVALID' }]) assert.throws(() => validateAgenda(body(extra)))
    assert.equal(validateAgenda(body({ start_time: '09:00', end_time: '10:00' })).end_time, '10:00')
})

test('Editor comes from authenticated actor, creator stays fixed, conflicts/failures preserve audit', async () => {
    const service = createAgendaService(database())
    const shared = body({ visibility: 'shared', recipients: ['p1', 'p2'] })
    let agenda = await service.save('hrd', null, { ...shared, creator: 'fake', updated_by: 'fake' })
    assert.equal(agenda.creator, 'hrd'); assert.equal(agenda.updated_by, null)
    assert.equal((await service.detail('hrd', agenda.id)).updated_by, null)
    agenda = await service.save('p1', agenda.id, { ...shared, version: 1, updated_by: 'fake' })
    assert.equal(agenda.updated_by, 'p1'); assert.equal(agenda.creator, 'hrd')
    assert.equal(agenda.updated_at, new Date((1792130400 + 60) * 1000).toISOString())
    assert.equal((await service.list('p2', '2026-10-01', '2026-10-31'))[0].updated_by, 'p1')
    await assert.rejects(service.save('p2', agenda.id, { ...shared, version: 1 }), { statusCode: 409 })
    await assert.rejects(service.save('p2', agenda.id, { ...shared, version: 2, recipients: ['p4'] }), { statusCode: 403 })
    assert.equal((await service.detail('hrd', agenda.id)).updated_by, 'p1')
    assert.equal((await service.detail('hrd', agenda.id)).updated_at, agenda.updated_at)
    agenda = await service.save('hrd', agenda.id, { ...shared, version: 2 })
    assert.equal(agenda.updated_by, 'hrd'); assert.equal(agenda.creator, 'hrd')
})
test('Agenda endpoints are behind login, independent of legacy module privileges, and migration is manual', () => {
    const routes = readFileSync(new URL('../src/routes.js', import.meta.url), 'utf8')
    assert.ok(routes.indexOf('r.use(verifyToken)') < routes.indexOf("r.use('/agenda'"))
    const agendaRoutes = readFileSync(new URL('../src/routes/agendaRoutes.js', import.meta.url), 'utf8')
    assert.doesNotMatch(agendaRoutes, /wajibHak|CREATE TABLE|ALTER TABLE/)
    const migration = readFileSync(new URL('../migrations/20261016_kalender_agenda.sql', import.meta.url), 'utf8')
    assert.equal((migration.match(/CREATE TABLE/g) || []).length, 2)
    assert.match(migration, /ON DELETE CASCADE/)
    assert.doesNotMatch(migration, /ALTER TABLE|INSERT INTO|UPDATE tuser/)
})
