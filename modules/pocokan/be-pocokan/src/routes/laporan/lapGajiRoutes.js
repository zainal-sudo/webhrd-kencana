const express = require("express");

const router = express.Router();

const ctrl = require("../../controllers/laporan/lapGajiController");

const {
    verifyToken,
    checkPermission,
} = require("../../middleware/authMiddleware");

const menuId = 65; // men_nama "pocokanM65" (Pocokan Proses Gaji & Lap Gaji) di tmenu HRIS

router.get(
    "/",
    verifyToken,
    checkPermission(menuId, "view"),
    ctrl.getLapGaji
);

module.exports = router;