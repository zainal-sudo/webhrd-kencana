const svc = require("../../services/master/unitService");

// Pesan DB mentah seperti "read ECONNRESET" tidak ramah untuk user.
const isConnectionError = (e) =>
  /ECONNRESET|ECONNREFUSED|ETIMEDOUT|PROTOCOL_CONNECTION_LOST|ENOTFOUND|EAI_AGAIN/i.test(
    `${e?.code ?? ""} ${e?.message ?? ""}`,
  );

const getAll = async (req, res) => {
  try {
    res.json({ success: true, data: await svc.getAll() });
  } catch (e) {
    console.error("Gagal memuat daftar unit:", e.code ?? e.message);
    if (isConnectionError(e)) {
      return res.status(503).json({
        success: false,
        message: "Koneksi database terputus, silakan coba lagi.",
      });
    }
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
    await svc.deleteData(req.params.kode);
    res.json({ success: true, message: "Berhasil dihapus." });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

module.exports = { getAll, saveData, deleteData };
