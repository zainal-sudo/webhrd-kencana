const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/laporan/lapAbsensiController");
const { verifyToken } = require("../../middleware/authMiddleware");

// Tidak ada MENU_ID khusus — cukup verifyToken (seperti List Jurnal)
// agar menu laporan absensi langsung bisa diakses setelah login.
router.get("/", verifyToken, ctrl.getLapAbsensi);

module.exports = router;
