/**
 * seed-menu-pocokan.mjs — generator SQL entri menu Pocokan di database HRIS.
 *
 * BACALAH: database production TIDAK diubah oleh perintah ini secara default.
 *   node modules/pocokan/seed-menu-pocokan.mjs             → tulis modul sql file (aman)
 *   node modules/pocokan/seed-menu-pocokan.mjs --apply     → eksekusi ke DB (WAJIB persetujuan)
 *
 * Yang dilakukan (berdasarkan audit):
 *  - Baca seluruh baris tmenu di DB `pocokan` (MEN_ID, MEN_NAMA, MEN_KETERANGAN).
 *  - Buat baris yang cocok di DB HRIS (`hrd2`.tmenu) dengan men_nama global
 *    `pocokanM` + <MEN_ID pocokan> (preiks MEN_PREFIX di authMiddleware.js),
 *    di atas men_id baru yang tidak ada (MAX(men_id)+1 ...).
 *  - Siapkan grant baris thakuser (view/insert/edit/delete) untuk user kode HRD,
 *    SUPER, ADMIN — dinonaktifkan bila tidak ada baris user nama-nama tsb.
 *
 * Tanpa nilai rahasia yang dibaca dari git — hanya berupa variabel .env;
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
/* mysql2 di-import dinamis: bila file node_modules tidak berada di jalur
 * parent script (kasus: backend HRIS satu-satunya tempat bergantung modul),
 * coba jalur utama backend/node_modules. */
async function pilihMysql() {
  try {
    return await import("mysql2/promise");
  } catch {
    const local = path.resolve(here, "..", "..", "backend", "node_modules", "mysql2", "promise.js");
    return await import(`file://${local.replace(/\\/g, "/").replace(/^\/+/, "")}`);
  }
}
const mysql = await pilihMysql();
const apply = process.argv.includes("--apply");

/* .env file: koneksi dari POCOKAN_HRIS_* dulu, lalu .env pocokan (standalone),
 * lalu .env backend HRIS (mode ter-mount). Nilai rahasia tidak masuk git
 * (semua .env dikecualikan via .gitignore). */
function bacaEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i === -1) continue;
    let v = line.slice(i + 1).trim();
    // Buka kutip tunggal/ganda yang membubukkan seluruh nilai (seperti dotenv).
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[line.slice(0, i).trim()] = v;
  }
  return out;
}
const envFile = {
  ...bacaEnv(path.join(here, "be-pocokan", ".env")),
  ...bacaEnv(path.join(here, "..", "..", "backend", ".env")),
};
const env = (key, fallback) => process.env[key] ?? envFile[key] ?? fallback;

const HOST = env("POCOKAN_HRIS_DB_HOST", env("DB_HOST"));
const PORT = env("POCOKAN_HRIS_DB_PORT", env("DB_PORT", 3306));
const USER = env("POCOKAN_HRIS_DB_USER", env("DB_USER"));
const PASS = env("POCOKAN_HRIS_DB_PASS", env("DB_PASS", env("DB_PASSWORD", "")));
const HRIS_DB = env("POCOKAN_HRIS_DB_NAME", "hrd2");
const POCOKAN_DB = env("POCOKAN_DB_NAME", env("DB_NAME", "pocokan"));
const GRANT_TO = ["HRD", "SUPER", "ADMIN"];

if (!HOST || !USER) {
  console.error("❌ Koneksi HRIS tidak dapat dikenali dari variabel DB_*/POCOKAN_HRIS_*.");
  process.exit(1);
}
console.log(`→ host ok, user=${USER}, panjang password=${String(PASS).length}, db=${HRIS_DB}/${POCOKAN_DB}`);

const prefix = "pocokanM";
const sqlOut = [];
const q = (v) => String(v ?? "").replace(/'/g, "''");

const conn = await mysql.createConnection({
  host: HOST,
  port: PORT,
  user: USER,
  password: PASS,
});

const [pocokanMenus] = await conn.query(
  `SELECT MEN_ID, MEN_NAMA, MEN_KETERANGAN FROM \`${POCOKAN_DB}\`.tmenu ORDER BY MEN_ID`,
);
if (pocokanMenus.length === 0) {
  console.error(`❌ Database \`${POCOKAN_DB}\`.tmenu kosong — tidak ada yang di-seed.`);
  process.exit(1);
}

const [hrisExisting] = await conn.query(
  `SELECT men_id, men_nama FROM \`${HRIS_DB}\`.tmenu WHERE men_nama LIKE ? ORDER BY men_id`,
  [`${prefix}%`],
);
const sudah = new Set(hrisExisting.map((m) => m.men_nama));
let nextIdRow;
[nextIdRow] = await conn.query(
  `SELECT COALESCE(MAX(men_id), 0) + 1 AS nmn FROM \`${HRIS_DB}\`.tmenu`,
);
let nextId = nextIdRow[0].nmn;

/* Baris menu baru */
const baru = pocokanMenus.filter((m) => !sudah.has(`${prefix}${m.MEN_ID}`));
console.log(`→ modul pocokan di tmenu pocokan: ${pocokanMenus.length}; sudah ada di HRIS: ${pocokanMenus.length - baru.length}; baru: ${baru.length}`);
for (const m of baru) {
  const nama = `${prefix}${m.MEN_ID}`;
  const ket = q(m.MEN_KETERANGAN || m.MEN_NAMA || nama).trim();
  sqlOut.push(
    `INSERT INTO \`${HRIS_DB}\`.tmenu (men_id, men_nama, men_keterangan, men_modul) VALUES (${nextId}, '${nama}', '${ket}', 7);`,
  );
  nextId++;
}

/* Grant thakuser (keberadaan baris = view; kolom Y = insert/edit/delete) */
for (const kodeUser of GRANT_TO) {
  for (const m of baru) {
    const nama = `${prefix}${m.MEN_ID}`;
    sqlOut.push(
      `INSERT INTO \`${HRIS_DB}\`.thakuser (hak_user_kode, hak_men_id, hak_men_insert, hak_men_edit, hak_men_delete) ` +
        `SELECT '${q(kodeUser)}', t.men_id, 'Y', 'Y', 'Y' FROM \`${HRIS_DB}\`.tmenu t WHERE t.men_nama = '${nama}' ` +
        `AND EXISTS (SELECT 1 FROM \`${HRIS_DB}\`.tuser u WHERE UPPER(u.user_kode) = UPPER('${q(kodeUser)}')) ` +
        `AND NOT EXISTS (SELECT 1 FROM \`${HRIS_DB}\`.thakuser h WHERE h.hak_user_kode = '${q(kodeUser)}' AND h.hak_men_id = t.men_id);`,
    );
  }
}

await conn.end();

const target = path.join(here, "seed-tmenu-pocokan.sql");
const header = `-- seed tmenu/thakuser Pocokan di database HRIS (${HRIS_DB})\n` +
  `-- dibuat otomatis: node modules/pocokan/seed-menu-pocokan.mjs\n` +
  `-- TINJAU dulu sebelum dijalankan, lalu jalankan manual via mysql client.\n`;
fs.writeFileSync(target, header + sqlOut.join("\n") + "\n");
console.log(`→ SQL tersimpan di ${path.relative(process.cwd(), target)} (${sqlOut.length} pernyataan).`);
if (apply) {
  console.error("\n⛔ --apply tidak dijalankan otomatis oleh asisten: jalankan manual via mysql client setelah ditinjau. (Database production tidak diubah tanpa persetujuan.)");
} else {
  console.log("→ Database TIDAK diubah. Jalankan file SQL manual setelah ditinjau.");
}
