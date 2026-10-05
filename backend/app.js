import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import routes from './src/routes.js'
import { errorHandler } from './src/middleware/errorHandler.js'

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
app.use(express.json({ limit: '5mb' }))
app.use(express.urlencoded({ extended: true, limit: '5mb' }))

// Berkas statis: template laporan & upload
app.use('/public', express.static(path.join(__dirname, 'public')))

app.use('/api', routes)

// 404
app.use((req, res) => {
    res.status(404).json({ success: false, message: `Endpoint ${req.method} ${req.originalUrl} tidak ditemukan` })
})

app.use(errorHandler)

app.listen(PORT, () => {
    console.log(`🚀 Web HRD Kencana API  ->  http://localhost:${PORT}/api`)
})
