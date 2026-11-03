import api from "@/api/axios";

export interface BkkRow {
  Nomor: string;
  Tipe: string;
  Account: string;
  Tanggal: string;
  Penerima: string;
  Nota: string;
  Keterangan: string;
  Nominal: number;
  Kasbon: string;
  Closed: string;
}

export interface BkkDetailRow {
  Nomor: string;
  No: number;
  Uraian: string;
  Nominal: number;
  Account: string;
  NamaAccount: string;
  DetailCC: string;
}

export const bkkApi = {
  getBrowse: async (startDate: string, endDate: string, cabang?: string) => {
    const { data } = await api.get("/transaksi/bkk", {
      params: { startDate, endDate, cabang },
    });
    return data.data as BkkRow[];
  },

  getBrowseDetail: async (
    startDate: string,
    endDate: string,
    cabang?: string,
  ) => {
    const { data } = await api.get("/transaksi/bkk/detail", {
      params: { startDate, endDate, cabang },
    });
    return data.data as BkkDetailRow[];
  },

  delete: async (nomor: string) => {
    const { data } = await api.delete(
      `/transaksi/bkk/${encodeURIComponent(nomor)}`,
    );
    return data;
  },
};
