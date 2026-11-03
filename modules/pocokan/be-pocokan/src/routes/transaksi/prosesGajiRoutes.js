const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/transaksi/prosesGajiController");
const { verifyToken, checkPermission } = require("../../middleware/authMiddleware");

const menuId = 10; // Sesuai dengan tmenu Proses Gaji / Gaji Mingguan
router.get("/", verifyToken, checkPermission(menuId, "view"), ctrl.getProsesGaji);
router.post("/save", verifyToken, checkPermission(menuId, "insert"), ctrl.saveProsesGaji);

module.exports = router;
