const db = require("../../config/database");

// ── Browse user (db_pocokan: tuser + thakuser) ─────────────────────────
const getBrowse = async () => {
  const [rows] = await db.query(
    `SELECT
       u.USER_KODE                         AS Kode,
       u.USER_NAMA                         AS Nama,
       IF(u.USER_EDIT = 1, 'YA', 'TIDAK')  AS Edit,
       COUNT(t.HAK_MEN_ID)                 AS JumlahMenu
     FROM tuser u
     LEFT JOIN thakuser t ON t.HAK_USER_KODE = u.USER_KODE
     GROUP BY u.USER_KODE, u.USER_NAMA, u.USER_EDIT
     ORDER BY u.USER_NAMA`,
  );
  return rows;
};

const deleteUser = async (kode) => {
  await db.query(`DELETE FROM thakuser WHERE HAK_USER_KODE = ?`, [kode]);
  const [result] = await db.query(`DELETE FROM tuser WHERE USER_KODE = ?`, [
    kode,
  ]);
  if (result.affectedRows === 0) throw new Error("User tidak ditemukan.");
  return { kode };
};

module.exports = { getBrowse, deleteUser };