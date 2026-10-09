/**
 * Pemetaan tabel `tmenu` (hrd2) -> rute & kelompok menu di aplikasi web.
 *
 * `men_nama` pada database berisi nama form/class Delphi (mis. `frmKaryawan`),
 * persis yang dipakai fungsi `cekview/cekinsert/cekedit/cekdelete` pada
 * `D:\program\hrd\bantu\Ulib.pas`. Sidebar hanya menampilkan menu yang
 * `thakuser` miliki user.
 *
 * `ready: false` -> modul belum diimplementasikan, disembunyikan dari sidebar
 * supaya tidak ada tautan mati. Ubah menjadi `true` setelah view & API selesai.
 */

export interface MenuDef {
  path: string;
  label: string;
  icon: string;
  ready: boolean;
}

export interface GrupDef {
  key: string;
  label: string;
  icon: string;
  order: number;
}

export const GRUP: Record<string, GrupDef> = {
  master: { key: "master", label: "Master", icon: "inventory_2", order: 1 },
  transaksi: { key: "transaksi", label: "Transaksi", icon: "swap_horiz", order: 2 },
  gaji: { key: "gaji", label: "Penggajian", icon: "payments", order: 3 },
  laporan: { key: "laporan", label: "Laporan", icon: "assessment", order: 4 },
  setting: { key: "setting", label: "Otorisasi", icon: "admin_panel_settings", order: 5 },
};

