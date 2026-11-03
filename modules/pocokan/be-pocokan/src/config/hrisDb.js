const mysql = require("mysql2/promise");

/* Pool ke database HRIS (hrd2) — KHUSUS pemeriksaan hak akses login/permission.
 *
 * Tidak pernah dipakai untuk bisnis Pocokan (data bisnis tetap di database
 * `pocokan`, lihat database.js). Hak akses dibaca dari mekanisme HRIS yang
 * sesungguhnya: tmenu + thakuser, dengan pegangan men_nama ber-prefiks
 * `pocokanM` — mis. menuId "9" (Absensi Pocokan) diotorisasi sebagai
 * tmenu.men_nama = "pocokanM9" pada database HRIS, sehingga bisa diatur dari
 * halaman Hak Akses HRIS seperti moda lainnya.
 *
 * Mode:
 *  - Di-mount dari HRIS → memakai langsung variabel koneksi HRIS
 *    (DB_HOST/DB_USER/DB_PASS/DB_NAME) yang sudah dimuat di process.env.
 *  - Standalone (dev) → ada opsi override POCOKAN_HRIS_* bila kredensial hris
 *    tidak mau di-squat di .env pocokan.
 */

const env = (key, fallback) => process.env[key] ?? fallback;

const host = env("POCOKAN_HRIS_DB_HOST", env("DB_HOST", "localhost"));
const port = env("POCOKAN_HRIS_DB_PORT", env("DB_PORT", 3306));
const user = env("POCOKAN_HRIS_DB_USER", env("DB_USER"));
const dbPassword = env("POCOKAN_HRIS_DB_PASS", env("DB_PASS"));
const dbName = env("POCOKAN_HRIS_DB_NAME", env("DB_NAME", "hrd2"));

if (!dbName) {
  // Tanpa nama database HRIS, pemeriksaan permission tidak bisa berjalan —
  // dicatat secara eksplisit supaya operator mengetahui penyebabnya.
  console.error(
    "❌ POCOKAN hrisDb: database HRIS (hrd2) tidak dapat dikenali. Set variabel POCOKAN_HRIS_DB_NAME (atau var koneksi HRIS).",
  );
}

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
    connectionLimit: 5,
    queueLimit: 0,
    timezone: "+07:00",
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
  });
  return pool;
}

const poolProxy = new Proxy(
  {},
  {
    get(target, prop) {
      if (prop === "then") return undefined; // jangan dianggap Promise
      const p = getPool();
      const value = p[prop];
      return typeof value === "function" ? value.bind(p) : value;
    },
  },
);

module.exports = {
  /** Pool proxy ke database HRIS: hrisDb.db.query(...) dsb. */
  db: poolProxy,
};
