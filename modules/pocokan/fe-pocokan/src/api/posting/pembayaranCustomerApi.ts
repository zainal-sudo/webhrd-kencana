import api from "@/api/axios";

export interface PembayaranCustomerRow {
  Nomor: string;
  Tipe: string;
  Account: string;
  NamaAccount: string;
  Rekening: string;
  Tanggal: string;
  DiterimaDari: string;
  Nota: string;
  Keterangan: string;
  Nominal: number;
  Cabang: string;
  Closed: string;
}

export interface PembayaranCustomerDetailRow {
  Nomor: string;
  No: number;
  Uraian: string;
  Nominal: number;
  Account: string;
  NamaAccount: string;
  DetailCC: string;
}

export const pembayaranCustomerApi = {
  getBrowse: async (startDate: string, endDate: string) => {
    const { data } = await api.get("/posting/pembayaran-customer", {
      params: { startDate, endDate },
    });
    return data.data as PembayaranCustomerRow[];
  },
  getBrowseDetail: async (startDate: string, endDate: string) => {
    const { data } = await api.get("/posting/pembayaran-customer/detail", {
      params: { startDate, endDate },
    });
    return data.data as PembayaranCustomerDetailRow[];
  },
  delete: async (nomor: string) => {
    const { data } = await api.delete(
      `/posting/pembayaran-customer/${encodeURIComponent(nomor)}`,
    );
    return data;
  },
};
