const svc = require("../../services/laporan/lapGajiService");

const getLapGaji = async (req, res) => {
    try {
        const { periode1, periode2 } = req.query;

        if (!periode1 || !periode2) {
            return res.status(400).json({
                success: false,
                message: "Periode wajib diisi.",
            });
        }

        const data = await svc.getLapGaji(
            periode1,
            periode2
        );

        res.json({
            success: true,
            data,
        });

    } catch (e) {
        res.status(500).json({
            success: false,
            message: e.message,
        });
    }
};

module.exports = {
    getLapGaji,
};