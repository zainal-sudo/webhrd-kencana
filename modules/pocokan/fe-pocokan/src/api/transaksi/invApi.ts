import api from "@/api/axios";

export const invApi = {
  getBrowse: async (startDate: string, endDate: string) => {
    const { data } = await api.get("/transaksi/invoice", { params: { startDate, endDate } });
    return data.data;
  },
  getDetail: async (nomor: string) => {
    const { data } = await api.get(`/transaksi/invoice/detail/${encodeURIComponent(nomor)}`);
    return data.data;
  },
  delete: async (nomor: string) => {
    const { data } = await api.delete(`/transaksi/invoice/${encodeURIComponent(nomor)}`);
    return data;
  },
  getPrintData: async (nomor: string): Promise<SOprintData> => {
    const { data } = await api.get<{ success: boolean; data: SOprintData }>(
      `/transaksi/invoice/print/${encodeURIComponent(nomor)}`
    );
    return data.data;
  },
  getExportDetail: async (startDate: string, endDate: string) => {
    const { data } = await api.get(`/transaksi/invoice/export-detail`, { // <-- Ganti axios ke api
      params: { startDate, endDate }
    });
    return data;
  }
};

