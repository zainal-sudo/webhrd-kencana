import { Router } from 'express'
import mysql from 'mysql2/promise'
import dotenv from 'dotenv'
import { createAgendaService } from '../services/agendaService.js'
import { success, error } from '../helpers/response.js'

dotenv.config()
// Dedicated Unicode connections; leave the legacy Delphi pool/charset unchanged.
const pool = mysql.createPool({ host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root', password: process.env.DB_PASS || '', database: process.env.DB_NAME || 'hrd2',
    charset: 'utf8mb4', dateStrings: true, connectionLimit: 3, waitForConnections: true, connectTimeout: 15000 })
const service = createAgendaService(pool)
const r = Router()
const handle = action => async (req, res, next) => {
    try { await action(req, res) }
    catch (err) {
        if (err.code === 'ER_NO_SUCH_TABLE') return error(res, 'Kalender Agenda belum tersedia. Administrator perlu menjalankan migrasi 20261016_kalender_agenda.sql.', 503)
        if (err.code === 'ER_BAD_FIELD_ERROR' && err.message?.includes('updated_by')) return error(res, 'Pencatatan editor agenda belum tersedia. Administrator perlu menjalankan migrasi 20261016_agenda_updated_by.sql.', 503)
        next(err)
    }
}
r.get('/today', handle(async (req, res) => success(res, await service.today(req.user.user))))
r.get('/users', handle(async (req, res) => success(res, await service.users(req.user.user, req.query.search))))
r.get('/', handle(async (req, res) => success(res, await service.list(req.user.user, req.query.start, req.query.end))))
r.get('/:id', handle(async (req, res) => success(res, await service.detail(req.user.user, req.params.id))))
r.post('/', handle(async (req, res) => success(res, await service.save(req.user.user, null, req.body || {}), 'Agenda ditambahkan.', 201)))
r.put('/:id', handle(async (req, res) => success(res, await service.save(req.user.user, req.params.id, req.body || {}), 'Agenda diperbarui.')))
r.delete('/:id', handle(async (req, res) => { await service.remove(req.user.user, req.params.id, req.body?.version); success(res, null, 'Agenda dihapus untuk semua pihak.') }))
export default r
