const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/master/hariLiburController");
const { verifyToken, checkPermission } = require("../../middleware/authMiddleware");

const menuId = 117; // Sesuai dengan men_id tmenu Hari Libur di database HRIS (pocokanM62)
router.get("/", verifyToken, checkPermission(menuId, "view"), ctrl.getAll);
router.post("/save", verifyToken, checkPermission(menuId, "insert"), ctrl.saveData);
router.post("/insert-sundays", verifyToken, checkPermission(menuId, "insert"), ctrl.insertSundays);
router.delete("/:tanggal", verifyToken, checkPermission(menuId, "delete"), ctrl.deleteData);

module.exports = router;
