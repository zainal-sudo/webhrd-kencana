const express = require("express");
const router = express.Router();
const controller = require("../controllers/lookupController");
const { verifyToken } = require("../middleware/authMiddleware");

router.get("/supplier", verifyToken, controller.getSupplier);
router.get("/user",     verifyToken, controller.getUser);
router.get("/bagian",   verifyToken, controller.getBagian);
router.get("/pabrik",   verifyToken, controller.getPabrik);

module.exports = router;
