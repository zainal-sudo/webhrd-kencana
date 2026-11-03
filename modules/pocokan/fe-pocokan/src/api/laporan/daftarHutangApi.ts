import api from "@/api/axios";

export interface DaftarHutangRow {
  Nomor: string;
  Tanggal: string;
  JatuhTempo: string;
  SupKode: string;
  Nama: string;
  Total: number;
  Voucher: number;
  Bayar: number;
}

export interface DaftarHutangDetail {
  Nomor: string; // = bpb_nomor (link ke master)
  NomorVoucher: string;
  TanggalVoucher: string;
  Total: number;
  StatusRealisasi: number;
}

export const daftarHutangApi = {
  getBrowse: async (params: { startDate: string; endDate: string }) => {
    const { data } = await api.get("/laporan/daftar-hutang", { params });
    return data.data as DaftarHutangRow[];
  },

  getDetail: async (params: { startDate: string; endDate: string }) => {
    const { data } = await api.get("/laporan/daftar-hutang/detail", { params });
    return data.data as DaftarHutangDetail[];
  },
};
