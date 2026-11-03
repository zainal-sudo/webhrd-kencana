import api from "@/api/axios";
export const poApi = {
  getBrowse: async (startDate: string, endDate: string) => {
    const { data } = await api.get("/transaksi/po", { params: { startDate, endDate } });
    return data.data;
  },
  getDetail: async (nomor: string) => {
    const { data } = await api.get(`/transaksi/po/detail/${encodeURIComponent(nomor)}`);
    return data.data;
  },
  delete: async (nomor: string) => {
    const { data } = await api.delete(`/transaksi/po/${encodeURIComponent(nomor)}`);
    return data;
  },
  updateStatus: async (nomor: string) => {
    const { data } = await api.patch(`/transaksi/po/${encodeURIComponent(nomor)}/status`);
    return data;
  },
  getPrintData: async (nomor: string): Promise<SOprintData> => {
    const { data } = await api.get<{ success: boolean; data: SOprintData }>(
      `/transaksi/po/print/${encodeURIComponent(nomor)}`
    );
    return data.data;
  }
};