import api from "@/api/axios";

export interface MutasiOutFormDetail {
  NoPermintaan: string;
  Kode: string;
  Nama: string;
  Satuan: string;
  Spesifikasi: string;
  Stok: number;
  StokBelumDiterima: number;
  StokReal: number;
  Jumlah: number;
}

export interface MutasiOutFormData {
  Nomor: string;
  Jenis: string;
  Tanggal: string;
  CabangAsal: string;
  CabangTujuan: string;
  Bagian: string;
  Keterangan: string;
  NoTerima: string;
  StatusEdit: string;
  isTutupBuku: boolean;
  Detail: MutasiOutFormDetail[];
}

export interface BarangGarmenItem {
  Kode: string;
  Nama: string;
  Satuan: string;
  Stok: number;
}

export interface PermintaanFinanceItem {
  Jenis: string;
  NoPermintaan: string;
  Tanggal: string;
  Keterangan: string;
  Cab: string;
  Peminta: string;
}

export const mutasiOutFormApi = {
  getDetail: async (nomor: string) => {
    const { data } = await api.get(
      `/transaksi/mutasi-out/form/${encodeURIComponent(nomor)}`,
    );
    return data.data as MutasiOutFormData;
  },

  searchBarang: async (params: {
    jenis: string;
    bagian: string;
    cabang: string;
    search?: string;
  }) => {
    const { data } = await api.get("/transaksi/mutasi-out/form/search-barang", {
      params,
    });
    return data.data as BarangGarmenItem[];
  },

  searchPermintaanFinance: async (params: {
    jenis: string;
    cabangTujuan: string;
    search?: string;
  }) => {
    const { data } = await api.get(
      "/transaksi/mutasi-out/form/search-permintaan-finance",
      { params },
    );
    return data.data as PermintaanFinanceItem[];
  },

  getDetailPermintaanFinance: async (params: {
    noPermintaan: string;
    cabangAsal: string;
    nomorMso?: string;
  }) => {
    const { data } = await api.get(
      "/transaksi/mutasi-out/form/detail-permintaan-finance",
      { params },
    );
    return data.data as MutasiOutFormDetail[];
  },

  save: async (payload: { isNewMode: boolean; data: MutasiOutFormData }) => {
    const { data } = await api.post("/transaksi/mutasi-out/form", payload);
    return data as { success: boolean; message: string; nomor: string };
  },
};
