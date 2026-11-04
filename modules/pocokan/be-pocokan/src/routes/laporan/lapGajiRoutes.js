const express = require("express");

const router = express.Router();

const ctrl = require("../../controllers/laporan/lapGajiController");

const {
    verifyToken,
    checkPermission,
} = require("../../middleware/authMiddleware");

const menuId = 120; // Sesuai dengan men_id tmenu Proses Gaji / Lap Gaji di database HRIS (pocokanM65)

router.get(
    "/",
    verifyToken,
    checkPermission(menuId, "view"),
    ctrl.getLapGaji
);

module.exports = router;