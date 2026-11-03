const db = require("../../config/database");

const getAll = async (tahun) => {
  const t = tahun || new Date().getFullYear();
  const [rows] = await db.query(
    `SELECT DATE_FORMAT(hl_tanggal, '%Y-%m-%d') AS tanggal, hl_keterangan AS keterangan 
     FROM tharilibur 
     WHERE YEAR(hl_tanggal) = ? 
     ORDER BY hl_tanggal`,
    [t]
  );
  return rows;
};

const saveData = async (payload) => {
  const { isEdit, tanggal, keterangan, oldTanggal } = payload;
  if (isEdit) {
    await db.query(
      `UPDATE tharilibur SET hl_tanggal = ?, hl_keterangan = ? WHERE hl_tanggal = ?`,
      [tanggal, keterangan, oldTanggal || tanggal]
    );
  } else {
    await db.query(
      `INSERT INTO tharilibur (hl_tanggal, hl_keterangan) VALUES (?, ?)`,
      [tanggal, keterangan]
    );
  }
  return { tanggal };
};

const deleteData = async (tanggal) => {
  await db.query(`DELETE FROM tharilibur WHERE hl_tanggal = ?`, [tanggal]);
};

const insertSundays = async (payload) => {
  const { tahun } = payload;
  const t = parseInt(tahun, 10) || new Date().getFullYear();

  // Generate all Sundays in the year t
  let insertedCount = 0;
  let d = new Date(t, 0, 1);
  // Find first Sunday
  while (d.getDay() !== 0) {
    d.setDate(d.getDate() + 1);
  }

  while (d.getFullYear() === t) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    const ket = "Hari Minggu";

    // Check if exists, if not insert (Ignore duplicates)
    const [existing] = await db.query(`SELECT hl_tanggal FROM tharilibur WHERE hl_tanggal = ?`, [dateStr]);
    if (existing.length === 0) {
      await db.query(`INSERT INTO tharilibur (hl_tanggal, hl_keterangan) VALUES (?, ?)`, [dateStr, ket]);
      insertedCount++;
    }

    d.setDate(d.getDate() + 7);
  }

  return { insertedCount };
};

module.exports = { getAll, saveData, deleteData, insertSundays };
