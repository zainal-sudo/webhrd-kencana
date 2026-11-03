import api from "@/api/axios";

export interface BkmRow {
  Nomor: string;
  Tipe: string;
  Account: string;
  Tanggal: string;
  DiterimaDari: string;
  Nota: string;
  Keterangan: string;
  Nominal: number;
  Kasbon: string;
  Closed: string;
}

export interface BkmDetailRow {
  Nomor: string;
  No: number;
  Uraian: string;
  Nominal: number;
  Account: string;
  NamaAccount: string;
  DetailCC: string;
}

export const bkmApi = {
  getBrowse: async (startDate: string, endDate: string, cabang?: string) => {
    const { data } = await api.get("/transaksi/bkm", {
      params: { startDate, endDate, cabang },
    });
    return data.data as BkmRow[];
  },
  getBrowseDetail: async (
    startDate: string,
    endDate: string,
    cabang?: string,
  ) => {
    const { data } = await api.get("/transaksi/bkm/detail", {
      params: { startDate, endDate, cabang },
    });
    return data.data as BkmDetailRow[];
  },
  delete: async (nomor: string) => {
    const { data } = await api.delete(
      `/transaksi/bkm/${encodeURIComponent(nomor)}`,
    );
    return data;
  },
};
