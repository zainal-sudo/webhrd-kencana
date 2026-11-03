const db = require("../../config/database");

// ── Daftar cabang (tcabang) ─────────────────────────────────────────────
const getCabangList = async () => {
  const [rows] = await db.query(
    `SELECT CONCAT(cbg_kode, ' - ', cbg_nama) AS cabang
     FROM tcabang
     ORDER BY cbg_kode`,
  );
  return rows.map((r) => r.cabang);
};

// ── Daftar semua menu (tmenu) ───────────────────────────────────────────
// db_pocokan: MEN_ID, MEN_NAMA, MEN_KETERANGAN (grup: Setting/Library/Reports)
const getAllMenus = async () => {
  const [rows] = await db.query(
    `SELECT
       MEN_ID         AS id,
       MEN_KETERANGAN AS grp,
       MEN_NAMA       AS nama
     FROM tmenu
     ORDER BY MEN_ID`,
  );
  return rows;
};

// ── Detail user + hak akses (thakuser) ──────────────────────────────────
// Hak "view" = keberadaan record di thakuser (tidak ada kolom hak_men_view)
const getDetail = async (kode) => {
  const [[user]] = await db.query(
    `SELECT
       USER_KODE     AS kode,
       USER_NAMA     AS nama,
       USER_PASSWORD AS password,
       USER_EDIT     AS editReport
     FROM tuser
     WHERE USER_KODE = ?`,
    [kode],
  );
  if (!user) return null;

  const [menus] = await db.query(
    `SELECT
       HAK_MEN_ID                 AS menu_id,
       IFNULL(hak_men_insert, 'N') AS insert_,
       IFNULL(hak_men_edit,   'N') AS edit_,
       IFNULL(hak_men_delete, 'N') AS delete_
     FROM thakuser
     WHERE HAK_USER_KODE = ?`,
    [kode],
  );

  return { ...user, menus };
};

// ── Simpan user + hak akses ─────────────────────────────────────────────
// Hanya menu dengan view_ = 'Y' yang disimpan ke thakuser (view = akses menu).
const save = async (data, isEdit) => {
  const { kode, nama, password, editReport, menus } = data;

  if (!kode || !kode.trim()) throw new Error("Kode user wajib diisi.");
  if (!nama || !nama.trim()) throw new Error("Nama user wajib diisi.");

  if (isEdit) {
    await db.query(
      `UPDATE tuser SET
         USER_NAMA     = ?,
         USER_PASSWORD = ?,
         USER_EDIT     = ?,
         DATE_MODIFY   = NOW()
       WHERE USER_KODE = ?`,
      [nama, password ?? "", editReport ? 1 : 0, kode],
    );
  } else {
    const [[existing]] = await db.query(
      `SELECT USER_KODE FROM tuser WHERE USER_KODE = ?`,
      [kode],
    );
    if (existing) throw new Error("Kode user sudah digunakan.");

    await db.query(
      `INSERT INTO tuser (USER_KODE, USER_NAMA, USER_PASSWORD, USER_EDIT, DATE_CREATE)
       VALUES (?, ?, ?, ?, NOW())`,
      [kode, nama, password ?? "", editReport ? 1 : 0],
    );
  }

  // Hapus semua hak lama, lalu insert ulang menu yang diberi akses (view = 'Y')
  await db.query(`DELETE FROM thakuser WHERE HAK_USER_KODE = ?`, [kode]);

  const granted = (menus || []).filter((m) => m.view_ === "Y");
  if (granted.length > 0) {
    const values = granted.map((m) => [
      kode,
      m.menu_id,
      m.insert_ === "Y" ? "Y" : "N",
      m.edit_ === "Y" ? "Y" : "N",
      m.delete_ === "Y" ? "Y" : "N",
    ]);
    await db.query(
      `INSERT INTO thakuser
         (HAK_USER_KODE, HAK_MEN_ID, hak_men_insert, hak_men_edit, hak_men_delete)
       VALUES ?`,
      [values],
    );
  }

  return { kode };
};

module.exports = { getCabangList, getAllMenus, getDetail, save };