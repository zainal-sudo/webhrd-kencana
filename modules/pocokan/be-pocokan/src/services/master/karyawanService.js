const db = require("../../config/database");

const generateMaxKode = async () => {
  const [[row]] = await db.query(`SELECT MAX(CAST(kar_kode AS UNSIGNED)) AS max_kode FROM tkaryawan`);
  const maxVal = row?.max_kode;
  let nextNum = 1000;
  if (maxVal && !isNaN(Number(maxVal))) {
    const n = parseInt(maxVal, 10);
    if (n >= 1000) nextNum = n + 1;
  }
  return String(nextNum);
};

const getAll = async () => {
  const [rows] = await db.query(
    `SELECT 
       kar_kode     AS kode, 
       kar_nama     AS nama, 
       kar_bag_kode AS bagian, 
       kar_pab_kode AS pabrik, 
       DATE_FORMAT(kar_tglmasuk, '%Y-%m-%d') AS tglmasuk, 
       kar_gapok    AS gapok, 
       kar_rekening AS rekening, 
       IF(kar_isaktif = 1, 'Aktif', 'Nonaktif') AS isaktif 
     FROM tkaryawan 
     ORDER BY kar_kode`
  );
  return rows;
};

const getById = async (kode) => {
  const [[row]] = await db.query(
    `SELECT 
       kar_kode     AS kode, 
       kar_nama     AS nama, 
       kar_bag_kode AS bagian, 
       kar_pab_kode AS pabrik, 
       DATE_FORMAT(kar_tglmasuk, '%Y-%m-%d') AS tglmasuk, 
       kar_gapok    AS gapok, 
       kar_lembur   AS lembur, 
       kar_lembur2  AS lembur2, 
       kar_isaktif  AS isaktif, 
       kar_rekening AS rekening 
     FROM tkaryawan 
     WHERE kar_kode = ?`,
    [kode]
  );
  if (!row) throw new Error("Karyawan tidak ditemukan.");
  return row;
};

const saveData = async (payload) => {
  const { 
    isEdit, kode, nama, bagian, pabrik, tglmasuk, gapok, lembur, lembur2, isaktif, rekening 
  } = payload;

  if (!nama || !nama.trim()) throw new Error("Nama karyawan wajib diisi.");

  let karKode = kode ? kode.trim() : "";

  if (isEdit) {
    await db.query(
      `UPDATE tkaryawan SET 
         kar_nama = ?, 
         kar_bag_kode = ?, 
         kar_pab_kode = ?, 
         kar_tglmasuk = ?, 
         kar_gapok = ?, 
         kar_lembur = ?, 
         kar_lembur2 = ?, 
         kar_isaktif = ?, 
         kar_rekening = ? 
       WHERE kar_kode = ?`,
      [
        nama, 
        bagian || "", 
        pabrik || "", 
        tglmasuk || null, 
        gapok || 0, 
        lembur || 0, 
        lembur2 || 0, 
        isaktif ? 1 : 0, 
        rekening || "", 
        karKode
      ]
    );
  } else {
    if (!karKode) {
      karKode = await generateMaxKode();
    } else {
      const [[exists]] = await db.query(
        `SELECT kar_kode FROM tkaryawan WHERE kar_kode = ?`,
        [karKode]
      );
      if (exists) {
        throw new Error(`Kode karyawan "${karKode}" sudah digunakan.`);
      }
    }

    await db.query(
      `INSERT INTO tkaryawan 
         (kar_kode, kar_nama, kar_bag_kode, kar_pab_kode, kar_tglmasuk, kar_gapok, kar_lembur, kar_lembur2, kar_isaktif, kar_rekening) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        karKode, 
        nama, 
        bagian || "", 
        pabrik || "", 
        tglmasuk || null, 
        gapok || 0, 
        lembur || 0, 
        lembur2 || 0, 
        isaktif ? 1 : 0, 
        rekening || ""
      ]
    );
  }
  return { kode: karKode };
};

const deleteData = async (kode) => {
  await db.query(`DELETE FROM tkaryawan WHERE kar_kode = ?`, [kode]);
};

module.exports = { getAll, getById, saveData, deleteData };
