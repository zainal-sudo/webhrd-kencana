const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/master/bagianController");
const { verifyToken, checkPermission } = require("../../middleware/authMiddleware");

const menuId = 115; // Sesuai dengan men_id tmenu Bagian di database HRIS (pocokanM60)
router.get("/", verifyToken, checkPermission(menuId, "view"), ctrl.getAll);
router.post("/save", verifyToken, checkPermission(menuId, "insert"), ctrl.saveData);
router.delete("/:kode", verifyToken, checkPermission(menuId, "delete"), ctrl.deleteData);

module.exports = router;
