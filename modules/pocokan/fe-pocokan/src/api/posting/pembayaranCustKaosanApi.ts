import api from "@/api/axios";

export interface PembayaranCustKaosanRow {
  Nomor: string;
  Tipe: string;
  Account: string;
  NamaAccount: string;
  Rekening: string;
  Tanggal: string;
  TglTransfer: string | null;
  DiterimaDari: string;
  Nota: string;
  Keterangan: string;
  Nominal: number;
  Cabang: string;
  Customer: string;
  Trs: string;
  Closed: string;
}

export interface PembayaranCustKaosanDetailRow {
  Nomor: string;
  No: number;
  Uraian: string;
  Nominal: number;
  Account: string;
  NamaAccount: string;
  DetailCC: string;
}

export const pembayaranCustKaosanApi = {
  getBrowse: async (startDate: string, endDate: string) => {
    const { data } = await api.get("/posting/pembayaran-cust-kaosan", {
      params: { startDate, endDate },
    });
    return data.data as PembayaranCustKaosanRow[];
  },
  getBrowseDetail: async (startDate: string, endDate: string) => {
    const { data } = await api.get("/posting/pembayaran-cust-kaosan/detail", {
      params: { startDate, endDate },
    });
    return data.data as PembayaranCustKaosanDetailRow[];
  },
  delete: async (nomor: string) => {
    const { data } = await api.delete(
      `/posting/pembayaran-cust-kaosan/${encodeURIComponent(nomor)}`,
    );
    return data;
  },
};
