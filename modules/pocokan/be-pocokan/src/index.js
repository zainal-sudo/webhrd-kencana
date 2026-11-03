const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();
const systemCtrl = require("./controllers/systemController");

// â”€â”€ Core Routes â”€â”€
const authRoutes = require("./routes/authRoutes");
const lookupRoutes = require("./routes/lookupRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const masterUserRoutes = require("./routes/tools/masterUserRoutes");
const masterUserFormRoutes = require("./routes/tools/masterUserFormRoutes");

// â”€â”€ Master Routes â”€â”€
const supplierRoutes = require("./routes/master/supplierRoutes");
const kategoriRoutes = require("./routes/master/kategoriRoutes");
const barangRoutes = require("./routes/master/barangRoutes");
const customerRoutes = require("./routes/master/customerRoutes");
const gudangRoutes = require("./routes/master/gudangRoutes");
const kelompokRoutes = require("./routes/master/kelompokRoutes");
const rekeningRoutes = require("./routes/master/rekeningRoutes");
const jenisBarangRoutes = require("./routes/master/jenisBarangRoutes");
const prosesRoutes = require("./routes/master/prosesRoutes");
const cabangRoutes = require("./routes/master/cabangRoutes");
const unitRoutes = require("./routes/master/unitRoutes");

// â”€â”€ Transaksi Routes â”€â”€
const poRoutes = require("./routes/transaksi/poRoutes");
const poFormRoutes = require("./routes/transaksi/poFormRoutes");
const bpbRoutes = require("./routes/transaksi/bpbRoutes");
const bpbFormRoutes = require("./routes/transaksi/bpbFormRoutes");
const returRoutes = require("./routes/transaksi/returRoutes");
const returFormRoutes = require("./routes/transaksi/returFormRoutes");
const bayarSupplierRoutes = require("./routes/transaksi/bayarSupplierRoutes");
const penjualanRoutes = require("./routes/transaksi/penjualanRoutes");
const penjualanFormRoutes = require("./routes/transaksi/penjualanFormRoutes");

const stbjRoutes = require("./routes/transaksi/stbjRoutes");
const stbjFormRoutes = require("./routes/transaksi/stbjFormRoutes");
const mutasiRoutes = require("./routes/transaksi/mutasiRoutes");
const mutasiFormRoutes = require("./routes/transaksi/mutasiFormRoutes");


const invRoutes = require("./routes/transaksi/invRoutes");
const invFormRoutes = require("./routes/transaksi/invFormRoutes");

const jurnalUmumRoutes = require("./routes/transaksi/jurnalUmumRoutes");
const jurnalUmumFormRoutes = require("./routes/transaksi/jurnalUmumFormRoutes");
const penyesuaianStokRoutes = require("./routes/transaksi/penyesuaianStokRoutes");
const penyesuaianStokFormRoutes = require("./routes/transaksi/penyesuaianStokFormRoutes");

// â”€â”€ Posting Routes â”€â”€
const pembayaranCustomerRoutes = require("./routes/posting/pembayaranCustomerRoutes");
const pembayaranCustomerFormRoutes = require("./routes/posting/pembayaranCustomerFormRoutes");

// â”€â”€ Laporan Routes â”€â”€
const listJurnalRoutes = require("./routes/laporan/listJurnalRoutes");
const persediaanRoutes = require("./routes/laporan/persediaanRoutes");


const app = express();

/* Saat berjalan standalone (node src/index.js) app memasang middleware & port
   sendiri. Saat di-mount sebagai subapp dari HRIS backend (lihat mount di
   webhrd-kencana/backend/app.js), middleware global HRIS (json/cors) sudah
   berjalan lebih dulu, sehingga CORS di sini dilewati â€” kalau jalan ganda,
   header Access-Control bisa terduplikasi dan ditolak browser. */
const standalone = require.main === module;

if (standalone) {
  // â”€â”€ CORS â”€â”€
  app.use(
    cors({
      origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        callback(null, origin); // echo back origin agar credentials bisa jalan
      },
      credentials: true,
    }),
  );
}

app.use(express.json()); // no-op bila HRIS sudah memasang parser yang sama (req sudah ter-parse)
app.use(
  "/images",
  express.static(
    process.env.POCOKAN_IMAGES_DIR || path.join(process.cwd(), "public/images"),
  ),
);

