const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/master/karyawanController");
const { verifyToken, checkPermission } = require("../../middleware/authMiddleware");

// Menu ID 4 sesuai dengan tmenu untuk Karyawan di Library
const menuId = 4;

router.get("/", verifyToken, checkPermission(menuId, "view"), ctrl.getAll);
router.get("/:kode", verifyToken, checkPermission(menuId, "view"), ctrl.getById);
router.post("/save", verifyToken, checkPermission(menuId, "insert"), ctrl.saveData);
router.delete("/:kode", verifyToken, checkPermission(menuId, "delete"), ctrl.deleteData);

module.exports = router;
