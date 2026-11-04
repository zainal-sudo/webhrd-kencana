const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/transaksi/absensiController");
const { verifyToken, checkPermission } = require("../../middleware/authMiddleware");

const menuId = 119; // Sesuai dengan men_id tmenu Absensi di database HRIS (pocokanM64)
router.get("/karyawan", verifyToken, checkPermission(menuId, "view"), ctrl.getKaryawanByUnit);
router.post("/save", verifyToken, checkPermission(menuId, "insert"), ctrl.saveAbsensi);
router.post("/tarik-wajah", verifyToken, checkPermission(menuId, "insert"), ctrl.tarikWajah);

module.exports = router;
