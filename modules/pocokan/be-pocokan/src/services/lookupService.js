const db = require("../config/database");

/**
 * lookupService
 * Kumpulan query lookup generik yang dipakai di berbagai form.
 * Tambah fungsi di sini sesuai kebutuhan modul Finance.
 */

const getSupplier = async (search = "") => {
  const [rows] = await db.query(
    `SELECT sup_kode AS kode, sup_nama AS nama, sup_alamat AS alamat, sup_kota AS kota
     FROM tsupplier
     WHERE sup_aktif = 'Y' AND (sup_kode LIKE ? OR sup_nama LIKE ?)
     ORDER BY sup_nama LIMIT 50`,
    [`%${search}%`, `%${search}%`]
  );
  return rows;
};

const getUser = async (search = "") => {
  const [rows] = await db.query(
    `SELECT usr_kode AS kode, usr_nama AS nama, usr_level AS level
     FROM tuser
     WHERE usr_aktif = 'Y' AND (usr_kode LIKE ? OR usr_nama LIKE ?)
     ORDER BY usr_nama LIMIT 50`,
    [`%${search}%`, `%${search}%`]
  );
  return rows;
};

const getBagian = async () => {
  const [rows] = await db.query(
    `SELECT bag_kode AS kode, bag_nama AS nama FROM tbagian ORDER BY bag_kode`
  );
  return rows;
};

const getPabrik = async () => {
  const [rows] = await db.query(
    `SELECT pab_kode AS kode, pab_nama AS nama FROM tpabrik ORDER BY pab_kode`
  );
  return rows;
};

module.exports = { getSupplier, getUser, getBagian, getPabrik };
