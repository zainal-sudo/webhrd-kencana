const svc = require("../../services/transaksi/prosesGajiService");

const getProsesGaji = async (req, res) => {
  try {
    const { pabKode, periode1, periode2 } = req.query;
    if (!pabKode || !periode1 || !periode2) {
      return res.status(400).json({ success: false, message: "Unit dan Periode wajib diisi." });
    }
    const data = await svc.getProsesGaji(pabKode, periode1, periode2);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const saveProsesGaji = async (req, res) => {
  try {
    const result = await svc.saveProsesGaji(req.body);
    res.json({ success: true, data: result, message: "Proses gaji berhasil disimpan." });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

module.exports = { getProsesGaji, saveProsesGaji };
