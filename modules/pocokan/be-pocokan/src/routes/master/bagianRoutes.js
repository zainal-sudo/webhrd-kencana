const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/master/bagianController");
const { verifyToken, checkPermission } = require("../../middleware/authMiddleware");

const menuId = 5; // Sesuai dengan tmenu Bagian (MEN_ID = 5)
router.get("/", verifyToken, checkPermission(menuId, "view"), ctrl.getAll);
router.post("/save", verifyToken, checkPermission(menuId, "insert"), ctrl.saveData);
router.delete("/:kode", verifyToken, checkPermission(menuId, "delete"), ctrl.deleteData);

module.exports = router;
