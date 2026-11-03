import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import routes from './src/routes.js'
import { errorHandler } from './src/middleware/errorHandler.js'
import pocokanApp from '../modules/pocokan/be-pocokan/src/index.js'

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 4003

app.use(
    cors({
        origin: (process.env.CORS_ORIGIN || 'http://localhost:8093').split(','),
        credentials: true,
    })
)
app.use(express.json({ limit: '100mb' }))
app.use(express.urlencoded({ extended: true, limit: '100mb' }))

// Berkas statis: template laporan & upload
app.use('/public', express.static(path.join(__dirname, 'public')))

app.use('/api', routes)

/* ── Modul Pocokan (Koperasi) ────────────────────────────────────────────
 * Satu origin & port eksternal dengan HRIS:
 *   /pocokan-api/...  → API pocokan (subapp; mount internal pocokan sudah
 *                       tanpa prefiks /api, mis. /pocokan-api/auth/me)
 *   /pocokan/...         → dist FE pocokan (dibangun dgn base '/pocokan/')
 * DB bisnis pocokan tetap terputus sendiri (POCOKAN_* di .env). */
app.use('/pocokan-api', pocokanApp)

const pocokanFeDist = path.join(__dirname, '..', 'modules', 'pocokan', 'fe-pocokan', 'dist')
if (fs.existsSync(path.join(pocokanFeDist, 'index.html'))) {
    app.use('/pocokan', express.static(pocokanFeDist))
    // SPA fallback: direct navigation/refresh pada route FE pocokan (history mode)
    app.get(/^\/pocokan(\/.*)?$/, (_req, res) => res.sendFile(path.join(pocokanFeDist, 'index.html')))
}

// 404
app.use((req, res) => {
    res.status(404).json({ success: false, message: `Endpoint ${req.method} ${req.originalUrl} tidak ditemukan` })
})

app.use(errorHandler)

app.listen(PORT, () => {
    console.log(`🚀 Web HRD Kencana API  ->  http://localhost:${PORT}/api`)
})
