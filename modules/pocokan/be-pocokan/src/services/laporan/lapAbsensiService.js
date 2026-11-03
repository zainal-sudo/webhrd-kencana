const db = require("../../config/database");

const HARI_ID = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

const toISODate = (v) => {
  if (!v) return "";
  if (typeof v === "string") return v.substring(0, 10);
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().split("T")[0];
};

const getLapAbsensi = async (pabKode, periode1, periode2) => {
  const params = [periode1, periode2];
  let pabFilter = "";
  if (pabKode && pabKode !== "" && pabKode !== "SEMUA") {
    pabFilter = " AND a.ab_pab_kode = ?";
    params.push(pabKode);
  }

  const [rows] = await db.query(
    `
    SELECT
      a.ab_pab_kode AS pabrik,
      a.ab_tanggal AS tanggal,
      a.ab_kar_kode AS id,
      COALESCE(k.kar_nama, a.ab_kar_kode) AS nama,
      COALESCE(b.bag_nama, k.kar_bag_kode, '-') AS bagian,
      a.ab_hari AS kehadiran
    FROM tabsensi a
    LEFT JOIN tkaryawan k ON k.kar_kode = a.ab_kar_kode
    LEFT JOIN tbagian b ON b.bag_kode = k.kar_bag_kode
    WHERE a.ab_tanggal BETWEEN ? AND ?${pabFilter}
    ORDER BY a.ab_tanggal, k.kar_nama, a.ab_kar_kode
    `,
    params
  );

  return rows.map((row, index) => {
    const tgl = toISODate(row.tanggal);
    let hari = "";
    if (tgl) {
      const d = new Date(tgl + "T00:00:00");
      if (!isNaN(d.getTime())) hari = HARI_ID[d.getDay()];
    }
    return {
      no: index + 1,
      pabrik: row.pabrik || "",
      tanggal: tgl,
      nama: row.nama || "",
      bagian: row.bagian || "",
      hari,
      kehadiran: Number(row.kehadiran) || 0,
    };
  });
};

module.exports = { getLapAbsensi };
