import mysql from 'mysql2/promise'
import dotenv from 'dotenv'

dotenv.config()

/**
 * Connection pool MySQL ke database `hrd2` (schema asli program Delphi HRD).
 * Aplikasi web TIDAK membuat/mengubah tabel — seluruh struktur mengikuti
 * database yang dipakai program Delphi.
 */
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'hrd2',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    connectTimeout: 15000,
    charset: 'latin1',
    dateStrings: true,
    multipleStatements: false,
})

pool.getConnection()
    .then((conn) => {
        console.log(`✅ Database connected: ${process.env.DB_NAME} @ ${process.env.DB_HOST}`)
        conn.release()
    })
    .catch((err) => {
        console.error('❌ Database connection failed:', err.message)
    })

export default pool