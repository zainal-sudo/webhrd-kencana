const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/transaksi/prosesGajiController");
const { verifyToken, checkPermission } = require("../../middleware/authMiddleware");

const menuId = 65; // men_nama "pocokanM65" (Pocokan Proses Gaji & Lap Gaji) di tmenu HRIS
router.get("/", verifyToken, checkPermission(menuId, "view"), ctrl.getProsesGaji);
router.post("/save", verifyToken, checkPermission(menuId, "insert"), ctrl.saveProsesGaji);

module.exports = router;
