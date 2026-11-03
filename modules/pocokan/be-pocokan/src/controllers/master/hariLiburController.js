const svc = require("../../services/master/hariLiburService");

const getAll = async (req, res) => {
  try {
    const tahun = req.query.tahun;
    res.json({ success: true, data: await svc.getAll(tahun) });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const saveData = async (req, res) => {
  try {
    res.json({ success: true, data: await svc.saveData(req.body), message: "Berhasil disimpan." });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

const deleteData = async (req, res) => {
  try {
    await svc.deleteData(req.params.tanggal);
    res.json({ success: true, message: "Berhasil dihapus." });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

const insertSundays = async (req, res) => {
  try {
    const result = await svc.insertSundays(req.body);
    res.json({ success: true, data: result, message: `Berhasil menambahkan ${result.insertedCount} Hari Minggu.` });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

module.exports = { getAll, saveData, deleteData, insertSundays };
