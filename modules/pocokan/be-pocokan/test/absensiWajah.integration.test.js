// Opt-in: gunakan .env existing. Seluruh fixture ada di TEMPORARY TABLE per
// koneksi yang membayangi tabel asli; tidak ada write ke data/schema permanen.
// RUN_DB_INTEGRATION=1; FACE_APP_DIR menunjuk root aplikasi Absensi Wajah.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const http = require("node:http");
const { createRequire } = require("node:module");

function loadWith(file, overrides) {
  const module = { exports: {} };
  const originalRequire = createRequire(file);
  vm.runInNewContext(fs.readFileSync(file, "utf8"), {
    module, exports: module.exports, __dirname: path.dirname(file), process, console,
    require: name => Object.hasOwn(overrides, name) ? overrides[name] : originalRequire(name),
  }, { filename: file });
  return module.exports;
}

test("Integrasi Tarik Absensi dengan SQL MariaDB/MyISAM", {
  skip: process.env.RUN_DB_INTEGRATION !== "1",
}, async t => {
  const db = require("../src/config/database");
  const conn = await db.getConnection();
  t.after(async () => { conn.destroy(); await db.end(); });

  // Salin DDL hasil audit sebagai tabel TEMPORARY dengan tipe/collation/PK/
  // engine yang sama. MariaDB menolak CREATE TEMPORARY t LIKE t (nama sama).
  // Jangan pernah mengganti TEMPORARY dengan CREATE TABLE biasa.
  for (const table of ["tkaryawan", "tpabrik", "tabsensi_wajah", "tabsensi", "tgajimingguan", "tbagian"]) {
    const [[schema]] = await conn.query(`SHOW CREATE TABLE ${table}`);
    assert.match(schema["Create Table"], /^CREATE TABLE /);
    await conn.query(schema["Create Table"].replace(/^CREATE TABLE /, "CREATE TEMPORARY TABLE "));
  }

  let queryHook;
  const serviceDb = {
    query: (...args) => conn.query(...args),
    getConnection: async () => ({
      query: async (sql, params) => {
        if (queryHook) await queryHook(sql, params);
        return conn.query(sql, params);
      },
      release() {},
      destroy() { conn.destroy(); },
    }),
  };
  const servicePath = path.resolve(__dirname, "../src/services/transaksi/absensiService.js");
  const service = loadWith(servicePath, { "../../config/database": serviceDb });
  const controller = loadWith(path.resolve(__dirname, "../src/controllers/transaksi/absensiController.js"), {
    "../../services/transaksi/absensiService": service,
  });
  // Potongan (halaman Proses Gaji) punya service sendiri; diuji di sini karena
  // memakai tabel fixture yang sama.
  const gajiService = loadWith(path.resolve(__dirname, "../src/services/transaksi/prosesGajiService.js"), {
    "../../config/database": serviceDb,
  });
  const gaji = async () => (await conn.query("SELECT * FROM tgajimingguan ORDER BY gm_kar_nik"))[0];
  const tanggal = "2026-09-25";
  const pull = () => service.tarikWajah({ tanggal, pabKode: "U1" });
  const normal = value => JSON.parse(JSON.stringify(value));
  const target = async () => (await conn.query("SELECT * FROM tabsensi ORDER BY ab_kar_kode"))[0];
  const rowsOfKehadiran = async () => (await target()).map(r => [r.ab_kar_kode, r.ab_hari]);
  const face = (id, date = tanggal, status = "Hadir", jam = "08:00:00", foto = "fixture-photo") =>
    conn.query("INSERT INTO tabsensi_wajah (karyawan_id,tanggal,status,jam_masuk,foto_masuk) VALUES (?,?,?,?,?)", [id, date, status, jam, foto]);
  const reset = async () => {
    queryHook = null;
    for (const table of ["tabsensi", "tabsensi_wajah", "tkaryawan", "tpabrik", "tgajimingguan", "tbagian"]) {
      await conn.query(`DELETE FROM ${table}`); // Hanya fixture TEMPORARY.
    }
    await conn.query("INSERT INTO tpabrik (pab_kode,pab_nama) VALUES ('U1','Unit Test 1'),('U2','Unit Test 2')");
    await conn.query(`INSERT INTO tkaryawan
      (kar_kode,kar_nama,kar_isaktif,kar_pab_kode,foto_wajah,face_descriptor)
      VALUES ('A1','Aktif Satu',1,'U1','foto-aktif','[0.1]'),
             ('A2','Aktif Dua',1,'U1','foto-aktif-2','[0.2]'),
             ('N1','Nonaktif',0,'U1','foto-lama','[0.3]'),
             ('B1','Unit Lain',1,'U2','foto-unit-lain','[0.4]')`);
  };

  await t.test("SEMUA: satu tarikan lintas unit, aktif saja, idempotent, lembur tetap utuh", async () => {
    await reset();
    await face("A1"); await face("B1"); await face("N1"); await face("ORPHAN");
    await conn.query("INSERT INTO tabsensi (ab_kar_kode,ab_tanggal,ab_pab_kode,ab_hari,ab_jamlembur) VALUES ('B1',?,'U2',0.5,3)", [tanggal]);
    const result = await service.tarikWajah({ tanggal, pabKode: "SEMUA" });
    assert.deepEqual(normal(result), { ditemukan: 2, inserted: 1, updated: 1, skipped: 2 });
    assert.deepEqual((await target()).map(r => [r.ab_kar_kode, r.ab_pab_kode, r.ab_hari, r.ab_jamlembur]),
      [["A1", "U1", 1, null], ["B1", "U2", 1, 3]]);
    await service.tarikWajah({ tanggal, pabKode: "SEMUA" });
    assert.equal((await target()).length, 2);
    const items = await service.getKaryawanByUnit("SEMUA", tanggal);
    assert.deepEqual(items.map(i => [i.id, i.unit]), [["A1", "U1"], ["A2", "U1"], ["B1", "U2"]]);
    assert.equal(items.find(i => i.id === "B1").jamlembur, 3);
  });

  await t.test("SEMUA: Save memakai unit master, bukan SEMUA/payload, dan menjaga nonaktif/tanggal lain", async () => {
    await reset();
    await conn.query("INSERT INTO tabsensi (ab_kar_kode,ab_tanggal,ab_pab_kode,ab_hari) VALUES ('N1',?,'U1',1),('A1','2026-09-24','U1',1)", [tanggal]);
    await service.saveAbsensi({ pabKode: "SEMUA", tanggal, items: [
      { id: "A1", kehadiran: 0.5, jamlembur: 3 },
      { id: "B1", kehadiran: 1, jamlembur: 2 },
    ] });
    await service.saveAbsensi({ pabKode: "SEMUA", tanggal, items: [
      { id: "A1", unit: "SALAH", kehadiran: 0.5, jamlembur: null },
      { id: "B1", unit: "SEMUA", kehadiran: null, jamlembur: 2 },
    ] });
    const [rows] = await conn.query("SELECT ab_kar_kode,ab_pab_kode,ab_hari,ab_jamlembur FROM tabsensi WHERE ab_tanggal=? ORDER BY ab_kar_kode", [tanggal]);
    assert.deepEqual(rows.map(r => [r.ab_kar_kode, r.ab_pab_kode, r.ab_hari, r.ab_jamlembur]),
      [["A1", "U1", 0.5, null], ["B1", "U2", null, 2], ["N1", "U1", 1, null]]);
    const reloaded = await service.getKaryawanByUnit("SEMUA", tanggal);
    assert.equal(reloaded.find(i => i.id === "A1").jamlembur, null);
    assert.equal(reloaded.find(i => i.id === "B1").kehadiran, null);
    await assert.rejects(service.saveAbsensi({ pabKode: "SEMUA", tanggal, items: [{ id: "N1", kehadiran: 1 }] }), /tidak aktif/);
    assert.equal((await target()).length, 4, "validasi sebelum DELETE");
    await service.saveAbsensi({ pabKode: "SEMUA", tanggal, items: [
      { id: "A1", kehadiran: null, jamlembur: null }, { id: "B1", kehadiran: "", jamlembur: "" },
    ] });
    assert.equal((await target()).length, 2, "nonaktif dan tanggal lain tidak dihapus");
    const cleared = await service.getKaryawanByUnit("SEMUA", tanggal);
    for (const id of ["A1", "B1"]) {
      assert.equal(cleared.find(i => i.id === id).kehadiran, null);
      assert.equal(cleared.find(i => i.id === id).jamlembur, null);
    }
  });

  await t.test("TEST 1 dan 5: aktif dengan bukti hadir diinsert, kehadiran 1 lembur kosong", async () => {
    await reset(); await face("A1");
    assert.deepEqual(normal(await pull()), { ditemukan: 1, inserted: 1, updated: 0, skipped: 0 });
    const [row] = await target();
    assert.equal(row.ab_kar_kode, "A1"); assert.equal(row.ab_pab_kode, "U1");
    assert.equal(row.ab_hari, 1);
    // Baris hasil tarikan tidak boleh mengisi jam lembur: harus tetap NULL/kosong.
    assert.equal(row.ab_jamlembur, null);
  });
  await t.test("Penarikan ulang tidak mengisi lembur yang masih kosong", async () => {
    await reset(); await face("A1"); await face("A2");
    await pull();
    await conn.query("UPDATE tabsensi SET ab_hari = 0 WHERE ab_kar_kode = 'A1'");
    assert.equal((await pull()).updated, 2);
    const rows = await target();
    assert.deepEqual(rows.map(r => [r.ab_kar_kode, r.ab_hari, r.ab_jamlembur]), [["A1", 1, null], ["A2", 1, null]]);
  });
  await t.test("TEST 2: tanpa wajah pada tanggal terpilih tidak ditandai hadir; unit lain tidak ditarik", async () => {
    await reset(); await face("A1", "2026-09-24"); await face("B1");
    await conn.query("INSERT INTO tabsensi VALUES ('A1',?,0,3,'U1')", [tanggal]);
    assert.equal((await pull()).ditemukan, 0);
    const [row] = await target();
    assert.equal(row.ab_hari, 0); assert.equal(row.ab_jamlembur, 3);
    assert.equal((await target()).length, 1);
  });
  await t.test("TEST 3: nonaktif dengan bukti wajah dilewati", async () => {
    await reset(); await face("N1");
    assert.deepEqual(normal(await pull()), { ditemukan: 0, inserted: 0, updated: 0, skipped: 1 });
    assert.equal((await target()).length, 0);
  });
  await t.test("TEST 4: existing kehadiran 0/lembur 2 menjadi 1/2, kolom unit tidak ditimpa", async () => {
    await reset(); await face("A1");
    await conn.query("INSERT INTO tabsensi VALUES ('A1',?,0,2,'U2')", [tanggal]);
    assert.equal((await pull()).updated, 1);
    const [row] = await target();
    assert.equal(row.ab_hari, 1); assert.equal(row.ab_jamlembur, 2); assert.equal(row.ab_pab_kode, "U2");
  });
  await t.test("TEST 6 dan 7: sumber duplikat dan penarikan dua kali tetap satu row", async () => {
    await reset(); await face("A1"); await face("A1");
    assert.deepEqual(normal(await pull()), { ditemukan: 1, inserted: 1, updated: 0, skipped: 1 });
    const before = normal(await target());
    assert.deepEqual(normal(await pull()), { ditemukan: 1, inserted: 0, updated: 1, skipped: 1 });
    assert.deepEqual(normal(await target()), before);
  });
  await t.test("Orphan, Izin, Alpha, jam/foto kosong dilewati; data valid tetap diproses", async () => {
    await reset(); await face("ORPHAN"); await face("A2", tanggal, "Izin");
    await face("A2", tanggal, "Alpha"); await face("A2", tanggal, "Hadir", null);
    await face("A2", tanggal, "Hadir", "08:00:00", " "); await face("A1");
    assert.deepEqual(normal(await pull()), { ditemukan: 1, inserted: 1, updated: 0, skipped: 5 });
    assert.equal((await target())[0].ab_kar_kode, "A1");
  });
  await t.test("Tanggal/unit invalid dan ID >10 diblokir sebelum penulisan", async () => {
    await reset(); await face("A1");
    for (const date of ["2026-02-30", "2025-02-29", "invalid", "0000-01-01", null]) {
      await assert.rejects(service.tarikWajah({ tanggal: date, pabKode: "U1" }), e => e.statusCode === 400);
    }
    for (const unit of ["", "BAD", "123456", null, {}]) {
      await assert.rejects(service.tarikWajah({ tanggal, pabKode: unit }), e => e.statusCode === 400);
    }
    await conn.query("INSERT INTO tkaryawan (kar_kode,kar_isaktif,kar_pab_kode) VALUES ('12345678901',1,'U1')");
    await face("12345678901");
    await assert.rejects(pull(), e => e.statusCode === 409 && /10 karakter/.test(e.message));
    assert.equal((await target()).length, 0);
  });
  await t.test("Status aktif diperiksa ulang saat upsert", async () => {
    await reset(); await face("A1");
    queryHook = async sql => {
      if (sql.startsWith("INSERT INTO tabsensi")) {
        queryHook = null;
        await conn.query("UPDATE tkaryawan SET kar_isaktif=0 WHERE kar_kode='A1'");
      }
    };
    const summary = await pull();
    assert.equal(summary.inserted + summary.updated, 0); assert.equal(summary.skipped, 1);
    assert.equal((await target()).length, 0);
  });
  await t.test("Database error mengembalikan summary parsial tanpa bocoran SQL; retry aman", async () => {
    await reset(); await face("A1"); await face("A2");
    let writes = 0;
    queryHook = async sql => {
      if (sql.startsWith("INSERT INTO tabsensi") && ++writes === 2) {
        throw Object.assign(new Error("private database detail"), { code: "TEST_DB_ERROR" });
      }
    };
    const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(data) { this.body = data; } };
    await controller.tarikWajah({ body: { pabKode: "U1", tanggal } }, response);
    assert.equal(response.statusCode, 500); assert.equal(response.body.success, false);
    assert.equal(response.body.data.inserted, 1);
    assert.ok(!JSON.stringify(response.body).includes("private database detail"));
    queryHook = null;
    const retry = await pull();
    assert.equal(retry.inserted, 1); assert.equal(retry.updated, 1);
    assert.equal((await target()).length, 2);
  });
  await t.test("Save absensi: lembur kosong disimpan NULL, nilai 0 yang diisi tetap 0", async () => {
    await reset();
    const result = await service.saveAbsensi({
      pabKode: "U1", tanggal,
      items: [
        { id: "A1", kehadiran: 1, jamlembur: null },
        { id: "A2", kehadiran: 1, jamlembur: "" },
        { id: "N1", kehadiran: 1, jamlembur: 0 },
        { id: "B1", kehadiran: 1, jamlembur: 3 },
      ],
    });
    assert.equal(result.savedCount, 4);
    const rows = await target();
    assert.equal(rows.length, 4);
    assert.deepEqual(rows.map(r => [r.ab_kar_kode, r.ab_hari, r.ab_jamlembur, r.ab_pab_kode]), [
      ["A1", 1, null, "U1"],
      ["A2", 1, null, "U1"],
      ["B1", 1, 3, "U1"],
      ["N1", 1, 0, "U1"],
    ]);
  });
  await t.test("Save absensi: 0.5 berarti setengah hari, 0 dan 1 tetap berlaku", async () => {
    await reset();
    const result = await service.saveAbsensi({
      pabKode: "U1", tanggal,
      items: [
        { id: "A1", kehadiran: 0.5, jamlembur: null },
        { id: "A2", kehadiran: 0, jamlembur: 1 },
        { id: "N1", kehadiran: 1, jamlembur: 0 },
      ],
    });
    assert.equal(result.savedCount, 3);
    assert.deepEqual(await rowsOfKehadiran(), [["A1", 0.5], ["A2", 0], ["N1", 1]]);
  });
  await t.test("Save absensi: nilai kehadiran selain 0/0.5/1/2 ditolak tanpa menyentuh data lama", async () => {
    await reset();
    await service.saveAbsensi({ pabKode: "U1", tanggal, items: [{ id: "A1", kehadiran: 1, jamlembur: 2 }] });
    for (const value of [0.3, 1.5, -1, "abc"]) {
      await assert.rejects(
        service.saveAbsensi({ pabKode: "U1", tanggal, items: [{ id: "A2", kehadiran: value, jamlembur: null }] }),
        /Kehadiran hanya boleh diisi 0, 0\.5, 1, atau 2\./,
        `nilai ${value} harus ditolak`,
      );
    }
    // Validasi berjalan sebelum DELETE, jadi baris lama tidak ikut hilang.
    assert.deepEqual(await target().then(r => r.map(x => [x.ab_kar_kode, x.ab_jamlembur])), [["A1", 2]]);
  });
  await t.test("Save absensi: jam lembur saja tersimpan dengan kehadiran NULL", async () => {
    await reset();
    const result = await service.saveAbsensi({
      pabKode: "U1", tanggal,
      items: [
        { id: "A1", kehadiran: null, jamlembur: 3 },
        { id: "A2", kehadiran: "", jamlembur: 0.5 },
        { id: "B1", kehadiran: undefined, jamlembur: 2 }, // Unit lain ikut tersimpan seperti biasa.
        { id: "N1", kehadiran: null, jamlembur: null }, // Tidak ada kolom terisi -> tidak dibuat.
      ],
    });
    assert.equal(result.savedCount, 3, "baris tanpa isian tidak ikut tersimpan");
    const rows = await target();
    assert.deepEqual(rows.map(r => [r.ab_kar_kode, r.ab_hari, r.ab_jamlembur]), [
      ["A1", null, 3],
      ["A2", null, 0.5],
      ["B1", null, 2],
    ]);
    // Kehadiran NULL tidak boleh disamar jadi 0 (tidak hadir).
    assert.ok(rows.every(r => r.ab_hari === null), "kehadiran kosong harus tetap NULL");
  });
  await t.test("Save absensi: mengosongkan semua baris menghapus data lama", async () => {
    await reset();
    await service.saveAbsensi({
      pabKode: "U1", tanggal,
      items: [{ id: "A1", kehadiran: 1, jamlembur: 2 }, { id: "A2", kehadiran: 0.5, jamlembur: 1 }],
    });
    assert.equal((await target()).length, 2);

    // Admin mengosongkan kedua baris lalu menyimpan: ini cara mengembalikan
    // nilai ke NULL, jadi tidak boleh ditolak dan baris lama harus hilang.
    const result = await service.saveAbsensi({
      pabKode: "U1", tanggal,
      items: [{ id: "A1", kehadiran: null, jamlembur: "" }, { id: "A2", kehadiran: "", jamlembur: null }],
    });
    assert.equal(result.savedCount, 0);
    assert.deepEqual(await target(), [], "tidak boleh ada baris tersisa setelah dikosongkan");
  });
  await t.test("Save absensi: mengosongkan sebagian baris hanya menghapus baris itu", async () => {
    await reset();
    await service.saveAbsensi({
      pabKode: "U1", tanggal,
      items: [{ id: "A1", kehadiran: 1, jamlembur: 2 }, { id: "A2", kehadiran: 0.5, jamlembur: 1 }],
    });
    // A1 dikosongkan seluruhnya; A2 kehilangan kehadiran tapi lemburnya tetap.
    await service.saveAbsensi({
      pabKode: "U1", tanggal,
      items: [{ id: "A1", kehadiran: null, jamlembur: null }, { id: "A2", kehadiran: "", jamlembur: 1 }],
    });
    assert.deepEqual(await rowsOfKehadiran(), [["A2", null]]);
    const [row] = await target();
    assert.equal(row.ab_jamlembur, 1, "lembur yang tidak disentuh harus utuh");
  });
  await t.test("Gaji SEMUA: muat lintas unit, Save unit master, kosongkan kembali, validasi sebelum DELETE", async () => {
    await reset();
    const payload = { pabKode: "SEMUA", periode1: tanggal, periode2: tanggal, items: [
      { id: "A1", unit: "SALAH", potongan: 1000 },
      { id: "B1", unit: "SEMUA", potongan: 2000 },
    ] };
    await gajiService.saveProsesGaji(payload);
    assert.deepEqual((await gaji()).map(r => [r.gm_kar_nik, r.gm_pab_kode, r.gm_potongan]),
      [["A1", "U1", 1000], ["B1", "U2", 2000]]);
    const loaded = await gajiService.getProsesGaji("SEMUA", tanggal, tanggal);
    assert.deepEqual(loaded.map(i => [i.id, i.unit, i.potongan]),
      [["A1", "U1", 1000], ["A2", "U1", null], ["B1", "U2", 2000]]);
    assert.deepEqual((await gajiService.getProsesGaji("U2", tanggal, tanggal)).map(i => i.id), ["B1"]);
    await assert.rejects(gajiService.saveProsesGaji({ ...payload, items: [{ id: "N1", potongan: 100 }] }), /tidak aktif/);
    assert.equal((await gaji()).length, 2);
    await gajiService.saveProsesGaji({ ...payload, items: [{ id: "A1", potongan: "" }, { id: "B1", potongan: null }] });
    assert.deepEqual(await gaji(), []);
    assert.ok((await gajiService.getProsesGaji("SEMUA", tanggal, tanggal)).every(i => i.potongan === null));
  });

  await t.test("Save proses gaji: mengosongkan semua potongan menghapus data lama", async () => {
    await reset();
    const periode = { pabKode: "U1", periode1: tanggal, periode2: tanggal };
    await gajiService.saveProsesGaji({
      ...periode,
      items: [
        { id: "A1", gapok: 100, kehadiran: 1, lemburLE2: 2, lemburGT2: 0, potongan: 50000 },
        { id: "A2", gapok: 200, kehadiran: 0.5, lemburLE2: 0, lemburGT2: 0, potongan: 0 },
      ],
    });
    assert.equal((await gaji()).length, 2);

    // Kedua potongan dikosongkan admin: harus bisa disimpan, bukan ditolak.
    const result = await gajiService.saveProsesGaji({
      ...periode,
      items: [
        { id: "A1", gapok: 100, kehadiran: 1, lemburLE2: 2, lemburGT2: 0, potongan: null },
        { id: "A2", gapok: 200, kehadiran: 0.5, lemburLE2: 0, lemburGT2: 0, potongan: "" },
      ],
    });
    assert.equal(result.savedCount, 0);
    assert.deepEqual(await gaji(), [], "tidak boleh ada baris potongan tersisa");
  });
  await t.test("Save proses gaji: potongan negatif tetap ditolak", async () => {
    await reset();
    await gajiService.saveProsesGaji({
      pabKode: "U1", periode1: tanggal, periode2: tanggal,
      items: [{ id: "A1", gapok: 100, kehadiran: 1, lemburLE2: 0, lemburGT2: 0, potongan: 1000 }],
    });
    await assert.rejects(
      gajiService.saveProsesGaji({
        pabKode: "U1", periode1: tanggal, periode2: tanggal,
        items: [{ id: "A1", gapok: 100, kehadiran: 1, lemburLE2: 0, lemburGT2: 0, potongan: -1 }],
      }),
      /harus berupa angka nol atau lebih/,
    );
    // Validasi berjalan sebelum DELETE, jadi baris lama tidak ikut hilang.
    assert.deepEqual((await gaji()).map(r => [r.gm_kar_nik, r.gm_potongan]), [["A1", 1000]]);
  });
  await t.test("Tidak ada sumber adalah response sukses", async () => {
    await reset();
    const response = { json(body) { this.body = body; } };
    await controller.tarikWajah({ body: { pabKode: "U1", tanggal } }, response);
    assert.equal(response.body.success, true);
    assert.match(response.body.message, /Tidak ada data absensi wajah/);
  });
  await t.test("Dua koneksi menarik tanggal sama: request kedua ditahan lock", async () => {
    await reset(); await face("A1");
    const other = await db.getConnection();
    const [[row]] = await conn.query("SELECT CONCAT('pocokan:wajah:', MD5(CONCAT(DATABASE(), ':', ?))) AS name", [tanggal]);
    try {
      await other.query("SELECT GET_LOCK(?,0)", [row.name]);
      await assert.rejects(pull(), e => e.statusCode === 409);
      assert.equal((await target()).length, 0);
    } finally {
      await other.query("SELECT RELEASE_LOCK(?)", [row.name]);
      other.release();
    }
    assert.equal((await pull()).inserted, 1);
  });

  await t.test("TEST 8 dan 9: endpoint wajah aktif saja; history dan biometrik nonaktif bertahan", {
    skip: !process.env.FACE_APP_DIR,
  }, async faceTest => {
    await reset();
    const express = require("express");
    const app = express();
    app.listen = () => {}; // Hanya startup listener/TLS yang dinonaktifkan.
    const expressForTest = Object.assign(() => app, express);
    let beforeFaceWrite;
    const callbackPool = {
      getConnection(callback) { callback(null, { release() {} }); },
      query(sql, params, callback) {
        if (typeof params === "function") { callback = params; params = []; }
        Promise.resolve().then(async () => {
          if (beforeFaceWrite) await beforeFaceWrite(sql);
          return conn.query(sql, params);
        }).then(([rows]) => callback(null, rows), error => callback(error));
      },
    };
    loadWith(path.join(process.env.FACE_APP_DIR, "server.js"), {
      express: expressForTest, mysql2: { createPool: () => callbackPool }, dotenv: { config() {} },
    });
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    faceTest.after(() => new Promise(resolve => server.close(resolve)));
    const request = async (route, method = "GET", body) => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}${route}`, {
        method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
      });
      return { status: response.status, body: await response.json() };
    };
    const today = new Date().toISOString().slice(0, 10);
    await face("N1", today); await face("A1", "2026-09-24");
    for (const route of ["/api/karyawan", "/api/karyawan/descriptors"]) {
      const result = await request(route);
      assert.equal(result.status, 200);
      assert.ok(result.body.some(k => k.id === "A1"));
      assert.ok(result.body.every(k => k.id !== "N1"));
    }
    // Jalankan pengisian dropdown UI asli memakai response endpoint yang diuji.
    const html = fs.readFileSync(path.join(process.env.FACE_APP_DIR, "public/index.html"), "utf8");
    const employeeUiStart = html.indexOf("    let karyawanCache = null;");
    const employeeUiEnd = html.indexOf("    document.addEventListener('shown.bs.tab'", employeeUiStart);
    assert.ok(employeeUiStart >= 0 && employeeUiEnd > employeeUiStart);
    const employeeUi = html.slice(employeeUiStart, employeeUiEnd);
    const elements = Object.fromEntries(["k-existing", "select-karyawan", "table-karyawan", "tab-karyawan"].map(id => [id, {
      value: "", innerHTML: "", classList: { contains: () => true },
    }]));
    const activeEmployees = (await request("/api/karyawan")).body;
    await vm.runInNewContext(employeeUi + "\nloadKaryawan();", {
      document: { getElementById: id => elements[id] }, console, API_BASE: "",
      escHtml: value => String(value ?? ""),
      fetch: async () => ({ ok: true, json: async () => activeEmployees }),
    });
    for (const id of ["k-existing", "select-karyawan"]) {
      assert.ok(elements[id].innerHTML.includes('value="A1"'));
      assert.ok(!elements[id].innerHTML.includes('value="N1"'));
    }
    assert.ok(!html.includes('id="k-nama"'));
    const daily = await request("/api/absensi/hari-ini");
    assert.ok(daily.body.data.every(k => k.karyawan_id !== "N1"));
    assert.equal((await request("/api/karyawan/N1/face", "PUT", { foto_wajah: "new", face_descriptor: [1] })).status, 404);
    for (const aksi of ["masuk", "pulang"]) {
      assert.equal((await request("/api/absensi", "POST", { karyawan_id: "N1", aksi, foto: "new" })).status, 404);
    }
    assert.equal((await request("/api/absensi", "POST", { karyawan_id: "MISSING", aksi: "masuk", foto: "new" })).status, 404);
    assert.equal((await request("/api/karyawan", "POST", { nama: "Master Baru" })).status, 403);
    assert.equal((await conn.query("SELECT COUNT(*) AS total FROM tkaryawan"))[0][0].total, 4);
    assert.equal((await request("/api/karyawan/A1/face", "PUT", { foto_wajah: "new", face_descriptor: [1] })).status, 200);
    assert.equal((await request("/api/absensi", "POST", { karyawan_id: "A1", aksi: "masuk", foto: "new" })).status, 200);
    assert.equal((await request("/api/absensi", "POST", { karyawan_id: "A1", aksi: "pulang", foto: "new" })).status, 200);
    beforeFaceWrite = async sql => {
      if (sql.startsWith("INSERT INTO tabsensi_wajah")) {
        beforeFaceWrite = null;
        await conn.query("UPDATE tkaryawan SET kar_isaktif=0 WHERE kar_kode='A2'");
      }
    };
    assert.equal((await request("/api/absensi", "POST", { karyawan_id: "A2", aksi: "masuk", foto: "new" })).status, 404);
    await conn.query("UPDATE tkaryawan SET kar_isaktif=0 WHERE kar_kode='A1'");
    const history = await request("/api/absensi/laporan");
    assert.equal(history.status, 200);
    assert.ok(history.body.some(row => row.nama === "Nonaktif"));
    assert.ok(history.body.some(row => row.nama === "Aktif Satu"));
    const [[inactive]] = await conn.query("SELECT foto_wajah,face_descriptor FROM tkaryawan WHERE kar_kode='N1'");
    assert.equal(inactive.foto_wajah, "foto-lama"); assert.equal(inactive.face_descriptor, "[0.3]");
    assert.equal((await conn.query("SELECT COUNT(*) AS total FROM tabsensi_wajah WHERE karyawan_id='N1'"))[0][0].total, 1);
  });
});
