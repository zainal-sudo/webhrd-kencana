const svc = require("../../services/laporan/lapAbsensiService");

const getLapAbsensi = async (req, res) => {
  try {
    const { pabKode, periode1, periode2 } = req.query;

    if (!periode1 || !periode2) {
      return res.status(400).json({
        success: false,
        message: "Periode wajib diisi.",
      });
    }

    const data = await svc.getLapAbsensi(pabKode || "", periode1, periode2);

    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

module.exports = { getLapAbsensi };
