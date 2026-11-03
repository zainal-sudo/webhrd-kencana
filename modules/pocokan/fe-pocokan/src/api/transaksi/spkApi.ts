import api from "@/api/axios";

export const spkApi = {
  getBrowse: async (startDate: string, endDate: string) => {
    const { data } = await api.get("/transaksi/spk", { params: { startDate, endDate } });
    return data.data;
  },
  getDetail: async (nomor: string) => {
    const { data } = await api.get(`/transaksi/spk/detail/${encodeURIComponent(nomor)}`);
    return data.data;
  },
  delete: async (nomor: string) => {
    const { data } = await api.delete(`/transaksi/spk/${encodeURIComponent(nomor)}`);
    return data;
  },
};