const db = require("../../config/database");

const getAll = async () => {
  const [rows] = await db.query(`SELECT bag_kode AS kode, bag_nama AS nama FROM tbagian ORDER BY bag_kode`);
  return rows;
};

const saveData = async (payload) => {
  const { isEdit, kode, nama } = payload;
  if (isEdit) {
    await db.query(`UPDATE tbagian SET bag_nama = ? WHERE bag_kode = ?`, [nama, kode]);
  } else {
    // Generate kode if empty or if needed, matching Delphi logic: max(bag_kode) + 1001 or similar, 
    // but usually user provides or we generate 3-char code using RIGHT(CAST(CAST(COALESCE(MAX(bag_kode), '1000') AS UNSIGNED) + 1 AS CHAR), 3) or similar.
    // Let's check Delphi code provided:
    // s:='select max(bag_kode) from tbagian';
    // if Fields[0].AsString = '' then result:= RightStr(IntToStr(1001),3) else result:= RightStr(IntToStr(fields[0].AsInteger+1001),3);
    // Wait! fields[0].AsInteger + 1001? Or max + 1? Wait, if fields[0] is e.g. "001", AsInteger is 1. 1 + 1001 = 1002 -> RightStr(1002, 3) = "002". Wait, let's make sure code generation is robust and handles insert properly.
    let newKode = kode;
    if (!newKode) {
      const [maxRows] = await db.query(`SELECT MAX(bag_kode) AS max_kode FROM tbagian`);
      const maxVal = maxRows[0]?.max_kode;
      if (!maxVal) {
        newKode = "001";
      } else {
        const num = parseInt(maxVal, 10) || 0;
        newKode = String(num + 1).padStart(3, '0');
      }
    }
    await db.query(`INSERT INTO tbagian (bag_kode, bag_nama) VALUES (?, ?)`, [newKode, nama]);
    return { kode: newKode };
  }
  return { kode };
};

const deleteData = async (kode) => {
  await db.query(`DELETE FROM tbagian WHERE bag_kode = ?`, [kode]);
};

module.exports = { getAll, saveData, deleteData };
