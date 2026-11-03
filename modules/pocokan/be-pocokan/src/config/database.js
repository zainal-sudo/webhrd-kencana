const mysql = require("mysql2/promise");

/* Pool database bisnis Pocokan (tidak pernah menunjuk HRIS).
 *
 * Dua mode jalan:
 *  1) Standalone (node src/index.js)  → memakai .env Pocokan sendiri
 *     (DB_HOST/DB_USER/... seperti sebelum integrasi).
 *  2) Di-mount sebagai subapp dari backend HRIS (webhrd-kencana/backend) →
 *     variabel dari .env HRIS yang ber-prefiks POCOKAN_ yang dipakai, supaya
 *     tidak bentrok dengan koneksi hrd2 milik HRIS (yang memakai DB_PASS).
 *
 * Pool dibuat lazy: koneksinya baru terbuka saat request pertama kali memakai
 * db, bukan saat module di-import. Kemudian penting karena modul ini di-import
 * oleh HRIS antes HRIS pernah menyetel variabelnya (urutan import), dan juga
 * membuat modul test tidak membuka koneksi tanpa perlu.
 */

const env = (key, fallback) => process.env[key] ?? fallback;

// Persamaan: POCOKAN_* menang, bila tidak ada → nama variabel lama (standalone).
const host = env("POCOKAN_DB_HOST", env("DB_HOST", "localhost"));
const port = env("POCOKAN_DB_PORT", env("DB_PORT", 3306));
const user = env("POCOKAN_DB_USER", env("DB_USER"));
const dbPassword = env("POCOKAN_DB_PASSWORD", env("DB_PASSWORD"));
const dbName = env("POCOKAN_DB_NAME", env("DB_NAME"));

let pool = null;

function getPool() {
  if (pool) return pool;
  pool = mysql.createPool({
    host,
    port,
    user,
    password: dbPassword,
    database: dbName,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    timezone: "+07:00",
    // Kurangi "read ECONNRESET" saat koneksi idle lama: jaga TCP tetap hidup.
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
  });

  // Test koneksi saat pool pertama dipakai
  pool
    .getConnection()
    .then((conn) => {
      console.log("✅ Database connected:", dbName);
      conn.release();
    })
    .catch((err) => {
      console.error("❌ Database connection failed:", err.message);
    });
  return pool;
}

/* query() dipakai langsung oleh banyak service (db.query(...)). */
const poolProxy = new Proxy(
  {},
  {
    get(target, prop) {
      if (prop === "then") return undefined; // guard: jangan dianggap Promise (bila di-await tanpa query)
      const p = getPool();
      const value = p[prop];
      return typeof value === "function" ? value.bind(p) : value;
    },
  },
);

module.exports = poolProxy;
