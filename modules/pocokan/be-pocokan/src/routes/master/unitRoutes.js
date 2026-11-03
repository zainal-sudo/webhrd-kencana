const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/master/unitController");
const { verifyToken, checkPermission } = require("../../middleware/authMiddleware");

const menuId = 6; // Sesuai dengan tmenu Unit (MEN_ID = 6)
router.get("/", verifyToken, checkPermission(menuId, "view"), ctrl.getAll);
router.post("/save", verifyToken, checkPermission(menuId, "insert"), ctrl.saveData);
router.delete("/:kode", verifyToken, checkPermission(menuId, "delete"), ctrl.deleteData);

module.exports = router;