/** Kunci = `tmenu.men_nama`. `grup` menentukan sidebar. */
export const MENU_MAP: Record<string, MenuDef & { grup: keyof typeof GRUP }> = {
  /* ── Master ── */
  frmKaryawan: { grup: "master", path: "/master/karyawan", label: "Master Karyawan", icon: "badge", ready: true },
  frmJabatan: { grup: "master", path: "/master/jabatan", label: "Master Jabatan", icon: "engineering", ready: true },
  frmDepartemen: { grup: "master", path: "/master/departemen", label: "Master Departemen", icon: "account_tree", ready: true },
  frmPabrik: { grup: "master", path: "/master/pabrik", label: "Master Pabrik / Unit", icon: "factory", ready: true },
  frmHariLibur: { grup: "master", path: "/master/hari-libur", label: "Master Hari Libur", icon: "event_busy", ready: true },
  frmJadwal: { grup: "master", path: "/master/jadwal", label: "Jadwal / Shift", icon: "schedule", ready: true },
  frmPerusahaan: { grup: "master", path: "/master/perusahaan", label: "Identitas Perusahaan", icon: "apartment", ready: true },
  frmHistoryKaryawan: { grup: "laporan", path: "/master/history-karyawan", label: "History Karyawan", icon: "history", ready: true },

  /* ── Setting / Otorisasi ── */
  frmUser: { grup: "setting", path: "/setting/user", label: "Master User", icon: "manage_accounts", ready: true },

  /* ── Absensi ── */
  frmAbsensi: { grup: "transaksi", path: "/absensi/browse", label: "Absensi", icon: "fact_check", ready: true },
  frmImportAbsensi: { grup: "transaksi", path: "/absensi/import", label: "Import Absensi", icon: "upload_file", ready: true },

  /* ── Transaksi ── */
  frmPinjam: { grup: "transaksi", path: "/transaksi/pinjaman", label: "Pinjaman", icon: "account_balance", ready: true },
  frmBayar: { grup: "transaksi", path: "/transaksi/pinjaman/pelunasan", label: "Proses Pelunasan Pinjaman", icon: "payments", ready: true },
  frmIjin: { grup: "transaksi", path: "/transaksi/ijin", label: "Ijin", icon: "event_available", ready: true },
  frmIjin2: { grup: "transaksi", path: "/transaksi/ijin-v2/form", label: "Ijin Kolektif (V2)", icon: "group_add", ready: false },
  frmKeluar: { grup: "transaksi", path: "/transaksi/keluar", label: "Karyawan Keluar", icon: "logout", ready: true },
  frmLembur: { grup: "transaksi", path: "/transaksi/lembur", label: "Lembur", icon: "overtime", ready: true },
  frmLembur2: { grup: "transaksi", path: "/transaksi/lembur-v2/form", label: "Lembur Per NIK (V2)", icon: "person_add", ready: false },
  frmSP: { grup: "transaksi", path: "/transaksi/sp", label: "SP / SPL", icon: "description", ready: true },
  frmMutasiKaryawan: { grup: "transaksi", path: "/transaksi/mutasi", label: "Mutasi Karyawan", icon: "swap_vert", ready: true },
  frmPerubahanStatus: { grup: "transaksi", path: "/transaksi/perubahan-status", label: "Perubahan Status", icon: "published_with_changes", ready: true },
  frmRekruitmen: { grup: "transaksi", path: "/transaksi/bank-pelamar", label: "Bank Pelamar", icon: "contact_page", ready: false },
  frmCalonKaryawan: { grup: "transaksi", path: "/transaksi/rekrutmen", label: "Rekrutmen", icon: "person_add", ready: false },
  frmPermintaanKaryawan: { grup: "transaksi", path: "/transaksi/permintaan-karyawan", label: "Permintaan Karyawan", icon: "request_quote", ready: true },
  frmRiilPermintaanKaryawan: { grup: "transaksi", path: "/transaksi/realisasi-permintaan", label: "Realisasi Permintaan", icon: "task_alt", ready: false },
  frmPenilaian3Bulan: { grup: "transaksi", path: "/transaksi/penilaian-3-bulan", label: "Penilaian 3 Bulanan", icon: "reviews", ready: true },

  /* ── Laporan ── */
  frmLapAbsensi: { grup: "laporan", path: "/laporan/absensi", label: "Laporan Absensi", icon: "summarize", ready: true },
  frmLapTidakMasuk: { grup: "laporan", path: "/laporan/tidak-masuk", label: "Laporan Tidak Masuk", icon: "event_busy", ready: true },
  frmLapKeterlambatan: { grup: "laporan", path: "/laporan/keterlambatan", label: "Laporan Keterlambatan", icon: "running_with_errors", ready: true },
  frmLapPulangdulu: { grup: "laporan", path: "/laporan/pulang-dulu", label: "Laporan Pulang Mendahului", icon: "logout", ready: true },
  frmLapTidakKeluar: { grup: "laporan", path: "/laporan/tidak-keluar", label: "Absen Tidak Lengkap", icon: "no_accounts", ready: true },
  frmLapTanpaIjin: { grup: "laporan", path: "/laporan/tanpa-ijin", label: "Laporan Tanpa Ijin", icon: "rule", ready: true },
  frmLapStHariTanpaIjin: { grup: "laporan", path: "/laporan/setengah-hari-tanpa-ijin", label: "Setengah Hari Tanpa Ijin", icon: "rule_folder", ready: true },
  frmLapLembur: { grup: "laporan", path: "/laporan/lembur", label: "Laporan Lembur", icon: "more_time", ready: true },
  frmLapLemburTanpaSPL: { grup: "laporan", path: "/laporan/lembur-tanpa-spl", label: "Lembur Tanpa SPL", icon: "report_problem", ready: true },
  frmLapDetailLembur: { grup: "laporan", path: "/laporan/detail-lembur", label: "Detail Lembur", icon: "receipt_long", ready: true },
  frmLapLemburTahunan: { grup: "laporan", path: "/laporan/lembur-tahunan", label: "Lembur Tahunan", icon: "calendar_month", ready: false },
  frmLapLemburHariLibur: { grup: "laporan", path: "/laporan/lembur-hari-libur", label: "Lembur Hari Libur", icon: "weekend", ready: true },
  frmLapAbsensiMingguan: { grup: "laporan", path: "/laporan/absensi-mingguan", label: "Absensi Mingguan", icon: "date_range", ready: false },
  frmLapAbsensiPeriode: { grup: "laporan", path: "/laporan/absensi-periode", label: "Absensi Periode", icon: "date_range", ready: true },
  frmLapKeterlambatanBagian: { grup: "laporan", path: "/laporan/keterlambatan-bagian", label: "Keterlambatan per Bagian", icon: "groups", ready: false },
  frmTidakMasukBagian: { grup: "laporan", path: "/laporan/tidak-masuk-bagian", label: "Tidak Masuk per Bagian", icon: "groups", ready: false },
  frmLapKedisiplinan: { grup: "laporan", path: "/laporan/kedisiplinan", label: "Laporan Kedisiplinan", icon: "gavel", ready: false },
  frmLapHasilpekerjaan: { grup: "laporan", path: "/laporan/hasil-pekerjaan", label: "Hasil Pekerjaan", icon: "workspace_premium", ready: false },
  frmLapProduktivitas: { grup: "laporan", path: "/laporan/produktivitas", label: "Produktivitas", icon: "trending_up", ready: false },
  frmLapAkhirTahun: { grup: "laporan", path: "/laporan/akhir-tahun", label: "Laporan Akhir Tahun", icon: "celebration", ready: false },

  /* ── Penggajian ── */
  frmSettingGaji: { grup: "gaji", path: "/gaji/setting", label: "Setting Gaji", icon: "monetization_on", ready: true },
  frmProsesGaji: { grup: "gaji", path: "/gaji/proses", label: "Proses Gaji", icon: "payments", ready: true },
};

/** Modul lain (penggajian lanjutan, pinjaman, dll.) belum dibuat. */
export const MENU_DIABAIKAN = [
  "frmRekapGaji",
  "frmSettingBudgetMPP",
  "frmprosesMPPBulanan",
  "frmProsesSMBulanan",
  "frmGajiHarianperBagian",
  "frmLapSaldo",
];

export function definisiMenu(menNama: string): (MenuDef & { grup: keyof typeof GRUP }) | undefined {
  return MENU_MAP[menNama];
}
