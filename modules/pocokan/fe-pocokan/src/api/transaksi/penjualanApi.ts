import api from "@/api/axios";

export const penjualanApi = {
  getBrowse: async (startDate: string, endDate: string) => {
    const { data } = await api.get("/transaksi/penjualan", { params: { startDate, endDate } });
    return data.data;
  },
  getDetail: async (nomor: string) => {
    const { data } = await api.get(`/transaksi/penjualan/detail/${encodeURIComponent(nomor)}`);
    return data.data;
  },
  delete: async (nomor: string) => {
    const { data } = await api.delete(`/transaksi/penjualan/${encodeURIComponent(nomor)}`);
    return data;
  },
  updateStatus: async (nomor: string) => {
    const { data } = await api.patch(`/transaksi/penjualan/${encodeURIComponent(nomor)}/status`);
    return data;
  },
  getPrintData: async (nomor: string) => {
    const { data } = await api.get(`/transaksi/penjualan/print/${encodeURIComponent(nomor)}`);
    return data.data;
  },
};
