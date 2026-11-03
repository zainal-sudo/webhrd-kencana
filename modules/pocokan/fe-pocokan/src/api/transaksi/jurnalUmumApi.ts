import api from "@/api/axios";

export interface JurnalUmumRow {
  Nomor: string;
  Tipe: string;
  Tanggal: string;
  Debet: number;
  Kredit: number;
  Keterangan: string;
  Closed: string;
}

export interface JurnalUmumDetailRow {
  Nomor: string;
  Account: string;
  NamaAccount: string;
  DetailCC: string;
  Debet: number;
  Kredit: number;
  Uraian: string;
}

export const jurnalUmumApi = {
  getBrowse: async (startDate: string, endDate: string) => {
    const { data } = await api.get("/transaksi/jurnal-umum", {
      params: { startDate, endDate },
    });
    return data.data as JurnalUmumRow[];
  },
  getBrowseDetail: async (startDate: string, endDate: string) => {
    const { data } = await api.get("/transaksi/jurnal-umum/detail", {
      params: { startDate, endDate },
    });
    return data.data as JurnalUmumDetailRow[];
  },
  delete: async (nomor: string) => {
    const { data } = await api.delete(
      `/transaksi/jurnal-umum/${encodeURIComponent(nomor)}`,
    );
    return data;
  },
};
