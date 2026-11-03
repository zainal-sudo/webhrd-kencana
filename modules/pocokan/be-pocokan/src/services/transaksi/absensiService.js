const db = require("../../config/database");

// Koneksi idle yang diputus MySQL (ECONNRESET/dsb) cukup dicoba sekali lagi.
const isConnectionError = (e) =>
  /ECONNRESET|ECONNREFUSED|ETIMEDOUT|PROTOCOL_CONNECTION_LOST|ENOTFOUND|EAI_AGAIN/i.test(
    `${e?.code ?? ""} ${e?.message ?? ""}`,
  );
const queryRetryOnce = async (sql, params) => {
  try {
    return await db.query(sql, params);
  } catch (e) {
    if (!isConnectionError(e)) throw e;
    await new Promise((r) => setTimeout(r, 300));
    return await db.query(sql, params);
  }
};

// Nilai ab_hari (hari kerja) yang boleh diisi manual: 0 tidak hadir,
// 0.5 setengah hari, 1 hadir, 2 dua hari. Penarikan wajah selalu menulis 1.
const HADIR_VALUES = [0, 0.5, 1, 2];
const ALL_UNITS = "SEMUA";

const getKaryawanByUnit = async (pabKode, tanggal) => {
  const semua = pabKode === ALL_UNITS;
  // Ambil karyawan aktif di unit (pabrik) tersebut dengan JOIN ke tbagian untuk mendapatkan nama bagian (bag_nama)
  const [karyawan] = await queryRetryOnce(
    `SELECT 
       k.kar_kode AS id, 
       k.kar_nama AS nama, 
       k.kar_pab_kode AS unit, 
       COALESCE(b.bag_nama, k.kar_bag_kode, '-') AS bagian 
     FROM tkaryawan k
     LEFT JOIN tbagian b ON b.bag_kode = k.kar_bag_kode
      WHERE ${semua ? "EXISTS (SELECT 1 FROM tpabrik p WHERE p.pab_kode = k.kar_pab_kode)" : "k.kar_pab_kode = ?"} AND k.kar_isaktif = 1
     ORDER BY k.kar_kode`,
    semua ? [] : [pabKode]
  );

  // Cek apakah sudah ada data absensi untuk tanggal & unit ini
  const [existing] = await queryRetryOnce(
    `SELECT ab_kar_kode, ab_hari, ab_jamlembur 
     FROM tabsensi 
      WHERE ${semua ? "" : "ab_pab_kode = ? AND "}ab_tanggal = ?`,
    semua ? [tanggal] : [pabKode, tanggal]
  );

  const mapExisting = {};
  existing.forEach(item => {
    mapExisting[item.ab_kar_kode] = {
      kehadiran: item.ab_hari,
      jamlembur: item.ab_jamlembur
    };
  });

  // Gabungkan ke list karyawan
  const result = karyawan.map((k, idx) => ({
    no: idx + 1,
    id: k.id,
    nama: k.nama,
    unit: k.unit,
    bagian: k.bagian,
    kehadiran: mapExisting[k.id] !== undefined ? mapExisting[k.id].kehadiran : null, // Belum diisi
    jamlembur: mapExisting[k.id] !== undefined ? mapExisting[k.id].jamlembur : null // Belum diisi
  }));

  return result;
};

