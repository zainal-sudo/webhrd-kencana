import api from "@/api/axios";

export interface BbmRow {
  Nomor: string;
  Tipe: string;
  Account: string;
  Rekening: string;
  Tanggal: string;
  DiterimaDari: string;
  Nota: string;
  Keterangan: string;
  Nominal: number;
  Kasbon: string;
  Closed: string;
}

export interface BbmDetailRow {
  Nomor: string;
  No: number;
  Uraian: string;
  Nominal: number;
  Account: string;
  NamaAccount: string;
  DetailCC: string;
}

export const bbmApi = {
  getBrowse: async (startDate: string, endDate: string, cabang?: string) => {
    const { data } = await api.get("/transaksi/bbm", {
      params: { startDate, endDate, cabang },
    });
    return data.data as BbmRow[];
  },
  getBrowseDetail: async (
    startDate: string,
    endDate: string,
    cabang?: string,
  ) => {
    const { data } = await api.get("/transaksi/bbm/detail", {
      params: { startDate, endDate, cabang },
    });
    return data.data as BbmDetailRow[];
  },
  delete: async (nomor: string) => {
    const { data } = await api.delete(
      `/transaksi/bbm/${encodeURIComponent(nomor)}`,
    );
    return data;
  },
};
