import api from "@/api/axios";
import type { Kategori } from "@/api/master/kategoriApi";
import type { JenisBarang } from "@/api/master/jenisBarangApi";
import type { Gudang } from "@/api/master/gudangApi";
import type { Supplier } from "@/api/master/supplierApi";
import type { Rekening } from "@/api/master/rekeningApi";

export interface Barang {
  kode: number;
  nama: string;
  satuan: string;

  ktgKode: string | null;
  ktgNama?: string;
  jenisKode: number | null;
  jenisNama?: string;
  gdgDefault: string | null;
  gdgNama?: string;

  isStok: number;
  isExpired: number;
  stok: number;

  hrgBeli: number;
  hrgJual: number;
  minStok: number;
  maxStok: number;

  dateCreate?: string;
  dateModified?: string;
  userCreate?: string;
  userModified?: string;

  supKode: string | null;
  supNama?: string;
  // Rekening SEKARANG ikut otomatis dari Jenis Barang (tgroup.gr_rek_kode) —
  // read-only di form, tidak lagi bisa dipilih manual.
  rekKode: string | null;
  rekNama?: string;

  isAktif: number;
  discSales: number;
  merk: string | null;
  isProductFocus: number;
  lastCost: number;
  divisi: string | null;
  isBoom: number;
  insentif: number;
  hargaMin: number;
  kodeLama: string | null;
  spesifikasi: string | null;
  jmlKomposisi?: number;
}

export interface BarangKomposisiItem {
  brgKode?: number;
  bahanKode: number | null;
  bahanNama?: string;
  bahanSatuanAsli?: string;
  bahanHrgBeli?: number;
  qty: number;
  satuan: string;
  noUrut?: number;
  spesifikasi?: string | null;
}

export interface BarangBiayaItem {
  kode?: number;
  brgKode?: number;
  nama: string;
  biaya: number;
  noUrut?: number;
}

export interface BarangSaveForm {
  isEdit: boolean;
  kode?: number;
  nama: string;
  satuan: string;
  ktgKode: string | null;
  jenisKode: number | null;
  gdgDefault: string | null;
  isStok: number;
  isExpired: number;
  hrgBeli: number;
  hrgJual: number;
  minStok: number;
  maxStok: number;
  supKode: string | null;
  isAktif: number;
  discSales: number;
  merk: string | null;
  isProductFocus: number;
  lastCost: number;
  divisi: string | null;
  isBoom: number;
  insentif: number;
  hargaMin: number;
  kodeLama: string | null;
  spesifikasi: string | null;
  items?: BarangKomposisiItem[];
  biayaLain?: BarangBiayaItem[];
}

export interface BarangFormRefs {
  kategori: any[];
  jenisBarang: any[];
  gudang: any[];
  supplier: any[];
  rekening: any[];
}

export interface BarangFormRefsResponse {
  success: boolean;
  partial: boolean;
  failed: string[];
  data: BarangFormRefs;
}

export const barangApi = {
  getAll: async (params?: { search?: string; ktgKode?: string; jenisKode?: number; isAktif?: number | "" }): Promise<Barang[]> => {
    const { data } = await api.get("/master/barang", { params });
    return data.data;
  },
  getById: async (kode: number): Promise<Barang> => {
    const { data } = await api.get(`/master/barang/${kode}`);
    return data.data;
  },
  getKomposisi: async (kode: number): Promise<BarangKomposisiItem[]> => {
    const { data } = await api.get(`/master/barang/${kode}/komposisi`);
    return data.data;
  },
  getBiayaLain: async (kode: number): Promise<BarangBiayaItem[]> => {
    const { data } = await api.get(`/master/barang/${kode}/biaya-lain`);
    return data.data;
  },
  getFormRefs: async (only?: string[]): Promise<BarangFormRefsResponse> => {
    const { data } = await api.get("/master/barang/form-refs", {
      params: only ? { only: only.join(",") } : undefined,
    });
    return data;
  },
  // items juga dipakai sbg daftar barang lain (utk cari bahan komposisi)
  searchBarangForKomposisi: async (search: string): Promise<Barang[]> => {
    const { data } = await api.get("/master/barang", { params: { search } });
    return data.data;
  },
  save: async (payload: BarangSaveForm) => {
    const { data } = await api.post("/master/barang/save", payload);
    return data;
  },
  delete: async (kode: number) => {
    const { data } = await api.delete(`/master/barang/${kode}`);
    return data;
  },
};