const saveAbsensi = async (payload) => {
  const { pabKode, tanggal, items } = payload;
  if (!pabKode || !tanggal) {
    throw new Error("Unit dan Tanggal wajib diisi.");
  }
  if (!items || !items.length) {
    throw new Error("Tidak ada data absensi untuk disimpan.");
  }

  // Kolom yang belum diisi tidak menjadi absensi 0. Nilai 0 yang diisi
  // secara sengaja tetap disimpan.
  const terisi = value => value !== null && value !== undefined && value !== "";
  // Baris boleh disimpan kalau kehadiran ATAU jam lembur diisi, supaya lembur
  // bisa diinput lebih dulu tanpa harus mengisi kehadiran.
  const filledItems = items.filter(item => terisi(item.kehadiran) || terisi(item.jamlembur));
  // filledItems boleh kosong: admin sengaja mengembalikan nilai ke NULL, dan
  // DELETE di bawah tetap berjalan sehingga baris lamanya hilang. Menolak
  // payload kosong membuat nilai yang sudah dikosongkan admin tidak bisa
  // disimpan sama sekali.
  // 0 = tidak hadir, 0.5 = setengah hari, 1 = hadir, 2 = dua hari.
  if (filledItems.some(item => terisi(item.kehadiran) && !HADIR_VALUES.includes(Number(item.kehadiran)))) {
    throw new Error("Kehadiran hanya boleh diisi 0, 0.5, 1, atau 2.");
  }

  // SEMUA bukan kode unit database. Resolusi unit dari master dilakukan sebelum
  // menghapus apa pun; jangan mempercayai kolom unit dari payload browser.
  let unitMap;
  if (pabKode === ALL_UNITS) {
    const [karyawan] = await db.query(
      `SELECT k.kar_kode, k.kar_pab_kode FROM tkaryawan k
       JOIN tpabrik p ON p.pab_kode = k.kar_pab_kode
       WHERE k.kar_isaktif = 1 AND k.kar_kode IN (?)`,
      [items.map(item => item.id)]
    );
    unitMap = new Map(karyawan.map(k => [k.kar_kode, k.kar_pab_kode]));
    if (items.some(item => !unitMap.has(item.id))) {
      throw new Error("Terdapat karyawan tidak aktif atau unit tidak valid. Muat ulang absensi sebelum menyimpan.");
    }
  }

  // Mode SEMUA hanya mengganti karyawan dalam payload, bukan menghapus seluruh
  // tanggal termasuk data karyawan nonaktif yang tidak ditampilkan.
  await db.query(
    unitMap
      ? `DELETE FROM tabsensi WHERE ab_tanggal = ? AND ab_kar_kode IN (?)`
      : `DELETE FROM tabsensi WHERE ab_pab_kode = ? AND ab_tanggal = ?`,
    unitMap ? [tanggal, items.map(item => item.id)] : [pabKode, tanggal]
  );

  // Insert ulang hanya baris dengan kehadiran atau jam lembur yang terisi
  for (const item of filledItems) {
    // Baris lembur-only disimpan dengan ab_hari NULL, bukan 0, supaya
    // "kehadiran belum diisi" tidak disamar jadi "tidak hadir". Proses gaji
    // menjumlahkan dengan `Number(ab_hari) || 0` dan laporan gaji memakai
    // SUM(), jadi NULL terhitung 0 hari.
    const hari = terisi(item.kehadiran) ? Number(item.kehadiran) : null;
    // Jam lembur yang dikosongkan pengguna tetap kosong (NULL), bukan 0.
    // Nilai yang benar-benar diisi — termasuk 0 — disimpan apa adanya.
    const lemburTerisi = terisi(item.jamlembur);
    const jamlembur = lemburTerisi ? Number(item.jamlembur) : null;

    await db.query(
      `INSERT INTO tabsensi (ab_pab_kode, ab_tanggal, ab_kar_kode, ab_hari, ab_jamlembur) 
       VALUES (?, ?, ?, ?, ?)`,
      [unitMap ? unitMap.get(item.id) : pabKode, tanggal, item.id, hari, jamlembur]
    );
  }

  return { savedCount: filledItems.length };
};

