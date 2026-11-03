import api from "@/api/axios";

export interface BbkRow {
  Nomor: string;
  Tipe: string;
  Account: string;
  Tanggal: string;
  Penerima: string;
  Nota: string;
  Keterangan: string;
  Nominal: number;
  Link: string;
  Closed: string;
}

export interface BbkDetailRow {
  Nomor: string;
  No: number;
  Uraian: string;
  Nominal: number;
  Account: string;
  NamaAccount: string;
  DetailCC: string;
}

export const bbkApi = {
  getBrowse: async (startDate: string, endDate: string, cabang?: string) => {
    const { data } = await api.get("/transaksi/bbk", {
      params: { startDate, endDate, cabang },
    });
    return data.data as BbkRow[];
  },
  getBrowseDetail: async (
    startDate: string,
    endDate: string,
    cabang?: string,
  ) => {
    const { data } = await api.get("/transaksi/bbk/detail", {
      params: { startDate, endDate, cabang },
    });
    return data.data as BbkDetailRow[];
  },
  delete: async (nomor: string) => {
    const { data } = await api.delete(
      `/transaksi/bbk/${encodeURIComponent(nomor)}`,
    );
    return data;
  },
};
