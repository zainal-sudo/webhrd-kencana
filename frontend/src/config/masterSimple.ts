import type { BrowseColumn } from "@/types";
import type { MasterField } from "@/components/MasterForm.vue";

/**
 * Definisi master sederhana (tabel kode + nama) supaya View dan Form memakai
 * sumber kolom/field yang sama. Sesuai tabel `hrd2` yang dipakai program Delphi.
 */

const kodeDanNama = (label: string): BrowseColumn[] => [
  { key: "Kode", label: "Kode", width: "120px" },
  { key: label, label: "Nama" },
];

const fieldKodeNama = (kodeKey: string, kodeLabel: string, namaKey: string, namaLabel: string): MasterField[] => [
  { key: kodeKey, label: kodeLabel, required: true, isKey: true, span: 1 },
  { key: namaKey, label: namaLabel, required: true, span: 2 },
];

export interface MasterDef {
  title: string;
  endpoint: string;
  listPath: string;
  formPath: string;
  primaryKey: string;
  columns: BrowseColumn[];
  fields: MasterField[];
  perPage?: number;
}

export const MASTER_DEFS: Record<string, MasterDef> = {
  jabatan: {
    title: "Master Jabatan",
    endpoint: "/master/jabatan",
    listPath: "/master/jabatan",
    formPath: "/master/jabatan/form",
    primaryKey: "Kode",
    columns: kodeDanNama("Nama"),
    fields: fieldKodeNama("jab_kode", "Kode Jabatan", "jab_nama", "Nama Jabatan"),
  },

  departemen: {
    title: "Master Departemen",
    endpoint: "/master/departemen",
    listPath: "/master/departemen",
    formPath: "/master/departemen/form",
    primaryKey: "Kode",
    columns: kodeDanNama("Nama"),
    fields: fieldKodeNama("dep_kode", "Kode Departemen", "dep_nama", "Nama Departemen"),
  },

  pabrik: {
    title: "Master Pabrik / Unit",
    endpoint: "/master/pabrik",
    listPath: "/master/pabrik",
    formPath: "/master/pabrik/form",
    primaryKey: "Kode",
    columns: [
      { key: "Kode", label: "Kode", width: "90px" },
      { key: "Nama", label: "Nama Pabrik" },
      { key: "Induk", label: "Pabrik Induk", width: "110px" },
      { key: "Aktif", label: "Aktif", width: "80px" },
      { key: "Face", label: "Face", width: "80px" },
      { key: "IP", label: "IP", width: "130px" },
    ],
    fields: [
      { key: "pab_kode", label: "Kode Pabrik", required: true, isKey: true, placeholder: "otomatis bila kosong" },
      { key: "pab_nama", label: "Nama Pabrik", required: true, span: 2 },
      { key: "pab_pabrik", label: "Kode Pabrik Induk", placeholder: "Kosongkan bila ini induk" },
      { key: "pab_status", label: "Aktif (1/0)", type: "number" },
      { key: "pab_face", label: "Face (Y/N)" },
      { key: "pab_ip", label: "Alamat IP" },
      { key: "pab_path", label: "Path Folder Absensi", span: 2 },
    ],
  },

  hariLibur: {
    title: "Master Hari Libur",
    endpoint: "/master/hari-libur",
    listPath: "/master/hari-libur",
    formPath: "/master/hari-libur/form",
    primaryKey: "Tanggal",
    columns: [
      { key: "Tanggal", label: "Tanggal", type: "date", width: "120px" },
      { key: "Keterangan", label: "Keterangan" },
      { key: "Status", label: "Libur", width: "80px", align: "center" },
      { key: "Status Security", label: "Security", width: "90px", align: "center" },
    ],
    fields: [
      { key: "hl_tanggal", label: "Tanggal", type: "date", required: true, isKey: true },
      { key: "hl_keterangan", label: "Keterangan", required: true, span: 2 },
      { key: "hl_status", label: "Hari Libur (1/0)", type: "number" },
      { key: "hl_status_security", label: "Libur Security (1/0)", type: "number" },
    ],
  },

  jadwal: {
    title: "Jadwal / Shift",
    endpoint: "/master/jadwal",
    listPath: "/master/jadwal",
    formPath: "/master/jadwal/form",
    primaryKey: "Kode",
    columns: [
      { key: "Kode", label: "Kode", width: "80px", align: "center" },
      { key: "Nama Shift", label: "Nama Shift" },
      { key: "Jam Awal", label: "Jam Awal", width: "110px", align: "center" },
      { key: "Jam Akhir", label: "Jam Akhir", width: "110px", align: "center" },
    ],
    fields: [
      { key: "jd_id", label: "Kode", type: "number", isKey: true, placeholder: "otomatis" },
      { key: "jd_nama_shift", label: "Nama Shift", required: true },
      { key: "jd_jamawal", label: "Jam Awal", type: "time", placeholder: "08:00:00" },
      { key: "jd_jamakhir", label: "Jam Akhir", type: "time", placeholder: "17:00:00" },
    ],
  },

  /* ── Tabel referensi (nomor dibuat manual oleh Delphi) ─────────────── */
  statusKaryawan: {
    title: "Status Karyawan",
    endpoint: "/master/status-karyawan",
    listPath: "/master/status-karyawan",
    formPath: "/master/status-karyawan/form",
    primaryKey: "Kode",
    columns: [
      { key: "Kode", label: "Kode", width: "100px", align: "center" },
      { key: "Keterangan", label: "Keterangan" },
    ],
    fields: [
      { key: "sk_id", label: "Kode", type: "number", isKey: true, placeholder: "otomatis" },
      { key: "sk_keterangan", label: "Keterangan", required: true },
    ],
  },

  jenisIjin: {
    title: "Jenis Ijin",
    endpoint: "/master/jenis-ijin",
    listPath: "/master/jenis-ijin",
    formPath: "/master/jenis-ijin/form",
    primaryKey: "Kode",
    columns: [
      { key: "Kode", label: "Kode", width: "100px", align: "center" },
      { key: "Keterangan", label: "Keterangan" },
    ],
    fields: [
      { key: "ji_id", label: "Kode", type: "number", isKey: true, placeholder: "otomatis" },
      { key: "ji_keterangan", label: "Keterangan", required: true },
    ],
  },

  pekerjaan: {
    title: "Pekerjaan",
    endpoint: "/master/pekerjaan",
    listPath: "/master/pekerjaan",
    formPath: "/master/pekerjaan/form",
    primaryKey: "Kode",
    columns: [
      { key: "Kode", label: "Kode", width: "100px", align: "center" },
      { key: "Keterangan", label: "Keterangan" },
    ],
    fields: [
      { key: "pk_id", label: "Kode", type: "number", isKey: true, placeholder: "otomatis" },
      { key: "pk_keterangan", label: "Keterangan", required: true },
    ],
  },

  pendidikan: {
    title: "Pendidikan",
    endpoint: "/master/pendidikan",
    listPath: "/master/pendidikan",
    formPath: "/master/pendidikan/form",
    primaryKey: "Kode",
    columns: [
      { key: "Kode", label: "Kode", width: "100px", align: "center" },
      { key: "Keterangan", label: "Keterangan" },
    ],
    fields: [
      { key: "pd_id", label: "Kode", type: "number", isKey: true, placeholder: "otomatis" },
      { key: "pd_keterangan", label: "Keterangan", required: true },
    ],
  },

  keteranganMutasi: {
    title: "Keterangan Mutasi",
    endpoint: "/master/keterangan-mutasi",
    listPath: "/master/keterangan-mutasi",
    formPath: "/master/keterangan-mutasi/form",
    primaryKey: "Kode",
    columns: [
      { key: "Kode", label: "Kode", width: "100px", align: "center" },
      { key: "Keterangan", label: "Keterangan" },
    ],
    fields: [
      { key: "km_id", label: "Kode", type: "number", isKey: true, placeholder: "otomatis" },
      { key: "km_keterangan", label: "Keterangan", required: true },
    ],
  },
};

