import pool from "./src/config/database.js"
const q = (s, p) => pool.query(s, p).then(r => r[0])
const cols = await q("SHOW COLUMNS FROM tgajibulanan")
console.log(cols.map(c => c.Field).join(","))
