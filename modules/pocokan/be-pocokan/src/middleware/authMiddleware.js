const jwt = require("jsonwebtoken");
const { db } = require("../config/hrisDb");

/* ── Autentikasi & otorisasi Pocokan: mengikuti HRIS ──────────────────────
 *
 * Setelah integrasi, login hanya lewat HRIS (POST /api/login webhrd-kencana):
 *   token HRIS  = JWT { user, nama, cabang }   (controllers/auth/authController.js)
 *
 * Modul pocokan tidak punya login sendiri lagi di alur integrasi; backend ini
 * memverifikasi token HRIS yang sama (JWT_SECRET disamakan) lalu memeriksa
 * hak akses pada tabel thakuser/tmenu milik HRIS (hrd2).
 *
 * Konvensi nama menu HRIS: setiap modul Pocokan direpresentasikan sebagai
 *   tmenu.men_nama = "pocokanM" + <menuId pocokan>
 * (mis. menuId "9" Absensi Pocokan → "pocokanM9"), sehingga HRD mengatur
 * semuanya dari halaman Hak Akses HRIS yang sudah ada. Kebutuhan seed SQL
 * untuk entri ini: modules/pocokan/seed-tmenu-pocokan.sql (ditinjau manual).
 *
 * Login lama pocokan (POST /api/auth/login) tetap hidup untuk masa transisi
 * (standalone/dev) — lihat catatan di akhir file.
 */

/** Prefiks men_nama HRIS untuk modul pocokan. */
const MEN_PREFIX = "pocokanM";

/**
 * Normalisasi payload token:
 *  - Token HRIS   : { user: "<user_kode>", nama, cabang }
 *  - Token pocokan lama (standalone): { kode, nama, level, cabang }
 * Hasilnya objek tunggal { kode, nama, cabang, level? } di req.user.
 */
const normalisasiPayload = (decoded) => {
  const kode = String(decoded.user ?? decoded.kode ?? "").trim();
  const nama = String(decoded.nama ?? "").trim();
  const cabang = decoded.cabang ?? "";
  // level belum dikenal dari HRIS — turunkan untuk bypass ADMIN agar
  // prilaku sama dengan role ADMIN pocokan.
  const level = decoded.level || (kode.toUpperCase() === "ADMIN" ? "ADMIN" : undefined);
  return { ...decoded, kode, nama, cabang, level, via: decoded.user != null ? "hris" : "pocokan" };
};

/**
 * verifyToken
 * Memvalidasi JWT dari header Authorization: Bearer <token>
 * Menyimpan payload ke req.user
 */
const verifyToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res
      .status(401)
      .json({ success: false, message: "Token tidak ditemukan." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = normalisasiPayload(decoded);
    next();
  } catch (err) {
    return res
      .status(403)
      .json({
        success: false,
        message: "Token tidak valid atau sudah expired.",
      });
  }
};

/**
 * checkPermission(menuId, action)
 * action: 'view' | 'insert' | 'edit' | 'delete' | 'print'
 *
 * Sumber hak = database HRIS (hrd2) — bukan thakuser milik database pocokan:
 *   - view/print : ada baris thakuser (identik dengan aturan 'view' HRIS)
 *   - insert/edit/delete : kolom hak_men_insert/edit/delete = "Y"
 * ADMIN bypass tetap adminsitrasi sama seperti sebelumnya.
 */
const checkPermission = (menuId, action) => {
  return async (req, res, next) => {
    try {
      if (req.user?.kode?.toUpperCase() === "ADMIN") return next();

      const colMap = {
        insert: "hak_men_insert",
        edit: "hak_men_edit",
        delete: "hak_men_delete",
      };

      let sql;
      if (action === "view" || action === "print") {
        sql =
          "SELECT 1 AS permission FROM thakuser " +
          "INNER JOIN tmenu ON tmenu.men_id = thakuser.hak_men_id " +
          "WHERE thakuser.hak_user_kode = ? AND tmenu.men_nama = ? LIMIT 1";
      } else if (colMap[action]) {
        // db_pocokan: thakuser tidak punya kolom view. Hak "view" (akses menu)
        // = keberadaan record thakuser untuk user + menu tersebut.
        sql =
          `SELECT ${colMap[action]} AS permission FROM thakuser ` +
          "INNER JOIN tmenu ON tmenu.men_id = thakuser.hak_men_id " +
          "WHERE thakuser.hak_user_kode = ? AND tmenu.men_nama = ? LIMIT 1";
      } else {
        return res
          .status(400)
          .json({ success: false, message: "Action tidak valid." });
      }

      const [rows] = await db.query(sql, [
        req.user.kode,
        `${MEN_PREFIX}${menuId}`,
      ]);

      if (rows.length === 0)
        return res
          .status(403)
          .json({ success: false, message: "Anda tidak berhak modul ini" });

      if ((action === "insert" || action === "edit" || action === "delete") && rows[0].permission !== "Y")
        return res
          .status(403)
          .json({ success: false, message: "Akses ditolak." });

      next();
    } catch (err) {
      return res
        .status(500)
        .json({ success: false, message: "Gagal memeriksa hak akses." });
    }
  };
};

/**
 * Untuk alur SSO: daftar modul pocokan yang boleh dilihat user HRIS ini.
 * Dipakai oleh endpoint GET /api/auth/me (pemetaan sidebar pocokan).
 * ADMIN HRIS → semua modul pocokan.
 */
const menuPocokanUntukUser = async (kode, isFirstAdmin = false) => {
  if (String(kode).toUpperCase() === "ADMIN") {
    const [all] = await db.query(
      "SELECT men_id, men_nama, men_keterangan FROM tmenu WHERE men_nama LIKE ? ORDER BY men_id",
      [`${MEN_PREFIX}%`],
    );
    return all.map((m) => ({
      menu_id: String(m.men_nama).slice(MEN_PREFIX.length),
      hak_view: "Y",
      hak_insert: "Y",
      hak_edit: "Y",
      hak_delete: "Y",
      hak_print: "Y",
      label: m.men_keterangan,
    }));
  }
  const [rows] = await db.query(
    "SELECT c.men_id, c.men_nama, c.men_keterangan, " +
      "b.hak_men_insert, b.hak_men_edit, b.hak_men_delete " +
      "FROM thakuser b INNER JOIN tmenu c ON c.men_id = b.hak_men_id " +
      "WHERE b.hak_user_kode = ? AND c.men_nama LIKE ? ORDER BY c.men_id",
    [kode, `${MEN_PREFIX}%`],
  );
  return rows.map((m) => ({
    menu_id: String(m.men_nama).slice(MEN_PREFIX.length),
    hak_view: "Y",
    hak_insert: m.hak_men_insert,
    hak_edit: m.hak_men_edit,
    hak_delete: m.hak_men_delete,
    hak_print: "N",
    label: m.men_keterangan,
  }));
};

module.exports = { verifyToken, checkPermission, menuPocokanUntukUser, MEN_PREFIX };

/* Catatan masa transisi:
 * - Login lama pocokan (POST /api/auth/login — services/authService.js)
 *   masih terpasang & berfungsi (mode standalone/dev). Setelah integrasi
 *   HRIS teruji, jalur ini dinonaktifkan agar tidak ada jalur akses yang
 *   melewati aturan keamanan HRIS (tandai dihapus dari mount).
 * - Token dari query string sengaja TIDAK diterapkan: FE pocokan memakai
 *   localStorage kencana_hrd_token karena di-deploy same-origin dengan HRIS.
 */
