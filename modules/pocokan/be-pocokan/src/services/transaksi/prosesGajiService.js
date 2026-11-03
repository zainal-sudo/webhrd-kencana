const db = require("../../config/database");

const getProsesGaji = async (pabKode, periode1, periode2) => {
  const semua = pabKode === "SEMUA";
  // Ambil karyawan aktif di unit tersebut beserta gapok
  const [karyawan] = await db.query(
    `SELECT 
       k.kar_kode AS id, 
       k.kar_nama AS nama, 
       k.kar_pab_kode AS unit, 
       COALESCE(b.bag_nama, k.kar_bag_kode, '-') AS bagian,
       COALESCE(k.kar_gapok, 0) AS gapok
     FROM tkaryawan k
     LEFT JOIN tbagian b ON b.bag_kode = k.kar_bag_kode
      WHERE ${semua ? "EXISTS (SELECT 1 FROM tpabrik p WHERE p.pab_kode = k.kar_pab_kode)" : "k.kar_pab_kode = ?"} AND k.kar_isaktif = 1
     ORDER BY k.kar_kode`,
    semua ? [] : [pabKode]
  );

  // Ambil total kehadiran (SUM ab_hari) dan rincian lembur dalam rentang periode1 s/d periode2 dari tabsensi
  // Karena lembur perlu dipecah: <= 2 jam per hari dan > 2 jam per hari, 
  // kita ambil per baris absensi untuk dihitung di JS atau di SQL. 
  // Sesuai aturan: jika total lembur hari itu h, maka lembur <= 2 adalah LEAST(h, 2) dan lembur > 2 adalah GREATEST(0, h - 2).
  const [absensiRows] = await db.query(
    `SELECT 
       ab_kar_kode AS kar_kode,
       ab_hari,
       ab_jamlembur
     FROM tabsensi
      WHERE ${semua ? "" : "ab_pab_kode = ? AND "}ab_tanggal BETWEEN ? AND ?`,
    semua ? [periode1, periode2] : [pabKode, periode1, periode2]
  );

  const summaryMap = {};
  absensiRows.forEach(row => {
    if (!summaryMap[row.kar_kode]) {
      summaryMap[row.kar_kode] = { kehadiran: 0, lemburLE2: 0, lemburGT2: 0 };
    }
    summaryMap[row.kar_kode].kehadiran += Number(row.ab_hari) || 0;
    
    const hLembur = Number(row.ab_jamlembur) || 0;
    const lLE2 = Math.min(hLembur, 2);
    const lGT2 = Math.max(0, hLembur - 2);

    summaryMap[row.kar_kode].lemburLE2 += lLE2;
    summaryMap[row.kar_kode].lemburGT2 += lGT2;
  });

  // Ambil potongan yang sudah tersimpan pada periode dan unit yang sama.
  const [potonganRows] = await db.query(
    `SELECT
       gm_kar_nik AS kar_kode,
       COALESCE(gm_potongan, 0) AS potongan
     FROM tgajimingguan
      WHERE ${semua ? "" : "gm_pab_kode = ? AND "}gm_periode = ? AND gm_periode2 = ?`,
    semua ? [periode1, periode2] : [pabKode, periode1, periode2]
  );

  const potonganMap = Object.fromEntries(
    potonganRows.map((row) => [row.kar_kode, Number(row.potongan) || 0])
  );

  // Gabungkan
  const result = karyawan.map((k, idx) => {
    const s = summaryMap[k.id] || { kehadiran: 0, lemburLE2: 0, lemburGT2: 0 };
    return {
      no: idx + 1,
      id: k.id,
      nama: k.nama,
      unit: k.unit,
      bagian: k.bagian,
      gapok: k.gapok,
      kehadiran: s.kehadiran,
      lemburLE2: s.lemburLE2,
      lemburGT2: s.lemburGT2,
      potongan: potonganMap[k.id] ?? null
    };
  });

  return result;
};

const saveProsesGaji = async (payload) => {
  const { pabKode, periode1, periode2, items } = payload;
  if (!pabKode || !periode1 || !periode2) {
    throw new Error("Unit dan Periode wajib diisi.");
  }
  if (!items || !items.length) {
    throw new Error("Tidak ada data untuk disimpan.");
  }

  // Potongan yang belum diisi bukan nol; hanya simpan karyawan yang
  // potongannya sudah diisi (termasuk nilai 0 yang disengaja).
  const preparedItems = items
    .filter((item) => item.potongan !== null && item.potongan !== undefined && item.potongan !== "")
    .map((item) => {
      const potongan = Number(item.potongan);

      if (!Number.isFinite(potongan) || potongan < 0) {
        throw new Error(`Potongan karyawan ${item.id} harus berupa angka nol atau lebih.`);
      }

      return { item, potongan };
    });
  // preparedItems boleh kosong: admin sengaja mengosongkan potongan, dan DELETE
  // di bawah tetap berjalan sehingga baris lamanya hilang. Menolak payload
  // kosong membuat nilai yang sudah dikosongkan admin tidak bisa disimpan.
  // Catatan: baris tgajimingguan ikut menyimpan gm_gapok/gm_hari/gm_jamlembur,
  // jadi mengosongkan semua potongan untuk satu periode juga menghapus snapshot
  // itu. Nilai attendance & lembur tetap dihitung ulang dari tabsensi, jadi
  // laporan gaji tidak berubah.

  // Resolusi unit asli sebelum DELETE; SEMUA bukan kode unit database.
  let unitMap;
  if (pabKode === "SEMUA") {
    const [karyawan] = await db.query(
      `SELECT k.kar_kode, k.kar_pab_kode FROM tkaryawan k
       JOIN tpabrik p ON p.pab_kode = k.kar_pab_kode
       WHERE k.kar_isaktif = 1 AND k.kar_kode IN (?)`,
      [items.map(item => item.id)]
    );
    unitMap = new Map(karyawan.map(k => [k.kar_kode, k.kar_pab_kode]));
    if (items.some(item => !unitMap.has(item.id))) {
      throw new Error("Terdapat karyawan tidak aktif atau unit tidak valid. Muat ulang gaji sebelum menyimpan.");
    }
  }

  // SEMUA hanya mengganti karyawan yang ditampilkan, menjaga data nonaktif.
  await db.query(
    unitMap
      ? `DELETE FROM tgajimingguan WHERE gm_periode = ? AND gm_periode2 = ? AND gm_kar_nik IN (?)`
      : `DELETE FROM tgajimingguan WHERE gm_pab_kode = ? AND gm_periode = ? AND gm_periode2 = ?`,
    unitMap ? [periode1, periode2, items.map(item => item.id)] : [pabKode, periode1, periode2]
  );

  // Insert ulang hanya item dengan potongan terisi ke tgajimingguan
  for (const { item, potongan } of preparedItems) {
    await db.query(
      `INSERT INTO tgajimingguan
       (gm_pab_kode, gm_periode, gm_periode2, gm_kar_nik, gm_gapok, gm_hari, gm_jamlembur, gm_jamlembur2, gm_potongan)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        unitMap ? unitMap.get(item.id) : pabKode,
        periode1,
        periode2,
        item.id,
        Number(item.gapok) || 0,
        Number(item.kehadiran) || 0,
        Number(item.lemburLE2) || 0,
        Number(item.lemburGT2) || 0,
        potongan
      ]
    );
  }

  return { savedCount: preparedItems.length };
};

module.exports = { getProsesGaji, saveProsesGaji };
