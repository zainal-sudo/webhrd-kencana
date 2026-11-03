const db = require("../../config/database");

const isConnectionError = (e) =>
  /ECONNRESET|ECONNREFUSED|ETIMEDOUT|PROTOCOL_CONNECTION_LOST|ENOTFOUND|EAI_AGAIN/i.test(
    `${e?.code ?? ""} ${e?.message ?? ""}`,
  );

const getAll = async () => {
  try {
    const [rows] = await db.query(`SELECT pab_kode AS kode, pab_nama AS nama FROM tpabrik ORDER BY pab_kode`);
    return rows;
  } catch (e) {
    if (!isConnectionError(e)) throw e;
    await new Promise((r) => setTimeout(r, 300));
    const [rows] = await db.query(`SELECT pab_kode AS kode, pab_nama AS nama FROM tpabrik ORDER BY pab_kode`);
    return rows;
  }
};

const saveData = async (payload) => {
  const { isEdit, kode, nama } = payload;
  if (isEdit) {
    await db.query(`UPDATE tpabrik SET pab_nama = ? WHERE pab_kode = ?`, [nama, kode]);
  } else {
    await db.query(`INSERT INTO tpabrik (pab_kode, pab_nama) VALUES (?, ?)`, [kode, nama]);
  }
  return { kode };
};

const deleteData = async (kode) => {
  await db.query(`DELETE FROM tpabrik WHERE pab_kode = ?`, [kode]);
};

module.exports = { getAll, saveData, deleteData };
