const express = require("express");
const router = express.Router();
const ctrl = require("../../controllers/master/unitController");
const { verifyToken, checkPermission } = require("../../middleware/authMiddleware");

const menuId = 61; // men_nama "pocokanM61" (Pocokan Unit) di tmenu HRIS
router.get("/", verifyToken, checkPermission(menuId, "view"), ctrl.getAll);
router.post("/save", verifyToken, checkPermission(menuId, "insert"), ctrl.saveData);
router.delete("/:kode", verifyToken, checkPermission(menuId, "delete"), ctrl.deleteData);

module.exports = router;