/** Opsi dropdown untuk form karyawan & transaksi. */
export const OPSI_STATUS_KL = [
  { label: "Belum Kawin", value: "Belum Kawin" },
  { label: "Kawin", value: "Kawin" },
  { label: "Cerai Hidup", value: "Cerai Hidup" },
  { label: "Cerai Mati", value: "Cerai Mati" },
];

export const OPSI_WARGA_NEGARA = [
  { label: "WNI", value: "WNI" },
  { label: "WNA", value: "WNA" },
];

export const OPSI_GOLONGAN_DARAH = ["A", "B", "AB", "O"].map((v) => ({ label: v, value: v }));

export const OPSI_AGAMA = ["Islam", "Kristen", "Katolik", "Hindu", "Buddha", "Konghucu"].map((v) => ({
  label: v,
  value: v,
}));

export const OPSI_STATUS_TINGGAL = ["Kota", "Desa"].map((v) => ({ label: v, value: v }));

export const OPSI_JENKEL = [
  { label: "Laki-Laki", value: 1 },
  { label: "Perempuan", value: 2 },
];

export const OPSI_BPJS = [
  { label: "Belum Ada", value: 0 },
  { label: "Perusahaan", value: 1 },
  { label: "Mandiri", value: 2 },
  { label: "Jamberapa / JHT", value: 3 },
  { label: "Perusahaan Lain", value: 4 },
  { label: "Nonaktif Perusahaan", value: 5 },
];

export const OPSI_SISTEM_GAJI = ["Bulanan", "Harian", "Mingguan"].map((v) => ({ label: v, value: v }));
