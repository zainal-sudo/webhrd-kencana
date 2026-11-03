import api from "@/api/axios";

export const stbjApi = {
  getBrowse: async (startDate: string, endDate: string) => {
    const { data } = await api.get("/transaksi/stbj", { params: { startDate, endDate } });
    return data.data;
  },
  getDetail: async (nomor: string) => {
    const { data } = await api.get(`/transaksi/stbj/detail/${encodeURIComponent(nomor)}`);
    return data.data;
  },
  delete: async (nomor: string) => {
    const { data } = await api.delete(`/transaksi/stbj/${encodeURIComponent(nomor)}`);
    return data;
  },
};