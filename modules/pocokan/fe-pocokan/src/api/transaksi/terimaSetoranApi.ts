import api from "@/api/axios";

export interface TerimaSetoranRow {
  Nomor: string;
  TglSetor: string;
  TglVerifikasi: string | null;
  Created: string;
  Verified: string;
}

export interface TerimaSetoranDetailRow {
  Nomor: string;
  Jenis: string;
  NominalSetor: number;
  NominalVerifikasi: number;
}

export interface CabangItem {
  kode: string;
  nama: string;
}

export const terimaSetoranApi = {
  getCabang: async () => {
    const { data } = await api.get("/transaksi/terima-setoran/cabang");
    return data.data as CabangItem[];
  },
  getBrowse: async (startDate: string, endDate: string, cabang: string) => {
    const { data } = await api.get("/transaksi/terima-setoran", {
      params: { startDate, endDate, cabang },
    });
    return data.data as TerimaSetoranRow[];
  },
  getBrowseDetail: async (
    startDate: string,
    endDate: string,
    cabang: string,
  ) => {
    const { data } = await api.get("/transaksi/terima-setoran/detail", {
      params: { startDate, endDate, cabang },
    });
    return data.data as TerimaSetoranDetailRow[];
  },
  getBrowsePendingAll: async () => {
    const { data } = await api.get("/transaksi/terima-setoran/pending-all");
    return data.data as TerimaSetoranRow[];
  },
};