// Endpoint untuk cek versi backend
app.get("/system/info", systemCtrl.getSystemInfo);

// â”€â”€ Core Routes â”€â”€
app.use("/auth", authRoutes);
app.use("/lookups", lookupRoutes);
app.use("/dashboard", dashboardRoutes);
app.use("/tools/master-user", masterUserRoutes);
app.use("/tools/master-user/form", masterUserFormRoutes);


app.use("/master/supplier", supplierRoutes);
app.use("/master/kategori", kategoriRoutes);
app.use("/master/barang", barangRoutes);
app.use("/master/customer", customerRoutes);
app.use("/master/gudang", gudangRoutes);
app.use("/master/kelompok", kelompokRoutes);
app.use("/master/rekening", rekeningRoutes);
app.use("/master/jenis-barang", jenisBarangRoutes);
app.use("/master/proses", prosesRoutes);
app.use("/master/cabang", cabangRoutes);
app.use("/master/unit", unitRoutes);
app.use("/master/bagian", require("./routes/master/bagianRoutes"));
app.use("/master/hari-libur", require("./routes/master/hariLiburRoutes"));
app.use("/master/karyawan", require("./routes/master/karyawanRoutes"));
// â”€â”€ Tambahan â”€â”€
app.use("/master/barang-jadi", require("./routes/master/barangJadiRoutes"));

// â”€â”€ Transaksi Routes â”€â”€
app.use("/transaksi/po", poRoutes);
app.use("/transaksi/po/form", poFormRoutes);
app.use("/transaksi/bpb", bpbRoutes);
app.use("/transaksi/bpb/form", bpbFormRoutes);
app.use("/transaksi/retur", returRoutes);
app.use("/transaksi/retur/form", returFormRoutes);
app.use("/transaksi/bayarSupplier", bayarSupplierRoutes);
app.use("/transaksi/penjualan", penjualanRoutes);
app.use("/transaksi/penjualan/form", penjualanFormRoutes);

app.use("/transaksi/invoice", invRoutes);
app.use("/transaksi/invoice/form", invFormRoutes);

// Tambahkan di bagian app.use(...), persis di bawah baris po:
app.use("/transaksi/stbj", stbjRoutes);
app.use("/transaksi/stbj/form", stbjFormRoutes);

app.use("/transaksi/mutasi", mutasiRoutes);
app.use("/transaksi/mutasi/form", mutasiFormRoutes);
app.use("/transaksi/absensi", require("./routes/transaksi/absensiRoutes"));
app.use("/transaksi/proses-gaji", require("./routes/transaksi/prosesGajiRoutes"));

app.use("/transaksi/jurnal-umum", jurnalUmumRoutes);
app.use("/transaksi/jurnal-umum/form", jurnalUmumFormRoutes);
app.use("/transaksi/penyesuaian-stok", penyesuaianStokRoutes);
app.use("/transaksi/penyesuaian-stok/form", penyesuaianStokFormRoutes);

// â”€â”€ Posting Routes â”€â”€
app.use("/posting/pembayaran-customer", pembayaranCustomerRoutes);
app.use("/posting/pembayaran-customer/form", pembayaranCustomerFormRoutes);

// â”€â”€ Laporan Routes â”€â”€
app.use("/laporan/list-jurnal", listJurnalRoutes);
app.use("/laporan/persediaan", persediaanRoutes);
app.use(
  "/laporan/lap-gaji",
  require("./routes/laporan/lapGajiRoutes")
);
app.use(
  "/laporan/lap-absensi",
  require("./routes/laporan/lapAbsensiRoutes")
);

// â”€â”€ Health check â”€â”€
app.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "Finance Backend is running",
    timestamp: new Date(),
  });
});

/* Export app agar bisa di-mount dari backend HRIS:
     import pocokanApp from './modules/pocokan/be-pocokan/src/index.js'
     app.use('/pocokan-api', pocokanApp)  // URL: /pocokan-api/auth/me, /pocokan-api/master/... dst.
   Standalone masih berjalan normal: kalau dieksekusi langsung, masuk cabang
   require.main === module di atas dan listen di bawah. */
module.exports = app;

if (standalone) {
  const PORT = process.env.PORT || 3299;
  app.listen(PORT, () => {
    console.log(`ðŸš€ Server Finance running on port ${PORT}`);
  });
}
