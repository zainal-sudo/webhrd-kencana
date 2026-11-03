const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/master/hariLiburController");
const { verifyToken, checkPermission } = require("../../middleware/authMiddleware");

const menuId = 8; // Sesuai dengan tmenu Hari Libur
router.get("/", verifyToken, checkPermission(menuId, "view"), ctrl.getAll);
router.post("/save", verifyToken, checkPermission(menuId, "insert"), ctrl.saveData);
router.post("/insert-sundays", verifyToken, checkPermission(menuId, "insert"), ctrl.insertSundays);
router.delete("/:tanggal", verifyToken, checkPermission(menuId, "delete"), ctrl.deleteData);

module.exports = router;
