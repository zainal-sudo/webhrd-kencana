const express = require("express");

const router = express.Router();

const ctrl = require("../../controllers/laporan/lapGajiController");

const {
    verifyToken,
    checkPermission,
} = require("../../middleware/authMiddleware");

const menuId = 10;

router.get(
    "/",
    verifyToken,
    checkPermission(menuId, "view"),
    ctrl.getLapGaji
);

module.exports = router;