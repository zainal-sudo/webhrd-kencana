const db = require("../config/database");
const jwt = require("jsonwebtoken");
const { menuPocokanUntukUser } = require("../middleware/authMiddleware");

/**
 * Login user
 * Sesuaikan nama tabel & kolom dengan DB Finance Anda.
 * Contoh menggunakan tabel tuser yang sama seperti garmen.
 */
const login = async (username, password) => {
  const [rows] = await db.query(
    `SELECT user_kode, user_nama, user_password
      FROM tuser
    WHERE UPPER(user_kode) = UPPER(?) LIMIT 1`,
    [username],
  );

  if (rows.length === 0) throw new Error("Username atau password salah.");

  const user = rows[0];

  // Cek password — plain text (legacy Delphi) atau bcrypt
  const valid = password === user.user_password;
  if (!valid) throw new Error("Username atau password salah.");

  const isAdmin = user.user_kode.trim().toUpperCase() === "ADMIN";

  const payload = {
    kode: user.user_kode,
    nama: user.user_nama,
    level: isAdmin ? "ADMIN" : "USER", // tidak ada kolom level
    cabang: "", // tabel tuser tidak punya kolom cabang
  };

  const token = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "8h",
  });

  let menus = [];
  try {
    // db_pocokan: hak_view = 'Y' bila record thakuser ada (akses menu).
    const [menuRows] = await db.query(
      `SELECT hak_men_id AS menu_id,
              'Y'                   AS hak_view,
              IFNULL(hak_men_insert, 'N') AS hak_insert,
              IFNULL(hak_men_edit,   'N') AS hak_edit,
              IFNULL(hak_men_delete, 'N') AS hak_delete,
              'N' AS hak_print
       FROM thakuser
       WHERE hak_user_kode = ?`,
      [user.user_kode],
    );
    menus = menuRows;
  } catch {
    menus = [];
  }

  return { token, user: { ...payload, menus } };
};

/**
 * Profil user untuk endpoint GET /api/auth/me — dipakai FE pocokan saat
 * berjalan sebagai modul HRIS (SSO): user tidak login ke pocokan, tapi FE
 * tetap butuh profil + daftar menu untuk gating sidebar & route guard.
 *
 * via = 'hris' (token HRIS) → menus dibaca dari thakuser/tmenu HRIS.
 * via = 'pocokan' (token lama, standalone) → menus dari thakuser pocokan.
 */
const me = async (kode, via = "pocokan", nama = "", cabang = "") => {
  const kodeTrim = String(kode || "").trim().toUpperCase();
  let menus = [];
  if (via === "hris") {
    try {
      menus = await menuPocokanUntukUser(kodeTrim);
    } catch {
      menus = [];
    }
  } else {
    try {
      const [menuRows] = await db.query(
        `SELECT hak_men_id AS menu_id,
                'Y'                   AS hak_view,
                IFNULL(hak_men_insert, 'N') AS hak_insert,
                IFNULL(hak_men_edit,   'N') AS hak_edit,
                IFNULL(hak_men_delete, 'N') AS hak_delete,
                'N' AS hak_print
         FROM thakuser
         WHERE hak_user_kode = ?`,
        [kodeTrim],
      );
      menus = menuRows;
    } catch {
      menus = [];
    }
  }

  return {
    kode: kodeTrim,
    nama: nama || kodeTrim,
    level: kodeTrim === "ADMIN" ? "ADMIN" : "USER",
    cabang: cabang || "",
    menus,
  };
};

const changePassword = async (userKode, oldPassword, newPassword) => {
  // Cek password lama
  const [[user]] = await db.query(
    `SELECT user_kode, user_password
     FROM tuser
     WHERE UPPER(user_kode) = UPPER(?)`,
    [userKode],
  );

  if (!user) throw new Error("User tidak ditemukan.");
  if (user.user_password !== oldPassword)
    throw new Error("Password lama salah.");

  // Update password baru
  await db.query(
    `UPDATE tuser SET user_password = ?, date_modify = NOW()
     WHERE user_kode = ?`,
    [newPassword, user.user_kode],
  );

  return { success: true };
};

module.exports = { login, me, changePassword };