const tarikWajah = async ({ pabKode, tanggal } = {}) => {
  const semua = pabKode === ALL_UNITS;
  const inputError = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
  if (typeof tanggal !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(tanggal) ||
      tanggal < "1000-01-01" || Number.isNaN(Date.parse(tanggal)) ||
      new Date(tanggal).toISOString().slice(0, 10) !== tanggal) {
    throw inputError("Tanggal tidak valid. Gunakan format YYYY-MM-DD.");
  }
  if (typeof pabKode !== "string" || !pabKode.trim() || pabKode.length > 5) {
    throw inputError("Unit tidak valid.");
  }

  const summary = { ditemukan: 0, inserted: 0, updated: 0, skipped: 0 };
  const conn = await db.getConnection();
  let locked = false;
  // MyISAM tidak mendukung rollback. Lock ini menyerialkan penarikan tanggal
  // yang sama; primary key + upsert tetap melindungi penulisan dari duplikasi.
  const lockNameSql = "CONCAT('pocokan:wajah:', MD5(CONCAT(DATABASE(), ':', ?)))";
  try {
    if (!semua) {
      const [[unit]] = await conn.query("SELECT pab_kode FROM tpabrik WHERE pab_kode = ?", [pabKode]);
      if (!unit) throw inputError("Unit tidak ditemukan.");
    }

    const [[lock]] = await conn.query(`SELECT GET_LOCK(${lockNameSql}, 0) AS acquired`, [tanggal]);
    if (Number(lock.acquired) !== 1) {
      throw inputError("Penarikan tanggal ini sedang berjalan. Silakan coba kembali.", 409);
    }
    locked = true;

    // Orphan tidak mempunyai unit: dihitung sebagai skipped pada tanggal ini.
    // Karyawan unit lain tidak termasuk cakupan penarikan.
    const [[source]] = await conn.query(
      `SELECT COUNT(*) AS total FROM tabsensi_wajah w
       LEFT JOIN tkaryawan k ON k.kar_kode = w.karyawan_id
        WHERE w.tanggal = ? ${semua ? "" : "AND (k.kar_pab_kode = ? OR k.kar_kode IS NULL)"}`,
       semua ? [tanggal] : [tanggal, pabKode]
    );
    const [karyawan] = await conn.query(
      `SELECT DISTINCT k.kar_kode, k.kar_pab_kode, a.ab_kar_kode AS existing
       FROM tabsensi_wajah w
       JOIN tkaryawan k ON k.kar_kode = w.karyawan_id
       LEFT JOIN tabsensi a ON a.ab_kar_kode = k.kar_kode AND a.ab_tanggal = w.tanggal
        WHERE w.tanggal = ? AND k.kar_isaktif = 1
          AND ${semua ? "EXISTS (SELECT 1 FROM tpabrik p WHERE p.pab_kode = k.kar_pab_kode)" : "k.kar_pab_kode = ?"}
         AND w.status = 'Hadir' AND w.jam_masuk IS NOT NULL
         AND w.foto_masuk IS NOT NULL AND TRIM(w.foto_masuk) <> ''`,
       semua ? [tanggal] : [tanggal, pabKode]
    );
    summary.ditemukan = karyawan.length;
    summary.skipped = Math.max(0, Number(source.total) - karyawan.length);

    // Jangan bergantung pada sql_mode: MyISAM bisa melakukan truncation.
    // Hentikan sebelum penulisan apa pun bila data baru melampaui schema target.
    if (karyawan.some(k => k.kar_kode.length > 10)) {
      throw inputError("Penarikan dihentikan: terdapat ID karyawan lebih dari 10 karakter. Periksa kompatibilitas schema tabsensi sebelum melanjutkan.", 409);
    }

    for (const k of karyawan) {
      // Validasi aktif/unit/bukti hadir diulang di statement penulisan untuk
      // menghindari penggunaan hasil seleksi yang sudah kedaluwarsa.
      // ab_jamlembur sengaja tidak ditulis: default kolom adalah NULL sehingga
      // jam lembur tetap kosong sampai diisi manual. Mengisi 0 akan menyamar
      // sebagai "sudah dihitung nol" dan menutupi data yang belum diinput.
      const [result] = await conn.query(
        `INSERT INTO tabsensi (ab_kar_kode, ab_tanggal, ab_pab_kode, ab_hari)
         SELECT k.kar_kode, ?, k.kar_pab_kode, 1 FROM tkaryawan k
         WHERE k.kar_kode = ? AND k.kar_isaktif = 1 AND k.kar_pab_kode = ?
           AND CHAR_LENGTH(k.kar_kode) <= 10
           AND EXISTS (
             SELECT 1 FROM tabsensi_wajah w WHERE w.karyawan_id = k.kar_kode AND w.tanggal = ?
               AND w.status = 'Hadir' AND w.jam_masuk IS NOT NULL
               AND w.foto_masuk IS NOT NULL AND TRIM(w.foto_masuk) <> ''
           )
         ON DUPLICATE KEY UPDATE ab_hari = 1`,
         [tanggal, k.kar_kode, k.kar_pab_kode, tanggal]
      );
      // Pool mysql2 existing memakai FOUND_ROWS: row yang sudah hadir tetap
      // dilaporkan matched (1), sedangkan SELECT tanpa kandidat menghasilkan 0.
      if (result.affectedRows === 0) summary.skipped++;
      else if (k.existing !== null || result.affectedRows === 2) summary.updated++;
      else summary.inserted++;
    }
    return summary;
  } catch (error) {
    // Simpan hasil parsial karena MyISAM tidak bisa rollback; aman untuk retry.
    error.summary = summary;
    throw error;
  } finally {
    try {
      if (locked) await conn.query(`SELECT RELEASE_LOCK(${lockNameSql})`, [tanggal]);
    } catch (error) {
      console.error("Gagal melepas lock tarik absensi:", error.code);
      conn.destroy();
    } finally {
      conn.release();
    }
  }
};

module.exports = { getKaryawanByUnit, saveAbsensi, tarikWajah };
