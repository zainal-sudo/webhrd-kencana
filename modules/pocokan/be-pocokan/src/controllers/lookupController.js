const lookupService = require("../services/lookupService");

const getSupplier = async (req, res) => {
  try {
    const data = await lookupService.getSupplier(req.query.search || "");
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getUser = async (req, res) => {
  try {
    const data = await lookupService.getUser(req.query.search || "");
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getBagian = async (req, res) => {
  try {
    const data = await lookupService.getBagian();
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getPabrik = async (req, res) => {
  try {
    const data = await lookupService.getPabrik();
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getSupplier, getUser, getBagian, getPabrik };
