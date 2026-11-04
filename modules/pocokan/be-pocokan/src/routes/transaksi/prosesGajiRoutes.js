const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/transaksi/prosesGajiController");
const { verifyToken, checkPermission } = require("../../middleware/authMiddleware");

const menuId = 120; // Sesuai dengan men_id tmenu Proses Gaji di database HRIS (pocokanM65)
router.get("/", verifyToken, checkPermission(menuId, "view"), ctrl.getProsesGaji);
router.post("/save", verifyToken, checkPermission(menuId, "insert"), ctrl.saveProsesGaji);

module.exports = router;
